SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(128) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS subject_accounts (
  id VARCHAR(128) PRIMARY KEY, subject_id VARCHAR(128), task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_subject_sort (subject_id, sort_at), UNIQUE KEY uq_subject_lookup (subject_id, lookup_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS assessment_tasks (
  id VARCHAR(128) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_task_subject_idempotency (subject_id, idempotency_key), KEY idx_task_subject_status (subject_id, status, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS character_results (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128) NOT NULL, status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_character_task (task_id, sort_at), KEY idx_character_history (subject_id, lookup_key, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS wordbook_entries (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_wordbook_character (subject_id, lookup_key), KEY idx_wordbook_status (subject_id, status, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS growth_segments (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_growth_character (subject_id, lookup_key, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS monitoring_events (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_monitoring_character (subject_id, lookup_key, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS consent_records (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_consent_latest (subject_id, lookup_key, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS media_objects (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128) NOT NULL, status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_media_task (subject_id, task_id), KEY idx_media_expiry (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS feedback_records (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_feedback_idempotency (subject_id, idempotency_key), KEY idx_feedback_subject (subject_id, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS share_cards (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_share_idempotency (subject_id, idempotency_key), UNIQUE KEY uq_share_token (lookup_key), KEY idx_share_expiry (expires_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128), task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  KEY idx_audit_subject (subject_id, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS deletion_jobs (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_deletion_request (subject_id, idempotency_key), KEY idx_deletion_subject (subject_id, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS quota_events (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128) NOT NULL, task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3) NOT NULL, idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_quota_idempotency (subject_id, idempotency_key), KEY idx_quota_expiry (expires_at), KEY idx_quota_subject (subject_id, sort_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id VARCHAR(191) PRIMARY KEY, subject_id VARCHAR(128), task_id VARCHAR(128), status VARCHAR(48),
  expires_at DATETIME(3), idempotency_key VARCHAR(255), lookup_key VARCHAR(255), sort_at DATETIME(3), document JSON NOT NULL,
  UNIQUE KEY uq_cross_api_idempotency (subject_id, idempotency_key), KEY idx_idempotency_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  subject_id VARCHAR(128) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  KEY idx_auth_expiry (expires_at), KEY idx_auth_subject (subject_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS assessment_jobs (
  job_id VARCHAR(128) PRIMARY KEY,
  task_id VARCHAR(128) NOT NULL,
  subject_id VARCHAR(128) NOT NULL,
  status ENUM('queued','leased','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
  next_attempt_at DATETIME(3) NOT NULL,
  lease_owner VARCHAR(128),
  lease_expires_at DATETIME(3),
  payload JSON NOT NULL,
  error_code VARCHAR(128),
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_job_task (task_id), KEY idx_job_claim (status, next_attempt_at, lease_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
