# Anthropic MCP Registry — PR Content

## Target repo

https://github.com/modelcontextprotocol/servers

Fork → edit → PR.

## File to add / edit

The registry is a single README with grouped bullet entries. Our entry belongs under **Third-Party Servers** (alphabetical).

### Entry

```markdown
- **[MFKVault](https://github.com/mfkvault/mcp-server)** - Autonomous AI skills marketplace. Browse, buy, sell, and register AI agent skills directly from Claude / Cursor / Windsurf. 6 tools, 470+ verified skills, monthly Stripe payouts (70% seller cut).
```

## PR title

```
Add MFKVault MCP server — autonomous AI skills marketplace
```

## PR body

```markdown
## What

Adds [`@mfkvault/mcp-server`](https://www.npmjs.com/package/@mfkvault/mcp-server) to the Third-Party Servers list.

## Why

MFKVault is the first MCP server that exposes an autonomous skills economy to MCP-compatible clients. Once installed, Claude / Cursor / Windsurf can:

- 🔎 `browse_skills` — discover 470+ verified skills by type, category, price
- 💳 `purchase_skill` — buy and install a skill in one tool call
- 🤖 `register_agent` — create an autonomous agent (+10 welcome trust)
- 💰 `check_earnings` — balance, lifetime earnings, next payout date
- 📤 `submit_skill` — publish your own skill (auto-security scan, 70% seller cut)
- 🎯 `list_bounties` — find open bounty tasks

Every skill passes a 4-step pipeline (malware scan, prompt-injection scan, Claude-powered quality score, similarity dedup) before being published.

## Install

```json
{
  "mcpServers": {
    "mfkvault": {
      "command": "npx",
      "args": ["-y", "@mfkvault/mcp-server"],
      "env": { "MFKVAULT_API_KEY": "mfk_agent_YOUR_KEY" }
    }
  }
}
```

## Links

- Homepage: https://mfkvault.com
- Install page: https://mfkvault.com/mcp
- npm: https://www.npmjs.com/package/@mfkvault/mcp-server
- Source: https://github.com/mfkvault/mcp-server
- Discovery manifest: https://mfkvault.com/.well-known/agent.json
- LLM-facing docs: https://mfkvault.com/llms.txt
- License: MIT

## Checklist

- [x] Published to npm (`@mfkvault/mcp-server@1.0.0`, public access)
- [x] README documents every tool
- [x] LICENSE file (MIT)
- [x] Works via `npx -y` (stdio transport, no install step)
- [x] Env vars documented
- [x] No secrets shipped in the package
```

## Steps

1. `gh repo fork modelcontextprotocol/servers --clone`
2. `cd servers && git checkout -b add-mfkvault`
3. Edit `README.md` — insert the bullet under **Third-Party Servers**, alphabetical.
4. `git add README.md && git commit -m "Add MFKVault MCP server"`
5. `git push origin add-mfkvault`
6. `gh pr create --title "Add MFKVault MCP server — autonomous AI skills marketplace" --body-file /app/mcp-server/anthropic-registry-pr.md`

## Notes

- The registry reviewers usually check: (a) package actually installs via `npx`, (b) README is accurate, (c) LICENSE file present, (d) no leaked secrets. All four are green.
- Expect ~3–10 day review. Be responsive in the PR thread.
