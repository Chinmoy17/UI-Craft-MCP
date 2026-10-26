import { fileURLToPath } from 'url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { RootsListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { VERSION } from './version.js'
import { designPage, designPageShape, type DesignPageInput } from './tools/design_page.js'
import { startSession, startSessionShape, type StartSessionInput } from './tools/start_session.js'
import { runSession, runSessionShape, type RunSessionInput } from './tools/orchestrator.js'
import { buildContextText, buildStatusText } from './tools/status.js'
import {
  appendHistory,
  appendUsageEvent,
  clipText,
  recordSession,
  saveContext,
  setWorkspaceRoots,
  takeNotice,
  type ProjectContextUpdate,
} from './storage/storage.js'

const server = new McpServer({
  name: 'ui-craft',
  version: VERSION,
})

// ─── Workspace roots reported by the editor (MCP roots/list) ──────────────────────────────────

const ROOTS_TIMEOUT_MS = 3000

async function refreshRoots(): Promise<void> {
  try {
    if (!server.server.getClientCapabilities()?.roots) return
    const { roots } = await server.server.listRoots()
    setWorkspaceRoots(roots.filter(r => r.uri.startsWith('file:')).map(r => fileURLToPath(r.uri)))
  } catch {
    // client without roots support: the git root or current folder is used instead
  }
}

function refreshRootsWithTimeout(): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ROOTS_TIMEOUT_MS)
    timer.unref()
    void refreshRoots().finally(() => { clearTimeout(timer); resolve() })
  })
}

// Tool calls wait for this so the first call never races the roots request.
let rootsReady: Promise<void> = Promise.resolve()

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

type TextToolHandler = (input: unknown) => Promise<ToolResult>

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

  register(name, description, shape, async (input) => {
    await rootsReady
    try {
      const result = await handler(input)
      appendUsageEvent(name)

      const notice = takeNotice()
      return notice ? { ...result, content: [{ type: 'text', text: notice }, ...result.content] } : result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `UI Craft: ${message}` }], isError: true }
    }
  })
}

registerTool(
  'design_page',
  'Design strategy for one page type: layout, typography, color and the psychology principles to apply.',
  designPageShape,
  async (input) => {
    const args = input as DesignPageInput
    const result = designPage(args)

    appendHistory({
      tool: 'design_page',
      summary: `${args.page_type} · ${args.emphasis} · ${clipText(args.audience, 50)}`,
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
  'Read this workspace\'s saved UI context (non-empty fields only) and the most recent activity.',
  {},
  async () => ({ content: [{ type: 'text', text: buildContextText() }] })
)

registerTool(
  'set_project_context',
  'Save UI context for this workspace (stack, audience, brand, rules). Only the fields you pass change; lists are replaced.',
  projectContextShape,
  async (input) => {
    saveContext(input as ProjectContextUpdate)

    const changed = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)

    appendHistory({
      tool: 'set_project_context',
      summary: `updated: ${changed.join(', ') || 'nothing'}`,
    })

    return {
      content: [{ type: 'text', text: `Context saved (${changed.join(', ') || 'no changes'}).` }],
    }
  }
)

registerTool(
  'start_session',
  'Start a UI Craft session from structured answers (mode, surface, goal, audience, tone, density).',
  startSessionShape,
  async (input) => {
    const args = input as StartSessionInput
    const result = startSession(args)
    recordSession()

    appendHistory({
      tool: 'start_session',
      summary: `${args.working_mode} · ${args.surface_type} · ${args.primary_goal}`,
    })

    return {
      content: [{ type: 'text', text: result }],
    }
  }
)

registerTool(
  'run_session',
  'Full session in one call: plan, design strategy, evaluation. All fields are optional; missing ones come from saved context or defaults.',
  runSessionShape,
  async (input) => {
    const args = input as RunSessionInput
    const result = runSession(args)
    recordSession()

    appendHistory({
      tool: 'run_session',
      summary: `${args.page_type ?? 'inferred page'} · ${args.primary_goal ?? 'default goal'} · ${result.finalStage}${result.success ? '' : ' (failed)'}`,
    })

    return {
      content: [{ type: 'text', text: result.combinedOutput }],
    }
  }
)

registerTool(
  'get_status',
  'Show the running UI Craft version, where this workspace\'s data is stored, current stage, resolved design domains, recent activity and usage counts.',
  { include_projects: z.boolean().optional().describe('Also list the projects UI Craft has been used in on this machine.') },
  async (input) => ({
    content: [{ type: 'text', text: buildStatusText((input as { include_projects?: boolean }).include_projects ?? false) }],
  })
)

async function main() {
  // Storage initializes lazily on the first tool call that needs it, so simply
  // launching the server creates no files for workspaces that never use it.
  server.server.oninitialized = () => { rootsReady = refreshRootsWithTimeout() }
  server.server.setNotificationHandler(RootsListChangedNotificationSchema, () => {
    rootsReady = refreshRootsWithTimeout()
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`)
  process.exit(1)
})
