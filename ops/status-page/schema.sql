CREATE TABLE IF NOT EXISTS checks (
  service TEXT NOT NULL CHECK (service IN ('drive', 'ai', 'sigap', 'marison')),
  slot INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('up', 'degraded', 'down')),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  http_status INTEGER,
  reason TEXT,
  PRIMARY KEY (service, slot)
);

CREATE INDEX IF NOT EXISTS checks_checked_at ON checks (checked_at);
