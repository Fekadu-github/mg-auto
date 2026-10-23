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
  role ENUM('SA','WS','TECH','ADMIN','MGR') NOT NULL,   -- MGR = Manager (appended last so older databases can be upgraded in place)
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
  insurer_id CHAR(36) NULL,      -- the customer's insurance company (from the registered list), if any
  policy_no VARCHAR(60) NULL,
  tin VARCHAR(40) NOT NULL DEFAULT '',   -- the customer's TIN (job cards, point of sale, invoices)
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
  mileage INT NULL,                -- odometer (km): entered at registration, moved forward each time a job card is closed
  next_km INT NULL,                -- next service suggested after the last completed service
  next_type VARCHAR(10) NULL,      -- its type: A, B or C
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
  mileage INT NULL,                -- odometer (km) when the vehicle came in
  services JSON NULL,              -- service packages added to this card, e.g. ["A"]
  est VARCHAR(40) NULL,            -- estimate loaded on this card
  requests JSON NULL,              -- additional parts asked for by the workshop, issued by the Service Advisor
  payer VARCHAR(160) NULL,         -- insurance company the invoice is made out to (job cards created from an insurance proforma); empty = the customer
  policy_no VARCHAR(60) NULL,
  mileage_out INT NULL,            -- odometer (km) when the vehicle left the workshop (typed when the card is closed); the next service counts from it
  claim_no VARCHAR(60) NULL,       -- insurance claim number
  due_date DATE NULL,              -- expected finish / delivery date
  priority VARCHAR(20) NULL,       -- Normal, Urgent ...
  price_reqs JSON NULL,            -- price changes the Service Advisor asked for that need the manager's approval
  KEY jobs_status (status),
  KEY jobs_created (created),
  CONSTRAINT jobs_cid_fk FOREIGN KEY (cid) REFERENCES customers (id),
  CONSTRAINT jobs_vid_fk FOREIGN KEY (vid) REFERENCES vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT '',
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,       -- what the garage pays (manager only)
  price DECIMAL(12,2) NOT NULL DEFAULT 0,      -- unit price before VAT (cost x 1.3 unless the manager sets it)
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

-- Service packages: Type A / B / C. Each has a km interval and the labour and parts that are added to a job card in one click.
CREATE TABLE IF NOT EXISTS service_types (
  code VARCHAR(10) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  interval_km INT NOT NULL,
  labours JSON NOT NULL,
  parts JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT service_types_km_ck CHECK (interval_km > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Body & paint estimates. Draft can be edited; Finalized is locked and can be loaded on a job card by its number (used_in says where).
CREATE TABLE IF NOT EXISTS estimates (
  guest_name VARCHAR(120) NOT NULL DEFAULT '', guest_phone VARCHAR(30) NOT NULL DEFAULT '', guest_plate VARCHAR(30) NOT NULL DEFAULT '', guest_brand VARCHAR(40) NOT NULL DEFAULT '', guest_model VARCHAR(60) NOT NULL DEFAULT '', guest_vin VARCHAR(40) NOT NULL DEFAULT '', guest_eng VARCHAR(40) NOT NULL DEFAULT '',   -- walk-in details until the customer is registered
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  cid VARCHAR(40) NULL,      -- empty while the estimate has no customer yet (a draft made before he is registered)
  vid CHAR(36) NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('Draft','Finalized') NOT NULL DEFAULT 'Draft',
  labours JSON NOT NULL,
  parts JSON NOT NULL,
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finalized_at DATETIME(3) NULL,
  by_name VARCHAR(120) NULL,
  used_in VARCHAR(40) NULL,
  pro VARCHAR(40) NULL,            -- the insurance proforma this estimate was made from, if any
  KEY estimates_vid (vid),
  KEY estimates_status (status),
  CONSTRAINT estimates_cid_fk FOREIGN KEY (cid) REFERENCES customers (id),
  CONSTRAINT estimates_vid_fk FOREIGN KEY (vid) REFERENCES vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registered insurance companies: chosen on a proforma, or kept on the customer's profile.
CREATE TABLE IF NOT EXISTS insurers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  address VARCHAR(200) NOT NULL DEFAULT '',   -- printed under the company name on proformas and estimates
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY insurers_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The labour task list: what the Service Advisor picks from on proformas, estimates and job cards. Hours x labour rate, or a fixed price.
CREATE TABLE IF NOT EXISTS labour_tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL DEFAULT '',       -- Labour Code from the Excel price book (BP-... / ME-...); empty for a line typed in by hand
  model_grp VARCHAR(60) NOT NULL DEFAULT '',  -- Model Grp from the price book (Suzuki, Toyota (SEDAN), Others...)
  task VARCHAR(200) NOT NULL DEFAULT '',   -- the task this line belongs to (picking the task adds all its lines); empty = a single stand-alone line
  name VARCHAR(200) NOT NULL,
  section VARCHAR(30) NOT NULL DEFAULT 'Mechanical Repairs',
  hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY labour_tasks_name (code, model_grp, task, name, section)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- First-hand (insurance) proforma, made before any job card. Draft -> Issued (printed) -> Converted (job card and estimate created from it).
CREATE TABLE IF NOT EXISTS proformas (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  cid VARCHAR(40) NULL,            -- empty while the customer is a walk-in (not registered yet); filled when the job card is created
  vid CHAR(36) NULL,
  guest_name VARCHAR(120) NOT NULL DEFAULT '',    -- walk-in details, written on the proforma until the customer agrees and is registered
  guest_phone VARCHAR(30) NOT NULL DEFAULT '',
  guest_plate VARCHAR(30) NOT NULL DEFAULT '',
  guest_brand VARCHAR(40) NOT NULL DEFAULT '',
  guest_model VARCHAR(60) NOT NULL DEFAULT '',
  guest_vin VARCHAR(40) NOT NULL DEFAULT '',      -- chassis / VIN of the walk-in's vehicle
  guest_eng VARCHAR(40) NOT NULL DEFAULT '',      -- engine / motor number
  insurer_id CHAR(36) NULL,
  policy_no VARCHAR(60) NOT NULL DEFAULT '',
  estimator_id CHAR(36) NULL,
  estimator VARCHAR(120) NOT NULL DEFAULT '',
  estimator_role VARCHAR(10) NOT NULL DEFAULT '',
  pdate DATE NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('Draft','Issued','Converted') NOT NULL DEFAULT 'Draft',
  labours JSON NOT NULL,
  parts JSON NOT NULL,
  est VARCHAR(40) NULL,
  job VARCHAR(40) NULL,
  claim_no VARCHAR(60) NOT NULL DEFAULT '',
  priority VARCHAR(20) NOT NULL DEFAULT '',
  due_date DATE NULL,
  terms VARCHAR(1000) NOT NULL DEFAULT '',
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY proformas_status (status),
  KEY proformas_vid (vid),
  CONSTRAINT proformas_cid_fk FOREIGN KEY (cid) REFERENCES customers (id),
  CONSTRAINT proformas_vid_fk FOREIGN KEY (vid) REFERENCES vehicles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Goods received notes: parts bought and added to stock
CREATE TABLE IF NOT EXISTS grns (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  supplier VARCHAR(200) NOT NULL,
  ref VARCHAR(80) NOT NULL DEFAULT '',
  note VARCHAR(500) NOT NULL DEFAULT '',
  `lines` JSON NOT NULL,
  total DECIMAL(14,2) NOT NULL DEFAULT 0,
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  by_name VARCHAR(120) NULL,
  KEY grns_created (created)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Point of sale: cash sales, credit sales and proformas (parts only). Cash and credit sales are also the invoices of the point of sale.
CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  kind ENUM('Cash','Credit','Proforma') NOT NULL,
  status ENUM('Issued','Cancelled','Converted') NOT NULL DEFAULT 'Issued',
  cid VARCHAR(40) NULL,
  cust_name VARCHAR(200) NOT NULL DEFAULT '',
  cust_phone VARCHAR(30) NOT NULL DEFAULT '',
  cust_tin VARCHAR(40) NOT NULL DEFAULT '',
  `lines` JSON NOT NULL,
  totals JSON NOT NULL,
  show_codes TINYINT(1) NOT NULL DEFAULT 1,   -- proforma: show or hide the part numbers
  note VARCHAR(500) NOT NULL DEFAULT '',
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  by_name VARCHAR(120) NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by VARCHAR(120) NULL,
  cancel_reason VARCHAR(200) NULL,
  from_pro VARCHAR(40) NULL,
  converted_to VARCHAR(40) NULL,
  KEY sales_created (created),
  KEY sales_kind (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payments collected on credit invoices (source 'sale' = point of sale, 'job' = job card)
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source ENUM('job','sale') NOT NULL,
  ref VARCHAR(40) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(30) NOT NULL DEFAULT 'Cash',
  note VARCHAR(200) NOT NULL DEFAULT '',
  by_name VARCHAR(120) NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY payments_ref (source, ref),
  CONSTRAINT payments_amount_ck CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Attempts to sell or issue a part that was not available
CREATE TABLE IF NOT EXISTS lost_sales (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  code VARCHAR(40) NOT NULL DEFAULT '',
  name VARCHAR(120) NOT NULL,
  qty DECIMAL(12,2) NOT NULL DEFAULT 1,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  reason VARCHAR(60) NOT NULL DEFAULT '',
  source VARCHAR(30) NOT NULL DEFAULT '',
  ref VARCHAR(40) NULL,
  by_name VARCHAR(120) NULL,
  KEY lost_sales_at (`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Settings kept in the database (changed on screen by the manager): labour rate per section, ...
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) NOT NULL PRIMARY KEY,
  v JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit trail: who did what and when (written by the server after each change; no data values and no passwords are kept)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at DATETIME(3) NOT NULL,
  user_id CHAR(36) NULL,
  user_name VARCHAR(120) NOT NULL DEFAULT '',
  role VARCHAR(10) NOT NULL DEFAULT '',
  method VARCHAR(8) NOT NULL,
  path VARCHAR(200) NOT NULL,
  action VARCHAR(120) NOT NULL,
  ref VARCHAR(60) NOT NULL DEFAULT '',
  status SMALLINT NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  KEY audit_at (at),
  KEY audit_user (user_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customer approval of an estimate or proforma by link. The snapshot is what the customer was shown; the long random token is the key.
CREATE TABLE IF NOT EXISTS approvals (
  token CHAR(48) NOT NULL PRIMARY KEY,
  kind ENUM('estimate','proforma') NOT NULL,
  ref VARCHAR(40) NOT NULL,
  status ENUM('Pending','Approved','Declined','Revoked') NOT NULL DEFAULT 'Pending',
  snapshot JSON NOT NULL,
  by_name VARCHAR(120) NOT NULL DEFAULT '',
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires DATETIME(3) NOT NULL,
  decided_at DATETIME(3) NULL,
  decided_name VARCHAR(120) NULL,
  decided_note VARCHAR(300) NULL,
  decided_ip VARCHAR(60) NULL,
  KEY approvals_ref (kind, ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Reception inspection checklist and photos of the vehicle, per job card
CREATE TABLE IF NOT EXISTS job_inspections (
  job_id VARCHAR(40) NOT NULL PRIMARY KEY,
  data JSON NOT NULL,
  by_name VARCHAR(120) NOT NULL DEFAULT '',
  updated DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT job_inspections_job_fk FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS job_photos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id VARCHAR(40) NOT NULL,
  label VARCHAR(60) NOT NULL DEFAULT '',
  mime VARCHAR(20) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  by_name VARCHAR(120) NOT NULL DEFAULT '',
  created DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY job_photos_job (job_id),
  CONSTRAINT job_photos_job_fk FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Service-due reminders: when a vehicle was last reminded about its next service (so it is not reminded twice)
CREATE TABLE IF NOT EXISTS service_reminders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  vid CHAR(36) NOT NULL,
  next_km INT NULL,
  channel VARCHAR(12) NOT NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  by_name VARCHAR(120) NULL,
  KEY service_reminders_vid (vid, `at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
