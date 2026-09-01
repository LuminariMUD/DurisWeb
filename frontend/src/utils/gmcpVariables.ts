/**
 * GMCP Variable Expansion
 *
 * Expands GMCP variables like %hp%, %mv%, %pos% in command strings.
 * Used by both aliases and triggers.
 */

import { useMudStore } from '@/stores/mudStore'

/**
 * Available GMCP variables and their descriptions
 */
export const GMCP_VARIABLES = {
  // Vitals
  '%hp%': 'Current hit points',
  '%maxhp%': 'Maximum hit points',
  '%hppct%': 'Hit points percentage (0-100)',
  '%mana%': 'Current mana',
  '%maxmana%': 'Maximum mana',
  '%manapct%': 'Mana percentage (0-100)',
  '%mv%': 'Current movement',
  '%maxmv%': 'Maximum movement',
  '%mvpct%': 'Movement percentage (0-100)',

  // Progress
  '%exp%': 'Current experience',
  '%tnl%': 'Experience to next level',

  // Money
  '%plat%': 'Platinum coins',
  '%gold%': 'Gold coins',
  '%silver%': 'Silver coins',
  '%copper%': 'Copper coins',

  // Status
  '%pos%': 'Current position (standing, sitting, etc.)',
  '%target%': 'Current combat target (empty if not fighting)',
} as const

/**
 * Expand GMCP variables in a command string.
 *
 * @param command - The command string with potential %var% placeholders
 * @returns The command with variables replaced with current values
 */
export function expandGmcpVariables(command: string): string {
  const store = useMudStore()
  const vitals = store.vitals

  // Create replacement map
  const replacements: Record<string, string | number> = {
    // Vitals
    '%hp%': vitals.hp,
    '%maxhp%': vitals.maxHp,
    '%hppct%': vitals.maxHp > 0 ? Math.round((vitals.hp / vitals.maxHp) * 100) : 0,
    '%mana%': vitals.mana,
    '%maxmana%': vitals.maxMana,
    '%manapct%': vitals.maxMana > 0 ? Math.round((vitals.mana / vitals.maxMana) * 100) : 0,
    '%mv%': vitals.move,
    '%maxmv%': vitals.maxMove,
    '%mvpct%': vitals.maxMove > 0 ? Math.round((vitals.move / vitals.maxMove) * 100) : 0,

    // Progress
    '%exp%': vitals.exp,
    '%tnl%': vitals.tnl,

    // Money
    '%plat%': vitals.platinum,
    '%gold%': vitals.gold,
    '%silver%': vitals.silver,
    '%copper%': vitals.copper,

    // Status
    '%pos%': vitals.position,
    '%target%': vitals.fighting || '',
  }

  // Replace all variables (case-insensitive)
  let result = command
  for (const [variable, value] of Object.entries(replacements)) {
    // Create case-insensitive regex
    const regex = new RegExp(variable.replace(/%/g, '%'), 'gi')
    result = result.replace(regex, String(value))
  }

  return result
}

/**
 * Check if a command contains any GMCP variables
 */
export function hasGmcpVariables(command: string): boolean {
  return /%\w+%/i.test(command)
}

/**
 * Supported comparison operators for conditions
 */
const OPERATORS = ['<=', '>=', '!=', '==', '<', '>'] as const

/**
 * Evaluate a GMCP condition string.
 *
 * Supports conditions like:
 * - "%hppct% < 50"
 * - "%mv% >= 100"
 * - "%pos% == standing"
 * - "%target% != ''"
 *
 * @param condition - The condition string to evaluate
 * @returns true if condition is met, false otherwise. Returns true if condition is empty/invalid.
 */
export function evaluateCondition(condition: string | undefined): boolean {
  if (!condition || !condition.trim()) {
    return true // No condition = always true
  }

  // First expand all GMCP variables
  const expanded = expandGmcpVariables(condition.trim())

  // Find the operator
  let operator: string | null = null
  let operatorIndex = -1

  for (const op of OPERATORS) {
    const idx = expanded.indexOf(op)
    if (idx !== -1 && (operatorIndex === -1 || idx < operatorIndex)) {
      operator = op
      operatorIndex = idx
    }
  }

  if (!operator || operatorIndex === -1) {
    console.warn('[GMCP] Invalid condition - no operator found:', condition)
    return true // Invalid condition = don't block
  }

  // Extract left and right operands
  const left = expanded.substring(0, operatorIndex).trim()
  const right = expanded.substring(operatorIndex + operator.length).trim()

  // Try to parse as numbers first
  const leftNum = parseFloat(left)
  const rightNum = parseFloat(right)
  const isNumeric = !isNaN(leftNum) && !isNaN(rightNum)

  // Evaluate based on operator
  switch (operator) {
    case '<':
      return isNumeric ? leftNum < rightNum : left < right
    case '>':
      return isNumeric ? leftNum > rightNum : left > right
    case '<=':
      return isNumeric ? leftNum <= rightNum : left <= right
    case '>=':
      return isNumeric ? leftNum >= rightNum : left >= right
    case '==':
      return isNumeric ? leftNum === rightNum : left === right
    case '!=':
      return isNumeric ? leftNum !== rightNum : left !== right
    default:
      return true
  }
}

/**
 * Validate a condition string syntax
 * @returns Error message if invalid, empty string if valid
 */
export function validateCondition(condition: string | undefined): string {
  if (!condition || !condition.trim()) {
    return '' // Empty is valid (optional)
  }

  const trimmed = condition.trim()

  // Check for at least one GMCP variable
  if (!hasGmcpVariables(trimmed)) {
    return 'Condition must contain at least one GMCP variable (e.g., %hp%)'
  }

  // Check for an operator
  const hasOperator = OPERATORS.some((op) => trimmed.includes(op))
  if (!hasOperator) {
    return 'Condition must contain a comparison operator (<, >, <=, >=, ==, !=)'
  }

  return ''
}
