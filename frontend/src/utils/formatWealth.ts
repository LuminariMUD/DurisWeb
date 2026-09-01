/**
 * Format copper value to DurisMUD currency display
 *
 * DurisMUD uses a 4-denomination system:
 * - Platinum (p) = 1000 copper
 * - Gold (g) = 100 copper
 * - Silver (s) = 10 copper
 * - Copper (c) = 1 copper
 *
 * @param copper - The total value in copper units
 * @returns Formatted string like "12p 3g 4s 5c"
 */
export function formatWealth(copper: number): string {
  if (copper === 0) return '0c'

  const plat = Math.floor(copper / 1000)
  const gold = Math.floor((copper % 1000) / 100)
  const silver = Math.floor((copper % 100) / 10)
  const copperRem = copper % 10

  const parts: string[] = []
  if (plat > 0) parts.push(`${plat.toLocaleString()}p`)
  if (gold > 0) parts.push(`${gold}g`)
  if (silver > 0) parts.push(`${silver}s`)
  if (copperRem > 0) parts.push(`${copperRem}c`)

  return parts.length > 0 ? parts.join(' ') : `${copper.toLocaleString()}c`
}

/**
 * Format wealth with breakdown of on-hand vs bank
 *
 * @param money - Copper on hand (inventory)
 * @param balance - Copper in bank
 * @returns Object with formatted strings for display
 */
export function formatWealthBreakdown(
  money: number,
  balance: number,
): {
  total: string
  onHand: string
  inBank: string
} {
  return {
    total: formatWealth(money + balance),
    onHand: formatWealth(money),
    inBank: formatWealth(balance),
  }
}

/**
 * Get wealth parts for colored display
 *
 * @param copper - The total value in copper units
 * @returns Object with individual denomination values
 */
export function getWealthParts(copper: number): {
  plat: number
  gold: number
  silver: number
  copper: number
} {
  return {
    plat: Math.floor(copper / 1000),
    gold: Math.floor((copper % 1000) / 100),
    silver: Math.floor((copper % 100) / 10),
    copper: copper % 10,
  }
}
