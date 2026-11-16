CREATE TABLE IF NOT EXISTS daily_checks (
  service TEXT NOT NULL CHECK (service IN ('drive', 'ai', 'sigap', 'marison')),
  day TEXT NOT NULL,
  up_count INTEGER NOT NULL DEFAULT 0 CHECK (up_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  down_count INTEGER NOT NULL DEFAULT 0 CHECK (down_count >= 0),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (service, day)
);

INSERT INTO daily_checks (service, day, up_count, degraded_count, down_count, first_at, last_at)
SELECT service, strftime('%Y-%m-%d', checked_at / 1000, 'unixepoch', '+7 hours'),
  SUM(CASE WHEN outcome = 'up' THEN 1 ELSE 0 END),
  SUM(CASE WHEN outcome = 'degraded' THEN 1 ELSE 0 END),
  SUM(CASE WHEN outcome = 'down' THEN 1 ELSE 0 END),
  MIN(checked_at), MAX(checked_at)
FROM checks
GROUP BY service, strftime('%Y-%m-%d', checked_at / 1000, 'unixepoch', '+7 hours')
ON CONFLICT(service, day) DO NOTHING;

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 160),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 5 AND 2000),
  severity TEXT NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  service_ids TEXT NOT NULL CHECK (json_valid(service_ids)),
  started_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS incidents_started_at ON incidents (started_at DESC);

CREATE TABLE IF NOT EXISTS incident_updates (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  phase TEXT NOT NULL CHECK (phase IN ('identified', 'monitoring', 'resolved')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 5 AND 3000),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS incident_updates_incident_at
  ON incident_updates (incident_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maintenance (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 160),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 5 AND 2000),
  service_ids TEXT NOT NULL CHECK (json_valid(service_ids)),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS maintenance_starts_at ON maintenance (starts_at);
