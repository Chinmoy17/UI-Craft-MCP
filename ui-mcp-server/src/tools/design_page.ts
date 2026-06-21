import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import { loadContext, loadState, saveState, type ProjectContext } from '../storage/storage.js'
import { getEncryptionKey, decryptDesignSystem } from '../crypto/design_system_crypto.js'

// ─── KB types ────────────────────────────────────────────────────────────────

interface KBVisualPrinciple {
  id: string
  title: string
  summary: string
  how: string[]
  implementation: string[]
  examples: string[]
  failure_mode: string
  best_page_types: string[]
  best_emphasis: string[]
}

interface KBBrandExample {
  brand: string
  industry_match: string[]
  emphasis_match: string[]
  design_signals: string[]
  emotional_effect: string
  design_lesson: string
  type_direction: string
  color_direction: string
}

interface KBFontFamily {
  use_case: string
  fonts: string[]
  reason: string
  industry_match: string[]
  emphasis_match: string[]
}

interface KBTypographySpec {
  font_families: KBFontFamily[]
  size_scale: Array<{ role: string; desktop: string; mobile: string }>
  line_height_scale: Array<{ role: string; value: string }>
  spacing_scale: Array<{ token: string; px: number }>
  button_targets: Array<{ use_case: string; minimum: string; preferred: string }>
  page_type_font_pairings: Record<string, { pairings: string[]; headline_guidance: string }>
  line_length_guidance: Record<string, string>
}

interface KBTypographyRole {
  name: string
  var: string
  purpose: string
  when_to_use: string
  recommended: string[]
  note: string
}

interface KBTypographyRoles {
  roles: KBTypographyRole[]
  role_rules: string[]
  weight_scale: Array<{ weight: number; token: string; use: string }>
  weight_rules: string[]
  letter_spacing: Array<{ context: string; value: string; tailwind: string; rule: string }>
  letter_spacing_rules: string[]
  text_hierarchy: {
    levels: Array<{ level: string; token: string; contrast: string; light: string; dark: string; use: string }>
    rules: string[]
  }
  text_alignment: Array<{ context: string; alignment: string; rule: string }>
  alignment_rules: string[]
}

interface KBTypographyPattern {
  brand: string
  tagline: string
  font: string
  headline_style: Record<string, string>
  body_style: Record<string, string>
  business_connection: string
  takeaway: string
  emphasis_match: string[]
  industry_match: string[]
}

interface KBTypographyAntipatterns {
  antipatterns: Array<{ name: string; bad: string; why: string; fix: string }>
  checklist: Record<string, string[]>
}

interface KBColorTokens {
  background_roles: Array<{ token: string; light: string; dark: string; use: string }>
  border_roles: Array<{ token: string; light: string; dark: string; use: string }>
  accent_roles: Array<{ token: string; light: string; dark: string; use: string }>
  semantic_roles: Array<{ group: string; foreground: string; background: string; border: string; light_fg: string; dark_fg: string }>
  elevation_system: {
    description: string
    levels: Array<{ level: number; token: string; light: string; dark: string; use: string }>
    shadow_scale: Array<{ name: string; css: string; use: string }>
    shadow_element_map: Array<{ element: string; shadow: string }>
    rules: string[]
  }
  component_states: {
    matrix: Record<string, string>
    focus_ring_pattern: string
    rule: string
  }
}

interface KBColorPrinciples {
  rule_60_30_10: {
    description: string
    layers: Array<{ percent: number; role: string; use: string; token: string }>
    rules: string[]
  }
  semantic_usage: Array<{ color: string; meaning: string; use_for: string; never_use_for: string }>
  semantic_pattern: { correct: string; example_classes: string; wrong: string; rule: string }
  emphasis_color_guidance: Record<string, string>
  page_type_color_guidance: Record<string, string>
}

interface KBColorContrast {
  wcag_requirements: Array<{ text_type: string; minimum_ratio: string; level: string }>
  quick_reference: Array<{ combo: string; ratio: string; passes: boolean; use: string }>
  rules: string[]
  dark_mode_notes: string[]
}

interface KBColorAntipatterns {
  antipatterns: Array<{ name: string; bad: string; why: string; fix: string; emphasis_match: string[] }>
  checklist: { color_system: string[] }
}

interface KBLayoutComponents {
  buttons: {
    hierarchy: Array<{ type: string; classes: string; use: string }>
    sizing: Array<{ size: string; classes: string; px: number; use: string }>
    placement_patterns: Array<{ pattern: string; layout: string; rule: string }>
    rules: string[]
  }
  forms: {
    input_anatomy: { order: string[]; rule: string }
    input_states: Array<{ state: string; classes: string }>
    layout_patterns: Array<{ pattern: string; use: string; rule: string }>
    rules: string[]
  }
  cards: {
    variants: Array<{ variant: string; bg: string; border: string; shadow: string; use: string }>
    grid_patterns: Record<string, string>
    padding: Record<string, string>
    border_radius: Record<string, string>
    rules: string[]
  }
  navigation: {
    top_nav: { height: string; layout: string; active_state: string }
    sidebar: { widths: Record<string, string>; active_state: string; hover_state: string; icon_size: string; pinned_bottom: string }
    mobile: { patterns: string[]; bottom_tab: { max_items: number; min_touch_target: string }; hamburger: string }
    rules: string[]
  }
  modals: {
    anatomy: Record<string, string>
    sizing: Array<{ size: string; class: string; px: number | null; use: string }>
    rules: string[]
  }
  checklist: Record<string, string[]>
}

interface KBLayoutSpacing {
  spacing_tokens: Array<{ token: string; px: number; rem: string; use: string }>
  contextual_rules: Array<{ element: string; spacing: string }>
  grid_system: {
    columns: Record<string, string>
    page_max_width: Record<string, string>
    responsive_patterns: Array<{ breakpoint: string; min_px: number; use: string }>
    page_type_max_width: Record<string, string>
    rules: string[]
  }
  z_index_system: {
    scale: Array<{ name: string; value: string; use: string }>
    css_vars: string[]
    rules: string[]
  }
  checklist: Record<string, string[]>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KBGenericObject = Record<string, any>

interface KBInteractionPatterns {
  timing_scale: { tokens: Array<{ token: string; ms: number; use: string }>; rules: string[] }
  easing_curves: Array<{ name: string; css: string; use: string; rule?: string }>
  micro_interactions: Array<{ trigger: string; response: string; timing: string; rule: string }>
  hover_intent: { rule: string; tooltip_delay: string; dropdown_delay: string }
  reduced_motion: { css_query: string; rule: string; implementation: string; what_to_remove: string }
  page_type_motion_guidance: Record<string, string>
}

interface KBUXWriting {
  cta_copy: { rule: string; patterns: Array<{ bad: string; good: string; why: string }> }
  error_messages: { anatomy: string; rules: string[]; patterns: Array<{ bad: string; good: string }> }
  empty_state_copy: { rule: string; patterns: Array<{ type: string; headline: string; sub: string; cta: string | null }> }
  toast_copy: { rule: string; patterns: Array<{ type: string; pattern: string; examples: string[] }> }
  page_type_copy_guidance: Record<string, string>
}

interface KBIndustryEntry {
  description: string
  design_principles: string[]
  typography: string
  color: string
  layout: string
  components: string
  antipatterns: string[]
  page_type_emphasis: Record<string, string>
  reference_brands: string[]
}

type KBIndustryPatterns = Record<string, KBIndustryEntry>

// ─── Design system spec type ─────────────────────────────────────────────────

interface DesignSystemPaletteRoles {
  primary_action: string
  primary_action_hover: string
  body_text: string
  heading_text: string
  subtle_text: string
  border: string
  background: string
  surface: string
  contrast_section_bg: string[]
  disabled: string
}

interface DesignSystemTypography {
  body: { font_family: string; weight: number; size: string; line_height: string; color: string }
  headings: { font_family: string; weight_range: string; color: string }
  buttons: { font_family: string; weight: number; size: string }
}

interface DesignSystemButton {
  font_family: string
  font_size: string
  font_weight: number
  padding: string
  border_radius: string
  border: string
  background: string
  color: string
  hover_background: string
  transition: string
  cursor: string
}

interface DesignSystemSpec {
  id: string
  name: string
  description: string
  palette: Record<string, string>
  palette_roles: DesignSystemPaletteRoles
  palette_rules: string[]
  typography: DesignSystemTypography
  typography_rules: string[]
  buttons: { primary: DesignSystemButton; secondary: DesignSystemButton }
  button_rules: string[]
  spacing: { principle: string; notes: string }
  shadows: { principle: string; notes: string }
  rules_do: string[]
  rules_dont: string[]
}

// ─── KB loaders — singleton cache (loaded once, reused for every call) ────────

const KB_BASE      = path.join(__dirname, '..', 'content', 'kb')
const KB_TYPO      = path.join(KB_BASE, 'typography')
const KB_COLOR     = path.join(KB_BASE, 'color')
const KB_LAYOUT    = path.join(KB_BASE, 'layout')
const KB_BRAND     = path.join(KB_BASE, 'brand')
const KB_VISUAL    = path.join(KB_BASE, 'visual')
const KB_A11Y      = path.join(KB_BASE, 'accessibility')
const KB_INTERACT  = path.join(KB_BASE, 'interaction')
const KB_COPY      = path.join(KB_BASE, 'copy')
const KB_INDUSTRY  = path.join(KB_BASE, 'industry')
const KB_DS        = path.join(KB_BASE, 'design-system')
const CONTENT_BASE = path.join(__dirname, '..', 'content')

let _kbVisualPrinciples: KBVisualPrinciple[] | null = null
let _kbBrandExamples: KBBrandExample[] | null = null
let _kbTypographySpec: KBTypographySpec | null | false = false  // false = not yet loaded, null = file missing
let _kbTypographyRoles: KBTypographyRoles | null | false = false
let _kbTypographyPatterns: KBTypographyPattern[] | null = null
let _kbTypographyAntipatterns: KBTypographyAntipatterns | null | false = false
let _kbColorTokens: KBColorTokens | null | false = false
let _kbColorPrinciples: KBColorPrinciples | null | false = false
let _kbColorContrast: KBColorContrast | null | false = false
let _kbColorAntipatterns: KBColorAntipatterns | null | false = false
let _kbLayoutComponents: KBLayoutComponents | null | false = false
let _kbLayoutSpacing: KBLayoutSpacing | null | false = false
let _kbA11yKeyboard: KBGenericObject | null | false = false
let _kbA11yAria: KBGenericObject | null | false = false
let _kbInteractionPatterns: KBInteractionPatterns | null | false = false
let _kbUXWriting: KBUXWriting | null | false = false
let _kbIndustryPatterns: KBIndustryPatterns | null | false = false
let _kbBrandExtended: KBBrandExample[] | null = null
let _allPrinciples: Principle[] | null = null
const _designSystemCache = new Map<string, DesignSystemSpec | null>()

// Inverted indexes built once from loaded principles
const _pageTypeIndex = new Map<string, Set<string>>()   // page_type → principle ids
const _emphasisIndex = new Map<string, Set<string>>()   // emphasis  → principle ids
let _indexesBuilt = false

function loadKBVisualPrinciples(): KBVisualPrinciple[] {
  if (_kbVisualPrinciples !== null) return _kbVisualPrinciples
  const file = path.join(KB_VISUAL, 'visual_principles.json')
  _kbVisualPrinciples = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBVisualPrinciple[])
    : []
  return _kbVisualPrinciples
}

function loadKBBrandExamples(): KBBrandExample[] {
  if (_kbBrandExamples !== null) return _kbBrandExamples
  const file = path.join(KB_BRAND, 'brand_examples.json')
  _kbBrandExamples = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBBrandExample[])
    : []
  return _kbBrandExamples
}

function loadKBTypographySpec(): KBTypographySpec | null {
  if (_kbTypographySpec !== false) return _kbTypographySpec
  const file = path.join(KB_TYPO, 'typography_spec.json')
  _kbTypographySpec = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBTypographySpec)
    : null
  return _kbTypographySpec
}

function loadKBTypographyRoles(): KBTypographyRoles | null {
  if (_kbTypographyRoles !== false) return _kbTypographyRoles
  const file = path.join(KB_TYPO, 'typography_roles.json')
  _kbTypographyRoles = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBTypographyRoles)
    : null
  return _kbTypographyRoles
}

function loadKBTypographyPatterns(): KBTypographyPattern[] {
  if (_kbTypographyPatterns !== null) return _kbTypographyPatterns
  const file = path.join(KB_TYPO, 'typography_patterns.json')
  _kbTypographyPatterns = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBTypographyPattern[])
    : []
  return _kbTypographyPatterns
}

function loadKBTypographyAntipatterns(): KBTypographyAntipatterns | null {
  if (_kbTypographyAntipatterns !== false) return _kbTypographyAntipatterns
  const file = path.join(KB_TYPO, 'typography_antipatterns.json')
  _kbTypographyAntipatterns = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBTypographyAntipatterns)
    : null
  return _kbTypographyAntipatterns
}

function loadKBColorTokens(): KBColorTokens | null {
  if (_kbColorTokens !== false) return _kbColorTokens
  const file = path.join(KB_COLOR, 'color_tokens.json')
  _kbColorTokens = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBColorTokens) : null
  return _kbColorTokens
}

function loadKBColorPrinciples(): KBColorPrinciples | null {
  if (_kbColorPrinciples !== false) return _kbColorPrinciples
  const file = path.join(KB_COLOR, 'color_principles.json')
  _kbColorPrinciples = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBColorPrinciples) : null
  return _kbColorPrinciples
}

function loadKBColorContrast(): KBColorContrast | null {
  if (_kbColorContrast !== false) return _kbColorContrast
  const file = path.join(KB_COLOR, 'color_contrast.json')
  _kbColorContrast = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBColorContrast) : null
  return _kbColorContrast
}

function loadKBColorAntipatterns(): KBColorAntipatterns | null {
  if (_kbColorAntipatterns !== false) return _kbColorAntipatterns
  const file = path.join(KB_COLOR, 'color_antipatterns.json')
  _kbColorAntipatterns = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBColorAntipatterns) : null
  return _kbColorAntipatterns
}

function loadKBLayoutComponents(): KBLayoutComponents | null {
  if (_kbLayoutComponents !== false) return _kbLayoutComponents
  const file = path.join(KB_LAYOUT, 'layout_components.json')
  _kbLayoutComponents = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBLayoutComponents) : null
  return _kbLayoutComponents
}

function loadKBLayoutSpacing(): KBLayoutSpacing | null {
  if (_kbLayoutSpacing !== false) return _kbLayoutSpacing
  const file = path.join(KB_LAYOUT, 'layout_spacing.json')
  _kbLayoutSpacing = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBLayoutSpacing) : null
  return _kbLayoutSpacing
}

function loadKBInteractionPatterns(): KBInteractionPatterns | null {
  if (_kbInteractionPatterns !== false) return _kbInteractionPatterns
  const file = path.join(KB_INTERACT, 'interaction_patterns.json')
  _kbInteractionPatterns = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBInteractionPatterns) : null
  return _kbInteractionPatterns
}

function loadKBUXWriting(): KBUXWriting | null {
  if (_kbUXWriting !== false) return _kbUXWriting
  const file = path.join(KB_COPY, 'ux_writing.json')
  _kbUXWriting = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBUXWriting) : null
  return _kbUXWriting
}

function loadKBIndustryPatterns(): KBIndustryPatterns | null {
  if (_kbIndustryPatterns !== false) return _kbIndustryPatterns
  const file = path.join(KB_INDUSTRY, 'industry_patterns.json')
  _kbIndustryPatterns = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBIndustryPatterns) : null
  return _kbIndustryPatterns
}

function loadKBBrandExtended(): KBBrandExample[] {
  if (_kbBrandExtended !== null) return _kbBrandExtended
  const file = path.join(KB_BRAND, 'brand_extended.json')
  _kbBrandExtended = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBBrandExample[]) : []
  return _kbBrandExtended
}

function loadKBA11yKeyboard(): KBGenericObject | null {
  if (_kbA11yKeyboard !== false) return _kbA11yKeyboard
  const file = path.join(KB_A11Y, 'accessibility_keyboard.json')
  _kbA11yKeyboard = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBGenericObject) : null
  return _kbA11yKeyboard
}

function loadKBA11yAria(): KBGenericObject | null {
  if (_kbA11yAria !== false) return _kbA11yAria
  const file = path.join(KB_A11Y, 'accessibility_aria.json')
  _kbA11yAria = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as KBGenericObject) : null
  return _kbA11yAria
}

function loadDesignSystem(name: string): DesignSystemSpec | null {
  if (_designSystemCache.has(name)) return _designSystemCache.get(name) ?? null

  // Try encrypted file first (.enc)
  const encFile = path.join(KB_DS, `${name}.enc`)
  if (fs.existsSync(encFile)) {
    const key = getEncryptionKey()
    if (!key) {
      // No key available — cannot decrypt. Graceful degradation.
      _designSystemCache.set(name, null)
      return null
    }
    try {
      const encBuffer = fs.readFileSync(encFile)
      const plaintext = decryptDesignSystem(encBuffer, key)
      const spec = JSON.parse(plaintext) as DesignSystemSpec
      _designSystemCache.set(name, spec)
      return spec
    } catch {
      // Wrong key or corrupt file — graceful degradation.
      _designSystemCache.set(name, null)
      return null
    }
  }

  // Fallback to plaintext JSON (local dev without encryption)
  const jsonFile = path.join(KB_DS, `${name}.json`)
  const spec = fs.existsSync(jsonFile)
    ? (JSON.parse(fs.readFileSync(jsonFile, 'utf-8')) as DesignSystemSpec)
    : null
  _designSystemCache.set(name, spec)
  return spec
}

function buildInvertedIndexes(principles: Principle[]): void {
  if (_indexesBuilt) return
  for (const p of principles) {
    // page_type index
    for (const pt of p.applies_to) {
      if (!_pageTypeIndex.has(pt)) _pageTypeIndex.set(pt, new Set())
      _pageTypeIndex.get(pt)!.add(p.id)
    }
    // emphasis index via EMPHASIS_PRINCIPLE_BONUS keys
    for (const emphasis of Object.keys(EMPHASIS_PRINCIPLE_BONUS) as Array<DesignPageInput['emphasis']>) {
      if ((EMPHASIS_PRINCIPLE_BONUS[emphasis][p.id] ?? 0) > 0) {
        if (!_emphasisIndex.has(emphasis)) _emphasisIndex.set(emphasis, new Set())
        _emphasisIndex.get(emphasis)!.add(p.id)
      }
    }
  }
  _indexesBuilt = true
}

// ─── KB selection helpers ────────────────────────────────────────────────────

function selectKBPrinciples(
  pageType: string,
  emphasis: string,
  allPrinciples: KBVisualPrinciple[],
  count: number
): KBVisualPrinciple[] {
  const scored = allPrinciples.map(p => {
    let score = 0
    if (p.best_page_types.includes(pageType)) score += 3
    if (p.best_emphasis.includes(emphasis)) score += 2
    return { p, score }
  })
  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
  return scored.slice(0, count).map(s => s.p)
}

function findBrandMatch(
  industry: string,
  emphasis: string,
  examples: KBBrandExample[]
): KBBrandExample | null {
  if (!industry) return null
  const normalized = industry.toLowerCase()
  for (const ex of examples) {
    const industryHit = ex.industry_match.some(term => normalized.includes(term))
    const emphasisHit = ex.emphasis_match.includes(emphasis)
    if (industryHit && emphasisHit) return ex
    if (industryHit) return ex
  }
  return null
}

function getTypographyFonts(
  pageType: string,
  industry: string,
  emphasis: string,
  spec: KBTypographySpec | null
): { fontFamily: string; pairings: string; headlineGuidance: string; sizeNotes: string } {
  const fallback = { fontFamily: 'Inter', pairings: '', headlineGuidance: '', sizeNotes: '' }
  if (!spec) return fallback

  // Font family recommendation
  const normalizedIndustry = (industry || '').toLowerCase()
  const normalizedEmphasis = emphasis.toLowerCase()
  let bestFamily = spec.font_families.find(
    ff => ff.industry_match.some(t => normalizedIndustry.includes(t)) && ff.emphasis_match.includes(normalizedEmphasis)
  ) ?? spec.font_families.find(
    ff => ff.industry_match.some(t => normalizedIndustry.includes(t))
  ) ?? spec.font_families[0]

  const pairingInfo = spec.page_type_font_pairings[pageType]
  const sizeRow = spec.size_scale.find(s => s.role === 'Body')
  const sizeNotes = sizeRow ? `Body: ${sizeRow.desktop} desktop / ${sizeRow.mobile} mobile` : ''

  return {
    fontFamily: bestFamily.fonts.slice(0, 3).join(', '),
    pairings: pairingInfo?.pairings.join(' — ') ?? '',
    headlineGuidance: pairingInfo?.headline_guidance ?? '',
    sizeNotes,
  }
}

// ─── Existing principle types ─────────────────────────────────────────────────

interface Principle {
  id: string
  title: string
  category: string
  summary: string
  rules: string[]
  dos: string[]
  donts: string[]
  applies_to: string[]
}

interface PrincipleMatch {
  principle: Principle
  score: number
  reasons: string[]
}

function loadAllPrinciples(): Principle[] {
  if (_allPrinciples !== null) return _allPrinciples
  const categories = ['cognitive', 'visual', 'interaction', 'persuasion', 'aesthetics']
  const all: Principle[] = []
  for (const cat of categories) {
    const file = path.join(CONTENT_BASE, cat, 'principles.json')
    if (fs.existsSync(file)) {
      const items = JSON.parse(fs.readFileSync(file, 'utf-8')) as Principle[]
      all.push(...items)
    }
  }
  _allPrinciples = all
  buildInvertedIndexes(all)
  return _allPrinciples
}

const PAGE_TYPE_PRINCIPLES: Record<string, string[]> = {
  dashboard:    ['preattentive_vision', 'visual_hierarchy', 'cognitive_load', 'feedback_latency', 'gestalt_principles'],
  landing_page: ['halo_effect', 'visual_hierarchy', 'anchoring_bias', 'f_pattern', 'preattentive_vision'],
  form:         ['cognitive_load', 'feedback_latency', 'fitts_law', 'affordance', 'gestalt_principles'],
  settings:     ['cognitive_load', 'progressive_disclosure', 'hicks_law', 'affordance', 'visual_hierarchy'],
  onboarding:   ['hicks_law', 'cognitive_load', 'progressive_disclosure', 'halo_effect', 'feedback_latency'],
  pricing:      ['anchoring_bias', 'hicks_law', 'halo_effect', 'visual_hierarchy', 'color_psychology'],
  navigation:   ['hicks_law', 'fitts_law', 'gestalt_principles', 'affordance', 'preattentive_vision'],
}

const LAYOUT_ADVICE: Record<string, Record<string, string>> = {
  dashboard: {
    clarity:    'Single-column or 12-column grid with a persistent left sidebar. Top bar for global actions. Most important metric at top-left. Cards for grouping. Whitespace > borders for separation.',
    conversion: 'Lead with KPIs above the fold. Use bold numbers with trend indicators. Primary action button fixed top-right. Activity feed below the fold.',
    trust:      'Consistent card sizes, 8px grid strictly. Status indicators with icons+color. Last-updated timestamps visible.',
    speed:      'Skeleton screens on load. Lazy-load below-fold sections. Sticky header for navigation. Minimal decorative elements.',
  },
  landing_page: {
    clarity:    'Hero with H1 + single sentence value prop + one CTA. Social proof immediately below. Feature section with 3-column grid. Pricing. FAQ. Footer CTA.',
    conversion: 'Hero CTA above fold. Anchored pricing (show enterprise plan first). Multiple CTAs down the page. Trust badges near CTA.',
    trust:      'Testimonials with photos and company logos. Security badges. Team section. Press mentions.',
    speed:      'Minimal hero — text + background color. No video autoplay. Feature icons over screenshots. Maximum 3 sections.',
  },
  form: {
    clarity:    'Single-column layout. One question visible at a time for complex flows. Labels above fields. Inline validation. Progress bar for multi-step.',
    conversion: 'Reduce fields to minimum viable. Show value at each step. Social login options. Progress indicator.',
    trust:      'Show what data is used for. Privacy note near sensitive fields. No surprises in confirmation state.',
    speed:      'Autofill support. Smart defaults. Keyboard navigation. Submit on Enter.',
  },
  settings: {
    clarity:    'Left sidebar navigation grouped by category. Content area with section headers. Inline save. Search for power users.',
    conversion: 'Focus on clarity and reduced cognitive load.',
    trust:      'Confirm before destructive actions. Show current state clearly.',
    speed:      'Instant save with undo toast. No modal confirmations for non-destructive changes.',
  },
  onboarding: {
    clarity:    'Wizard pattern: one goal per step. Progress bar. Back button always available. Skip option for optional steps.',
    conversion: 'Time-to-value as fast as possible. Defer optional setup. Pre-populate with sensible defaults.',
    trust:      'Explain why you need each piece of information. No surprise charges or commitments.',
    speed:      'Minimum required fields only. Default values everywhere. One-click social login.',
  },
  pricing: {
    clarity:    '3-tier pricing table. Most popular highlighted. Feature comparison table. FAQ section.',
    conversion: 'Anchor with enterprise/high price. Feature the middle tier visually. Annual pricing default.',
    trust:      'Money-back guarantee. No hidden fees statement. Security badges.',
    speed:      'Instant plan activation. No sales call required for self-serve.',
  },
  navigation: {
    clarity:    'Max 7 items. Active state clearly visible. Breadcrumbs for deep hierarchy.',
    conversion: 'Focus on reducing friction and clarity.',
    trust:      'Consistent placement across all pages.',
    speed:      'Keyboard accessible. Predictable hover states.',
  },
}

const TYPOGRAPHY_ADVICE: Record<string, string> = {
  clarity:    'System font stack or Inter. 16-18px body. 1.6 line-height. 60-75ch max-width. Strong H1/H2/H3 hierarchy with at least 1.5x size ratio.',
  conversion: 'Bold headline (28-48px). Short sentences. Action-oriented copy. CTA button text: verb + value ("Start free trial").',
  trust:      'Serif or semi-serif for credibility. Generous line-height. No all-caps body text.',
  speed:      'System font stack (no web font load). Minimal font weights (regular + bold only).',
}

const COLOR_ADVICE: Record<string, string> = {
  clarity:    'High contrast neutral palette. Single accent color for interactive elements. Semantic red/green/yellow for status.',
  conversion: 'Brand primary for CTAs. High-contrast button (minimum 4.5:1). Warm accent for urgency signals.',
  trust:      'Blue primary (signals reliability). Deep navy or charcoal text. Minimal color usage — restraint signals confidence.',
  speed:      'Dark mode or minimal palette. Monochrome with a single action color.',
}

const EMPHASIS_CATEGORY_BONUS: Record<DesignPageInput['emphasis'], Record<string, number>> = {
  clarity: {
    cognitive: 3,
    visual: 2,
    interaction: 2,
    persuasion: 0,
    aesthetics: 1,
  },
  conversion: {
    cognitive: 1,
    visual: 2,
    interaction: 2,
    persuasion: 3,
    aesthetics: 2,
  },
  trust: {
    cognitive: 2,
    visual: 2,
    interaction: 2,
    persuasion: 2,
    aesthetics: 3,
  },
  speed: {
    cognitive: 3,
    visual: 1,
    interaction: 3,
    persuasion: 0,
    aesthetics: 1,
  },
}

const EMPHASIS_PRINCIPLE_BONUS: Record<DesignPageInput['emphasis'], Record<string, number>> = {
  clarity: {
    visual_hierarchy: 3,
    cognitive_load: 3,
    progressive_disclosure: 2,
    affordance: 1,
  },
  conversion: {
    anchoring_bias: 3,
    halo_effect: 3,
    visual_hierarchy: 2,
    f_pattern: 2,
    color_psychology: 2,
  },
  trust: {
    halo_effect: 3,
    feedback_latency: 2,
    affordance: 2,
    visual_hierarchy: 2,
  },
  speed: {
    feedback_latency: 3,
    fitts_law: 2,
    cognitive_load: 2,
    hicks_law: 2,
  },
}

const DEVICE_ADVICE: Record<string, string> = {
  mobile: 'Bias toward one-column layouts, sticky bottom actions, 44-48px touch targets, and ruthless content trimming. Any secondary action should collapse behind a progressive disclosure pattern.',
  desktop: 'Use the extra width for comparison, not decoration. Keep a dominant focal area, preserve keyboard flows, and avoid spreading primary decisions across distant zones.',
  tablet: 'Design for split attention: wider cards than mobile, fewer concurrent panels than desktop. Large touch targets still matter.',
}

const INDUSTRY_ADVICE: Array<{ terms: string[]; advice: string }> = [
  {
    terms: ['fintech', 'finance', 'bank', 'insurance', 'health', 'healthcare', 'medical', 'legal', 'security', 'government'],
    advice: 'Use visual restraint, explicit labels, and proof of reliability. Trust is earned with calm hierarchy, clear state labels, audit-friendly language, and zero ambiguous actions.',
  },
  {
    terms: ['ecommerce', 'retail', 'consumer', 'marketplace', 'sales'],
    advice: 'Merchandise the decision. Lead with the offer, make comparison effortless, and use social proof or recommendation signals to reduce hesitation.',
  },
  {
    terms: ['saas', 'b2b', 'developer', 'analytics', 'internal', 'admin'],
    advice: 'Prioritize information density with control. Reduce scanning cost, keep actions close to the data they affect, and make system state obvious at a glance.',
  },
]

const AUDIENCE_ADVICE: Array<{ terms: string[]; advice: string }> = [
  {
    terms: ['beginner', 'first-time', 'new user', 'novice'],
    advice: 'Design for confidence-building. Show fewer choices, explain why each step matters, and make the next action unmistakable.',
  },
  {
    terms: ['expert', 'admin', 'operator', 'developer', 'analyst'],
    advice: 'Respect expertise. Keep the surface clean, but expose fast paths, keyboard support, and dense summaries where they save time.',
  },
  {
    terms: ['executive', 'leadership', 'manager'],
    advice: 'Lead with status, trend direction, and business impact. Executives should understand what changed and what needs action within five seconds.',
  },
]

function normalizeText(...values: Array<string | undefined>): string {
  return values
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// Term-set lookup: O(1) per check vs O(n×m) string scan
function buildTermSet(...values: Array<string | undefined>): Set<string> {
  const words = values
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[\s,;|/\-_]+/)
    .filter(w => w.length > 1)
  return new Set(words)
}

function hasAnyTermFast(termSet: Set<string>, terms: string[]): boolean {
  return terms.some(t => termSet.has(t))
}

// Legacy string scan — kept for backward compat inside rankPrinciples combined text
function hasAnyTerm(haystack: string, terms: string[]): boolean {
  return terms.some(term => haystack.includes(term))
}

function toTitleList(values: string[]): string {
  if (values.length === 0) {
    return 'not specified'
  }

  return values.join(', ')
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

function buildHighImpactChanges(input: DesignPageInput, projectCtx: ProjectContext, requestContext: string): string[] {
  const termSet = buildTermSet(input.audience, projectCtx.audience, projectCtx.industry, requestContext)
  const isExistingSurface = hasAnyTermFast(termSet, ['existing', 'current', 'legacy', 'redesign', 'improve', 'audit', 'refactor'])

  const baseline = isExistingSurface
    ? [
        'Strip visual noise first: remove duplicate actions, weak secondary CTAs, and decorative treatments that compete with the main task.',
        'Re-rank the page so one element dominates immediately: headline, KPI, primary task, or recommended choice.',
        'Move actions next to the data or form section they affect. Reduce cursor travel and decision branching.',
      ]
    : [
        'Define one dominant user outcome for the page and make every section support that path. Anything else becomes secondary or progressive disclosure.',
        'Build the first screen for instant comprehension: strongest headline or metric, one primary CTA, and a short proof block.',
        'Use fewer but larger visual bets. Contrast, spacing, and size should do the hierarchy work before copy is read.',
      ]

  if (input.page_type === 'dashboard') {
    baseline.push('Promote the most decision-driving metric or alert to the top-left and demote passive information below the fold.')
  }

  if (input.page_type === 'form') {
    baseline.push('Reduce form friction by hiding optional fields until they are relevant and converting validation from end-state to inline feedback.')
  }

  if (input.page_type === 'landing_page' || input.page_type === 'pricing') {
    baseline.push('Compress the story into proof, value, and action. Every extra section must earn its place by reducing doubt or increasing motivation.')
  }

  if (hasAnyTermFast(termSet, ['mobile', 'ios', 'android'])) {
    baseline.push('Collapse lateral complexity. A mobile surface should read top-to-bottom with one primary action per viewport.')
  }

  if (hasAnyTermFast(termSet, ['finance', 'health', 'security', 'enterprise', 'b2b'])) {
    baseline.push('Increase trust density: add plain-language labels, explicit system status, and visible proof of reliability near moments of commitment.')
  }

  return baseline.slice(0, 5)
}

function rankPrinciples(input: DesignPageInput, projectCtx: ProjectContext, requestContext: string, principles: Principle[]): PrincipleMatch[] {
  // Build term set once per call — O(1) lookups thereafter
  const termSet = buildTermSet(
    input.audience,
    input.context,
    requestContext,
    projectCtx.audience,
    projectCtx.industry,
    projectCtx.device_targets.join(' '),
    projectCtx.custom_rules.join(' ')
  )

  const baseIds = PAGE_TYPE_PRINCIPLES[input.page_type] ?? PAGE_TYPE_PRINCIPLES.dashboard
  const matches = principles.map((principle): PrincipleMatch => {
    const reasons: string[] = []
    let score = 0

    const baseIndex = baseIds.indexOf(principle.id)
    if (baseIndex >= 0) {
      score += 8 - baseIndex
      reasons.push('core to this page type')
    }

    if (principle.applies_to.includes(input.page_type)) {
      score += 2
      reasons.push('explicitly applies to this surface')
    }

    score += EMPHASIS_CATEGORY_BONUS[input.emphasis][principle.category] ?? 0
    if ((EMPHASIS_CATEGORY_BONUS[input.emphasis][principle.category] ?? 0) > 0) {
      reasons.push(`${input.emphasis} emphasis favors ${principle.category}`)
    }

    const principleBonus = EMPHASIS_PRINCIPLE_BONUS[input.emphasis][principle.id] ?? 0
    if (principleBonus > 0) {
      score += principleBonus
      reasons.push(`high leverage for ${input.emphasis}`)
    }

    if (hasAnyTermFast(termSet, ['beginner', 'first-time', 'novice']) && ['cognitive_load', 'progressive_disclosure', 'affordance'].includes(principle.id)) {
      score += 3
      reasons.push('reduces confusion for first-time users')
    }

    if (hasAnyTermFast(termSet, ['expert', 'admin', 'developer', 'analyst', 'operator']) && ['visual_hierarchy', 'feedback_latency', 'fitts_law'].includes(principle.id)) {
      score += 2
      reasons.push('supports expert-speed workflows')
    }

    if (hasAnyTermFast(termSet, ['existing', 'current', 'legacy', 'redesign', 'improve', 'audit', 'refactor']) && ['feedback_latency', 'cognitive_load', 'affordance', 'halo_effect'].includes(principle.id)) {
      score += 2
      reasons.push('high-impact for refactoring existing UI')
    }

    if (hasAnyTermFast(termSet, ['mobile', 'ios', 'android']) && ['fitts_law', 'hicks_law', 'progressive_disclosure', 'feedback_latency'].includes(principle.id)) {
      score += 3
      reasons.push('important for constrained mobile flows')
    }

    if (hasAnyTermFast(termSet, ['fintech', 'finance', 'bank', 'insurance', 'health', 'healthcare', 'medical', 'legal', 'security']) && ['halo_effect', 'feedback_latency', 'visual_hierarchy', 'affordance'].includes(principle.id)) {
      score += 3
      reasons.push('supports trust in regulated contexts')
    }

    if (hasAnyTermFast(termSet, ['ecommerce', 'retail', 'consumer', 'marketplace', 'sales']) && ['anchoring_bias', 'halo_effect', 'f_pattern', 'color_psychology'].includes(principle.id)) {
      score += 3
      reasons.push('improves persuasion on commercial pages')
    }

    return {
      principle,
      score,
      reasons: dedupe(reasons),
    }
  })

  return matches
    .sort((left, right) => right.score - left.score || left.principle.title.localeCompare(right.principle.title))
}

// ─── Domain router ────────────────────────────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  typography: ['font', 'type', 'typography', 'typeface', 'heading', 'body text', 'text size',
               'weight', 'bold', 'italic', 'line height', 'letter spacing', 'scale', 'readable', 'readability'],
  color:      ['color', 'colour', 'contrast', 'palette', 'background', 'foreground', 'dark mode',
               'light mode', 'hex', 'shade', 'tone', 'hue', 'saturation', 'wcag'],
  layout:     ['layout', 'grid', 'spacing', 'placement', 'position', 'align', 'column', 'row',
               'sidebar', 'header', 'footer', 'section', 'button', 'component', 'placement', 'hierarchy'],
  brand:      ['brand', 'identity', 'emotion', 'tone', 'feel', 'personality', 'voice', 'style'],
  visual:     ['visual', 'icon', 'illustration', 'image', 'graphic', 'balance', 'gestalt', 'proximity',
               'grouping', 'whitespace', 'density'],
  design_system: ['design system', 'design tokens', 'bytemethod', 'byte method'],
}

const REDO_KEYWORDS = ['redo', 'revisit', 'reconsider', 'different', 'change', 'not happy',
                       'try again', 'another option', 'alternative', 'rethink', 'revise', 'update']

interface DomainFlags {
  typography: boolean
  color: boolean
  layout: boolean
  brand: boolean
  visual: boolean
  design_system: boolean
}

/**
 * Determines which KB domains to load for this call.
 *
 * In 'full' mode: always returns all domains (backward compatible, default).
 * In 'progressive' mode:
 *   - First call (nothing resolved): all domains
 *   - Subsequent calls: only domains explicitly asked about or triggered by redo signal
 *   - Redo signal + domain keyword: clears that domain from resolved and re-triggers it
 */
function resolveNeededDomains(
  contextText: string,
  sessionMode: 'full' | 'progressive',
  resolvedDomains: string[],
  hasDesignSystem: boolean,
): { flags: DomainFlags; clearedByRedo: string[] } {
  // full mode: always load everything
  if (sessionMode === 'full') {
    return {
      flags: { typography: true, color: true, layout: true, brand: true, visual: true, design_system: hasDesignSystem },
      clearedByRedo: [],
    }
  }

  // progressive mode: first call (nothing resolved yet) = full pass
  if (resolvedDomains.length === 0) {
    return {
      flags: { typography: true, color: true, layout: true, brand: true, visual: true, design_system: hasDesignSystem },
      clearedByRedo: [],
    }
  }

  const lower = contextText.toLowerCase()
  const hasRedo = REDO_KEYWORDS.some(k => lower.includes(k))
  const clearedByRedo: string[] = []

  const flags: DomainFlags = { typography: false, color: false, layout: false, brand: false, visual: false, design_system: false }

  for (const domain of Object.keys(DOMAIN_KEYWORDS) as Array<keyof DomainFlags>) {
    const isResolved = resolvedDomains.includes(domain)
    const isAsked = DOMAIN_KEYWORDS[domain].some(k => lower.includes(k))

    if (isAsked) {
      // Always re-trigger if explicitly asked — regardless of resolved status.
      // The redo signal additionally clears the domain from resolved_domains.
      flags[domain] = true
      if (isResolved && hasRedo) {
        clearedByRedo.push(domain)
      }
    } else if (!isResolved) {
      // Not yet covered and not specifically asked — auto-trigger
      flags[domain] = true
    }
    // isResolved && !isAsked = already covered, not asked → skip (shown in skipped note)
  }

  // Safety: if nothing triggered, still output typography + layout as baseline
  const anyFlagged = Object.values(flags).some(Boolean)
  if (!anyFlagged) {
    flags.typography = !resolvedDomains.includes('typography')
    flags.layout     = !resolvedDomains.includes('layout')
    // If both are resolved too, fall through with all false — only intent sig outputs
  }

  return { flags, clearedByRedo }
}

export const designPageShape = {
  page_type: z.enum(['dashboard', 'landing_page', 'form', 'settings', 'onboarding', 'pricing', 'navigation']),
  audience:  z.string().describe('Who will use this page'),
  emphasis:  z.enum(['clarity', 'conversion', 'trust', 'speed']),
  context:   z.string().optional().describe('Additional context about the product'),
}

export type DesignPageInput = {
  page_type: keyof typeof PAGE_TYPE_PRINCIPLES
  audience:  string
  emphasis:  'clarity' | 'conversion' | 'trust' | 'speed'
  context?:  string
}

export function designPage(input: DesignPageInput): string {
  const { page_type, audience, emphasis, context } = input
  const principles = loadAllPrinciples()
  const projectCtx: ProjectContext = loadContext()

  // ── Read session state for router ─────────────────────────────────────────
  const state = loadState()
  const sessionMode   = state.session.session_mode ?? 'full'
  const resolvedDomains = state.active_page.resolved_domains ?? []
  const contextText   = [context ?? '', projectCtx.industry, audience].join(' ')

  const hasDesignSystem = !!projectCtx.design_system
  const { flags, clearedByRedo } = resolveNeededDomains(contextText, sessionMode, resolvedDomains, hasDesignSystem)

  // ── Load only flagged KB modules ───────────────────────────────────────────
  const designSystem        = flags.design_system && projectCtx.design_system
                                ? loadDesignSystem(projectCtx.design_system)
                                : null
  const kbVisualPrinciples  = flags.visual     ? loadKBVisualPrinciples()     : []
  const kbBrandExamples     = flags.brand      ? loadKBBrandExamples()        : []
  const kbBrandExtended     = flags.brand      ? loadKBBrandExtended()        : []
  const kbTypoSpec          = flags.typography ? loadKBTypographySpec()       : null
  const kbTypoRoles         = flags.typography ? loadKBTypographyRoles()      : null
  const kbTypoPatterns      = flags.typography ? loadKBTypographyPatterns()   : []
  const kbTypoAntipatterns  = flags.typography ? loadKBTypographyAntipatterns() : null
  const kbColorTokens       = flags.color      ? loadKBColorTokens()          : null
  const kbColorPrinciples   = flags.color      ? loadKBColorPrinciples()      : null
  const kbColorContrast     = flags.color      ? loadKBColorContrast()        : null
  const kbColorAntipatterns = flags.color      ? loadKBColorAntipatterns()    : null
  const kbLayoutComponents  = flags.layout     ? loadKBLayoutComponents()     : null
  const kbLayoutSpacing     = flags.layout     ? loadKBLayoutSpacing()        : null
  // Always load cross-cutting KBs regardless of domain flags
  const kbInteraction       = loadKBInteractionPatterns()
  const kbUXWriting         = loadKBUXWriting()
  const kbIndustry          = loadKBIndustryPatterns()
  const kbA11y              = loadKBA11yKeyboard()
  const kbA11yAria          = loadKBA11yAria()

  // ── Psychology gate — ALWAYS runs ─────────────────────────────────────────
  const requestContext = [
    context,
    projectCtx.project_name ? `Project: ${projectCtx.project_name}` : '',
    projectCtx.stack ? `Stack: ${projectCtx.stack}` : '',
    projectCtx.industry ? `Industry: ${projectCtx.industry}` : '',
    projectCtx.device_targets.length > 0 ? `Devices: ${projectCtx.device_targets.join(', ')}` : '',
  ].filter(Boolean).join(' | ')

  const rankedPrinciples = rankPrinciples(input, projectCtx, requestContext, principles)
  const topPrinciples    = rankedPrinciples.slice(0, 3)

  // Intent Signature — compact always-present block that grounds all domain output
  const topPrincipleNames = topPrinciples.map(p => p.principle.title).join(', ')
  const ctxTermSet        = buildTermSet(audience, requestContext, projectCtx.industry, projectCtx.audience, projectCtx.device_targets.join(' '))
  const trustContext      = hasAnyTermFast(ctxTermSet, ['finance', 'health', 'security', 'legal', 'enterprise']) ? 'regulated/trust-critical' : ''
  const mobileContext     = hasAnyTermFast(ctxTermSet, ['mobile', 'ios', 'android']) ? 'mobile-constrained' : ''
  const expertContext     = hasAnyTermFast(ctxTermSet, ['developer', 'admin', 'analyst', 'operator']) ? 'expert audience' : ''
  const intentSignature   = [
    `**Page:** ${page_type.replace(/_/g, ' ')} · **Emphasis:** ${emphasis} · **Mode:** ${sessionMode}`,
    `**Design frame:** ${[projectCtx.industry || emphasis, trustContext, mobileContext, expertContext].filter(Boolean).join(', ')}`,
    `**Anchor principles:** ${topPrincipleNames}`,
    clearedByRedo.length > 0 ? `**Re-opened by redo signal:** ${clearedByRedo.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  // ── Conditional domain sections ────────────────────────────────────────────

  // Layout (always output when flagged — most broadly relevant)
  const layoutPageMaxWidth = kbLayoutSpacing?.grid_system.page_type_max_width[page_type] ?? ''
  const layoutButtonRules  = kbLayoutComponents?.buttons.rules.slice(0, 3) ?? []
  const layoutCardRules    = kbLayoutComponents?.cards.rules.slice(0, 2) ?? []
  const layoutZIndexRule   = kbLayoutSpacing?.z_index_system.rules[0] ?? ''
  // Interaction timing for this page type
  const interactionMotion     = kbInteraction?.page_type_motion_guidance[page_type] ?? ''
  const interactionReducedMotion = kbInteraction?.reduced_motion.rule ?? ''
  const copyPageGuide         = kbUXWriting?.page_type_copy_guidance[page_type] ?? ''
  const ctaRuleExample        = kbUXWriting?.cta_copy.patterns.slice(0, 2)
    .map(p => `'${p.bad}' → '${p.good}'`).join(', ') ?? ''

  const layoutKBSection = kbLayoutComponents
    ? `\n\n### Component Rules (from KB)\n` +
      (layoutButtonRules.length > 0 ? `**Buttons:** ${layoutButtonRules.join(' · ')}\n` : '') +
      (layoutCardRules.length > 0   ? `**Cards:** ${layoutCardRules.join(' · ')}\n` : '') +
      (layoutPageMaxWidth ? `**Max-width for ${page_type.replace(/_/g, ' ')}:** ${layoutPageMaxWidth}\n` : '') +
      (layoutZIndexRule ? `**Z-index:** ${layoutZIndexRule}\n` : '') +
      (interactionMotion ? `**Motion (${page_type.replace(/_/g, ' ')}):** ${interactionMotion}\n` : '') +
      (interactionReducedMotion ? `**Reduced-motion rule:** ${interactionReducedMotion}` : '')
    : ''

  const copyKBSection = kbUXWriting
    ? `\n\n### Copy & UX Writing Guidance\n` +
      (copyPageGuide ? `**${page_type.replace(/_/g, ' ')} copy:** ${copyPageGuide}\n` : '') +
      (ctaRuleExample ? `**CTA rule:** ${kbUXWriting.cta_copy.rule}\nExamples: ${ctaRuleExample}` : '')
    : ''

  const layoutSection = flags.layout
    ? `\n## Layout Recommendation\n${LAYOUT_ADVICE[page_type]?.[emphasis] ?? ''}${layoutKBSection}${copyKBSection}` +
      (designSystem
        ? `\n\n### ${designSystem.name} Button Specs\n` +
          `**Primary:** ${designSystem.buttons.primary.font_family} ${designSystem.buttons.primary.font_weight} ${designSystem.buttons.primary.font_size} · ` +
          `padding ${designSystem.buttons.primary.padding} · radius ${designSystem.buttons.primary.border_radius} · ` +
          `bg ${designSystem.buttons.primary.background} → hover ${designSystem.buttons.primary.hover_background}\n` +
          `**Secondary:** bg ${designSystem.buttons.secondary.background} · border ${designSystem.buttons.secondary.border} → hover ${designSystem.buttons.secondary.hover_background}\n` +
          designSystem.button_rules.map(r => `- ${r}`).join('\n')
        : '')
    : ''

  // Typography — static advice always with KB enrichment only when flagged
  const typoAdvice = TYPOGRAPHY_ADVICE[emphasis] ?? ''
  const kbTypo     = kbTypoSpec ? getTypographyFonts(page_type, projectCtx.industry, emphasis, kbTypoSpec) : null

  const typoFontSection = kbTypoSpec && kbTypo
    ? `\n### Font Recommendations\n` +
      `**Recommended families:** ${kbTypo.fontFamily}\n` +
      (kbTypo.pairings ? `**Pairings for ${page_type.replace(/_/g, ' ')}:** ${kbTypo.pairings}\n` : '') +
      (kbTypo.headlineGuidance ? `**Headline guidance:** ${kbTypo.headlineGuidance}\n` : '') +
      `**Body size:** ${kbTypoSpec.size_scale.find(s => s.role === 'Body')?.desktop ?? '16–18px'} desktop / ` +
      `${kbTypoSpec.size_scale.find(s => s.role === 'Body')?.mobile ?? '16–18px'} mobile\n` +
      `**Line-height (body):** ${kbTypoSpec.line_height_scale.find(l => l.role === 'Body')?.value ?? '1.45–1.7'}`
    : ''

  // Font role system (3-role model)
  const typoRolesSection = kbTypoRoles
    ? `\n### Font Role System\n` +
      kbTypoRoles.roles.map(r => `- **${r.var}** (${r.purpose}) — ${r.when_to_use}`).join('\n') +
      `\n**Weight rules:** ${kbTypoRoles.weight_rules.slice(0, 3).join(' · ')}\n` +
      `**Spacing rules:** ${kbTypoRoles.letter_spacing_rules[0]}`
    : ''

  // Reference brand patterns matched to this project's industry + emphasis
  const normalizedIndustry = (projectCtx.industry || '').toLowerCase()
  const matchedPatterns = kbTypoPatterns.filter(
    p => p.emphasis_match.includes(emphasis) || p.industry_match.some(m => normalizedIndustry.includes(m))
  ).slice(0, 2)
  const typoPatternsSection = matchedPatterns.length > 0
    ? `\n### Reference Patterns\n` +
      matchedPatterns.map(p =>
        `**${p.brand}** — ${p.tagline}\n` +
        `Font: ${p.font}\n` +
        `Takeaway: ${p.takeaway}`
      ).join('\n\n')
    : ''

  // Top 3 anti-patterns most relevant to this emphasis
  const emphasisAntipatternMap: Record<string, string[]> = {
    clarity:    ['Flat hierarchy', 'Arbitrary size values', 'Low-contrast "design choice"'],
    conversion: ['Flat hierarchy', 'Center-aligned paragraphs', 'Justified text'],
    trust:      ['Low-contrast "design choice"', 'Bold on small text', 'Flat hierarchy'],
    speed:      ['Arbitrary size values', 'Flat hierarchy', 'Letter-spacing on body'],
  }
  const relevantAntipatternNames = emphasisAntipatternMap[emphasis] ?? []
  const relevantAntipatterns = kbTypoAntipatterns
    ? kbTypoAntipatterns.antipatterns.filter(a => relevantAntipatternNames.includes(a.name))
    : []
  const typoAntipatternsSection = relevantAntipatterns.length > 0
    ? `\n### Common Typography Mistakes (for ${emphasis})\n` +
      relevantAntipatterns.map(a => `**${a.name}:** ${a.why} → ${a.fix}`).join('\n')
    : ''

  const typographySection = flags.typography
    ? designSystem
      ? `\n## Typography — ${designSystem.name}\n` +
        designSystem.typography_rules.map(r => `- ${r}`).join('\n') +
        `\n\n### Font Specs\n` +
        `**Body:** ${designSystem.typography.body.font_family} · weight ${designSystem.typography.body.weight} · ` +
        `${designSystem.typography.body.size}/${designSystem.typography.body.line_height} · color ${designSystem.typography.body.color}\n` +
        `**Headings:** ${designSystem.typography.headings.font_family} · weight ${designSystem.typography.headings.weight_range} · ` +
        `color ${designSystem.typography.headings.color}\n` +
        `**Buttons:** ${designSystem.typography.buttons.font_family} · weight ${designSystem.typography.buttons.weight} · ` +
        `${designSystem.typography.buttons.size}` +
        `${typoAntipatternsSection}`
      : `\n## Typography\n${typoAdvice}${typoFontSection}${typoRolesSection}${typoPatternsSection}${typoAntipatternsSection}`
    : ''

  // Color
  const colorPageGuide    = kbColorPrinciples?.page_type_color_guidance[page_type] ?? ''
  const colorEmphGuide    = kbColorPrinciples?.emphasis_color_guidance[emphasis] ?? ''
  const sixtyThirtyTen    = kbColorPrinciples?.rule_60_30_10.layers
    .map(l => `${l.percent}% ${l.role}: ${l.use}`)
    .join(' · ') ?? ''
  const contrastQuickRef  = kbColorContrast?.quick_reference
    .slice(0, 3)
    .map(c => `${c.combo} → ${c.ratio} (${c.passes ? 'passes' : 'FAILS'})`)
    .join(', ') ?? ''
  const focusRingPattern  = kbColorTokens?.component_states.focus_ring_pattern ?? ''
  const elevationRules    = kbColorTokens?.elevation_system.rules.slice(0, 2) ?? []
  const colorAntipatterns = kbColorAntipatterns?.antipatterns
    .filter(a => a.emphasis_match.includes(emphasis))
    .slice(0, 3) ?? []
  const colorKBSection = kbColorPrinciples
    ? `\n\n### Color System Rules (from KB)\n` +
      (colorEmphGuide  ? `**${emphasis} emphasis:** ${colorEmphGuide}\n` : '') +
      (colorPageGuide  ? `**${page_type.replace(/_/g, ' ')} guidance:** ${colorPageGuide}\n` : '') +
      (sixtyThirtyTen  ? `**60/30/10 distribution:** ${sixtyThirtyTen}\n` : '') +
      (contrastQuickRef ? `**Contrast quick-ref:** ${contrastQuickRef}\n` : '') +
      (elevationRules.length > 0 ? `**Elevation:** ${elevationRules.join(' · ')}\n` : '') +
      (focusRingPattern ? `**Focus ring:** \`${focusRingPattern}\`\n` : '') +
      (colorAntipatterns.length > 0
        ? `\n**Anti-patterns to avoid (${emphasis}):**\n` +
          colorAntipatterns.map(a => `- **${a.name}:** ${a.why} → ${a.fix}`).join('\n')
        : '')
    : ''
  const colorSection = flags.color
    ? designSystem
      ? `\n## Color Strategy — ${designSystem.name}\n` +
        `**Palette:** Grayscale only.\n` +
        Object.entries(designSystem.palette).map(([k, v]) => `\`${k}\`: ${v}`).join(' · ') + '\n\n' +
        `**Roles:**\n` +
        `- Primary action: ${designSystem.palette_roles.primary_action} → hover ${designSystem.palette_roles.primary_action_hover}\n` +
        `- Body text: ${designSystem.palette_roles.body_text}\n` +
        `- Headings: ${designSystem.palette_roles.heading_text}\n` +
        `- Subtle/secondary: ${designSystem.palette_roles.subtle_text}\n` +
        `- Borders: ${designSystem.palette_roles.border}\n` +
        `- Background: ${designSystem.palette_roles.background} · Surface: ${designSystem.palette_roles.surface}\n` +
        `- Contrast sections: ${designSystem.palette_roles.contrast_section_bg.join(', ')}\n` +
        `- Disabled: ${designSystem.palette_roles.disabled}\n\n` +
        designSystem.palette_rules.map(r => `- ${r}`).join('\n') +
        // Keep universal KB color principles (contrast, 60-30-10) alongside design system
        (contrastQuickRef ? `\n\n**Contrast quick-ref:** ${contrastQuickRef}` : '') +
        (sixtyThirtyTen ? `\n**60/30/10 distribution:** ${sixtyThirtyTen}` : '')
      : `\n## Color Strategy\n${COLOR_ADVICE[emphasis] ?? ''}${colorKBSection}`
    : ''

  // Visual KB principles
  const selectedKBPrinciples = kbVisualPrinciples.length > 0
    ? selectKBPrinciples(page_type, emphasis, kbVisualPrinciples, 2)
    : []
  const visualKBSection = selectedKBPrinciples.length > 0
    ? `\n## Visual Design Foundation\n\n` +
      selectedKBPrinciples.map(p => {
        const howLines = p.how.slice(0, 2).map(h => `  - ${h}`).join('\n')
        const implLine = p.implementation[0] ? `  - ${p.implementation[0]}` : ''
        const example  = p.examples[0] ? `\n**Example:** ${p.examples[0]}` : ''
        const failure  = `\n**Avoid:** ${p.failure_mode}`
        return `### ${p.title}\n${p.summary}\n\n**How to use:**\n${howLines}\n${implLine}${example}${failure}`
      }).join('\n\n')
    : ''

  // Brand emotional direction — check extended library first for better industry matches
  const allBrandExamples = [...kbBrandExamples, ...kbBrandExtended]
  const brandMatch = allBrandExamples.length > 0
    ? findBrandMatch(projectCtx.industry, emphasis, allBrandExamples)
    : null
  const brandKBSection = brandMatch
    ? `\n## Emotional Direction\n` +
      `**Reference brand:** ${brandMatch.brand}\n` +
      `**Emotional effect:** ${brandMatch.emotional_effect}\n` +
      `**Design lesson:** ${brandMatch.design_lesson}\n` +
      `**Signals to adopt:**\n${brandMatch.design_signals.map(s => `- ${s}`).join('\n')}\n` +
      `**Type direction:** ${brandMatch.type_direction}\n` +
      `**Color direction:** ${brandMatch.color_direction}`
    : ''

  // ── Industry KB playbook (always loaded — cross-cutting) ──────────────────
  const industryKey = Object.keys(kbIndustry ?? {}).find(k =>
    hasAnyTermFast(ctxTermSet, k.split('_'))
  ) ?? null
  const industryPlaybook = industryKey && kbIndustry ? kbIndustry[industryKey] : null
  const industryPlaybookSection = industryPlaybook
    ? `\n\n**${industryPlaybook.description} — Key rules:**\n` +
      industryPlaybook.design_principles.slice(0, 3).map((p: string) => `- ${p}`).join('\n') +
      (industryPlaybook.page_type_emphasis[page_type]
        ? `\n**Emphasis for ${page_type.replace(/_/g, ' ')}:** ${industryPlaybook.page_type_emphasis[page_type]}`
        : '')
    : ''

  // ── Adaptation layer (always included) ────────────────────────────────────
  const deviceAdvice   = projectCtx.device_targets.map(d => DEVICE_ADVICE[d.toLowerCase()]).filter(Boolean).join(' ')
  const industryAdvice = INDUSTRY_ADVICE.filter(e => hasAnyTermFast(ctxTermSet, e.terms)).map(e => e.advice).join(' ')
  const audienceAdvice = AUDIENCE_ADVICE.filter(e => hasAnyTermFast(ctxTermSet, e.terms)).map(e => e.advice).join(' ')
  const adaptationSection = deviceAdvice || industryAdvice || audienceAdvice || industryPlaybookSection
    ? `\n## Adaptation Layer\n${[deviceAdvice, industryAdvice, audienceAdvice, industryPlaybookSection].filter(Boolean).join('\n\n')}`
    : ''

  // ── Principles section (always included — psychology gate output) ──────────
  const principleSection = topPrinciples.map(({ principle, reasons }) => {
    const rules    = principle.rules.slice(0, 2).map(rule => `  - ${rule}`).join('\n')
    const doItem   = principle.dos[0]   ? `  - Do: ${principle.dos[0]}`   : ''
    const dontItem = principle.donts[0] ? `  - Avoid: ${principle.donts[0]}` : ''
    const why      = reasons.length > 0 ? `**Why now:** ${reasons.join('; ')}.` : ''
    return `### ${principle.title}\n${principle.summary}\n${why}\n\n**Key rules:**\n${rules}\n${doItem}\n${dontItem}`
  }).join('\n\n')

  const mistakes = topPrinciples.flatMap(p => p.principle.donts.slice(0, 1)).map(d => `- ${d}`).join('\n')

  // ── Context sections ───────────────────────────────────────────────────────
  const strategyContext = [
    projectCtx.project_name ? `Project: ${projectCtx.project_name}` : '',
    `Audience: ${projectCtx.audience || 'not set'}`,
    `Industry: ${projectCtx.industry || 'not set'}`,
    `Devices: ${toTitleList(projectCtx.device_targets) || 'not set'}`,
  ].filter(Boolean).join(' | ')

  const brandCtxSection = projectCtx.brand.primary_color
    ? `\n## Brand Context\nPrimary color: ${projectCtx.brand.primary_color} | Theme: ${projectCtx.brand.theme} | Font: ${projectCtx.brand.font || 'not set'}`
    : ''

  const customRulesSection = projectCtx.custom_rules.length > 0
    ? `\n## Project Custom Rules\n${projectCtx.custom_rules.map(r => `- ${r}`).join('\n')}`
    : ''

  const highImpactChanges = buildHighImpactChanges(input, projectCtx, requestContext)
  const impactSection     = `\n## High-Impact Changes\n${highImpactChanges.map(c => `- ${c}`).join('\n')}`

  // ── Checklist (always included) ────────────────────────────────────────────
  const kbChecklist = `\n## Review Checklist\n` +
    `### Attention and hierarchy\n` +
    `- [ ] Is there one obvious focal point?\n` +
    `- [ ] Is the headline or primary KPI visibly dominant?\n` +
    `- [ ] Does the CTA stand out without screaming?\n` +
    `### Readability and contrast\n` +
    `- [ ] Is all critical text WCAG AA compliant (4.5:1 minimum)?\n` +
    `- [ ] Are supporting and primary text clearly differentiated?\n` +
    `### Structure and grouping\n` +
    `- [ ] Are related items grouped tightly enough?\n` +
    `- [ ] Are actions positioned near the objects they affect?\n` +
    `### Interaction and psychology\n` +
    `- [ ] Is choice count low enough for fast decisions (≤7 nav items)?\n` +
    `- [ ] Are touch targets at least 44×44px on mobile?\n` +
    `- [ ] Does the system give immediate feedback for every async action?\n` +
    `### Brand and emotion\n` +
    `- [ ] Does the interface emotion match the product promise?\n` +
    `### Ethics and accessibility\n` +
    `- [ ] Would this flow still feel fair if the user were in a hurry or under stress?\n` +
    // Inject WCAG quick-checklist items from KB (perceivable + operable are most actionable)
    (kbA11yAria?.wcag_quick_checklist
      ? (kbA11yAria.wcag_quick_checklist.perceivable as string[]).slice(0, 2).map((i: string) => `- [ ] ${i}`).join('\n') + '\n' +
        (kbA11yAria.wcag_quick_checklist.operable as string[]).slice(0, 3).map((i: string) => `- [ ] ${i}`).join('\n') + '\n' +
        (kbA11yAria.wcag_quick_checklist.understandable as string[]).slice(0, 2).map((i: string) => `- [ ] ${i}`).join('\n')
      : `- [ ] All images have alt text\n- [ ] All functionality is keyboard accessible\n- [ ] Focus order follows reading flow`) +
    '\n' +
    // Global keyboard rules from keyboard KB
    (kbA11y?.global_rules
      ? '\n### Keyboard & focus\n' +
        (kbA11y.global_rules as string[]).slice(0, 3).map((r: string) => `- [ ] ${r}`).join('\n')
      : '')

  // ── Update resolved_domains in state ──────────────────────────────────────
  const nowResolved = new Set([
    ...resolvedDomains.filter(d => !clearedByRedo.includes(d)),
    ...Object.entries(flags).filter(([, v]) => v).map(([k]) => k),
  ])
  saveState({ active_page: { resolved_domains: [...nowResolved] } })

  // ── Progressive mode: show what's being skipped ───────────────────────────
  const skippedDomains = sessionMode === 'progressive'
    ? Object.entries(flags)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .filter(k => resolvedDomains.includes(k))
    : []
  const skippedNote = skippedDomains.length > 0
    ? `\n> **Progressive mode:** ${skippedDomains.join(', ')} already covered — use "redo [domain]" in context to revisit.`
    : ''

  // ── Design system constraints section ────────────────────────────────────
  const designSystemSection = designSystem && flags.design_system
    ? `\n## ${designSystem.name} Design System Constraints\n\n` +
      `> ${designSystem.description}\n\n` +
      `### DO\n${designSystem.rules_do.map(r => `- ${r}`).join('\n')}\n\n` +
      `### DON'T\n${designSystem.rules_dont.map(r => `- ${r}`).join('\n')}\n\n` +
      `**Spacing:** ${designSystem.spacing.notes}\n` +
      `**Shadows:** ${designSystem.shadows.notes}`
    : ''

  return `# UI Design Strategy: ${page_type.replace(/_/g, ' ')} for ${audience}

## Intent Signature
${intentSignature}
${skippedNote}
**Resolved context:** ${strategyContext}${brandCtxSection}${customRulesSection}${adaptationSection}${impactSection}

---

## Psychology Principles (Always Active)

${principleSection}

## Common Mistakes to Avoid
${mistakes}

---
${designSystemSection}${layoutSection}${typographySection}${colorSection}${visualKBSection}${brandKBSection}
${kbChecklist}
`
}
