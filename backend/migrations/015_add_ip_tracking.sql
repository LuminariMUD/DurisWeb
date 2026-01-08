-- Migration 015: Add IP Address Tracking (Overlord-only visibility)
-- Created: 2025-11-08
-- Description: Track IP addresses for forum posts and threads for moderation purposes

-- Add ip_address column to forum_threads (compatible with MySQL < 8.0.29)
SET @col_threads = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_threads' AND COLUMN_NAME = 'ip_address');
SET @col_posts = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_posts' AND COLUMN_NAME = 'ip_address');

SET @sql_threads = IF(@col_threads = 0, 'ALTER TABLE forum_threads ADD COLUMN ip_address VARCHAR(45) AFTER author_character_pid', 'SELECT ''Column ip_address already exists in forum_threads''');
SET @sql_posts = IF(@col_posts = 0, 'ALTER TABLE forum_posts ADD COLUMN ip_address VARCHAR(45) AFTER author_character_pid', 'SELECT ''Column ip_address already exists in forum_posts''');

PREPARE stmt_threads FROM @sql_threads; EXECUTE stmt_threads; DEALLOCATE PREPARE stmt_threads;
PREPARE stmt_posts FROM @sql_posts; EXECUTE stmt_posts; DEALLOCATE PREPARE stmt_posts;

-- Add index for IP lookups (compatible with MySQL)
SET @idx_threads_ip = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_threads' AND INDEX_NAME = 'idx_threads_ip');
SET @idx_posts_ip = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_posts' AND INDEX_NAME = 'idx_posts_ip');

SET @sql_threads_ip = IF(@idx_threads_ip = 0, 'CREATE INDEX idx_threads_ip ON forum_threads(ip_address)', 'SELECT ''Index idx_threads_ip already exists''');
SET @sql_posts_ip = IF(@idx_posts_ip = 0, 'CREATE INDEX idx_posts_ip ON forum_posts(ip_address)', 'SELECT ''Index idx_posts_ip already exists''');

PREPARE stmt_threads_ip FROM @sql_threads_ip; EXECUTE stmt_threads_ip; DEALLOCATE PREPARE stmt_threads_ip;
PREPARE stmt_posts_ip FROM @sql_posts_ip; EXECUTE stmt_posts_ip; DEALLOCATE PREPARE stmt_posts_ip;

-- Note: VARCHAR(45) accommodates both IPv4 (max 15 chars) and IPv6 (max 45 chars)
-- IP addresses are only visible to users with Overlord permission (level 60)
