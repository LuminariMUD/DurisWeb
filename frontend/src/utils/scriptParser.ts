/**
 * Script Parser
 *
 * Parses and evaluates inline script syntax for aliases and triggers.
 * Supports: {if}, {else}, {elseif}, {endif}, {repeat}, {/repeat}, {set}, {math}
 */

import type { ScriptToken, ASTNode, EvaluationContext, ParseResult } from '@/types/script'
import { SCRIPT_LIMITS } from '@/types/script'

// =========================================================================
// tokenizer
// =========================================================================

/**
 * tokenize a script string into tokens
 */
export function tokenize(input: string): ScriptToken[] {
  const tokens: ScriptToken[] = []
  let pos = 0

  while (pos < input.length) {
    // look for script block start
    const blockStart = input.indexOf('{', pos)

    if (blockStart === -1) {
      // no more blocks, rest is text
      if (pos < input.length) {
        tokens.push({
          type: 'text',
          value: input.substring(pos),
          start: pos,
          end: input.length,
        })
      }
      break
    }

    // add text before block
    if (blockStart > pos) {
      tokens.push({
        type: 'text',
        value: input.substring(pos, blockStart),
        start: pos,
        end: blockStart,
      })
    }

    // find block end
    const blockEnd = findBlockEnd(input, blockStart)
    if (blockEnd === -1) {
      // unclosed block, treat as text
      tokens.push({
        type: 'text',
        value: input.substring(blockStart),
        start: blockStart,
        end: input.length,
      })
      break
    }

    // extract block content
    const blockContent = input.substring(blockStart + 1, blockEnd)
    const token = parseBlockToken(blockContent, blockStart, blockEnd + 1)

    if (token) {
      tokens.push(token)
    } else {
      // unknown block, treat as text
      tokens.push({
        type: 'text',
        value: input.substring(blockStart, blockEnd + 1),
        start: blockStart,
        end: blockEnd + 1,
      })
    }

    pos = blockEnd + 1
  }

  return tokens
}

/**
 * find matching closing brace, handling nested braces
 */
function findBlockEnd(input: string, start: number): number {
  let depth = 0
  for (let i = start; i < input.length; i++) {
    if (input[i] === '{') {
      depth++
    } else if (input[i] === '}') {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/**
 * parse a block content into a token
 */
function parseBlockToken(content: string, start: number, end: number): ScriptToken | null {
  const trimmed = content.trim()
  const lower = trimmed.toLowerCase()

  // {if condition} or {if } (empty condition)
  if (lower === 'if' || lower.startsWith('if ')) {
    return {
      type: 'if',
      value: trimmed,
      condition: lower === 'if' ? '' : trimmed.substring(3).trim(),
      start,
      end,
    }
  }

  // {elseif condition}
  if (lower.startsWith('elseif ')) {
    return {
      type: 'elseif',
      value: trimmed,
      condition: trimmed.substring(7).trim(),
      start,
      end,
    }
  }

  // {else}
  if (lower === 'else') {
    return {
      type: 'else',
      value: trimmed,
      start,
      end,
    }
  }

  // {endif}
  if (lower === 'endif') {
    return {
      type: 'endif',
      value: trimmed,
      start,
      end,
    }
  }

  // {repeat N}
  if (lower.startsWith('repeat ')) {
    return {
      type: 'repeat',
      value: trimmed,
      repeatCount: trimmed.substring(7).trim(),
      start,
      end,
    }
  }

  // {/repeat}
  if (lower === '/repeat') {
    return {
      type: 'endrepeat',
      value: trimmed,
      start,
      end,
    }
  }

  // {set varname value}
  if (lower.startsWith('set ')) {
    const setContent = trimmed.substring(4).trim()
    const spaceIdx = setContent.indexOf(' ')
    if (spaceIdx > 0) {
      return {
        type: 'set',
        value: trimmed,
        varName: setContent.substring(0, spaceIdx),
        varValue: setContent.substring(spaceIdx + 1).trim(),
        start,
        end,
      }
    }
    // set without value = clear
    return {
      type: 'set',
      value: trimmed,
      varName: setContent,
      varValue: '',
      start,
      end,
    }
  }

  // {math expression}
  if (lower.startsWith('math ')) {
    return {
      type: 'math',
      value: trimmed.substring(5).trim(),
      start,
      end,
    }
  }

  return null
}

// =========================================================================
// parser (tokens -> ast)
// =========================================================================

/**
 * parse tokens into ast
 */
export function parse(tokens: ScriptToken[]): ASTNode[] {
  const result: ASTNode[] = []
  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]
    if (!token) break

    switch (token.type) {
      case 'text':
        result.push({ type: 'text', content: token.value })
        i++
        break

      case 'if': {
        const { node, nextIndex } = parseIfBlock(tokens, i)
        result.push(node)
        i = nextIndex
        break
      }

      case 'repeat': {
        const { node, nextIndex } = parseRepeatBlock(tokens, i)
        result.push(node)
        i = nextIndex
        break
      }

      case 'set':
        result.push({
          type: 'set',
          varName: token.varName ?? '',
          varValue: token.varValue ?? '',
        })
        i++
        break

      case 'math':
        result.push({
          type: 'math',
          expression: token.value,
        })
        i++
        break

      default:
        // unexpected token (else, endif, endrepeat outside of block)
        // treat as text
        result.push({ type: 'text', content: `{${token.value}}` })
        i++
    }
  }

  return result
}

/**
 * parse an if block starting at index
 */
function parseIfBlock(
  tokens: ScriptToken[],
  start: number
): { node: ASTNode; nextIndex: number } {
  const ifToken = tokens[start]
  const node: ASTNode = {
    type: 'if',
    condition: ifToken?.condition ?? '',
    children: [],
    elseifBranches: [],
    elseChildren: [],
  }

  let i = start + 1
  let currentBranch: ASTNode[] = node.children!

  while (i < tokens.length) {
    const token = tokens[i]
    if (!token) break

    if (token.type === 'endif') {
      return { node, nextIndex: i + 1 }
    }

    if (token.type === 'else') {
      currentBranch = node.elseChildren!
      i++
      continue
    }

    if (token.type === 'elseif') {
      const elseifBranch = { condition: token.condition ?? '', children: [] as ASTNode[] }
      node.elseifBranches!.push(elseifBranch)
      currentBranch = elseifBranch.children
      i++
      continue
    }

    // nested content
    if (token.type === 'text') {
      currentBranch.push({ type: 'text', content: token.value })
      i++
    } else if (token.type === 'if') {
      const { node: nested, nextIndex } = parseIfBlock(tokens, i)
      currentBranch.push(nested)
      i = nextIndex
    } else if (token.type === 'repeat') {
      const { node: nested, nextIndex } = parseRepeatBlock(tokens, i)
      currentBranch.push(nested)
      i = nextIndex
    } else if (token.type === 'set') {
      currentBranch.push({
        type: 'set',
        varName: token.varName ?? '',
        varValue: token.varValue ?? '',
      })
      i++
    } else if (token.type === 'math') {
      currentBranch.push({
        type: 'math',
        expression: token.value,
      })
      i++
    } else {
      // unknown, skip
      i++
    }
  }

  // unclosed if, return what we have
  console.warn('[ScriptParser] unclosed {if} block')
  return { node, nextIndex: i }
}

/**
 * parse a repeat block starting at index
 */
function parseRepeatBlock(
  tokens: ScriptToken[],
  start: number
): { node: ASTNode; nextIndex: number } {
  const repeatToken = tokens[start]
  const node: ASTNode = {
    type: 'repeat',
    repeatCount: repeatToken?.repeatCount ?? '1',
    children: [],
  }

  let i = start + 1

  while (i < tokens.length) {
    const token = tokens[i]
    if (!token) break

    if (token.type === 'endrepeat') {
      return { node, nextIndex: i + 1 }
    }

    // nested content
    if (token.type === 'text') {
      node.children!.push({ type: 'text', content: token.value })
      i++
    } else if (token.type === 'if') {
      const { node: nested, nextIndex } = parseIfBlock(tokens, i)
      node.children!.push(nested)
      i = nextIndex
    } else if (token.type === 'repeat') {
      const { node: nested, nextIndex } = parseRepeatBlock(tokens, i)
      node.children!.push(nested)
      i = nextIndex
    } else if (token.type === 'set') {
      node.children!.push({
        type: 'set',
        varName: token.varName ?? '',
        varValue: token.varValue ?? '',
      })
      i++
    } else if (token.type === 'math') {
      node.children!.push({
        type: 'math',
        expression: token.value,
      })
      i++
    } else {
      // unknown, skip
      i++
    }
  }

  // unclosed repeat, return what we have
  console.warn('[ScriptParser] unclosed {repeat} block')
  return { node, nextIndex: i }
}

// =========================================================================
// evaluator
// =========================================================================

/**
 * evaluate ast and return expanded string
 */
export function evaluate(ast: ASTNode[], context: EvaluationContext, depth = 0): string {
  if (depth > SCRIPT_LIMITS.MAX_NESTING_DEPTH) {
    console.warn('[ScriptParser] max nesting depth exceeded')
    return ''
  }

  let result = ''

  for (const node of ast) {
    switch (node.type) {
      case 'text':
        result += node.content || ''
        break

      case 'if':
        result += evaluateIf(node, context, depth)
        break

      case 'repeat':
        result += evaluateRepeat(node, context, depth)
        break

      case 'set':
        if (node.varName) {
          // evaluate the value (may contain {math})
          let value = node.varValue || ''
          // check if value contains nested math
          if (value.includes('{math ')) {
            const mathMatch = value.match(/\{math\s+([^}]+)\}/i)
            if (mathMatch && mathMatch[1]) {
              const mathResult = context.evaluateMath(mathMatch[1])
              value = value.replace(mathMatch[0], String(mathResult))
            }
          }
          context.setVariable(node.varName, value)
        }
        break

      case 'math':
        if (node.expression) {
          result += String(context.evaluateMath(node.expression))
        }
        break
    }

    // check expansion length
    if (result.length > SCRIPT_LIMITS.MAX_EXPANSION_LENGTH) {
      console.warn('[ScriptParser] max expansion length exceeded')
      return result.substring(0, SCRIPT_LIMITS.MAX_EXPANSION_LENGTH)
    }
  }

  return result
}

/**
 * evaluate an if node
 */
function evaluateIf(node: ASTNode, context: EvaluationContext, depth: number): string {
  // check main condition
  if (node.condition && context.evaluateCondition(node.condition)) {
    return evaluate(node.children || [], context, depth + 1)
  }

  // check elseif branches
  for (const branch of node.elseifBranches || []) {
    if (context.evaluateCondition(branch.condition)) {
      return evaluate(branch.children, context, depth + 1)
    }
  }

  // else branch
  return evaluate(node.elseChildren || [], context, depth + 1)
}

/**
 * evaluate a repeat node
 */
function evaluateRepeat(node: ASTNode, context: EvaluationContext, depth: number): string {
  let count = parseInt(node.repeatCount || '1', 10)

  if (isNaN(count) || count < 0) {
    count = 0
  }

  if (count > SCRIPT_LIMITS.MAX_REPEAT_ITERATIONS) {
    console.warn(`[ScriptParser] repeat capped at ${SCRIPT_LIMITS.MAX_REPEAT_ITERATIONS}`)
    count = SCRIPT_LIMITS.MAX_REPEAT_ITERATIONS
  }

  let result = ''
  for (let i = 0; i < count; i++) {
    result += evaluate(node.children || [], context, depth + 1)

    // check expansion length
    if (result.length > SCRIPT_LIMITS.MAX_EXPANSION_LENGTH) {
      console.warn('[ScriptParser] max expansion length exceeded in repeat')
      return result.substring(0, SCRIPT_LIMITS.MAX_EXPANSION_LENGTH)
    }
  }

  return result
}

// =========================================================================
// math expression evaluator
// =========================================================================

/**
 * evaluate a math expression
 * supports: +, -, *, /, % (modulo), parentheses
 *
 * uses a simple recursive descent parser for safety (no eval)
 */
export function evaluateMathExpression(expr: string): number {
  const tokens = tokenizeMath(expr)
  let pos = 0

  function peek(): string | undefined {
    return tokens[pos]
  }

  function consume(): string {
    return tokens[pos++] ?? ''
  }

  function parseExpression(): number {
    return parseAddSub()
  }

  function parseAddSub(): number {
    let left = parseMulDiv()

    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseMulDiv()
      if (op === '+') {
        left = left + right
      } else {
        left = left - right
      }
    }

    return left
  }

  function parseMulDiv(): number {
    let left = parseUnary()

    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume()
      const right = parseUnary()
      if (op === '*') {
        left = left * right
      } else if (op === '/') {
        left = right !== 0 ? left / right : 0
      } else {
        left = right !== 0 ? left % right : 0
      }
    }

    return left
  }

  function parseUnary(): number {
    if (peek() === '-') {
      consume()
      return -parsePrimary()
    }
    if (peek() === '+') {
      consume()
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    const token = peek()

    if (token === '(') {
      consume()
      const result = parseExpression()
      if (peek() === ')') {
        consume()
      }
      return result
    }

    // number
    const num = parseFloat(consume() || '0')
    return isNaN(num) ? 0 : num
  }

  try {
    return parseExpression()
  } catch {
    console.warn('[ScriptParser] math expression error:', expr)
    return 0
  }
}

/**
 * tokenize a math expression
 */
function tokenizeMath(expr: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < expr.length) {
    const char = expr[i]
    if (!char) break

    // skip whitespace
    if (/\s/.test(char)) {
      i++
      continue
    }

    // operators and parens
    if ('+-*/%()'.includes(char)) {
      tokens.push(char)
      i++
      continue
    }

    // number (including decimals)
    if (/[\d.]/.test(char)) {
      let num = ''
      while (i < expr.length) {
        const c = expr[i]
        if (c && /[\d.]/.test(c)) {
          num += c
          i++
        } else {
          break
        }
      }
      tokens.push(num)
      continue
    }

    // unknown char, skip
    i++
  }

  return tokens
}

// =========================================================================
// helper for quick check
// =========================================================================

/**
 * check if a string contains any script blocks
 */
export function hasScriptBlocks(input: string): boolean {
  return /\{(if|repeat|set|math)[\s}]/i.test(input)
}

/**
 * parse and evaluate a script string
 */
export function parseAndEvaluate(input: string, context: EvaluationContext): ParseResult {
  try {
    const tokens = tokenize(input)
    const ast = parse(tokens)
    const output = evaluate(ast, context)
    return { success: true, output }
  } catch (error) {
    console.error('[ScriptParser] error:', error)
    return {
      success: false,
      output: input,
      error: error instanceof Error ? error.message : 'unknown error',
    }
  }
}
