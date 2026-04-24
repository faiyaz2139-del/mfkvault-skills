-- Zero-Human Autonomous Economy — schema migration
-- Idempotent. Safe to re-run.

-- Fix 1: platform agent flag + external economy view
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_platform_agent BOOLEAN DEFAULT false;
UPDATE agents SET is_platform_agent = true
WHERE agent_name IN ('e2e-test-agent-1','phase2-buyer','atomic-test-buyer','mfkvault-helper-agent');

-- Fix 2: credit defaults + reinvest toggle
UPDATE agents SET credits = 0 WHERE credits IS NULL;
ALTER TABLE agents ALTER COLUMN credits SET DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auto_reinvest BOOLEAN DEFAULT true;

CREATE OR REPLACE VIEW external_economy AS
SELECT
  (SELECT COUNT(*) FROM agent_transactions t
     JOIN agents a ON a.id = t.agent_id
     WHERE a.is_platform_agent = false AND a.is_active = true) AS total_transactions,
  (SELECT COALESCE(SUM(ABS(amount)),0) FROM agent_transactions t
     JOIN agents a ON a.id = t.agent_id
     WHERE a.is_platform_agent = false AND a.is_active = true) AS total_volume,
  (SELECT COUNT(DISTINCT id) FROM agents
     WHERE is_platform_agent = false AND is_active = true) AS active_external_agents;

-- Fix 3: persistent rate limits
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rl_service" ON rate_limits;
CREATE POLICY "rl_service" ON rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Fix 4: recruitment tables
CREATE TABLE IF NOT EXISTS recruitment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_url TEXT UNIQUE,
  platform TEXT DEFAULT 'github',
  owner_username TEXT,
  repo_name TEXT,
  stars INTEGER DEFAULT 0,
  agent_type_detected TEXT,
  status TEXT DEFAULT 'pending',
  contacted_at TIMESTAMPTZ,
  followed_up_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  issue_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recruitment_status ON recruitment_targets(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_created ON recruitment_targets(created_at DESC);

CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES recruitment_targets(id) ON DELETE CASCADE,
  message_type TEXT,
  channel TEXT DEFAULT 'github_issue',
  sent_at TIMESTAMPTZ DEFAULT now(),
  response TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_sent ON outreach_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_channel_sent ON outreach_log(channel, sent_at DESC);

CREATE TABLE IF NOT EXISTS economy_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  health_score INTEGER,
  active_agents INTEGER,
  external_agents INTEGER,
  total_credits DECIMAL,
  skills_today INTEGER,
  purchases_today INTEGER,
  external_purchases INTEGER,
  recruited_today INTEGER,
  alerts JSONB,
  checked_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_checked ON economy_health(checked_at DESC);

CREATE TABLE IF NOT EXISTS agent_coaching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  suggestions JSONB,
  coached_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_agent ON agent_coaching(agent_id, coached_at DESC);

CREATE TABLE IF NOT EXISTS agent_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  boosted_by UUID REFERENCES agents(id) ON DELETE SET NULL,
  boost_type TEXT,
  boosted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_boosts_expires ON agent_boosts(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS mcp_registry_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_name TEXT,
  submission_url TEXT,
  status TEXT DEFAULT 'submitted',
  response JSONB,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  action_type TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_agent_type ON agent_actions(agent_id, action_type, created_at DESC);

-- Fix 5: seller retry context
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Service-role RLS on all new tables
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['recruitment_targets','outreach_log','economy_health','agent_coaching','agent_boosts','mcp_registry_submissions','agent_actions']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_service" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_service" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- mcp_installs (from prior session if missing)
CREATE TABLE IF NOT EXISTS mcp_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT,
  agent_type TEXT,
  installed_at TIMESTAMPTZ DEFAULT now()
);

-- Helper RPC: credit_agent (used by auto-reinvest). Only creates if missing.
CREATE OR REPLACE FUNCTION credit_agent(p_agent_id UUID, p_amount NUMERIC)
RETURNS NUMERIC AS $$
DECLARE new_credits NUMERIC;
BEGIN
  UPDATE agents SET credits = COALESCE(credits,0) + p_amount
    WHERE id = p_agent_id RETURNING credits INTO new_credits;
  RETURN new_credits;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
