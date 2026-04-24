-- Master cron run history (separate from per-agent economy_cycles)
CREATE TABLE IF NOT EXISTS master_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ DEFAULT now(),
  duration_ms INTEGER,
  summary JSONB,
  results JSONB,
  failures TEXT[]
);
CREATE INDEX IF NOT EXISTS idx_master_cycles_completed ON master_cycles(completed_at DESC);

ALTER TABLE master_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "master_cycles_service" ON master_cycles;
CREATE POLICY "master_cycles_service" ON master_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);
