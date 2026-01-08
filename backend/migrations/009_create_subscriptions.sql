-- Forum Subscriptions System
-- Allows users to subscribe to threads and categories for notifications

-- Create forum_subscriptions table
CREATE TABLE IF NOT EXISTS forum_subscriptions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_name VARCHAR(50) NOT NULL,
  subscription_type ENUM('thread', 'category') NOT NULL,
  thread_id INT NULL,
  category_id INT NULL,
  notification_preference ENUM('all', 'mentions', 'none') DEFAULT 'all' COMMENT 'all = notify on all posts, mentions = only @mentions, none = no notifications',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE CASCADE,

  -- Indexes for performance
  INDEX idx_account (account_name),
  INDEX idx_thread (thread_id),
  INDEX idx_category (category_id),
  INDEX idx_type (subscription_type),

  -- Unique constraint: one subscription per user per thread/category
  UNIQUE KEY unique_thread_subscription (account_name, thread_id),
  UNIQUE KEY unique_category_subscription (account_name, category_id),

  -- Check constraint: must have either thread_id or category_id, not both
  CHECK (
    (subscription_type = 'thread' AND thread_id IS NOT NULL AND category_id IS NULL) OR
    (subscription_type = 'category' AND category_id IS NOT NULL AND thread_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create forum_notifications table
CREATE TABLE IF NOT EXISTS forum_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  account_name VARCHAR(50) NOT NULL,
  notification_type ENUM('new_post', 'new_reply', 'mention', 'quote', 'thread_moved', 'thread_locked') NOT NULL,
  thread_id INT NOT NULL,
  post_id INT NULL COMMENT 'The post that triggered the notification',
  triggered_by_account VARCHAR(50) NOT NULL COMMENT 'The account that created the post/action',
  triggered_by_character VARCHAR(50) NULL COMMENT 'The character name that posted',
  message TEXT NOT NULL COMMENT 'Human-readable notification message',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,

  -- Foreign keys
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,

  -- Indexes for performance
  INDEX idx_account (account_name),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at DESC),
  INDEX idx_thread (thread_id),
  INDEX idx_type (notification_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Auto-subscribe users to threads they create
-- This will be handled in application code, not as a trigger
-- to give users explicit control over their subscriptions
