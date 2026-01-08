-- Migration: Add admin action log table for audit trail
-- Description: Tracks all administrative actions (property changes, wipes, etc.)

CREATE TABLE IF NOT EXISTS admin_action_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_name VARCHAR(50) NOT NULL,
  action_type ENUM('property_change', 'level_cap_change', 'wipe', 'timer_reset') NOT NULL,
  target VARCHAR(100) NOT NULL COMMENT 'Property key, table name, or affected entity',
  old_value TEXT,
  new_value TEXT,
  notes TEXT COMMENT 'Optional notes or reason for change',
  ip_address VARCHAR(45),
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_account (account_name),
  INDEX idx_action_type (action_type),
  INDEX idx_timestamp (timestamp),
  INDEX idx_target (target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Audit log for all administrative actions';
