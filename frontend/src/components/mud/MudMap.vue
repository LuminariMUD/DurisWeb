<script setup lang="ts">
import { computed, inject, nextTick, onUnmounted, ref, shallowRef, watch, toRefs } from 'vue'
import cytoscape, { type Core, type ElementDefinition, type NodeSingular } from 'cytoscape'
import { Button } from '@/components/ui/button'
import { playMapKey, defaultMapPreferences } from '../../composables/usePlayMap.js'
import type { MapAction } from '../../composables/useMapBroadcast.js'
import { emptyMapSnapshot, mapDirection, type PlayMapSnapshot } from '../../utils/playMap.js'
import {
  layoutPlayMap,
  applyPlayMapPositions,
  MAP_SECTOR_COLORS,
} from '../../utils/playMapLayout.js'
import { getZoneMapConnections, layoutZoneRooms } from '../../utils/wikiZoneMapLayout.js'
import { parseMapText } from '../../utils/mapText.js'
import MapText from './MapText.vue'
import type { MudDirection } from '../../types/mud.js'

const props = defineProps<{
  standalone?: boolean
  detachable?: boolean
  snapshot?: PlayMapSnapshot
  onAction?: (action: MapAction, target?: number) => void
}>()
const minimized = defineModel<boolean>('minimized', { default: false })
const emit = defineEmits<{ detach: [] }>()
const context = inject(playMapKey, null)
const state = computed(() => props.snapshot ?? context?.snapshot.value ?? emptyMapSnapshot())
const preferences =
  !props.standalone && context ? context.preferences : ref(defaultMapPreferences())
const { view, showAllFloors, clickToWalk, roomSize, asciiSize, follow, selectedId } = toRefs(
  preferences.value,
)
const viewport = ref<HTMLElement | null>(null)
const overview = ref<HTMLElement | null>(null)
const dimensions = ref({ width: 320, height: 220 })
const visible = ref(false)
const cy = shallowRef<Core | null>(null)
const graph = computed(() => state.value.graph)
const layout = computed(() => (graph.value ? layoutPlayMap(graph.value) : null))
const player = computed(() => layout.value?.positions.get(state.value.room?.vnum ?? -1))
const isWild = computed(
  () => state.value.room?.mapKind === 'wilderness' || !!state.value.wildernessMap,
)
const visited = computed(() => new Map(state.value.rooms.map((room) => [room.vnum, room])))
const selected = computed(() => graph.value?.nodes.find((node) => node.id === selectedId.value))
const selectedExits = computed(
  () => graph.value?.edges.filter((edge) => edge.from === selectedId.value) ?? [],
)
const plain = (value: string) =>
  parseMapText(value)
    .map((run) => run.text)
    .join('')
const cellSize = computed(() => roomSize.value + 6)
const localNodes = computed(() => {
  const current = player.value
  if (!visible.value || !current || !layout.value || !graph.value) return []
  return graph.value.nodes.flatMap((node) => {
    const position = layout.value?.positions.get(node.id)
    if (
      !position ||
      position.section !== current.section ||
      position.z !== current.z ||
      Math.abs(position.x - current.x) > 5 ||
      Math.abs(position.y - current.y) > 5
    )
      return []
    const x = dimensions.value.width / 2 + (position.x - current.x) * cellSize.value
    const y = dimensions.value.height / 2 + (position.y - current.y) * cellSize.value
    if (
      x < roomSize.value / 2 ||
      y < roomSize.value / 2 ||
      x > dimensions.value.width - roomSize.value / 2 ||
      y > dimensions.value.height - roomSize.value / 2
    )
      return []
    return [{ ...node, x, y }]
  })
})
const offsets: Record<MudDirection, [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
  up: [0, 0],
  down: [0, 0],
  northeast: [1, -1],
  northwest: [-1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
}
function doorFor(from: number, direction: MudDirection) {
  const room = state.value.room?.vnum === from ? state.value.room : visited.value.get(from)
  return room?.exits[direction]
}
const passages = computed(() => {
  const visible = new Map(localNodes.value.map((node) => [node.id, node]))
  return (graph.value?.edges ?? []).flatMap((edge) => {
    const node = visible.get(edge.from)
    if (!node || edge.direction === 'up' || edge.direction === 'down') return []
    const origin = layout.value?.positions.get(edge.from)
    const target = layout.value?.positions.get(edge.to)
    const vector = offsets[edge.direction]
    const far =
      !target ||
      !origin ||
      target.x !== origin.x + vector[0] ||
      target.y !== origin.y + vector[1] ||
      target.z !== origin.z
    const door = doorFor(edge.from, edge.direction)
    return [
      {
        ...edge,
        x1: node.x,
        y1: node.y,
        x2: node.x + (vector[0] * cellSize.value) / 2,
        y2: node.y + (vector[1] * cellSize.value) / 2,
        far,
        color: door?.closed
          ? door.locked
            ? 'var(--color-danger)'
            : 'var(--color-warning)'
          : door?.door
            ? 'var(--color-success)'
            : far
              ? 'var(--map-far)'
              : 'var(--map-floor)',
      },
    ]
  })
})
const verticalExits = computed(() => {
  const exits = new Map<number, string>()
  for (const edge of graph.value?.edges ?? []) {
    if (edge.direction === 'up' || edge.direction === 'down')
      exits.set(edge.from, `${exits.get(edge.from) ?? ''}${edge.direction === 'up' ? '▲' : '▼'}`)
  }
  return exits
})
const hovered = ref<{ name: string; x: number; y: number } | null>(null)
function showTooltip(name: string, x: number, y: number) {
  hovered.value = {
    name,
    x: Math.max(4, Math.min(x, dimensions.value.width - 208)),
    y: Math.max(4, Math.min(y - 36, dimensions.value.height - 60)),
  }
}
function select(id: number, walk = clickToWalk.value) {
  selectedId.value = id
  if (walk && id !== state.value.room?.vnum) action('walk', id)
}
function action(type: MapAction, target?: number) {
  ;(props.onAction ?? context?.action)?.(type, target)
}
function center() {
  follow.value = true
  const node = cy.value?.getElementById(String(state.value.room?.vnum))
  if (node?.length) cy.value?.center(node)
}
function zoom(delta: number) {
  if (isWild.value) asciiSize.value = Math.max(6, Math.min(36, asciiSize.value + delta * 2))
  else if (view.value === 'local')
    roomSize.value = Math.max(8, Math.min(24, roomSize.value + delta * 2))
  else if (cy.value)
    cy.value.zoom({
      level: cy.value.zoom() * (delta > 0 ? 1.25 : 0.8),
      renderedPosition: { x: dimensions.value.width / 2, y: dimensions.value.height / 2 },
    })
}
const overviewRooms = computed(() => {
  const exits = new Map<number, Record<string, number>>()
  for (const edge of graph.value?.edges ?? []) {
    if (!exits.has(edge.from)) exits.set(edge.from, {})
    exits.get(edge.from)![edge.direction] = edge.to
  }
  return (graph.value?.nodes ?? []).map((node) => ({
    vnum: node.id,
    name: node.name,
    sectorType: node.sectorType,
    exits: exits.get(node.id),
  }))
})
const overviewPositions = computed(() =>
  graph.value
    ? applyPlayMapPositions(graph.value, layoutZoneRooms(overviewRooms.value))
    : new Map<number, { x: number; y: number }>(),
)
function buildOverview(): ElementDefinition[] {
  if (!graph.value) return []
  const current = player.value
  const nodes = graph.value.nodes.filter((node) => {
    const position = layout.value?.positions.get(node.id)
    return (
      showAllFloors.value ||
      !current ||
      (position?.z === current.z && position.section === current.section)
    )
  })
  const ids = new Set(nodes.map((node) => node.id))
  const elements: ElementDefinition[] = nodes.map((node) => ({
    data: {
      id: String(node.id),
      vnum: node.id,
      name: node.name,
      current: node.id === state.value.room?.vnum,
      selected: node.id === selectedId.value,
      color: visited.value.has(node.id)
        ? (MAP_SECTOR_COLORS[node.sectorType] ?? MAP_SECTOR_COLORS[0])
        : 'transparent',
    },
    position: overviewPositions.value.get(node.id),
  }))
  for (const connection of getZoneMapConnections(overviewRooms.value)) {
    const from = Number(connection.source),
      to = Number(connection.target)
    if (!ids.has(from) || !ids.has(to)) continue
    const directions = connection.sourceDirections.concat(connection.targetDirections)
    const endpoints: Array<[number, string[]]> = [
      [from, connection.sourceDirections],
      [to, connection.targetDirections],
    ]
    const fresh = endpoints.find(([id, exits]) => id === state.value.room?.vnum && exits.length > 0)
    // A current open/removed door must not inherit the reverse room's stale closed state.
    const doors = (fresh ? [fresh] : endpoints).flatMap(([id, exits]) =>
      exits.flatMap((direction) => {
        const normalized = mapDirection(direction)
        const door = normalized ? doorFor(id, normalized) : undefined
        return door?.door ? [door] : []
      }),
    )
    elements.push({
      data: {
        id: connection.id,
        source: connection.source,
        target: connection.target,
        sourceArrow: connection.targetDirections.length ? 'triangle' : 'none',
        targetArrow: connection.sourceDirections.length ? 'triangle' : 'none',
        label: directions.map((direction) => direction.toUpperCase()).join('/'),
        vertical: connection.vertical,
        color: doors.some((door) => door.closed && door.locked)
          ? '#ef4444'
          : doors.some((door) => door.closed)
            ? '#f97316'
            : doors.length
              ? '#22c55e'
              : '#8b8174',
      },
    })
  }
  return elements
}
async function renderOverview() {
  await nextTick()
  const container = overview.value
  if (
    !container ||
    view.value !== 'overview' ||
    isWild.value ||
    !graph.value ||
    container.clientWidth === 0 ||
    container.clientHeight === 0
  )
    return
  const fresh =
    preferences.value.overviewZone !== state.value.zoneNumber ||
    preferences.value.overviewZoom === null
  preferences.value.overviewZone = state.value.zoneNumber
  if (!cy.value) {
    cy.value = cytoscape({
      container,
      elements: [],
      layout: { name: 'preset' },
      minZoom: 0.005,
      maxZoom: 4,
      style: [
        {
          selector: 'node',
          style: {
            width: 24,
            height: 24,
            'background-color': 'data(color)',
            'border-color': '#a89c88',
            'border-width': 1,
          },
        },
        {
          selector: 'node[?current]',
          style: { 'border-color': '#e56b55', 'border-width': 4, shape: 'diamond' },
        },
        { selector: 'node[?selected]', style: { 'border-width': 3, 'border-color': '#f0dfbc' } },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': 'data(color)',
            'curve-style': 'bezier',
            'source-arrow-shape': (edge) =>
              edge.data('sourceArrow') === 'triangle' ? 'triangle' : 'none',
            'target-arrow-shape': (edge) =>
              edge.data('targetArrow') === 'triangle' ? 'triangle' : 'none',
            'source-arrow-color': 'data(color)',
            'target-arrow-color': 'data(color)',
          },
        },
        {
          selector: 'edge[?vertical]',
          style: { 'line-style': 'dashed', label: 'data(label)', 'font-size': 8, color: '#ddd0b4' },
        },
      ],
    })
    cy.value.on('tap', 'node', (event) => select(Number(event.target.data('vnum'))))
    cy.value.on('mouseover', 'node', (event) => {
      const node = event.target as NodeSingular
      const position = node.renderedPosition()
      showTooltip(
        `#${node.data('vnum')} — ${plain(String(node.data('name')))}`,
        position.x,
        position.y,
      )
    })
    cy.value.on('mouseout pan zoom', () => {
      hovered.value = null
      if (cy.value) {
        preferences.value.overviewZoom = cy.value.zoom()
        preferences.value.overviewPan = cy.value.pan()
      }
    })
    cy.value.on('dragpan', () => {
      follow.value = false
    })
  }
  const instance = cy.value
  const previousZoom = preferences.value.overviewZoom ?? instance.zoom(),
    previousPan = preferences.value.overviewPan ?? instance.pan()
  instance.batch(() => {
    instance.elements().remove()
    instance.add(buildOverview())
  })
  instance.resize()
  if (fresh) {
    instance.fit(undefined, 40)
    if (follow.value) center()
  } else {
    instance.zoom(previousZoom)
    instance.pan(previousPan)
    if (follow.value) center()
  }
  preferences.value.overviewZoom = instance.zoom()
  preferences.value.overviewPan = instance.pan()
}
function destroyOverview() {
  if (cy.value) {
    preferences.value.overviewZoom = cy.value.zoom()
    preferences.value.overviewPan = cy.value.pan()
  }
  cy.value?.destroy()
  cy.value = null
}
watch(
  [view, isWild, graph],
  () => {
    destroyOverview()
    void renderOverview()
  },
  { flush: 'post' },
)
watch(
  () => [
    state.value.roomRevision,
    state.value.graphRevision,
    showAllFloors.value,
    selectedId.value,
  ],
  () => {
    void renderOverview()
  },
  { flush: 'post' },
)
watch(
  graph,
  () => {
    if (!graph.value?.nodes.some((node) => node.id === selectedId.value))
      selectedId.value = state.value.room?.vnum ?? null
  },
  { immediate: true },
)
let observer: ResizeObserver | null = null
watch(
  viewport,
  (element) => {
    observer?.disconnect()
    observer = null
    if (!element) {
      destroyOverview()
      return
    }
    const resize = () => {
      visible.value = element.clientWidth > 0 && element.clientHeight > 0
      if (!visible.value) {
        destroyOverview()
        return
      }
      dimensions.value = { width: element.clientWidth, height: element.clientHeight }
      cy.value?.resize()
      if (follow.value) center()
      void renderOverview()
    }
    observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
  },
  { flush: 'post' },
)
onUnmounted(() => {
  observer?.disconnect()
  destroyOverview()
})
</script>

<template>
  <section class="play-map flex flex-col min-h-0 border border-border bg-background" :class="minimized ? 'h-auto' : 'h-full'" aria-label="Live game map" @keydown.stop>
    <header class="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-border shrink-0">
      <span class="font-medium text-sm mr-auto">Map <span v-if="state.paused" class="text-warning">— paused</span></span>
      <Button v-if="!standalone" size="sm" variant="ghost" :disabled="!context?.canPopOut" @click="context?.popOut()">Pop out</Button>
      <Button v-if="!standalone && detachable" size="sm" variant="ghost" @click="emit('detach')">Float / dock</Button>
      <Button v-if="!standalone" size="sm" variant="ghost" :aria-expanded="!minimized" @click="minimized = !minimized">{{ minimized ? 'Expand' : 'Minimize' }}</Button>
    </header>
    <template v-if="!minimized">
      <div class="flex flex-wrap items-center gap-1 p-1 shrink-0" aria-label="Map controls">
        <template v-if="!isWild">
          <Button size="sm" :variant="view === 'local' ? 'default' : 'ghost'" :aria-pressed="view === 'local'" @click="view = 'local'">Local</Button>
          <Button size="sm" :variant="view === 'overview' ? 'default' : 'ghost'" :aria-pressed="view === 'overview'" @click="view = 'overview'">Overview</Button>
          <label v-if="view === 'overview'" class="text-xs flex items-center gap-1"><input v-model="showAllFloors" type="checkbox">All levels</label>
        </template>
        <Button size="sm" variant="ghost" aria-label="Zoom out" @click="zoom(-1)">−</Button>
        <Button size="sm" variant="ghost" aria-label="Zoom in" @click="zoom(1)">+</Button>
        <Button size="sm" variant="ghost" @click="isWild ? asciiSize = 18 : center()">{{ isWild ? 'Reset zoom' : 'Follow' }}</Button>
        <Button v-if="view === 'overview' && !isWild" size="sm" variant="ghost" @click="cy?.fit(undefined, 40); follow = false">Fit</Button>
        <Button size="sm" variant="ghost" @click="action(state.paused ? 'resume' : 'pause')">{{ state.paused ? 'Resume' : 'Pause' }}</Button>
        <Button size="sm" variant="ghost" @click="action('reload')">Reload</Button>
      </div>
      <div ref="viewport" class="relative flex-1 min-h-0 overflow-hidden bg-ink-sunken" :aria-busy="state.loading">
        <div v-if="state.loading" class="absolute inset-0 flex items-center justify-center text-sm" role="status">Loading zone map…</div>
        <div v-else-if="state.error" class="absolute inset-0 p-3 flex flex-col justify-center text-sm" role="alert">{{ state.error }}<a href="/login" class="underline">Website login</a></div>
        <div v-else-if="!state.room" class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Waiting for current room…</div>
        <div v-else-if="isWild" class="absolute inset-0 overflow-auto flex p-2">
          <MapText v-if="state.wildernessMap" class="m-auto shrink-0" :text="state.wildernessMap" :font-size="asciiSize" aria-label="Wilderness map" />
          <span v-else class="text-sm text-muted-foreground">Waiting for wilderness map…</span>
        </div>
        <template v-else-if="graph?.nodes.length">
          <div v-if="view === 'overview'" ref="overview" class="absolute inset-0 w-full h-full" aria-label="Zone overview" />
          <svg v-else-if="player" class="w-full h-full block" :viewBox="`0 0 ${dimensions.width} ${dimensions.height}`" aria-label="Local room and passage map">
            <line v-for="(passage, index) in passages" :key="`p${index}`" :x1="passage.x1" :y1="passage.y1" :x2="passage.x2" :y2="passage.y2" :stroke="passage.color" :stroke-width="roomSize * 0.55" :stroke-dasharray="passage.far ? '2 2' : undefined" pointer-events="none" />
            <g v-for="node in localNodes" :key="node.id" role="button" tabindex="0" :aria-label="`Inspect #${node.id} ${plain(node.name)}`" :aria-pressed="selectedId === node.id" class="map-room outline-none"
              @click="select(node.id)" @keydown.enter.prevent="select(node.id, false)" @keydown.space.prevent="select(node.id, false)"
              @mouseenter="showTooltip(`#${node.id} — ${plain(node.name)}`, node.x, node.y)" @mouseleave="hovered = null" @focus="showTooltip(`#${node.id} — ${plain(node.name)}`, node.x, node.y)" @blur="hovered = null">
              <rect :x="node.x - roomSize / 2" :y="node.y - roomSize / 2" :width="roomSize" :height="roomSize" rx="2" :fill="visited.has(node.id) ? 'var(--map-floor)' : 'var(--map-unvisited)'" :stroke="selectedId === node.id ? 'var(--color-bone)' : 'var(--map-floor)'" :stroke-dasharray="visited.has(node.id) ? undefined : '2 2'" />
              <circle :cx="node.x - roomSize / 3" :cy="node.y + roomSize / 3" r="1.5" :fill="MAP_SECTOR_COLORS[node.sectorType] ?? MAP_SECTOR_COLORS[0]" pointer-events="none" />
              <text :x="node.x + roomSize / 2" :y="node.y - roomSize / 3" text-anchor="end" class="map-stairs" pointer-events="none">{{ verticalExits.get(node.id) }}</text>
            </g>
            <circle :cx="dimensions.width / 2" :cy="dimensions.height / 2" r="4" fill="var(--color-vermilion)" stroke="var(--color-bone)" pointer-events="none" />
          </svg>
          <p v-else class="p-3 text-sm">Current room is absent from this zone map. Use Overview to inspect the available rooms.</p>
          <div v-if="hovered" role="tooltip" class="absolute z-10 pointer-events-none bg-ink-high text-foreground border border-border text-xs p-1 break-words overflow-hidden" :style="{ left: `${hovered.x}px`, top: `${hovered.y}px`, maxWidth: `${Math.min(200, dimensions.width - hovered.x - 4)}px`, maxHeight: `${dimensions.height - hovered.y - 4}px` }">{{ hovered.name }}</div>
        </template>
        <p v-else class="p-3 text-sm text-muted-foreground">No zone map available. Reload to retry.</p>
      </div>
      <div class="shrink-0 px-2 py-1 text-xs text-muted-foreground border-t border-border" role="status">
        <span v-if="view === 'overview' && !isWild">{{ Math.round((preferences.overviewZoom ?? 1) * 1000) / 10 }}% · </span>
        <span v-if="state.room">#{{ state.room.vnum }} · Zone {{ state.zoneNumber }} · </span>
        <span v-if="isWild">Wilderness · {{ asciiSize }}px</span>
        <span v-else>{{ graph?.nodes.length ?? 0 }} rooms<span v-if="player"> · Inferred level {{ player.z }} · Section {{ player.section }}</span> · {{ state.cachedZones }} cached zones</span>
        <span v-if="player && layout?.ambiguousSections.has(player.section)"> · Conflicting level exits: use Overview / All levels.</span>
      </div>
      <details class="relative shrink-0 px-2 py-1 text-xs border-t border-border">
        <summary class="truncate">Inspect room{{ selected ? `: #${selected.id} — ${plain(selected.name)}` : '' }}</summary>
        <div class="absolute bottom-full inset-x-0 z-20 overflow-auto p-2 space-y-1 bg-card border border-border" :style="{ maxHeight: `${Math.max(0, Math.min(128, dimensions.height))}px` }">
          <label v-if="view === 'local' && !isWild" class="flex items-center gap-1">Room size {{ roomSize }}<input v-model.number="roomSize" aria-label="Room size" type="range" min="8" max="24" step="1" class="min-w-0 flex-1"></label>
          <label class="flex items-center gap-1">Room<select v-model="selectedId" class="bg-background border border-border min-w-0 flex-1" aria-label="Inspect zone room"><option v-for="node in graph?.nodes ?? []" :key="node.id" :value="node.id">#{{ node.id }} — {{ plain(node.name) }}</option></select></label>
          <div v-if="selected" class="flex flex-wrap gap-1 items-center">
            <Button size="sm" :disabled="state.paused || selected.id === state.room?.vnum" @click="action('walk', selected.id)">Walk here</Button>
            <label class="flex items-center gap-1"><input v-model="clickToWalk" type="checkbox">Click rooms to walk</label>
          </div>
          <div v-for="(exit, index) in selectedExits" :key="index">
            {{ exit.direction }} → #{{ exit.to }}
            <span v-if="doorFor(exit.from, exit.direction)?.door"> · {{ doorFor(exit.from, exit.direction)?.locked ? 'locked' : doorFor(exit.from, exit.direction)?.closed ? 'closed' : 'open' }} door{{ exit.from !== state.room?.vnum ? ' (last observed)' : '' }}</span>
            <span v-if="!layout?.positions.has(exit.to)"> · outside this zone</span>
          </div>
          <p>Dot/diamond: you · outline: unexplored · corner color: terrain · ▲/▼: up/down · dashed passages: distant/outside exit. Doors: green open, orange closed, red locked.</p>
        </div>
      </details>
      <div v-if="state.walking" class="flex flex-wrap items-center gap-1 px-2 py-1 text-xs" role="status">Walking to {{ plain(state.target) }} · {{ state.stepsRemaining }} steps <Button size="sm" variant="destructive" @click="action('stop')">Stop</Button></div>
      <nav class="flex gap-3 px-2 pb-1 text-xs"><a href="/wiki/map" target="_blank" rel="noopener">World map</a><a v-if="state.zoneNumber !== null" :href="`/wiki/zones/${state.zoneNumber}`" target="_blank" rel="noopener">Zone wiki</a></nav>
    </template>
  </section>
</template>

<style scoped>
.play-map { --map-floor: #5a4b37; --map-far: #6e5a46; --map-unvisited: #211d17; }
.map-stairs { font-size: 9px; fill: var(--color-bone); }
.map-room:focus rect { stroke: var(--color-vermilion); stroke-width: 2px; }
</style>
