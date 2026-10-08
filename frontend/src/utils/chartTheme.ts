/**
 * Chart colors resolved from the eclipse tokens in assets/main.css. Canvas
 * charts cannot read CSS variables, so keep these hex values in step with
 * the tokens when the palette changes.
 */
export const chartTheme = {
  text: '#ece8dd',
  muted: '#b8b5a8',
  grid: 'rgba(87, 87, 67, 0.3)',
  outline: 'rgba(236, 232, 221, 0.2)',
  noData: 'rgba(38, 40, 32, 0.5)',
  tooltip: {
    backgroundColor: '#1a1c18',
    titleColor: '#ece8dd',
    bodyColor: '#d0cec2',
    borderColor: '#575743',
    borderWidth: 1,
    padding: 12,
  },
  /** --chart-1..5: vermilion, ember, label, bone-muted, info. */
  series: ['#df583d', '#f79250', '#b3b086', '#d0cec2', '#7f9fb0'],
  /** Alignment keeps its meaning: good, evil, neutral, undead. */
  faction: {
    good: '#8aa66b',
    evil: '#df583d',
    neutral: '#d9a553',
    undead: '#a98bd6',
  },
} as const

/** Convert a `#rrggbb` token to an `rgba()` string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/** Pick `count` series colors, cycling the chart palette. */
export function seriesColors(count: number, alpha = 1): string[] {
  return Array.from({ length: count }, (_, index) => {
    const color = chartTheme.series[index % chartTheme.series.length] ?? chartTheme.series[0]
    return alpha === 1 ? color : withAlpha(color, alpha)
  })
}

/** Heat scale for choropleths: dark ember at 0, bright ember at 1. */
export function heatColor(intensity: number): string {
  const t = Math.min(Math.max(intensity, 0), 1)
  const r = Math.round(58 + t * (247 - 58))
  const g = Math.round(40 + t * (146 - 40))
  const b = Math.round(30 + t * (80 - 30))
  return `rgb(${r}, ${g}, ${b})`
}
