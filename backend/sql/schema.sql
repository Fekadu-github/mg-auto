-- MG Auto schema for MySQL 8 (MariaDB 10.5+ also works).
-- Safe to run again: every statement is CREATE ... IF NOT EXISTS. `npm run migrate` runs it; the API also runs it on start.
-- Times are stored in UTC (DATETIME(3)); the API formats Addis Ababa days itself.

CREATE TABLE IF NOT EXISTS counters (
  k VARCHAR(40) NOT NULL PRIMARY KEY,
  n BIGINT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  role ENUM('SA','WS','TECH','ADMIN') NOT NULL,
  pass_hash VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY app_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  city VARCHAR(200) NOT NULL DEFAULT '',
  sub VARCHAR(200) NOT NULL DEFAULT '',
  woreda VARCHAR(200) NOT NULL DEFAULT '',
  house VARCHAR(200) NOT NULL DEFAULT '',
  dob DATE NULL,
  notify ENUM('both','sms','telegram','none') NOT NULL DEFAULT 'both',
  tg_chat VARCHAR(40) NULL,      -- Telegram chat id, set when the customer taps the link
  tg_token VARCHAR(40) NULL,     -- one-time link token, cleared after use
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY customers_tg_token (tg_token),
  KEY customers_tg_chat (tg_chat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  cid VARCHAR(40) NOT NULL,
  plate VARCHAR(30) NOT NULL,
  vin VARCHAR(40) NOT NULL DEFAULT '',
  eng VARCHAR(40) NOT NULL DEFAULT '',
  col VARCHAR(30) NOT NULL DEFAULT '',
  brand VARCHAR(40) NOT NULL DEFAULT '',
  model VARCHAR(60) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY vehicles_cid (cid),
  CONSTRAINT vehicles_cid_fk FOREIGN KEY (cid) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A job card keeps labour, parts, the invoice and the status log as JSON documents on the row.
-- Every change locks the row (SELECT ... FOR UPDATE) inside a transaction, so two people can never overwrite each other.
CREATE TABLE IF NOT EXISTS jobs (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  cid VARCHAR(40) NOT NULL,
  vid CHAR(36) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'Created',
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  labours JSON NOT NULL,
  parts JSON NOT NULL,
  inv JSON NULL,
  `log` JSON NOT NULL,
  KEY jobs_status (status),
  KEY jobs_created (created),
  CONSTRAINT jobs_cid_fk FOREIGN KEY (cid) REFERENCES customers (id),
  CONSTRAINT jobs_vid_fk FOREIGN KEY (vid) REFERENCES vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,      -- unit price before VAT
  stock DECIMAL(12,2) NOT NULL DEFAULT 0,
  reorder DECIMAL(12,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY inventory_code (code),
  CONSTRAINT inventory_price_ck CHECK (price >= 0),
  CONSTRAINT inventory_stock_ck CHECK (stock >= 0),
  CONSTRAINT inventory_reorder_ck CHECK (reorder >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_moves (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  part_id CHAR(36) NOT NULL,
  delta DECIMAL(12,2) NOT NULL,
  balance DECIMAL(12,2) NOT NULL,
  reason VARCHAR(80) NOT NULL,
  job VARCHAR(40) NULL,
  by_name VARCHAR(120) NULL,
  note VARCHAR(200) NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY stock_moves_part (part_id, `at`),
  CONSTRAINT stock_moves_part_fk FOREIGN KEY (part_id) REFERENCES inventory (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Vehicle ready" messages: what was sent, to whom, and whether it worked
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job VARCHAR(40) NOT NULL,
  cid VARCHAR(40) NULL,
  channel VARCHAR(20) NOT NULL,
  to_addr VARCHAR(80) NULL,
  status ENUM('sent','failed','skipped') NOT NULL,
  error VARCHAR(500) NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY notifications_job (job, `at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
