# claude-linear-mcp

An MCP (Model Context Protocol) server that connects Claude to
[Linear](https://linear.app) — browse, search, create, update, and comment on
issues straight from Claude Code or any MCP client. Issue attachments
(screenshots) are fetched and returned as images so Claude can actually look
at the bug report.

## Tools

- `list_issues` / `get_issue` — browse issues with status, priority, assignee, labels
- `search_issues` — full-text search
- `create_issue` / `update_issue` — manage issues (team, state, priority, assignee)
- `add_comment` — comment on issues
- `list_teams` / `list_workflow_states` — discover team + workflow structure
- Image attachments in issues are downloaded and passed to the model

## Setup

```bash
npm install
npm run build
```

Get a Linear API key (Linear → Settings → Security & access → Personal API keys),
then register the server with Claude Code:

```bash
claude mcp add linear -e LINEAR_API_KEY=lin_api_... -- node /path/to/claude-linear-mcp/build/index.js
```

Or add it to `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "linear": {
      "command": "node",
      "args": ["/path/to/claude-linear-mcp/build/index.js"],
      "env": { "LINEAR_API_KEY": "lin_api_..." }
    }
  }
}
```

## Stack

TypeScript, `@modelcontextprotocol/sdk`, zod. Talks to Linear's GraphQL API
directly — no other dependencies.
