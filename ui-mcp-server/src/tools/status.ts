import { VERSION } from '../version.js'
import {
  getWorkspaceInfo,
  listRegisteredProjects,
  loadContext,
  loadHistory,
  loadState,
  loadUsage,
  type HistoryEntry,
} from '../storage/storage.js'

const CONTEXT_HISTORY = 5
const STATUS_HISTORY = 10
const DOMAINS = ['typography', 'color', 'layout', 'brand', 'visual']

/** Drops empty strings, arrays and objects so the LLM only reads what is actually set. */
function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter(v => v !== undefined)
    return items.length > 0 ? items : undefined
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, prune(v)] as const)
      .filter(([, v]) => v !== undefined)
    return entries.length > 0 ? Object.fromEntries(entries) : undefined
  }
  return value === '' || value === null || value === undefined ? undefined : value
}

function formatHistory(entries: HistoryEntry[]): string {
  return entries
    .map(e => `- ${e.timestamp.slice(5, 16).replace('T', ' ')} ${e.tool}: ${e.summary}`)
    .join('\n')
}

/** get_project_context output: set fields as compact JSON, then the latest activity. */
export function buildContextText(): string {
  const { schema_version: _schema, knowledge_state: _knowledge, ...context } = loadContext()
  const recent = loadHistory(CONTEXT_HISTORY)

  return [
    JSON.stringify(prune(context) ?? {}),
    recent.length > 0 ? `Recent activity (UTC):\n${formatHistory(recent)}` : '',
  ].filter(Boolean).join('\n\n')
}

/** get_status output: version, storage location, session progress, history, usage. */
export function buildStatusText(includeProjects = false): string {
  const info = getWorkspaceInfo()
  const state = loadState()
  const usage = loadUsage()
  const history = loadHistory(STATUS_HISTORY)

  const resolved = state.active_page.resolved_domains ?? []
  const pending = DOMAINS.filter(d => !resolved.includes(d))
  const questions = state.session.pending_questions

  const lines = [
    `## UI Craft ${VERSION}`,
    `Storage: ${info.dir} (source: ${info.source})`,
    `Stage: ${state.current_stage} | Mode: ${state.session.session_mode ?? 'full'} | Last tool: ${state.last_tool || 'none'} | Updated: ${state.updated_at || 'not yet'}`,
    `Active page: ${state.active_page.page_id || 'none'} (confidence ${Math.round(state.active_page.analysis_confidence * 100)}%)`,
    `Domains resolved: ${resolved.length > 0 ? resolved.join(', ') : 'none yet'} | pending: ${pending.length > 0 ? pending.join(', ') : 'none'}`,
    `Open questions: ${questions.length > 0 ? questions.join(' | ') : 'none'}`,
  ]

  if (history.length > 0) {
    lines.push('', `Recent activity (UTC, last ${STATUS_HISTORY}):`, formatHistory(history))
  }

  if (usage) {
    const byCount = (counts: Record<string, number>) =>
      Object.entries(counts).sort(([, a], [, b]) => b - a).map(([k, n]) => `${k} x${n}`).join(', ') || 'none yet'

    lines.push(
      '',
      `Usage since ${usage.first_seen.slice(0, 10)}: ${usage.total_sessions} sessions`,
      `Tools: ${byCount(usage.tool_calls)}`,
      `Page types: ${byCount(usage.page_types)}`,
    )
  }

  if (includeProjects) {
    const projects = listRegisteredProjects()
    lines.push(
      '',
      'Projects on this machine:',
      ...(projects.length > 0
        ? projects.map(p => `- ${p.project_name || '(unnamed)'} | ${p.path} | started ${p.started.slice(0, 10)}`)
        : ['- none yet']),
    )
  }

  return lines.join('\n')
}
