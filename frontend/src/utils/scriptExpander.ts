/**
 * Script Expander
 *
 * Orchestrates script expansion for aliases and triggers.
 * Integrates user variables, script parsing, and evaluation.
 *
 * Usage:
 *   import { expandScript } from '@/utils/scriptExpander'
 *   const result = expandScript(input)
 */

import { useUserVariables } from '@/composables/useUserVariables'
import { evaluateCondition } from '@/utils/gmcpVariables'
import {
  tokenize,
  parse,
  evaluate,
  evaluateMathExpression,
  hasScriptBlocks,
} from '@/utils/scriptParser'
import type { EvaluationContext } from '@/types/script'

/**
 * expand all script constructs in a string
 *
 * call AFTER:
 *   1. expandParameters() - $1, $*, etc.
 *   2. expandGmcpVariables() - %hp%, %mana%, etc.
 *
 * this function handles:
 *   1. user variable expansion - %uservar%
 *   2. script blocks - {if}, {repeat}, {set}, {math}
 *
 * @param input - the string to expand
 * @returns the expanded string
 */
export function expandScript(input: string): string {
  if (!input) return input

  const { getVariable, setVariable, expandUserVariables } = useUserVariables()

  // step 1: expand user variables first
  // this allows {if %myvar% == 1} to work
  let result = expandUserVariables(input)

  // step 2: check if there are any script blocks
  // quick check to avoid parsing overhead for simple strings
  if (!hasScriptBlocks(result)) {
    return result
  }

  // step 3: tokenize and parse
  try {
    const tokens = tokenize(result)
    const ast = parse(tokens)

    // step 4: create evaluation context
    const context: EvaluationContext = {
      getVariable: (name: string) => {
        // get from user variables
        return getVariable(name)
      },
      setVariable: (name: string, value: string) => {
        // set user variable
        setVariable(name, value)
      },
      evaluateCondition: (condition: string) => {
        // expand user variables in condition first
        const expanded = expandUserVariables(condition)
        // then evaluate using gmcp condition evaluator
        return evaluateCondition(expanded)
      },
      evaluateMath: (expr: string) => {
        // expand user variables in expression first
        const expanded = expandUserVariables(expr)
        return evaluateMathExpression(expanded)
      },
    }

    // step 5: evaluate ast
    result = evaluate(ast, context)
  } catch (error) {
    console.error('[ScriptExpander] error:', error)
    // return partially expanded on error
  }

  return result
}

/**
 * check if a string contains script syntax
 * useful for ui hints or optimization
 */
export function containsScript(input: string): boolean {
  if (!input) return false

  // check for user variables (non-gmcp %var%)
  const { hasUserVariables } = useUserVariables()
  if (hasUserVariables(input)) return true

  // check for script blocks
  return hasScriptBlocks(input)
}

/**
 * validate script syntax without executing
 * returns error message or empty string if valid
 */
export function validateScript(input: string): string {
  if (!input) return ''

  // check for unclosed blocks
  const openIf = (input.match(/\{if\s/gi) || []).length
  const closeIf = (input.match(/\{endif\}/gi) || []).length
  if (openIf !== closeIf) {
    return `mismatched {if}/{endif}: ${openIf} opens, ${closeIf} closes`
  }

  const openRepeat = (input.match(/\{repeat\s/gi) || []).length
  const closeRepeat = (input.match(/\{\/repeat\}/gi) || []).length
  if (openRepeat !== closeRepeat) {
    return `mismatched {repeat}/{/repeat}: ${openRepeat} opens, ${closeRepeat} closes`
  }

  // try parsing to catch other errors
  try {
    const tokens = tokenize(input)
    parse(tokens)
  } catch (error) {
    return error instanceof Error ? error.message : 'syntax error'
  }

  return ''
}
