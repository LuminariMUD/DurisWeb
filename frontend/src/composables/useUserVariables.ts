/**
 * User Variables Composable
 *
 * Provides persistent user-defined variables for use in aliases and triggers.
 * Variables are stored per account+character in localStorage.
 * Uses %varname% syntax (same as GMCP) but checked AFTER GMCP variables.
 */

import { ref, computed, watch } from 'vue'
import { useMudStore } from '@/stores/mudStore'
import { GMCP_VARIABLES } from '@/utils/gmcpVariables'
import type { UserVariable, UserVariableStorage } from '@/types/script'

const STORAGE_VERSION = 1
const STORAGE_KEY_PREFIX = 'duris_uservars_'

// global state (shared across components)
const variables = ref<Record<string, UserVariable>>({})
const isLoaded = ref(false)

// reserved variable names (gmcp variables)
const RESERVED_NAMES = new Set(
  Object.keys(GMCP_VARIABLES).map((v) => v.replace(/%/g, '').toLowerCase())
)

export function useUserVariables() {
  const store = useMudStore()

  // computed: storage key for current account + character
  const storageKey = computed(() => {
    const account = store.account
    const character = store.selectedCharacter
    if (!account) return null
    // include character in key so variables are per-character
    const charPart = character ? `_${character.toLowerCase()}` : ''
    return `${STORAGE_KEY_PREFIX}${account.toLowerCase()}${charPart}`
  })

  // =========================================================================
  // storage operations
  // =========================================================================

  /**
   * load variables from localStorage for current account+character
   */
  function loadVariables(): void {
    if (!storageKey.value) {
      variables.value = {}
      isLoaded.value = false
      return
    }

    try {
      const stored = localStorage.getItem(storageKey.value)
      if (!stored) {
        variables.value = {}
        isLoaded.value = true
        return
      }

      const data: UserVariableStorage = JSON.parse(stored)
      variables.value = data.variables || {}
      isLoaded.value = true
    } catch (error) {
      console.error('[UserVariables] failed to load:', error)
      variables.value = {}
      isLoaded.value = true
    }
  }

  /**
   * save variables to localStorage
   */
  function saveVariables(): void {
    if (!storageKey.value) return

    try {
      const data: UserVariableStorage = {
        version: STORAGE_VERSION,
        variables: variables.value,
      }
      localStorage.setItem(storageKey.value, JSON.stringify(data))
    } catch (error) {
      console.error('[UserVariables] failed to save:', error)
    }
  }

  // auto-load when storage key changes (account/character switch)
  watch(
    storageKey,
    () => {
      loadVariables()
    },
    { immediate: true }
  )

  // =========================================================================
  // variable operations
  // =========================================================================

  /**
   * get a variable value by name
   * returns empty string if not found
   */
  function getVariable(name: string): string {
    const normalized = name.toLowerCase()
    const variable = variables.value[normalized]
    return variable?.value ?? ''
  }

  /**
   * set a variable value
   * returns false if the name is reserved (gmcp variable)
   */
  function setVariable(name: string, value: string): boolean {
    const normalized = name.toLowerCase()

    // check if reserved
    if (RESERVED_NAMES.has(normalized)) {
      console.warn(`[UserVariables] cannot set reserved variable: ${name}`)
      return false
    }

    const now = Date.now()
    variables.value[normalized] = {
      name: normalized,
      value: String(value),
      updatedAt: now,
    }
    saveVariables()
    return true
  }

  /**
   * delete a variable
   */
  function deleteVariable(name: string): void {
    const normalized = name.toLowerCase()
    delete variables.value[normalized]
    saveVariables()
  }

  /**
   * get all variables
   */
  function getAllVariables(): Record<string, UserVariable> {
    return { ...variables.value }
  }

  /**
   * clear all variables
   */
  function clearAllVariables(): void {
    variables.value = {}
    saveVariables()
  }

  /**
   * check if a variable exists
   */
  function hasVariable(name: string): boolean {
    const normalized = name.toLowerCase()
    return normalized in variables.value
  }

  /**
   * check if a name is a reserved gmcp variable
   */
  function isReservedName(name: string): boolean {
    return RESERVED_NAMES.has(name.toLowerCase())
  }

  // =========================================================================
  // expansion
  // =========================================================================

  /**
   * expand user variables in a string
   * uses %varname% syntax, same as gmcp
   * should be called AFTER expandGmcpVariables() so gmcp takes precedence
   *
   * @param input - string that may contain %uservar% placeholders
   * @returns string with user variables replaced
   */
  function expandUserVariables(input: string): string {
    // match %varname% pattern
    // only match names that are NOT reserved gmcp variables
    return input.replace(/%(\w+)%/gi, (match, varName) => {
      const normalized = varName.toLowerCase()
      // skip gmcp variables (they should already be expanded)
      if (RESERVED_NAMES.has(normalized)) {
        return match
      }
      // replace with user variable value or empty string
      return getVariable(normalized)
    })
  }

  /**
   * check if a string contains any user variables (non-gmcp %var% patterns)
   */
  function hasUserVariables(input: string): boolean {
    const matches = input.match(/%(\w+)%/gi)
    if (!matches) return false

    return matches.some((match) => {
      const varName = match.slice(1, -1).toLowerCase()
      return !RESERVED_NAMES.has(varName)
    })
  }

  return {
    // state
    variables: computed(() => variables.value),
    isLoaded: computed(() => isLoaded.value),

    // storage
    loadVariables,
    saveVariables,

    // crud
    getVariable,
    setVariable,
    deleteVariable,
    getAllVariables,
    clearAllVariables,
    hasVariable,
    isReservedName,

    // expansion
    expandUserVariables,
    hasUserVariables,
  }
}
