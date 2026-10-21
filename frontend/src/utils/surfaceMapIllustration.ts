/**
 * Deterministic illustrated rendition of Drevarr's 2026 Duris surface map.
 * All pixel positions are inherited from the original 1600x1600 bitmap.
 * This supplies a visual treatment, not new geography or place names.
 */
const SIZE = 1600
const SEA = 0
const FOREST = 1
const RIDGE = 2
const DESERT = 3
const FAERIE = 4
const VOLCANIC = 5
const PLAINS = 6

export function terrainAt(r: number, g: number, b: number): number {
  if (b > g * 1.12 && g > r * 1.12 && b > 90) return SEA
  if (r > 105 && b > g * 1.12 && b > r * 0.95) return FAERIE
  if (r > 90 && r > g * 1.33 && r > b * 1.12) return VOLCANIC
  if (r > 162 && g > 126 && b < 155 && r > b * 1.22) return DESERT
  if (g > r * 1.08 && g > b * 0.96) return FOREST
  if (r > g * 1.12 && r > b * 1.06) return RIDGE
  return PLAINS
}

function hash(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function clamp(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function mountain(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const high = size * 1.06
  ctx.fillStyle = 'rgba(8,21,22,.35)'
  ctx.beginPath()
  ctx.ellipse(x + size * 0.25, y + size * 0.4, size, size * 0.24, -0.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#554c47'
  ctx.beginPath()
  ctx.moveTo(x - size, y + size * 0.22)
  ctx.lineTo(x, y - high)
  ctx.lineTo(x + size, y + size * 0.26)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#b2a48d'
  ctx.beginPath()
  ctx.moveTo(x, y - high)
  ctx.lineTo(x - size, y + size * 0.22)
  ctx.lineTo(x + size * 0.05, y + size * 0.02)
  ctx.lineTo(x + size * 0.12, y - size * 0.2)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#eee8d7'
  ctx.beginPath()
  ctx.moveTo(x, y - high)
  ctx.lineTo(x - size * 0.3, y - high * 0.58)
  ctx.lineTo(x - size * 0.06, y - high * 0.66)
  ctx.lineTo(x + size * 0.17, y - high * 0.57)
  ctx.lineTo(x + size * 0.21, y - high * 0.66)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(36,37,34,.6)'
  ctx.lineWidth = 0.85
  ctx.beginPath()
  ctx.moveTo(x - size, y + size * 0.22)
  ctx.lineTo(x, y - high)
  ctx.lineTo(x + size, y + size * 0.26)
  ctx.stroke()
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, lit: boolean) {
  ctx.fillStyle = 'rgba(5,24,21,.32)'
  ctx.beginPath()
  ctx.ellipse(x + 1, y + h * 0.22, h * 0.55, h * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#183c32'
  ctx.beginPath()
  ctx.moveTo(x, y - h)
  ctx.lineTo(x - h * 0.58, y + h * 0.19)
  ctx.lineTo(x + h * 0.58, y + h * 0.19)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = lit ? '#47744d' : '#295b42'
  for (let step = 0; step < 3; step++) {
    const yy = y - h * (0.69 - step * 0.24)
    const w = h * (0.31 + step * 0.11)
    ctx.beginPath()
    ctx.moveTo(x, yy - h * 0.24)
    ctx.quadraticCurveTo(x - w * 0.6, yy + h * 0.12, x - w, yy + h * 0.2)
    ctx.quadraticCurveTo(x, yy + h * 0.08, x + w, yy + h * 0.2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.strokeStyle = 'rgba(196,213,154,.43)'
  ctx.lineWidth = 0.75
  ctx.beginPath()
  ctx.moveTo(x - h * 0.09, y - h * 0.78)
  ctx.lineTo(x - h * 0.26, y - h * 0.48)
  ctx.stroke()
}

function dune(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.lineWidth = 0.9
  ctx.strokeStyle = 'rgba(112,73,43,.50)'
  ctx.beginPath()
  ctx.moveTo(x - size, y + 2)
  ctx.quadraticCurveTo(x, y - size * 0.5, x + size, y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255,233,180,.73)'
  ctx.beginPath()
  ctx.moveTo(x - size * 0.72, y)
  ctx.quadraticCurveTo(x, y - size * 0.5, x + size * 0.61, y - 1)
  ctx.stroke()
}

/**
 * Build a browser-local illustrated image; caller must revoke the object URL.
 * Neither the source pixels nor the VNUM-to-pixel transform are modified.
 */
export async function buildIllustratedSurfaceMap(sourceUrl: string): Promise<string> {
  const source = new Image()
  source.decoding = 'async'
  source.src = sourceUrl
  await source.decode()
  if (source.naturalWidth !== SIZE || source.naturalHeight !== SIZE) {
    throw new Error('The illustrated map requires the original 1600 × 1600 Duris bitmap.')
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas support is needed for the illustrated map.')
  ctx.drawImage(source, 0, 0)
  const pixels = ctx.getImageData(0, 0, SIZE, SIZE)
  const src = pixels.data
  const terrain = new Uint8Array(SIZE * SIZE)
  const base = new Uint8ClampedArray(src.length)
  const palette: readonly (readonly [number, number, number])[] = [
    [12, 60, 84],
    [53, 98, 65],
    [153, 127, 100],
    [222, 184, 116],
    [147, 119, 166],
    [147, 67, 49],
    [131, 148, 101],
  ]
  for (let i = 0; i < terrain.length; i++) {
    const p = i * 4
    terrain[i] = terrainAt(src[p]!, src[p + 1]!, src[p + 2]!)
  }
  // Organic watercolour pigment and the source's own terrain boundaries.
  for (let y = 0; y < SIZE; y++) {
    const broadY = Math.sin(y * 0.012) * 9 + Math.cos(y * 0.025) * 4
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const p = i * 4
      const kind = terrain[i]!
      const [r, g, b] = palette[kind]!
      const wash =
        broadY +
        Math.sin(x * 0.02 + y * 0.008) * 7 +
        (hash(x >> 3, y >> 3) - 0.5) * 17 +
        ((src[p]! + src[p + 1]! + src[p + 2]!) / 3 - 106) * 0.1
      base[p] = clamp(r + wash)
      base[p + 1] = clamp(g + wash)
      base[p + 2] = clamp(b + wash * 0.85)
      base[p + 3] = 255
    }
  }
  // The foam occupies water pixels, the warm coast tint occupies land pixels:
  // the underlying shoreline never moves even by a single pixel.
  for (let y = 4; y < SIZE - 4; y++) {
    for (let x = 4; x < SIZE - 4; x++) {
      const i = y * SIZE + x
      const land = terrain[i] !== SEA
      const nearOpposite =
        terrain[i - 3] === (land ? SEA : FOREST) ||
        terrain[i + 3] === (land ? SEA : FOREST) ||
        terrain[i - 3 * SIZE] === (land ? SEA : FOREST) ||
        terrain[i + 3 * SIZE] === (land ? SEA : FOREST)
      // Different terrain types can border the water; never require forest.
      const adjacentLand =
        !land &&
        (terrain[i - 3] !== SEA ||
          terrain[i + 3] !== SEA ||
          terrain[i - 3 * SIZE] !== SEA ||
          terrain[i + 3 * SIZE] !== SEA)
      const adjacentSea =
        land &&
        (terrain[i - 3] === SEA ||
          terrain[i + 3] === SEA ||
          terrain[i - 3 * SIZE] === SEA ||
          terrain[i + 3 * SIZE] === SEA)
      if (!adjacentLand && !adjacentSea && !nearOpposite) continue
      const p = i * 4
      const tint = land ? [24, 17, 10] : [14, 49, 49]
      base[p] = clamp(base[p]! + tint[0]!)
      base[p + 1] = clamp(base[p + 1]! + tint[1]!)
      base[p + 2] = clamp(base[p + 2]! + tint[2]!)
    }
  }
  pixels.data.set(base)
  ctx.putImageData(pixels, 0, 0)

  // Separate ink art layer; destination-in clips decorative mountains/trees
  // strictly to the source's original land pixels, including small islands.
  const ink = document.createElement('canvas')
  ink.width = SIZE
  ink.height = SIZE
  const art = ink.getContext('2d')
  if (!art) throw new Error('Unable to paint the atlas artwork.')
  for (let y = 12; y < SIZE - 12; y += 13) {
    for (let x = 12; x < SIZE - 12; x += 13) {
      const rx = Math.floor(x + (hash(x + 67, y) - 0.5) * 10)
      const ry = Math.floor(y + (hash(x, y + 113) - 0.5) * 10)
      const type = terrain[ry * SIZE + rx]
      const value = hash(x, y)
      const sz = 4.5 + hash(x + 17, y + 31) * 5.2
      if (type === FOREST && value > 0.21) {
        tree(art, rx, ry, sz, value > 0.55)
        if (value > 0.85) tree(art, rx + sz * 0.68, ry + 2, sz * 0.75, false)
      } else if (type === RIDGE && value > 0.26) {
        mountain(art, rx, ry, sz * 1.1)
      } else if (type === DESERT && value > 0.31) {
        dune(art, rx, ry, sz * 1.7)
      } else if (type === FAERIE && value > 0.36) {
        art.fillStyle = 'rgba(223,201,255,.6)'
        art.fillRect(rx, ry, 2, 3)
      } else if (type === VOLCANIC && value > 0.35) {
        art.strokeStyle = 'rgba(255,139,68,.65)'
        art.lineWidth = 1.5
        art.beginPath()
        art.moveTo(rx - sz, ry + sz * 0.2)
        art.lineTo(rx, ry - sz * 0.22)
        art.lineTo(rx + sz * 0.55, ry + sz * 0.13)
        art.stroke()
      }
    }
  }
  const mask = document.createElement('canvas')
  mask.width = SIZE
  mask.height = SIZE
  const maskCtx = mask.getContext('2d')
  if (!maskCtx) throw new Error('Unable to clip the atlas to the source geography.')
  const alpha = maskCtx.createImageData(SIZE, SIZE)
  for (let i = 0; i < terrain.length; i++) {
    alpha.data[i * 4] = 255
    alpha.data[i * 4 + 1] = 255
    alpha.data[i * 4 + 2] = 255
    alpha.data[i * 4 + 3] = terrain[i] === SEA ? 0 : 255
  }
  maskCtx.putImageData(alpha, 0, 0)
  art.globalCompositeOperation = 'destination-in'
  art.drawImage(mask, 0, 0)
  art.globalCompositeOperation = 'source-over'
  ctx.drawImage(ink, 0, 0)
  // Waves only decorate original sea pixels.
  ctx.lineWidth = 0.75
  ctx.strokeStyle = 'rgba(165,216,209,.23)'
  for (let y = 18; y < SIZE - 18; y += 24) {
    for (let x = 16; x < SIZE - 16; x += 28) {
      const xx = Math.floor(x + (hash(x, y) - 0.5) * 12)
      const yy = Math.floor(y + (hash(y, x) - 0.5) * 12)
      if (terrain[yy * SIZE + xx] !== SEA || hash(x + 11, y + 7) < 0.67) continue
      const w = 3 + hash(x + 42, y + 15) * 5
      ctx.beginPath()
      ctx.moveTo(xx - w, yy)
      ctx.quadraticCurveTo(xx, yy - 2, xx + w, yy)
      ctx.stroke()
    }
  }
  const patina = ctx.createRadialGradient(800, 780, 330, 800, 800, 1140)
  patina.addColorStop(0, 'rgba(249,217,160,.04)')
  patina.addColorStop(0.75, 'rgba(0,0,0,0)')
  patina.addColorStop(1, 'rgba(5,16,25,.28)')
  ctx.fillStyle = patina
  ctx.fillRect(0, 0, SIZE, SIZE)
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Atlas PNG export failed.'))),
      'image/png',
    )
  })
  return URL.createObjectURL(png)
}
