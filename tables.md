# Database Tables Documentation

This document describes all database tables used by DurisWeb and the MUD server.

## Table of Contents

1. [Web Application Tables](#web-application-tables)
   - [Authentication & Sessions](#authentication--sessions)
   - [User Management](#user-management)
   - [Forum System](#forum-system)
   - [Admin & Permissions](#admin--permissions)
   - [Builder System](#builder-system)
   - [Wiki System](#wiki-system)
   - [PvP Interactions](#pvp-interactions)
   - [Web Analytics](#web-analytics)
   - [Server Monitoring](#server-monitoring)
   - [Backup & Restore](#backup--restore)
   - [Miscellaneous](#miscellaneous)

2. [MUD Game Tables](#mud-game-tables)
   - [Player Data](#player-data)
   - [Player Items & Skills](#player-items--skills)
   - [PvP & Combat](#pvp--combat)
   - [Auction System](#auction-system)
   - [Guilds & Associations](#guilds--associations)
   - [Progression](#progression)
   - [Miscellaneous MUD](#miscellaneous-mud)

---

## Web Application Tables

### Authentication & Sessions

#### accounts
primary table for web accounts, synced from mud account data

| column | type | description |
|--------|------|-------------|
| account_name | varchar(50) | primary key |
| created_at | timestamp | when account was created |
| last_login | timestamp | last login time |
| total_donated | decimal(10,2) | cumulative donation amount |

#### web_sessions
stores jwt refresh tokens for user sessions

| column | type | description |
|--------|------|-------------|
| id | varchar(255) | primary key, session id |
| account_name | varchar(50) | fk to accounts |
| refresh_token | varchar(255) | jwt refresh token |
| expires_at | timestamp | when session expires |
| created_at | timestamp | when session was created |

#### account_login_history
tracks login/logout events

| column | type | description |
|--------|------|-------------|
| id | bigint | primary key |
| account_name | varchar(50) | account name |
| ip_address | varchar(45) | ipv4/ipv6 address |
| status | enum | 'login' or 'logout' |
| client | varchar(100) | client type (web, telnet, etc) |
| timestamp | timestamp | event timestamp |

---

### User Management

#### user_profiles
user profile information

| column | type | description |
|--------|------|-------------|
| account_name | varchar(50) | primary key, fk to accounts |
| bio | text | user bio |
| avatar_url | varchar(255) | profile picture url |
| banner_url | varchar(255) | banner image url |
| website | varchar(255) | personal website |
| location | varchar(100) | location text |
| email | varchar(255) | email address |
| created_at | timestamp | profile creation time |
| last_seen_at | timestamp | last activity time |

#### user_profile_stats
aggregated user statistics

| column | type | description |
|--------|------|-------------|
| account_name | varchar(50) | primary key, fk to accounts |
| total_posts | int | total forum posts |
| total_threads | int | total forum threads created |
| total_reactions_received | int | reactions on user's posts |
| reputation_score | int | calculated reputation |
| first_post_at | timestamp | first forum post time |
| last_post_at | timestamp | most recent post time |

#### user_bans
tracks user ban history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | fk to user_profiles |
| banned_by | varchar(50) | admin who issued ban |
| banned_at | timestamp | when banned |
| unbanned_at | timestamp | when unbanned (null if active) |
| unbanned_by | varchar(50) | who lifted ban |
| reason | text | ban reason |
| is_active | boolean | if ban is currently active |

---

### Forum System

#### forum_categories
categories for organizing forum threads

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| name | varchar(100) | category name |
| description | text | category description |
| access_type | enum | 'public', 'authenticated', 'role_based', 'guild', 'custom_acl' |
| guild_name | varchar(50) | guild restriction (if applicable) |
| parent_id | int | parent category id (for nesting) |
| sort_order | int | display order |
| icon | varchar(100) | lucide icon name or emoji |
| min_level | int | minimum immortal level (57-62) |
| min_level_to_view | int | override min level to view |
| min_level_to_post | int | override min level to post |
| min_level_to_moderate | int | override min level to moderate |
| is_archived | boolean | if category is archived |
| archived_at | timestamp | when archived |
| archived_by | varchar(50) | who archived |
| created_at | timestamp | creation time |

**relations:**
- parent_id -> forum_categories.id (self-referential)

#### forum_threads
discussion threads within categories

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| category_id | int | fk to forum_categories |
| author_account_name | varchar(50) | thread creator account |
| author_character_pid | bigint | optional character pid |
| ip_address | varchar(45) | creator's ip |
| title | varchar(200) | thread title |
| content | text | thread body |
| created_at | timestamp | creation time |
| updated_at | timestamp | last update time |
| last_post_at | timestamp | time of most recent post |
| is_pinned | boolean | if thread is pinned |
| is_locked | boolean | if thread is locked |
| is_deleted | boolean | soft delete flag |
| deleted_at | timestamp | when deleted |
| deleted_by | varchar(50) | who deleted |
| view_count | int | view counter |
| reply_count | int | number of replies |

**relations:**
- category_id -> forum_categories.id

#### forum_posts
individual posts/replies within threads

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| thread_id | int | fk to forum_threads |
| parent_post_id | int | reply to specific post |
| author_account_name | varchar(50) | post author account |
| author_character_pid | bigint | optional character pid |
| ip_address | varchar(45) | poster's ip |
| content | text | post body |
| created_at | timestamp | creation time |
| edited_at | timestamp | last edit time |
| is_deleted | boolean | soft delete flag |
| deleted_at | timestamp | when deleted |
| deleted_by | varchar(50) | who deleted |

**relations:**
- thread_id -> forum_threads.id
- parent_post_id -> forum_posts.id (self-referential)

#### forum_reactions
emoji reactions on posts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| post_id | int | fk to forum_posts |
| thread_id | int | fk to forum_threads (for thread reactions) |
| user_account_name | varchar(50) | who reacted |
| emoji | varchar(10) | emoji character |
| created_at | timestamp | when reacted |

**relations:**
- post_id -> forum_posts.id
- thread_id -> forum_threads.id

#### forum_subscriptions
user subscriptions to threads/categories

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| user_account_name | varchar(50) | subscriber account |
| subscription_type | enum | 'thread' or 'category' |
| thread_id | int | subscribed thread (if thread type) |
| category_id | int | subscribed category (if category type) |
| notification_preference | enum | 'all', 'mentions', 'none' |
| created_at | timestamp | subscription time |

**relations:**
- thread_id -> forum_threads.id
- category_id -> forum_categories.id

#### forum_mentions
tracks @mentions in posts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| post_id | int | fk to forum_posts |
| mentioned_account_name | varchar(50) | who was mentioned |
| mentioned_by_account_name | varchar(50) | who mentioned them |
| created_at | timestamp | mention time |

**relations:**
- post_id -> forum_posts.id
- mentioned_account_name -> accounts.account_name
- mentioned_by_account_name -> accounts.account_name

#### forum_polls
polls attached to threads

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| thread_id | int | fk to forum_threads (unique) |
| question | varchar(500) | poll question |
| is_multiple_choice | boolean | allow multiple selections |
| min_choices | int | minimum selections |
| max_choices | int | maximum selections |
| is_anonymous | boolean | hide voter identities |
| results_visibility | enum | 'always', 'after_voting', 'after_expiration' |
| expires_at | timestamp | poll expiration (null = never) |
| created_by_account | varchar(50) | poll creator |
| created_at | timestamp | creation time |
| is_closed | boolean | manually closed |

**relations:**
- thread_id -> forum_threads.id (one poll per thread)

#### forum_poll_options
poll choices/options

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| poll_id | int | fk to forum_polls |
| option_text | varchar(200) | choice text |
| sort_order | int | display order |
| vote_count | int | denormalized vote count |
| created_at | timestamp | creation time |

**relations:**
- poll_id -> forum_polls.id

#### forum_poll_votes
tracks who voted for what

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| poll_id | int | fk to forum_polls |
| option_id | int | fk to forum_poll_options |
| voter_account | varchar(50) | who voted |
| voted_at | timestamp | vote time |
| updated_at | timestamp | vote change time |

**relations:**
- poll_id -> forum_polls.id
- option_id -> forum_poll_options.id

#### forum_poll_vote_history
audit log for vote changes

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| poll_id | int | fk to forum_polls |
| voter_account | varchar(50) | who changed vote |
| old_option_ids | json | previous selections |
| new_option_ids | json | new selections |
| changed_at | timestamp | change time |

**relations:**
- poll_id -> forum_polls.id

#### forum_post_images
images uploaded to forum posts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| post_id | int | fk to forum_posts |
| thread_id | int | fk to forum_threads |
| account_name | varchar(50) | uploader |
| image_key | varchar(255) | r2 object key |
| image_url | varchar(500) | public url |
| original_filename | varchar(255) | original name |
| mime_type | varchar(50) | file type |
| file_size | int | size in bytes |
| width | int | image width |
| height | int | image height |
| is_orphan | boolean | not linked to any post yet |
| created_at | timestamp | upload time |
| linked_at | timestamp | when linked to post |

**relations:**
- post_id -> forum_posts.id
- thread_id -> forum_threads.id

#### forum_settings
global forum configuration

| column | type | description |
|--------|------|-------------|
| setting_key | varchar(100) | primary key |
| setting_value | varchar(255) | setting value |
| description | text | what setting does |
| updated_at | timestamp | last update |
| updated_by | varchar(50) | who updated |

#### forum_moderation_log
moderation action history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| moderator_account | varchar(50) | moderator account |
| action_type | enum | 'delete_post', 'delete_thread', etc |
| target_type | enum | 'post' or 'thread' |
| target_id | int | post or thread id |
| category_id | int | category id |
| new_category_id | int | for move actions |
| reason | text | moderation reason |
| original_content | text | content before deletion |
| created_at | timestamp | action time |

#### forum_permission_audit
audit log for permission changes

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| changed_by | varchar(50) | who made change |
| change_type | enum | 'setting' or 'category_permission' |
| target_key | varchar(100) | setting key or category id |
| old_value | varchar(255) | previous value |
| new_value | varchar(255) | new value |
| changed_at | timestamp | change time |

#### forum_category_permissions
acl for forum categories

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| category_id | int | fk to forum_categories |
| permission_type | enum | 'allow' or 'deny' |
| min_immortal_level | int | applies to this level or higher |
| guild_name | varchar(50) | applies to guild members |
| account_name | varchar(50) | applies to specific account |
| character_pid | bigint | applies to specific character |
| can_view | boolean | can see category |
| can_post | boolean | can create/reply |
| can_moderate | boolean | can moderate |
| created_at | timestamp | creation time |
| created_by | varchar(50) | who created |

**relations:**
- category_id -> forum_categories.id

---

### Admin & Permissions

#### admin_permissions
defines all available admin permissions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| permission_key | varchar(100) | unique identifier |
| permission_name | varchar(255) | display name |
| description | text | what it does |
| category | varchar(50) | content, zone, monitoring, etc |
| sort_order | int | display order |
| created_at | timestamp | creation time |

#### admin_roles
roles that group permissions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| role_name | varchar(100) | unique role name |
| description | text | role description |
| is_system_role | boolean | cannot delete if true |
| created_by | varchar(50) | who created |
| created_at | timestamp | creation time |
| updated_at | timestamp | last update |

#### admin_role_permissions
links roles to permissions (many-to-many)

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| role_id | int | fk to admin_roles |
| permission_id | int | fk to admin_permissions |
| created_at | timestamp | assignment time |

**relations:**
- role_id -> admin_roles.id
- permission_id -> admin_permissions.id

#### admin_account_roles
assigns roles to accounts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | account to assign role |
| role_id | int | fk to admin_roles |
| granted_by | varchar(50) | who granted |
| granted_at | timestamp | grant time |

**relations:**
- role_id -> admin_roles.id

#### admin_account_permissions
individual permission overrides for accounts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | account |
| permission_id | int | fk to admin_permissions |
| granted_by | varchar(50) | who granted |
| granted_at | timestamp | grant time |

**relations:**
- permission_id -> admin_permissions.id

#### admin_action_log
audit trail for admin actions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | who did action |
| action_type | enum | 'property_change', 'wipe', etc |
| target | varchar(100) | what was affected |
| old_value | text | previous value |
| new_value | text | new value |
| notes | text | optional notes |
| ip_address | varchar(45) | admin's ip |
| timestamp | datetime | action time |

---

### Builder System

#### builder_flags
parsed constants from mud source code

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| category | varchar(50) | e.g., 'obj_wear', 'mob_class' |
| name | varchar(100) | flag name |
| value | bigint | numeric value |
| description | varchar(255) | human description |
| ansi_name | varchar(255) | ansi-colored version |
| short_code | varchar(10) | short code like 'War' |
| editable | tinyint | if editable in builder |
| sort_order | int | display order |
| source_file | varchar(100) | mud source file |
| created_at | datetime | creation time |
| updated_at | datetime | update time |

#### builder_zone_info
zone documentation and metadata

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_id | varchar(100) | zone filename (unique) |
| description | text | tiptap json content |
| description_html | text | rendered html |
| owner_account | varchar(50) | zone owner |
| created_at | timestamp | creation time |
| updated_at | timestamp | update time |

#### builder_zone_permissions
zone access permissions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_id | varchar(100) | zone identifier |
| account_name | varchar(50) | grantee account |
| permission_level | varchar(20) | 'view', 'edit', 'manage' |
| granted_by | varchar(50) | who granted |
| granted_at | timestamp | grant time |

#### builder_zone_info_history
zone info edit history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_id | varchar(100) | zone identifier |
| account_name | varchar(50) | who made change |
| field_changed | varchar(50) | what changed |
| details | varchar(255) | change summary |
| changed_at | datetime | change time |

#### builder_zone_comments
comments on zones with threading

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_id | varchar(100) | zone identifier |
| parent_id | int | parent comment (null = top-level) |
| proc_request_id | int | if comment on proc request |
| account_name | varchar(50) | commenter |
| character_name | varchar(50) | optional character |
| content | text | tiptap json |
| content_html | text | rendered html |
| created_at | timestamp | creation time |
| updated_at | timestamp | update time |

**relations:**
- parent_id -> builder_zone_comments.id (self-referential)
- proc_request_id -> builder_proc_requests.id

#### builder_proc_requests
proc/special code requests

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_id | varchar(100) | zone identifier |
| entity_type | varchar(20) | 'mob', 'object', 'room' |
| vnum | int | entity vnum |
| title | varchar(255) | request title |
| description | text | tiptap json |
| description_html | text | rendered html |
| status | varchar(20) | 'requested', 'assigned', etc |
| assigned_to | varchar(50) | coder assigned |
| requested_by | varchar(50) | requester |
| requested_at | timestamp | request time |
| updated_at | timestamp | update time |

#### builder_activity_log
tracks builder zone editing activity

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | who edited |
| action_type | varchar(50) | 'room_create', 'mob_update', etc |
| zone_id | varchar(100) | zone filename |
| zone_name | varchar(255) | zone display name |
| entity_type | varchar(20) | 'room', 'mob', 'object', etc |
| entity_vnum | int | vnum of entity |
| entity_name | varchar(255) | entity name |
| ip_address | varchar(45) | editor's ip |
| created_at | datetime | action time |

#### builder_mentions
tracks @mentions in builder comments

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| entity_type | varchar(50) | 'comment' or 'proc_request' |
| entity_id | int | id of entity |
| mentioned_account | varchar(50) | who was mentioned |
| mentioned_by_account | varchar(50) | who mentioned |
| created_at | datetime | mention time |

---

### Wiki System

#### wiki_continents
continent reference data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| name | varchar(100) | continent name |
| name_ansi | varchar(255) | ansi-colored name |
| seed_room_vnum | int | starting room vnum |
| center_x | int | map center x |
| center_y | int | map center y |
| created_at | datetime | creation time |

#### wiki_map_positions
room coordinates for world map

| column | type | description |
|--------|------|-------------|
| room_vnum | int | primary key |
| x_coord | int | x coordinate |
| y_coord | int | y coordinate |
| z_coord | int | z coordinate |
| sector_type | tinyint | terrain type |
| zone_number | int | zone number |
| zone_name | varchar(255) | zone name |
| room_name | varchar(255) | room name |
| continent_id | int | fk to wiki_continents |
| is_map_room | boolean | if room is on map |
| created_at | datetime | creation time |
| updated_at | datetime | update time |

**relations:**
- continent_id -> wiki_continents.id

#### wiki_zone_entrances
where map rooms lead to other zones

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| from_room_vnum | int | source room |
| to_room_vnum | int | destination room |
| to_zone_number | int | destination zone |
| to_zone_name | varchar(255) | zone name |
| direction | varchar(20) | exit direction |
| x_coord | int | entrance x |
| y_coord | int | entrance y |
| created_at | datetime | creation time |

#### wiki_settings
wiki configuration settings

| column | type | description |
|--------|------|-------------|
| key | varchar(100) | primary key |
| value | varchar(255) | setting value |
| description | varchar(500) | setting description |
| updated_at | datetime | update time |

#### wiki_objects
game objects/items data

| column | type | description |
|--------|------|-------------|
| vnum | int | primary key |
| name | varchar(255) | object name |
| name_ansi | varchar(500) | ansi-colored name |
| type | tinyint | object type |
| level | int | object level |
| weight | int | weight |
| extra_flags | int | extra flags bitmask |
| wear_flags | int | wear flags bitmask |
| anti_flags | int | anti flags bitmask |
| anti_flags2 | int | anti flags2 bitmask |
| zone_number | int | source zone |
| obj_values | json | array of 4 values |
| description | text | object description |
| created_at | datetime | creation time |
| updated_at | datetime | update time |

#### wiki_object_affects
object stat modifiers

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| object_vnum | int | fk to wiki_objects |
| location | tinyint | affect type |
| modifier | smallint | modifier value |

**relations:**
- object_vnum -> wiki_objects.vnum

#### wiki_object_slots
object wear slots

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| object_vnum | int | fk to wiki_objects |
| slot_id | tinyint | slot identifier |

**relations:**
- object_vnum -> wiki_objects.vnum

#### wiki_object_spell_effects
object spell effects

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| object_vnum | int | fk to wiki_objects |
| effect_name | varchar(100) | effect name |

**relations:**
- object_vnum -> wiki_objects.vnum

#### wiki_object_classes
object class restrictions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| object_vnum | int | fk to wiki_objects |
| class_id | int | class bit value |
| is_allowed | boolean | true=allowed, false=restricted |

**relations:**
- object_vnum -> wiki_objects.vnum

#### wiki_object_races
object race restrictions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| object_vnum | int | fk to wiki_objects |
| race_id | tinyint | race sequential id |
| is_allowed | boolean | true=allowed, false=restricted |

**relations:**
- object_vnum -> wiki_objects.vnum

#### wiki_mobs
game mob/npc data

| column | type | description |
|--------|------|-------------|
| zone_number | int | part of composite pk |
| vnum | int | part of composite pk |
| name | varchar(255) | mob name |
| name_ansi | varchar(500) | ansi-colored name |
| keywords | varchar(500) | search keywords |
| level | tinyint | mob level |
| alignment | smallint | alignment value |
| mob_class | bigint | class bitmask |
| species | tinyint | species id |
| gold | int | gold carried |
| exp | int | experience value |
| act_flags | int | act flags bitmask |
| hit_dice | varchar(50) | hit dice string |
| dam_dice | varchar(50) | damage dice string |
| ac | smallint | armor class |
| thac0 | smallint | thac0 value |
| long_desc | text | room description |
| detailed_desc | text | look description |
| created_at | datetime | creation time |
| updated_at | datetime | update time |

**primary key:** (zone_number, vnum)

#### wiki_mob_flags
parsed mob act flags

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| zone_number | int | fk zone |
| mob_vnum | int | fk vnum |
| flag_id | int | flag value |

**relations:**
- (zone_number, mob_vnum) -> wiki_mobs.(zone_number, vnum)

---

### PvP Interactions

#### pvp_battle_likes
battle likes from users

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| event_id | int | pkill_event id |
| account_name | varchar(50) | who liked |
| created_at | timestamp | like time |

**relations:**
- event_id -> pkill_event.id (mud table)

#### pvp_battle_favorites
battle favorites from users

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| event_id | int | pkill_event id |
| account_name | varchar(50) | who favorited |
| created_at | timestamp | favorite time |

**relations:**
- event_id -> pkill_event.id (mud table)

#### pvp_battle_comments
comments on pvp battles

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| event_id | int | pkill_event id |
| account_name | varchar(50) | commenter |
| character_pid | bigint | optional character |
| content | text | comment text |
| parent_id | int | parent comment |
| is_deleted | boolean | soft delete |
| quoted_text | text | quoted battle text |
| line_number | int | quoted line number |
| participant_id | int | quoted participant |
| created_at | timestamp | creation time |
| updated_at | timestamp | update time |

**relations:**
- event_id -> pkill_event.id (mud table)
- parent_id -> pvp_battle_comments.id (self-referential)

---

### Web Analytics

#### page_views
individual page view tracking

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| session_id | varchar(64) | session identifier |
| account_name | varchar(255) | logged in account |
| path | varchar(500) | page path |
| page_title | varchar(255) | page title |
| referrer | varchar(1000) | referrer url |
| referrer_domain | varchar(255) | referrer domain |
| utm_source | varchar(100) | utm source param |
| utm_medium | varchar(100) | utm medium param |
| utm_campaign | varchar(100) | utm campaign param |
| user_agent | varchar(500) | browser user agent |
| device_type | varchar(20) | mobile/desktop/tablet |
| browser | varchar(50) | browser name |
| os | varchar(50) | operating system |
| screen_width | int | screen width |
| screen_height | int | screen height |
| ip_address | varchar(45) | visitor ip |
| country | varchar(100) | country name |
| country_code | varchar(2) | iso country code |
| city | varchar(100) | city name |
| load_time_ms | int | page load time |
| created_at | timestamp | view time |

#### visitor_sessions
aggregated session data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| session_id | varchar(64) | unique session id |
| account_name | varchar(255) | logged in account |
| first_seen | timestamp | first page view |
| last_seen | timestamp | last page view |
| page_views | int | total page views |
| total_time_seconds | int | session duration |
| entry_page | varchar(500) | landing page |
| exit_page | varchar(500) | last page |
| referrer | varchar(1000) | original referrer |
| referrer_domain | varchar(255) | referrer domain |
| device_type | varchar(20) | device type |
| browser | varchar(50) | browser |
| os | varchar(50) | operating system |
| country | varchar(100) | country |
| city | varchar(100) | city |
| is_bounce | boolean | single page session |

---

### Server Monitoring

#### server_reboots
tracks mud server restarts

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| boot_time | int | unix timestamp boot |
| shutdown_time | int | unix timestamp shutdown |
| uptime_seconds | int | calculated uptime |
| shutdown_type | varchar(50) | type of shutdown |
| initiated_by | varchar(255) | who triggered |
| reason | text | shutdown reason |
| created_at | datetime | record creation |

#### server_health_metrics
historical health metrics

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| recorded_at | datetime | recording time |
| mud_is_running | boolean | if mud is running |
| mud_pid | int | process id |
| mud_uptime_seconds | int | current uptime |
| mud_cpu_percent | float | cpu usage |
| mud_memory_mb | float | memory usage |
| online_players | int | player count |
| db_connected | boolean | database status |
| db_query_time_ms | float | avg query time |
| db_connection_pool_used | int | active connections |
| db_connection_pool_total | int | total pool size |
| system_load_1m | float | 1-min load avg |
| system_load_5m | float | 5-min load avg |
| system_load_15m | float | 15-min load avg |
| disk_used_gb | float | disk used |
| disk_total_gb | float | disk total |
| disk_percent | float | disk usage percent |
| websocket_connections | int | ws connections |
| crashes_last_hour | int | recent crashes |
| crashes_last_24h | int | daily crashes |

#### server_incidents
status page incident timeline

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| started_at | datetime | incident start |
| ended_at | datetime | incident end |
| duration_seconds | int | calculated duration |
| incident_type | enum | 'crash', 'maintenance', 'degraded', 'outage' |
| severity | enum | 'critical', 'major', 'minor', 'info' |
| title | varchar(255) | incident title |
| description | text | detailed description |
| resolved | boolean | if resolved |
| resolution_notes | text | resolution details |
| crash_log_id | int | fk to crash_log |
| public_visible | boolean | show on public status page |
| reboot_type | varchar(50) | type of reboot |
| detected_by | varchar(255) | detection method |
| created_at | datetime | record creation |
| updated_at | datetime | last update |

**relations:**
- crash_log_id -> crash_log.id

#### crash_log
mud crash analysis

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| crash_timestamp | datetime | when crash occurred |
| detected_by | enum | 'exit_log', 'process_monitor', 'manual' |
| exit_code | int | process exit code |
| crash_signal | varchar(20) | sigsegv, sigabrt, etc |
| shutdown_reason | varchar(255) | reason string |
| pid | int | process id |
| uptime_seconds | int | uptime before crash |
| memory_mb | float | memory usage |
| cpu_percent | float | cpu usage |
| core_dump_path | varchar(512) | path to core dump |
| core_dump_size_bytes | bigint | core dump size |
| has_backtrace | boolean | has gdb backtrace |
| backtrace | longtext | full gdb output |
| crash_function | varchar(255) | crashing function |
| crash_file | varchar(255) | source file |
| crash_line | int | line number |
| exit_log_excerpt | text | last exit log lines |
| debug_log_excerpt | text | last debug log lines |
| online_players | int | players at crash time |
| last_command | text | last player command |
| analyzed | boolean | reviewed by admin |
| notes | text | admin notes |
| created_at | datetime | record creation |

#### gemini_analysis_log
ai crash analysis results

| column | type | description |
|--------|------|-------------|
| id | bigint | primary key |
| analysis_timestamp | timestamp | when analyzed |
| suspicious_count | int | suspicious accounts found |
| patterns_count | int | patterns detected |
| summary | text | executive summary |
| full_results | json | complete ai response |
| created_at | timestamp | record creation |

#### wipe_history
player wipe operations log

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| executed_by | varchar(50) | admin account |
| executed_at | datetime | wipe time |
| reason | text | wipe reason |
| backup_path | varchar(255) | backup file path |
| tables_affected | int | tables cleared |
| rows_affected | int | rows deleted |
| duration_seconds | int | operation duration |
| success | boolean | if completed |
| error_message | text | error if failed |
| notes | text | additional notes |
| ip_address | varchar(45) | admin ip |
| excluded_players | json | excluded pids |

---

### Backup & Restore

#### mud_backups
backup operation history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| filename | varchar(255) | backup filename |
| backup_type | varchar(20) | 'manual', 'scheduled', 'hourly' |
| status | varchar(20) | 'pending', 'in_progress', 'completed', 'failed' |
| progress | int | completion percentage |
| current_step | varchar(100) | current operation |
| file_size | bigint | backup file size |
| error_message | text | error if failed |
| created_by | varchar(100) | who initiated |
| ip_address | varchar(45) | initiator ip |
| started_at | datetime | start time |
| completed_at | datetime | completion time |

#### mud_restores
restore operation history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| backup_id | int | fk to mud_backups |
| restore_type | varchar(20) | 'full' or 'selective' |
| targets | json | what to restore |
| status | varchar(20) | operation status |
| progress | int | completion percentage |
| current_step | varchar(100) | current operation |
| error_message | text | error if failed |
| created_by | varchar(100) | who initiated |
| ip_address | varchar(45) | initiator ip |
| started_at | datetime | start time |
| completed_at | datetime | completion time |

**relations:**
- backup_id -> mud_backups.id

---

### Miscellaneous

#### notifications
unified notification system

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | recipient |
| source | varchar(20) | 'forum', 'builder', 'auction', etc |
| notification_type | varchar(50) | specific type |
| message | text | notification text |
| link | varchar(255) | navigation url |
| is_read | boolean | read status |
| created_at | datetime | creation time |
| read_at | datetime | when read |
| triggered_by_account | varchar(50) | who triggered |
| triggered_by_character | varchar(50) | character name |
| data | json | feature-specific data |

#### push_subscriptions
web push notification subscriptions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | subscriber |
| endpoint | text | push endpoint url |
| p256dh | varchar(255) | encryption key |
| auth | varchar(255) | auth secret |
| user_agent | varchar(500) | browser info |
| created_at | timestamp | subscription time |
| last_used_at | timestamp | last push time |

#### donations
ko-fi donation tracking

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| kofi_message_id | varchar(100) | unique ko-fi id |
| account_name | varchar(50) | linked mud account |
| kofi_email | varchar(255) | donor email |
| kofi_name | varchar(255) | donor name |
| amount | decimal(10,2) | donation amount |
| currency | varchar(10) | currency code |
| type | varchar(50) | donation type |
| message | text | donor message |
| is_public | boolean | show publicly |
| is_subscription | boolean | subscription payment |
| is_first_subscription | boolean | first sub payment |
| tier_name | varchar(100) | subscription tier |
| created_at | timestamp | donation time |

**relations:**
- account_name -> accounts.account_name

#### web_settings
website configuration

| column | type | description |
|--------|------|-------------|
| setting_key | varchar(100) | primary key |
| setting_value | mediumtext | setting value |
| description | varchar(500) | what setting does |
| updated_at | timestamp | last update |
| updated_by | varchar(50) | who updated |

#### website_changelog
website version changelog

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| version | varchar(50) | version string |
| title | varchar(255) | entry title |
| content | text | changelog content |
| category | enum | 'public' or 'admin' |
| created_by | varchar(50) | author |
| created_at | datetime | creation time |
| updated_at | datetime | update time |
| is_published | boolean | if visible |

#### website_changelog_reads
tracks which users read changelog entries

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| changelog_id | int | fk to website_changelog |
| account_name | varchar(50) | who read |
| read_at | datetime | when read |

**relations:**
- changelog_id -> website_changelog.id

#### help_file_suggestions
user-submitted help file changes

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| suggestion_type | enum | 'new' or 'edit' |
| page_id | int | existing page id |
| title | varchar(255) | suggested title |
| text | text | suggested content |
| category_id | int | category |
| see_also | text | related pages |
| submitter_notes | text | notes from submitter |
| status | enum | 'pending', 'in_review', etc |
| reviewer_account | varchar(50) | reviewer |
| reviewer_notes | text | reviewer comments |
| reviewed_at | datetime | review time |
| submitted_by | varchar(50) | submitter |
| submitted_at | datetime | submission time |
| updated_at | datetime | last update |
| ip_address | varchar(45) | submitter ip |

#### terminal_sessions
mud terminal session tracking

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(64) | who connected |
| started_at | datetime | session start |
| ended_at | datetime | session end |
| pid | int | process id |
| status | varchar(20) | 'active', 'ended', etc |

#### terminal_logs
terminal session audit logs

| column | type | description |
|--------|------|-------------|
| id | bigint | primary key |
| session_id | int | fk to terminal_sessions |
| timestamp | datetime(3) | event time |
| direction | varchar(10) | 'input' or 'output' |
| data | text | terminal data |

**relations:**
- session_id -> terminal_sessions.id

#### mud_control_log
mud process control audit

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| action | varchar(50) | 'start', 'stop', 'restart' |
| status | varchar(50) | operation status |
| account_name | varchar(255) | who initiated |
| ip_address | varchar(45) | initiator ip |
| reason | text | action reason |
| started_at | datetime | operation start |
| completed_at | datetime | operation end |
| error_message | text | error if failed |
| output | text | command output |
| cycle_mud_pid | int | cycle_mud process id |
| dms_pid | int | dms process id |

#### mud_process_state
current mud process state (singleton)

| column | type | description |
|--------|------|-------------|
| id | int | primary key (always 1) |
| cycle_mud_pid | int | current cycle_mud pid |
| dms_pid | int | current dms pid |
| state | varchar(50) | 'running', 'stopped', etc |
| last_start_time | datetime | last start |
| last_stop_time | datetime | last stop |
| started_by | varchar(255) | who started |
| updated_at | datetime | last update |

#### deployment_log
code deployment history

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(255) | who deployed |
| ip_address | varchar(45) | deployer ip |
| action | varchar(20) | 'deploy' or 'rollback' |
| from_hash | varchar(40) | git hash before |
| to_hash | varchar(40) | git hash after |
| git_output | text | git command output |
| compile_success | boolean | if compile succeeded |
| compile_output | mediumtext | make output |
| created_at | timestamp | deployment time |

---

## MUD Game Tables

these tables are managed by the mud server (myisam engine) and read/written by both mud and web

### Player Data

#### player_data
main player character data

| column | type | description |
|--------|------|-------------|
| pid | bigint | primary key, player id |
| name | varchar | character name |
| level | int | character level |
| racewar | int | alignment (good/evil) |
| assoc_id | int | fk to associations (guild) |
| copper | int | copper coins |
| silver | int | silver coins |
| gold | int | gold coins |
| platinum | int | platinum coins |
| ... | ... | many other game attributes |

**relations:**
- assoc_id -> associations.id

#### account_characters
links accounts to characters

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| account_name | varchar(50) | account name |
| pid | bigint | fk to player_data |
| email | varchar(255) | email from mud flatfile |
| last_ip | varchar(45) | last connection ip |

**relations:**
- pid -> player_data.pid

### Player Items & Skills

#### player_items
player inventory and equipment

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | item data |

#### player_item_affects
item affects/modifiers

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| item_id | int | fk to player_items |
| ... | ... | affect data |

#### player_skills
learned skills

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | skill data |

#### player_spellbooks
spellbook contents

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | spell data |

#### player_affects
active character affects

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | affect data |

#### player_timers
character timers/cooldowns

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | timer data |

#### player_pets
player companion/pet data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | pet data |

#### player_pet_items
pet inventory

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pet_id | int | fk to player_pets |
| ... | ... | item data |

#### player_pet_item_affects
pet item affects

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| item_id | int | fk to player_pet_items |
| ... | ... | affect data |

---

### PvP & Combat

#### pkill_event
pvp kill events

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| stamp | datetime | event timestamp |
| data | text | combat log data |
| like_count | int | denormalized likes |
| comment_count | int | denormalized comments |
| ... | ... | other event data |

#### pkill_info
pvp event participants

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| event_id | int | fk to pkill_event |
| pid | bigint | fk to player_data |
| pk_type | varchar | 'VICTIM', 'KILLER1', etc |
| inroom | boolean | if in room |
| player_description | text | formatted description |
| ... | ... | other participant data |

**relations:**
- event_id -> pkill_event.id
- pid -> player_data.pid

#### frag_leaderboard
pvp kill statistics

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| char_name | varchar | character name |
| race | varchar | race display name |
| class | varchar | class display name |
| total_frags | int | total kills |
| deleted_at | timestamp | soft delete |
| last_updated | datetime | last update |
| ... | ... | other stats |

**relations:**
- pid -> player_data.pid

---

### Auction System

#### auction_money_pickups
money waiting to be picked up

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| money | bigint | amount to pick up |

**relations:**
- pid -> player_data.pid

#### auction_item_pickups
items waiting to be picked up

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| obj_blob_str | text | serialized object |
| quantity | int | item count |
| retrieved | boolean | if picked up |

**relations:**
- pid -> player_data.pid

#### auction_bid_history
bid history for auctions

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| date | datetime | bid time |
| auction_id | int | auction identifier |
| bidder_pid | bigint | fk to player_data |
| bidder_name | varchar | bidder character name |
| bid_amount | bigint | bid amount |

**relations:**
- bidder_pid -> player_data.pid

---

### Guilds & Associations

#### associations
faction/association data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| name | varchar | association name |
| active | boolean | if active |
| ... | ... | other data |

#### guild_members
guild membership data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| guild_name | varchar | guild name |
| ... | ... | other data |

**relations:**
- pid -> player_data.pid

---

### Progression

#### progress
character progression data

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | progression data |

#### epic_gain
epic ability gains

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | epic data |

#### epic_bonus
epic bonuses

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | bonus data |

#### boons
character boons

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | boon data |

#### boons_progress
boon progression

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| ... | ... | progress data |

---

### Miscellaneous MUD

#### statistics
game statistics snapshots

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| stamp | datetime | snapshot time |
| data | text | statistics data |
| ... | ... | other stats |

#### offline_messages
messages for offline players

| column | type | description |
|--------|------|-------------|
| id | int | primary key |
| pid | bigint | fk to player_data |
| message | text | message content |
| ... | ... | other data |

**relations:**
- pid -> player_data.pid

---

## Relationship Diagram Summary

```
accounts (web)
  |
  +-- web_sessions
  +-- user_profiles
  |     +-- user_profile_stats
  |     +-- user_bans
  +-- admin_account_roles --> admin_roles --> admin_role_permissions --> admin_permissions
  +-- admin_account_permissions --> admin_permissions
  +-- account_login_history
  +-- notifications
  +-- push_subscriptions
  +-- donations

player_data (mud)
  |
  +-- account_characters --> accounts
  +-- player_items --> player_item_affects
  +-- player_skills
  +-- player_spellbooks
  +-- player_affects
  +-- player_timers
  +-- player_pets --> player_pet_items --> player_pet_item_affects
  +-- pkill_info --> pkill_event
  |     +-- pvp_battle_likes
  |     +-- pvp_battle_favorites
  |     +-- pvp_battle_comments
  +-- frag_leaderboard
  +-- guild_members
  +-- associations
  +-- auction_money_pickups
  +-- auction_item_pickups
  +-- auction_bid_history
  +-- progress
  +-- epic_gain
  +-- epic_bonus
  +-- boons
  +-- boons_progress
  +-- offline_messages

forum_categories (self-referential parent_id)
  |
  +-- forum_category_permissions
  +-- forum_threads
        +-- forum_posts
        |     +-- forum_reactions
        |     +-- forum_mentions
        |     +-- forum_post_images
        +-- forum_subscriptions
        +-- forum_polls
              +-- forum_poll_options
              +-- forum_poll_votes
              +-- forum_poll_vote_history

builder_zone_info
  +-- builder_zone_permissions
  +-- builder_zone_info_history
  +-- builder_zone_comments
  +-- builder_proc_requests

wiki_continents --> wiki_map_positions
wiki_zone_entrances
wiki_objects
  +-- wiki_object_affects
  +-- wiki_object_slots
  +-- wiki_object_spell_effects
  +-- wiki_object_classes
  +-- wiki_object_races
wiki_mobs --> wiki_mob_flags

crash_log --> server_incidents
server_health_metrics
server_reboots

mud_backups --> mud_restores
mud_control_log
mud_process_state
deployment_log

page_views
visitor_sessions

website_changelog --> website_changelog_reads
web_settings
wiki_settings
forum_settings
help_file_suggestions
terminal_sessions --> terminal_logs
```
