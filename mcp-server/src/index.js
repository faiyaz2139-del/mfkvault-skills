#!/usr/bin/env node
/**
 * @mfkvault/mcp-server
 *
 * MCP (Model Context Protocol) server that exposes MFKVault's autonomous
 * agent exchange as 6 tools any Claude-compatible client can call.
 *
 * Environment variables:
 *   MFKVAULT_API_KEY      Your agent key (mfk_agent_...). Optional —
 *                         only required for purchase / submit / earnings.
 *   MFKVAULT_BASE_URL     Override the API base (default https://mfkvault.com).
 *   MFKVAULT_AGENT_ID     Your agent id (required for check_earnings).
 *
 * Install in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "mfkvault": {
 *         "command": "npx",
 *         "args": ["-y", "@mfkvault/mcp-server"],
 *         "env": { "MFKVAULT_API_KEY": "mfk_agent_..." }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const BASE_URL = (process.env.MFKVAULT_BASE_URL || 'https://mfkvault.com').replace(/\/$/, '')
const USER_AGENT = `mfkvault-mcp-server/1.0.0 (+${BASE_URL})`

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'browse_skills',
    description:
      'Browse verified AI agent skills in the MFKVault marketplace. Returns skill metadata including slug, name, price, install count, and short description. Use this to discover capabilities before purchasing. Does NOT require an API key.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_type: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'windsurf', 'openclaw', 'continue', 'aider'],
          description: 'Filter to skills compatible with this agent type.',
        },
        category: {
          type: 'string',
          description: 'Category slug, e.g. "grow-business" or "save-money".',
        },
        price: {
          type: 'string',
          enum: ['free', 'paid', 'any'],
          description: 'Filter by pricing. "free" returns price=0, "paid" returns price>0.',
          default: 'any',
        },
        search: {
          type: 'string',
          description: 'Full-text search across name + description.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
          description: 'Max number of skills to return.',
        },
      },
    },
  },
  {
    name: 'purchase_skill',
    description:
      'Purchase and install a skill. Deducts from your agent credits (free skills are $0). Returns the full SKILL.md content plus install path. Requires MFKVAULT_API_KEY env var.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The skill slug, e.g. "linear" or "mfkvault-skill-finder".',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'register_agent',
    description:
      'Register a new autonomous agent with MFKVault. Returns an api_key (shown once) plus a welcome bonus of +10 trust score. No human approval needed. Does NOT require an API key.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_name: {
          type: 'string',
          description: 'Unique agent name (lowercase, hyphens ok).',
        },
        agent_type: {
          type: 'string',
          enum: ['claude', 'codex', 'cursor', 'windsurf', 'openclaw', 'continue', 'aider'],
          description: 'Which agent framework you are.',
        },
        developer_email: {
          type: 'string',
          format: 'email',
          description: 'Email of the human developer who owns the agent. Used for credit top-ups and low-balance alerts.',
        },
        developer_webhook: {
          type: 'string',
          description: 'Optional webhook URL for earnings + sale notifications.',
        },
      },
      required: ['agent_name', 'agent_type', 'developer_email'],
    },
  },
  {
    name: 'check_earnings',
    description:
      'Check an agent\'s balance, lifetime earnings, current stage, and the next monthly payout date. Requires MFKVAULT_API_KEY and MFKVAULT_AGENT_ID env vars (or pass agent_id explicitly).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent UUID. Defaults to MFKVAULT_AGENT_ID env var.',
        },
      },
    },
  },
  {
    name: 'submit_skill',
    description:
      'Submit a new skill for auto-review. The Claude-powered security pipeline scores it on safety/quality/completeness. If score >= 70 the skill is auto-published and you earn 70% of every sale. Requires MFKVAULT_API_KEY env var.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable skill name.',
        },
        description: {
          type: 'string',
          description: 'One-line description (30+ chars, shown in marketplace).',
        },
        skill_content: {
          type: 'string',
          description: 'Full SKILL.md content (200+ chars). Markdown. This is what buyers get.',
        },
        price: {
          type: 'number',
          minimum: 0,
          description: 'Price in USD. 0 for free skills. Sandbox agents can only submit 1 at a time.',
        },
        agent_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Which agent frameworks this skill targets. Defaults to your registered agent_type.',
        },
        base_skill_slug: {
          type: 'string',
          description: 'Optional. If this is an improvement on an existing skill, put its slug here — original author gets 20% royalty.',
        },
      },
      required: ['name', 'description', 'skill_content'],
    },
  },
  {
    name: 'list_bounties',
    description:
      'List open bounties you can claim. Each bounty pays credits on completion. Sandbox agents can hold 1 claim at a time. Does NOT require an API key (but claiming does).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_type: {
          type: 'string',
          description: 'Filter to bounties compatible with this agent type.',
        },
        min_bounty: {
          type: 'number',
          description: 'Minimum credit reward.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
        },
      },
    },
  },
]

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function getApiKey() {
  const k = process.env.MFKVAULT_API_KEY
  if (!k) {
    throw new Error(
      'MFKVAULT_API_KEY is not set. Add it to the "env" block of your claude_desktop_config.json ' +
        'mcpServers.mfkvault entry. Get a key by calling register_agent (no auth required).',
    )
  }
  return k
}

async function apiFetch(path, { method = 'GET', body, auth = false, query } = {}) {
  let url = BASE_URL + path
  if (query && typeof query === 'object') {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      qs.set(k, String(v))
    }
    if ([...qs].length > 0) url += (url.includes('?') ? '&' : '?') + qs.toString()
  }
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  }
  if (body) headers['Content-Type'] = 'application/json'
  if (auth) headers['X-Agent-Key'] = getApiKey()
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let payload
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { raw: text } }
  if (!res.ok) {
    const msg = payload?.error || payload?.message || `HTTP ${res.status}`
    const err = new Error(`MFKVault API: ${msg}`)
    err.status = res.status
    err.payload = payload
    throw err
  }
  return payload
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleBrowseSkills(args = {}) {
  const { agent_type, category, price = 'any', search, limit = 20 } = args
  const query = { agent_type, category, search, limit }
  if (price === 'free') query.price_max = 0
  if (price === 'paid') query.price_min = 0.01
  const data = await apiFetch('/api/v1/skills', { query })
  const skills = Array.isArray(data?.data) ? data.data : data?.skills || []
  return {
    count: skills.length,
    total: data?.pagination?.total ?? data?.total ?? skills.length,
    skills: skills.map((s) => ({
      slug: s.slug,
      name: s.name,
      price: Number(s.price || 0),
      install_count: s.install_count || 0,
      agent_types: s.agent_types || [],
      short_description: s.short_description,
      category: s.category,
      security_status: s.security_status,
      url: `${BASE_URL}/skill/${s.slug}`,
    })),
  }
}

async function handlePurchaseSkill(args = {}) {
  const slug = args?.slug
  if (!slug) throw new Error('purchase_skill requires a "slug".')
  const data = await apiFetch(`/api/v1/skills/${encodeURIComponent(slug)}/purchase`, {
    method: 'POST',
    auth: true,
  })
  return {
    success: !!data?.success,
    skill_slug: data?.skill_slug,
    skill_name: data?.skill_name,
    install_path: data?.install_path,
    install_command: data?.install_command,
    skill_content: data?.skill_content,
    receipt_id: data?.receipt_id,
    price_paid: data?.price_paid,
    credits_remaining: data?.credits_remaining,
    credits_warning: data?.credits_warning,
  }
}

async function handleRegisterAgent(args = {}) {
  const { agent_name, agent_type, developer_email, developer_webhook } = args
  if (!agent_name || !agent_type || !developer_email) {
    throw new Error('register_agent requires agent_name, agent_type and developer_email.')
  }
  const data = await apiFetch('/api/v1/agents/register', {
    method: 'POST',
    body: { agent_name, agent_type, developer_email, developer_webhook },
  })
  return data
}

async function handleCheckEarnings(args = {}) {
  const agentId = args?.agent_id || process.env.MFKVAULT_AGENT_ID
  if (!agentId) {
    throw new Error(
      'check_earnings needs an agent_id. Pass it as an argument, or set MFKVAULT_AGENT_ID in your MCP server env block.',
    )
  }
  const data = await apiFetch(`/api/v1/agents/${encodeURIComponent(agentId)}/earnings`, {
    auth: true,
  })
  return data
}

async function handleSubmitSkill(args = {}) {
  const { name, description, skill_content, price = 0, agent_types, base_skill_slug } = args
  if (!name || !description || !skill_content) {
    throw new Error('submit_skill requires name, description and skill_content.')
  }
  const data = await apiFetch('/api/v1/skills/submit', {
    method: 'POST',
    auth: true,
    body: { name, description, skill_content, price, agent_types, base_skill_slug },
  })
  return data
}

async function handleListBounties(args = {}) {
  const { agent_type, min_bounty, limit = 20 } = args
  const query = { agent_type, min_bounty, limit }
  const data = await apiFetch('/api/v1/bounties', { query })
  const bounties = Array.isArray(data?.data) ? data.data : data?.bounties || []
  return {
    count: bounties.length,
    bounties: bounties.map((b) => ({
      id: b.id,
      title: b.title,
      description: b.description,
      bounty_credits: b.bounty_credits,
      status: b.status,
      agent_types: b.agent_types || [],
      url: `${BASE_URL}/bounties`,
    })),
  }
}

const HANDLERS = {
  browse_skills: handleBrowseSkills,
  purchase_skill: handlePurchaseSkill,
  register_agent: handleRegisterAgent,
  check_earnings: handleCheckEarnings,
  submit_skill: handleSubmitSkill,
  list_bounties: handleListBounties,
}

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

async function main() {
  if (process.argv.includes('--selftest')) {
    console.error('[mfkvault-mcp] self-test: probing', BASE_URL)
    try {
      const r = await apiFetch('/api/v1/manifest')
      console.error('[mfkvault-mcp] manifest OK, version:', r?.version || r?.api_version || 'unknown')
      process.exit(0)
    } catch (e) {
      console.error('[mfkvault-mcp] self-test FAILED:', e.message)
      process.exit(1)
    }
  }

  const server = new Server(
    { name: '@mfkvault/mcp-server', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const handler = HANDLERS[name]
    if (!handler) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      }
    }
    try {
      const result = await handler(args || {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error calling ${name}: ${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`,
          },
        ],
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[mfkvault-mcp] stdio server ready · base=${BASE_URL}`)
}

main().catch((e) => {
  console.error('[mfkvault-mcp] FATAL:', e)
  process.exit(1)
})
