-- Migration: Create wipe_history table
-- Description: Tracks all player wipe operations for accountability and audit

CREATE TABLE IF NOT EXISTS wipe_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  executed_by VARCHAR(50) NOT NULL COMMENT 'Admin account name who executed the wipe',
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'When the wipe was executed',
  reason TEXT NOT NULL COMMENT 'Required explanation for why the wipe was performed',
  backup_path VARCHAR(255) COMMENT 'Path to database backup file (if created)',
  tables_affected INT DEFAULT 0 COMMENT 'Number of tables cleared/reset',
  rows_affected INT DEFAULT 0 COMMENT 'Total number of rows deleted/updated',
  duration_seconds INT DEFAULT 0 COMMENT 'How long the wipe operation took',
  success BOOLEAN DEFAULT FALSE COMMENT 'Whether the wipe completed successfully',
  error_message TEXT COMMENT 'Error details if wipe failed',
  notes TEXT COMMENT 'Additional notes or details about the wipe',
  ip_address VARCHAR(45) COMMENT 'IP address of admin who executed wipe',

  INDEX idx_executed_by (executed_by),
  INDEX idx_executed_at (executed_at),
  INDEX idx_success (success)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Complete history of all player wipe operations';
