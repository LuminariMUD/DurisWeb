/**
 * Builder Flags Composable
 * Fetches flag definitions from the builder API for use in god commands
 */

import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { apiClient } from '@/services/api'
import type { GodCommandOption } from './types'

// ============================================
// STATIC OPTIONS - Small lists that never change
// ============================================

const SEX_OPTIONS: GodCommandOption[] = [
  { value: '0', label: 'Neutral' },
  { value: '1', label: 'Male' },
  { value: '2', label: 'Female' },
]

const POSITION_OPTIONS: GodCommandOption[] = [
  { value: '0', label: 'Prone' },
  { value: '1', label: 'Kneeling' },
  { value: '2', label: 'Sitting' },
  { value: '3', label: 'Standing' },
  { value: '4', label: 'Dead' },
  { value: '5', label: 'Dying' },
  { value: '6', label: 'Incapacitated' },
  { value: '7', label: 'Sleeping' },
  { value: '8', label: 'Resting' },
  { value: '9', label: 'Normal' },
]

const SIZE_OPTIONS: GodCommandOption[] = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Tiny' },
  { value: '2', label: 'Small' },
  { value: '3', label: 'Medium' },
  { value: '4', label: 'Large' },
  { value: '5', label: 'Huge' },
  { value: '6', label: 'Giant' },
  { value: '7', label: 'Gargantuan' },
]

const RACEWAR_OPTIONS: GodCommandOption[] = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Good' },
  { value: '2', label: 'Evil' },
  { value: '3', label: 'Undead' },
  { value: '4', label: 'Neutral' },
]

const HOMETOWN_OPTIONS: GodCommandOption[] = [
  { value: '1', label: 'Kimordril' },
  { value: '2', label: 'Khildarak' },
  { value: '3', label: 'Woodseer' },
  { value: '4', label: 'Ashrumite' },
  { value: '5', label: 'Faang' },
  { value: '6', label: 'Ghore' },
  { value: '7', label: 'Ugta' },
  { value: '8', label: 'Bloodstone' },
  { value: '9', label: 'Shady' },
  { value: '10', label: 'Nax' },
  { value: '11', label: 'Marigot' },
  { value: '12', label: 'Charing' },
  { value: '13', label: 'Ancient City Ruins' },
  { value: '14', label: 'Payang' },
  { value: '15', label: 'Githyanki Hometown' },
  { value: '16', label: 'Moregeeth' },
  { value: '17', label: 'Harpy' },
  { value: '18', label: 'Outpost of Ailvio' },
  { value: '19', label: 'Plane of Life' },
  { value: '20', label: 'Orog Encampment' },
]

export interface BuilderFlag {
  name: string
  value: number
  description?: string
  ansiName?: string
  shortCode?: string
  editable?: number
}

export interface BuilderFlagsResponse {
  // Classes and Races
  mobClasses: BuilderFlag[]
  mobRaces: BuilderFlag[]

  // Affected flags
  mobAffFlags: BuilderFlag[]
  mobAffFlags2: BuilderFlag[]
  mobAffFlags3: BuilderFlag[]
  mobAffFlags4: BuilderFlag[]
  mobAffFlags5: BuilderFlag[]

  // Action flags (NPC act)
  mobActFlags: BuilderFlag[]
  mobActFlags2: BuilderFlag[]

  // Aggro flags
  mobAggroFlags: BuilderFlag[]
  mobAggroFlags2: BuilderFlag[]

  // Room flags
  roomFlags: BuilderFlag[]
  sectorTypes: BuilderFlag[]
  doorFlags: BuilderFlag[]

  // Object flags
  objWearFlags: BuilderFlag[]
  objExtraFlags: BuilderFlag[]
  objExtra2Flags: BuilderFlag[]
  objectTypes: BuilderFlag[]
  objApplyTypes: BuilderFlag[]
  objMaterials: BuilderFlag[]
  objCraftsmanship: BuilderFlag[]
  objWeaponTypes: BuilderFlag[]
  objWeaponDamageTypes: BuilderFlag[]

  // Affected flags for objects (same as mob)
  mobAffected1: BuilderFlag[]
  mobAffected2: BuilderFlag[]
  mobAffected3: BuilderFlag[]
  mobAffected4: BuilderFlag[]

  // Player flags (from constant.c)
  playerFlags: BuilderFlag[]
  playerFlags2: BuilderFlag[]
}

// Convert BuilderFlag[] to GodCommandOption[]
function toOptions(flags: BuilderFlag[] | undefined): GodCommandOption[] {
  if (!flags) return []
  return flags.map(f => ({
    value: f.name,
    label: f.description || f.name,
  }))
}

export function useBuilderFlags() {
  const {
    data: flagsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['builder-flags'],
    queryFn: async () => {
      const response = await apiClient.get<BuilderFlagsResponse>('/api/builder/flags')
      return response.data
    },
    staleTime: 1000 * 60 * 60, // 1 hour - flags rarely change
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Computed options for god commands
  const classOptions = computed(() => toOptions(flagsData.value?.mobClasses))
  const raceOptions = computed(() => toOptions(flagsData.value?.mobRaces))

  const affectedFlags1 = computed(() => toOptions(flagsData.value?.mobAffFlags))
  const affectedFlags2 = computed(() => toOptions(flagsData.value?.mobAffFlags2))
  const affectedFlags3 = computed(() => toOptions(flagsData.value?.mobAffFlags3))
  const affectedFlags4 = computed(() => toOptions(flagsData.value?.mobAffFlags4))
  const affectedFlags5 = computed(() => toOptions(flagsData.value?.mobAffFlags5))

  const npcActFlags = computed(() => toOptions(flagsData.value?.mobActFlags))
  const npcActFlags2 = computed(() => toOptions(flagsData.value?.mobActFlags2))

  const aggroFlags = computed(() => toOptions(flagsData.value?.mobAggroFlags))
  const aggroFlags2 = computed(() => toOptions(flagsData.value?.mobAggroFlags2))

  // Player flags (pcact) - from constant.c player_bits/player2_bits
  const playerFlags = computed(() => toOptions(flagsData.value?.playerFlags))
  const playerFlags2 = computed(() => toOptions(flagsData.value?.playerFlags2))

  const roomFlags = computed(() => toOptions(flagsData.value?.roomFlags))
  const sectorTypes = computed(() => toOptions(flagsData.value?.sectorTypes))

  const objectExtraFlags = computed(() => toOptions(flagsData.value?.objExtraFlags))
  const objectExtra2Flags = computed(() => toOptions(flagsData.value?.objExtra2Flags))
  const objectWearFlags = computed(() => toOptions(flagsData.value?.objWearFlags))
  const objectTypes = computed(() => toOptions(flagsData.value?.objectTypes))

  // Get subtable by property name for setbit char
  function getSubtableForProperty(propertyName: string): GodCommandOption[] {
    switch (propertyName) {
      // Static options (small lists, no API needed)
      case 'sex':
        return SEX_OPTIONS
      case 'pos':
        return POSITION_OPTIONS
      case 'size':
        return SIZE_OPTIONS
      case 'racewar':
        return RACEWAR_OPTIONS
      case 'home':
      case 'orighome':
        return HOMETOWN_OPTIONS

      // Dynamic options from API
      case 'class':
      case 'secondary':
        return classOptions.value
      case 'race':
        return raceOptions.value
      case 'aff':
        return affectedFlags1.value
      case 'aff2':
        return affectedFlags2.value
      case 'aff3':
        return affectedFlags3.value
      case 'aff4':
        return affectedFlags4.value
      case 'aff5':
        return affectedFlags5.value
      case 'pcact':
        return playerFlags.value
      case 'pcact2':
        return playerFlags2.value
      case 'npcact':
        return npcActFlags.value
      case 'npcact2':
        return npcActFlags2.value
      case 'aggro':
        return aggroFlags.value
      case 'aggro2':
        return aggroFlags2.value
      case 'aggro3':
        return aggroFlags.value
      default:
        return []
    }
  }

  // Check if property needs on/off toggle
  function propertyNeedsOnOff(propertyName: string): boolean {
    const bitfieldProperties = [
      'pcact', 'pcact2',
      'aff', 'aff2', 'aff3', 'aff4', 'aff5',
      'npcact', 'npcact2',
      'aggro', 'aggro2', 'aggro3',
    ]
    return bitfieldProperties.includes(propertyName)
  }

  return {
    // Raw data
    flagsData,
    isLoading,
    error,
    refetch,

    // Computed options
    classOptions,
    raceOptions,
    affectedFlags1,
    affectedFlags2,
    affectedFlags3,
    affectedFlags4,
    affectedFlags5,
    npcActFlags,
    npcActFlags2,
    aggroFlags,
    aggroFlags2,
    playerFlags,
    playerFlags2,
    roomFlags,
    sectorTypes,
    objectExtraFlags,
    objectExtra2Flags,
    objectWearFlags,
    objectTypes,

    // Helpers
    getSubtableForProperty,
    propertyNeedsOnOff,
  }
}
