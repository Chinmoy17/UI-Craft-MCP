# @chinmoy_mitra/ui-craft

> Psychology-backed UI design assistant for AI coding agents — via Model Context Protocol (MCP)

Stop asking your agent to "make it look good." Give it a real design brain.(checking)

---

## What It Does

**UI Craft** is an MCP server that plugs into your coding agent (GitHub Copilot, Claude, Cursor). When active, your agent can call it to get structured, research-backed UI design decisions for any page type.

Ask your agent:
```
Design a dashboard for developers focused on clarity
```

Get back:
- Layout structure and grid recommendation
- Typography rules (font size, line height, max-width)
- Color strategy
- Top 3 cognitive psychology principles that apply
- High-impact UI transformation moves for greenfield or redesign work
- Common mistakes to avoid
- Quick checklist

Backed by **16 UI psychology principles** — Gestalt, Fitts's Law, Hick's Law, Miller's Law, Halo Effect, Anchoring Bias, F-Pattern, and more.

---

## Install

No install needed. Runs via `npx` on demand.

---

## Setup

### VS Code (GitHub Copilot / Claude)

Create `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "ui-craft": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@chinmoy_mitra/ui-craft@latest"]
    }
  }
}
```

Restart VS Code. Switch Copilot Chat to **Agent mode**. Done.

---

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ui-craft": {
      "command": "npx",
      "args": ["-y", "@chinmoy_mitra/ui-craft@latest"]
    }
  }
}
```

---

### Cursor

Add to `~/.cursor/mcp.json` (Mac/Linux) or `%APPDATA%\Cursor\mcp.json` (Windows):

```json
{
  "mcpServers": {
    "ui-craft": {
      "command": "npx",
      "args": ["-y", "@chinmoy_mitra/ui-craft@latest"]
    }
  }
}
```

---

## Usage

Once connected, ask your agent naturally in **Agent mode**:

```
Design a landing page for a B2B SaaS product focused on trust

What's the UI strategy for an onboarding flow for first-time users?

Design a settings page focused on clarity
```

The agent will automatically call the `design_page` tool and return a full design brief.

---

## Available Tool

### `design_page`

| Parameter | Type | Options |
|---|---|---|
| `page_type` | string | `dashboard` `landing_page` `form` `settings` `onboarding` `pricing` `navigation` |
| `audience` | string | e.g. `"B2B enterprise users"`, `"first-time consumers"` |
| `emphasis` | string | `clarity` `conversion` `trust` `speed` |
| `context` | string (optional) | Any additional context about your product |

### `get_project_context`

Reads the current local project context from `.vscode/ui-assistant/context.json`.

### `set_project_context`

Updates the local project context used by `design_page`.

Supported fields:

- `project_name`
- `stack`
- `audience`
- `industry`
- `brand.primary_color`
- `brand.font`
- `brand.theme`
- `device_targets`
- `custom_rules`

## Local Project Storage

UI Craft stores project-aware state inside the user workspace:

```text
.vscode/ui-assistant/
  context.json
  state.json
  history.json
  notes.md
```

Resolution order:

- `UI_CRAFT_STORAGE_DIR` for a direct storage folder override
- `UI_CRAFT_WORKSPACE_DIR` for a workspace-root override
- `INIT_CWD` when launched via `npx`
- `process.cwd()` as the final fallback

---

## Requirements

- Node.js v18+
- VS Code with GitHub Copilot, Claude Code, or Cursor

---

## Roadmap

- `choose_palette` — color system generator based on brand mood
- `improve_ui` — critique existing JSX/HTML and suggest improvements
- `ask_ui` — free-form UI Q&A
- Theme support (light, dark, custom brand profiles)
- Remote server (for claude.ai and browser-based agents)

---

## Links

- [GitHub Repository](https://github.com/Chinmoy17/UI_Assitant_AI)
- [Report Issues](https://github.com/Chinmoy17/UI_Assitant_AI/issues)

---

## License

Apache-2.0




