-- Table: account_login_history
CREATE TABLE `account_login_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account name',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP address (IPv4 or IPv6)',
  `client` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('login','logout') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Login or logout event',
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Event timestamp',
  `character_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Character name used during login',
  `hostname` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Reverse DNS hostname',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_connection_event` (`timestamp`,`account_name`,`character_name`,`ip_address`,`status`),
  KEY `idx_account_name` (`account_name`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_account_timestamp` (`account_name`,`timestamp`),
  KEY `idx_character_name` (`character_name`),
  KEY `idx_ip_address` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_permissions
CREATE TABLE `admin_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `permission_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_permissions_permission_key_unique` (`permission_key`),
  KEY `admin_permissions_category_index` (`category`),
  KEY `admin_permissions_sort_order_index` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_account_permissions
CREATE TABLE `admin_account_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission_id` int unsigned NOT NULL,
  `granted_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_account_permissions_account_name_permission_id_unique` (`account_name`,`permission_id`),
  KEY `admin_account_permissions_permission_id_foreign` (`permission_id`),
  KEY `admin_account_permissions_account_name_index` (`account_name`),
  CONSTRAINT `admin_account_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_roles
CREATE TABLE `admin_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_system_role` tinyint(1) DEFAULT '0',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_roles_role_name_unique` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_account_roles
CREATE TABLE `admin_account_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_id` int unsigned NOT NULL,
  `granted_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_account_roles_account_name_role_id_unique` (`account_name`,`role_id`),
  KEY `admin_account_roles_role_id_foreign` (`role_id`),
  KEY `admin_account_roles_account_name_index` (`account_name`),
  CONSTRAINT `admin_account_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_action_log
CREATE TABLE `admin_action_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Action type: property_change, wipe, etc.',
  `target` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Property key, table name, or affected entity',
  `old_value` text COLLATE utf8mb4_unicode_ci,
  `new_value` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Optional notes or reason for change',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account` (`account_name`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_target` (`target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit log for all administrative actions';

-- Table: admin_permission_audit
CREATE TABLE `admin_permission_audit` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account that performed the action',
  `action_type` enum('assign_role','revoke_role','grant_permission','revoke_permission') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account that was affected',
  `target_item` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Role name or permission key',
  `target_id` int DEFAULT NULL COMMENT 'Role ID or permission ID',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Optional reason or context',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_perm_audit_account` (`account_name`),
  KEY `idx_perm_audit_action` (`action_type`),
  KEY `idx_perm_audit_target` (`target_account`),
  KEY `idx_perm_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: admin_role_permissions
CREATE TABLE `admin_role_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `role_id` int unsigned NOT NULL,
  `permission_id` int unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `admin_role_permissions_role_id_permission_id_unique` (`role_id`,`permission_id`),
  KEY `admin_role_permissions_permission_id_foreign` (`permission_id`),
  CONSTRAINT `admin_role_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `admin_permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_role_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `admin_roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_activity_log
CREATE TABLE `builder_activity_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_vnum` int DEFAULT NULL,
  `entity_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account` (`account_name`),
  KEY `idx_zone` (`zone_id`),
  KEY `idx_entity_type` (`entity_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_account_created` (`account_name`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_flags
CREATE TABLE `builder_flags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` bigint NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ansi_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `short_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `editable` tinyint unsigned NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `source_file` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_category_name` (`category`,`name`),
  KEY `idx_builder_flags_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_mentions
CREATE TABLE `builder_mentions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int unsigned NOT NULL,
  `mentioned_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mentioned_by_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mention_entity` (`entity_type`,`entity_id`),
  KEY `idx_mention_mentioned` (`mentioned_account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_proc_requests
CREATE TABLE `builder_proc_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vnum` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `description_html` text COLLATE utf8mb4_unicode_ci,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `assigned_to` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_proc_zone` (`zone_id`),
  KEY `idx_proc_status` (`status`),
  KEY `idx_proc_assigned` (`assigned_to`),
  KEY `idx_proc_requested_by` (`requested_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_zone_comments
CREATE TABLE `builder_zone_comments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `proc_request_id` int unsigned DEFAULT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_html` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comment_zone` (`zone_id`),
  KEY `idx_comment_parent` (`parent_id`),
  KEY `idx_comment_proc_request` (`proc_request_id`),
  KEY `idx_comment_account` (`account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_zone_info
CREATE TABLE `builder_zone_info` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `description_html` text COLLATE utf8mb4_unicode_ci,
  `owner_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `builder_zone_info_zone_id_unique` (`zone_id`),
  KEY `idx_zone_info_zone_id` (`zone_id`),
  KEY `idx_zone_info_owner` (`owner_account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_zone_info_history
CREATE TABLE `builder_zone_info_history` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `field_changed` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_zone` (`zone_id`),
  KEY `idx_history_changed` (`changed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: builder_zone_permissions
CREATE TABLE `builder_zone_permissions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `permission_level` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_zone_account` (`zone_id`,`account_name`),
  KEY `idx_zone_perm_account` (`account_name`),
  KEY `idx_zone_perm_zone` (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: deployment_log
CREATE TABLE `deployment_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_hash` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_hash` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `git_output` text COLLATE utf8mb4_unicode_ci,
  `compile_success` tinyint(1) DEFAULT NULL,
  `compile_output` mediumtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_deployment_account` (`account_name`),
  KEY `idx_deployment_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: donations
CREATE TABLE `donations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `kofi_message_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ko-fi unique id, prevents duplicates',
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'linked mud account (null if no email match)',
  `kofi_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kofi_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Donation, Subscription, Commission, Shop Order',
  `message` text COLLATE utf8mb4_unicode_ci,
  `is_public` tinyint(1) DEFAULT '0',
  `is_subscription` tinyint(1) DEFAULT '0',
  `is_first_subscription` tinyint(1) DEFAULT '0',
  `tier_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `donations_kofi_message_id_unique` (`kofi_message_id`),
  KEY `idx_donations_account` (`account_name`),
  KEY `idx_donations_email` (`kofi_email`),
  KEY `idx_donations_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: donation_outbox
CREATE TABLE `donation_outbox` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `donation_id` int unsigned NOT NULL,
  `event_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `character_name` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message` varchar(256) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `attempts` int unsigned NOT NULL DEFAULT '0',
  `available_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `locked_at` timestamp NULL DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `last_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `donation_outbox_donation_id_unique` (`donation_id`),
  UNIQUE KEY `donation_outbox_event_id_unique` (`event_id`),
  KEY `idx_donation_outbox_ready` (`status`,`available_at`),
  CONSTRAINT `donation_outbox_donation_id_foreign` FOREIGN KEY (`donation_id`) REFERENCES `donations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_categories
CREATE TABLE `forum_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `access_type` enum('public','authenticated','role_based','guild','custom_acl') COLLATE utf8mb4_unicode_ci DEFAULT 'public' COMMENT 'Access control type: public=everyone, authenticated=logged in, role_based=min level, guild=guild only, custom_acl=use permissions table',
  `guild_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parent_id` int DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `icon` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Lucide icon name or emoji',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `min_level_to_view` int DEFAULT NULL COMMENT 'Override: min level to view (NULL=use access_type)',
  `min_level_to_post` int DEFAULT NULL COMMENT 'Override: min level to post (NULL=use global)',
  `min_level_to_moderate` int DEFAULT NULL COMMENT 'Override: min level to moderate (NULL=use global)',
  `is_archived` tinyint(1) DEFAULT '0',
  `archived_at` timestamp NULL DEFAULT NULL,
  `archived_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `min_level` int DEFAULT NULL COMMENT 'Minimum immortal level for role_based access (57-62)',
  PRIMARY KEY (`id`),
  KEY `idx_sort` (`sort_order`),
  KEY `idx_access` (`access_type`),
  KEY `idx_guild` (`guild_name`),
  KEY `idx_archived` (`is_archived`,`sort_order`),
  KEY `idx_parent` (`parent_id`),
  CONSTRAINT `forum_categories_ibfk_1` FOREIGN KEY (`parent_id`) REFERENCES `forum_categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_category_permissions
CREATE TABLE `forum_category_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL COMMENT 'Category this permission applies to',
  `permission_type` enum('allow','deny') COLLATE utf8mb4_unicode_ci DEFAULT 'allow' COMMENT 'Allow or deny access',
  `min_immortal_level` int DEFAULT NULL COMMENT 'Applies to users with this level or higher (57-62)',
  `guild_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Applies to members of this guild',
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Applies to specific account',
  `character_pid` bigint DEFAULT NULL COMMENT 'Applies to specific character',
  `can_view` tinyint(1) DEFAULT '1' COMMENT 'Can see category and threads',
  `can_post` tinyint(1) DEFAULT '1' COMMENT 'Can create threads and reply',
  `can_moderate` tinyint(1) DEFAULT '0' COMMENT 'Can moderate this category',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account that created this permission',
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_account` (`account_name`),
  KEY `idx_character` (`character_pid`),
  KEY `idx_guild` (`guild_name`),
  KEY `idx_level` (`min_immortal_level`),
  CONSTRAINT `forum_category_permissions_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `forum_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Access Control List for forum categories';

-- Table: forum_mentions
CREATE TABLE `forum_mentions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `mentioned_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mentioned_by_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mentioned` (`mentioned_account_name`),
  KEY `idx_post` (`post_id`),
  KEY `idx_mentioned_by` (`mentioned_by_account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_moderation_log
CREATE TABLE `forum_moderation_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `moderator_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account name of moderator',
  `action_type` enum('delete_post','delete_thread','restore_post','restore_thread','move_thread','lock_thread','unlock_thread','pin_thread','unpin_thread') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` enum('post','thread') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` int NOT NULL COMMENT 'Post ID or Thread ID',
  `category_id` int DEFAULT NULL COMMENT 'Category ID (for thread actions)',
  `new_category_id` int DEFAULT NULL COMMENT 'New category ID (for move actions)',
  `reason` text COLLATE utf8mb4_unicode_ci COMMENT 'Reason for moderation action',
  `original_content` text COLLATE utf8mb4_unicode_ci COMMENT 'Original content before deletion (for restore)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_moderator` (`moderator_account`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_target` (`target_type`,`target_id`),
  KEY `idx_created_at` (`created_at` DESC),
  KEY `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_permission_audit
CREATE TABLE `forum_permission_audit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `changed_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Account name',
  `change_type` enum('setting','category_permission') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Setting key or category ID',
  `old_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_changed_by` (`changed_by`),
  KEY `idx_changed_at` (`changed_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_threads
CREATE TABLE `forum_threads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `author_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_character_pid` bigint DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_post_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_pinned` tinyint(1) DEFAULT '0',
  `is_locked` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint(1) DEFAULT '0',
  `view_count` int DEFAULT '0',
  `reply_count` int DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT 'When thread was deleted',
  `deleted_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Account name of who deleted it',
  PRIMARY KEY (`id`),
  KEY `idx_category_pinned_last_post` (`category_id`,`is_pinned` DESC,`last_post_at` DESC),
  KEY `idx_author_account` (`author_account_name`),
  KEY `idx_author_character` (`author_character_pid`),
  KEY `idx_created` (`created_at`),
  KEY `idx_threads_deleted` (`is_deleted`,`deleted_at`),
  KEY `idx_threads_ip` (`ip_address`),
  FULLTEXT KEY `idx_title_content` (`title`,`content`),
  CONSTRAINT `forum_threads_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `forum_categories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_polls
CREATE TABLE `forum_polls` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `question` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_multiple_choice` tinyint(1) DEFAULT '0' COMMENT 'Allow selecting multiple options',
  `min_choices` int DEFAULT '1' COMMENT 'Minimum selections (for multiple choice)',
  `max_choices` int DEFAULT '1' COMMENT 'Maximum selections (1 for single choice)',
  `is_anonymous` tinyint(1) DEFAULT '1' COMMENT 'Hide voter identities',
  `results_visibility` enum('always','after_voting','after_expiration') COLLATE utf8mb4_unicode_ci DEFAULT 'always' COMMENT 'When results are visible',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'Poll expiration date (NULL = never expires)',
  `created_by_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_closed` tinyint(1) DEFAULT '0' COMMENT 'Manually closed by creator/moderator',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_thread_poll` (`thread_id`),
  KEY `idx_thread` (`thread_id`),
  KEY `idx_expires` (`expires_at`),
  KEY `idx_created` (`created_at`),
  KEY `idx_creator` (`created_by_account`),
  CONSTRAINT `forum_polls_ibfk_1` FOREIGN KEY (`thread_id`) REFERENCES `forum_threads` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_poll_options
CREATE TABLE `forum_poll_options` (
  `id` int NOT NULL AUTO_INCREMENT,
  `poll_id` int NOT NULL,
  `option_text` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int DEFAULT '0' COMMENT 'Display order (0-indexed)',
  `vote_count` int DEFAULT '0' COMMENT 'Updated on vote changes to avoid COUNT() queries',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_poll_sort` (`poll_id`,`sort_order`),
  KEY `idx_poll` (`poll_id`),
  CONSTRAINT `forum_poll_options_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `forum_polls` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_poll_vote_history
CREATE TABLE `forum_poll_vote_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `poll_id` int NOT NULL,
  `voter_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_option_ids` json DEFAULT NULL COMMENT 'Previous selections as JSON array',
  `new_option_ids` json DEFAULT NULL COMMENT 'New selections as JSON array',
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_poll` (`poll_id`),
  KEY `idx_voter` (`voter_account`),
  KEY `idx_changed` (`changed_at`),
  CONSTRAINT `forum_poll_vote_history_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `forum_polls` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_poll_votes
CREATE TABLE `forum_poll_votes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `poll_id` int NOT NULL,
  `option_id` int NOT NULL,
  `voter_account` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `voted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_poll_option_voter` (`poll_id`,`option_id`,`voter_account`),
  KEY `idx_poll_voter` (`poll_id`,`voter_account`),
  KEY `idx_option` (`option_id`),
  KEY `idx_voter` (`voter_account`),
  CONSTRAINT `forum_poll_votes_ibfk_1` FOREIGN KEY (`poll_id`) REFERENCES `forum_polls` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_poll_votes_ibfk_2` FOREIGN KEY (`option_id`) REFERENCES `forum_poll_options` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_posts
CREATE TABLE `forum_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `thread_id` int NOT NULL,
  `parent_post_id` int DEFAULT NULL,
  `author_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_character_pid` bigint DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `edited_at` timestamp NULL DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL COMMENT 'When post was deleted',
  `deleted_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Account name of who deleted it',
  PRIMARY KEY (`id`),
  KEY `parent_post_id` (`parent_post_id`),
  KEY `idx_thread_created` (`thread_id`,`created_at`),
  KEY `idx_author_account` (`author_account_name`),
  KEY `idx_author_character` (`author_character_pid`),
  KEY `idx_posts_deleted` (`is_deleted`,`deleted_at`),
  KEY `idx_posts_ip` (`ip_address`),
  FULLTEXT KEY `idx_content` (`content`),
  CONSTRAINT `forum_posts_ibfk_1` FOREIGN KEY (`thread_id`) REFERENCES `forum_threads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_posts_ibfk_2` FOREIGN KEY (`parent_post_id`) REFERENCES `forum_posts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_post_images
CREATE TABLE `forum_post_images` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `post_id` int DEFAULT NULL,
  `thread_id` int DEFAULT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mime_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int unsigned NOT NULL,
  `width` int unsigned DEFAULT NULL,
  `height` int unsigned DEFAULT NULL,
  `is_orphan` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `linked_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `forum_post_images_post_id_index` (`post_id`),
  KEY `forum_post_images_thread_id_index` (`thread_id`),
  KEY `forum_post_images_account_name_index` (`account_name`),
  KEY `forum_post_images_is_orphan_created_at_index` (`is_orphan`,`created_at`),
  CONSTRAINT `forum_post_images_post_id_foreign` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `forum_post_images_thread_id_foreign` FOREIGN KEY (`thread_id`) REFERENCES `forum_threads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_reactions
CREATE TABLE `forum_reactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int DEFAULT NULL,
  `thread_id` int DEFAULT NULL,
  `user_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emoji` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_reaction` (`post_id`,`user_account_name`,`emoji`),
  KEY `idx_post` (`post_id`),
  KEY `idx_thread` (`thread_id`),
  CONSTRAINT `forum_reactions_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_reactions_post_fk` FOREIGN KEY (`post_id`) REFERENCES `forum_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_reactions_thread_fk` FOREIGN KEY (`thread_id`) REFERENCES `forum_threads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_post_or_thread` CHECK ((((`post_id` is not null) and (`thread_id` is null)) or ((`post_id` is null) and (`thread_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_settings
CREATE TABLE `forum_settings` (
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`setting_key`),
  KEY `idx_settings_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: forum_subscriptions
CREATE TABLE `forum_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subscription_type` enum('thread','category') COLLATE utf8mb4_unicode_ci NOT NULL,
  `thread_id` int DEFAULT NULL,
  `category_id` int DEFAULT NULL,
  `notification_preference` enum('all','mentions','none') COLLATE utf8mb4_unicode_ci DEFAULT 'all' COMMENT 'all = notify on all posts, mentions = only @mentions, none = no notifications',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_thread_subscription` (`user_account_name`,`thread_id`),
  UNIQUE KEY `unique_category_subscription` (`user_account_name`,`category_id`),
  KEY `idx_account` (`user_account_name`),
  KEY `idx_thread` (`thread_id`),
  KEY `idx_category` (`category_id`),
  KEY `idx_type` (`subscription_type`),
  CONSTRAINT `forum_subscriptions_ibfk_1` FOREIGN KEY (`thread_id`) REFERENCES `forum_threads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_subscriptions_ibfk_2` FOREIGN KEY (`category_id`) REFERENCES `forum_categories` (`id`) ON DELETE CASCADE,
  CONSTRAINT `forum_subscriptions_chk_1` CHECK ((((`subscription_type` = _utf8mb4'thread') and (`thread_id` is not null) and (`category_id` is null)) or ((`subscription_type` = _utf8mb4'category') and (`category_id` is not null) and (`thread_id` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: gemini_analysis_log
CREATE TABLE `gemini_analysis_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `analysis_timestamp` timestamp NOT NULL COMMENT 'When the AI analysis was performed',
  `suspicious_count` int NOT NULL DEFAULT '0' COMMENT 'Number of suspicious accounts found',
  `patterns_count` int NOT NULL DEFAULT '0' COMMENT 'Number of patterns detected',
  `summary` text COLLATE utf8mb4_unicode_ci COMMENT 'Executive summary of findings',
  `full_results` json DEFAULT NULL COMMENT 'Complete JSON response from Gemini',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `gemini_analysis_log_analysis_timestamp_index` (`analysis_timestamp`),
  KEY `gemini_analysis_log_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: help_file_suggestions
CREATE TABLE `help_file_suggestions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `suggestion_type` enum('new','edit') COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_id` int unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int NOT NULL DEFAULT '0',
  `see_also` text COLLATE utf8mb4_unicode_ci,
  `submitter_notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','in_review','approved','rejected','needs_revision') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewer_account` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewer_notes` text COLLATE utf8mb4_unicode_ci,
  `reviewed_at` datetime DEFAULT NULL,
  `submitted_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_submitted_by` (`submitted_by`),
  KEY `idx_page_id` (`page_id`),
  KEY `idx_submitted_at` (`submitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: mud_backups
CREATE TABLE `mud_backups` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `backup_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `progress` int NOT NULL DEFAULT '0',
  `current_step` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_backup_status` (`status`),
  KEY `idx_backup_started` (`started_at`),
  KEY `idx_backup_type` (`backup_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: mud_control_log
CREATE TABLE `mud_control_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `cycle_mud_pid` int DEFAULT NULL,
  `dms_pid` int DEFAULT NULL,
  `output` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_control_account` (`account_name`),
  KEY `idx_control_started` (`started_at`),
  KEY `idx_control_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: mud_process_state
CREATE TABLE `mud_process_state` (
  `id` int unsigned NOT NULL DEFAULT '1',
  `cycle_mud_pid` int DEFAULT NULL,
  `dms_pid` int DEFAULT NULL,
  `state` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `last_start_time` datetime DEFAULT NULL,
  `last_stop_time` datetime DEFAULT NULL,
  `started_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: mud_restores
CREATE TABLE `mud_restores` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `backup_id` int unsigned NOT NULL,
  `restore_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `accounts` json DEFAULT NULL,
  `characters` json DEFAULT NULL,
  `categories` json DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `progress` int NOT NULL DEFAULT '0',
  `current_step` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_by` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_restore_backup_id` (`backup_id`),
  KEY `idx_restore_status` (`status`),
  KEY `idx_restore_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: notifications
CREATE TABLE `notifications` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  `triggered_by_account` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `triggered_by_character` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_account_read` (`account_name`,`is_read`),
  KEY `idx_notif_source` (`source`),
  KEY `idx_notif_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: page_views
CREATE TABLE `page_views` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `page_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer_domain` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_medium` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `utm_campaign` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `browser` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `screen_width` int DEFAULT NULL,
  `screen_height` int DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `load_time_ms` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `page_views_session_id_index` (`session_id`),
  KEY `page_views_account_name_index` (`account_name`),
  KEY `page_views_referrer_domain_index` (`referrer_domain`),
  KEY `idx_path_prefix` (`path`(100)),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_page_views_country_code` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: push_subscriptions
CREATE TABLE `push_subscriptions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_agent` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `push_subscriptions_account_name_index` (`account_name`),
  KEY `push_subscriptions_created_at_index` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: pvp_battle_comments
CREATE TABLE `pvp_battle_comments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `character_pid` bigint DEFAULT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` int unsigned DEFAULT NULL,
  `is_deleted` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `quoted_text` text COLLATE utf8mb4_unicode_ci,
  `line_number` int DEFAULT NULL,
  `participant_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comment_event` (`event_id`),
  KEY `idx_comment_account` (`account_name`),
  KEY `idx_comment_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: pvp_battle_favorites
CREATE TABLE `pvp_battle_favorites` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_battle_favorite` (`event_id`,`account_name`),
  KEY `idx_favorite_event` (`event_id`),
  KEY `idx_favorite_account` (`account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: pvp_battle_likes
CREATE TABLE `pvp_battle_likes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_battle_like` (`event_id`,`account_name`),
  KEY `idx_like_event` (`event_id`),
  KEY `idx_like_account` (`account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: server_health_metrics
CREATE TABLE `server_health_metrics` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `mud_is_running` tinyint(1) NOT NULL,
  `mud_pid` int DEFAULT NULL,
  `mud_uptime_seconds` int DEFAULT NULL,
  `mud_cpu_percent` float(8,2) DEFAULT NULL,
  `mud_memory_mb` float(8,2) DEFAULT NULL,
  `online_players` int DEFAULT '0',
  `db_connected` tinyint(1) NOT NULL,
  `db_query_time_ms` float(8,2) DEFAULT NULL COMMENT 'Average query response time',
  `db_connection_pool_used` int DEFAULT NULL COMMENT 'Active database connections',
  `db_connection_pool_total` int DEFAULT NULL COMMENT 'Total connection pool size',
  `system_load_1m` float(8,2) DEFAULT NULL COMMENT '1-minute load average',
  `system_load_5m` float(8,2) DEFAULT NULL COMMENT '5-minute load average',
  `system_load_15m` float(8,2) DEFAULT NULL COMMENT '15-minute load average',
  `disk_used_gb` float(8,2) DEFAULT NULL,
  `disk_total_gb` float(8,2) DEFAULT NULL,
  `disk_percent` float(8,2) DEFAULT NULL,
  `websocket_connections` int DEFAULT '0',
  `crashes_last_hour` int DEFAULT '0',
  `crashes_last_24h` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_recorded_at` (`recorded_at`),
  KEY `idx_mud_is_running` (`mud_is_running`),
  KEY `idx_crashes_24h` (`crashes_last_24h`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: server_incidents
CREATE TABLE `server_incidents` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `duration_seconds` int DEFAULT NULL COMMENT 'Calculated when incident ends',
  `incident_type` enum('crash','shutdown','reboot','copyover','maintenance','degraded','outage') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('critical','major','minor','info') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'minor',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Brief incident title',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT 'Detailed incident description',
  `resolved` tinyint(1) DEFAULT '0',
  `resolution_notes` text COLLATE utf8mb4_unicode_ci,
  `public_visible` tinyint(1) DEFAULT '0' COMMENT 'Show on public status page',
  `detected_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exit_code` int DEFAULT NULL COMMENT 'Process exit code',
  `crash_signal` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SIGSEGV, SIGABRT, etc.',
  `shutdown_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable shutdown reason',
  `pid` int DEFAULT NULL COMMENT 'Process ID at crash',
  `uptime_seconds` int DEFAULT NULL COMMENT 'How long MUD was running before crash',
  `memory_mb` float(8,2) DEFAULT NULL COMMENT 'Memory usage in MiB',
  `cpu_percent` float(8,2) DEFAULT NULL COMMENT 'CPU usage percentage',
  `core_dump_path` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Path to core dump file',
  `core_dump_size_bytes` bigint DEFAULT NULL COMMENT 'Size of core dump in bytes',
  `has_backtrace` tinyint(1) DEFAULT '0',
  `backtrace` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Full GDB backtrace output',
  `crash_function` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Function where crash occurred',
  `crash_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Source file where crash occurred',
  `crash_line` int DEFAULT NULL COMMENT 'Line number where crash occurred',
  `exit_log_excerpt` text COLLATE utf8mb4_unicode_ci COMMENT 'Last lines from exit log before crash',
  `debug_log_excerpt` text COLLATE utf8mb4_unicode_ci COMMENT 'Last lines from debug log before crash',
  `online_players` int DEFAULT '0' COMMENT 'Number of players online when crashed',
  `last_command` text COLLATE utf8mb4_unicode_ci COMMENT 'Last player command executed (if available)',
  `analyzed` tinyint(1) DEFAULT '0' COMMENT 'Has this crash been reviewed by admin',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Admin notes about crash and resolution',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `wholist_snapshot` text COLLATE utf8mb4_unicode_ci COMMENT 'List of online players before crash',
  `cmd_debug_last3` text COLLATE utf8mb4_unicode_ci COMMENT 'Last 3 lines from cmd.debug log',
  `status_log_last3` text COLLATE utf8mb4_unicode_ci COMMENT 'Last 3 lines from status log',
  `wizcmds_last3` text COLLATE utf8mb4_unicode_ci COMMENT 'Last 3 lines from wizcmds log',
  PRIMARY KEY (`id`),
  KEY `idx_incidents_started_at` (`started_at`),
  KEY `idx_incidents_type` (`incident_type`),
  KEY `idx_incidents_resolved` (`resolved`),
  KEY `idx_incidents_severity` (`severity`),
  KEY `idx_incidents_exit_code` (`exit_code`),
  KEY `idx_incidents_analyzed` (`analyzed`),
  KEY `idx_incidents_crash_function` (`crash_function`),
  KEY `idx_incidents_detected_by` (`detected_by`),
  KEY `idx_incidents_public_visible` (`public_visible`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: suspicious_accounts
CREATE TABLE `suspicious_accounts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Flagged account name',
  `suspicion_score` int NOT NULL COMMENT 'Score from 0-100',
  `evidence` json DEFAULT NULL COMMENT 'JSON evidence: shared IPs, overlapping sessions, etc.',
  `flagged_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When account was flagged',
  `reviewed_at` timestamp NULL DEFAULT NULL COMMENT 'When flag was reviewed',
  `reviewed_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Overlord who reviewed',
  `review_notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Review notes',
  `is_resolved` tinyint(1) DEFAULT '0' COMMENT 'Whether flag has been reviewed',
  PRIMARY KEY (`id`),
  KEY `idx_suspicious_account` (`account_name`),
  KEY `idx_is_resolved` (`is_resolved`),
  KEY `idx_suspicion_score` (`suspicion_score`),
  KEY `idx_flagged_at` (`flagged_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: terminal_sessions
CREATE TABLE `terminal_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `account_name` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` datetime DEFAULT NULL,
  `pid` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `idx_terminal_account` (`account_name`),
  KEY `idx_terminal_started` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: terminal_logs
CREATE TABLE `terminal_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `session_id` int unsigned NOT NULL,
  `timestamp` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `direction` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` text COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_terminal_logs_session` (`session_id`),
  KEY `idx_terminal_logs_timestamp` (`timestamp`),
  CONSTRAINT `terminal_logs_session_id_foreign` FOREIGN KEY (`session_id`) REFERENCES `terminal_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_profiles
CREATE TABLE `user_profiles` (
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `avatar_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `banner_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`account_name`),
  KEY `idx_last_seen` (`last_seen_at` DESC),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_bans
CREATE TABLE `user_bans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `account_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `banned_by` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `banned_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `unbanned_at` timestamp NULL DEFAULT NULL,
  `unbanned_by` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_account_active` (`account_name`,`is_active`),
  KEY `idx_banned_by` (`banned_by`),
  KEY `idx_banned_at` (`banned_at`),
  CONSTRAINT `user_bans_ibfk_1` FOREIGN KEY (`account_name`) REFERENCES `user_profiles` (`account_name`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: user_profile_stats
CREATE TABLE `user_profile_stats` (
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_posts` int DEFAULT '0',
  `total_threads` int DEFAULT '0',
  `total_reactions_received` int DEFAULT '0',
  `reputation_score` int DEFAULT '0',
  `first_post_at` timestamp NULL DEFAULT NULL,
  `last_post_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`account_name`),
  KEY `idx_total_posts` (`total_posts` DESC),
  KEY `idx_reputation` (`reputation_score` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: visitor_sessions
CREATE TABLE `visitor_sessions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `page_views` int DEFAULT '1',
  `total_time_seconds` int DEFAULT '0',
  `entry_page` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exit_page` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `referrer_domain` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `browser` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `os` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_bounce` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `visitor_sessions_session_id_unique` (`session_id`),
  KEY `visitor_sessions_account_name_index` (`account_name`),
  KEY `visitor_sessions_referrer_domain_index` (`referrer_domain`),
  KEY `idx_first_seen` (`first_seen`),
  KEY `idx_last_seen` (`last_seen`),
  KEY `idx_visitor_sessions_country_code` (`country_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: web_donation_totals
CREATE TABLE `web_donation_totals` (
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_cents` bigint unsigned NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: web_pvp_discord_deliveries
CREATE TABLE `web_pvp_discord_deliveries` (
  `channel_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` bigint unsigned NOT NULL,
  `nonce` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `attempts` int unsigned NOT NULL DEFAULT '0',
  `ambiguous` tinyint(1) NOT NULL DEFAULT '0',
  `available_at` datetime NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `delivered_by` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`channel_id`,`event_id`),
  UNIQUE KEY `id` (`id`),
  KEY `idx_pvp_discord_ready` (`channel_id`,`status`,`available_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: web_pvp_discord_destinations
CREATE TABLE `web_pvp_discord_destinations` (
  `channel_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `boundary_event_id` bigint unsigned NOT NULL,
  `activated_at` datetime NOT NULL,
  `available_at` datetime NOT NULL,
  `blocked_reason` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`channel_id`),
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: web_sessions
CREATE TABLE `web_sessions` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `refresh_token` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_account` (`account_name`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: web_settings
CREATE TABLE `web_settings` (
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` mediumtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: website_changelog
CREATE TABLE `website_changelog` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('public','admin') COLLATE utf8mb4_unicode_ci DEFAULT 'public',
  `created_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `is_published` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_changelog_category` (`category`),
  KEY `idx_changelog_published` (`is_published`),
  KEY `idx_changelog_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: website_changelog_reads
CREATE TABLE `website_changelog_reads` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `changelog_id` int unsigned NOT NULL,
  `account_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_changelog_read` (`changelog_id`,`account_name`),
  KEY `idx_changelog_reads_account` (`account_name`),
  CONSTRAINT `website_changelog_reads_changelog_id_foreign` FOREIGN KEY (`changelog_id`) REFERENCES `website_changelog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_continents
CREATE TABLE `wiki_continents` (
  `id` int unsigned NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_ansi` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `seed_room_vnum` int unsigned NOT NULL,
  `center_x` int DEFAULT NULL,
  `center_y` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_map_positions
CREATE TABLE `wiki_map_positions` (
  `room_vnum` int unsigned NOT NULL,
  `x_coord` int NOT NULL,
  `y_coord` int NOT NULL,
  `z_coord` int NOT NULL DEFAULT '0',
  `sector_type` tinyint unsigned NOT NULL,
  `zone_number` int unsigned NOT NULL,
  `zone_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `room_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `continent_id` int unsigned DEFAULT NULL,
  `is_map_room` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_vnum`),
  KEY `idx_wiki_map_coords` (`x_coord`,`y_coord`),
  KEY `idx_wiki_map_zone` (`zone_number`),
  KEY `idx_wiki_map_continent` (`continent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_mobs
CREATE TABLE `wiki_mobs` (
  `zone_number` int unsigned NOT NULL,
  `vnum` int unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_ansi` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `keywords` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `level` tinyint unsigned NOT NULL DEFAULT '1',
  `alignment` smallint NOT NULL DEFAULT '0',
  `mob_class` bigint unsigned NOT NULL DEFAULT '0',
  `species` tinyint unsigned NOT NULL DEFAULT '0',
  `gold` int unsigned NOT NULL DEFAULT '0',
  `exp` int unsigned NOT NULL DEFAULT '0',
  `act_flags` int unsigned NOT NULL DEFAULT '0',
  `hit_dice` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dam_dice` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ac` smallint NOT NULL DEFAULT '0',
  `thac0` smallint NOT NULL DEFAULT '20',
  `long_desc` text COLLATE utf8mb4_unicode_ci,
  `detailed_desc` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`zone_number`,`vnum`),
  KEY `idx_wiki_mobs_level` (`level`),
  KEY `idx_wiki_mobs_alignment` (`alignment`),
  KEY `idx_wiki_mobs_class` (`mob_class`),
  KEY `idx_wiki_mobs_species` (`species`),
  KEY `idx_wiki_mobs_zone` (`zone_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_mob_flags
CREATE TABLE `wiki_mob_flags` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `zone_number` int unsigned NOT NULL,
  `mob_vnum` int unsigned NOT NULL,
  `flag_id` int unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wiki_mob_flags_mob` (`zone_number`,`mob_vnum`),
  KEY `idx_wiki_mob_flags_flag` (`flag_id`),
  CONSTRAINT `wiki_mob_flags_zone_number_mob_vnum_foreign` FOREIGN KEY (`zone_number`, `mob_vnum`) REFERENCES `wiki_mobs` (`zone_number`, `vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_objects
CREATE TABLE `wiki_objects` (
  `vnum` int unsigned NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_ansi` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` tinyint unsigned NOT NULL DEFAULT '0',
  `level` int NOT NULL DEFAULT '0',
  `weight` int NOT NULL DEFAULT '0',
  `extra_flags` int unsigned NOT NULL DEFAULT '0',
  `wear_flags` int unsigned NOT NULL DEFAULT '0',
  `anti_flags` int unsigned NOT NULL DEFAULT '0',
  `anti_flags2` int unsigned NOT NULL DEFAULT '0',
  `zone_number` int unsigned NOT NULL,
  `obj_values` json DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vnum`),
  KEY `idx_wiki_objects_type` (`type`),
  KEY `idx_wiki_objects_level` (`level`),
  KEY `idx_wiki_objects_zone` (`zone_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_object_affects
CREATE TABLE `wiki_object_affects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `object_vnum` int unsigned NOT NULL,
  `location` tinyint unsigned NOT NULL,
  `modifier` smallint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wiki_obj_affects_vnum` (`object_vnum`),
  KEY `idx_wiki_obj_affects_loc_mod` (`location`,`modifier`),
  CONSTRAINT `wiki_object_affects_object_vnum_foreign` FOREIGN KEY (`object_vnum`) REFERENCES `wiki_objects` (`vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_object_classes
CREATE TABLE `wiki_object_classes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `object_vnum` int unsigned NOT NULL,
  `class_id` int unsigned NOT NULL,
  `is_allowed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_wiki_obj_classes_vnum` (`object_vnum`),
  KEY `idx_wiki_obj_classes_class` (`class_id`),
  KEY `idx_wiki_obj_classes_compound` (`object_vnum`,`class_id`,`is_allowed`),
  CONSTRAINT `wiki_object_classes_object_vnum_foreign` FOREIGN KEY (`object_vnum`) REFERENCES `wiki_objects` (`vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_object_races
CREATE TABLE `wiki_object_races` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `object_vnum` int unsigned NOT NULL,
  `race_id` tinyint unsigned NOT NULL,
  `is_allowed` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_wiki_obj_races_vnum` (`object_vnum`),
  KEY `idx_wiki_obj_races_race` (`race_id`),
  KEY `idx_wiki_obj_races_compound` (`object_vnum`,`race_id`,`is_allowed`),
  CONSTRAINT `wiki_object_races_object_vnum_foreign` FOREIGN KEY (`object_vnum`) REFERENCES `wiki_objects` (`vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_object_slots
CREATE TABLE `wiki_object_slots` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `object_vnum` int unsigned NOT NULL,
  `slot_id` tinyint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wiki_obj_slots_vnum` (`object_vnum`),
  KEY `idx_wiki_obj_slots_slot` (`slot_id`),
  CONSTRAINT `wiki_object_slots_object_vnum_foreign` FOREIGN KEY (`object_vnum`) REFERENCES `wiki_objects` (`vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_object_spell_effects
CREATE TABLE `wiki_object_spell_effects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `object_vnum` int unsigned NOT NULL,
  `effect_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_wiki_obj_spells_vnum` (`object_vnum`),
  KEY `idx_wiki_obj_spells_name` (`effect_name`),
  CONSTRAINT `wiki_object_spell_effects_object_vnum_foreign` FOREIGN KEY (`object_vnum`) REFERENCES `wiki_objects` (`vnum`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_reference_generations
CREATE TABLE `wiki_reference_generations` (
  `id` tinyint unsigned NOT NULL,
  `source_revision` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_tree` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `object_count` int unsigned NOT NULL,
  `mob_count` int unsigned NOT NULL,
  `published_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_settings
CREATE TABLE `wiki_settings` (
  `key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wiki_zone_entrances
CREATE TABLE `wiki_zone_entrances` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `from_room_vnum` int unsigned NOT NULL,
  `to_room_vnum` int unsigned NOT NULL,
  `to_zone_number` int unsigned NOT NULL,
  `to_zone_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `direction` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `x_coord` int DEFAULT NULL,
  `y_coord` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_entrance_direction` (`from_room_vnum`,`direction`),
  KEY `idx_wiki_entrance_from` (`from_room_vnum`),
  KEY `idx_wiki_entrance_coords` (`x_coord`,`y_coord`),
  KEY `idx_wiki_entrance_to_zone` (`to_zone_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: wipe_history
CREATE TABLE `wipe_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `executed_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Admin account name who executed the wipe',
  `executed_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT 'When the wipe was executed',
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Required explanation for why the wipe was performed',
  `excluded_players` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array of excluded player PIDs and names',
  `backup_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Path to database backup file (if created)',
  `tables_affected` int DEFAULT '0' COMMENT 'Number of tables cleared/reset',
  `rows_affected` int DEFAULT '0' COMMENT 'Total number of rows deleted/updated',
  `duration_seconds` int DEFAULT '0' COMMENT 'How long the wipe operation took',
  `success` tinyint(1) DEFAULT '0' COMMENT 'Whether the wipe completed successfully',
  `error_message` text COLLATE utf8mb4_unicode_ci COMMENT 'Error details if wipe failed',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT 'Additional notes or details about the wipe',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP address of admin who executed wipe',
  PRIMARY KEY (`id`),
  KEY `idx_executed_by` (`executed_by`),
  KEY `idx_executed_at` (`executed_at`),
  KEY `idx_success` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Complete history of all player wipe operations';
