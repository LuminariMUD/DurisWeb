/**
 * God Command Types
 * Type definitions for the god command palette system
 */

// Parameter types that map to different input components
export type GodCommandParamType =
  | 'player'          // Autocomplete from WHO list
  | 'account'         // Account autocomplete (searches MUD account files)
  | 'password'        // Password input with show/hide toggle
  | 'vnum-object'     // Object search via wiki API
  | 'vnum-mob'        // Mob search via wiki API
  | 'room-vnum'       // Manual room vnum input
  | 'text'            // Free text input
  | 'textarea'        // Multi-line text input
  | 'flag-select'     // Dropdown with predefined options
  | 'on-off'          // Toggle switch (on/off)
  | 'level'           // Level number input (1-62)
  | 'zone'            // Zone autocomplete
  | 'direction'       // Direction select (n/e/s/w/u/d)
  | 'number'          // Generic number input
  | 'setbit-property' // Setbit property dropdown (with subtable metadata)
  | 'setbit-value'    // Dynamic value input (dropdown or number based on selected property)

// Option for flag-select and other dropdown types
export interface GodCommandOption {
  value: string
  label: string
  description?: string
}

// Parameter definition
export interface GodCommandParam {
  name: string                      // Parameter identifier (used in template)
  label: string                     // Display label
  type: GodCommandParamType         // Input type
  required: boolean                 // Is required?
  placeholder?: string              // Input placeholder text
  options?: GodCommandOption[]      // For flag-select type
  defaultValue?: string | number | boolean
  validation?: {
    min?: number                    // For number types
    max?: number                    // For number types
    pattern?: string                // Regex pattern as string
    message?: string                // Validation error message
  }
}

// Command categories for grouping in palette
export type GodCommandCategory =
  | 'player'        // Player management (setbit, transfer, freeze, etc.)
  | 'teleportation' // goto, at, teleport
  | 'loading'       // load obj/mob, clone, purge
  | 'communication' // echo variants, gshout
  | 'information'   // where, users, inroom, stat, finger
  | 'zone'          // zreset, zonefile
  | 'dangerous'     // shutdown, terminate, reboot

// Category metadata for display
export interface GodCommandCategoryInfo {
  id: GodCommandCategory
  label: string
  description: string
  icon: string  // Lucide icon name
}

// Category display configuration
export const COMMAND_CATEGORIES: GodCommandCategoryInfo[] = [
  { id: 'player', label: 'Player Management', description: 'Manage player flags, status, and actions', icon: 'Users' },
  { id: 'teleportation', label: 'Teleportation', description: 'Move yourself or others', icon: 'Navigation' },
  { id: 'loading', label: 'Loading', description: 'Load objects and mobs', icon: 'Package' },
  { id: 'communication', label: 'Communication', description: 'Broadcast messages', icon: 'MessageSquare' },
  { id: 'information', label: 'Information', description: 'View game information', icon: 'Info' },
  { id: 'zone', label: 'Zone Control', description: 'Zone management commands', icon: 'Map' },
  { id: 'dangerous', label: 'Dangerous', description: 'Server control commands', icon: 'AlertTriangle' },
]

// Command execution type
export type GodCommandType = 'mud' | 'api'

// Full command definition
export interface GodCommand {
  name: string                      // Command name (e.g., "setbit")
  description: string               // Short description
  level: number                     // Minimum level (57-62)
  category: GodCommandCategory      // Category for grouping
  params: GodCommandParam[]         // Parameter definitions
  template: string                  // Command template with {param} placeholders
  aliases?: string[]                // Alternative names for fuzzy search
  dangerous?: boolean               // Show confirmation before execution
  help?: string                     // Extended help text
  type?: GodCommandType             // Execution type: 'mud' (default) or 'api'
  apiEndpoint?: string              // For type='api': backend endpoint to call
}

// Recent command entry for localStorage
export interface RecentGodCommand {
  command: string                   // Full executed command string
  timestamp: number                 // Unix timestamp (ms)
  commandName: string               // Base command name for display
}

// Current execution state
export interface GodCommandExecution {
  command: GodCommand               // Selected command
  params: Record<string, string | number | boolean>  // Parameter values
  preview: string                   // Built command string
  isValid: boolean                  // All required params filled
}

// Online player info from WHO parsing
export interface OnlinePlayer {
  name: string
  level?: number
  class?: string
  race?: string
  alignment?: string
}

// ============================================
// SETBIT PROPERTY DEFINITIONS
// ============================================
// Note: Flag VALUES (class names, race names, affect names, etc.) are loaded
// dynamically from the API via useBuilderFlags composable. Only the property
// NAMES are defined here as they map to MUD source code variables.

// Setbit char flags - ALL character properties from actset.c
// Note: Subtables for bitfield properties (pcact, aff, etc.) are loaded dynamically from API via useBuilderFlags
export const SETBIT_CHAR_FLAGS: GodCommandOption[] = [
  // char_player_data
  { value: 'sex', label: 'sex' },
  { value: 'race', label: 'race' },
  { value: 'racewar', label: 'racewar' },
  { value: 'level', label: 'level' },
  { value: 'spec', label: 'spec' },
  { value: 'home', label: 'home' },
  { value: 'orighome', label: 'orighome' },
  { value: 'origbp', label: 'origbp' },
  { value: 'age', label: 'age' },
  { value: 'weight', label: 'weight' },
  { value: 'height', label: 'height' },
  { value: 'size', label: 'size' },
  // stat_data (base)
  { value: 'str', label: 'str' },
  { value: 'dex', label: 'dex' },
  { value: 'agi', label: 'agi' },
  { value: 'con', label: 'con' },
  { value: 'pow', label: 'pow' },
  { value: 'int', label: 'int' },
  { value: 'wis', label: 'wis' },
  { value: 'cha', label: 'cha' },
  { value: 'karma', label: 'karma' },
  { value: 'luck', label: 'luck' },
  // stat_data (temporary)
  { value: 'tstr', label: 'tstr' },
  { value: 'tdex', label: 'tdex' },
  { value: 'tagi', label: 'tagi' },
  { value: 'tcon', label: 'tcon' },
  { value: 'tpow', label: 'tpow' },
  { value: 'tint', label: 'tint' },
  { value: 'twis', label: 'twis' },
  { value: 'tcha', label: 'tcha' },
  { value: 'tkarma', label: 'tkarma' },
  { value: 'tluck', label: 'tluck' },
  // char_point_data
  { value: 'mana', label: 'mana' },
  { value: 'mxmana', label: 'mxmana' },
  { value: 'hit', label: 'hit' },
  { value: 'basehit', label: 'basehit' },
  { value: 'vit', label: 'vit' },
  { value: 'mxvit', label: 'mxvit' },
  { value: 'ac', label: 'ac' },
  { value: 'copper', label: 'copper' },
  { value: 'silver', label: 'silver' },
  { value: 'gold', label: 'gold' },
  { value: 'platinum', label: 'platinum' },
  { value: 'exp', label: 'exp' },
  { value: 'hitrol', label: 'hitrol' },
  { value: 'damrol', label: 'damrol' },
  { value: 'diceno', label: 'diceno' },
  { value: 'dicesz', label: 'dicesz' },
  // char_special_data
  { value: 'pos', label: 'pos' },
  { value: 'pcact', label: 'pcact' },
  { value: 'pcact2', label: 'pcact2' },
  { value: 'carryw', label: 'carryw' },
  { value: 'carryn', label: 'carryn' },
  { value: 'timer', label: 'timer' },
  { value: 'wasin', label: 'wasin' },
  { value: 'savthr', label: 'savthr' },
  { value: 'drunk', label: 'drunk' },
  { value: 'hunger', label: 'hunger' },
  { value: 'thirst', label: 'thirst' },
  { value: 'zcord', label: 'zcord' },
  { value: 'align', label: 'align' },
  { value: 'ascnum', label: 'ascnum' },
  { value: 'aff', label: 'aff' },
  { value: 'aff2', label: 'aff2' },
  { value: 'aff3', label: 'aff3' },
  { value: 'aff4', label: 'aff4' },
  { value: 'aff5', label: 'aff5' },
  { value: 'class', label: 'class' },
  { value: 'secondary', label: 'secondary' },
  { value: 'multiclass', label: 'multiclass' },
  { value: 'npcact', label: 'npcact' },
  { value: 'npcact2', label: 'npcact2' },
  { value: 'aggro', label: 'aggro' },
  { value: 'aggro2', label: 'aggro2' },
  { value: 'aggro3', label: 'aggro3' },
  // char_skill_data
  { value: 'skill', label: 'skill' },
  { value: 'taught', label: 'taught' },
  // only.npc
  { value: 'ldir', label: 'ldir' },
  { value: 'attack', label: 'attack' },
  { value: 'val0', label: 'val0' },
  { value: 'val1', label: 'val1' },
  { value: 'val2', label: 'val2' },
  { value: 'val3', label: 'val3' },
  { value: 'val4', label: 'val4' },
  { value: 'val5', label: 'val5' },
  { value: 'val6', label: 'val6' },
  { value: 'val7', label: 'val7' },
  // only.pc
  { value: 'frags', label: 'frags' },
  { value: 'epics', label: 'epics' },
  { value: 'epic_skill_points', label: 'epic_skill_points' },
  { value: 'prestige', label: 'prestige' },
  { value: 'time_left_guild', label: 'time_left_guild' },
  { value: 'nb_left_guild', label: 'nb_left_guild' },
  { value: 'language', label: 'language' },
  { value: 'echo', label: 'echo' },
  { value: 'prompt', label: 'prompt' },
  { value: 'screensize', label: 'screensize' },
  { value: 'winvis', label: 'winvis' },
  { value: 'law_flags', label: 'law_flags' },
  { value: 'wimpy', label: 'wimpy' },
  { value: 'aggr', label: 'aggr' },
  { value: 'balc', label: 'balc' },
  { value: 'bals', label: 'bals' },
  { value: 'balg', label: 'balg' },
  { value: 'balp', label: 'balp' },
  { value: 'deaths', label: 'deaths' },
  { value: 'heaven', label: 'heaven' },
]

// Setbit room flags - room properties
export const SETBIT_ROOM_FLAGS: GodCommandOption[] = [
  { value: 'flag', label: 'Room Flag', description: 'Room flag (use flag name as value)' },
  { value: 'sect', label: 'Sector Type', description: 'Sector/terrain type' },
  { value: 'zone', label: 'Zone', description: 'Zone number' },
  { value: 'light', label: 'Light', description: 'Light level' },
  { value: 'fall', label: 'Fall Chance', description: 'Fall chance percentage' },
  { value: 'speed_current', label: 'Current Speed', description: 'Water current speed' },
  { value: 'direction_current', label: 'Current Direction', description: 'Water current direction' },
]

// Setbit obj flags - object properties
export const SETBIT_OBJ_FLAGS: GodCommandOption[] = [
  { value: 'wear', label: 'Wear Flags', description: 'Wear position flags' },
  { value: 'extra', label: 'Extra Flags', description: 'Extra flags' },
  { value: 'extra2', label: 'Extra Flags 2', description: 'Extra flags 2' },
  { value: 'aff', label: 'Affect 1', description: 'Object affect bitvector 1' },
  { value: 'aff2', label: 'Affect 2', description: 'Object affect bitvector 2' },
  { value: 'aff3', label: 'Affect 3', description: 'Object affect bitvector 3' },
  { value: 'aff4', label: 'Affect 4', description: 'Object affect bitvector 4' },
  { value: 'aff5', label: 'Affect 5', description: 'Object affect bitvector 5' },
  { value: 'val0', label: 'Value 0', description: 'Object value 0' },
  { value: 'val1', label: 'Value 1', description: 'Object value 1' },
  { value: 'val2', label: 'Value 2', description: 'Object value 2' },
  { value: 'val3', label: 'Value 3', description: 'Object value 3' },
  { value: 'val4', label: 'Value 4', description: 'Object value 4' },
  { value: 'val5', label: 'Value 5', description: 'Object value 5' },
  { value: 'val6', label: 'Value 6', description: 'Object value 6' },
  { value: 'val7', label: 'Value 7', description: 'Object value 7' },
  { value: 'type', label: 'Item Type', description: 'Object type' },
  { value: 'material', label: 'Material', description: 'Material type' },
  { value: 'weight', label: 'Weight', description: 'Object weight' },
  { value: 'price', label: 'Price', description: 'Object price' },
  { value: 'condition', label: 'Condition', description: 'Object condition' },
]

// Setbit zone flags - zone properties
export const SETBIT_ZONE_FLAGS: GodCommandOption[] = [
  { value: 'difficulty', label: 'Difficulty', description: 'Zone difficulty (1-13)' },
  { value: 'age', label: 'Age', description: 'Zone age/reset counter' },
]

// Setbit dir flags - direction/exit properties
export const SETBIT_DIR_FLAGS: GodCommandOption[] = [
  { value: 'ninfo', label: 'North Info', description: 'North exit info flags' },
  { value: 'einfo', label: 'East Info', description: 'East exit info flags' },
  { value: 'sinfo', label: 'South Info', description: 'South exit info flags' },
  { value: 'winfo', label: 'West Info', description: 'West exit info flags' },
  { value: 'uinfo', label: 'Up Info', description: 'Up exit info flags' },
  { value: 'dinfo', label: 'Down Info', description: 'Down exit info flags' },
  { value: 'nkey', label: 'North Key', description: 'North exit key vnum' },
  { value: 'ekey', label: 'East Key', description: 'East exit key vnum' },
  { value: 'skey', label: 'South Key', description: 'South exit key vnum' },
  { value: 'wkey', label: 'West Key', description: 'West exit key vnum' },
  { value: 'ukey', label: 'Up Key', description: 'Up exit key vnum' },
  { value: 'dkey', label: 'Down Key', description: 'Down exit key vnum' },
  { value: 'nroom', label: 'North Room', description: 'North exit destination room' },
  { value: 'eroom', label: 'East Room', description: 'East exit destination room' },
  { value: 'sroom', label: 'South Room', description: 'South exit destination room' },
  { value: 'wroom', label: 'West Room', description: 'West exit destination room' },
  { value: 'uroom', label: 'Up Room', description: 'Up exit destination room' },
  { value: 'droom', label: 'Down Room', description: 'Down exit destination room' },
]

// Legacy alias for backward compatibility
export const SETBIT_FLAGS = SETBIT_CHAR_FLAGS

// Direction options for direction-type params
export const DIRECTION_OPTIONS: GodCommandOption[] = [
  { value: 'north', label: 'North' },
  { value: 'east', label: 'East' },
  { value: 'south', label: 'South' },
  { value: 'west', label: 'West' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
]
