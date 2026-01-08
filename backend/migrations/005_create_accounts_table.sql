-- Create accounts table for web sessions
CREATE TABLE IF NOT EXISTS accounts (
  account_name VARCHAR(50) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP NULL,
  INDEX idx_last_login (last_login DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
