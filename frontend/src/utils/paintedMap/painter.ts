/**
 * Painted world map renderer.
 *
 * Turns the sector grid of a map layer (one byte per room, NO_ROOM where there
 * is none) into RGBA pixels that look like a painted atlas: smooth coasts,
 * shaded relief, tree canopies, roads, reefs, piers and continent styling.
 * It is deterministic, so the same grid always paints the same map, and it can
 * paint any rectangle of rooms on its own, which lets callers split the work
 * into tiles that line up without seams.
 *
 * Grid coordinates are room offsets from the layer's (minX, minY) corner.
 */

export const NO_ROOM = 255

/** Continent ids from continents[] in the MUD's src/world/map.c. */
export const EVIL_CONTINENT = 2
export const UNDEAD_CONTINENT = 5

export interface GridPoint {
  x: number
  y: number
}

/** A rectangle of rooms, x1/y1 exclusive. */
export interface PaintRegion {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface PaintOptions {
  /** Surface layers have an ocean; other layers sit in solid rock. */
  surface: boolean
  /** Continent id of every room (0 = none), same size as the grid. */
  continents?: Uint8Array | null
  /** Rooms where ships may dock; each connected group gets a jetty. */
  docks?: GridPoint[]
  /** Ocean rooms of named ports; each gets a pier and a moored ship. */
  ports?: GridPoint[]
  /** Paint only these rooms; defaults to the whole grid. */
  region?: PaintRegion | null
}

type Rgb = readonly [number, number, number]
type RgbHeight = readonly [number, number, number, number]

const WATER = new Set([6, 7, 9, 10, 12, 16, 17, 20])
/** Gentle land that turns to sand at the shore. */
const BEACH_SECTORS = new Set([0, 2, 3, 4, 24, 26, 37])

// Painted colour and relative height of each land sector.
const LAND: Record<number, RgbHeight> = {
  0: [132, 120, 98, 0.32], // stone / earth
  1: [190, 178, 152, 0.18], // city
  2: [118, 146, 66, 0.14], // field
  3: [44, 92, 44, 0.24], // forest
  4: [150, 138, 84, 0.46], // hills
  5: [124, 112, 98, 0.92], // mountain
  8: [170, 196, 204, 0.2], // air
  11: [150, 58, 34, 0.62], // fire
  13: [92, 78, 104, 0.2], // underdark wilds
  14: [180, 162, 188, 0.18], // underdark city
  15: [84, 76, 88, 0.3], // underdark stone
  18: [44, 38, 52, 0.1], // void
  19: [170, 196, 204, 0.2], // air
  21: [132, 120, 98, 0.32], // stone / earth
  22: [168, 164, 190, 0.2], // ethereal
  23: [130, 116, 162, 0.2], // astral
  24: [216, 190, 128, 0.16], // desert
  25: [228, 234, 238, 0.42], // arctic
  26: [78, 98, 62, 0.07], // swamp
  27: [104, 88, 116, 0.8], // underdark mountain
  28: [128, 140, 70, 0.1], // slime
  29: [66, 58, 76, 0.3], // low ceiling
  30: [110, 160, 150, 0.1], // liquid mithril
  31: [158, 112, 78, 0.2], // mushrooms
  32: [176, 168, 148, 0.3], // castle
  33: [176, 168, 148, 0.3],
  34: [176, 168, 148, 0.3],
  35: [44, 38, 52, 0.1],
  36: [150, 58, 34, 0.62], // fire
  37: [178, 156, 112, 0.16], // road
  38: [196, 210, 206, 0.3], // snowy forest
  39: [160, 60, 30, 0.6], // lava
}
const DEFAULT_LAND = LAND[0]!

// Cave floors and walls read warmer and lighter than the bedrock around them.
const UNDERDARK: Record<number, Rgb> = {
  0: [104, 94, 88],
  1: [176, 156, 176],
  13: [70, 82, 64],
  14: [176, 156, 176],
  15: [96, 88, 96],
  27: [92, 84, 100],
  29: [112, 92, 74],
  31: [100, 70, 112],
}

// ---------------------------------------------------------------------------
// Noise and sampling helpers
// ---------------------------------------------------------------------------

function hash2(x: number, y: number, seed: number): number {
  let h =
    (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal noise, roughly 0..1. */
function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, seed + i * 17)
    f *= 2.03
    amp *= 0.5
  }
  return sum
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const ridgeOf = (u: number, v: number) => 1 - Math.abs(fbm(u * 0.7, v * 0.7, 23, 3) * 2 - 1)

/** Chamfer distance (in rooms) from every cell to the nearest cell where mask is set. */
function distanceTo(mask: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 1e9
  const DD = Math.SQRT2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]!
      if (x > 0) v = Math.min(v, d[i - 1]! + 1)
      if (y > 0) {
        v = Math.min(v, d[i - w]! + 1)
        if (x > 0) v = Math.min(v, d[i - w - 1]! + DD)
        if (x < w - 1) v = Math.min(v, d[i - w + 1]! + DD)
      }
      d[i] = v
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]!
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 1)
      if (y < h - 1) {
        v = Math.min(v, d[i + w]! + 1)
        if (x < w - 1) v = Math.min(v, d[i + w + 1]! + DD)
        if (x > 0) v = Math.min(v, d[i + w - 1]! + DD)
      }
      d[i] = v
    }
  return d
}

/** Repeated box blur of a scalar field. */
function blur(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  const a = Float32Array.from(src)
  const b = new Float32Array(src.length)
  const span = 2 * r + 1
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]!
      for (let x = 0; x < w; x++) {
        b[y * w + x] = acc / span
        acc += a[y * w + Math.min(w - 1, x + r + 1)]! - a[y * w + Math.max(0, x - r)]!
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += b[Math.min(h - 1, Math.max(0, y)) * w + x]!
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / span
        acc += b[Math.min(h - 1, y + r + 1) * w + x]! - b[Math.max(0, y - r) * w + x]!
      }
    }
  }
  return a
}

function bilinear(f: Float32Array, w: number, h: number, u: number, v: number): number {
  const cu = u < 0 ? 0 : u > w - 1 ? w - 1 : u
  const cv = v < 0 ? 0 : v > h - 1 ? h - 1 : v
  const x0 = Math.floor(cu)
  const y0 = Math.floor(cv)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = cu - x0
  const fy = cv - y0
  const a = f[y0 * w + x0]!
  const b = f[y0 * w + x1]!
  const c = f[y1 * w + x0]!
  const d = f[y1 * w + x1]!
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

const BSW_X = new Float64Array(4)
const BSW_Y = new Float64Array(4)
function bsplineWeights(t: number, out: Float64Array): Float64Array {
  const t2 = t * t
  const t3 = t2 * t
  out[0] = (1 - 3 * t + 3 * t2 - t3) / 6
  out[1] = (4 - 6 * t2 + 3 * t3) / 6
  out[2] = (1 + 3 * t + 3 * t2 - 3 * t3) / 6
  out[3] = t3 / 6
  return out
}

/** Cubic B-spline sample: smooth slopes with no creases along room edges. */
function bspline(f: Float32Array, w: number, h: number, u: number, v: number): number {
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const wx = bsplineWeights(u - x0, BSW_X)
  const wy = bsplineWeights(v - y0, BSW_Y)
  let sum = 0
  for (let j = 0; j < 4; j++) {
    const yy = Math.min(h - 1, Math.max(0, y0 - 1 + j))
    let row = 0
    for (let i = 0; i < 4; i++) {
      const xx = Math.min(w - 1, Math.max(0, x0 - 1 + i))
      row += f[yy * w + xx]! * wx[i]!
    }
    sum += row * wy[j]!
  }
  return sum
}

// ---------------------------------------------------------------------------
// Whole-grid preparation, shared by every tile of the same grid
// ---------------------------------------------------------------------------

interface Prepared {
  surface: boolean
  continents: Uint8Array | null
  water: Uint8Array
  land: Uint8Array
  isRoad: Uint8Array
  toLand: Float32Array
  toOcean: Float32Array
  signed: Float32Array
  heightSmooth: Float32Array
  mountainMask: Float32Array
  hilly: Float32Array
  reefMask: Float32Array | null
  evilSmooth: Float32Array | null
  undeadSmooth: Float32Array | null
}

const prepared = new WeakMap<Uint8Array, Prepared>()

function prepare(
  grid: Uint8Array,
  w: number,
  h: number,
  surface: boolean,
  continents: Uint8Array | null,
): Prepared {
  const n = w * h
  const water = new Uint8Array(n)
  const land = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const s = grid[i]!
    const wet = s === NO_ROOM ? surface : WATER.has(s)
    water[i] = wet ? 1 : 0
    land[i] = s !== NO_ROOM && !wet ? 1 : 0
  }

  // Thin lines of city rooms are roads; only 2x2 clumps are towns.
  const isRoad = new Uint8Array(n)
  const town = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = grid[y * w + x]
      if (s === 37) {
        isRoad[y * w + x] = 1
        continue
      }
      if (s !== 1) continue
      let clump = false
      for (const [ox, oy] of [
        [0, 0],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ] as const)
        if (
          town(x + ox, y + oy) &&
          town(x + ox + 1, y + oy) &&
          town(x + ox, y + oy + 1) &&
          town(x + ox + 1, y + oy + 1)
        )
          clump = true
      if (!clump) isRoad[y * w + x] = 1
    }

  // Soft masks so continent styling fades in from the shore.
  const continentMask = (id: number) =>
    continents
      ? blur(
          Float32Array.from(continents, (c) => (c === id ? 1 : 0)),
          w,
          h,
          2,
          2,
        )
      : null

  const toLand = distanceTo(land, w, h)
  const toOcean = distanceTo(
    Uint8Array.from(grid, (s) => (s === 12 || (s === NO_ROOM && surface) ? 1 : 0)),
    w,
    h,
  )
  // Signed distance: positive on land, negative off it, zero on the shore.
  const toOpen = distanceTo(
    Uint8Array.from(land, (l) => 1 - l),
    w,
    h,
  )
  const signed = new Float32Array(n)
  for (let i = 0; i < n; i++) signed[i] = land[i] ? toOpen[i]! - 0.5 : -(toLand[i]! - 0.5)

  const height0 = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = grid[i]!
    if (land[i]) height0[i] = surface ? (LAND[s] ?? DEFAULT_LAND)[3] : s === 27 ? 0.55 : 0.12
    // Underground, unmapped space is solid rock standing over the caves.
    else if (!surface && s === NO_ROOM) height0[i] = 1
    else height0[i] = -Math.min(1, toLand[i]! / 12)
  }

  return {
    surface,
    continents,
    water,
    land,
    isRoad,
    toLand,
    toOcean,
    signed,
    heightSmooth: blur(height0, w, h, 1, 2),
    mountainMask: blur(
      Float32Array.from(grid, (s) => (s === 5 || s === 27 ? 1 : 0)),
      w,
      h,
      1,
      1,
    ),
    hilly: blur(
      Float32Array.from(grid, (s) => (s === 4 ? 1 : 0)),
      w,
      h,
      1,
      2,
    ),
    // Shallows (sector 6) out at sea are reefs: thin rings and lines of coral.
    reefMask: surface ? Float32Array.from(grid, (s) => (s === 6 ? 1 : 0)) : null,
    evilSmooth: continentMask(EVIL_CONTINENT),
    undeadSmooth: continentMask(UNDEAD_CONTINENT),
  }
}

/** Sector of the closest land room, for pixels the smooth outline pulls onto land. */
function nearestLand(
  grid: Uint8Array,
  land: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  for (let r = 1; r <= 2; r++)
    for (let oy = -r; oy <= r; oy++)
      for (let ox = -r; ox <= r; ox++) {
        const xx = x + ox
        const yy = y + oy
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && land[yy * w + xx]) return grid[yy * w + xx]!
      }
  return 29
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

/** Pixel frame of the painted region, with a one-pixel margin for hillshade. */
interface Frame {
  x0: number
  y0: number
  width: number
  height: number
  marginWidth: number
}

const VOTE_SECTOR = new Int16Array(16)
const VOTE_WEIGHT = new Float64Array(16)

/**
 * Paint a map layer, or one region of it, at `scale` pixels per room.
 * Returns RGBA pixels for the region, row by row.
 */
export function paintMap(
  grid: Uint8Array,
  w: number,
  h: number,
  scale: number,
  options: PaintOptions,
): Uint8ClampedArray {
  const surface = options.surface
  const continents = options.continents ?? null
  let prep = prepared.get(grid)
  if (!prep || prep.surface !== surface || prep.continents !== continents) {
    prep = prepare(grid, w, h, surface, continents)
    prepared.set(grid, prep)
  }
  const { water, land, isRoad, toLand, toOcean, signed, heightSmooth, mountainMask, hilly } = prep
  const { reefMask, evilSmooth, undeadSmooth } = prep

  const region = options.region ?? { x0: 0, y0: 0, x1: w, y1: h }
  const F: Frame = {
    x0: region.x0 * scale,
    y0: region.y0 * scale,
    width: (region.x1 - region.x0) * scale,
    height: (region.y1 - region.y0) * scale,
    marginWidth: (region.x1 - region.x0) * scale + 2,
  }
  const LW = F.marginWidth
  const LH = F.height + 2
  const out = new Uint8ClampedArray(F.width * F.height * 4)
  const heightPx = new Float32Array(LW * LH)
  const sectorPx = new Uint8Array(LW * LH)
  const landPx = new Uint8Array(LW * LH)
  const mountPx = new Float32Array(LW * LH)
  const inv = 1 / scale

  // Pass 1: land or water, sector and painted height for every pixel.
  for (let qy = 0; qy < LH; qy++) {
    const py = F.y0 - 1 + qy
    const v = (py + 0.5) * inv - 0.5
    for (let qx = 0; qx < LW; qx++) {
      const px = F.x0 - 1 + qx
      const u = (px + 0.5) * inv - 0.5
      const p = qy * LW + qx
      const coastNoise = (fbm(u * 0.9, v * 0.9, 11, 3) - 0.5) * 0.7
      let sd = bilinear(signed, w, h, u, v) + coastNoise
      if (!surface) {
        // Caves: a smooth blob field over nearby rooms, so tunnels bend and
        // diagonal passages join instead of stepping room by room.
        const cx = Math.round(u)
        const cy = Math.round(v)
        let f = 0
        for (let oy = -2; oy <= 2; oy++) {
          const yy = cy + oy
          if (yy < 0 || yy >= h) continue
          for (let ox = -2; ox <= 2; ox++) {
            const xx = cx + ox
            if (xx < 0 || xx >= w || !land[yy * w + xx]) continue
            const ddx = u - xx
            const ddy = v - yy
            f += Math.exp(-(ddx * ddx + ddy * ddy) / 0.45)
          }
        }
        sd = f - 0.5 + coastNoise * 0.25
      }
      const isLand = sd > 0

      // Wobble sector borders, then let nearby rooms vote with soft weights, so
      // terrain patches get rounded organic edges instead of square corners.
      const wu =
        u + (fbm(u * 0.45, v * 0.45, 3, 3) - 0.5) + (fbm(u * 1.6, v * 1.6, 5, 2) - 0.5) * 0.35
      const wv =
        v + (fbm(u * 0.45, v * 0.45, 7, 3) - 0.5) + (fbm(u * 1.6, v * 1.6, 9, 2) - 0.5) * 0.35
      const ux = Math.min(w - 1, Math.max(0, Math.round(u)))
      const uy = Math.min(h - 1, Math.max(0, Math.round(v)))
      const here = uy * w + ux
      const exact = grid[here]!
      let s = NO_ROOM
      let bestScore = 0
      {
        const cx = Math.round(wu)
        const cy = Math.round(wv)
        let n = 0
        for (let oy = -1; oy <= 1; oy++) {
          const yy = cy + oy
          if (yy < 0 || yy >= h) continue
          for (let ox = -1; ox <= 1; ox++) {
            const xx = cx + ox
            if (xx < 0 || xx >= w) continue
            const k = yy * w + xx
            if (land[k] !== (isLand ? 1 : 0)) continue
            const sec = isRoad[k] ? 2 : grid[k]!
            const ddx = wu - xx
            const ddy = wv - yy
            const weight = Math.exp(-(ddx * ddx + ddy * ddy) / 0.32)
            let j = 0
            while (j < n && VOTE_SECTOR[j] !== sec) j++
            if (j === n) {
              VOTE_SECTOR[n] = sec
              VOTE_WEIGHT[n] = 0
              n++
            }
            VOTE_WEIGHT[j] = VOTE_WEIGHT[j]! + weight
            if (VOTE_WEIGHT[j]! > bestScore) {
              bestScore = VOTE_WEIGHT[j]!
              s = sec
            }
          }
        }
      }
      // Roads and towns are drawn from their exact rooms, never wobbled.
      if (exact === 37 || exact === 1) s = isRoad[here] ? 37 : exact
      const sIsWater = s === NO_ROOM || WATER.has(s)
      if (isLand && sIsWater)
        s = land[here] ? exact : surface ? 2 : nearestLand(grid, land, w, h, ux, uy)
      if (!isLand && !sIsWater) s = water[here] ? exact : surface ? 12 : NO_ROOM
      sectorPx[p] = s
      landPx[p] = isLand ? 1 : 0
      const m = bspline(mountainMask, w, h, u, v)
      const ridge = ridgeOf(u, v)
      heightPx[p] =
        bspline(heightSmooth, w, h, u, v) +
        m * (0.25 + ridge * ridge * 0.55) +
        (fbm(u * 1.2, v * 1.2, 31, 2) - 0.5) * 0.06
      mountPx[p] = m
    }
  }

  // Pass 2: colour, lit by hillshade from the north-west.
  const lx = -0.6
  const ly = -0.6
  const lz = 0.53
  const relief = 4.5
  for (let qy = 1; qy < LH - 1; qy++) {
    const py = F.y0 - 1 + qy
    const v = (py + 0.5) * inv - 0.5
    for (let qx = 1; qx < LW - 1; qx++) {
      const px = F.x0 - 1 + qx
      const u = (px + 0.5) * inv - 0.5
      const p = qy * LW + qx
      const s = sectorPx[p]!
      let nx = (heightPx[p - 1]! - heightPx[p + 1]!) * relief
      let ny = (heightPx[p - LW]! - heightPx[p + LW]!) * relief
      let nz = 1 / scale
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const shade = nx * lx + ny * ly + nz * lz
      let r: number
      let g: number
      let b: number

      if (!landPx[p]) {
        if (!surface && s === NO_ROOM) {
          // Bedrock: faint strata, lit by a soft glow spilling from the caves.
          const t = fbm(u * 0.25, v * 0.25, 41, 4)
          const strata = Math.sin((v + fbm(u * 0.15, v * 0.15, 43, 3) * 9) * 1.7) * 0.5 + 0.5
          r = 20 + t * 12 + strata * 5
          g = 18 + t * 10 + strata * 4
          b = 25 + t * 14 + strata * 6
          const glow = Math.exp(-bilinear(toLand, w, h, u, v) * 0.9)
          r += 46 * glow
          g += 34 * glow
          b += 62 * glow
          const rim = 1 - smooth(0, 0.35, -bilinear(signed, w, h, u, v))
          r *= 1 - rim * 0.5
          g *= 1 - rim * 0.5
          b *= 1 - rim * 0.5
        } else {
          const depth = bilinear(toLand, w, h, u, v)
          const oceanish = bilinear(toOcean, w, h, u, v) < 1.5
          const dt = smooth(0.3, oceanish ? 9 : 3, depth)
          // Shallow turquoise to deep navy.
          r = 52 + (12 - 52) * dt
          g = 158 + (46 - 158) * dt
          b = 170 + (92 - 170) * dt
          if (!surface) {
            r = 18 + (r - 12) * 0.35
            g = 40 + (g - 46) * 0.45
            b = 70 + (b - 92) * 0.45
          }
          if (undeadSmooth && !oceanish) {
            const k = bspline(undeadSmooth, w, h, u, v) * 0.7
            r += (44 - r) * k
            g += (78 - g) * k
            b += (58 - b) * k
          }
          if (reefMask) {
            const reef =
              bspline(reefMask, w, h, u, v) + (fbm(u * 2.5, v * 2.5, 311, 2) - 0.5) * 0.18
            if (reef > 0.12) {
              // Pale turquoise over the reef, a ring of surf, coral heads inside.
              const body = smooth(0.22, 0.4, reef) * 0.85
              r += (96 - r) * body
              g += (206 - g) * body
              b += (196 - b) * body
              const surf =
                smooth(0.12, 0.2, reef) *
                (1 - smooth(0.24, 0.34, reef)) *
                smooth(0.4, 0.6, fbm(u * 4, v * 4, 321, 2)) *
                0.7
              r += (235 - r) * surf
              g += (248 - g) * surf
              b += (245 - b) * surf
              const cs = Math.max(2, scale * 0.18)
              const hx = Math.floor(px / cs)
              const hy = Math.floor(py / cs)
              if (body > 0.51 && hash2(hx, hy, 331) < 0.28) {
                const pink = hash2(hx, hy, 341) < 0.5
                r += ((pink ? 222 : 236) - r) * 0.55
                g += ((pink ? 128 : 170) - g) * 0.55
                b += ((pink ? 120 : 110) - b) * 0.55
              }
            }
          }
          const k = 0.88 + fbm(u * 2.2 + v * 0.6, v * 2.6, 51, 3) * 0.24
          r *= k
          g *= k
          b *= k
          // Surf: a bright broken line hugging the shore.
          const offshore = -bilinear(signed, w, h, u, v)
          const foam =
            (1 - smooth(0, 0.55, offshore)) * smooth(0.45, 0.7, fbm(u * 3, v * 3, 61, 2)) * 0.75
          r += ((surface ? 225 : 90) - r) * foam
          g += ((surface ? 240 : 220) - g) * foam
          b += ((surface ? 240 : 210) - b) * foam
          // Faint swell rings further out.
          const ring = Math.sin(depth * 2.4 + fbm(u * 0.8, v * 0.8, 71, 2) * 4)
          const swell = smooth(0.85, 1, ring) * (1 - smooth(1.5, 6, depth)) * 0.072
          r += 200 * swell
          g += 220 * swell
          b += 230 * swell
        }
      } else {
        const c = (!surface ? UNDERDARK[s] : undefined) ?? LAND[s] ?? DEFAULT_LAND
        const tex = fbm(u * 1.3, v * 1.3, 81, 4) - 0.5
        const fine = (hash2(px, py, 91) - 0.5) * (s === 5 || s === 27 ? 0.3 : 1)
        const grain = 1 + tex * 0.35 + fine * 0.06
        r = c[0] * grain
        g = c[1] * grain
        b = c[2] * grain
        const hgt = heightPx[p]!

        if (s === 2 || s === 4) {
          // Fields and hills blend smoothly, drifting between green and gold.
          const t = smooth(
            0.15,
            0.85,
            bspline(hilly, w, h, u, v) + (fbm(u * 1.1, v * 1.1, 191, 2) - 0.5) * 0.3,
          )
          const field = LAND[2]!
          const hills = LAND[4]!
          const gold = fbm(u * 0.35, v * 0.35, 101, 3) - 0.5
          r = (field[0] + (hills[0] - field[0]) * t) * grain + gold * 50
          g = (field[1] + (hills[1] - field[1]) * t) * grain + gold * 18
          b = (field[2] + (hills[2] - field[2]) * t) * grain
        }
        if ((s === 5 || s === 27) && surface) {
          // Snow only on the high ridges of the big ranges.
          const snow =
            smooth(0.88, 0.97, mountPx[p]!) *
            smooth(0.55, 0.8, ridgeOf(u, v) + (fbm(u * 2, v * 2, 111, 2) - 0.5) * 0.25)
          r += (240 - r) * snow
          g += (244 - g) * snow
          b += (248 - b) * snow
        }
        if (s === 3 || s === 38) {
          // Tree canopy: jittered round crowns about half a room across.
          const cs = Math.max(3, scale * 0.55)
          const cx = Math.floor(px / cs)
          const cy = Math.floor(py / cs)
          let best = 9
          let bx = 0
          let by = 0
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const tx = (cx + ox + 0.2 + hash2(cx + ox, cy + oy, 121) * 0.6) * cs
              const ty = (cy + oy + 0.2 + hash2(cx + ox, cy + oy, 131) * 0.6) * cs
              const dx = (px - tx) / cs
              const dy = (py - ty) / cs
              const d = dx * dx + dy * dy
              if (d < best) {
                best = d
                bx = dx
                by = dy
              }
            }
          const crown = 1 - smooth(0.12, 0.42, best)
          const lit = clamp01(0.5 - (bx + by) * 1.2)
          const k = 0.62 + crown * (0.25 + lit * 0.45)
          r *= k
          g *= k
          b *= k
          if (s === 38) {
            r += 30 * crown * lit
            g += 30 * crown * lit
            b += 30 * crown * lit
          }
        }
        if (s === 26) {
          const pool = smooth(0.58, 0.64, fbm(u * 1.6, v * 1.6, 141, 3)) * 0.7
          r += (62 - r) * pool
          g += (96 - g) * pool
          b += (90 - b) * pool
        }
        if (s === 24) {
          const dune = Math.sin((u * 0.9 + v * 0.4) * 5 + fbm(u * 0.6, v * 0.6, 151, 3) * 6)
          r *= 1 + dune * 0.05
          g *= 1 + dune * 0.05
          b *= 1 + dune * 0.05
        }
        if (s === 11 || s === 36 || s === 39) {
          // Cooled crust split by glowing cracks. On the Undead Continent the
          // lava stays red but runs as blood-red veins through black crust.
          const crack = 1 - Math.abs(fbm(u * 1.4, v * 1.4, 161, 4) * 2 - 1)
          const glow = smooth(0.82, 0.97, crack)
          const hot = smooth(0.93, 0.99, crack)
          const necro = undeadSmooth ? bspline(undeadSmooth, w, h, u, v) : 0
          const fr = r * 0.55 + glow * 200
          const fg = g * 0.5 + glow * 110
          const fb = b * 0.5 + glow * 20
          r = fr + (34 + glow * 200 + hot * 25 - fr) * necro
          g = fg + (10 + glow * 30 + hot * 90 - fg) * necro
          b = fb + (12 + glow * 14 + hot * 10 - fb) * necro
        }
        if (s === 37) {
          // Packed-dirt road along the centre line toward every road neighbour.
          const ru = Math.round(u)
          const rv = Math.round(v)
          const du = u - ru
          const dv = v - rv
          let dist = Math.hypot(du, dv)
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const xx = ru + ox
              const yy = rv + oy
              if ((!ox && !oy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue
              const k = yy * w + xx
              if (grid[k] === NO_ROOM || (isRoad[k] !== 1 && grid[k] !== 1)) continue
              const t = Math.max(0, Math.min(0.5, (du * ox + dv * oy) / (ox * ox + oy * oy)))
              dist = Math.min(dist, Math.hypot(du - ox * t, dv - oy * t))
            }
          const under = surface ? LAND[2]! : UNDERDARK[29]!
          const onRoad = 1 - smooth(0.16, 0.26, dist)
          const edge = (1 - smooth(0.24, 0.34, dist) - onRoad) * 0.45
          const dirt = (1 + tex * 0.3) * (1 - onRoad)
          r = (under[0] * dirt + 214 * onRoad) * (1 - edge)
          g = (under[1] * dirt + 190 * onRoad) * (1 - edge)
          b = (under[2] * dirt + 140 * onRoad) * (1 - edge)
        }
        if (s === 1) {
          // Rooftops on a tight lot grid.
          const lot = Math.max(2, Math.round(scale / 3))
          const roof = hash2(Math.floor(px / lot), Math.floor(py / lot), 171)
          if (px % lot === 0 || py % lot === 0) {
            r *= 0.7
            g *= 0.7
            b *= 0.7
          } else if (roof < 0.45) {
            r = 150 + roof * 40
            g = 80 + roof * 30
            b = 60
          }
        }
        if (!surface && s === 31) {
          // Glowing fungus caps.
          const cs = Math.max(3, scale * 0.4)
          const cx = Math.floor(px / cs)
          const cy = Math.floor(py / cs)
          const lit = hash2(cx, cy, 211)
          const dd = Math.hypot(px - (cx + 0.5) * cs, py - (cy + 0.5) * cs) / cs
          if (lit > 0.45 && dd < 0.32) {
            const k = 1 - dd / 0.32
            const cyan = lit > 0.72
            r += ((cyan ? 90 : 220) - r) * k
            g += ((cyan ? 230 : 110) - g) * k
            b += ((cyan ? 210 : 230) - b) * k
          }
        }
        if (!surface && s === 13) {
          const moss = smooth(0.5, 0.7, fbm(u * 2.4, v * 2.4, 221, 3)) * 0.6
          r += (60 - r) * moss
          g += (110 - g) * moss
          b += (70 - b) * moss
        }
        if (surface && BEACH_SECTORS.has(s)) {
          // Sandy beaches where gentle land meets water.
          const coast = bilinear(signed, w, h, u, v) + (fbm(u * 2, v * 2, 181, 2) - 0.5) * 0.3
          const beach = 1 - smooth(0.05, 0.55, coast)
          r += (226 - r) * beach
          g += (208 - g) * beach
          b += (160 - b) * beach
        }
        if (evilSmooth) {
          const k = bspline(evilSmooth, w, h, u, v)
          if (k > 0.01) {
            // Evil Continent: violet bogs, purple heather and dusky woods.
            let tone: Rgb = [120, 90, 130]
            let amt = 0.25
            if (s === 26) {
              tone = [104, 58, 122]
              amt = 0.85
            } else if (s === 0 || s === 2 || s === 4 || s === 24 || s === 37) {
              tone = [132, 86, 138]
              amt = 0.3 + smooth(0.35, 0.7, fbm(u * 0.5, v * 0.5, 231, 3)) * 0.4
            } else if (s === 3 || s === 38) {
              tone = [70, 46, 86]
              amt = 0.5
            } else if (s === 5 || s === 27) {
              tone = [118, 100, 132]
              amt = 0.3
            }
            amt *= k
            r += (tone[0] - r) * amt
            g += (tone[1] - g) * amt
            b += (tone[2] - b) * amt
            if (s === 26) {
              // Still, glowing bog pools.
              const pool = smooth(0.56, 0.62, fbm(u * 1.6, v * 1.6, 141, 3)) * 0.55 * k
              r += (168 - r) * pool
              g += (92 - g) * pool
              b += (196 - b) * pool
            }
          }
        }
        if (undeadSmooth && s !== 11 && s !== 36 && s !== 39) {
          const k = bspline(undeadSmooth, w, h, u, v)
          if (k > 0.01) {
            // Undead Continent: sere, sepia land under a gloom, with grave-glow
            // seeping through the dead grass and graveyards up close.
            const lum = r * 0.3 + g * 0.59 + b * 0.11
            let tone: Rgb = [lum * 0.86 + 12, lum * 0.8 + 6, lum * 0.62]
            let amt = 0.62
            if (s === 3 || s === 38) {
              tone = [lum * 0.8 + 6, lum * 0.8, lum * 0.6]
              amt = 0.6
            } else if (s === 5 || s === 27) {
              tone = [lum * 0.8 + 6, lum * 0.72, lum * 0.72]
              amt = 0.45
            }
            amt *= k
            r += (tone[0] - r) * amt
            g += (tone[1] - g) * amt
            b += (tone[2] - b) * amt
            const rot = smooth(0.45, 0.65, fbm(u * 0.4, v * 0.4, 301, 3))
            const gloom = 1 - k * (0.12 + rot * 0.18)
            r *= gloom
            g *= gloom
            b *= gloom * 1.02
            if (s === 0 || s === 2 || s === 4 || s === 26) {
              const seepNoise = fbm(u * 0.55, v * 0.55, 251, 3)
              const seep = smooth(0.64, 0.7, seepNoise) * k * 0.5
              const core = smooth(0.7, 0.76, seepNoise) * k * 0.6
              r += (70 - r) * seep
              g += (150 - g) * seep
              b += (70 - b) * seep
              r += (140 - r) * core
              g += (235 - g) * core
              b += (120 - b) * core
              const cx = Math.floor(u + 0.5)
              const cy = Math.floor(v + 0.5)
              const yard = smooth(0.5, 0.6, fbm(cx * 0.35, cy * 0.35, 291, 2))
              if (scale >= 16 && hash2(cx, cy, 261) < (0.05 + yard * 0.6) * k) {
                const ddx = u - (cx - 0.2 + hash2(cx, cy, 271) * 0.4)
                const ddy = v - (cy - 0.2 + hash2(cx, cy, 281) * 0.4)
                const stone =
                  Math.abs(ddx) < 0.08 &&
                  ddy > -0.1 &&
                  ddy < 0.12 &&
                  (ddy > -0.04 || Math.hypot(ddx, ddy + 0.04) < 0.08)
                if (stone) {
                  const side = ddx > 0.02 ? 0.75 : 1
                  r = 196 * side
                  g = 192 * side
                  b = 180 * side
                } else if (Math.abs(ddx - 0.05) < 0.08 && ddy > -0.05 && ddy < 0.18) {
                  r *= 0.6
                  g *= 0.6
                  b *= 0.6
                }
              }
            }
          }
        }
        const light = surface ? 0.55 + shade * 0.75 : 0.5 + shade * 0.6
        const ao = 0.88 + clamp01(hgt) * 0.14
        r *= light * ao
        g *= light * ao
        b *= light * ao
      }
      const o = ((qy - 1) * F.width + (qx - 1)) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = 255
    }
  }

  const piers = planPiers(grid, w, h, water, options.docks ?? [], options.ports ?? [])
  paintPiers(out, landPx, F, scale, piers)
  return out
}

// ---------------------------------------------------------------------------
// Piers and moored ships
// ---------------------------------------------------------------------------

interface Pier {
  kind: 'pier'
  x0: number
  y0: number
  x1: number
  y1: number
  halfWidth: number
}

interface Boat {
  kind: 'boat'
  cx: number
  cy: number
  ax: number
  ay: number
}

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/**
 * Where to build: one jetty per group of dockable rooms, and a T-headed pier
 * with a moored ship from the shore out to each named port's ocean room.
 */
export function planPiers(
  grid: Uint8Array,
  w: number,
  h: number,
  water: Uint8Array,
  docks: GridPoint[],
  ports: GridPoint[],
): Array<Pier | Boat> {
  const isWater = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && water[y * w + x] === 1
  const out: Array<Pier | Boat> = []
  const key = (d: GridPoint) => d.y * w + d.x
  const dockAt = new Map(docks.map((d) => [key(d), d]))
  const seen = new Set<number>()
  for (const start of docks) {
    if (seen.has(key(start))) continue
    const group: GridPoint[] = []
    const stack = [start]
    seen.add(key(start))
    while (stack.length) {
      const c = stack.pop()!
      group.push(c)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const next = dockAt.get((c.y + oy) * w + c.x + ox)
          if (next && !seen.has(key(next))) {
            seen.add(key(next))
            stack.push(next)
          }
        }
    }
    const mx = group.reduce((a, c) => a + c.x, 0) / group.length
    const my = group.reduce((a, c) => a + c.y, 0) / group.length
    let best: { score: number; x: number; y: number; dx: number; dy: number } | null = null
    for (const c of group)
      for (const [dx, dy] of DIRS4) {
        if (!isWater(c.x + dx, c.y + dy)) continue
        // Prefer open water straight ahead, then the middle of the group.
        const score = (isWater(c.x + 2 * dx, c.y + 2 * dy) ? 0 : 3) + Math.hypot(c.x - mx, c.y - my)
        if (!best || score < best.score) best = { score, x: c.x, y: c.y, dx, dy }
      }
    if (best) {
      const reach = isWater(best.x + 2 * best.dx, best.y + 2 * best.dy) ? 1.7 : 1.1
      out.push({
        kind: 'pier',
        x0: best.x - best.dx * 0.2,
        y0: best.y - best.dy * 0.2,
        x1: best.x + best.dx * reach,
        y1: best.y + best.dy * reach,
        halfWidth: 0.2,
      })
    }
  }

  for (const port of ports) {
    let shore: { x: number; y: number; d: number } | null = null
    for (let r = 1; r <= 6 && !shore; r++)
      for (let oy = -r; oy <= r; oy++)
        for (let ox = -r; ox <= r; ox++) {
          const x = port.x + ox
          const y = port.y + oy
          if (x < 0 || y < 0 || x >= w || y >= h) continue
          if (water[y * w + x] || grid[y * w + x] === NO_ROOM) continue
          const d = Math.hypot(ox, oy)
          if (!shore || d < shore.d) shore = { x, y, d }
        }
    if (!shore) continue
    const ux = (port.x - shore.x) / shore.d
    const uy = (port.y - shore.y) / shore.d
    // Run out past the port room while the water lasts, up to two rooms.
    let reach = 0.3
    for (const step of [1, 1.5, 2]) {
      if (!isWater(Math.round(port.x + ux * step), Math.round(port.y + uy * step))) break
      reach = step
    }
    const ex = port.x + ux * reach
    const ey = port.y + uy * reach
    out.push({
      kind: 'pier',
      x0: shore.x - ux * 0.3,
      y0: shore.y - uy * 0.3,
      x1: ex,
      y1: ey,
      halfWidth: 0.3,
    })
    out.push({
      kind: 'pier',
      x0: ex - uy * 0.95,
      y0: ey + ux * 0.95,
      x1: ex + uy * 0.95,
      y1: ey - ux * 0.95,
      halfWidth: 0.24,
    })
    const along = Math.max(0.2, reach - 0.9)
    out.push({
      kind: 'boat',
      cx: port.x + ux * along - uy * 0.85,
      cy: port.y + uy * along + ux * 0.85,
      ax: ux,
      ay: uy,
    })
  }
  return out
}

/** Pixel bounds of a shape within the painted frame, or null when it misses. */
function pixelBox(F: Frame, scale: number, minU: number, maxU: number, minV: number, maxV: number) {
  const x0 = Math.max(F.x0, Math.floor((minU + 0.5) * scale))
  const x1 = Math.min(F.x0 + F.width - 1, Math.ceil((maxU + 0.5) * scale))
  const y0 = Math.max(F.y0, Math.floor((minV + 0.5) * scale))
  const y1 = Math.min(F.y0 + F.height - 1, Math.ceil((maxV + 0.5) * scale))
  return x0 > x1 || y0 > y1 ? null : { x0, x1, y0, y1 }
}

function paintPiers(
  out: Uint8ClampedArray,
  landPx: Uint8Array,
  F: Frame,
  scale: number,
  shapes: Array<Pier | Boat>,
) {
  const inv = 1 / scale
  const plank = 0.13
  const onLand = (px: number, py: number) =>
    landPx[(py - F.y0 + 1) * F.marginWidth + (px - F.x0 + 1)] === 1
  for (const pass of ['shadow', 'deck'] as const)
    for (const shape of shapes) {
      if (shape.kind === 'boat') {
        paintBoat(out, F, scale, shape, pass, onLand)
        continue
      }
      const dx = shape.x1 - shape.x0
      const dy = shape.y1 - shape.y0
      const len = Math.hypot(dx, dy) || 1
      const ax = dx / len
      const ay = dy / len
      const pad = shape.halfWidth + 0.3
      const box = pixelBox(
        F,
        scale,
        Math.min(shape.x0, shape.x1) - pad,
        Math.max(shape.x0, shape.x1) + pad,
        Math.min(shape.y0, shape.y1) - pad,
        Math.max(shape.y0, shape.y1) + pad,
      )
      if (!box) continue
      for (let py = box.y0; py <= box.y1; py++)
        for (let px = box.x0; px <= box.x1; px++) {
          const shift = pass === 'shadow' ? 1 : 0
          const rx = (px + 0.5) * inv - 0.5 - 0.1 * shift - shape.x0
          const ry = (py + 0.5) * inv - 0.5 - 0.12 * shift - shape.y0
          const t = rx * ax + ry * ay
          const across = rx * -ay + ry * ax
          const d = Math.abs(across)
          if (t < 0 || t > len || d > shape.halfWidth) continue
          const o = ((py - F.y0) * F.width + (px - F.x0)) * 4
          if (pass === 'shadow') {
            if (onLand(px, py)) continue
            out[o] = out[o]! * 0.55
            out[o + 1] = out[o + 1]! * 0.6
            out[o + 2] = out[o + 2]! * 0.68
            continue
          }
          const n = Math.floor(t / plank)
          const tone = 0.85 + hash2(n, Math.round(shape.x0 * 7 + shape.y0 * 13), 201) * 0.3
          let r = 158 * tone
          let g = 114 * tone
          let b = 70 * tone
          if (t / plank - n < 0.14) {
            r *= 0.62
            g *= 0.6
            b *= 0.6
          }
          const rail = d > shape.halfWidth - 0.045
          if (rail) {
            // Light from the north-west catches the upper rail.
            const k = across < 0 ? 0.55 * 1.35 : 0.55
            r *= k
            g *= k
            b *= k
          }
          // Mooring posts at the corners.
          if ((len - t < 0.09 || t < 0.09) && d > shape.halfWidth - 0.09) {
            r = 62
            g = 44
            b = 30
          }
          out[o] = r
          out[o + 1] = g
          out[o + 2] = b
        }
    }
}

/** A small sailing ship seen from above: hull, furled sail and mast. */
function paintBoat(
  out: Uint8ClampedArray,
  F: Frame,
  scale: number,
  boat: Boat,
  pass: 'shadow' | 'deck',
  onLand: (px: number, py: number) => boolean,
) {
  const inv = 1 / scale
  const L = 0.95
  const beam = 0.34
  const box = pixelBox(F, scale, boat.cx - 1.3, boat.cx + 1.3, boat.cy - 1.3, boat.cy + 1.3)
  if (!box) return
  for (let py = box.y0; py <= box.y1; py++)
    for (let px = box.x0; px <= box.x1; px++) {
      const shift = pass === 'shadow' ? 1 : 0
      const rx = (px + 0.5) * inv - 0.5 - 0.1 * shift - boat.cx
      const ry = (py + 0.5) * inv - 0.5 - 0.12 * shift - boat.cy
      const t = rx * boat.ax + ry * boat.ay
      const q = rx * -boat.ay + ry * boat.ax
      // Pointed bow ahead, rounded stern behind.
      const half =
        t > 0
          ? beam * Math.sqrt(Math.max(0, 1 - (t / L) ** 2)) * (1 - 0.35 * (t / L))
          : beam * Math.sqrt(Math.max(0, 1 - (t / (L * 0.8)) ** 2))
      if (Math.abs(q) > half) continue
      const o = ((py - F.y0) * F.width + (px - F.x0)) * 4
      if (pass === 'shadow') {
        if (onLand(px, py)) continue
        out[o] = out[o]! * 0.55
        out[o + 1] = out[o + 1]! * 0.6
        out[o + 2] = out[o + 2]! * 0.68
        continue
      }
      let color: Rgb = [120, 80, 48]
      if (Math.abs(q) > half - 0.06) color = q < 0 ? [150, 104, 64] : [70, 46, 28]
      if (Math.abs(t) < 0.07 && Math.abs(q) < half - 0.04) color = [236, 228, 206]
      if (Math.hypot(t, q) < 0.06) color = [50, 34, 22]
      out[o] = color[0]
      out[o + 1] = color[1]
      out[o + 2] = color[2]
    }
}
