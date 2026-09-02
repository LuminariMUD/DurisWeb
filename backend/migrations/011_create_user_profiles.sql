-- Create user profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  account_name VARCHAR(50) PRIMARY KEY,
  bio TEXT,
  avatar_url VARCHAR(255),
  website VARCHAR(255),
  location VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create user profile stats table
CREATE TABLE IF NOT EXISTS user_profile_stats (
  account_name VARCHAR(50) PRIMARY KEY,
  total_posts INT DEFAULT 0,
  total_threads INT DEFAULT 0,
  total_reactions_received INT DEFAULT 0,
  reputation_score INT DEFAULT 0,
  first_post_at TIMESTAMP NULL,
  last_post_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create indexes for performance (compatible with MySQL)
SET @idx1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profile_stats' AND INDEX_NAME = 'idx_total_posts');
SET @idx2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profile_stats' AND INDEX_NAME = 'idx_reputation');
SET @idx3 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND INDEX_NAME = 'idx_last_seen');

SET @sql_idx1 = IF(@idx1 = 0, 'CREATE INDEX idx_total_posts ON user_profile_stats(total_posts DESC)', 'SELECT ''Index idx_total_posts already exists''');
SET @sql_idx2 = IF(@idx2 = 0, 'CREATE INDEX idx_reputation ON user_profile_stats(reputation_score DESC)', 'SELECT ''Index idx_reputation already exists''');
SET @sql_idx3 = IF(@idx3 = 0, 'CREATE INDEX idx_last_seen ON user_profiles(last_seen_at DESC)', 'SELECT ''Index idx_last_seen already exists''');

PREPARE stmt_idx1 FROM @sql_idx1; EXECUTE stmt_idx1; DEALLOCATE PREPARE stmt_idx1;
PREPARE stmt_idx2 FROM @sql_idx2; EXECUTE stmt_idx2; DEALLOCATE PREPARE stmt_idx2;
PREPARE stmt_idx3 FROM @sql_idx3; EXECUTE stmt_idx3; DEALLOCATE PREPARE stmt_idx3;

-- Auto-populate profiles for existing accounts
INSERT INTO user_profiles (account_name)
SELECT account_name FROM accounts
WHERE account_name NOT IN (SELECT account_name FROM user_profiles);

-- Auto-populate stats for existing accounts with post history
INSERT INTO user_profile_stats (account_name, total_posts, total_threads, first_post_at, last_post_at)
SELECT
  t.author_account_name as account_name,
  COUNT(DISTINCT p.id) as total_posts,
  COUNT(DISTINCT t.id) as total_threads,
  MIN(COALESCE(p.created_at, t.created_at)) as first_post_at,
  MAX(COALESCE(p.created_at, t.created_at)) as last_post_at
FROM forum_threads t
LEFT JOIN forum_posts p ON t.author_account_name = p.author_account_name
WHERE t.author_account_name NOT IN (SELECT account_name FROM user_profile_stats)
GROUP BY t.author_account_name;
