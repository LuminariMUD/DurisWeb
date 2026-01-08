-- Create forum mentions table
CREATE TABLE IF NOT EXISTS forum_mentions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  post_id INT NOT NULL,
  mentioned_account_name VARCHAR(50) NOT NULL,
  mentioned_by_account_name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_account_name) REFERENCES accounts(account_name) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_by_account_name) REFERENCES accounts(account_name) ON DELETE CASCADE,
  INDEX idx_mentioned (mentioned_account_name),
  INDEX idx_post (post_id),
  INDEX idx_mentioned_by (mentioned_by_account_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
