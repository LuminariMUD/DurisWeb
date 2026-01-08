-- ============================================================================
-- Forum Polls System
-- Allows thread creators to attach polls to threads with flexible privacy
-- and voting options
-- ============================================================================

-- Main polls table
CREATE TABLE IF NOT EXISTS forum_polls (
  id INT PRIMARY KEY AUTO_INCREMENT,
  thread_id INT NOT NULL,
  question VARCHAR(500) NOT NULL,

  -- Poll configuration
  is_multiple_choice BOOLEAN DEFAULT FALSE COMMENT 'Allow selecting multiple options',
  min_choices INT DEFAULT 1 COMMENT 'Minimum selections (for multiple choice)',
  max_choices INT DEFAULT 1 COMMENT 'Maximum selections (1 for single choice)',

  -- Privacy settings (creator-configurable per poll)
  is_anonymous BOOLEAN DEFAULT TRUE COMMENT 'Hide voter identities',
  results_visibility ENUM('always', 'after_voting', 'after_expiration') DEFAULT 'always' COMMENT 'When results are visible',

  -- Expiration
  expires_at TIMESTAMP NULL COMMENT 'Poll expiration date (NULL = never expires)',

  -- Metadata
  created_by_account VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_closed BOOLEAN DEFAULT FALSE COMMENT 'Manually closed by creator/moderator',

  -- Foreign keys
  FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,

  -- Indexes
  INDEX idx_thread (thread_id),
  INDEX idx_expires (expires_at),
  INDEX idx_created (created_at),
  INDEX idx_creator (created_by_account),

  -- One poll per thread
  UNIQUE KEY unique_thread_poll (thread_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Poll options/choices
CREATE TABLE IF NOT EXISTS forum_poll_options (
  id INT PRIMARY KEY AUTO_INCREMENT,
  poll_id INT NOT NULL,
  option_text VARCHAR(200) NOT NULL,
  sort_order INT DEFAULT 0 COMMENT 'Display order (0-indexed)',

  -- Cached vote count for performance (denormalized)
  vote_count INT DEFAULT 0 COMMENT 'Updated on vote changes to avoid COUNT() queries',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (poll_id) REFERENCES forum_polls(id) ON DELETE CASCADE,

  -- Indexes
  INDEX idx_poll_sort (poll_id, sort_order),
  INDEX idx_poll (poll_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Poll votes (tracks who voted for what)
CREATE TABLE IF NOT EXISTS forum_poll_votes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  poll_id INT NOT NULL,
  option_id INT NOT NULL,
  voter_account VARCHAR(50) NOT NULL,

  voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (poll_id) REFERENCES forum_polls(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES forum_poll_options(id) ON DELETE CASCADE,

  -- Indexes
  INDEX idx_poll_voter (poll_id, voter_account),
  INDEX idx_option (option_id),
  INDEX idx_voter (voter_account),

  -- Prevent duplicate votes for same poll+option+voter combination
  UNIQUE KEY unique_poll_option_voter (poll_id, option_id, voter_account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log for vote changes (transparency and debugging)
CREATE TABLE IF NOT EXISTS forum_poll_vote_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  poll_id INT NOT NULL,
  voter_account VARCHAR(50) NOT NULL,
  old_option_ids JSON COMMENT 'Previous selections as JSON array',
  new_option_ids JSON COMMENT 'New selections as JSON array',
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign keys
  FOREIGN KEY (poll_id) REFERENCES forum_polls(id) ON DELETE CASCADE,

  -- Indexes
  INDEX idx_poll (poll_id),
  INDEX idx_voter (voter_account),
  INDEX idx_changed (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
