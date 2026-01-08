-- Migration 007: Add Dynamic Permission Management
-- Allows Overlords to configure permission levels for forum features

-- Global forum settings table
CREATE TABLE IF NOT EXISTS forum_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(50) -- Account name of who changed it
);

-- Insert default permission levels
INSERT INTO forum_settings (setting_key, setting_value, description) VALUES
  ('min_level_to_moderate', '59', 'Minimum level to moderate forums (Lesser God+)'),
  ('min_level_to_ban', '61', 'Minimum level to ban users (Forger+)'),
  ('min_level_to_pin', '59', 'Minimum level to pin threads (Lesser God+)'),
  ('min_level_to_lock', '59', 'Minimum level to lock threads (Lesser God+)'),
  ('min_level_to_delete_any_post', '59', 'Minimum level to delete any post (Lesser God+)'),
  ('min_level_immortal_forum', '57', 'Minimum level for immortal forum access (Avatar+)'),
  ('min_level_god_forum', '59', 'Minimum level for god forum access (Lesser God+)'),
  ('allow_mortal_posts', '1', 'Allow mortals to post in public forums (1=yes, 0=no)'),
  ('post_rate_limit', '20', 'Maximum posts per minute per user'),
  ('thread_rate_limit', '5', 'Maximum threads per hour per user')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

-- Add per-category permission overrides to forum_categories (compatible with MySQL < 8.0.29)
SET @col1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_categories' AND COLUMN_NAME = 'min_level_to_view');
SET @col2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_categories' AND COLUMN_NAME = 'min_level_to_post');
SET @col3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_categories' AND COLUMN_NAME = 'min_level_to_moderate');

SET @sql1 = IF(@col1 = 0, 'ALTER TABLE forum_categories ADD COLUMN min_level_to_view INT DEFAULT NULL COMMENT ''Override: min level to view (NULL=use access_type)''', 'SELECT ''Column min_level_to_view already exists''');
SET @sql2 = IF(@col2 = 0, 'ALTER TABLE forum_categories ADD COLUMN min_level_to_post INT DEFAULT NULL COMMENT ''Override: min level to post (NULL=use global)''', 'SELECT ''Column min_level_to_post already exists''');
SET @sql3 = IF(@col3 = 0, 'ALTER TABLE forum_categories ADD COLUMN min_level_to_moderate INT DEFAULT NULL COMMENT ''Override: min level to moderate (NULL=use global)''', 'SELECT ''Column min_level_to_moderate already exists''');

PREPARE stmt1 FROM @sql1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- Add indexes for performance (compatible with MySQL)
SET @idx = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_settings' AND INDEX_NAME = 'idx_settings_key');
SET @sql_idx = IF(@idx = 0, 'CREATE INDEX idx_settings_key ON forum_settings(setting_key)', 'SELECT ''Index idx_settings_key already exists''');
PREPARE stmt_idx FROM @sql_idx; EXECUTE stmt_idx; DEALLOCATE PREPARE stmt_idx;

-- Audit log for permission changes
CREATE TABLE IF NOT EXISTS forum_permission_audit (
  id INT PRIMARY KEY AUTO_INCREMENT,
  changed_by VARCHAR(50) NOT NULL COMMENT 'Account name',
  change_type ENUM('setting', 'category_permission') NOT NULL,
  target_key VARCHAR(100) NOT NULL COMMENT 'Setting key or category ID',
  old_value VARCHAR(255),
  new_value VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_changed_by (changed_by),
  INDEX idx_changed_at (changed_at DESC)
);
