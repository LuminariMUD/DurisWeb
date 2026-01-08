// Participant summary for list view
export interface PvPKillerSummary {
  description: string
  isLeader: boolean
}

export interface PvPVictimSummary {
  description: string
  isLeader: boolean
  died: boolean
}

// PvP Event Types
export interface PvPEvent {
  id: number
  stamp: string // ISO date string
  room_vnum: number
  room_name: string
  tweeted: boolean
  killers?: PvPKillerSummary[]
  victims?: PvPVictimSummary[]
  participant_count?: number
  like_count?: number
  comment_count?: number
}

// PvP Participant Info
export interface PvPParticipant {
  id: number
  event_id: number
  pid: number
  level: number
  pk_type: 'KILLER' | 'VICTIM' | 'KILLER-GROUP' | 'VICTIM-GROUP'
  player_description: string // e.g., "[56 Crusader] Juts (Githzerai)"
  equip: string
  log: string | null
  inroom: boolean
  leader: boolean
}

// Battle Detail (event + all participants)
export interface BattleDetail {
  event: {
    id: number
    stamp: string
    room_vnum: number
    room_name: string
    tweeted: boolean
  }
  participants: PvPParticipant[]
}

// Parsed Player Info
export interface PlayerInfo {
  level: number
  class: string
  name: string
  race?: string
  guild?: string
}

// API Filter Types
export interface PvPFilters {
  page?: number
  limit?: number
  startDate?: string
  endDate?: string
  playerName?: string
  location?: string
  alignment?: 'good' | 'evil' | 'neutral'
}

// Paginated Response
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Statistics Types
export interface PlayerStats {
  playerName: string
  level: number
  class: string
  race: string
  kills: number
  deaths: number
  kdRatio: number
  recentBattles?: PvPEvent[]
}

export interface LeaderboardEntry {
  rank: number
  playerName: string
  level: number
  class: string
  race: string
  kills: number
  deaths: number
  value: number
  kdRatio: number
}

export interface Leaderboard {
  type: 'kills' | 'deaths' | 'kd_ratio'
  period: '7d' | '30d' | 'all'
  entries: LeaderboardEntry[]
}

// Search Types
export interface SearchQuery {
  playerName?: string
  dateRange?: {
    start: string
    end: string
  }
  location?: string
  class?: string[]
  race?: string[]
  levelRange?: {
    min: number
    max: number
  }
  alignment?: 'good' | 'evil' | 'neutral'
  groupSize?: string // e.g., "1v1", "2v2"
}

// Autocomplete Types
export interface LocationOption {
  room_vnum: number
  room_name: string
  battle_count: number
}

export interface PlayerOption {
  name: string
  displayName: string
  level: number
  class: string
  race: string
}

// News Types
export interface NewsContent {
  news: string | null // Raw MUD text with ANSI codes
}

// Analytics Types
export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all'

export interface KillTimelineData {
  date: string
  kills: number
}

export interface ActiveHoursData {
  hour: number
  kills: number
}

export interface PopularLocationData {
  location: string
  kills: number
}

export interface ClassMatchupData {
  killer_class: string
  victim_class: string
  wins: number
}

// ========================================
// Authentication & Forum Types
// ========================================

// Character Info
export interface CharacterInfo {
  pid: number
  name: string
  level: number
  guild: string
  race: string
  classname: string
  racewar: number // 1=good, 2=evil, 0=neutral
  active: boolean
  money: number // copper on hand
}

// User Permissions (6-tier immortal system)
export interface UserPermissions {
  role: 'player' | 'avatar' | 'immortal' | 'lesser_god' | 'greater_god' | 'forger' | 'overlord'
  immortalLevel: 57 | 58 | 59 | 60 | 61 | 62 | null
  maxLevel: number
  canAccessImmortalForum: boolean
  canAccessGodForum: boolean
  guilds: string[]
  canModerate: boolean
  canBan: boolean
  canEditPosts: boolean
  canDeletePosts: boolean
  canPinThreads: boolean
  canLockThreads: boolean
  adminPermissions: string[] // Granular admin permissions
}

// User Context (from /api/auth/me)
export interface UserContext {
  accountName: string
  email: string
  avatarUrl: string | null
  characters: CharacterInfo[]
  permissions: UserPermissions
}

// Auth Status (from /api/auth/check)
export interface AuthStatus {
  authenticated: boolean
  accountName?: string
  email?: string
}

// Forum Category
export interface ForumCategory {
  id: number
  name: string
  description: string
  access_type: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl' | 'immortal' | 'god'
  min_level: number | null
  guild_name: string | null
  parent_id: number | null
  sort_order: number
  icon: string | null
  is_archived: boolean
  archived_at: string | null
  archived_by: string | null
  thread_count: number
  post_count: number
  last_post: {
    created_at: string
    author_name: string
    thread_id: number
    thread_title: string
  } | null
  created_at: string
  permissions?: CategoryPermissionRule[]
}

// Category ACL Permission Rule
export interface CategoryPermissionRule {
  id: number
  category_id: number
  permission_type: 'allow' | 'deny'
  min_immortal_level: number | null
  guild_name: string | null
  account_name: string | null
  character_pid: string | null
  can_view: boolean
  can_post: boolean
  can_moderate: boolean
  created_at: string
  created_by: string
}

// Create Category Request
export interface CreateCategoryRequest {
  name: string
  description: string | null
  accessType: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl'
  minLevel?: number
  guildName?: string
  parentId?: number
  sortOrder?: number
  icon?: string
}

// Update Category Request
export interface UpdateCategoryRequest {
  name?: string
  description?: string | null
  accessType?: 'public' | 'authenticated' | 'role_based' | 'guild' | 'custom_acl'
  minLevel?: number | null
  guildName?: string | null
  parentId?: number | null
  sortOrder?: number
  icon?: string | null
}

// Add Permission Request
export interface AddPermissionRequest {
  permissionType: 'allow' | 'deny'
  target: {
    minImmortalLevel?: number
    guildName?: string
    accountName?: string
    characterPid?: string
  }
  permissions: {
    canView?: boolean
    canPost?: boolean
    canModerate?: boolean
  }
}

// Forum Thread
export interface ForumThread {
  id: number
  category_id: number
  title: string
  content?: string // Thread opening post content
  author: string
  author_account_name?: string // Account name (may differ from display name)
  author_avatar_url?: string | null // User profile avatar
  character_pid: number | null
  character_name: string | null
  character_title?: string | null
  guild_id?: number | null
  guild_name?: string | null
  guild_rank_title?: string | null
  ip_address?: string | null // Overlord-only (level 60+)
  is_pinned: boolean
  is_locked: boolean
  view_count: number
  reply_count: number
  last_post_at: string
  created_at: string
  updated_at: string
  is_deleted: boolean
  has_poll?: boolean // Whether thread has a poll
  reactions?: PostReaction[] // Reactions on the thread opening post
}

// Forum Post
export interface ForumPost {
  id: number
  thread_id: number
  author: string
  author_avatar_url?: string | null // User profile avatar
  character_pid: number | null
  character_name: string | null
  content: string
  ip_address?: string | null // Overlord-only (level 60+)
  parent_post_id: number | null
  created_at: string
  edited_at: string | null // Changed from updated_at to match database schema
  is_deleted: boolean
  reactions?: PostReaction[]
  character_title?: string | null
  guild_name?: string | null  // Contains ANSI codes
  guild_id?: number | null
  guild_rank_title?: string | null
}

// Post Reaction
export interface PostReaction {
  emoji: string
  count: number
  userReacted: boolean
}

// Forum Search Result
export interface ForumSearchResult {
  id: number
  type: 'thread' | 'post'
  thread_id: number
  thread_title: string
  category_id: number
  category_name: string
  author: string
  character_name: string | null
  content: string
  created_at: string
  relevance_score: number
}

// Thread Subscription
export interface ThreadSubscription {
  thread_id: number
  thread_title: string
  category_id: number
  category_name: string
  notify_on_reply: boolean
  subscribed_at: string
}

// Notification
export interface Notification {
  id: number
  account_name: string
  type: 'reply' | 'mention' | 'reaction'
  thread_id: number
  post_id: number | null
  triggered_by: string
  message: string
  is_read: boolean
  created_at: string
}

// Forum Settings (admin only)
export interface ForumSettings {
  min_level_to_moderate: number
  min_level_to_ban: number
  min_level_to_pin: number
  min_level_to_lock: number
  min_level_to_delete_any_post: number
  min_level_immortal_forum: number
  min_level_god_forum: number
  allow_mortal_posts: boolean
  post_rate_limit: number
  thread_rate_limit: number
}

// Web Settings (admin only)
export interface WebSettingRow {
  setting_key: string
  setting_value: string
  description: string | null
  updated_at: string
  updated_by: string | null
}

// Site Configuration (public)
export interface SiteConfig {
  siteTitle: string
  siteLogoUrl: string
  mudHost: string
  mudPort: string
  mudPortTls: string
  mudWsPort: string
  // Front page settings
  frontPageHeroEnabled: boolean
  frontPageHeroTitle: string
  frontPageHeroSubtitle: string
  frontPageHeroImageUrl: string
  frontPageContent: string
}

// Category Permissions (admin only)
export interface CategoryPermissions {
  min_level_to_view: number | null
  min_level_to_post: number | null
  min_level_to_moderate: number | null
}

// Audit Log Entry (admin only)
export interface AuditLogEntry {
  id: number
  changed_by: string
  change_type: 'setting' | 'category_permission'
  target_key: string
  old_value: string | null
  new_value: string | null
  changed_at: string
}

// Moderation Log Entry
export interface ModerationLogEntry {
  id: number
  moderator_account: string
  action_type: 'delete_post' | 'delete_thread' | 'restore_post' | 'restore_thread' | 'move_thread' | 'lock_thread' | 'unlock_thread' | 'pin_thread' | 'unpin_thread'
  target_type: 'post' | 'thread'
  target_id: number
  category_id: number | null
  new_category_id: number | null
  reason: string | null
  original_content: string | null
  created_at: string
}

// Forum Subscription
export interface ForumSubscription {
  id: number
  accountName: string
  subscriptionType: 'thread' | 'category'
  threadId: number | null
  categoryId: number | null
  notificationPreference: 'all' | 'mentions' | 'none'
  createdAt: string
}

// Forum Notification
export interface ForumNotification {
  id: number
  accountName: string
  notificationType: 'new_post' | 'new_reply' | 'mention' | 'quote' | 'thread_moved' | 'thread_locked'
  threadId: number
  postId: number | null
  triggeredByAccount: string
  triggeredByCharacter: string | null
  message: string
  isRead: boolean
  createdAt: string
  readAt: string | null
}

// Unified Notification (combines forum + builder + auction)
export interface UnifiedNotification {
  id: number
  source: string
  accountName: string
  notificationType: string
  message: string
  link: string | null
  isRead: boolean
  createdAt: string
  readAt: string | null
  triggeredByAccount: string | null
  triggeredByCharacter?: string | null
  data?: Record<string, any> | null
  // Legacy fields for backwards compatibility (extracted from data)
  threadId?: number
  postId?: number | null
  zoneId?: string
  zoneName?: string | null
  entityType?: string | null
  entityId?: number | null
  auctionId?: number
  itemName?: string | null
  amount?: number
}

// User Profile
export interface UserProfile {
  accountName: string
  bio: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  website: string | null
  location: string | null
  createdAt: string
  lastSeenAt: string
}

export interface UserProfileStats {
  totalPosts: number
  totalThreads: number
  totalReactionsReceived: number
  reputationScore: number
  firstPostAt: string | null
  lastPostAt: string | null
  characterCount: number
  totalFrags: number
  totalDeaths: number
  totalWealth: number
}

export interface UserProfileWithStats extends UserProfile {
  stats: UserProfileStats
}

// Character with Stats (for user profile page)
export interface CharacterWithStats {
  pid: number
  name: string
  race: string           // With ANSI codes
  class: string          // With ANSI codes
  spec: string | null
  level: number
  guild: string | null   // With ANSI codes
  guildRank: string | null
  active: boolean
  money: number          // Copper on hand
  balance: number        // Copper in bank
  playtime: number       // Seconds
  epics: number
  stats: {
    frags: number
    deaths: number
    fragRank: number | null
    kdRatio: number
    forumPosts: number
    forumThreads: number
  }
}

export interface AccountCharactersResponse {
  characters: CharacterWithStats[]
  totals: {
    characterCount: number
    totalFrags: number
    totalDeaths: number
    totalWealth: number  // Sum of all money + balance
  }
}

export interface UserPost {
  id: number
  threadId: number
  threadTitle: string
  categoryId: number
  categoryName: string
  content: string
  characterName: string | null
  createdAt: string
  editedAt: string | null
}

export interface UserThread {
  id: number
  categoryId: number
  categoryName: string
  title: string
  content: string
  characterName: string | null
  createdAt: string
  viewCount: number
  replyCount: number
  isPinned: boolean
  isLocked: boolean
}

// ============================================================================
// Poll Types
// ============================================================================

export interface ForumPoll {
  id: number
  threadId: number
  question: string

  // Configuration
  isMultipleChoice: boolean
  minChoices: number
  maxChoices: number

  // Privacy
  isAnonymous: boolean
  resultsVisibility: 'always' | 'after_voting' | 'after_expiration'

  // Status
  expiresAt: string | null
  isClosed: boolean

  // Metadata
  createdByAccount: string
  createdAt: string
}

export interface PollOption {
  id: number
  pollId: number
  optionText: string
  sortOrder: number
  voteCount: number
  voters?: string[] // Only populated if poll is public
}

export interface PollCreationData {
  question: string
  options: string[] // Option texts in order
  isMultipleChoice: boolean
  minChoices: number
  maxChoices: number
  isAnonymous: boolean
  resultsVisibility: 'always' | 'after_voting' | 'after_expiration'
  expiresAt?: string // ISO 8601 date string
}

export interface PollResultData {
  poll: ForumPoll
  options: PollOption[]
  totalVotes: number
  userHasVoted: boolean
  userVotes: number[] // Option IDs user voted for
  canViewResults: boolean
  isActive: boolean
}

// Frag Leaderboard Types
export interface FragLeaderboardEntry {
  rank: number
  char_name: string
  account_name: string
  total_frags: number  // Already divided by 100
  racewar: number      // 1=Good, 2=Evil
  race: string         // With ANSI codes
  class: string        // With ANSI codes
  level: number
  last_updated: string // ISO datetime
}

export interface FragLeaderboardFilters {
  racewar?: number           // 1=Good, 2=Evil, etc.
  race?: string              // Stripped ANSI
  class?: string             // Stripped ANSI
  level_min?: number
  level_max?: number
  account_name?: string
  char_name?: string         // Search query
  min_frags?: number
  include_deleted?: boolean  // Default: false
  page?: number              // Default: 1
  limit?: number             // Default: 50
}

export interface FragLeaderboardResponse {
  data: FragLeaderboardEntry[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface TopGainer {
  rank: number
  char_name: string
  account_name: string
  frags_gained: number  // Over time period
  race: string
  class: string
  level: number
}

export interface TopGainersResponse {
  data: TopGainer[]
  period: string
}

export interface AutocompleteOption {
  value: string
  label: string
}

// ============================================================================
// Git History Types
// ============================================================================

export interface GitCommit {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  date: string
  message: string
  filesChanged: number
  insertions: number
  deletions: number
}

export interface GitStatus {
  currentHash: string
  currentShortHash: string
  latestRemoteHash: string
  latestRemoteShortHash: string
  commitsAhead: number
  branch: string
}

export interface GitCommitsResponse {
  commits: GitCommit[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  status: GitStatus
}

// MUD Backup Types
export interface BackupInfo {
  id: number
  filename: string
  backupType: 'manual' | 'hourly'
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number
  currentStep: string | null
  fileSize: number | null
  errorMessage: string | null
  createdBy: string
  startedAt: string
  completedAt: string | null
}

export interface BackupContents {
  accounts: string[]
  characters: string[]
}

export interface RestoreTarget {
  type: 'account' | 'character'
  name: string
}

export interface RestoreInfo {
  id: number
  backupId: number
  restoreType: 'full' | 'selective'
  targets: RestoreTarget[] | null
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  progress: number
  currentStep: string | null
  errorMessage: string | null
  createdBy: string
  ipAddress: string
  startedAt: string
  completedAt: string | null
}

// ============================================================================
// Zone Builder Types
// ============================================================================

export type Direction = 'north' | 'east' | 'south' | 'west' | 'up' | 'down' | 'northeast' | 'northwest' | 'southeast' | 'southwest'

export interface RoomExit {
  direction: Direction
  description: string
  keywords: string
  doorFlag: number
  keyVnum: number
  toRoom: number
}

export interface ExtraDescription {
  keywords: string
  description: string
}

export interface Room {
  vnum: number
  name: string
  description: string
  zoneNumber: number
  roomFlags: number
  sectorType: number
  exits: RoomExit[]
  extras: ExtraDescription[]
  fallChance?: number
  currentSpeed?: number
  currentDirection?: number
}

export interface RoomIndex {
  vnum: number
  name: string
  sectorType?: number
  exits: { [key in Direction]?: number }
  x?: number
  y?: number
}

export interface ZoneIndex {
  id: string           // Unique identifier = filename without extension (e.g., "afterlife_gh")
  number: number       // Zone number derived from top_vnum / 100 (e.g., 291)
  name: string
  roomCount: number
  mobCount: number
  objCount: number
  resetCount: number
  lastModified?: string
}

// Mobile index (Tier 1 - for sidebar listing)
export interface MobIndex {
  vnum: number
  keywords: string
  shortDesc: string
  level: number
}

// Object index (Tier 1 - for sidebar listing)
export interface ObjIndex {
  vnum: number
  keywords: string
  shortDesc: string
  itemType: number
}

export interface ZoneMapData {
  id: string           // Unique identifier = filename without extension
  zoneNumber: number
  zoneName: string
  rooms: RoomIndex[]
  mobs: MobIndex[]
  objects: ObjIndex[]
}

export interface ZoneHeader {
  number: number
  name: string
  builders: string
  minLevel: number
  maxLevel: number
  top: number
  lifespan: number
  resetMode: number
}

export interface Mobile {
  vnum: number
  keywords: string
  shortDesc: string
  longDesc: string
  detailedDesc: string
  actFlags: number
  affFlags1: number
  affFlags2: number
  affFlags3: number
  affFlags4: number
  alignment: number
  species: number
  hometown: number
  mobClass: number
  level: number
  thac0: number
  ac: number
  hitDice: string
  damDice: string
  gold: number
  exp: number
  position: number
  defaultPosition: number
  sex: number
}

export interface ZoneObject {
  vnum: number
  keywords: string
  shortDesc: string
  longDesc: string
  actionDesc: string
  itemType: number
  material: number
  craftsmanship: number
  extraFlags: number
  extraFlags2: number
  wearFlags: number
  values: number[]
  weight: number
  cost: number
  condition: number
  applies: { location: number; modifier: number }[]
  extras: ExtraDescription[]
  antiFlags: number
  antiFlags2: number
  // Character affect bitvectors (optional, set when wearing item)
  // These use the same flags as mob affected_by (mobAffected1-4)
  bitvector?: number   // affected1_bits
  bitvector2?: number  // affected2_bits
  bitvector3?: number  // affected3_bits
  bitvector4?: number  // affected4_bits
}

export interface FlagDefinition {
  name: string
  value: number
  description?: string
}

// ============================================================================
// ZONE RESETS
// ============================================================================

// Zone reset command types
export const RESET_COMMANDS = {
  M: 'Load Mobile',
  O: 'Load Object (in room)',
  G: 'Give Object (to mob)',
  E: 'Equip Object (on mob)',
  P: 'Put Object (in container)',
  D: 'Set Door State',
  F: 'Follow (mob follows leader)',
  R: 'Remove Object from room',
} as const

export type ResetCommandType = keyof typeof RESET_COMMANDS

// Zone reset command
export interface ResetCommand {
  command: ResetCommandType
  ifFlag: number
  arg1: number
  arg2: number
  arg3: number
  arg4?: number
  comment?: string
}

// Zone reset command with metadata for display
export interface ResetWithMetadata extends ResetCommand {
  index: number
  // Resolved names from vnums
  mobName?: string
  objName?: string
  roomName?: string
  containerName?: string
  leaderName?: string
  // Human-readable values
  slotName?: string       // For E commands - "Wielded", "Held", etc.
  directionName?: string  // For D commands - "North", "East", etc.
  stateName?: string      // For D commands - "Open", "Closed", "Locked"
}

// Equip slot constants
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
] as const

// Door state constants
export const DOOR_STATES = [
  { value: 0, name: 'Open' },
  { value: 1, name: 'Closed' },
  { value: 2, name: 'Locked' },
  { value: 3, name: 'Pick-proof' },
  { value: 4, name: 'Secret' },
  { value: 5, name: 'Secret + Locked' },
] as const

// Direction names
export const DIRECTION_NAMES = [
  'North', 'East', 'South', 'West', 'Up', 'Down',
  'Northeast', 'Northwest', 'Southeast', 'Southwest'
] as const

export interface BuilderFlags {
  roomFlags: FlagDefinition[]
  sectorTypes: FlagDefinition[]
  mobActFlags: FlagDefinition[]
  mobActFlags2?: FlagDefinition[]
  mobAffFlags: FlagDefinition[]
  mobAffFlags2?: FlagDefinition[]
  mobAffFlags3?: FlagDefinition[]
  mobAffFlags4?: FlagDefinition[]
  mobAffFlags5?: FlagDefinition[]
  mobAggroFlags?: FlagDefinition[]
  mobAggroFlags2?: FlagDefinition[]
  mobPositions: FlagDefinition[]
  mobSex: FlagDefinition[]
  mobClasses: FlagDefinition[]
  mobRaces: FlagDefinition[]
  mobSpecies: FlagDefinition[]
  objectTypes: FlagDefinition[]
  doorFlags: FlagDefinition[]
  // Object-specific flags
  objWearFlags?: FlagDefinition[]
  objExtraFlags?: FlagDefinition[]
  objExtra2Flags?: FlagDefinition[]
  objApplyTypes?: FlagDefinition[]
  objAnti2Flags?: FlagDefinition[]
  // Object lookup tables
  objMaterials?: FlagDefinition[]
  objWeaponTypes?: FlagDefinition[]
  objWeaponDamageTypes?: FlagDefinition[]
  objCraftsmanship?: FlagDefinition[]
  objAntiClassFlags?: FlagDefinition[]
  // Affected flags (mob and object bitvectors share these - aliases)
  mobAffected1?: FlagDefinition[]
  mobAffected2?: FlagDefinition[]
  mobAffected3?: FlagDefinition[]
  mobAffected4?: FlagDefinition[]
  // Player flags
  playerFlags?: FlagDefinition[]
  playerFlags2?: FlagDefinition[]
}

// Zone Map Position Types
export interface RoomPosition {
  x: number
  y: number
}

export interface ZonePositions {
  zoneId: string
  positions: Record<number, RoomPosition>
  lastModified: string | null
}

// Builder Activity Log Types
export interface BuilderActivity {
  id: number
  accountName: string
  actionType: string // 'room_create', 'room_update', 'room_delete', 'mob_create', etc.
  zoneId: string
  zoneName: string | null
  entityType: string // 'room', 'mob', 'object', 'reset', 'zone', 'system'
  entityVnum: number | null
  entityName: string | null
  createdAt: string
}

export interface BuilderActivityResponse {
  activities: BuilderActivity[]
  total: number
  hasMore: boolean
}

// ============================================================================
// Phase 7: Zone Info, Permissions, Proc Requests, Comments
// ============================================================================

// Zone Info (documentation and metadata)
export interface ZoneInfo {
  id: number
  zoneId: string
  description: string | null
  descriptionHtml: string | null
  ownerAccount: string
  createdAt: string
  updatedAt: string
}

export interface ZoneInfoUpdate {
  description?: string
  descriptionHtml?: string
}

// Zone Info History
export interface ZoneInfoHistory {
  id: number
  zoneId: string
  accountName: string
  fieldChanged: string // 'description', 'permission_grant', 'permission_revoke', 'permission_update'
  details: string | null
  changedAt: string
}

export interface ZoneInfoHistoryResponse {
  history: ZoneInfoHistory[]
  total: number
  hasMore: boolean
}

// Builder Notifications
export interface BuilderNotification {
  id: number
  accountName: string
  notificationType: string // 'comment_mention', 'proc_assigned', 'proc_status_change'
  zoneId: string
  zoneName: string | null
  entityType: string | null // 'comment', 'proc_request'
  entityId: number | null
  triggeredByAccount: string
  message: string
  isRead: boolean
  createdAt: string
  readAt: string | null
}

export interface BuilderNotificationsResponse {
  notifications: BuilderNotification[]
  total: number
  hasMore: boolean
}

// Zone Permissions
export type ZonePermissionLevel = 'view' | 'edit' | 'manage'

export interface ZonePermission {
  id: number
  zoneId: string
  accountName: string
  permissionLevel: ZonePermissionLevel
  grantedBy: string
  grantedAt: string
}

export interface GrantZonePermissionRequest {
  accountName: string
  permissionLevel: ZonePermissionLevel
}

// Proc Requests
export type ProcRequestStatus = 'requested' | 'assigned' | 'in_progress' | 'completed'
export type ProcRequestEntityType = 'mob' | 'object' | 'room'

export interface ProcRequest {
  id: number
  zoneId: string
  entityType: ProcRequestEntityType
  vnum: number
  title: string
  description: string | null
  descriptionHtml: string | null
  status: ProcRequestStatus
  assignedTo: string | null
  requestedBy: string
  requestedAt: string
  updatedAt: string
}

export interface CreateProcRequest {
  zoneId: string
  entityType: ProcRequestEntityType
  vnum: number
  title: string
  description?: string
  descriptionHtml?: string
}

export interface UpdateProcRequest {
  entityType?: ProcRequestEntityType
  vnum?: number
  title?: string
  description?: string
  descriptionHtml?: string
  status?: ProcRequestStatus
  assignedTo?: string | null
}

// Zone Comments
export interface ZoneComment {
  id: number
  zoneId: string
  parentId: number | null
  procRequestId: number | null
  accountName: string
  characterName: string | null
  content: string
  contentHtml: string | null
  createdAt: string
  updatedAt: string
  replies?: ZoneComment[]
}

export interface CreateZoneComment {
  zoneId: string
  parentId?: number | null
  procRequestId?: number | null
  characterName?: string | null
  content: string
  contentHtml?: string
}

export interface UpdateZoneComment {
  content: string
  contentHtml?: string
}

// Zone Access Response
export interface ZoneAccessResponse {
  canView: boolean
  canEdit: boolean
  canManage: boolean
  isOwner: boolean
  permission: ZonePermission | null
}

// ========================================
// PvP Battle Interactions
// ========================================

export interface PvPBattleComment {
  id: number
  eventId: number
  accountName: string
  characterPid: number | null
  characterName: string | null
  characterRace: string | null
  characterClass: string | null
  characterLevel: number | null
  content: string
  parentId: number | null
  isDeleted: boolean
  createdAt: string
  updatedAt: string
  quotedText: string | null
  lineNumber: number | null
  participantId: number | null
  replies?: PvPBattleComment[]
}

export interface PvPBattleStats {
  likeCount: number
  commentCount: number
  userLiked: boolean
  userFavorited: boolean
}

export interface PvPFavorite {
  eventId: number
  stamp: string
  roomName: string
  roomVnum: number
  killers: string[]
  victims: string[]
  likeCount: number
  commentCount: number
  favoritedAt: string
}

export interface PvPFavoritesResponse {
  data: PvPFavorite[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ========================================
// Wiki Types
// ========================================

export interface WikiContinent {
  id: number
  name: string
  nameAnsi: string | null
  seedRoomVnum: number
  centerX: number | null
  centerY: number | null
}

export interface WikiMapTile {
  roomVnum: number
  x: number
  y: number
  z: number
  sectorType: number
  zoneNumber: number
  zoneName: string | null
  roomName: string | null
  continentId: number | null
  isMapRoom: boolean
}

export interface WikiZoneEntrance {
  id: number
  fromRoomVnum: number
  toRoomVnum: number
  toZoneNumber: number
  toZoneName: string | null
  direction: string
  x: number | null
  y: number | null
}

export interface WikiMapBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface WikiZone {
  number: number
  name: string
  nameAnsi?: string
  minLevel: number
  maxLevel: number
  difficulty: number
  alignment: number
  epicType: number
  roomCount: number
  mobCount: number
  objectCount: number
}

export interface WikiRoom {
  vnum: number
  name: string
  description?: string
  sectorType: number
  zoneNumber: number
  exits: WikiRoomExit[]
}

export interface WikiRoomExit {
  direction: string
  toRoom: number
  hasDoor: boolean
  doorName?: string
}

export interface WikiZoneDetail extends WikiZone {
  description?: string
  rooms: WikiRoom[]
}

export interface WikiZoneMapData {
  nodes: { id: number; name: string; sectorType: number; x?: number; y?: number }[]
  edges: { from: number; to: number; direction: string }[]
}

export interface WikiObject {
  vnum: number
  name: string
  nameAnsi?: string
  type: number
  typeName: string
  level: number
  weight: number
  slots: string[]
  affects: WikiObjectAffect[]
  spellEffects: string[]
  zoneNumber: number
}

export interface WikiObjectAffect {
  location: number
  locationName: string
  modifier: number
}

export interface WikiObjectDetail extends WikiObject {
  description?: string
  values: number[]
  extraFlags: number
  wearFlags: number
  zoneLocations: { zoneNumber: number; zoneName: string }[]
  roomLoads: { roomVnum: number; roomName: string; zoneNumber: number }[]
  mobDrops: { mobVnum: number; mobName: string; zoneNumber: number }[]
  containerLoads: { containerVnum: number; containerName: string }[]
}

export interface WikiZoneFilters {
  search?: string
  alignmentMin?: number
  alignmentMax?: number
  difficultyMin?: number
  difficultyMax?: number
  epicTypes?: number[]
  minLevel?: number
  maxLevel?: number
}

export interface WikiObjectFilters {
  search?: string
  type?: number
  excludeTypes?: number[]
  slot?: number
  minLevel?: number
  maxLevel?: number
  affectType?: number
  zone?: number
  affects?: { location: number; minModifier?: number }[]
  spellEffects?: string[]
}

export interface WikiPaginatedResponse<T> {
  zones?: T[]
  objects?: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface WikiObjectType {
  id: number
  name: string
}

export interface WikiWearSlot {
  id: number
  name: string
}

export interface WikiAffectType {
  id: number
  name: string
}

// Wiki Mobs
export interface WikiMob {
  vnum: number
  name: string
  keywords: string
  level: number
  alignment: number
  mobClass: number
  classname: string
  gold: number
  exp: number
  zoneNumber: number
  zoneName: string
  // New fields
  species: number
  raceName: string
  actFlags: number
  flags: string[]
}

export interface WikiMobEquipment {
  vnum: number
  name: string
  slot: string  // 'Inventory', 'Wielded', 'Held', 'Body', etc.
  itemType: number
  itemTypeName: string
}

export interface WikiMobDetail extends WikiMob {
  longDesc: string
  detailedDesc: string
  hitDice: string
  damDice: string
  ac: number
  thac0: number
  zoneLocations: { zoneNumber: number; zoneName: string }[]
  spawnRooms: { roomVnum: number; roomName: string }[]
  equipment: WikiMobEquipment[]
}

export interface WikiMobFilters {
  search?: string
  minLevel?: number
  maxLevel?: number
  alignmentMin?: number
  alignmentMax?: number
  mobClass?: number
  // New filters
  race?: number
  flag?: number  // Filter by ACT flag (bitvector value)
  zone?: number  // Filter by zone number
}

export interface WikiMobClass {
  id: number
  name: string
}

export interface WikiMobRace {
  id: number
  name: string
}

export interface WikiActFlag {
  id: number
  name: string
  description: string
}

// Wiki Shop Item (sold by shopkeeper)
export interface WikiShopItem {
  vnum: number
  name: string
  itemType?: number
  itemTypeName?: string
  price?: number
}

// Wiki Room Spawns
export interface WikiRoomSpawn {
  type: 'mob' | 'object'
  vnum: number
  name: string
  shortDesc: string
  level?: number
  itemType?: number
  itemTypeName?: string
  isShopkeeper?: boolean
  shopItems?: WikiShopItem[]
}

export interface WikiZoneSpawns {
  roomSpawns: Record<number, WikiRoomSpawn[]>
}

// ========================================
// Public Guide (Help Files) Types
// ========================================

export interface PublicHelpFile {
  id: number
  title: string | null
  text?: string | null
  category_id: number | null
  category_name: string
  last_update: string | null
  last_update_by?: string | null
}

export interface PublicHelpFilesResponse {
  pages: PublicHelpFile[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface GuideCategoryWithCount {
  id: number
  name: string
  count: number
}

// Help File Suggestions
export type SuggestionType = 'new' | 'edit'
export type SuggestionStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision'

export interface HelpSuggestion {
  id: number
  suggestion_type: SuggestionType
  page_id: number | null
  title: string
  text: string
  category_id: number
  category_name: string
  see_also: string | null
  submitter_notes: string | null
  status: SuggestionStatus
  reviewer_account: string | null
  reviewer_notes: string | null
  reviewed_at: string | null
  submitted_by: string
  submitted_at: string
  updated_at: string
  ip_address: string | null
  original_title?: string
  original_text?: string
}

export interface CreateHelpSuggestion {
  suggestionType: SuggestionType
  pageId?: number
  title: string
  text: string
  categoryId: number
  seeAlso?: string
  submitterNotes?: string
}

export interface UpdateHelpSuggestion {
  title?: string
  text?: string
  categoryId?: number
  seeAlso?: string
  submitterNotes?: string
}

export interface ReviewHelpSuggestion {
  action: 'approve' | 'reject' | 'needs_revision'
  reviewerNotes?: string
}

export interface HelpSuggestionsResponse {
  suggestions: HelpSuggestion[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ========================================
// Auction Types
// ========================================

export interface AuctionListItem {
  id: number
  sellerPid: number
  sellerName: string
  startTime: number        // Unix timestamp
  endTime: number          // Unix timestamp
  secsRemaining: number    // Computed: end_time - NOW()
  status: 'OPEN' | 'CLOSED' | 'REMOVED'
  curPrice: number         // In copper
  buyPrice: number         // In copper (0 = no buy-it-now)
  objShort: string         // Item name with ANSI codes
  objVnum: number
  idKeywords: string       // Searchable item flags
  objInfoText: string | null // Item stats text for web display
  quantity: number
  winningBidderPid: number | null
  winningBidderName: string | null
  bidCount: number         // Computed from bid history
}

// AuctionDetail is currently identical to AuctionListItem
// Additional detail-only fields can be added here if needed
export type AuctionDetail = AuctionListItem

export interface AuctionBidHistory {
  id: number
  date: number             // Unix timestamp
  auctionId: number
  bidderPid: number
  bidderName: string
  bidAmount: number        // In copper
}

export interface AuctionFilters {
  search?: string
  seller?: string
  minPrice?: number        // In platinum
  maxPrice?: number        // In platinum
  hasBuyNow?: boolean
  keywords?: string[]
  page?: number
  limit?: number
  sortBy?: 'id' | 'startTime' | 'endTime' | 'price' | 'bidCount'
  sortOrder?: 'asc' | 'desc'
}

export interface AuctionStats {
  totalOpen: number
  totalValue: number       // In copper
  endingSoon: number
}

export interface AuctionHistoryItem {
  id: number
  sellerName: string
  buyerName: string
  objShort: string
  salePrice: number        // In copper
  soldAt: number           // Unix timestamp
  bidCount: number
}

export interface AuctionHistoryFilters {
  search?: string
  seller?: string
  buyer?: string
  page?: number
  limit?: number
  sortBy?: 'soldAt' | 'price'
  sortOrder?: 'asc' | 'desc'
}

// Changelog Types
export interface ChangelogEntry {
  id: number
  version: string
  title: string
  content: string
  category: 'public' | 'admin'
  createdBy: string
  createdAt: string
  updatedAt: string
  isPublished: boolean
  isRead?: boolean
}

export interface ChangelogListResponse {
  entries: ChangelogEntry[]
  total: number
}
