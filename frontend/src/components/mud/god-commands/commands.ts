/**
 * God Command Definitions
 * All god commands with their parameters and templates
 *
 * Level Requirements:
 * - Level 57: AVATAR
 * - Level 58: IMMORTAL
 * - Level 59: LESSER GOD
 * - Level 60: GREATER GOD
 * - Level 61: FORGER
 * - Level 62: OVERLORD
 */

import type { GodCommand } from './types'
import {
  SETBIT_CHAR_FLAGS,
  SETBIT_ROOM_FLAGS,
  SETBIT_OBJ_FLAGS,
  SETBIT_ZONE_FLAGS,
  SETBIT_DIR_FLAGS,
  DIRECTION_OPTIONS,
} from './types'

export const GOD_COMMANDS: GodCommand[] = [
  // ============================================
  // PLAYER MANAGEMENT
  // ============================================

  // ============================================
  // SETBIT COMMANDS
  // ============================================

  {
    name: 'setbit char',
    description: 'Modify character stats, flags, and properties',
    level: 60,
    category: 'player',
    params: [
      {
        name: 'target',
        label: 'Character',
        type: 'player',
        required: true,
        placeholder: 'Player or mob name',
      },
      {
        name: 'flag',
        label: 'Property',
        type: 'setbit-property',
        required: true,
        options: SETBIT_CHAR_FLAGS,
      },
      { name: 'value', label: 'Value', type: 'setbit-value', required: true },
      { name: 'onoff', label: 'On/Off', type: 'on-off', required: false },
    ],
    template: 'setbit char {target} {flag} {value} {onoff}',
    aliases: ['setbit c'],
  },

  {
    name: 'setpass',
    description: 'Change account password',
    level: 60,
    category: 'player',
    type: 'api',
    apiEndpoint: '/api/admin/god/reset-password',
    params: [
      {
        name: 'accountName',
        label: 'Account',
        type: 'account',
        required: true,
        placeholder: 'Account name',
      },
      {
        name: 'newPassword',
        label: 'New Password',
        type: 'password',
        required: true,
        placeholder: 'Minimum 6 characters',
      },
    ],
    template: 'setpass {accountName}',
    dangerous: true,
    help: 'Changes the password for a MUD account. This is a web admin action, not a MUD command.',
    aliases: ['resetpass', 'passwd'],
  },

  {
    name: 'setbit room',
    description: 'Modify room flags, sector type, and properties',
    level: 60,
    category: 'zone',
    params: [
      {
        name: 'room',
        label: 'Room',
        type: 'text',
        required: true,
        placeholder: 'Room vnum or "here"',
      },
      {
        name: 'flag',
        label: 'Property',
        type: 'flag-select',
        required: true,
        options: SETBIT_ROOM_FLAGS,
      },
      {
        name: 'value',
        label: 'Value',
        type: 'text',
        required: true,
        placeholder: 'Value (e.g. "DARK on" or sector name)',
      },
    ],
    template: 'setbit room {room} {flag} {value}',
    aliases: ['setbit r'],
    help: 'For flags: "FLAGNAME on/off". For sect: sector name.',
  },

  {
    name: 'setbit obj',
    description: 'Modify object properties and flags',
    level: 60,
    category: 'loading',
    params: [
      {
        name: 'object',
        label: 'Object',
        type: 'text',
        required: true,
        placeholder: 'Object keyword',
      },
      {
        name: 'flag',
        label: 'Property',
        type: 'flag-select',
        required: true,
        options: SETBIT_OBJ_FLAGS,
      },
      { name: 'value', label: 'Value', type: 'text', required: true, placeholder: 'Value' },
    ],
    template: 'setbit obj {object} {flag} {value}',
    aliases: ['setbit o'],
    help: 'Sets object properties like wear flags, extra flags, values, or material.',
  },

  {
    name: 'setbit zone',
    description: 'Modify zone difficulty and properties',
    level: 61,
    category: 'zone',
    params: [
      { name: 'zone', label: 'Zone', type: 'number', required: true, placeholder: 'Zone number' },
      {
        name: 'flag',
        label: 'Property',
        type: 'flag-select',
        required: true,
        options: SETBIT_ZONE_FLAGS,
      },
      { name: 'value', label: 'Value', type: 'number', required: true, placeholder: 'Value' },
    ],
    template: 'setbit zone {zone} {flag} {value}',
    aliases: ['setbit z'],
    help: 'Sets zone properties like difficulty (1-13) or age.',
  },

  {
    name: 'setbit dir',
    description: 'Modify exit/direction properties',
    level: 60,
    category: 'zone',
    params: [
      { name: 'room', label: 'Room', type: 'text', required: true, placeholder: 'Room vnum' },
      {
        name: 'flag',
        label: 'Direction Property',
        type: 'flag-select',
        required: true,
        options: SETBIT_DIR_FLAGS,
      },
      { name: 'value', label: 'Value', type: 'text', required: true, placeholder: 'Value' },
    ],
    template: 'setbit dir {room} {flag} {value}',
    aliases: ['setbit d'],
    help: 'Sets exit/direction properties like exit info flags, key vnums, or destination rooms.',
  },

  {
    name: 'transfer',
    description: 'Transfer a player to your location',
    level: 58,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name or "all"',
      },
    ],
    template: 'transfer {player}',
    aliases: ['trans'],
  },

  {
    name: 'freeze',
    description: 'Freeze a player, preventing actions',
    level: 59,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name',
      },
    ],
    template: 'freeze {player}',
  },

  {
    name: 'restore',
    description: 'Restore HP, mana, and moves to maximum',
    level: 60,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: false,
        placeholder: 'Player name or "all" (default: self)',
      },
    ],
    template: 'restore {player}',
  },

  {
    name: 'whois',
    description: 'Get detailed information about a player',
    level: 59,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name',
      },
    ],
    template: 'whois {player}',
    aliases: ['stat'],
  },

  {
    name: 'silence',
    description: 'Prevent player from using channels',
    level: 57,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name',
      },
    ],
    template: 'silence {player}',
    aliases: ['mute'],
  },

  {
    name: 'advance',
    description: 'Advance a player to a specific level',
    level: 60,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name',
      },
      {
        name: 'level',
        label: 'Level',
        type: 'level',
        required: true,
        placeholder: '1-56',
        validation: { min: 1, max: 56 },
      },
    ],
    template: 'advance {player} {level}',
    dangerous: true,
  },

  {
    name: 'force',
    description: 'Force a player to execute a command',
    level: 60,
    category: 'player',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: true,
        placeholder: 'Player name or "all"',
      },
      {
        name: 'command',
        label: 'Command',
        type: 'text',
        required: true,
        placeholder: 'Command to execute',
      },
    ],
    template: 'force {player} {command}',
    dangerous: true,
  },

  {
    name: 'setattr',
    description: 'Set player attributes (str, dex, etc.)',
    level: 59,
    category: 'player',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      {
        name: 'attribute',
        label: 'Attribute',
        type: 'flag-select',
        required: true,
        options: [
          { value: 'str', label: 'Strength' },
          { value: 'int', label: 'Intelligence' },
          { value: 'wis', label: 'Wisdom' },
          { value: 'dex', label: 'Dexterity' },
          { value: 'con', label: 'Constitution' },
          { value: 'cha', label: 'Charisma' },
        ],
      },
      {
        name: 'value',
        label: 'Value',
        type: 'number',
        required: true,
        validation: { min: 1, max: 25 },
      },
    ],
    template: 'setattr {player} {attribute} {value}',
  },

  {
    name: 'rename',
    description: 'Rename a player character',
    level: 58,
    category: 'player',
    params: [
      { name: 'oldname', label: 'Current Name', type: 'player', required: true },
      {
        name: 'newname',
        label: 'New Name',
        type: 'text',
        required: true,
        placeholder: 'New character name',
      },
    ],
    template: 'rename {oldname} {newname}',
    dangerous: true,
  },

  {
    name: 'newbsu',
    description: 'Apply newbie spell-ups to a player',
    level: 59,
    category: 'player',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'newbsu {player}',
    aliases: ['spellup'],
  },

  {
    name: 'newbsa',
    description: 'Apply newbie spell-ups to all in room',
    level: 59,
    category: 'player',
    params: [],
    template: 'newbsa',
    aliases: ['spellupall'],
  },

  // ============================================
  // TELEPORTATION
  // ============================================

  {
    name: 'goto',
    description: 'Teleport to room, player, or mob',
    level: 57,
    category: 'teleportation',
    params: [
      {
        name: 'target',
        label: 'Target',
        type: 'text',
        required: true,
        placeholder: 'Room vnum, player name, or mob keyword',
      },
    ],
    template: 'goto {target}',
  },

  {
    name: 'at',
    description: 'Execute a command at a location',
    level: 57,
    category: 'teleportation',
    params: [
      {
        name: 'location',
        label: 'Location',
        type: 'text',
        required: true,
        placeholder: 'Room vnum or player name',
      },
      {
        name: 'command',
        label: 'Command',
        type: 'text',
        required: true,
        placeholder: 'Command to execute',
      },
    ],
    template: 'at {location} {command}',
  },

  {
    name: 'teleport',
    description: 'Teleport a player to a location',
    level: 59,
    category: 'teleportation',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      {
        name: 'location',
        label: 'Location',
        type: 'text',
        required: true,
        placeholder: 'Room vnum or "recall"',
      },
    ],
    template: 'teleport {player} {location}',
  },

  {
    name: 'sethome',
    description: "Set a player's home location",
    level: 59,
    category: 'teleportation',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      { name: 'room', label: 'Room Vnum', type: 'room-vnum', required: true },
    ],
    template: 'sethome {player} {room}',
  },

  // ============================================
  // LOADING
  // ============================================

  {
    name: 'load obj',
    description: 'Load an object into inventory',
    level: 59,
    category: 'loading',
    params: [
      {
        name: 'vnum',
        label: 'Object',
        type: 'vnum-object',
        required: true,
        placeholder: 'Object vnum or search',
      },
    ],
    template: 'load obj {vnum}',
    aliases: ['oload'],
  },

  {
    name: 'load mob',
    description: 'Load a mob into the room',
    level: 59,
    category: 'loading',
    params: [
      {
        name: 'vnum',
        label: 'Mob',
        type: 'vnum-mob',
        required: true,
        placeholder: 'Mob vnum or search',
      },
    ],
    template: 'load mob {vnum}',
    aliases: ['mload'],
  },

  {
    name: 'clone',
    description: 'Clone an existing object',
    level: 59,
    category: 'loading',
    params: [
      {
        name: 'target',
        label: 'Object',
        type: 'text',
        required: true,
        placeholder: 'Object keyword',
      },
    ],
    template: 'clone {target}',
  },

  {
    name: 'purge',
    description: 'Remove objects or mobs from room',
    level: 59,
    category: 'loading',
    params: [
      {
        name: 'target',
        label: 'Target',
        type: 'text',
        required: false,
        placeholder: 'Target keyword (empty = purge all)',
      },
    ],
    template: 'purge {target}',
  },

  // ============================================
  // COMMUNICATION
  // ============================================

  {
    name: 'echo',
    description: 'Echo message to everyone in room',
    level: 57,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to echo',
      },
    ],
    template: 'echo {message}',
  },

  {
    name: 'echoa',
    description: 'Echo message to entire area',
    level: 59,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to echo',
      },
    ],
    template: 'echoa {message}',
  },

  {
    name: 'echog',
    description: 'Echo message to all gods',
    level: 59,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to gods',
      },
    ],
    template: 'echog {message}',
    aliases: ['godecho'],
  },

  {
    name: 'echoz',
    description: 'Echo message to entire zone',
    level: 59,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to zone',
      },
    ],
    template: 'echoz {message}',
  },

  {
    name: 'echot',
    description: 'Echo message to a specific player',
    level: 59,
    category: 'communication',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to player',
      },
    ],
    template: 'echot {player} {message}',
  },

  {
    name: 'gshout',
    description: 'Global shout visible to all',
    level: 57,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to shout',
      },
    ],
    template: 'gshout {message}',
    aliases: ['gossip'],
  },

  {
    name: 'ptell',
    description: 'Private tell to immortals',
    level: 57,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Message to immortals',
      },
    ],
    template: 'ptell {message}',
  },

  // ============================================
  // INFORMATION
  // ============================================

  {
    name: 'where',
    description: 'Show player/mob locations',
    level: 58,
    category: 'information',
    params: [
      {
        name: 'target',
        label: 'Target',
        type: 'text',
        required: false,
        placeholder: 'Player/mob name (empty = all players)',
      },
    ],
    template: 'where {target}',
  },

  {
    name: 'users',
    description: 'Display all connected users',
    level: 57,
    category: 'information',
    params: [],
    template: 'users',
  },

  {
    name: 'inroom',
    description: 'List all players in current room',
    level: 60,
    category: 'information',
    params: [],
    template: 'inroom',
  },

  {
    name: 'finger',
    description: 'Get finger information about a player',
    level: 57,
    category: 'information',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'finger {player}',
  },

  {
    name: 'levels',
    description: 'Display level progression info',
    level: 59,
    category: 'information',
    params: [],
    template: 'levels',
  },

  {
    name: 'lookup',
    description: 'Look up information in game databases',
    level: 58,
    category: 'information',
    params: [
      { name: 'query', label: 'Query', type: 'text', required: true, placeholder: 'Search query' },
    ],
    template: 'lookup {query}',
  },

  {
    name: 'which',
    description: 'Find objects in the game world',
    level: 58,
    category: 'information',
    params: [
      { name: 'object', label: 'Object', type: 'text', required: true, placeholder: 'Object name' },
    ],
    template: 'which {object}',
  },

  // ============================================
  // ZONE CONTROL
  // ============================================

  {
    name: 'zreset',
    description: 'Reset a zone to initial state',
    level: 60,
    category: 'zone',
    params: [
      {
        name: 'zone',
        label: 'Zone Number',
        type: 'number',
        required: true,
        placeholder: 'Zone number',
      },
    ],
    template: 'zreset {zone}',
  },

  {
    name: 'makeexit',
    description: 'Create an exit between rooms',
    level: 60,
    category: 'zone',
    params: [
      {
        name: 'direction',
        label: 'Direction',
        type: 'direction',
        required: true,
        options: DIRECTION_OPTIONS,
      },
      { name: 'room', label: 'Target Room', type: 'room-vnum', required: true },
    ],
    template: 'makeexit {direction} {room}',
  },

  {
    name: 'secret',
    description: 'Manage secret doors',
    level: 59,
    category: 'zone',
    params: [
      {
        name: 'direction',
        label: 'Direction',
        type: 'direction',
        required: true,
        options: DIRECTION_OPTIONS,
      },
    ],
    template: 'secret {direction}',
  },

  // ============================================
  // DANGEROUS
  // ============================================

  {
    name: 'shutdown',
    description: 'Shutdown the MUD server',
    level: 61,
    category: 'dangerous',
    params: [],
    template: 'shutdown',
    dangerous: true,
    help: 'Gracefully shuts down the MUD server. All players will be disconnected.',
  },

  {
    name: 'reboot',
    description: 'Reboot the MUD server',
    level: 61,
    category: 'dangerous',
    params: [
      { name: 'delay', label: 'Delay (seconds)', type: 'number', required: false, defaultValue: 0 },
    ],
    template: 'reboot {delay}',
    dangerous: true,
  },

  {
    name: 'terminate',
    description: 'Permanently terminate a player',
    level: 61,
    category: 'dangerous',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'terminate {player}',
    dangerous: true,
    help: 'Permanently deletes the player character. This cannot be undone!',
  },

  {
    name: 'ban',
    description: 'Ban a player or site',
    level: 60,
    category: 'dangerous',
    params: [
      {
        name: 'target',
        label: 'Player/Site',
        type: 'text',
        required: true,
        placeholder: 'Player name or IP address',
      },
    ],
    template: 'ban {target}',
    dangerous: true,
  },

  {
    name: 'wizlock',
    description: 'Lock MUD to prevent mortal connections',
    level: 61,
    category: 'dangerous',
    params: [{ name: 'state', label: 'State', type: 'on-off', required: true }],
    template: 'wizlock {state}',
    dangerous: true,
  },

  {
    name: 'snoop',
    description: 'Monitor all input from a player',
    level: 60,
    category: 'dangerous',
    params: [
      {
        name: 'player',
        label: 'Player',
        type: 'player',
        required: false,
        placeholder: 'Player name (empty = stop snooping)',
      },
    ],
    template: 'snoop {player}',
  },

  {
    name: 'switch',
    description: 'Switch control into a mobile',
    level: 61,
    category: 'dangerous',
    params: [
      {
        name: 'mobile',
        label: 'Mobile',
        type: 'text',
        required: true,
        placeholder: 'Mobile keyword',
      },
    ],
    template: 'switch {mobile}',
  },

  {
    name: 'punish',
    description: 'Punish a player',
    level: 60,
    category: 'dangerous',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'punish {player}',
    dangerous: true,
  },

  {
    name: 'demote',
    description: 'Demote an immortal to a lower level',
    level: 60,
    category: 'dangerous',
    params: [
      { name: 'player', label: 'Immortal', type: 'player', required: true },
      {
        name: 'level',
        label: 'New Level',
        type: 'level',
        required: true,
        validation: { min: 1, max: 61 },
      },
    ],
    template: 'demote {player} {level}',
    dangerous: true,
  },

  {
    name: 'reroll',
    description: "Reroll a player's statistics",
    level: 60,
    category: 'dangerous',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'reroll {player}',
    dangerous: true,
  },

  // ============================================
  // ADDITIONAL USEFUL COMMANDS
  // ============================================

  {
    name: 'approve',
    description: 'Approve a player request',
    level: 57,
    category: 'player',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'approve {player}',
  },

  {
    name: 'decline',
    description: 'Decline a player request',
    level: 57,
    category: 'player',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'decline {player}',
  },

  {
    name: 'release',
    description: 'Release a player from jail/freeze',
    level: 57,
    category: 'player',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'release {player}',
  },

  {
    name: 'title',
    description: 'Set player title',
    level: 57,
    category: 'player',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'New title' },
    ],
    template: 'title {player} {title}',
  },

  {
    name: 'knock',
    description: 'Knock on a door to bypass lock',
    level: 57,
    category: 'teleportation',
    params: [
      {
        name: 'direction',
        label: 'Direction',
        type: 'direction',
        required: true,
        options: DIRECTION_OPTIONS,
      },
    ],
    template: 'knock {direction}',
  },

  {
    name: 'poofin',
    description: 'Set custom arrival message',
    level: 57,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Arrival message',
      },
    ],
    template: 'poofin {message}',
  },

  {
    name: 'poofout',
    description: 'Set custom departure message',
    level: 57,
    category: 'communication',
    params: [
      {
        name: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        placeholder: 'Departure message',
      },
    ],
    template: 'poofout {message}',
  },

  {
    name: 'account',
    description: 'View account information',
    level: 59,
    category: 'information',
    params: [{ name: 'player', label: 'Player', type: 'player', required: true }],
    template: 'account {player}',
  },

  {
    name: 'whitelist',
    description: 'Manage multiplay whitelist',
    level: 58,
    category: 'player',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      {
        name: 'action',
        label: 'Action',
        type: 'flag-select',
        required: true,
        options: [
          { value: 'add', label: 'Add' },
          { value: 'remove', label: 'Remove' },
        ],
      },
    ],
    template: 'whitelist {player} {action}',
  },

  {
    name: 'offlinemsg',
    description: 'Send message to offline player',
    level: 60,
    category: 'communication',
    params: [
      { name: 'player', label: 'Player', type: 'text', required: true, placeholder: 'Player name' },
      {
        name: 'message',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: 'Message to send',
      },
    ],
    template: 'offlinemsg {player} {message}',
  },

  {
    name: 'instacast',
    description: 'Cast a spell instantly',
    level: 60,
    category: 'player',
    params: [
      { name: 'spell', label: 'Spell', type: 'text', required: true, placeholder: 'Spell name' },
      {
        name: 'target',
        label: 'Target',
        type: 'text',
        required: false,
        placeholder: 'Target (optional)',
      },
    ],
    template: 'instacast {spell} {target}',
  },

  {
    name: 'reloadhelp',
    description: 'Reload help files from disk',
    level: 60,
    category: 'zone',
    params: [],
    template: 'reloadhelp',
  },

  {
    name: 'givepet',
    description: 'Give a pet to a player',
    level: 60,
    category: 'loading',
    params: [
      { name: 'player', label: 'Player', type: 'player', required: true },
      { name: 'pet', label: 'Pet', type: 'text', required: true, placeholder: 'Pet keyword' },
    ],
    template: 'givepet {player} {pet}',
  },
]

// Get commands filtered by player level
export function getCommandsForLevel(level: number): GodCommand[] {
  return GOD_COMMANDS.filter((cmd) => cmd.level <= level)
}

// Get commands by category
export function getCommandsByCategory(category: string): GodCommand[] {
  return GOD_COMMANDS.filter((cmd) => cmd.category === category)
}

// Search commands by name, description, or aliases
export function searchCommands(query: string, level: number): GodCommand[] {
  const lowerQuery = query.toLowerCase()
  return GOD_COMMANDS.filter((cmd) => cmd.level <= level).filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.aliases?.some((alias) => alias.toLowerCase().includes(lowerQuery)),
  )
}
