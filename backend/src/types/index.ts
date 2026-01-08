// Database table types
export interface PkillEvent {
  id: number;
  stamp: Date;
  room_vnum: number;
  room_name: string;
  tweeted: number;
}

export interface PkillInfo {
  id: number;
  event_id: number;
  pid: number;
  level: number;
  pk_type: 'KILLER' | 'VICTIM' | 'KILLER-GROUP' | 'VICTIM-GROUP';
  player_description: string;
  equip: string;
  log: string | null;
  inroom: number;
  leader: number | null;
}

// Participant info for list view
export interface PvPKillerSummary {
  description: string;
  isLeader: boolean;
}

export interface PvPVictimSummary {
  description: string;
  isLeader: boolean;
  died: boolean;
}

// API response types
export interface PvPEventListItem {
  id: number;
  stamp: Date;
  room_name: string;
  room_vnum: number;
  killers: PvPKillerSummary[];
  victims: PvPVictimSummary[];
  killer_count: number;
  victim_count: number;
  like_count: number;
  comment_count: number;
}

export interface PvPEventDetail {
  event: {
    id: number;
    stamp: Date;
    room_name: string;
    room_vnum: number;
    tweeted: boolean;
  };
  participants: ParticipantInfo[];
}

export interface ParticipantInfo {
  id: number;
  event_id: number;
  pid: number;
  level: number;
  pk_type: string;
  player_description: string;
  equip: string;
  log: string | null;
  inroom: number;
  leader: number | null;
}

export interface PlayerStats {
  playerName: string;
  level: number;
  class: string;
  race: string;
  kills: number;
  deaths: number;
  kdRatio: number;
  recentBattles: RecentBattle[];
  mostKilledBy: OpponentStat[];
  mostKilled: OpponentStat[];
}

export interface RecentBattle {
  event_id: number;
  stamp: Date;
  room_name: string;
  result: 'KILLER' | 'VICTIM';
  opponents: string[];
}

export interface OpponentStat {
  opponent_name: string;
  count: number;
}

export interface LeaderboardEntry {
  playerName: string;
  level: number;
  class: string;
  race: string;
  kills: number;
  deaths: number;
  kdRatio: number;
  value: number;
  rank: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AutocompleteItem {
  value: string;
  label: string;
}

// Query filter types
export interface EventFilters {
  player?: string;
  location?: string;
  date_from?: string;
  date_to?: string;
  hour?: number; // Hour of day (0-23) filter
  page?: number;
  limit?: number;
  sort_by?: 'date' | 'likes';
}

export interface SearchFilters extends EventFilters {
  class?: string;
  race?: string;
  level_min?: number;
  level_max?: number;
  alignment?: 'good' | 'evil';
}

// News types
export interface NewsContent {
  content: string;  // HTML with MUD colors parsed
}

// Analytics types
export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export interface KillTimelineData {
  date: string;
  kills: number;
}

export interface ActiveHoursData {
  hour: number;
  kills: number;
}

export interface PopularLocationData {
  location: string;
  kills: number;
}

export interface ClassMatchupData {
  killer_class: string;
  victim_class: string;
  wins: number;
}

// Frag Leaderboard types
export interface FragLeaderboardEntry {
  rank: number;
  char_name: string;
  account_name: string;
  total_frags: number;  // Already divided by 100
  racewar: number;      // 1=Good, 2=Evil
  race: string;         // With ANSI codes
  class: string;        // With ANSI codes
  level: number;
  last_updated: string; // ISO datetime
}

export interface FragLeaderboardFilters {
  racewar?: number;           // 1=Good, 2=Evil, etc.
  race?: string;              // Stripped ANSI
  class?: string;             // Stripped ANSI
  level_min?: number;
  level_max?: number;
  account_name?: string;
  char_name?: string;         // Search query
  min_frags?: number;
  include_deleted?: boolean;  // Default: false
  page?: number;              // Default: 1
  limit?: number;             // Default: 50
}

export interface FragLeaderboardResponse {
  data: FragLeaderboardEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TopGainer {
  rank: number;
  char_name: string;
  account_name: string;
  frags_gained: number;  // Over time period
  race: string;
  class: string;
  level: number;
}

export interface TopGainersResponse {
  data: TopGainer[];
  period: string;
}

// User Management types
export interface UserBan {
  id: number;
  account_name: string;
  banned_by: string;
  banned_at: Date;
  unbanned_at: Date | null;
  unbanned_by: string | null;
  reason: string | null;
  is_active: boolean;
}

export interface UserListItem {
  account_name: string;
  character_name: string | null;
  race: string | null;          // With ANSI codes
  class: string | null;          // With ANSI codes
  level: number | null;
  racewar: number | null;        // 1=Good, 2=Evil, 3=Neutral, 4=Undead
  email: string | null;
  last_ip: string | null;        // Last IP address from MUD flatfile
  last_login: Date | null;       // Last MUD login timestamp from ip_info.last_connect
  web_last_login: Date | null;   // Last web login timestamp from web_sessions
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: Date | null;
  banned_by: string | null;
  is_deleted: boolean;           // Soft deleted character
  deleted_at: Date | null;       // When character was deleted
}

export interface UserManagementFilters {
  search?: string;               // Search account/character/email
  race?: string;                 // Filtered (stripped ANSI)
  class?: string;                // Filtered (stripped ANSI)
  alignment?: number;            // 1=Good, 2=Evil, 3=Neutral, 4=Undead
  ban_status?: 'all' | 'active' | 'banned';
  page?: number;
  limit?: number;
  sort_by?: 'account_name' | 'character_name' | 'race' | 'class' | 'email' | 'last_login';
  sort_order?: 'asc' | 'desc';
}

export interface BanUserRequest {
  reason: string;
}

export interface UserManagementResponse {
  data: UserListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Character with stats for user profile
export interface CharacterWithStats {
  pid: number;
  name: string;
  race: string;           // With ANSI codes
  class: string;          // With ANSI codes
  spec: string | null;
  level: number;
  guild: string | null;   // With ANSI codes
  guildRank: string | null;
  active: boolean;
  money: number;          // Copper on hand
  balance: number;        // Copper in bank
  playtime: number;       // Seconds
  epics: number;
  stats: {
    frags: number;
    deaths: number;
    fragRank: number | null;
    kdRatio: number;
    forumPosts: number;
    forumThreads: number;
  };
}

export interface AccountCharactersResponse {
  characters: CharacterWithStats[];
  totals: {
    characterCount: number;
    totalFrags: number;
    totalDeaths: number;
    totalWealth: number;  // Sum of all money + balance
  };
}

// PvP Battle Interactions
export interface PvPBattleComment {
  id: number;
  eventId: number;
  accountName: string;
  characterPid: number | null;
  characterName: string | null;
  characterRace: string | null;
  characterClass: string | null;
  characterLevel: number | null;
  content: string;
  parentId: number | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  quotedText: string | null;
  lineNumber: number | null;
  participantId: number | null;
  replies?: PvPBattleComment[];
}

export interface PvPBattleStats {
  likeCount: number;
  commentCount: number;
  userLiked: boolean;
  userFavorited: boolean;
}

export interface PvPFavorite {
  eventId: number;
  stamp: string;
  roomName: string;
  roomVnum: number;
  killers: string[];
  victims: string[];
  likeCount: number;
  commentCount: number;
  favoritedAt: string;
}

export interface PvPFavoritesResponse {
  data: PvPFavorite[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auction types
export interface AuctionListItem {
  id: number;
  sellerPid: number;
  sellerName: string;
  startTime: number;        // Unix timestamp
  endTime: number;          // Unix timestamp
  secsRemaining: number;    // Computed: end_time - NOW()
  status: 'OPEN' | 'CLOSED' | 'REMOVED';
  curPrice: number;         // In copper
  buyPrice: number;         // In copper (0 = no buy-it-now)
  objShort: string;         // Item name with ANSI codes
  objVnum: number;
  idKeywords: string;       // Searchable item flags
  objInfoText: string | null; // Item stats text for web display
  quantity: number;
  winningBidderPid: number | null;
  winningBidderName: string | null;
  bidCount: number;         // Computed from bid history
}

export interface AuctionDetail extends AuctionListItem {
  // Additional detail-only fields can be added here
}

export interface AuctionBidHistory {
  id: number;
  date: number;             // Unix timestamp
  auctionId: number;
  bidderPid: number;
  bidderName: string;
  bidAmount: number;        // In copper
}

export interface AuctionFilters {
  search?: string;          // Search obj_short and id_keywords
  sellerName?: string;      // Filter by seller
  minPrice?: number;        // Minimum current price (in plat)
  maxPrice?: number;        // Maximum current price (in plat)
  hasBuyNow?: boolean;      // Only show items with buy-it-now
  keywords?: string[];      // Filter by id_keywords (AND logic)
  page?: number;
  limit?: number;
  sortBy?: 'id' | 'startTime' | 'endTime' | 'price' | 'bidCount';
  sortOrder?: 'asc' | 'desc';
}

export interface PlaceBidRequest {
  bidAmountPlat: number;    // Bid amount in platinum
  characterPid: number;     // Which character is bidding
}

export interface BuyNowRequest {
  characterPid: number;     // Which character is buying
}

export interface AuctionHistoryItem {
  id: number;
  sellerName: string;
  buyerName: string;
  objShort: string;
  salePrice: number;        // Final sale price in copper
  soldAt: number;           // Unix timestamp when auction closed
  bidCount: number;
}

export interface AuctionHistoryFilters {
  search?: string;
  sellerName?: string;
  buyerName?: string;
  page?: number;
  limit?: number;
  sortBy?: 'soldAt' | 'price';
  sortOrder?: 'asc' | 'desc';
}

export interface AuctionAdminRemoveRequest {
  reason?: string;
}
