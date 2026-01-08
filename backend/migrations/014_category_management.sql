-- Migration 014: Category Management System
-- Adds ACL (Access Control List) support, archiving, nested categories, and customizable icons

-- ============================================================================
-- 1. Update forum_categories table
-- ============================================================================

-- Add archived columns if they don't exist
SET @col_is_archived = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'forum_categories' AND column_name = 'is_archived');
SET @col_archived_at = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'forum_categories' AND column_name = 'archived_at');
SET @col_archived_by = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'forum_categories' AND column_name = 'archived_by');

SET @sql_is_archived = IF(@col_is_archived = 0,
  'ALTER TABLE forum_categories ADD COLUMN is_archived BOOLEAN DEFAULT FALSE',
  'SELECT ''Column is_archived already exists''');
SET @sql_archived_at = IF(@col_archived_at = 0,
  'ALTER TABLE forum_categories ADD COLUMN archived_at TIMESTAMP NULL',
  'SELECT ''Column archived_at already exists''');
SET @sql_archived_by = IF(@col_archived_by = 0,
  'ALTER TABLE forum_categories ADD COLUMN archived_by VARCHAR(50) NULL',
  'SELECT ''Column archived_by already exists''');

PREPARE stmt1 FROM @sql_is_archived; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
PREPARE stmt2 FROM @sql_archived_at; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
PREPARE stmt3 FROM @sql_archived_by; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- Expand icon column size (check if icon column exists first)
SET @col_icon = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'forum_categories' AND column_name = 'icon');
SET @sql_icon = IF(@col_icon > 0,
  'ALTER TABLE forum_categories MODIFY COLUMN icon VARCHAR(100) DEFAULT NULL COMMENT ''Lucide icon name or emoji''',
  'SELECT ''Icon column does not exist''');
PREPARE stmt_icon FROM @sql_icon; EXECUTE stmt_icon; DEALLOCATE PREPARE stmt_icon;

-- Add minimum level column first (before modifying enum) - only if it doesn't exist
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'forum_categories' AND column_name = 'min_level');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE forum_categories ADD COLUMN min_level INT NULL COMMENT ''Minimum immortal level for role_based access (57-62)''',
  'SELECT ''min_level column already exists'' AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Update existing 'immortal' and 'god' values to prepare for enum change
UPDATE forum_categories SET min_level = 57 WHERE access_type = 'immortal';
UPDATE forum_categories SET min_level = 59 WHERE access_type = 'god';
UPDATE forum_categories SET access_type = 'authenticated' WHERE access_type IN ('immortal', 'god');

-- Now safe to expand access_type enum
ALTER TABLE forum_categories
  MODIFY COLUMN access_type ENUM('public', 'authenticated', 'role_based', 'guild', 'custom_acl')
    DEFAULT 'public'
    COMMENT 'Access control type: public=everyone, authenticated=logged in, role_based=min level, guild=guild only, custom_acl=use permissions table';

-- Convert updated categories to role_based
UPDATE forum_categories SET access_type = 'role_based' WHERE min_level IS NOT NULL;

-- ============================================================================
-- 2. Create forum_category_permissions table (ACL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS forum_category_permissions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL COMMENT 'Category this permission applies to',
  permission_type ENUM('allow', 'deny') DEFAULT 'allow' COMMENT 'Allow or deny access',

  -- Target (one of these must be set to identify who this rule applies to)
  min_immortal_level INT NULL COMMENT 'Applies to users with this level or higher (57-62)',
  guild_name VARCHAR(50) NULL COMMENT 'Applies to members of this guild',
  account_name VARCHAR(50) NULL COMMENT 'Applies to specific account',
  character_pid BIGINT NULL COMMENT 'Applies to specific character',

  -- Permissions (what actions are allowed/denied)
  can_view BOOLEAN DEFAULT TRUE COMMENT 'Can see category and threads',
  can_post BOOLEAN DEFAULT TRUE COMMENT 'Can create threads and reply',
  can_moderate BOOLEAN DEFAULT FALSE COMMENT 'Can moderate this category',

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(50) NOT NULL COMMENT 'Account that created this permission',

  -- Foreign keys
  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,
  -- Note: character_pid references players_core(pid) but no FK constraint (MyISAM table)

  -- Indexes for performance
  INDEX idx_category (category_id),
  INDEX idx_account (account_name),
  INDEX idx_character (character_pid),
  INDEX idx_guild (guild_name),
  INDEX idx_level (min_immortal_level)

  -- Note: Validation done in application code to avoid conflicts with foreign keys
  -- - At least one target must be specified (min_immortal_level, guild_name, account_name, or character_pid)
  -- - min_immortal_level must be between 57-62
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Access Control List for forum categories';

-- ============================================================================
-- 3. Add indexes for existing columns
-- ============================================================================

-- Index for archived categories (compatible with MySQL)
SET @idx_archived = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_categories' AND INDEX_NAME = 'idx_archived');
SET @idx_parent = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_categories' AND INDEX_NAME = 'idx_parent');

SET @sql_archived = IF(@idx_archived = 0, 'CREATE INDEX idx_archived ON forum_categories(is_archived, sort_order)', 'SELECT ''Index idx_archived already exists''');
SET @sql_parent = IF(@idx_parent = 0, 'CREATE INDEX idx_parent ON forum_categories(parent_id)', 'SELECT ''Index idx_parent already exists''');

PREPARE stmt_archived FROM @sql_archived; EXECUTE stmt_archived; DEALLOCATE PREPARE stmt_archived;
PREPARE stmt_parent FROM @sql_parent; EXECUTE stmt_parent; DEALLOCATE PREPARE stmt_parent;

-- ============================================================================
-- 4. Update existing categories with default values
-- ============================================================================

-- Set default icons for existing categories (only if not already set)
UPDATE forum_categories SET icon = 'MessageSquare' WHERE name = 'General Discussion' AND icon IS NULL;
UPDATE forum_categories SET icon = 'Swords' WHERE (name LIKE '%PvP%' OR name LIKE '%Combat%') AND icon IS NULL;
UPDATE forum_categories SET icon = 'Castle' WHERE name LIKE '%Guild%' AND icon IS NULL;
UPDATE forum_categories SET icon = 'Sparkles' WHERE name LIKE '%Immortal%' AND icon IS NULL;
UPDATE forum_categories SET icon = 'Crown' WHERE (name LIKE '%God%' OR name LIKE '%Overlord%') AND icon IS NULL;
UPDATE forum_categories SET icon = 'Bug' WHERE name LIKE '%Bug%' AND icon IS NULL;
UPDATE forum_categories SET icon = 'Lightbulb' WHERE name LIKE '%Suggestion%' AND icon IS NULL;
UPDATE forum_categories SET icon = 'BookOpen' WHERE name LIKE '%Guide%' AND icon IS NULL;
UPDATE forum_categories SET icon = 'Users' WHERE name LIKE '%Discussion%' AND icon IS NULL;

-- ============================================================================
-- 5. Verification queries (for testing)
-- ============================================================================

-- Check updated categories
-- SELECT id, name, access_type, min_level, icon, is_archived FROM forum_categories;

-- Check permissions table is empty
-- SELECT COUNT(*) FROM forum_category_permissions;
