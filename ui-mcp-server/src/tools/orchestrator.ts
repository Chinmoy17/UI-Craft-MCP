/**
 * Orchestrator -- UI Craft session state machine.
 *
 * Flow: INIT -> PLAN -> DESIGN -> EVALUATE -> DONE
 *
 * Design principles:
 * - All input fields are optional. The orchestrator resolves missing values from
 *   stored context, infers from freeform context strings, or applies smart defaults.
 * - Truly empty invocations (no args + no stored context) return a structured
 *   "needs info" response instead of blocking or failing silently.
 * - Every stage retries up to MAX_RETRIES on failure with exponential backoff.
 * - If retries are exhausted, a structured fallback is emitted -- never silent failure.
 * - Storage is guaranteed to be initialized before any stage runs.
 * - Works wherever the MCP server is registered: the workspace is resolved in storage.ts.
 */

import { z } from 'zod'
import { startSession, type StartSessionInput } from './start_session.js'
import { designPage, type DesignPageInput } from './design_page.js'
import {
  initContextSystem,
  loadContext,
  loadState,
  saveState,
  type ProjectContext,
} from '../storage/storage.js'

// --- Zod shape (all optional -- orchestrator resolves what it can) ---------------

const PAGE_TYPES = [
  'dashboard', 'landing_page', 'form', 'settings',
  'onboarding', 'pricing', 'navigation', 'content_page', 'other',
] as const

const WORKING_MODES  = ['improve_existing', 'start_from_scratch', 'analyze_only', 'preview_redesign', 'apply_safe_changes'] as const
const GOALS          = ['clarity', 'conversion', 'trust', 'speed', 'engagement', 'visual_polish'] as const
const TONES          = ['minimal', 'bold', 'professional', 'playful', 'premium', 'technical'] as const
const DENSITIES      = ['compact', 'balanced', 'spacious'] as const
const CHANGE_MODES   = ['suggest_only', 'preview_then_ask', 'auto_apply_safe_changes'] as const

export const runSessionShape = {
  page_type:          z.enum(PAGE_TYPES).optional()
                       .describe('The page surface to design. Loaded from context if omitted.'),
  audience:           z.string().optional()
                       .describe('Who uses this page -- freeform or a role. Loaded from context if omitted.'),
  primary_goal:       z.enum(GOALS).optional()
                       .describe('Main outcome. Defaults to stored preference or "clarity".'),
  working_mode:       z.enum(WORKING_MODES).optional()
                       .describe('How to approach the session. Defaults to stored or "preview_redesign".'),
  design_tone:        z.enum(TONES).optional()
                       .describe('Visual and emotional tone. Defaults to stored brand tone or "professional".'),
  density_preference: z.enum(DENSITIES).optional()
                       .describe('UI density. Defaults to stored preference or "balanced".'),
  change_behavior:    z.enum(CHANGE_MODES).optional()
                       .describe('How aggressively to propose changes. Defaults to "suggest_only".'),
  context:            z.string().optional()
                       .describe('Additional product or design context -- the orchestrator extracts signals from this.'),
  additional_notes:   z.string().optional()
                       .describe('Freeform notes: constraints, brand references, must-keep elements.'),
}

export type RunSessionInput = {
  page_type?:          typeof PAGE_TYPES[number]
  audience?:           string
  primary_goal?:       typeof GOALS[number]
  working_mode?:       typeof WORKING_MODES[number]
  design_tone?:        typeof TONES[number]
  density_preference?: typeof DENSITIES[number]
  change_behavior?:    typeof CHANGE_MODES[number]
  context?:            string
  additional_notes?:   string
}

// --- Internal types -------------------------------------------------------

type OrchestratorStage = 'INIT' | 'PLAN' | 'DESIGN' | 'EVALUATE' | 'DONE' | 'ERROR'

interface StageResult {
  stage: OrchestratorStage
  success: boolean
  output: string
  error?: string
  attempts: number
  durationMs: number
}

export interface OrchestratorResult {
  success: boolean
  finalStage: OrchestratorStage
  stages: StageResult[]
  combinedOutput: string
  log: string[]
}

interface ResolvedInput {
  // startSession fields (all required -- resolved from args/context/defaults)
  working_mode:       StartSessionInput['working_mode']
  surface_type:       StartSessionInput['surface_type']
  primary_goal:       StartSessionInput['primary_goal']
  audience_enum:      StartSessionInput['audience']
  design_tone:        StartSessionInput['design_tone']
  density_preference: StartSessionInput['density_preference']
  change_behavior:    StartSessionInput['change_behavior']
  session_mode:       StartSessionInput['session_mode']
  additional_notes?:  string
  // designPage fields
  page_type:          DesignPageInput['page_type']
  audience_text:      string
  emphasis:           DesignPageInput['emphasis']
  context?:           string
  // metadata
  is_fresh_start:     boolean
  defaults_used:      string[]
}

// --- Constants -------------------------------------------------------------

const MAX_RETRIES = 3

// --- Logger ---------------------------------------------------------------

function makeLogger() {
  const entries: string[] = []
  function log(stage: string, message: string): void {
    entries.push(`[${stage}] ${message}`)
  }
  return { log, entries }
}

// --- Retry (synchronous) --------------------------------------------------

function withRetry<T>(
  stageName: string,
  fn: () => T,
  log: (s: string, m: string) => void
): { result: T; attempts: number; durationMs: number } {
  let lastError: unknown
  const start = Date.now()

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(stageName, attempt === 1 ? 'starting' : `retry ${attempt}/${MAX_RETRIES}`)
      const result = fn()
      log(stageName, `ok (attempt ${attempt}, ${Date.now() - start}ms)`)
      return { result, attempts: attempt, durationMs: Date.now() - start }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : String(err)
      log(stageName, `attempt ${attempt} failed: ${msg}`)
      if (attempt < MAX_RETRIES) {
        const delay = 50 * Math.pow(2, attempt - 1)   // 50, 100, 200ms
        const deadline = Date.now() + delay
        while (Date.now() < deadline) { /* busy-wait -- sub-200ms */ }
      }
    }
  }

  throw lastError
}

// --- Context inference from freeform strings ------------------------------

function inferPageType(text: string): DesignPageInput['page_type'] | null {
  const t = text.toLowerCase()
  if (/dashboard|analytics|overview|metric|chart|graph/.test(t))  return 'dashboard'
  if (/landing|home page|hero|marketing|campaign/.test(t))         return 'landing_page'
  if (/form|sign.?up|log.?in|register|checkout|input/.test(t))    return 'form'
  if (/setting|preference|config|account|profile/.test(t))        return 'settings'
  if (/onboard|welcome|getting started|tutorial|first.?run/.test(t)) return 'onboarding'
  if (/pricing|plan|subscription|tier|cost/.test(t))              return 'pricing'
  if (/nav|menu|sidebar|header|breadcrumb/.test(t))               return 'navigation'
  return null
}

function inferAudienceText(text: string): string | null {
  const t = text.toLowerCase()
  if (/developer|engineer|technical|devops|architect/.test(t))    return 'software developers and engineers'
  if (/admin|operator|manager|it team/.test(t))                   return 'system administrators'
  if (/consumer|customer|end.?user|shopper|general public/.test(t)) return 'general consumers'
  if (/executive|ceo|cto|stakeholder|leadership|c.suite/.test(t)) return 'business executives'
  if (/fintech|finance|bank|invest|portfolio/.test(t))            return 'financial professionals'
  if (/health|medical|patient|clinic|hospital/.test(t))           return 'healthcare users'
  if (/student|learner|education|school|course/.test(t))          return 'learners and students'
  return null
}

function audienceTextToEnum(text: string): StartSessionInput['audience'] {
  const t = text.toLowerCase()
  if (/developer|engineer|technical/.test(t)) return 'developers'
  if (/admin|operator|it/.test(t))            return 'admins'
  if (/consumer|customer|shopper/.test(t))    return 'consumers'
  if (/executive|ceo|cto|leader/.test(t))     return 'executives'
  return 'mixed_audience'
}

function goalToEmphasis(goal: string): DesignPageInput['emphasis'] {
  const map: Record<string, DesignPageInput['emphasis']> = {
    clarity:       'clarity',
    conversion:    'conversion',
    trust:         'trust',
    speed:         'speed',
    engagement:    'conversion',
    visual_polish: 'clarity',
  }
  return map[goal] ?? 'clarity'
}

/** Map page_type to the subset that designPage accepts, with safe fallback. */
function toDesignPageType(pt: string): DesignPageInput['page_type'] {
  const supported: Array<DesignPageInput['page_type']> = [
    'dashboard', 'landing_page', 'form', 'settings', 'onboarding', 'pricing', 'navigation',
  ]
  if (supported.includes(pt as DesignPageInput['page_type'])) {
    return pt as DesignPageInput['page_type']
  }
  if (pt === 'content_page') return 'landing_page'
  return 'dashboard'
}

// --- Resolution logic ----------------------------------------------------

function isFreshStart(stored: ProjectContext): boolean {
  return (
    stored.project_name === '' &&
    stored.audience === '' &&
    stored.industry === ''
  )
}

function hasNoInput(input: RunSessionInput): boolean {
  return Object.values(input).every(v => v === undefined || v === null || v === '')
}

function resolveInput(
  input: RunSessionInput,
  stored: ProjectContext
): ResolvedInput {
  const defaults_used: string[] = []
  const combinedText = [input.context ?? '', input.additional_notes ?? ''].join(' ').trim()

  // -- page_type ---
  let rawPageType: string | undefined = input.page_type
  if (!rawPageType) {
    // try stored active page
    const storedSurface = loadState().active_page?.page_model?.surface?.page_type
    if (storedSurface && storedSurface !== 'other') rawPageType = storedSurface
  }
  if (!rawPageType && combinedText) {
    const inferred = inferPageType(combinedText)
    if (inferred) {
      rawPageType = inferred
      defaults_used.push(`page_type inferred from context: "${inferred}"`)
    }
  }
  if (!rawPageType) {
    rawPageType = 'dashboard'
    defaults_used.push('page_type defaulted to "dashboard"')
  }

  const page_type = toDesignPageType(rawPageType)
  const surface_type = (rawPageType === 'content_page' || rawPageType === 'other')
    ? (page_type as StartSessionInput['surface_type'])
    : rawPageType as StartSessionInput['surface_type']

  // -- audience ---
  let audience_text: string = input.audience ?? ''
  if (!audience_text && stored.audience) audience_text = stored.audience
  if (!audience_text && combinedText) {
    const inferred = inferAudienceText(combinedText)
    if (inferred) {
      audience_text = inferred
      defaults_used.push(`audience inferred from context: "${inferred}"`)
    }
  }
  if (!audience_text) {
    audience_text = 'product users'
    defaults_used.push('audience defaulted to "product users"')
  }

  const audience_enum = audienceTextToEnum(audience_text)

  // -- primary_goal ---
  const primary_goal: StartSessionInput['primary_goal'] =
    input.primary_goal ??
    (stored.preferences?.working_mode === 'start_from_scratch' ? 'clarity' : 'clarity')
  // (could add more inference here; clarity is the safest universal default)

  // -- emphasis (derived from goal) ---
  const emphasis = goalToEmphasis(primary_goal)

  // -- working_mode ---
  const working_mode: StartSessionInput['working_mode'] =
    input.working_mode ?? stored.preferences?.working_mode ?? 'preview_redesign'

  // -- design_tone ---
  const stored_tone = stored.brand?.tone?.[0]
  const design_tone: StartSessionInput['design_tone'] =
    input.design_tone ??
    (stored_tone as StartSessionInput['design_tone'] | undefined) ??
    'professional'

  // -- density ---
  const density_preference: StartSessionInput['density_preference'] =
    input.density_preference ?? stored.preferences?.density_preference ?? 'balanced'

  // -- change_behavior ---
  const change_behavior: StartSessionInput['change_behavior'] =
    input.change_behavior ?? stored.preferences?.change_behavior ?? 'suggest_only'

  // -- session_mode ---
  const session_mode: StartSessionInput['session_mode'] = 'full'

  return {
    working_mode,
    surface_type,
    primary_goal,
    audience_enum,
    design_tone,
    density_preference,
    change_behavior,
    session_mode,
    additional_notes: input.additional_notes,
    page_type,
    audience_text,
    emphasis,
    context: input.context,
    is_fresh_start: isFreshStart(stored),
    defaults_used,
  }
}

// --- "Needs info" response -----------------------------------------------

function buildNeedsInfoResponse(missing: string[]): string {
  const questions = missing.map(field => {
    if (field === 'page_type') {
      return [
        '**What page are you designing?**',
        'Options: `dashboard` · `landing_page` · `form` · `settings` · `onboarding` · `pricing` · `navigation`',
      ].join('\n')
    }
    if (field === 'audience') {
      return [
        '**Who is your primary audience?**',
        'Examples: `developers` · `consumers` · `admins` · `executives` · or describe freely.',
      ].join('\n')
    }
    return `**What is your ${field}?**`
  })

  return [
    '## UI Craft — Quick Setup',
    '',
    "It looks like this is a fresh start with no saved project context. I need a couple of answers before I can generate a tailored design strategy.",
    '',
    ...questions.flatMap((q, i) => [`${i + 1}. ${q}`, '']),
    '**Tip:** You can also just describe your project naturally in the `context` field, e.g.:',
    '> "A fintech dashboard for portfolio managers, focused on trust and clarity."',
    '',
    'Once you answer, call `run_session` again with your choices filled in — everything else will be handled automatically.',
  ].join('\n')
}

// --- Stage runners -------------------------------------------------------

function runPlanStage(resolved: ResolvedInput, log: (s: string, m: string) => void): StageResult {
  const start = Date.now()
  try {
    const { result, attempts, durationMs } = withRetry('PLAN', () =>
      startSession({
        working_mode:       resolved.working_mode,
        surface_type:       resolved.surface_type,
        primary_goal:       resolved.primary_goal,
        audience:           resolved.audience_enum,
        design_tone:        resolved.design_tone,
        density_preference: resolved.density_preference,
        change_behavior:    resolved.change_behavior,
        session_mode:       resolved.session_mode,
        additional_notes:   resolved.additional_notes,
      }), log
    )
    return { stage: 'PLAN', success: true, output: result, attempts, durationMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('PLAN', `all retries exhausted: ${message}`)
    return {
      stage: 'PLAN',
      success: false,
      output: '> Session initialization failed. Proceeding with stored context defaults.',
      error: message,
      attempts: MAX_RETRIES,
      durationMs: Date.now() - start,
    }
  }
}

function runDesignStage(resolved: ResolvedInput, log: (s: string, m: string) => void): StageResult {
  const start = Date.now()
  try {
    const { result, attempts, durationMs } = withRetry('DESIGN', () =>
      designPage({
        page_type: resolved.page_type,
        audience:  resolved.audience_text,
        emphasis:  resolved.emphasis,
        context:   resolved.context,
      }), log
    )
    return { stage: 'DESIGN', success: true, output: result, attempts, durationMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log('DESIGN', `all retries exhausted: ${message}`)
    return {
      stage: 'DESIGN',
      success: false,
      output: [
        '## Design Strategy Unavailable',
        `Error: ${message}`,
        '',
        '**Minimal fallback guidance:**',
        `- Surface: **${resolved.page_type}**, Emphasis: **${resolved.emphasis}**`,
        '- One primary focal point per viewport. One CTA. Progressive disclosure for complex flows.',
        '- WCAG AA contrast (4.5:1) on all critical text. 16px body minimum.',
      ].join('\n'),
      error: message,
      attempts: MAX_RETRIES,
      durationMs: Date.now() - start,
    }
  }
}

function runEvaluateStage(
  scored: StageResult[],
  resolved: ResolvedInput,
  log: (s: string, m: string) => void
): StageResult {
  const start = Date.now()
  log('EVALUATE', 'scoring session')

  const passed = scored.filter(s => s.success)
  const failed = scored.filter(s => !s.success)
  const totalDuration = scored.reduce((sum, s) => sum + s.durationMs, 0)
  const successRate = scored.length > 0 ? Math.round((passed.length / scored.length) * 100) : 100

  const rows = scored.map(s =>
    `| ${s.stage} | ${s.success ? 'OK' : 'FAILED'} | ${s.attempts} | ${s.durationMs}ms |`
  )

  const defaultsSection = resolved.defaults_used.length > 0
    ? [
        '',
        '**Smart defaults applied:**',
        ...resolved.defaults_used.map(d => `- ${d}`),
      ].join('\n')
    : ''

  const lines = [
    '## Session Evaluation',
    '',
    '| Stage | Status | Attempts | Duration |',
    '|-------|--------|----------|----------|',
    ...rows,
    `| Total | ${successRate}% success | \u2014 | ${totalDuration}ms |`,
    defaultsSection,
  ]

  if (failed.length > 0) {
    lines.push('', `**Degraded stages:** ${failed.map(s => s.stage).join(', ')} \u2014 fallback content used.`)
  } else {
    lines.push('', 'All stages completed successfully.')
  }

  if (resolved.is_fresh_start) {
    lines.push(
      '',
      '**Fresh project detected.** Your session preferences have been saved to `.vscode/ui-assistant/context.json`.',
      'Future `run_session` calls in this project will load them automatically.',
    )
  }

  log('EVALUATE', `${successRate}% success, ${totalDuration}ms`)

  return {
    stage: 'EVALUATE',
    success: true,
    output: lines.join('\n'),
    attempts: 1,
    durationMs: Date.now() - start,
  }
}

// --- Main entry point -----------------------------------------------------

export function runSession(raw: RunSessionInput): OrchestratorResult {
  const { log, entries } = makeLogger()
  const stageResults: StageResult[] = []

  try {
    // INIT: guarantee storage exists before anything else
    log('INIT', 'ensuring storage')
    initContextSystem()
    const stored = loadContext()
    log('INIT', `storage ready (fresh_start=${isFreshStart(stored)})`)

    // Check for truly empty invocation (no args + no stored context)
    if (hasNoInput(raw) && isFreshStart(stored)) {
      log('INIT', 'no input and no stored context -- returning needs-info response')
      const missing = ['page_type', 'audience']
      return {
        success: false,
        finalStage: 'INIT',
        stages: [],
        combinedOutput: buildNeedsInfoResponse(missing),
        log: entries,
      }
    }

    // Resolve all fields from args + stored context + inference + defaults
    const resolved = resolveInput(raw, stored)
    log('INIT', `resolved: page_type=${resolved.page_type}, audience="${resolved.audience_text}", emphasis=${resolved.emphasis}`)

    stageResults.push({ stage: 'INIT', success: true, output: '', attempts: 1, durationMs: 0 })

    saveState({
      current_stage: 'PLAN',
      updated_at: new Date().toISOString(),
      session: { current_mode: resolved.working_mode === 'start_from_scratch' ? 'greenfield' : 'existing' },
    })

    // PLAN
    const planResult = runPlanStage(resolved, log)
    stageResults.push(planResult)
    saveState({ current_stage: 'DESIGN', updated_at: new Date().toISOString() })

    // DESIGN
    const designResult = runDesignStage(resolved, log)
    stageResults.push(designResult)
    saveState({ current_stage: 'EVALUATE', updated_at: new Date().toISOString() })

    // EVALUATE (excludes INIT from scoring)
    const evaluateResult = runEvaluateStage(
      stageResults.filter(s => s.stage !== 'INIT'),
      resolved,
      log
    )
    stageResults.push(evaluateResult)
    saveState({ current_stage: 'DONE', updated_at: new Date().toISOString() })
    log('DONE', 'session complete')

    const allSuccess = stageResults.every(s => s.success)
    const combinedOutput = [
      planResult.output,
      '---',
      designResult.output,
      '---',
      evaluateResult.output,
    ].filter(Boolean).join('\n\n')

    return {
      success: allSuccess,
      finalStage: 'DONE',
      stages: stageResults,
      combinedOutput,
      log: entries,
    }
  } catch (err) {
    // Outer catch: only reachable if INIT itself fails (disk full, no permissions, etc.)
    const message = err instanceof Error ? err.message : String(err)
    log('ERROR', `fatal: ${message}`)

    return {
      success: false,
      finalStage: 'ERROR',
      stages: stageResults,
      combinedOutput: [
        '## UI Craft -- Session Could Not Start',
        '',
        `**Error:** ${message}`,
        '',
        '**Possible causes:**',
        '- No write access to the workspace directory.',
        '- Global MCP install with no detectable project -- set `UI_CRAFT_WORKSPACE_DIR` in your mcp.json `env` block.',
        '- Run `start_session` directly to bypass the orchestrator.',
        '',
        '**Minimal guidance in the meantime:**',
        '- One focal point per viewport. One primary CTA. WCAG AA contrast (4.5:1). 16px body minimum.',
      ].join('\n'),
      log: entries,
    }
  }
}
