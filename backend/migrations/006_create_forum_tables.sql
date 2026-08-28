-- Migration 006: Create Forum Tables
-- Phase 6.1: Authentication & Forum System
-- Created: 2025-11-07

-- ============================================================================
-- Web Sessions Table
-- Stores JWT refresh tokens for user sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS web_sessions (
  id VARCHAR(255) PRIMARY KEY,
  account_name VARCHAR(50) NOT NULL,
  refresh_token VARCHAR(512) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account (account_name),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Categories Table
-- Categories for organizing forum discussions
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  access_type ENUM('public', 'authenticated', 'guild', 'immortal', 'god') DEFAULT 'public',
  guild_name VARCHAR(50),
  parent_id INT,
  sort_order INT DEFAULT 0,
  icon VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES forum_categories(id) ON DELETE SET NULL,
  INDEX idx_sort (sort_order),
  INDEX idx_access (access_type),
  INDEX idx_guild (guild_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Threads Table
-- Discussion threads within categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_threads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  category_id INT NOT NULL,
  author_account_name VARCHAR(50) NOT NULL,
  author_character_pid BIGINT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_post_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_pinned BOOLEAN DEFAULT FALSE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  view_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,
  INDEX idx_category_pinned_last_post (category_id, is_pinned DESC, last_post_at DESC),
  INDEX idx_author_account (author_account_name),
  INDEX idx_author_character (author_character_pid),
  INDEX idx_created (created_at),
  FULLTEXT INDEX idx_title_content (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Posts Table
-- Individual posts/replies within threads
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_posts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  thread_id INT NOT NULL,
  parent_post_id INT NULL,
  author_account_name VARCHAR(50) NOT NULL,
  author_character_pid BIGINT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMP NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_post_id) REFERENCES forum_posts(id) ON DELETE SET NULL,
  INDEX idx_thread_created (thread_id, created_at),
  INDEX idx_author_account (author_account_name),
  INDEX idx_author_character (author_character_pid),
  FULLTEXT INDEX idx_content (content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Reactions Table
-- Emoji reactions on posts
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_reactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  user_account_name VARCHAR(50) NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_reaction (post_id, user_account_name, emoji),
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  INDEX idx_post (post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Subscriptions Table
-- User subscriptions to threads for notifications
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_subscriptions (
  user_account_name VARCHAR(50) NOT NULL,
  thread_id INT NOT NULL,
  last_read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notify_on_reply BOOLEAN DEFAULT TRUE,
  PRIMARY KEY (user_account_name, thread_id),
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  INDEX idx_thread (thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Forum Notifications Table
-- Notification queue for mentions, replies, reactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS forum_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_account_name VARCHAR(50) NOT NULL,
  type ENUM('reply', 'mention', 'reaction') NOT NULL,
  thread_id INT,
  post_id INT,
  triggered_by_account_name VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  INDEX idx_user_unread (user_account_name, is_read, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Seed Default Categories (DISABLED - create manually in admin panel)
-- ============================================================================
-- Use INSERT IGNORE to skip if categories already exist
-- INSERT IGNORE INTO forum_categories (name, description, access_type, icon, sort_order) VALUES
-- ('General Discussion', 'General topics about DurisMUD', 'public', 'MessageSquare', 1),
-- ('Game Mechanics & Guides', 'Strategy, builds, and how-to guides', 'authenticated', 'BookOpen', 2),
-- ('Guild Halls', 'Private guild forums (auto-created)', 'authenticated', 'Castle', 3),
-- ('PvP & Combat', 'Battle stories and PvP discussion', 'authenticated', 'Swords', 4),
-- ('Roleplaying', 'In-character stories and events', 'public', 'Drama', 5),
-- ('Bug Reports & Suggestions', 'Help improve DurisMUD', 'authenticated', 'Bug', 6),
-- ('Staff Announcements', 'Official announcements from staff', 'authenticated', 'Megaphone', 7),
-- ('Immortal Lounge', 'Staff-only discussions', 'authenticated', 'Sparkles', 8);
