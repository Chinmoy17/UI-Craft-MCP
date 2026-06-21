import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { designPage, designPageShape, type DesignPageInput } from './tools/design_page.js'
import { startSession, startSessionShape, type StartSessionInput } from './tools/start_session.js'
import { runSession, runSessionShape, type RunSessionInput } from './tools/orchestrator.js'
import {
  appendHistory,
  appendUsageEvent,
  initContextSystem,
  loadContext,
  loadState,
  loadUsage,
  saveContext,
  type ProjectContextUpdate,
} from './storage/storage.js'

const SERVER_VERSION = '0.4.5'

const server = new McpServer({
  name: 'ui-craft',
  version: '0.4.5',
})

type TextToolHandler = (input: unknown) => Promise<{
  content: Array<{ type: 'text'; text: string }>
}>

function registerTool(
  name: string,
  description: string,
  shape: Record<string, z.ZodTypeAny>,
  handler: TextToolHandler,
): void {
  const register = server.tool.bind(server) as unknown as (
    toolName: string,
    toolDescription: string,
    toolShape: Record<string, z.ZodTypeAny>,
    toolHandler: TextToolHandler,
  ) => void

  register(name, description, shape, handler)
}

registerTool(
  'design_page',
  'Generate a comprehensive UI design strategy for a specific page type. ' +
  'Returns layout recommendations, typography, color strategy, and the top psychology ' +
  'principles to apply — grounded in cognitive science and UX research.',
  designPageShape,
  async (input) => {
    const result = designPage(input as DesignPageInput)

    // lazy: storage only initializes on first actual tool call
    appendHistory({
      tool: 'design_page',
      input: input as Record<string, unknown>,
      summary: `Designed ${(input as DesignPageInput).page_type} for ${(input as DesignPageInput).audience}`,
    })

    return {
      content: [{ type: 'text', text: result }],
    }
  }
)

const projectContextShape = {
  project_name: z.string().optional(),
  stack: z.string().optional(),
  audience: z.string().optional(),
  industry: z.string().optional(),
  design_system: z.string().optional().describe('Name of the active design system (e.g. "bytemethod"). When set, design output follows that system\'s tokens and rules.'),
  brand: z.object({
    primary_color: z.string().optional(),
    font: z.string().optional(),
    theme: z.enum(['light', 'dark', 'custom']).optional(),
  }).optional(),
  device_targets: z.array(z.string()).optional(),
  custom_rules: z.array(z.string()).optional(),
}

registerTool(
  'get_project_context',
  'Read the current project context stored in the local .vscode/ui-assistant/context.json file for this user workspace.',
  {},
  async () => {
    const context = loadContext()

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(context, null, 2),
      }],
    }
  }
)

registerTool(
  'set_project_context',
  'Update the local project context used to tailor UI design recommendations for this workspace.',
  projectContextShape,
  async (input) => {
    saveContext(input as ProjectContextUpdate)

    appendHistory({
      tool: 'set_project_context',
      input: input as Record<string, unknown>,
      summary: 'Updated local project context',
    })

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(loadContext(), null, 2),
      }],
    }
  }
)

registerTool(
  'start_session',
  'Initialize a UI Craft session from structured MCQ-style answers so the assistant can adapt recommendations for existing UI or greenfield work.',
  startSessionShape,
  async (input) => {
    const result = startSession(input as StartSessionInput)

    appendHistory({
      tool: 'start_session',
      input: input as Record<string, unknown>,
      summary: `Started ${(input as StartSessionInput).working_mode} session for ${(input as StartSessionInput).surface_type}`,
    })

    appendUsageEvent('start_session', { version: SERVER_VERSION })

    return {
      content: [{ type: 'text', text: result }],
    }
  }
)

registerTool(
  'run_session',
  'Full orchestrated UI Craft session: onboarding → design strategy → evaluation. ' +
  'All fields are optional — pass what you know and the orchestrator resolves the rest from ' +
  'stored project context or smart defaults. For a completely fresh project with no context, ' +
  'it will ask only the two questions it truly cannot infer.',
  runSessionShape,
  async (input) => {
    const result = runSession(input as RunSessionInput)

    appendHistory({
      tool: 'run_session',
      input: input as Record<string, unknown>,
      summary: `Orchestrated session — stage: ${result.finalStage}, success: ${result.success}`,
    })

    return {
      content: [{ type: 'text', text: result.combinedOutput }],
    }
  }
)

registerTool(
  'get_session_state',
  'Read the current session state: stage, session_mode (full/progressive), resolved domains, ' +
  'and pending questions. Use this to understand what the assistant has already covered ' +
  'before making the next design call.',
  {},
  async () => {
    const state = loadState()
    const { current_stage, last_tool, updated_at, active_page, session } = state

    const resolvedDomains = active_page.resolved_domains ?? []
    const allDomains = ['typography', 'color', 'layout', 'brand', 'visual']
    const pendingDomains = allDomains.filter(d => !resolvedDomains.includes(d))

    const text = [
      '## UI Craft — Session State',
      '',
      `**Stage:** ${current_stage} | **Mode:** ${session.session_mode ?? 'full'} | **Last tool:** ${last_tool || 'none'}`,
      `**Updated:** ${updated_at || 'not yet'}`,
      `**Active page:** ${active_page.page_id || 'none'} (confidence: ${Math.round(active_page.analysis_confidence * 100)}%)`,
      '',
      '### Domain Resolution',
      `**Resolved:** ${resolvedDomains.length > 0 ? resolvedDomains.join(', ') : 'none yet'}`,
      `**Pending:** ${pendingDomains.length > 0 ? pendingDomains.join(', ') : 'all resolved'}`,
      '',
      session.pending_questions.length > 0
        ? `### Open Questions\n${session.pending_questions.map(q => `- ${q}`).join('\n')}`
        : '### Open Questions\nNone.',
      '',
      '> To reset resolved domains, start a new session with `run_session` or `start_session`.',
      '> To revisit a resolved domain, include "redo [domain]" in your next `design_page` context.',
    ].join('\n')

    return { content: [{ type: 'text', text }] }
  }
)

registerTool(
  'get_usage_stats',
  'Show local anonymous usage statistics for this UI Craft installation — tool call counts, ' +
  'page types designed, and total sessions. No PII is stored.',
  {},
  async () => {
    const usage = loadUsage()

    if (!usage) {
      return { content: [{ type: 'text', text: 'No usage data available yet. Run a session first.' }] }
    }

    const toolRows = Object.entries(usage.tool_calls)
      .sort(([, a], [, b]) => b - a)
      .map(([tool, count]) => `| ${tool} | ${count} |`)
      .join('\n')

    const pageRows = Object.entries(usage.page_types)
      .sort(([, a], [, b]) => b - a)
      .map(([pt, count]) => `| ${pt} | ${count} |`)
      .join('\n')

    const text = [
      '## UI Craft — Local Usage Stats',
      `Version: ${usage.version} | Install ID: \`${usage.install_id}\` (random, not a user identifier)`,
      `First seen: ${usage.first_seen.slice(0, 10)} | Last active: ${usage.last_seen.slice(0, 10)}`,
      `Total sessions: **${usage.total_sessions}**`,
      '',
      '### Tool Calls',
      '| Tool | Calls |',
      '|------|-------|',
      toolRows || '| (none yet) | — |',
      '',
      '### Page Types Designed',
      '| Page Type | Count |',
      '|-----------|-------|',
      pageRows || '| (none yet) | — |',
      '',
      '### Public npm Download Stats',
      'https://api.npmjs.org/downloads/point/last-month/@chinmoy_mitra/ui-craft',
    ].join('\n')

    return { content: [{ type: 'text', text }] }
  }
)

async function main() {
  // Proactive storage init: create .vscode/ui-assistant/ on server start,
  // not lazily on first tool call. Ensures clean state for all tools.
  try {
    initContextSystem()
  } catch {
    // Non-fatal: individual tool calls will retry initContextSystem themselves
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
