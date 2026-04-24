-- Upgrade: aggressive recruitment deltas. Idempotent.

ALTER TABLE recruitment_targets ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0;
ALTER TABLE recruitment_targets ADD COLUMN IF NOT EXISTS readme_snippet TEXT;
ALTER TABLE recruitment_targets ADD COLUMN IF NOT EXISTS followup2_at TIMESTAMPTZ;
ALTER TABLE recruitment_targets ADD COLUMN IF NOT EXISTS signals JSONB;

ALTER TABLE bounties ADD COLUMN IF NOT EXISTS escalation_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_recruitment_score ON recruitment_targets(score DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_status_score ON recruitment_targets(status, score DESC);
