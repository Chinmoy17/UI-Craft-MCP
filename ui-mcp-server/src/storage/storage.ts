import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { randomUUID } from 'crypto'
import { VERSION } from '../version.js'

const HISTORY_LIMIT = 20
const STORAGE_DIRNAME = 'ui-assistant'
const WORKSPACE_DIR_ENV = 'UI_CRAFT_WORKSPACE_DIR'
const STORAGE_DIR_ENV = 'UI_CRAFT_STORAGE_DIR'
const HOME_DIR_ENV = 'UI_CRAFT_HOME'
const CONTEXT_SCHEMA_VERSION = '2.0'
const REGISTRY_LIMIT = 200

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
  schema_version: string
  project_name: string
  stack: string
  audience: string
  industry: string
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
  project_name?: string
  stack?: string
  audience?: string
  industry?: string
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
  schema_version: CONTEXT_SCHEMA_VERSION,
  project_name: '',
  stack: '',
  audience: '',
  industry: '',
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

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/**
 * Walk up from `startDir` looking for a `.git` entry.
 * Never returns the home directory or anything above it.
 */
function findGitRoot(startDir: string): string | null {
  const home = path.resolve(os.homedir())
  let current = path.resolve(startDir)
  const { root } = path.parse(current)
  while (!samePath(current, root) && !samePath(current, home)) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

export type RootSource = 'env-storage' | 'env-workspace' | 'mcp-roots' | 'git-root' | 'cwd'

export interface WorkspaceInfo {
  /** Folder holding context.json, state.json, ... */
  dir: string
  /** Project root that owns `dir`; null when UI_CRAFT_STORAGE_DIR points straight at a data folder. */
  root: string | null
  source: RootSource
}

export class NoWorkspaceError extends Error {}

let _clientRoots: string[] = []

/** Workspace folders reported by the MCP client (roots/list). The first one is used. */
export function setWorkspaceRoots(roots: string[]): void {
  _clientRoots = roots.map(r => path.resolve(r))
}

function storageDirFor(root: string): string {
  return path.join(path.resolve(root), '.vscode', STORAGE_DIRNAME)
}

/**
 * Where this project's data lives: <root>/.vscode/ui-assistant/
 *
 * Root priority:
 *  1. UI_CRAFT_STORAGE_DIR   (data folder, used as-is)
 *  2. UI_CRAFT_WORKSPACE_DIR (project root)
 *  3. First MCP client root  (the folder open in the editor)
 *  4. Nearest git root above the working directory (never home or above)
 *  5. The working directory itself
 */
export function getWorkspaceInfo(): WorkspaceInfo {
  const storageOverride = process.env[STORAGE_DIR_ENV]
  if (storageOverride) {
    return { dir: path.resolve(storageOverride), root: null, source: 'env-storage' }
  }

  const workspaceOverride = process.env[WORKSPACE_DIR_ENV]
  if (workspaceOverride) {
    return { dir: storageDirFor(workspaceOverride), root: path.resolve(workspaceOverride), source: 'env-workspace' }
  }

  if (_clientRoots.length > 0) {
    return { dir: storageDirFor(_clientRoots[0]), root: _clientRoots[0], source: 'mcp-roots' }
  }

  const seed = [process.cwd(), process.env.INIT_CWD].find(s => s && !isLikelyInstallPath(s))
  if (!seed) {
    throw new NoWorkspaceError(
      'No workspace found: the server was started inside an npm install folder and the editor reported no workspace root. ' +
      `Set "cwd": "\${workspaceFolder}" in the MCP server config, or the ${WORKSPACE_DIR_ENV} environment variable.`,
    )
  }

  const gitRoot = findGitRoot(seed)
  if (gitRoot) return { dir: storageDirFor(gitRoot), root: gitRoot, source: 'git-root' }
  return { dir: storageDirFor(seed), root: path.resolve(seed), source: 'cwd' }
}

function getStoragePaths() {
  const info = getWorkspaceInfo()
  return {
    info,
    dir: info.dir,
    contextFile: path.join(info.dir, 'context.json'),
    stateFile: path.join(info.dir, 'state.json'),
    historyFile: path.join(info.dir, 'history.json'),
    usageFile: path.join(info.dir, 'usage.json'),
    ignoreFile: path.join(info.dir, '.gitignore'),
  }
}

// ─── Project registry (machine-wide index of project folders; holds no project data) ───

export interface RegistryEntry {
  path: string
  project_name: string
  started: string
  last_used: string
}

function registryFile(): string {
  return path.join(process.env[HOME_DIR_ENV] ?? os.homedir(), '.ui-assistant', 'projects.json')
}

function readRegistry(): RegistryEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryFile(), 'utf-8'))
    return Array.isArray(parsed) ? (parsed as RegistryEntry[]) : []
  } catch {
    return []
  }
}

/** Adds or refreshes a project in the index. Never throws. */
export function registerProject(root: string, projectName?: string, started?: string): void {
  try {
    const file = registryFile()
    const entries = readRegistry()
    const now = new Date().toISOString()
    const existing = entries.find(e => samePath(e.path, root))
    if (existing) {
      existing.last_used = now
      if (projectName) existing.project_name = projectName
    } else {
      entries.push({ path: root, project_name: projectName ?? '', started: started ?? now, last_used: now })
    }
    entries.sort((a, b) => b.last_used.localeCompare(a.last_used))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(entries.slice(0, REGISTRY_LIMIT), null, 2))
  } catch {
    // the index is a convenience and must never block a tool call
  }
}

export function listRegisteredProjects(limit = 10): RegistryEntry[] {
  return readRegistry().slice(0, limit)
}

// ─── First-use notice: look for similar UI Craft data in surrounding folders ───

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'venv', '__pycache__'])

function pathKey(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

function listSubdirs(folder: string, cap: number): string[] {
  try {
    return fs.readdirSync(folder, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .slice(0, cap)
      .map(e => path.join(folder, e.name))
  } catch {
    return []
  }
}

function readProjectName(folder: string): string {
  try {
    const ctx = JSON.parse(fs.readFileSync(path.join(storageDirFor(folder), 'context.json'), 'utf-8')) as { project_name?: string }
    return ctx.project_name ?? ''
  } catch {
    return ''
  }
}

/** Parent and child folders (two levels down) that already hold UI Craft data. */
function findNearbyProjects(root: string): Array<{ path: string; project_name: string }> {
  const home = path.resolve(os.homedir())
  const candidates: string[] = []

  let up = root
  for (let i = 0; i < 3; i++) {
    const parent = path.dirname(up)
    if (parent === up || samePath(parent, home)) break
    candidates.push(parent)
    up = parent
  }
  for (const child of listSubdirs(root, 100)) {
    candidates.push(child, ...listSubdirs(child, 50))
  }

  const seen = new Set<string>()
  const found: Array<{ path: string; project_name: string }> = []
  for (const candidate of candidates) {
    const key = pathKey(candidate)
    if (seen.has(key) || samePath(candidate, root)) continue
    seen.add(key)
    if (fs.existsSync(path.join(storageDirFor(candidate), 'context.json'))) {
      found.push({ path: candidate, project_name: readProjectName(candidate) })
      if (found.length >= 5) break
    }
  }
  return found
}

let _pendingNotice: string | null = null

function addNotice(text: string): void {
  _pendingNotice = _pendingNotice ? `${_pendingNotice}\n\n${text}` : text
}
/** One-time message about a newly created storage folder. Returned once, then cleared. */
export function takeNotice(): string | null {
  const notice = _pendingNotice
  _pendingNotice = null
  return notice
}

function buildInitNotice(info: WorkspaceInfo): string | null {
  const nearby = info.root ? findNearbyProjects(info.root) : []
  const usedCwd = info.source === 'cwd'
  if (nearby.length === 0 && !usedCwd) return null

  const lines = [`UI Craft created project storage at ${info.dir} (workspace source: ${info.source}).`]
  if (usedCwd) {
    lines.push('No editor workspace root or git repository was found, so the current folder was used. If it is not the project folder, tell the user.')
  }
  if (nearby.length > 0) {
    lines.push('UI Craft data already exists in nearby folders:')
    for (const n of nearby) lines.push(`- ${n.path}${n.project_name ? ` ("${n.project_name}")` : ''}`)
    lines.push('Check whether one of them is the same project (for example a parent or child folder opened earlier). If so, tell the user which folder to keep instead of maintaining two copies.')
  }
  return lines.join('\n')
}

// ─── Storage initialisation (lazy: runs on the first tool call that needs data) ───

const _registeredRoots = new Set<string>()

function readFirstSeen(usageFile: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(usageFile, 'utf-8')) as { first_seen?: string }).first_seen
  } catch {
    return undefined
  }
}

export function initContextSystem(): void {
  const paths = getStoragePaths()
  const isNew = !fs.existsSync(paths.contextFile)

  fs.mkdirSync(paths.dir, { recursive: true })

  if (isNew) {
    fs.writeFileSync(paths.contextFile, JSON.stringify(DEFAULT_CONTEXT, null, 2))
  }

  if (!fs.existsSync(paths.stateFile)) {
    fs.writeFileSync(paths.stateFile, JSON.stringify(DEFAULT_STATE, null, 2))
  }

  if (!fs.existsSync(paths.historyFile)) {
    fs.writeFileSync(paths.historyFile, JSON.stringify([], null, 2))
  }

  if (!fs.existsSync(paths.usageFile)) {
    const now = new Date().toISOString()
    const defaultUsage: UsageRecord = {
      install_id: randomUUID(),
      version: VERSION,
      first_seen: now,
      last_seen: now,
      total_sessions: 0,
      page_types: {},
      tool_calls: {},
    }
    fs.writeFileSync(paths.usageFile, JSON.stringify(defaultUsage, null, 2))
  }

  // Keeps the folder out of git; data stays local to the machine.
  if (!fs.existsSync(paths.ignoreFile)) {
    fs.writeFileSync(paths.ignoreFile, '*\n')
  }

  const { root } = paths.info
  if (root && !_registeredRoots.has(pathKey(root))) {
    _registeredRoots.add(pathKey(root))
    registerProject(root, undefined, readFirstSeen(paths.usageFile))
  }

  if (isNew) {
    const notice = buildInitNotice(paths.info)
    if (notice) addNotice(notice)
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

/** Applies `mutate` to usage.json and stamps the running version. Never throws. */
function updateUsage(mutate: (usage: UsageRecord) => void): void {
  try {
    initContextSystem()
    const { usageFile } = getStoragePaths()
    const usage = JSON.parse(fs.readFileSync(usageFile, 'utf-8')) as UsageRecord

    usage.version = VERSION
    usage.last_seen = new Date().toISOString()
    mutate(usage)

    fs.writeFileSync(usageFile, JSON.stringify(usage, null, 2))
  } catch {
    // intentionally silent — usage tracking must never break tool execution
  }
}

export function appendUsageEvent(toolName: string): void {
  updateUsage(u => { u.tool_calls[toolName] = (u.tool_calls[toolName] ?? 0) + 1 })
}

export function recordSession(): void {
  updateUsage(u => { u.total_sessions = (u.total_sessions ?? 0) + 1 })
}

export function recordPageType(pageType: string): void {
  updateUsage(u => { u.page_types[pageType] = (u.page_types[pageType] ?? 0) + 1 })
}

// Keys written by older releases that no longer exist in the schema.
const LEGACY_CONTEXT_KEYS = ['version', 'design_system']

function migrateContext(raw: Record<string, unknown>): ProjectContext {
  const rest = { ...raw }
  for (const key of LEGACY_CONTEXT_KEYS) delete rest[key]
  const merged = mergeContext(DEFAULT_CONTEXT, rest as ProjectContextUpdate)
  return { ...merged, schema_version: CONTEXT_SCHEMA_VERSION }
}

export function loadContext(): ProjectContext {
  initContextSystem()
  const { contextFile } = getStoragePaths()

  try {
    const raw = JSON.parse(fs.readFileSync(contextFile, 'utf-8')) as Record<string, unknown>
    const context = migrateContext(raw)

    const needsRewrite = raw.schema_version !== CONTEXT_SCHEMA_VERSION || LEGACY_CONTEXT_KEYS.some(k => k in raw)
    if (needsRewrite) {
      try { fs.writeFileSync(contextFile, JSON.stringify(context, null, 2)) } catch { /* read-only checkout */ }
    }
    return context
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONTEXT)) as ProjectContext
  }
}

export function saveContext(updates: ProjectContextUpdate): ProjectContext {
  initContextSystem()

  const current = loadContext()
  const { contextFile, info } = getStoragePaths()
  const merged = mergeContext(current, updates)
  fs.writeFileSync(contextFile, JSON.stringify(merged, null, 2))

  const name = updates.project_name
  if (name && info.root) {
    if (name !== current.project_name) {
      const sameName = listRegisteredProjects(REGISTRY_LIMIT)
        .filter(e => e.project_name.toLowerCase() === name.toLowerCase() && !samePath(e.path, info.root as string))
      if (sameName.length > 0) {
        addNotice(
          `The project name "${name}" is already used by another folder:\n` +
          sameName.slice(0, 3).map(e => `- ${e.path} (started ${e.started.slice(0, 10)})`).join('\n') + '\n' +
          'If it is the same project, tell the user which folder to keep instead of maintaining two copies.',
        )
      }
    }
    registerProject(info.root, name)
  }
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

/** Collapses whitespace and truncates to `max` characters. */
export function clipText(text: string, max = 100): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function readHistory(file: string): HistoryEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Array<Partial<HistoryEntry>>
    // Older releases also stored the full tool input; it is dropped here.
    return parsed.map(e => ({ timestamp: e.timestamp ?? '', tool: e.tool ?? '', summary: e.summary ?? '' }))
  } catch {
    return []
  }
}

/** Most recent entries first. */
export function loadHistory(limit = HISTORY_LIMIT): HistoryEntry[] {
  initContextSystem()
  return readHistory(getStoragePaths().historyFile).slice(0, limit)
}

export function appendHistory(entry: Omit<HistoryEntry, 'timestamp'>): void {
  initContextSystem()
  const { historyFile } = getStoragePaths()
  const timestamp = new Date().toISOString()

  const history = readHistory(historyFile)
  history.unshift({ timestamp, tool: entry.tool, summary: clipText(entry.summary, 120) })

  fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, HISTORY_LIMIT), null, 2))

  saveState({
    current_stage: resolveStageForTool(entry.tool),
    last_tool: entry.tool,
    updated_at: timestamp,
    session: {
      last_tool: entry.tool,
    },
  })
}
