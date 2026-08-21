import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'

const HISTORY_LIMIT = 10
const STORAGE_DIRNAME = 'ui-assistant'
const WORKSPACE_DIR_ENV = 'UI_CRAFT_WORKSPACE_DIR'
const STORAGE_DIR_ENV = 'UI_CRAFT_STORAGE_DIR'

// ─── Multi-project support ───────────────────────────────────────────────────

const GLOBAL_PROJECTS_DIR = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(),
  '.ui-craft',
  'projects',
)

let _activeProjectSlug: string | null = null
let _activeProjectLoaded = false

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'default'
}

function readActiveProjectSlug(workspaceRoot: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(workspaceRoot, 'active_project.json'), 'utf-8')
    const { slug } = JSON.parse(raw)
    return slug || null
  } catch {
    return null
  }
}

function writeActiveProject(workspaceRoot: string, projectName: string): string {
  if (!fs.existsSync(workspaceRoot)) fs.mkdirSync(workspaceRoot, { recursive: true })
  const slug = slugify(projectName)
  fs.writeFileSync(
    path.join(workspaceRoot, 'active_project.json'),
    JSON.stringify({ slug, project_name: projectName }, null, 2),
  )
  _activeProjectSlug = slug
  _activeProjectLoaded = true
  return slug
}

// ─── Usage tracking ──────────────────────────────────────────────────────────

/**
 * Local-only, anonymous usage record stored in usage.json.
 * install_id is a random UUID stable per install location — NOT a user identifier.
 * No PII is stored here.
 */
export interface UsageRecord {
  install_id: string
  version: string
  first_seen: string
  last_seen: string
  total_sessions: number
  page_types: Record<string, number>
  tool_calls: Record<string, number>
}

// ─── Core types ───────────────────────────────────────────────────────────────

export type AssistantStage = 'INIT' | 'PLAN' | 'ANALYZE' | 'DESIGN' | 'GENERATE' | 'EVALUATE' | 'IMPROVE' | 'DONE'
export type WorkingMode = 'improve_existing' | 'start_from_scratch' | 'analyze_only' | 'preview_redesign' | 'apply_safe_changes'
export type ChangeBehavior = 'suggest_only' | 'preview_then_ask' | 'auto_apply_safe_changes'
export type DensityPreference = 'compact' | 'balanced' | 'spacious'
export type ExplanationLevel = 'minimal' | 'balanced' | 'developer_detailed'
export type DesignGoal = 'clarity' | 'conversion' | 'trust' | 'speed' | 'engagement' | 'visual_polish'
export type PageMode = 'existing' | 'greenfield'
export type SourceType = 'prompt' | 'json' | 'markdown' | 'tsx' | 'jsx' | 'html' | 'css' | 'dom' | 'screenshot'
export type PageType = 'dashboard' | 'landing_page' | 'form' | 'settings' | 'onboarding' | 'pricing' | 'navigation' | 'content_page' | 'other'
export type SignalLevel = 'low' | 'medium' | 'high' | 'unknown'
export type RecommendationStatus = 'proposed' | 'accepted' | 'applied' | 'dismissed'

export interface BrandContext {
  primary_color: string
  font: string
  theme: 'light' | 'dark' | 'custom'
  tone: string[]
}

export interface ProjectPreferences {
  working_mode: WorkingMode
  change_behavior: ChangeBehavior
  density_preference: DensityPreference
  explanation_level: ExplanationLevel
}

export interface ProjectConstraints {
  must_keep: string[]
  must_not_change: string[]
  design_system: 'existing' | 'new' | 'hybrid'
  input_preference: SourceType[]
}

export interface KnowledgeState {
  ingested_modules: string[]
  last_updated_at: string
}

export interface ProjectContext {
  version: string
  project_name: string
  stack: string
  audience: string
  industry: string
  design_system: string
  brand: BrandContext
  device_targets: string[]
  custom_rules: string[]
  preferences: ProjectPreferences
  constraints: ProjectConstraints
  knowledge_state: KnowledgeState
}

export interface HistoryEntry {
  timestamp: string
  tool: string
  input: Record<string, unknown>
  summary: string
}

export interface PageIntent {
  primary_goal: DesignGoal
  secondary_goals: DesignGoal[]
  user_task: string
  journey_stage: string
}

export interface PageProductContext {
  product_name: string
  industry: string
  audience: string[]
  device_targets: string[]
  brand_tone: string[]
  density_preference: DensityPreference
}

export interface PageSurface {
  page_type: PageType
  template_type: string
  route_or_entry: string
  platform: 'web' | 'ios' | 'android' | 'desktop' | 'other'
  viewport_priority: 'desktop-first' | 'mobile-first' | 'balanced'
}

export interface PageActionSummary {
  label: string
  location: string
  prominence: 'high' | 'medium' | 'low'
}

export interface PageSection {
  id: string
  role: string
  label: string
  priority: number
}

export interface PageStructure {
  sections: PageSection[]
  primary_cta: PageActionSummary
  secondary_actions: string[]
  navigation_depth: number
}

export interface ContentProfile {
  information_density: SignalLevel
  copy_tone: string
  visual_complexity: SignalLevel
  data_heaviness: SignalLevel
  form_complexity: SignalLevel
}

export interface SignalScore {
  score: number
  issues: string[]
}

export interface DesignSignals {
  visual_hierarchy: SignalScore
  contrast: SignalScore
  spacing: SignalScore
  alignment: SignalScore
  affordance: SignalScore
  feedback: SignalScore
}

export interface InteractionSignals {
  choice_load: SignalLevel
  fitts_risk: string[]
  hicks_risk: string[]
  cognitive_load_risk: string[]
  trust_risk: string[]
}

export interface PageSystemConstraints {
  must_keep: string[]
  must_not_change: string[]
  tech_constraints: string[]
  business_constraints: string[]
}

export interface PageEvidence {
  files: string[]
  dom_summary: string
  prompt_summary: string
  screenshot_used: boolean
  brief_sources: string[]
}

export interface PageRecommendation {
  id: string
  type: string
  impact: 'high' | 'medium' | 'low'
  effort: 'high' | 'medium' | 'low'
  confidence: number
  reason: string
  principles: string[]
  laws: string[]
  change: string
  status: RecommendationStatus
}

export interface PageModel {
  schema_version: string
  page_id: string
  page_name: string
  mode: PageMode
  source_types: SourceType[]
  confidence: number
  intent: PageIntent
  product_context: PageProductContext
  surface: PageSurface
  structure: PageStructure
  content_profile: ContentProfile
  design_signals: DesignSignals
  interaction_signals: InteractionSignals
  system_constraints: PageSystemConstraints
  evidence: PageEvidence
  recommendations: PageRecommendation[]
  open_questions: string[]
}

export type SessionMode = 'full' | 'progressive'

export interface ActivePageState {
  page_id: string
  last_analyzed_at: string
  page_model: PageModel
  analysis_confidence: number
  resolved_domains: string[]   // tracks which KB domains have been output this page
}

export interface SessionState {
  current_mode: PageMode | 'idle'
  session_mode: SessionMode    // 'full' = complete report every call; 'progressive' = funnel narrowing
  last_tool: string
  pending_questions: string[]
  pending_recommendations: string[]
  last_applied_change_id: string
}

export interface WatchState {
  enabled: boolean
  auto_refresh_on_agent_action: boolean
  last_trigger_source: SourceType | 'manual' | ''
}

export interface StorageState {
  current_stage: AssistantStage
  last_tool: string
  updated_at: string
  active_page: ActivePageState
  session: SessionState
  watch: WatchState
}

export interface SignalScoreUpdate {
  score?: number
  issues?: string[]
}

export interface ProjectContextUpdate {
  version?: string
  project_name?: string
  stack?: string
  audience?: string
  industry?: string
  design_system?: string
  brand?: {
    primary_color?: string
    font?: string
    theme?: 'light' | 'dark' | 'custom'
    tone?: string[]
  }
  device_targets?: string[]
  custom_rules?: string[]
  preferences?: Partial<ProjectPreferences>
  constraints?: {
    must_keep?: string[]
    must_not_change?: string[]
    design_system?: 'existing' | 'new' | 'hybrid'
    input_preference?: SourceType[]
  }
  knowledge_state?: {
    ingested_modules?: string[]
    last_updated_at?: string
  }
}

export interface PageModelUpdate {
  schema_version?: string
  page_id?: string
  page_name?: string
  mode?: PageMode
  source_types?: SourceType[]
  confidence?: number
  intent?: {
    primary_goal?: DesignGoal
    secondary_goals?: DesignGoal[]
    user_task?: string
    journey_stage?: string
  }
  product_context?: {
    product_name?: string
    industry?: string
    audience?: string[]
    device_targets?: string[]
    brand_tone?: string[]
    density_preference?: DensityPreference
  }
  surface?: Partial<PageSurface>
  structure?: {
    sections?: PageSection[]
    primary_cta?: Partial<PageActionSummary>
    secondary_actions?: string[]
    navigation_depth?: number
  }
  content_profile?: Partial<ContentProfile>
  design_signals?: {
    visual_hierarchy?: SignalScoreUpdate
    contrast?: SignalScoreUpdate
    spacing?: SignalScoreUpdate
    alignment?: SignalScoreUpdate
    affordance?: SignalScoreUpdate
    feedback?: SignalScoreUpdate
  }
  interaction_signals?: {
    choice_load?: SignalLevel
    fitts_risk?: string[]
    hicks_risk?: string[]
    cognitive_load_risk?: string[]
    trust_risk?: string[]
  }
  system_constraints?: {
    must_keep?: string[]
    must_not_change?: string[]
    tech_constraints?: string[]
    business_constraints?: string[]
  }
  evidence?: {
    files?: string[]
    dom_summary?: string
    prompt_summary?: string
    screenshot_used?: boolean
    brief_sources?: string[]
  }
  recommendations?: PageRecommendation[]
  open_questions?: string[]
}

export interface StorageStateUpdate {
  current_stage?: AssistantStage
  last_tool?: string
  updated_at?: string
  active_page?: {
    page_id?: string
    last_analyzed_at?: string
    page_model?: PageModelUpdate
    analysis_confidence?: number
    resolved_domains?: string[]
  }
  session?: {
    current_mode?: PageMode | 'idle'
    session_mode?: SessionMode
    last_tool?: string
    pending_questions?: string[]
    pending_recommendations?: string[]
    last_applied_change_id?: string
  }
  watch?: Partial<WatchState>
}

const DEFAULT_CONTEXT: ProjectContext = {
  version: '1.1',
  project_name: '',
  stack: '',
  audience: '',
  industry: '',
  design_system: '',
  brand: {
    primary_color: '',
    font: '',
    theme: 'light',
    tone: [],
  },
  device_targets: [],
  custom_rules: [],
  preferences: {
    working_mode: 'preview_redesign',
    change_behavior: 'preview_then_ask',
    density_preference: 'balanced',
    explanation_level: 'developer_detailed',
  },
  constraints: {
    must_keep: [],
    must_not_change: [],
    design_system: 'existing',
    input_preference: ['prompt', 'json', 'markdown', 'tsx', 'jsx', 'html', 'dom'],
  },
  knowledge_state: {
    ingested_modules: [],
    last_updated_at: '',
  },
}

const DEFAULT_SIGNAL_SCORE: SignalScore = {
  score: 0,
  issues: [],
}

export const DEFAULT_PAGE_MODEL: PageModel = {
  schema_version: '1.0',
  page_id: '',
  page_name: '',
  mode: 'existing',
  source_types: [],
  confidence: 0,
  intent: {
    primary_goal: 'clarity',
    secondary_goals: [],
    user_task: '',
    journey_stage: '',
  },
  product_context: {
    product_name: '',
    industry: '',
    audience: [],
    device_targets: [],
    brand_tone: [],
    density_preference: 'balanced',
  },
  surface: {
    page_type: 'other',
    template_type: '',
    route_or_entry: '',
    platform: 'web',
    viewport_priority: 'balanced',
  },
  structure: {
    sections: [],
    primary_cta: {
      label: '',
      location: '',
      prominence: 'low',
    },
    secondary_actions: [],
    navigation_depth: 0,
  },
  content_profile: {
    information_density: 'unknown',
    copy_tone: '',
    visual_complexity: 'unknown',
    data_heaviness: 'unknown',
    form_complexity: 'unknown',
  },
  design_signals: {
    visual_hierarchy: { ...DEFAULT_SIGNAL_SCORE },
    contrast: { ...DEFAULT_SIGNAL_SCORE },
    spacing: { ...DEFAULT_SIGNAL_SCORE },
    alignment: { ...DEFAULT_SIGNAL_SCORE },
    affordance: { ...DEFAULT_SIGNAL_SCORE },
    feedback: { ...DEFAULT_SIGNAL_SCORE },
  },
  interaction_signals: {
    choice_load: 'unknown',
    fitts_risk: [],
    hicks_risk: [],
    cognitive_load_risk: [],
    trust_risk: [],
  },
  system_constraints: {
    must_keep: [],
    must_not_change: [],
    tech_constraints: [],
    business_constraints: [],
  },
  evidence: {
    files: [],
    dom_summary: '',
    prompt_summary: '',
    screenshot_used: false,
    brief_sources: [],
  },
  recommendations: [],
  open_questions: [],
}

const DEFAULT_STATE: StorageState = {
  current_stage: 'INIT',
  last_tool: '',
  updated_at: '',
  active_page: {
    page_id: '',
    last_analyzed_at: '',
    page_model: DEFAULT_PAGE_MODEL,
    analysis_confidence: 0,
    resolved_domains: [],
  },
  session: {
    current_mode: 'idle',
    session_mode: 'full',
    last_tool: '',
    pending_questions: [],
    pending_recommendations: [],
    last_applied_change_id: '',
  },
  watch: {
    enabled: true,
    auto_refresh_on_agent_action: true,
    last_trigger_source: '',
  },
}

function withArrayFallback<T>(current: T[], updates?: T[]): T[] {
  return updates ?? current
}

function mergeSignalScore(current: SignalScore, updates?: SignalScoreUpdate): SignalScore {
  if (!updates) {
    return current
  }

  return {
    ...current,
    ...updates,
    issues: withArrayFallback(current.issues, updates.issues),
  }
}

function mergePageModel(current: PageModel, updates?: PageModelUpdate): PageModel {
  if (!updates) {
    return current
  }

  return {
    ...current,
    ...updates,
    source_types: withArrayFallback(current.source_types, updates.source_types),
    intent: {
      ...current.intent,
      ...(updates.intent ?? {}),
      secondary_goals: withArrayFallback(current.intent.secondary_goals, updates.intent?.secondary_goals),
    },
    product_context: {
      ...current.product_context,
      ...(updates.product_context ?? {}),
      audience: withArrayFallback(current.product_context.audience, updates.product_context?.audience),
      device_targets: withArrayFallback(current.product_context.device_targets, updates.product_context?.device_targets),
      brand_tone: withArrayFallback(current.product_context.brand_tone, updates.product_context?.brand_tone),
    },
    surface: {
      ...current.surface,
      ...(updates.surface ?? {}),
    },
    structure: {
      ...current.structure,
      ...(updates.structure ?? {}),
      sections: withArrayFallback(current.structure.sections, updates.structure?.sections),
      primary_cta: {
        ...current.structure.primary_cta,
        ...(updates.structure?.primary_cta ?? {}),
      },
      secondary_actions: withArrayFallback(current.structure.secondary_actions, updates.structure?.secondary_actions),
    },
    content_profile: {
      ...current.content_profile,
      ...(updates.content_profile ?? {}),
    },
    design_signals: {
      visual_hierarchy: mergeSignalScore(current.design_signals.visual_hierarchy, updates.design_signals?.visual_hierarchy),
      contrast: mergeSignalScore(current.design_signals.contrast, updates.design_signals?.contrast),
      spacing: mergeSignalScore(current.design_signals.spacing, updates.design_signals?.spacing),
      alignment: mergeSignalScore(current.design_signals.alignment, updates.design_signals?.alignment),
      affordance: mergeSignalScore(current.design_signals.affordance, updates.design_signals?.affordance),
      feedback: mergeSignalScore(current.design_signals.feedback, updates.design_signals?.feedback),
    },
    interaction_signals: {
      ...current.interaction_signals,
      ...(updates.interaction_signals ?? {}),
      fitts_risk: withArrayFallback(current.interaction_signals.fitts_risk, updates.interaction_signals?.fitts_risk),
      hicks_risk: withArrayFallback(current.interaction_signals.hicks_risk, updates.interaction_signals?.hicks_risk),
      cognitive_load_risk: withArrayFallback(current.interaction_signals.cognitive_load_risk, updates.interaction_signals?.cognitive_load_risk),
      trust_risk: withArrayFallback(current.interaction_signals.trust_risk, updates.interaction_signals?.trust_risk),
    },
    system_constraints: {
      ...current.system_constraints,
      ...(updates.system_constraints ?? {}),
      must_keep: withArrayFallback(current.system_constraints.must_keep, updates.system_constraints?.must_keep),
      must_not_change: withArrayFallback(current.system_constraints.must_not_change, updates.system_constraints?.must_not_change),
      tech_constraints: withArrayFallback(current.system_constraints.tech_constraints, updates.system_constraints?.tech_constraints),
      business_constraints: withArrayFallback(current.system_constraints.business_constraints, updates.system_constraints?.business_constraints),
    },
    evidence: {
      ...current.evidence,
      ...(updates.evidence ?? {}),
      files: withArrayFallback(current.evidence.files, updates.evidence?.files),
      brief_sources: withArrayFallback(current.evidence.brief_sources, updates.evidence?.brief_sources),
    },
    recommendations: withArrayFallback(current.recommendations, updates.recommendations),
    open_questions: withArrayFallback(current.open_questions, updates.open_questions),
  }
}

function mergeContext(current: ProjectContext, updates?: ProjectContextUpdate): ProjectContext {
  if (!updates) {
    return current
  }

  return {
    ...current,
    ...updates,
    brand: {
      ...current.brand,
      ...(updates.brand ?? {}),
      tone: withArrayFallback(current.brand.tone, updates.brand?.tone),
    },
    device_targets: withArrayFallback(current.device_targets, updates.device_targets),
    custom_rules: withArrayFallback(current.custom_rules, updates.custom_rules),
    preferences: {
      ...current.preferences,
      ...(updates.preferences ?? {}),
    },
    constraints: {
      ...current.constraints,
      ...(updates.constraints ?? {}),
      must_keep: withArrayFallback(current.constraints.must_keep, updates.constraints?.must_keep),
      must_not_change: withArrayFallback(current.constraints.must_not_change, updates.constraints?.must_not_change),
      input_preference: withArrayFallback(current.constraints.input_preference, updates.constraints?.input_preference),
    },
    knowledge_state: {
      ...current.knowledge_state,
      ...(updates.knowledge_state ?? {}),
      ingested_modules: withArrayFallback(current.knowledge_state.ingested_modules, updates.knowledge_state?.ingested_modules),
    },
  }
}

function mergeState(current: StorageState, updates?: StorageStateUpdate): StorageState {
  if (!updates) {
    return current
  }

  return {
    ...current,
    ...updates,
    active_page: {
      ...current.active_page,
      ...(updates.active_page ?? {}),
      page_model: mergePageModel(current.active_page.page_model, updates.active_page?.page_model),
      resolved_domains: withArrayFallback(current.active_page.resolved_domains, updates.active_page?.resolved_domains),
    },
    session: {
      ...current.session,
      ...(updates.session ?? {}),
      pending_questions: withArrayFallback(current.session.pending_questions, updates.session?.pending_questions),
      pending_recommendations: withArrayFallback(current.session.pending_recommendations, updates.session?.pending_recommendations),
    },
    watch: {
      ...current.watch,
      ...(updates.watch ?? {}),
    },
  }
}

function resolveStageForTool(tool: string): AssistantStage {
  const stageByTool: Record<string, AssistantStage> = {
    design_page: 'DESIGN',
    get_project_context: 'INIT',
    set_project_context: 'PLAN',
  }

  return stageByTool[tool] ?? 'INIT'
}

function isLikelyInstallPath(candidate: string): boolean {
  const normalized = candidate.toLowerCase()
  return (
    normalized.includes('node_modules') ||
    normalized.includes('npm-cache') ||
    normalized.includes('_npx') ||
    normalized.includes('appdata\\roaming\\npm') ||
    normalized.includes('.npm/_npx')
  )
}

/**
 * Walk up from `startDir` looking for a `.git` directory.
 * Returns the git root if found, null otherwise.
 * Stops at filesystem root to avoid infinite loops.
 */
function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  const { root } = path.parse(current)
  while (current !== root) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) break   // reached root
    current = parent
  }
  return null
}

/**
 * Resolve where to write .vscode/ui-assistant/ files.
 *
 * Priority (highest to lowest):
 *  1. UI_CRAFT_STORAGE_DIR env var  → use that directory directly
 *  2. UI_CRAFT_WORKSPACE_DIR env var → <dir>/.vscode/ui-assistant/
 *  3. Git root detected from INIT_CWD or cwd → <git-root>/.vscode/ui-assistant/
 *  4. INIT_CWD or cwd (not an install path) → <cwd>/.vscode/ui-assistant/
 *  5. Home directory fallback → ~/.ui-craft/global/
 *
 * This ensures global MCP installs still write project-scoped files when
 * running inside a git repo, and fall back to a stable home dir location
 * when no project context is detectable.
 */
function resolveWorkspaceRoot(): string {
  // 1. Explicit storage dir override
  const configuredStorageDir = process.env[STORAGE_DIR_ENV]
  if (configuredStorageDir) {
    return path.resolve(configuredStorageDir)
  }

  // 2. Explicit workspace dir override
  const configuredWorkspaceDir = process.env[WORKSPACE_DIR_ENV]
  if (configuredWorkspaceDir) {
    return path.join(path.resolve(configuredWorkspaceDir), '.vscode', STORAGE_DIRNAME)
  }

  // 3. Git root detection — most reliable for global MCP installs
  const seeds = [process.env.INIT_CWD, process.cwd()].filter(Boolean) as string[]
  const preferredSeed = seeds.find(seed => !isLikelyInstallPath(seed)) ?? seeds[0] ?? process.cwd()

  const gitRoot = findGitRoot(preferredSeed)
  if (gitRoot && !isLikelyInstallPath(gitRoot)) {
    return path.join(gitRoot, '.vscode', STORAGE_DIRNAME)
  }

  // 4. Non-install cwd
  if (!isLikelyInstallPath(preferredSeed)) {
    return path.join(path.resolve(preferredSeed), '.vscode', STORAGE_DIRNAME)
  }

  // 5. Home directory fallback — used when MCP is global and no project detected
  const homeDir = process.env.USERPROFILE ?? process.env.HOME ?? os.homedir()
  return path.join(homeDir, '.ui-craft', 'global')
}

function getStoragePaths() {
  const workspaceRoot = resolveWorkspaceRoot()

  if (!_activeProjectLoaded) {
    _activeProjectSlug = readActiveProjectSlug(workspaceRoot)
    _activeProjectLoaded = true
  }

  const storageDir = _activeProjectSlug
    ? path.join(GLOBAL_PROJECTS_DIR, _activeProjectSlug)
    : workspaceRoot

  return {
    storageDir,
    workspaceRoot,
    contextFile: path.join(storageDir, 'context.json'),
    stateFile: path.join(storageDir, 'state.json'),
    historyFile: path.join(storageDir, 'history.json'),
    notesFile: path.join(storageDir, 'notes.md'),
    usageFile: path.join(storageDir, 'usage.json'),
  }
}

function ensureStorageDir(): ReturnType<typeof getStoragePaths> {
  const storagePaths = getStoragePaths()

  if (storagePaths.workspaceRoot !== storagePaths.storageDir && !fs.existsSync(storagePaths.workspaceRoot)) {
    fs.mkdirSync(storagePaths.workspaceRoot, { recursive: true })
  }

  if (!fs.existsSync(storagePaths.storageDir)) {
    fs.mkdirSync(storagePaths.storageDir, { recursive: true })
  }

  return storagePaths
}

/**
 * Load .env file from the storage directory into process.env.
 * Only sets variables that are not already defined (env vars take precedence).
 * Creates a .env.example if no .env exists.
 */
let _envLoaded = false
function loadEnvFile(storageDir: string): void {
  if (_envLoaded) return
  _envLoaded = true

  const envFile = path.join(storageDir, '.env')
  const exampleFile = path.join(storageDir, '.env.example')

  if (!fs.existsSync(envFile)) {
    // Create .env.example as a hint for new developers
    if (!fs.existsSync(exampleFile)) {
      try {
        fs.writeFileSync(exampleFile, '# UI Craft Design System Key\n# UI_CRAFT_DS_KEY=your-passphrase-here\n')
      } catch { /* non-critical */ }
    }
    return
  }

  try {
    const content = fs.readFileSync(envFile, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIndex = trimmed.indexOf('=')
      if (eqIndex < 1) continue
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      // Only set if not already defined — system env takes precedence
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  } catch { /* non-critical — .env loading must never break tool execution */ }
}

export function initContextSystem(): void {
  const storagePaths = ensureStorageDir()

  // .env lives in workspace root (shared config), not per-project dir
  loadEnvFile(storagePaths.workspaceRoot)

  if (!fs.existsSync(storagePaths.contextFile)) {
    fs.writeFileSync(storagePaths.contextFile, JSON.stringify(DEFAULT_CONTEXT, null, 2))
  }

  if (!fs.existsSync(storagePaths.stateFile)) {
    fs.writeFileSync(storagePaths.stateFile, JSON.stringify(DEFAULT_STATE, null, 2))
  }

  if (!fs.existsSync(storagePaths.historyFile)) {
    fs.writeFileSync(storagePaths.historyFile, JSON.stringify([], null, 2))
  }

  if (!fs.existsSync(storagePaths.notesFile)) {
    fs.writeFileSync(storagePaths.notesFile, '# UI Craft Notes\n\n')
  }

  if (!fs.existsSync(storagePaths.usageFile)) {
    const defaultUsage: UsageRecord = {
      install_id: randomUUID(),
      version: '0.3.0',
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      total_sessions: 0,
      page_types: {},
      tool_calls: {},
    }
    fs.writeFileSync(storagePaths.usageFile, JSON.stringify(defaultUsage, null, 2))
  }
}

export const initStorage = initContextSystem

export function loadUsage(): UsageRecord | null {
  try {
    initContextSystem()
    const { usageFile } = getStoragePaths()
    const raw = fs.readFileSync(usageFile, 'utf-8')
    return JSON.parse(raw) as UsageRecord
  } catch {
    return null
  }
}

/**
 * Record a tool call event in local usage.json.
 * Never throws — usage tracking must not break tool execution.
 */
export function appendUsageEvent(
  toolName: string,
  options: { page_type?: string; version?: string; is_session?: boolean } = {}
): void {
  try {
    initContextSystem()
    const { usageFile } = getStoragePaths()
    const raw = fs.readFileSync(usageFile, 'utf-8')
    const usage = JSON.parse(raw) as UsageRecord

    usage.last_seen = new Date().toISOString()
    if (options.version) usage.version = options.version
    if (options.is_session) usage.total_sessions = (usage.total_sessions ?? 0) + 1
    usage.tool_calls[toolName] = (usage.tool_calls[toolName] ?? 0) + 1
    if (options.page_type) {
      usage.page_types[options.page_type] = (usage.page_types[options.page_type] ?? 0) + 1
    }

    fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2))
  } catch {
    // intentionally silent — usage tracking must never break tool execution
  }
}

export function loadContext(): ProjectContext {
  initContextSystem()
  const { contextFile } = getStoragePaths()

  try {
    const raw = fs.readFileSync(contextFile, 'utf-8')
    const parsed = JSON.parse(raw) as ProjectContext
    return mergeContext(DEFAULT_CONTEXT, parsed)
  } catch {
    return { ...DEFAULT_CONTEXT }
  }
}

export function saveContext(updates: ProjectContextUpdate): ProjectContext {
  initContextSystem()

  // Switch to project-specific global dir when project_name changes
  if (updates.project_name) {
    const newSlug = slugify(updates.project_name)
    if (newSlug !== _activeProjectSlug) {
      const { workspaceRoot } = getStoragePaths()
      writeActiveProject(workspaceRoot, updates.project_name)
      ensureStorageDir()
    }
  }

  const current = loadContext()
  const { contextFile } = getStoragePaths()
  const merged = mergeContext(current, updates)
  fs.writeFileSync(contextFile, JSON.stringify(merged, null, 2))
  return merged
}

export function loadState(): StorageState {
  initContextSystem()
  const { stateFile } = getStoragePaths()

  try {
    const raw = fs.readFileSync(stateFile, 'utf-8')
    const parsed = JSON.parse(raw) as StorageState
    return mergeState(DEFAULT_STATE, parsed)
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveState(updates: StorageStateUpdate): StorageState {
  initContextSystem()
  const current = loadState()
  const { stateFile } = getStoragePaths()
  const merged = mergeState(current, updates)
  fs.writeFileSync(stateFile, JSON.stringify(merged, null, 2))
  return merged
}

export function appendHistory(entry: Omit<HistoryEntry, 'timestamp'>): void {
  initContextSystem()
  let history: HistoryEntry[] = []
  const { historyFile } = getStoragePaths()
  const timestamp = new Date().toISOString()

  try {
    const raw = fs.readFileSync(historyFile, 'utf-8')
    history = JSON.parse(raw) as HistoryEntry[]
  } catch {
    history = []
  }

  history.unshift({ ...entry, timestamp })

  if (history.length > HISTORY_LIMIT) {
    history = history.slice(0, HISTORY_LIMIT)
  }

  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2))

  saveState({
    current_stage: resolveStageForTool(entry.tool),
    last_tool: entry.tool,
    updated_at: timestamp,
    session: {
      last_tool: entry.tool,
    },
  })
}

export function listProjects(): Array<{ slug: string; project_name: string }> {
  const results: Array<{ slug: string; project_name: string }> = []
  try {
    if (!fs.existsSync(GLOBAL_PROJECTS_DIR)) return results
    for (const slug of fs.readdirSync(GLOBAL_PROJECTS_DIR)) {
      const ctxFile = path.join(GLOBAL_PROJECTS_DIR, slug, 'context.json')
      try {
        const raw = fs.readFileSync(ctxFile, 'utf-8')
        const ctx = JSON.parse(raw)
        results.push({ slug, project_name: ctx.project_name || slug })
      } catch { /* skip invalid entries */ }
    }
  } catch { /* intentionally silent */ }
  return results
}
