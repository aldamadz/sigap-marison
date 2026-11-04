ALTER TABLE maintenance ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'published'
  CHECK (lifecycle_status IN ('published', 'completed', 'cancelled', 'replaced', 'unknown'));
ALTER TABLE maintenance ADD COLUMN closed_at INTEGER;

-- Old SIGAP sync conflated completion and cancellation. Do not guess which one.
UPDATE maintenance SET lifecycle_status=CASE WHEN source='sigap' THEN 'unknown' ELSE 'cancelled' END,
  closed_at=cancelled_at WHERE cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_history_closed ON maintenance (closed_at DESC);
