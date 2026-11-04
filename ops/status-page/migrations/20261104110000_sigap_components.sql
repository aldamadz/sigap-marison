-- Keep checks/daily_checks unchanged: production SIGAP retains its original ID
-- and history; retired services remain archived rather than being repurposed.
CREATE TABLE IF NOT EXISTS component_checks (
  service TEXT NOT NULL CHECK (service IN ('sigap_staging','sigap_storage','sigap_services','sigap_pdf','sigap_sync','sigap_outbound','sigap_external')),
  slot INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('up','down','degraded','unknown')),
  latency_ms INTEGER CHECK (latency_ms BETWEEN 0 AND 60000),
  http_status INTEGER CHECK (http_status BETWEEN 100 AND 599),
  reason TEXT,
  PRIMARY KEY (service, slot)
);
CREATE INDEX IF NOT EXISTS component_checks_at ON component_checks(checked_at);

CREATE TABLE IF NOT EXISTS component_daily_checks (
  service TEXT NOT NULL CHECK (service IN ('sigap_staging','sigap_storage','sigap_services','sigap_pdf','sigap_sync','sigap_outbound','sigap_external')),
  day TEXT NOT NULL,
  up_count INTEGER NOT NULL DEFAULT 0 CHECK (up_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  down_count INTEGER NOT NULL DEFAULT 0 CHECK (down_count >= 0),
  unknown_count INTEGER NOT NULL DEFAULT 0 CHECK (unknown_count >= 0),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (service, day)
);
