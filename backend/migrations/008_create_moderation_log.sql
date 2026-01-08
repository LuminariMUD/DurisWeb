-- Migration 008: Forum Moderation Log
-- Tracks all moderation actions (delete, restore, move, lock, pin)

CREATE TABLE IF NOT EXISTS forum_moderation_log (
  id INT PRIMARY KEY AUTO_INCREMENT,
  moderator_account VARCHAR(50) NOT NULL COMMENT 'Account name of moderator',
  action_type ENUM('delete_post', 'delete_thread', 'restore_post', 'restore_thread', 'move_thread', 'lock_thread', 'unlock_thread', 'pin_thread', 'unpin_thread') NOT NULL,
  target_type ENUM('post', 'thread') NOT NULL,
  target_id INT NOT NULL COMMENT 'Post ID or Thread ID',
  category_id INT COMMENT 'Category ID (for thread actions)',
  new_category_id INT COMMENT 'New category ID (for move actions)',
  reason TEXT COMMENT 'Reason for moderation action',
  original_content TEXT COMMENT 'Original content before deletion (for restore)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_moderator (moderator_account),
  INDEX idx_action_type (action_type),
  INDEX idx_target (target_type, target_id),
  INDEX idx_created_at (created_at DESC),
  INDEX idx_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Check and add soft delete tracking columns
-- These may already exist from previous migrations

-- Add deleted_at to forum_posts if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'forum_posts';
SET @columnname = 'deleted_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TIMESTAMP NULL COMMENT "When post was deleted"')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add deleted_by to forum_posts if it doesn't exist
SET @columnname = 'deleted_by';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(50) NULL COMMENT "Account name of who deleted it"')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add deleted_at to forum_threads if it doesn't exist
SET @tablename = 'forum_threads';
SET @columnname = 'deleted_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' TIMESTAMP NULL COMMENT "When thread was deleted"')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add deleted_by to forum_threads if it doesn't exist
SET @columnname = 'deleted_by';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(50) NULL COMMENT "Account name of who deleted it"')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index on forum_posts if it doesn't exist
SET @tablename = 'forum_posts';
SET @indexname = 'idx_posts_deleted';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (index_name = @indexname)
  ) > 0,
  'SELECT 1',
  CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, '(is_deleted, deleted_at)')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index on forum_threads if it doesn't exist
SET @tablename = 'forum_threads';
SET @indexname = 'idx_threads_deleted';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (index_name = @indexname)
  ) > 0,
  'SELECT 1',
  CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, '(is_deleted, deleted_at)')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
