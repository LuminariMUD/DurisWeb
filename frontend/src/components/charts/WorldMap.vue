<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { Chart as ChartJS, Tooltip, Legend, type ChartOptions } from 'chart.js'
import { ChoroplethController, GeoFeature, ColorScale, ProjectionScale } from 'chartjs-chart-geo'
import * as topojson from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, Geometry } from 'geojson'

// Register chart.js geo components
ChartJS.register(ChoroplethController, GeoFeature, ColorScale, ProjectionScale, Tooltip, Legend)

interface GeoData {
  country: string
  countryCode: string
  count: number
  percentage: number
}

interface Props {
  data: GeoData[]
  height?: number
}

const props = withDefaults(defineProps<Props>(), {
  height: 400,
})

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: ChartJS | null = null
const countries = ref<Feature<Geometry>[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)

// ISO 3166-1 alpha-2 to numeric code mapping (for TopoJSON matching)
const alpha2ToNumeric: Record<string, string> = {
  AF: '004',
  AL: '008',
  DZ: '012',
  AS: '016',
  AD: '020',
  AO: '024',
  AI: '660',
  AG: '028',
  AR: '032',
  AM: '051',
  AW: '533',
  AU: '036',
  AT: '040',
  AZ: '031',
  BS: '044',
  BH: '048',
  BD: '050',
  BB: '052',
  BY: '112',
  BE: '056',
  BZ: '084',
  BJ: '204',
  BM: '060',
  BT: '064',
  BO: '068',
  BA: '070',
  BW: '072',
  BR: '076',
  BN: '096',
  BG: '100',
  BF: '854',
  BI: '108',
  KH: '116',
  CM: '120',
  CA: '124',
  CV: '132',
  CF: '140',
  TD: '148',
  CL: '152',
  CN: '156',
  CO: '170',
  KM: '174',
  CG: '178',
  CD: '180',
  CR: '188',
  CI: '384',
  HR: '191',
  CU: '192',
  CY: '196',
  CZ: '203',
  DK: '208',
  DJ: '262',
  DM: '212',
  DO: '214',
  EC: '218',
  EG: '818',
  SV: '222',
  GQ: '226',
  ER: '232',
  EE: '233',
  ET: '231',
  FJ: '242',
  FI: '246',
  FR: '250',
  GA: '266',
  GM: '270',
  GE: '268',
  DE: '276',
  GH: '288',
  GR: '300',
  GL: '304',
  GD: '308',
  GT: '320',
  GN: '324',
  GW: '624',
  GY: '328',
  HT: '332',
  HN: '340',
  HK: '344',
  HU: '348',
  IS: '352',
  IN: '356',
  ID: '360',
  IR: '364',
  IQ: '368',
  IE: '372',
  IL: '376',
  IT: '380',
  JM: '388',
  JP: '392',
  JO: '400',
  KZ: '398',
  KE: '404',
  KI: '296',
  KP: '408',
  KR: '410',
  KW: '414',
  KG: '417',
  LA: '418',
  LV: '428',
  LB: '422',
  LS: '426',
  LR: '430',
  LY: '434',
  LI: '438',
  LT: '440',
  LU: '442',
  MK: '807',
  MG: '450',
  MW: '454',
  MY: '458',
  MV: '462',
  ML: '466',
  MT: '470',
  MR: '478',
  MU: '480',
  MX: '484',
  MD: '498',
  MC: '492',
  MN: '496',
  ME: '499',
  MA: '504',
  MZ: '508',
  MM: '104',
  NA: '516',
  NP: '524',
  NL: '528',
  NZ: '554',
  NI: '558',
  NE: '562',
  NG: '566',
  NO: '578',
  OM: '512',
  PK: '586',
  PA: '591',
  PG: '598',
  PY: '600',
  PE: '604',
  PH: '608',
  PL: '616',
  PT: '620',
  PR: '630',
  QA: '634',
  RO: '642',
  RU: '643',
  RW: '646',
  SA: '682',
  SN: '686',
  RS: '688',
  SL: '694',
  SG: '702',
  SK: '703',
  SI: '705',
  SO: '706',
  ZA: '710',
  SS: '728',
  ES: '724',
  LK: '144',
  SD: '729',
  SR: '740',
  SZ: '748',
  SE: '752',
  CH: '756',
  SY: '760',
  TW: '158',
  TJ: '762',
  TZ: '834',
  TH: '764',
  TL: '626',
  TG: '768',
  TT: '780',
  TN: '788',
  TR: '792',
  TM: '795',
  UG: '800',
  UA: '804',
  AE: '784',
  GB: '826',
  US: '840',
  UY: '858',
  UZ: '860',
  VU: '548',
  VE: '862',
  VN: '704',
  YE: '887',
  ZM: '894',
  ZW: '716',
  XK: '-99',
  PS: '275',
  LOCAL: '000',
}

// Create a map of visitor data by numeric country code
const dataByNumericCode = computed(() => {
  const map = new Map<string, GeoData>()
  props.data.forEach((item) => {
    const numericCode = alpha2ToNumeric[item.countryCode]
    if (numericCode) {
      map.set(numericCode, item)
    }
  })
  return map
})

// Get max value for color scaling
const maxCount = computed(() => {
  if (props.data.length === 0) return 1
  return Math.max(...props.data.map((d) => d.count))
})

async function loadTopoJSON() {
  try {
    isLoading.value = true
    loadError.value = null

    const response = await fetch('https://unpkg.com/world-atlas@2/countries-110m.json')
    if (!response.ok) {
      throw new Error('Failed to load map data')
    }

    const world = (await response.json()) as Topology<{ countries: GeometryCollection }>
    const countriesGeo = topojson.feature(world, world.objects.countries) as unknown as {
      features: Feature<Geometry>[]
    }
    countries.value = countriesGeo.features

    isLoading.value = false
  } catch (error) {
    console.error('Error loading TopoJSON:', error)
    loadError.value = 'Failed to load map data'
    isLoading.value = false
  }
}

function createChart() {
  if (!chartCanvas.value || countries.value.length === 0) return

  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  const chartData = {
    labels: countries.value.map((c) => (c.properties as any)?.name || 'Unknown'),
    datasets: [
      {
        label: 'Visitors',
        data: countries.value.map((c) => {
          const countryId = String(c.id)
          const visitorData = dataByNumericCode.value.get(countryId)
          return {
            feature: c,
            value: visitorData?.count || 0,
          }
        }),
        // Color scale from light to dark blue
        backgroundColor: (context: any) => {
          const value = context.raw?.value || 0
          if (value === 0) return 'rgba(30, 41, 59, 0.5)' // slate-800 with opacity for no data
          const intensity = Math.min(value / maxCount.value, 1)
          // Interpolate from light blue to dark blue
          const r = Math.round(224 - intensity * 221)
          const g = Math.round(242 - intensity * 186)
          const b = Math.round(254 - intensity * 93)
          return `rgb(${r}, ${g}, ${b})`
        },
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 0.5,
      },
    ],
  }

  const options: ChartOptions<'choropleth'> = {
    responsive: true,
    maintainAspectRatio: false,
    showOutline: true,
    showGraticule: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#444',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            const value = context.raw?.value || 0
            const countryName = context.raw?.feature?.properties?.name || 'Unknown'
            if (value === 0) return `${countryName}: No visitors`
            const countryId = String(context.raw?.feature?.id)
            const visitorData = dataByNumericCode.value.get(countryId)
            const percentage = visitorData?.percentage || 0
            return `${countryName}: ${value.toLocaleString()} visitors (${percentage}%)`
          },
        },
      },
    },
    scales: {
      projection: {
        axis: 'x',
        projection: 'equalEarth',
      },
      color: {
        axis: 'x',
        display: true,
        position: 'bottom',
        quantize: 5,
        legend: {
          position: 'bottom-right',
          align: 'right',
        },
        interpolate: (value: number) => {
          // Color scale from light to dark blue
          const r = Math.round(224 - value * 221)
          const g = Math.round(242 - value * 186)
          const b = Math.round(254 - value * 93)
          return `rgb(${r}, ${g}, ${b})`
        },
      },
    },
  } as any

  chartInstance = new ChartJS(ctx, {
    type: 'choropleth',
    data: chartData as any,
    options,
  })
}

onMounted(async () => {
  await loadTopoJSON()
  createChart()
})

watch(
  () => props.data,
  () => {
    createChart()
  },
  { deep: true },
)

watch(countries, () => {
  if (countries.value.length > 0) {
    createChart()
  }
})
</script>

<template>
  <div class="relative" :style="{ height: `${height}px` }">
    <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-slate-900/50">
      <span class="text-slate-400">Loading map...</span>
    </div>
    <div v-else-if="loadError" class="absolute inset-0 flex items-center justify-center bg-slate-900/50">
      <span class="text-red-400">{{ loadError }}</span>
    </div>
    <canvas ref="chartCanvas" />
  </div>
</template>
