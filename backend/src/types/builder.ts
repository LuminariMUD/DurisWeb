// Zone Builder Types
// Based on DurisMUD zone file formats (.wld, .mob, .obj, .zon)
// Flag definitions are stored in database (builder_flags table)
// Use GET /api/builder/flags to fetch flag data

// Flag definition for UI
export interface FlagDefinition {
  name: string;
  value: number;
  description?: string;
}

// Direction constants (structural, not flag data)
export const DIRECTIONS = [
  'north',
  'east',
  'south',
  'west',
  'up',
  'down',
  'northwest',
  'southwest',
  'northeast',
  'southeast',
] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const DIRECTION_INDEX: Record<Direction, number> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
  up: 4,
  down: 5,
  northwest: 6,
  southwest: 7,
  northeast: 8,
  southeast: 9,
};

// Exit interface
export interface RoomExit {
  direction: Direction;
  description: string;
  keywords: string;
  doorFlag: number;
  keyVnum: number;
  toRoom: number;
}

// Extra description interface
export interface ExtraDescription {
  keywords: string;
  description: string;
}

// Room interface (full data)
export interface Room {
  vnum: number;
  name: string;
  description: string;
  zoneNumber: number;
  roomFlags: number;
  sectorType: number;
  exits: RoomExit[];
  extras: ExtraDescription[];
  // Optional fields
  fallChance?: number;
  currentSpeed?: number;
  currentDirection?: number;
}

// Room index (Tier 1 - for map rendering)
export interface RoomIndex {
  vnum: number;
  name: string;
  sectorType?: number;
  exits: { [key in Direction]?: number };
  x?: number;
  y?: number;
}

// Mobile interface
export interface Mobile {
  vnum: number;
  keywords: string;
  shortDesc: string;
  longDesc: string;
  detailedDesc: string;
  actFlags: number;
  affFlags1: number;
  affFlags2: number;
  affFlags3: number;
  affFlags4: number;
  alignment: number;
  species: number;
  hometown: number;
  mobClass: number;
  level: number;
  thac0: number;
  ac: number;
  hitDice: string; // xdy+z format
  damDice: string; // xdy+z format
  gold: number;
  exp: number;
  position: number;
  defaultPosition: number;
  sex: number;
}

// Object interface
export interface ZoneObject {
  vnum: number;
  keywords: string;
  shortDesc: string;
  longDesc: string;
  actionDesc: string;
  itemType: number;
  material: number;
  craftsmanship: number;
  extraFlags: number;
  extraFlags2: number;
  wearFlags: number;
  values: number[];
  weight: number;
  cost: number;
  condition: number;
  applies: { location: number; modifier: number }[];
  extras: ExtraDescription[];
  antiFlags: number;
  antiFlags2: number;
  // Character affect bitvectors (optional, set when wearing item)
  // These use the same flags as mob affected_by (mob_affected1-4)
  bitvector?: number; // affected1_bits
  bitvector2?: number; // affected2_bits
  bitvector3?: number; // affected3_bits
  bitvector4?: number; // affected4_bits
}

// Zone reset command types (structural, not flag data)
export const RESET_COMMANDS = {
  M: 'Load Mobile',
  O: 'Load Object (in room)',
  G: 'Give Object (to mob)',
  E: 'Equip Object (on mob)',
  P: 'Put Object (in container)',
  D: 'Set Door State',
  F: 'Follow (mob follows leader)',
  R: 'Remove Object from room',
} as const;

export type ResetCommandType = keyof typeof RESET_COMMANDS;

// Zone reset command
export interface ResetCommand {
  command: ResetCommandType;
  ifFlag: number;
  arg1: number;
  arg2: number;
  arg3: number;
  arg4?: number;
  comment?: string;
}

// Zone reset command with metadata for display
export interface ResetWithMetadata extends ResetCommand {
  index: number;
  // Resolved names from vnums
  mobName?: string;
  objName?: string;
  roomName?: string;
  containerName?: string;
  leaderName?: string;
  // Human-readable values
  slotName?: string; // For E commands - "Wielded", "Held", etc.
  directionName?: string; // For D commands - "North", "East", etc.
  stateName?: string; // For D commands - "Open", "Closed", "Locked"
}

// Equip slot constants (structural, not flag data)
export const EQUIP_SLOTS = [
  { value: 0, name: 'Light' },
  { value: 1, name: 'Finger (right)' },
  { value: 2, name: 'Finger (left)' },
  { value: 3, name: 'Neck (1)' },
  { value: 4, name: 'Neck (2)' },
  { value: 5, name: 'Body' },
  { value: 6, name: 'Head' },
  { value: 7, name: 'Legs' },
  { value: 8, name: 'Feet' },
  { value: 9, name: 'Hands' },
  { value: 10, name: 'Arms' },
  { value: 11, name: 'Shield' },
  { value: 12, name: 'About body' },
  { value: 13, name: 'Waist' },
  { value: 14, name: 'Wrist (right)' },
  { value: 15, name: 'Wrist (left)' },
  { value: 16, name: 'Wielded' },
  { value: 17, name: 'Held' },
  { value: 18, name: 'Face' },
  { value: 19, name: 'Ear (right)' },
  { value: 20, name: 'Ear (left)' },
  { value: 21, name: 'Horns' },
  { value: 22, name: 'Third arm' },
  { value: 23, name: 'Fourth arm' },
  { value: 24, name: 'Tail' },
  { value: 25, name: 'In quiver' },
] as const;

// Door state constants (structural, not flag data)
export const DOOR_STATES = [
  { value: 0, name: 'Open' },
  { value: 1, name: 'Closed' },
  { value: 2, name: 'Locked' },
  { value: 3, name: 'Pick-proof' },
  { value: 4, name: 'Secret' },
  { value: 5, name: 'Secret + Locked' },
] as const;

// Zone header info
export interface ZoneHeader {
  number: number;
  name: string;
  builders: string;
  minLevel: number;
  maxLevel: number;
  top: number;
  lifespan: number;
  resetMode: number;
}

// Complete zone data
export interface ZoneData {
  header: ZoneHeader;
  rooms: Room[];
  mobiles: Mobile[];
  objects: ZoneObject[];
  resets: ResetCommand[];
}

// Zone index (for dashboard)
// Uses filename as unique identifier since multiple files can share same zone number
export interface ZoneIndex {
  id: string; // Unique identifier = filename without extension (e.g., "afterlife_gh")
  number: number; // Zone number derived from top_vnum / 100 (e.g., 291)
  name: string;
  roomCount: number;
  mobCount: number;
  objCount: number;
  resetCount: number;
  lastModified?: Date;
}

// Mobile index (Tier 1 - for sidebar listing)
export interface MobIndex {
  vnum: number;
  keywords: string;
  shortDesc: string;
  level: number;
}

// Object index (Tier 1 - for sidebar listing)
export interface ObjIndex {
  vnum: number;
  keywords: string;
  shortDesc: string;
  itemType: number;
}

// Zone map data (Tier 1)
export interface ZoneMapData {
  id: string; // Unique identifier = filename without extension
  zoneNumber: number;
  zoneName: string;
  rooms: RoomIndex[];
  mobs: MobIndex[];
  objects: ObjIndex[];
}

// API response types
export interface ZoneListResponse {
  zones: ZoneIndex[];
  total: number;
}

export interface ZoneDetailResponse {
  zone: ZoneMapData;
}

export interface RoomDetailResponse {
  room: Room;
}

export interface MobileDetailResponse {
  mobile: Mobile;
}

export interface ObjectDetailResponse {
  object: ZoneObject;
}

// Builder Activity Log
export interface BuilderActivity {
  id: number;
  accountName: string;
  actionType: string; // 'room_create', 'room_update', 'room_delete', 'mob_create', etc.
  zoneId: string;
  zoneName: string | null;
  entityType: string; // 'room', 'mob', 'object', 'reset', 'zone', 'system'
  entityVnum: number | null;
  entityName: string | null;
  createdAt: string;
}

export interface BuilderActivityResponse {
  activities: BuilderActivity[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Phase 7: Zone Info, Permissions, Proc Requests, Comments
// ============================================================================

// Zone Info (documentation and metadata)
export interface ZoneInfo {
  id: number;
  zoneId: string;
  description: string | null;
  descriptionHtml: string | null;
  ownerAccount: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneInfoUpdate {
  description?: string;
  descriptionHtml?: string;
}

// Zone Permissions
export type ZonePermissionLevel = 'view' | 'edit' | 'manage';

export interface ZonePermission {
  id: number;
  zoneId: string;
  accountName: string;
  permissionLevel: ZonePermissionLevel;
  grantedBy: string;
  grantedAt: string;
}

export interface GrantZonePermissionRequest {
  accountName: string;
  permissionLevel: ZonePermissionLevel;
}

// Proc Requests
export type ProcRequestStatus = 'requested' | 'assigned' | 'in_progress' | 'completed';
export type ProcRequestEntityType = 'mob' | 'object' | 'room';

export interface ProcRequest {
  id: number;
  zoneId: string;
  entityType: ProcRequestEntityType;
  vnum: number;
  title: string;
  description: string | null;
  descriptionHtml: string | null;
  status: ProcRequestStatus;
  assignedTo: string | null;
  requestedBy: string;
  requestedAt: string;
  updatedAt: string;
}

export interface CreateProcRequest {
  zoneId: string;
  entityType: ProcRequestEntityType;
  vnum: number;
  title: string;
  description?: string;
  descriptionHtml?: string;
}

export interface UpdateProcRequest {
  entityType?: ProcRequestEntityType;
  vnum?: number;
  title?: string;
  description?: string;
  descriptionHtml?: string;
  status?: ProcRequestStatus;
  assignedTo?: string | null;
}

// Zone Comments
export interface ZoneComment {
  id: number;
  zoneId: string;
  parentId: number | null;
  procRequestId: number | null;
  accountName: string;
  characterName: string | null;
  content: string;
  contentHtml: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: ZoneComment[];
}

export interface CreateZoneComment {
  zoneId: string;
  parentId?: number | null;
  procRequestId?: number | null;
  characterName?: string | null;
  content: string;
  contentHtml?: string;
}

export interface UpdateZoneComment {
  content: string;
  contentHtml?: string;
}

// Zone Info History
export interface ZoneInfoHistory {
  id: number;
  zoneId: string;
  accountName: string;
  fieldChanged: string; // 'description', 'permission_grant', 'permission_revoke', 'permission_update'
  details: string | null;
  changedAt: string;
}
