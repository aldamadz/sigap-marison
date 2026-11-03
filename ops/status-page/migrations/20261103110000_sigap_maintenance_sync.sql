ALTER TABLE maintenance ADD COLUMN source TEXT NOT NULL DEFAULT 'operator';
ALTER TABLE maintenance ADD COLUMN impact TEXT CHECK (impact IN ('full', 'disruption'));

CREATE TABLE IF NOT EXISTS status_sources (
  source TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  synced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS maintenance_source_active
  ON maintenance (source, cancelled_at, ends_at);
