/**
 * Script types for inline scripting in aliases and triggers
 * Supports {if}, {repeat}, {set}, {math} syntax
 */

// token types recognized by the parser
export type ScriptTokenType =
  | 'text'
  | 'if'
  | 'else'
  | 'elseif'
  | 'endif'
  | 'repeat'
  | 'endrepeat'
  | 'set'
  | 'math'

export interface ScriptToken {
  type: ScriptTokenType
  value: string
  // for if/elseif - the condition expression
  condition?: string
  // for set - variable name and value
  varName?: string
  varValue?: string
  // for repeat - count expression
  repeatCount?: string
  // position in source for error reporting
  start: number
  end: number
}

// ast node for parsed script
export interface ASTNode {
  type: 'text' | 'if' | 'repeat' | 'set' | 'math'
  // raw text content for text nodes
  content?: string
  // for if nodes
  condition?: string
  children?: ASTNode[]
  elseChildren?: ASTNode[]
  elseifBranches?: Array<{ condition: string; children: ASTNode[] }>
  // for repeat nodes
  repeatCount?: string
  // for set nodes
  varName?: string
  varValue?: string
  // for math nodes
  expression?: string
}

export interface ParseResult {
  success: boolean
  output: string
  error?: string
  errorPosition?: number
}

// user variable storage
export interface UserVariable {
  name: string
  value: string
  updatedAt: number
}

export interface UserVariableStorage {
  version: number
  variables: Record<string, UserVariable>
}

// evaluation context passed to the evaluator
export interface EvaluationContext {
  getVariable: (name: string) => string
  setVariable: (name: string, value: string) => void
  evaluateCondition: (condition: string) => boolean
  evaluateMath: (expr: string) => number
}

// limits to prevent runaway scripts
export const SCRIPT_LIMITS = {
  MAX_REPEAT_ITERATIONS: 100,
  MAX_EXPANSION_LENGTH: 10000,
  MAX_NESTING_DEPTH: 10,
} as const
