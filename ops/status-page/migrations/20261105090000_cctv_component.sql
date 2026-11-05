-- Execute as one atomic D1 batch. Expand component IDs without resetting history.
CREATE TABLE component_checks_ops19 (
  service TEXT NOT NULL CHECK (service IN ('sigap_staging','sigap_storage','sigap_services','sigap_pdf','sigap_sync','sigap_outbound','sigap_external','cctv')),
  slot INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('up','down','degraded','unknown')),
  latency_ms INTEGER CHECK (latency_ms BETWEEN 0 AND 60000),
  http_status INTEGER CHECK (http_status BETWEEN 100 AND 599),
  reason TEXT,
  PRIMARY KEY (service, slot)
);
INSERT INTO component_checks_ops19 SELECT * FROM component_checks;
CREATE TABLE component_daily_checks_ops19 (
  service TEXT NOT NULL CHECK (service IN ('sigap_staging','sigap_storage','sigap_services','sigap_pdf','sigap_sync','sigap_outbound','sigap_external','cctv')),
  day TEXT NOT NULL,
  up_count INTEGER NOT NULL DEFAULT 0 CHECK (up_count >= 0),
  degraded_count INTEGER NOT NULL DEFAULT 0 CHECK (degraded_count >= 0),
  down_count INTEGER NOT NULL DEFAULT 0 CHECK (down_count >= 0),
  unknown_count INTEGER NOT NULL DEFAULT 0 CHECK (unknown_count >= 0),
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (service, day)
);
INSERT INTO component_daily_checks_ops19 SELECT * FROM component_daily_checks;
CREATE TABLE ops19_copy_guard (ok INTEGER NOT NULL CHECK (ok=1));
INSERT INTO ops19_copy_guard SELECT CASE WHEN
  NOT EXISTS(SELECT * FROM component_checks EXCEPT SELECT * FROM component_checks_ops19)
  AND NOT EXISTS(SELECT * FROM component_checks_ops19 EXCEPT SELECT * FROM component_checks)
  AND NOT EXISTS(SELECT * FROM component_daily_checks EXCEPT SELECT * FROM component_daily_checks_ops19)
  AND NOT EXISTS(SELECT * FROM component_daily_checks_ops19 EXCEPT SELECT * FROM component_daily_checks)
  THEN 1 ELSE 0 END;
DROP TABLE component_checks;
ALTER TABLE component_checks_ops19 RENAME TO component_checks;
CREATE INDEX component_checks_at ON component_checks(checked_at);
DROP TABLE component_daily_checks;
ALTER TABLE component_daily_checks_ops19 RENAME TO component_daily_checks;
DROP TABLE ops19_copy_guard;
