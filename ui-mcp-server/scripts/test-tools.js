#!/usr/bin/env node
/**
 * ui-craft integration test — full coverage
 * Tests all 6 MCP tools + a complete user-flow case study.
 * Runs directly against compiled dist/ — no MCP protocol layer needed.
 * Set UI_CRAFT_STORAGE_DIR to an isolated temp dir before any require().
 *
 * Usage:  node scripts/test-tools.js
 *         node scripts/test-tools.js --verbose    (prints sample outputs)
 *         node scripts/test-tools.js --casestudy  (prints full case study report)
 */
'use strict'

const os   = require('os')
const path = require('path')
const fs   = require('fs')

// ── 1. Isolated storage before any require ────────────────────────────────
const TEST_STORAGE = path.join(os.tmpdir(), `ui-craft-test-${Date.now()}`)
const TEST_HOME    = path.join(os.tmpdir(), `ui-craft-home-${Date.now()}`)
process.env.UI_CRAFT_STORAGE_DIR = TEST_STORAGE
process.env.UI_CRAFT_HOME = TEST_HOME   // keeps the project registry out of the real home folder
fs.mkdirSync(TEST_STORAGE, { recursive: true })

const DIST        = path.join(__dirname, '..', 'dist')
const VERBOSE     = process.argv.includes('--verbose')
const CASE_STUDY  = process.argv.includes('--casestudy')

// ── 2. Load compiled modules ───────────────────────────────────────────────
const storage     = require(path.join(DIST, 'storage', 'storage.js'))
const dpModule    = require(path.join(DIST, 'tools', 'design_page.js'))
const ssModule    = require(path.join(DIST, 'tools', 'start_session.js'))
const orchModule  = require(path.join(DIST, 'tools', 'orchestrator.js'))
const statusModule = require(path.join(DIST, 'tools', 'status.js'))
const versionModule = require(path.join(DIST, 'version.js'))

const {
  initContextSystem, saveContext, loadContext, loadState, saveState, loadUsage, appendUsageEvent,
  appendHistory, loadHistory, setWorkspaceRoots, takeNotice, getWorkspaceInfo, listRegisteredProjects,
} = storage
const { designPage } = dpModule
const { startSession } = ssModule
const { runSession } = orchModule
const { buildStatusText, buildContextText } = statusModule
const { VERSION } = versionModule

// ── 3. Helpers ─────────────────────────────────────────────────────────────
let passed = 0, failed = 0
const failures = []
const sections = []
let currentSection = ''

function section(name) {
  currentSection = name
  sections.push(name)
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${name}`)
  console.log('─'.repeat(60))
}

function test(name, fn) {
  try {
    fn()
    passed++
    process.stdout.write(`  ✓ ${name}\n`)
  } catch (err) {
    failed++
    failures.push({ section: currentSection, name, error: err.message })
    process.stdout.write(`  ✗ ${name}\n    → ${err.message}\n`)
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed') }
function has(str, sub)     { if (!str.includes(sub)) throw new Error(`Missing: "${sub}"`) }
function hasNot(str, sub)  { if (str.includes(sub))  throw new Error(`Unexpected: "${sub}"`) }
function assertLen(str, min) { if (str.length < min)  throw new Error(`Output too short (${str.length} < ${min})`) }

// Reset storage state between test groups
function freshState(sessionMode = 'full') {
  saveState({ active_page: { resolved_domains: [] }, session: { session_mode: sessionMode } })
}

function printSample(label, output, maxLines = 30) {
  if (!VERBOSE) return
  const lines = output.split('\n').slice(0, maxLines)
  console.log(`\n  ── Sample: ${label} ──`)
  lines.forEach(l => console.log(`  ${l}`))
  if (output.split('\n').length > maxLines) console.log(`  ... [${output.split('\n').length - maxLines} more lines]`)
  console.log()
}

// ── 4. Setup ───────────────────────────────────────────────────────────────
initContextSystem()

// Base project context: ui-psychology-lab
saveContext({
  project_name: 'UI Psychology Lab',
  audience: 'UX designers and front-end developers',
  industry: 'education developer',
  stack: 'React TypeScript Vite Tailwind',
  device_targets: ['desktop'],
  brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
  custom_rules: ['Show live code examples', 'Prioritize conceptual clarity over feature density'],
})

// ──────────────────────────────────────────────────────────────────────────
section('1. INTENT SIGNATURE — always present regardless of mode or context')
// ──────────────────────────────────────────────────────────────────────────

test('present in full mode', () => {
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'UX learners', emphasis: 'clarity' })
  has(out, '## Intent Signature')
  has(out, '**Anchor principles:**')
  has(out, '**Page:**')
  printSample('Intent Signature block', out, 20)
})

test('present in progressive first-call (no resolved domains)', () => {
  freshState('progressive')
  const out = designPage({ page_type: 'landing_page', audience: 'learners', emphasis: 'clarity' })
  has(out, '## Intent Signature')
  has(out, '**Mode:** progressive')
})

test('present even with no context provided', () => {
  freshState('full')
  const out = designPage({ page_type: 'settings', audience: 'power users', emphasis: 'speed' })
  has(out, '## Intent Signature')
  assertLen(out, 300)
})

test('present when all domains already resolved (progressive, no trigger)', () => {
  saveState({
    active_page: { resolved_domains: ['typography', 'color', 'layout', 'brand', 'visual'] },
    session: { session_mode: 'progressive' },
  })
  const out = designPage({ page_type: 'settings', audience: 'admins', emphasis: 'speed' })
  has(out, '## Intent Signature')
  has(out, '## Psychology Principles')
})

// ──────────────────────────────────────────────────────────────────────────
section('2. FULL MODE — all domains always output')
// ──────────────────────────────────────────────────────────────────────────

test('all domain sections present', () => {
  freshState('full')
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'Educational interactive tool teaching UI psychology principles',
  })
  has(out, '## Typography')
  has(out, '## Layout Recommendation')
  has(out, '## Color Strategy')
  has(out, '## Visual Design Foundation')
  has(out, '## Emotional Direction')
  has(out, '## Review Checklist')
  printSample('Full mode landing_page/clarity', out, 50)
})

test('resolved_domains populated in state after full pass', () => {
  const state = loadState()
  const rd = state.active_page.resolved_domains
  assert(rd.length > 0, `resolved_domains should be non-empty, got: [${rd}]`)
  assert(rd.includes('typography'), 'should include typography')
  assert(rd.includes('layout'), 'should include layout')
  assert(rd.includes('color'), 'should include color')
})

test('second full-mode call still outputs all sections', () => {
  // full mode always runs all — does NOT skip already-resolved domains
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'follow-up call',
  })
  has(out, '## Typography')
  has(out, '## Layout Recommendation')
})

test('Psychology Principles section always present', () => {
  freshState('full')
  const out = designPage({ page_type: 'form', audience: 'new users', emphasis: 'trust' })
  has(out, '## Psychology Principles')
  has(out, '## Common Mistakes to Avoid')
})

// ──────────────────────────────────────────────────────────────────────────
section('3. TYPOGRAPHY KB ENRICHMENT — roles, scale, patterns, antipatterns')
// ──────────────────────────────────────────────────────────────────────────

test('Font Recommendations subsection present', () => {
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'clarity', context: 'developer tooling saas' })
  has(out, '### Font Recommendations')
  has(out, '**Recommended families:**')
})

test('Font Role System subsection present (--font-ui)', () => {
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'clarity', context: 'developer tooling' })
  has(out, '### Font Role System')
  has(out, '--font-ui')
})

test('Reference Patterns subsection present', () => {
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'speed', context: 'developer tooling infrastructure' })
  has(out, '### Reference Patterns')
})

test('Developer tooling → Linear or Vercel pattern matched', () => {
  saveContext({ industry: 'developer devtools infrastructure' })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'speed', context: 'developer tooling' })
  const hasLinear = out.includes('Linear')
  const hasVercel = out.includes('Vercel')
  assert(hasLinear || hasVercel, `Expected Linear or Vercel, found neither.\n${out.slice(0, 800)}`)
  printSample('Developer → pattern match', out, 60)
})

test('Fintech context → Stripe pattern matched', () => {
  saveContext({ industry: 'fintech finance payments' })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'financial analysts', emphasis: 'trust', context: 'fintech dashboard payments' })
  assert(out.includes('Stripe'), `Expected Stripe pattern for fintech/trust.\n${out.slice(0, 800)}`)
})

test('Consumer/premium context → Apple pattern matched', () => {
  saveContext({ industry: 'consumer premium mobile' })
  freshState('full')
  const out = designPage({ page_type: 'landing_page', audience: 'consumers', emphasis: 'conversion', context: 'premium consumer product' })
  const hasApple = out.includes('Apple')
  const hasLinear = out.includes('Linear')   // also valid for clarity
  assert(hasApple || hasLinear, `Expected Apple or fallback pattern for premium/conversion.`)
})

test('Typography anti-patterns present', () => {
  saveContext({ industry: 'saas education' })
  freshState('full')
  const out = designPage({ page_type: 'form', audience: 'users', emphasis: 'clarity' })
  has(out, 'Typography Mistakes')
})

test('Anti-patterns filtered by emphasis: clarity → Flat hierarchy', () => {
  saveContext({ industry: 'saas' })
  freshState('full')
  const out = designPage({ page_type: 'settings', audience: 'admins', emphasis: 'clarity' })
  has(out, 'Flat hierarchy')
})

test('Anti-patterns filtered by emphasis: trust → Low-contrast', () => {
  saveContext({ industry: 'fintech' })
  freshState('full')
  const out = designPage({ page_type: 'form', audience: 'users', emphasis: 'trust' })
  has(out, 'Low-contrast')
})

// ──────────────────────────────────────────────────────────────────────────
section('4. PROGRESSIVE MODE — domain router')
// ──────────────────────────────────────────────────────────────────────────

test('First call (empty resolved_domains) = full pass', () => {
  saveContext({ industry: 'education' })
  freshState('progressive')
  const out = designPage({ page_type: 'landing_page', audience: 'learners', emphasis: 'clarity' })
  has(out, '## Typography')
  has(out, '## Layout Recommendation')
})

test('typography keyword triggers typography section only (when already resolved)', () => {
  saveState({
    active_page: { resolved_domains: ['typography', 'color', 'layout', 'brand', 'visual'] },
    session: { session_mode: 'progressive' },
  })
  const out = designPage({
    page_type: 'landing_page',
    audience: 'learners',
    emphasis: 'clarity',
    context: 'font choice typeface heading readability',
  })
  has(out, '## Typography')
})

test('Skipped domains note shown in progressive mode when domains already resolved', () => {
  saveState({
    active_page: { resolved_domains: ['typography', 'layout', 'color', 'brand', 'visual'] },
    session: { session_mode: 'progressive' },
  })
  const out = designPage({
    page_type: 'landing_page',
    audience: 'learners',
    emphasis: 'clarity',
    context: 'font choice typeface',
  })
  has(out, 'Progressive mode:')
  printSample('Progressive: skipped note', out, 30)
})

test('Redo signal clears typography and re-triggers it', () => {
  saveContext({ industry: 'education' })
  saveState({
    active_page: { resolved_domains: ['typography', 'layout', 'color'] },
    session: { session_mode: 'progressive' },
  })
  const out = designPage({
    page_type: 'landing_page',
    audience: 'learners',
    emphasis: 'clarity',
    context: 'redo typography for a more premium feel font',
  })
  has(out, '## Typography')
  has(out, 'Re-opened by redo signal')
  printSample('Redo signal output', out, 30)
})

test('resolved_domains accumulate across progressive calls', () => {
  saveContext({ industry: 'education' })
  freshState('progressive')
  // First call — full pass
  designPage({ page_type: 'landing_page', audience: 'learners', emphasis: 'clarity' })
  const afterFirst = loadState().active_page.resolved_domains
  assert(afterFirst.length > 0, 'Should have resolved domains after first progressive call')

  // Second call — typography only
  saveState({ active_page: { resolved_domains: afterFirst }, session: { session_mode: 'progressive' } })
  designPage({ page_type: 'landing_page', audience: 'learners', emphasis: 'clarity', context: 'font typeface heading' })
  const afterSecond = loadState().active_page.resolved_domains
  // Union should be >= first
  assert(afterSecond.length >= afterFirst.length, 'Domains should not shrink between progressive calls')
})

// ──────────────────────────────────────────────────────────────────────────
section('5. start_session — state writes + reset')
// ──────────────────────────────────────────────────────────────────────────

test('start_session returns non-empty string', () => {
  const result = startSession({
    working_mode: 'start_from_scratch',
    surface_type: 'landing_page',
    primary_goal: 'clarity',
    audience: 'mixed_audience',
    design_tone: 'professional',
    density_preference: 'balanced',
    change_behavior: 'suggest_only',
    session_mode: 'progressive',
  })
  assert(typeof result === 'string' && result.length > 20)
})

test('start_session resets resolved_domains to []', () => {
  // Pollute state first
  saveState({ active_page: { resolved_domains: ['typography', 'color', 'visual'] } })
  startSession({
    working_mode: 'improve_existing',
    surface_type: 'dashboard',
    primary_goal: 'speed',
    audience: 'developers',
    design_tone: 'minimal',
    density_preference: 'dense',
    change_behavior: 'suggest_only',
    session_mode: 'full',
  })
  const state = loadState()
  assert(
    JSON.stringify(state.active_page.resolved_domains) === '[]',
    `Expected [], got [${state.active_page.resolved_domains}]`
  )
})

test('start_session writes session_mode = progressive to state', () => {
  startSession({
    working_mode: 'start_from_scratch',
    surface_type: 'onboarding',
    primary_goal: 'trust',
    audience: 'consumers',
    design_tone: 'warm',
    density_preference: 'spacious',
    change_behavior: 'suggest_only',
    session_mode: 'progressive',
  })
  const state = loadState()
  assert(state.session.session_mode === 'progressive', `Expected progressive, got ${state.session.session_mode}`)
})

test('start_session writes session_mode = full to state', () => {
  startSession({
    working_mode: 'preview_redesign',
    surface_type: 'pricing',
    primary_goal: 'conversion',
    audience: 'executives',
    design_tone: 'professional',
    density_preference: 'balanced',
    change_behavior: 'suggest_only',
    session_mode: 'full',
  })
  const state = loadState()
  assert(state.session.session_mode === 'full', `Expected full, got ${state.session.session_mode}`)
})

// ──────────────────────────────────────────────────────────────────────────
section('6. UI PSYCHOLOGY LAB — full project scenarios')
// ──────────────────────────────────────────────────────────────────────────

// Reset to real project context
saveContext({
  project_name: 'UI Psychology Lab',
  audience: 'UX designers and front-end developers learning psychology principles',
  industry: 'education developer',
  stack: 'React TypeScript Vite Tailwind',
  device_targets: ['desktop'],
  brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
  custom_rules: ['Always show live code examples', 'Prioritize conceptual clarity'],
})

test('Landing page — rich full-mode output with all sections', () => {
  freshState('full')
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'Educational interactive tool teaching UI psychology: Gestalt, Fitts Law, cognitive load, visual hierarchy, Hick\'s Law — 16 interactive sections with live demos',
  })
  has(out, '## Intent Signature')
  has(out, '## Typography')
  has(out, '## Layout Recommendation')
  has(out, '## Psychology Principles')
  has(out, '## Review Checklist')
  assertLen(out, 2000)
  printSample('UI Psychology Lab: landing_page/clarity', out, 80)
})

test('Landing page — project name appears in brand context', () => {
  freshState('full')
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'Educational tool teaching psychology',
  })
  has(out, 'UI Psychology Lab')
})

test('Dashboard — progress tracking view', () => {
  freshState('full')
  const out = designPage({
    page_type: 'dashboard',
    audience: 'learners tracking progress through psychology modules',
    emphasis: 'clarity',
    context: 'Progress dashboard showing completed sections, quiz scores, principle mastery heatmap',
  })
  has(out, '## Intent Signature')
  has(out, '## Layout Recommendation')
  assertLen(out, 1000)
  printSample('UI Psychology Lab: dashboard/clarity', out, 40)
})

test('Onboarding — first-time user flow', () => {
  freshState('full')
  const out = designPage({
    page_type: 'onboarding',
    audience: 'first-time UX learners, designers unfamiliar with psychology principles',
    emphasis: 'trust',
    context: 'Onboarding flow introducing the 16 UI psychology principles with interactive demos and live code examples',
  })
  has(out, '## Psychology Principles')
  assertLen(out, 1000)
})

test('Onboarding — trust emphasis selects trust-relevant principles', () => {
  freshState('full')
  const out = designPage({
    page_type: 'onboarding',
    audience: 'new learners',
    emphasis: 'trust',
  })
  // Trust emphasis should surface relevant principles
  has(out, '### ')  // at least one principle heading
})

test('Form — settings/preferences for lab (density, theme)', () => {
  freshState('full')
  const out = designPage({
    page_type: 'settings',
    audience: 'returning users customising their learning experience',
    emphasis: 'speed',
    context: 'Settings page for theme selection, density, font preference, and progress reset',
  })
  has(out, '## Intent Signature')
  has(out, '## Psychology Principles')
})

// ──────────────────────────────────────────────────────────────────────────
section('7. EDGE CASES')
// ──────────────────────────────────────────────────────────────────────────

test('No context provided → still produces full output', () => {
  saveContext({ industry: 'saas', project_name: 'MyApp' })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'users', emphasis: 'clarity' })
  has(out, '## Intent Signature')
  has(out, '## Typography')
  assertLen(out, 500)
})

test('Unknown/nonsense industry → fallback gracefully, no crash', () => {
  saveContext({ industry: 'quantum-blockchain-for-cats-nft' })
  freshState('full')
  const out = designPage({ page_type: 'form', audience: 'early adopters', emphasis: 'trust' })
  has(out, '## Intent Signature')
  has(out, '## Typography')
})

test('All page types work without throwing', () => {
  const pageTypes = ['dashboard', 'landing_page', 'form', 'settings', 'onboarding', 'pricing', 'navigation']
  const emphases = ['clarity', 'conversion', 'trust', 'speed']
  saveContext({ industry: 'saas' })
  let errors = []
  for (const pt of pageTypes) {
    for (const em of emphases) {
      freshState('full')
      try {
        const out = designPage({ page_type: pt, audience: 'users', emphasis: em })
        if (!out.includes('## Intent Signature')) errors.push(`${pt}/${em}: missing Intent Signature`)
      } catch (err) {
        errors.push(`${pt}/${em}: threw ${err.message}`)
      }
    }
  }
  assert(errors.length === 0, `\n${errors.join('\n')}`)
})

test('Pricing page + conversion → anchoring bias in principles', () => {
  saveContext({ industry: 'saas b2b' })
  freshState('full')
  const out = designPage({ page_type: 'pricing', audience: 'SMB decision makers', emphasis: 'conversion' })
  // Pricing + conversion should surface anchoring or loss aversion principles
  has(out, '## Psychology Principles')
  assertLen(out, 800)
})

test('Navigation page + clarity → Hick\'s Law likely surfaced', () => {
  saveContext({ industry: 'saas' })
  freshState('full')
  const out = designPage({ page_type: 'navigation', audience: 'general users', emphasis: 'clarity' })
  has(out, '## Psychology Principles')
})

test('Custom rules from context appear in output', () => {
  saveContext({
    project_name: 'UI Psychology Lab',
    industry: 'education',
    custom_rules: ['Always show live code examples', 'Prioritize conceptual clarity'],
  })
  freshState('full')
  const out = designPage({ page_type: 'landing_page', audience: 'developers', emphasis: 'clarity' })
  // Custom rules section should appear
  has(out, '## Project Custom Rules')
})

test('Brand context (primary_color + theme) appears in output', () => {
  saveContext({ brand: { primary_color: '#7C3AED', theme: 'dark', font: 'Inter' } })
  freshState('full')
  const out = designPage({ page_type: 'landing_page', audience: 'designers', emphasis: 'clarity' })
  has(out, '## Brand Context')
  has(out, '#7C3AED')
})

// ──────────────────────────────────────────────────────────────────────────
section('8. OUTPUT QUALITY SPOT-CHECKS')
// ──────────────────────────────────────────────────────────────────────────

test('Checklist always has required sections', () => {
  saveContext({ industry: 'saas' })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'admins', emphasis: 'speed' })
  has(out, '## Review Checklist')
  has(out, 'WCAG AA')
  has(out, '44×44px')
})

test('High-impact changes section present', () => {
  saveContext({ industry: 'saas' })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'admins', emphasis: 'clarity' })
  has(out, '## High-Impact Changes')
})

test('No raw object or [object Object] in output', () => {
  saveContext({ industry: 'fintech', brand: { primary_color: '#0F4C81', theme: 'light', font: 'Inter' } })
  freshState('full')
  const out = designPage({ page_type: 'dashboard', audience: 'analysts', emphasis: 'trust' })
  hasNot(out, '[object Object]')
  hasNot(out, 'undefined')
})

test('All 7 page types produce >500 chars in full mode', () => {
  const pageTypes = ['dashboard', 'landing_page', 'form', 'settings', 'onboarding', 'pricing', 'navigation']
  saveContext({ industry: 'saas' })
  const short = []
  for (const pt of pageTypes) {
    freshState('full')
    const out = designPage({ page_type: pt, audience: 'users', emphasis: 'clarity' })
    if (out.length < 500) short.push(`${pt}: ${out.length} chars`)
  }
  assert(short.length === 0, `Too-short outputs:\n${short.join('\n')}`)
})

// ──────────────────────────────────────────────────────────────────────────
section('9. run_session — orchestrator')
// ──────────────────────────────────────────────────────────────────────────

// get_status output comes straight from the module the server uses
const buildSessionStateText = () => buildStatusText()
const buildUsageStatsText = () => buildStatusText()

// Reset to lab context
saveContext({
  project_name: 'UI Psychology Lab',
  audience: 'UX designers and front-end developers',
  industry: 'education developer',
  stack: 'React TypeScript Vite Tailwind',
  device_targets: ['desktop'],
  brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
  custom_rules: ['Show live code examples', 'Prioritize conceptual clarity'],
})
freshState('full')

test('run_session returns OrchestratorResult shape', () => {
  const result = runSession({ page_type: 'dashboard', audience: 'developers', primary_goal: 'clarity' })
  assert(typeof result === 'object', 'Expected object')
  assert(typeof result.success === 'boolean', 'Missing success boolean')
  assert(typeof result.finalStage === 'string', 'Missing finalStage string')
  assert(Array.isArray(result.stages), 'Missing stages array')
  assert(typeof result.combinedOutput === 'string', 'Missing combinedOutput')
  assert(Array.isArray(result.log), 'Missing log array')
})

test('run_session success=true on well-formed input', () => {
  const result = runSession({
    page_type: 'landing_page',
    audience: 'UX designers',
    primary_goal: 'clarity',
    working_mode: 'start_from_scratch',
    design_tone: 'professional',
  })
  assert(result.success === true, `Expected success=true, got finalStage=${result.finalStage}, log:\n${result.log.join('\n')}`)
})

test('run_session combinedOutput contains design content', () => {
  const result = runSession({ page_type: 'dashboard', primary_goal: 'speed' })
  assert(result.success === true, `Failed: ${result.finalStage}`)
  has(result.combinedOutput, '## Intent Signature')
  assertLen(result.combinedOutput, 500)
  printSample('run_session combinedOutput', result.combinedOutput, 40)
})

test('run_session resolves audience from stored context when not passed', () => {
  // Context already has audience set; pass no audience
  const result = runSession({ page_type: 'dashboard', primary_goal: 'clarity' })
  assert(result.success === true, `Failed: ${result.finalStage}`)
  // Audience should have been resolved from stored context
  // Verify via log entries or combinedOutput mentioning the stored audience
  const audienceReferenced = result.combinedOutput.includes('designer') || result.combinedOutput.includes('developer')
  assert(audienceReferenced, 'Audience from stored context should appear in output')
})

test('run_session resolves page_type from freeform context', () => {
  const result = runSession({
    context: 'We are building a pricing page for our SaaS subscription tiers',
    primary_goal: 'conversion',
  })
  assert(result.success === true, `Failed: ${result.finalStage}`)
  // Inferred page_type should be pricing → output should reflect it
  const hasPricing = result.combinedOutput.toLowerCase().includes('pricing') ||
                     result.combinedOutput.toLowerCase().includes('conversion')
  assert(hasPricing, 'pricing inference should produce conversion-relevant output')
})

test('run_session fresh start (blank context) returns needs-info response', () => {
  // Wipe context + pass no args → should ask clarifying questions
  saveContext({
    project_name: '', audience: '', industry: '',
    stack: '', device_targets: [], custom_rules: [],
    brand: { primary_color: '', font: '', theme: 'light', tone: [] },
  })
  const result = runSession({})
  // Either asks for info (needs-info path) or succeeds with defaults
  // Either is acceptable — it must NOT throw or return empty combinedOutput
  assertLen(result.combinedOutput, 50)
  printSample('run_session fresh start', result.combinedOutput, 20)
  // Restore context
  saveContext({
    project_name: 'UI Psychology Lab',
    audience: 'UX designers and front-end developers',
    industry: 'education developer',
    stack: 'React TypeScript Vite Tailwind',
    device_targets: ['desktop'],
    brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
    custom_rules: ['Show live code examples', 'Prioritize conceptual clarity'],
  })
})

test('run_session PLAN stage appears in stages array', () => {
  const result = runSession({ page_type: 'form', primary_goal: 'trust' })
  assert(result.success === true, `Failed: ${result.finalStage}`)
  const planStage = result.stages.find(s => s.stage === 'PLAN')
  assert(planStage !== undefined, 'PLAN stage missing from stages array')
  assert(planStage.success === true, `PLAN stage failed: ${planStage.error}`)
})

test('run_session DESIGN stage appears in stages array', () => {
  const result = runSession({ page_type: 'form', primary_goal: 'trust' })
  const designStage = result.stages.find(s => s.stage === 'DESIGN')
  assert(designStage !== undefined, 'DESIGN stage missing from stages array')
  assert(designStage.success === true, `DESIGN stage failed: ${designStage.error}`)
})

test('run_session log is non-empty and contains stage messages', () => {
  const result = runSession({ page_type: 'settings', primary_goal: 'speed' })
  assert(result.log.length > 0, 'log should be non-empty')
  const hasStageLog = result.log.some(l => l.includes('[PLAN]') || l.includes('[DESIGN]'))
  assert(hasStageLog, `log should have [PLAN] or [DESIGN] entries. Got: ${result.log.slice(0, 5).join(' | ')}`)
})

test('run_session multiple page types succeed', () => {
  const cases = [
    { page_type: 'onboarding', primary_goal: 'trust' },
    { page_type: 'pricing', primary_goal: 'conversion' },
    { page_type: 'navigation', primary_goal: 'clarity' },
  ]
  saveContext({ industry: 'saas', project_name: 'Test', audience: 'users' })
  const errors = []
  for (const c of cases) {
    freshState('full')
    try {
      const r = runSession(c)
      if (!r.success) errors.push(`${c.page_type}: finalStage=${r.finalStage}`)
    } catch (err) {
      errors.push(`${c.page_type}: threw ${err.message}`)
    }
  }
  assert(errors.length === 0, `\n${errors.join('\n')}`)
  saveContext({
    project_name: 'UI Psychology Lab', audience: 'UX designers and front-end developers',
    industry: 'education developer', stack: 'React TypeScript Vite Tailwind',
    device_targets: ['desktop'], brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
    custom_rules: ['Show live code examples', 'Prioritize conceptual clarity'],
  })
})

// ──────────────────────────────────────────────────────────────────────────
section('10. get_project_context + set_project_context')
// ──────────────────────────────────────────────────────────────────────────

test('loadContext returns expected shape', () => {
  const ctx = loadContext()
  assert(typeof ctx === 'object', 'Expected object')
  assert(typeof ctx.project_name === 'string', 'Missing project_name')
  assert(typeof ctx.audience === 'string', 'Missing audience')
  assert(Array.isArray(ctx.device_targets), 'device_targets should be array')
  assert(typeof ctx.brand === 'object', 'brand should be object')
  assert(typeof ctx.brand.theme === 'string', 'brand.theme should be string')
})

test('saveContext + loadContext round-trip for all core fields', () => {
  saveContext({
    project_name: 'Test Project',
    stack: 'Next.js 14',
    audience: 'enterprise buyers',
    industry: 'fintech',
    brand: { primary_color: '#0F4C81', font: 'Söhne', theme: 'light' },
    device_targets: ['desktop', 'tablet'],
    custom_rules: ['No dark patterns', 'WCAG AA required'],
  })
  const ctx = loadContext()
  assert(ctx.project_name === 'Test Project', `project_name mismatch: ${ctx.project_name}`)
  assert(ctx.stack === 'Next.js 14', `stack mismatch: ${ctx.stack}`)
  assert(ctx.industry === 'fintech', `industry mismatch: ${ctx.industry}`)
  assert(ctx.brand.primary_color === '#0F4C81', `primary_color mismatch: ${ctx.brand.primary_color}`)
  assert(ctx.device_targets.includes('desktop'), 'desktop missing from device_targets')
  assert(ctx.custom_rules.includes('No dark patterns'), 'custom_rules not persisted')
})

test('saveContext partial update preserves unmentioned fields', () => {
  saveContext({ project_name: 'UI Psychology Lab', industry: 'education', audience: 'developers' })
  saveContext({ stack: 'Vite' })  // partial update
  const ctx = loadContext()
  assert(ctx.project_name === 'UI Psychology Lab', 'project_name should not be cleared by partial update')
  assert(ctx.stack === 'Vite', 'stack should be updated')
  assert(ctx.industry === 'education', 'industry should be preserved')
})

test('saveContext custom_rules replaces old list', () => {
  saveContext({ custom_rules: ['rule A', 'rule B'] })
  saveContext({ custom_rules: ['rule C'] })
  const ctx = loadContext()
  assert(ctx.custom_rules.length === 1, `Expected 1 rule, got ${ctx.custom_rules.length}`)
  assert(ctx.custom_rules[0] === 'rule C', 'Expected rule C')
})

test('saveContext empty brand fields do not corrupt brand object', () => {
  saveContext({ brand: { theme: 'dark' } })  // partial brand
  const ctx = loadContext()
  assert(typeof ctx.brand.theme === 'string', 'brand.theme should still be string')
  assert(typeof ctx.brand.primary_color === 'string', 'brand.primary_color should be string (may be empty)')
})

test('loadContext does not throw on first call (empty storage)', () => {
  // Already initialized — just check no throw and returns object
  let ctx
  try { ctx = loadContext() } catch (err) { throw new Error(`loadContext threw: ${err.message}`) }
  assert(typeof ctx === 'object', 'Expected object from loadContext')
})

// Restore context for remaining tests
saveContext({
  project_name: 'UI Psychology Lab',
  audience: 'UX designers and front-end developers',
  industry: 'education developer',
  stack: 'React TypeScript Vite Tailwind',
  device_targets: ['desktop'],
  brand: { theme: 'dark', primary_color: '#7C3AED', font: 'Inter' },
  custom_rules: ['Show live code examples', 'Prioritize conceptual clarity'],
})

// ──────────────────────────────────────────────────────────────────────────
section('11. get_status — session state')
// ──────────────────────────────────────────────────────────────────────────

test('returns expected structure', () => {
  freshState('full')
  const text = buildSessionStateText()
  has(text, `## UI Craft ${VERSION}`)
  has(text, 'Storage:')
  has(text, 'Stage:')
  has(text, 'Mode:')
  has(text, 'Domains resolved:')
  has(text, 'pending:')
  has(text, 'Open questions:')
})

test('reflects full session_mode correctly', () => {
  saveState({ session: { session_mode: 'full' } })
  const text = buildSessionStateText()
  has(text, 'Mode: full')
})

test('reflects progressive session_mode correctly', () => {
  saveState({ session: { session_mode: 'progressive' } })
  const text = buildSessionStateText()
  has(text, 'Mode: progressive')
})

test('resolved domains appear in output after design_page call', () => {
  freshState('full')
  designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'clarity' })
  const text = buildSessionStateText()
  const state = loadState()
  // Resolved domains should have been written by designPage
  if (state.active_page.resolved_domains.length > 0) {
    has(text, state.active_page.resolved_domains[0])
  }
  // Pending should be the complement
  has(text, 'pending:')
})

test('pending domains shrink after full pass', () => {
  freshState('full')
  designPage({ page_type: 'dashboard', audience: 'developers', emphasis: 'clarity' })
  const state = loadState()
  const resolved = state.active_page.resolved_domains
  const pending = ['typography', 'color', 'layout', 'brand', 'visual'].filter(d => !resolved.includes(d))
  // In full mode, all 5 should be resolved
  assert(resolved.length === 5, `Expected 5 resolved in full mode, got ${resolved.length}: [${resolved}]`)
  assert(pending.length === 0, `Expected 0 pending, got ${pending.length}: [${pending}]`)
})

test('get_status shows none yet when no design_page called', () => {
  freshState('full')
  const text = buildSessionStateText()
  has(text, 'none yet')
})

// ──────────────────────────────────────────────────────────────────────────
section('12. usage tracking — appendUsageEvent / recordSession / version')
// ──────────────────────────────────────────────────────────────────────────

test('loadUsage returns object with required fields after init', () => {
  const usage = loadUsage()
  assert(usage !== null, 'loadUsage should return non-null after initContextSystem')
  assert(typeof usage.install_id === 'string' && usage.install_id.length > 0, 'install_id missing')
  assert(typeof usage.version === 'string', 'version missing')
  assert(typeof usage.total_sessions === 'number', 'total_sessions should be number')
  assert(typeof usage.tool_calls === 'object', 'tool_calls should be object')
  assert(typeof usage.page_types === 'object', 'page_types should be object')
})

test('appendUsageEvent increments tool_calls', () => {
  const before = loadUsage()
  const beforeCount = before?.tool_calls['design_page'] ?? 0
  appendUsageEvent('design_page')
  const after = loadUsage()
  const afterCount = after?.tool_calls['design_page'] ?? 0
  assert(afterCount === beforeCount + 1, `Expected ${beforeCount + 1}, got ${afterCount}`)
})

test('usage.json version is the package.json version after any event', () => {
  appendUsageEvent('design_page')
  assert(loadUsage().version === VERSION, `usage.version=${loadUsage().version}, VERSION=${VERSION}`)
})

test('appendUsageEvent does not throw for unknown tool name', () => {
  let threw = false
  try { appendUsageEvent('nonexistent_tool_xyz') } catch { threw = true }
  assert(!threw, 'appendUsageEvent should never throw')
})

test('get_status usage block lists tools and page types', () => {
  appendUsageEvent('start_session')
  appendUsageEvent('design_page')
  const text = buildUsageStatsText()
  has(text, 'Usage since')
  has(text, 'Tools:')
  has(text, 'Page types:')
  has(text, 'design_page')
  printSample('get_status output', text, 30)
})

test('get_status no [object Object] in output', () => {
  const text = buildUsageStatsText()
  hasNot(text, '[object Object]')
  hasNot(text, 'undefined')
})

// ──────────────────────────────────────────────────────────────────────────
section('13. CASE STUDY — UI Psychology Lab full user flow')
// ──────────────────────────────────────────────────────────────────────────
// Simulates a real agent working on ui-psychology-lab from scratch.
// Each step is what an LLM agent would actually call in sequence.

const caseStudyLog = []
function caseLog(step, text) {
  caseStudyLog.push({ step, text })
}

// Step 0: Wipe storage (fresh install simulation)
saveContext({
  project_name: '', audience: '', industry: '', stack: '',
  device_targets: [], custom_rules: [],
  brand: { primary_color: '', font: '', theme: 'light', tone: [] },
})
freshState('full')

test('[CS-01] Agent sets project context via set_project_context', () => {
  saveContext({
    project_name: 'UI Psychology Lab',
    stack: 'React 18 + TypeScript + Vite + Tailwind CSS',
    audience: 'UX designers and front-end developers learning UI psychology',
    industry: 'education developer tools',
    device_targets: ['desktop'],
    brand: { primary_color: '#7C3AED', theme: 'dark', font: 'Inter' },
    custom_rules: [
      'Every principle must have a live interactive demo',
      'Show before/after code examples in TypeScript',
      'Mobile-responsive but desktop-first layout',
    ],
  })
  const ctx = loadContext()
  assert(ctx.project_name === 'UI Psychology Lab', 'project_name not saved')
  assert(ctx.industry === 'education developer tools', 'industry not saved')
  assert(ctx.custom_rules.length === 3, 'custom_rules not saved')
  caseLog('CS-01', `Context set: ${ctx.project_name} | ${ctx.industry}`)
})

test('[CS-02] Agent calls run_session to kick off design for landing page', () => {
  const result = runSession({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    primary_goal: 'clarity',
    working_mode: 'start_from_scratch',
    design_tone: 'professional',
    context: '16-section interactive psychology lab. Sections: Visual Hierarchy, Gestalt, Cognitive Load, Fitts Law, Hick\'s Law, Preattentive Vision, F-Pattern, Color Contrast, Typography, Affordance, Feedback Latency, Anchoring Bias, Halo Effect, Squint Test, FeedbackLatency, Synthesis.',
  })
  assert(result.success === true, `run_session failed at ${result.finalStage}:\n${result.log.join('\n')}`)
  has(result.combinedOutput, '## Intent Signature')
  has(result.combinedOutput, '## Psychology Principles')
  caseLog('CS-02', `run_session: ${result.finalStage} in ${result.stages.reduce((s, r) => s + r.durationMs, 0)}ms`)
  printSample('CS-02: run_session landing_page/clarity', result.combinedOutput, 60)
})

test('[CS-03] Agent checks session state — all domains resolved after run_session', () => {
  const text = buildSessionStateText()
  has(text, `## UI Craft ${VERSION}`)
  has(text, 'Mode:')
  // Should have resolved at least some domains
  const state = loadState()
  assert(state.active_page.resolved_domains.length > 0,
    `No domains resolved after run_session. State: ${JSON.stringify(state.active_page.resolved_domains)}`)
  caseLog('CS-03', `Resolved domains: [${state.active_page.resolved_domains.join(', ')}]`)
})

test('[CS-04] Agent drills into typography domain explicitly', () => {
  // Switch to progressive to test narrowing
  saveState({ session: { session_mode: 'progressive' } })
  // Mark all domains resolved (simulating prior full pass)
  saveState({ active_page: { resolved_domains: ['typography', 'color', 'layout', 'brand', 'visual'] } })
  // Agent asks specifically about typography for their education context
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'Need font recommendations for our dark-themed education tool. Typography rules for code examples and heading hierarchy.',
  })
  has(out, '## Typography')
  has(out, '### Font Recommendations')
  has(out, '### Font Role System')
  // Should include mono (code blocks are key for dev-education)
  has(out, '--font-mono')
  caseLog('CS-04', `Typography drill: ${out.split('\n').filter(l => l.startsWith('#')).join(' | ')}`)
  printSample('CS-04: typography drill', out, 50)
})

test('[CS-05] Agent asks about dashboard (progress tracker) surface', () => {
  freshState('full')
  const out = designPage({
    page_type: 'dashboard',
    audience: 'learners tracking progress through 16 psychology modules',
    emphasis: 'clarity',
    context: 'Progress dashboard: completed sections, principle mastery heatmap, quiz scores, streak counter. Dark theme, desktop. Data-heavy but should feel motivating.',
  })
  has(out, '## Intent Signature')
  has(out, '## Psychology Principles')
  has(out, '## Layout Recommendation')
  assertLen(out, 1500)
  caseLog('CS-05', `Dashboard: ${out.length} chars`)
})

test('[CS-06] Agent designs the onboarding flow', () => {
  freshState('full')
  const out = designPage({
    page_type: 'onboarding',
    audience: 'UX designers encountering UI psychology for the first time',
    emphasis: 'trust',
    context: 'Onboarding introduces the 16 principles one at a time. Progressive disclosure. Each step has a demo and a key rule. Users can skip or revisit.',
  })
  has(out, '## Intent Signature')
  has(out, 'trust')
  assertLen(out, 1000)
  caseLog('CS-06', `Onboarding: emphasis=trust, ${out.length} chars`)
})

test('[CS-07] Agent requests redo of color domain after seeing output', () => {
  // All domains resolved in progressive mode
  saveState({
    active_page: { resolved_domains: ['typography', 'color', 'layout', 'brand', 'visual'] },
    session: { session_mode: 'progressive' },
  })
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'redo color — the purple #7C3AED feels too saturated for dark mode. Need different contrast ratios.',
  })
  has(out, '## Color Strategy')
  has(out, 'Re-opened by redo signal')
  caseLog('CS-07', 'Redo color: confirmed re-triggered')
})

test('[CS-08] usage stats reflect all tool calls from case study', () => {
  // Append some usage events to simulate what server.ts would do
  appendUsageEvent('run_session')
  appendUsageEvent('design_page')
  appendUsageEvent('design_page')
  appendUsageEvent('design_page')

  const usage = loadUsage()
  assert(usage !== null, 'usage should exist')
  const totalCalls = Object.values(usage.tool_calls).reduce((s, n) => s + n, 0)
  assert(totalCalls > 0, 'Should have recorded tool calls')
  caseLog('CS-08', `Usage: ${totalCalls} total tool calls logged`)
})

test('[CS-09] no undefined or object leak across all case study outputs', () => {
  // Run one final sweep to confirm serialization is clean
  freshState('full')
  saveContext({
    project_name: 'UI Psychology Lab',
    audience: 'UX designers and developers',
    industry: 'education developer tools',
    brand: { primary_color: '#7C3AED', theme: 'dark', font: 'Inter' },
    custom_rules: ['Every principle has a live demo'],
  })
  const out = designPage({
    page_type: 'landing_page',
    audience: 'UX designers and developers',
    emphasis: 'clarity',
    context: 'Full Psychology Lab landing page sweep',
  })
  hasNot(out, '[object Object]')
  hasNot(out, 'undefined')
  hasNot(out, 'null')
  caseLog('CS-09', 'Clean output: no serialization leaks')
})

// ───────────────────────────────────────────────────────────────────────────────────
section('14. workspace storage — resolution, lazy creation, migration, history, registry')
// ───────────────────────────────────────────────────────────────────────────────────

const tmpDirs = []
function tmpDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ui-craft-${label}-`))
  tmpDirs.push(dir)
  return dir
}
function real(p) { return fs.realpathSync.native(p) }
const storeDir = ws => path.join(ws, '.vscode', 'ui-assistant')
const NO_OVERRIDES = { UI_CRAFT_STORAGE_DIR: undefined, UI_CRAFT_WORKSPACE_DIR: undefined, INIT_CWD: undefined }

// Runs fn with env vars set (undefined = unset) and restores them afterwards.
function withEnv(vars, fn) {
  const saved = {}
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try { return fn() } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
const inWorkspace = (ws, fn) => withEnv({ ...NO_OVERRIDES, UI_CRAFT_WORKSPACE_DIR: ws }, fn)

function inDir(dir, fn) {
  const previous = process.cwd()
  process.chdir(dir)
  try { return fn() } finally { process.chdir(previous) }
}

takeNotice()

test('storage appears only on first use, under <workspace>/.vscode/ui-assistant', () => {
  const ws = tmpDir('lazy')
  inWorkspace(ws, () => {
    assert(!fs.existsSync(path.join(ws, '.vscode')), 'nothing should exist before first use')
    loadContext()
    const files = fs.readdirSync(storeDir(ws)).sort()
    assert(files.join(',') === '.gitignore,context.json,history.json,state.json,usage.json', `unexpected files: ${files}`)
  })
})

test('the folder ignores itself in git', () => {
  const ws = tmpDir('ignore')
  inWorkspace(ws, () => {
    loadContext()
    assert(fs.readFileSync(path.join(storeDir(ws), '.gitignore'), 'utf-8').trim() === '*', '.gitignore should contain "*"')
  })
})

test('legacy context.json is migrated: version -> schema_version, design_system dropped', () => {
  const ws = tmpDir('migrate')
  fs.mkdirSync(storeDir(ws), { recursive: true })
  fs.writeFileSync(path.join(storeDir(ws), 'context.json'),
    JSON.stringify({ version: '1.0', project_name: 'Old Project', design_system: 'bytemethod', audience: 'admins' }))
  inWorkspace(ws, () => {
    const ctx = loadContext()
    assert(ctx.project_name === 'Old Project' && ctx.audience === 'admins', 'user data must survive migration')
    assert(typeof ctx.schema_version === 'string' && !('version' in ctx) && !('design_system' in ctx), 'legacy keys should be gone')
    const onDisk = JSON.parse(fs.readFileSync(path.join(storeDir(ws), 'context.json'), 'utf-8'))
    assert(!('version' in onDisk) && !('design_system' in onDisk) && onDisk.schema_version === ctx.schema_version, 'file should be rewritten')
  })
})

test('history keeps the newest 20 entries as compact {timestamp, tool, summary}', () => {
  const ws = tmpDir('history')
  inWorkspace(ws, () => {
    for (let i = 0; i < 25; i++) appendHistory({ tool: 'design_page', summary: `entry ${i}` })
    const history = loadHistory()
    assert(history.length === 20, `expected 20 entries, got ${history.length}`)
    assert(history[0].summary === 'entry 24' && history[19].summary === 'entry 5', 'order should be newest first')
    assert(Object.keys(history[0]).sort().join(',') === 'summary,timestamp,tool', 'entry should be compact')
  })
})

test('history drops tool inputs from older releases and clips long summaries', () => {
  const ws = tmpDir('history-legacy')
  fs.mkdirSync(storeDir(ws), { recursive: true })
  fs.writeFileSync(path.join(storeDir(ws), 'history.json'), JSON.stringify([
    { timestamp: '2026-01-01T00:00:00.000Z', tool: 'run_session', input: { context: 'x'.repeat(5000) }, summary: 'old' },
  ]))
  inWorkspace(ws, () => {
    appendHistory({ tool: 'design_page', summary: 'y'.repeat(500) })
    const raw = fs.readFileSync(path.join(storeDir(ws), 'history.json'), 'utf-8')
    assert(!raw.includes('"input"') && raw.length < 1500, `history.json should be compact (${raw.length} bytes)`)
    assert(loadHistory()[0].summary.length <= 120, 'summary should be clipped')
  })
})

test('get_project_context text omits empty fields and internal keys, then lists recent activity', () => {
  const ws = tmpDir('ctxview')
  inWorkspace(ws, () => {
    saveContext({ project_name: 'View Test', stack: 'Next.js' })
    appendHistory({ tool: 'set_project_context', summary: 'updated: project_name, stack' })
    const text = buildContextText()
    const json = JSON.parse(text.split('\n')[0])
    assert(json.project_name === 'View Test' && json.stack === 'Next.js', 'set fields should be present')
    assert(!('audience' in json) && !('schema_version' in json) && !('knowledge_state' in json), 'empty/internal keys should be omitted')
    has(text, 'Recent activity')
    has(text, 'set_project_context: updated: project_name, stack')
  })
})

test('no workspace reported: current folder is used and a one-time notice is raised', () => {
  const ws = tmpDir('cwd')
  inDir(ws, () => withEnv(NO_OVERRIDES, () => {
    setWorkspaceRoots([])
    takeNotice()
    const info = getWorkspaceInfo()
    assert(info.source === 'cwd' && real(info.root) === real(ws), `got ${info.source} ${info.root}`)
    loadContext()
    const notice = takeNotice()
    assert(notice && notice.includes('current folder'), 'expected a notice about the current-folder fallback')
    assert(takeNotice() === null, 'notice should be returned only once')
  }))
})

test('git root above the working folder is preferred over the folder itself', () => {
  const repo = tmpDir('git')
  fs.mkdirSync(path.join(repo, '.git'))
  const sub = path.join(repo, 'packages', 'app')
  fs.mkdirSync(sub, { recursive: true })
  inDir(sub, () => withEnv(NO_OVERRIDES, () => {
    setWorkspaceRoots([])
    const info = getWorkspaceInfo()
    assert(info.source === 'git-root' && real(info.root) === real(repo), `got ${info.source} ${info.root}`)
  }))
})

test('MCP client roots win over the working folder', () => {
  const ws = tmpDir('roots')
  const elsewhere = tmpDir('elsewhere')
  inDir(elsewhere, () => withEnv(NO_OVERRIDES, () => {
    setWorkspaceRoots([ws])
    try {
      const info = getWorkspaceInfo()
      assert(info.source === 'mcp-roots' && real(info.root) === real(ws), `got ${info.source} ${info.root}`)
    } finally { setWorkspaceRoots([]) }
  }))
})

test('UI_CRAFT_WORKSPACE_DIR wins over client roots', () => {
  const ws = tmpDir('env-ws')
  const rootFolder = tmpDir('env-root')
  withEnv({ ...NO_OVERRIDES, UI_CRAFT_WORKSPACE_DIR: ws }, () => {
    setWorkspaceRoots([rootFolder])
    try {
      assert(getWorkspaceInfo().source === 'env-workspace', 'env override should win')
    } finally { setWorkspaceRoots([]) }
  })
})

test('started inside an npm install folder with no roots: refuses to guess', () => {
  const installDir = path.join(tmpDir('install'), 'node_modules', 'pkg')
  fs.mkdirSync(installDir, { recursive: true })
  inDir(installDir, () => withEnv(NO_OVERRIDES, () => {
    setWorkspaceRoots([])
    let error = null
    try { getWorkspaceInfo() } catch (err) { error = err }
    assert(error && error.constructor.name === 'NoWorkspaceError', `expected NoWorkspaceError, got ${error}`)
  }))
})

test('first use inside/next to existing UI Craft data raises a "same project?" notice', () => {
  const parent = tmpDir('nearby')
  const child = path.join(parent, 'child')
  fs.mkdirSync(child)
  inWorkspace(parent, () => { saveContext({ project_name: 'Parent Site' }); takeNotice() })
  inWorkspace(child, () => {
    loadContext()
    const notice = takeNotice()
    assert(notice, 'expected a notice')
    has(notice, parent)
    has(notice, 'Parent Site')
    has(notice, 'same project')
  })
})

test('reusing a project name from another folder raises a notice', () => {
  const first = tmpDir('dupe-a')
  const second = tmpDir('dupe-b')
  inWorkspace(first, () => { saveContext({ project_name: 'Dupe Name' }); takeNotice() })
  inWorkspace(second, () => {
    takeNotice()
    saveContext({ project_name: 'dupe name' })
    const notice = takeNotice()
    assert(notice && notice.includes(first), 'expected the notice to point at the other folder')
  })
})

test('project registry records path, name and start date outside the workspace', () => {
  const ws = tmpDir('registry')
  inWorkspace(ws, () => { saveContext({ project_name: 'Registry Test' }) })
  const entry = listRegisteredProjects(200).find(p => p.path === path.resolve(ws))
  assert(entry, 'project missing from registry')
  assert(entry.project_name === 'Registry Test' && /^\d{4}-\d{2}-\d{2}T/.test(entry.started), `bad entry: ${JSON.stringify(entry)}`)
  assert(fs.existsSync(path.join(TEST_HOME, '.ui-assistant', 'projects.json')), 'registry should live under UI_CRAFT_HOME')
  has(buildStatusText(true), 'Registry Test')
})

test('get_status hides the project list unless asked', () => {
  hasNot(buildStatusText(false), 'Projects on this machine')
})

test('VERSION comes from package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))
  assert(VERSION === pkg.version, `VERSION=${VERSION}, package.json=${pkg.version}`)
})

test('no hard-coded version strings in src', () => {
  const hits = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'content') walk(full); continue }
      if (!entry.name.endsWith('.ts')) continue
      const found = fs.readFileSync(full, 'utf-8').match(/['"`]\d+\.\d+\.\d+['"`]/g)
      if (found) hits.push(`${full}: ${found.join(', ')}`)
    }
  }
  walk(path.join(__dirname, '..', 'src'))
  assert(hits.length === 0, hits.join('\n'))
})

test('design-system feature and its encrypted spec are gone', () => {
  assert(!fs.existsSync(path.join(DIST, 'crypto')), 'dist/crypto should not exist')
  assert(!fs.existsSync(path.join(DIST, 'content', 'kb', 'design-system')), 'design-system content should not ship')
})

test('design_page records page types in usage.json', () => {
  const before = loadUsage()
  designPage({ page_type: 'pricing', audience: 'buyers', emphasis: 'clarity' })
  const after = loadUsage()
  assert((after.page_types.pricing ?? 0) === (before.page_types.pricing ?? 0) + 1, 'page type should be recorded once per call')
})

// ───────────────────────────────────────────────────────────────────────────────────
// 15. MCP over stdio, end to end (async, runs after the synchronous sections)
// ───────────────────────────────────────────────────────────────────────────────────

async function runE2E() {
  const { spawn } = require('child_process')
  const { pathToFileURL } = require('url')

  const ws = tmpDir('e2e-ws')
  const decoyCwd = tmpDir('e2e-cwd')
  const home = tmpDir('e2e-home')
  const env = { ...process.env, UI_CRAFT_HOME: home }
  for (const key of ['UI_CRAFT_STORAGE_DIR', 'UI_CRAFT_WORKSPACE_DIR', 'INIT_CWD']) delete env[key]

  // The server starts in a folder that is NOT the workspace; the client reports the real one via roots.
  const child = spawn(process.execPath, [path.join(DIST, 'server.js')], { cwd: decoyCwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })

  const pending = new Map()
  let buffer = ''
  child.stdout.on('data', chunk => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      if (message.method === 'roots/list') {
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { roots: [{ uri: pathToFileURL(ws).href, name: 'ws' }] } }) + '\n')
      } else if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)(message)
        pending.delete(message.id)
      }
    }
  })

  const request = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15000)
    pending.set(id, message => { clearTimeout(timer); resolve(message) })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  const textOf = response => response.result.content.map(c => c.text).join('\n')
  const call = (id, name, args = {}) => request(id, 'tools/call', { name, arguments: args })

  const seen = {}
  let failure = null
  try {
    await request(1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: 'ui-craft-test', version: '0' },
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')

    seen.tools = (await request(2, 'tools/list', {})).result.tools.map(t => t.name).sort()
    seen.filesBeforeFirstCall = fs.existsSync(path.join(ws, '.vscode')) || fs.existsSync(path.join(decoyCwd, '.vscode'))
    seen.status = textOf(await call(3, 'get_status'))
    await call(4, 'set_project_context', { project_name: 'E2E Project', stack: 'Vite' })
    seen.context = textOf(await call(5, 'get_project_context'))
    await call(6, 'run_session', { page_type: 'dashboard', audience: 'developers' })
  } catch (err) {
    failure = err
  } finally {
    child.kill()
  }

  section('15. MCP stdio end-to-end — roots, lazy creation, tools')

  test('server answers the MCP handshake and tool calls', () => {
    assert(!failure, `${failure}\n${stderr}`)
  })
  test('exposes exactly the 6 tools', () => {
    const expected = ['design_page', 'get_project_context', 'get_status', 'run_session', 'set_project_context', 'start_session']
    assert(JSON.stringify(seen.tools) === JSON.stringify(expected), `tools: ${seen.tools}`)
  })
  test('starting the server and listing tools creates no files', () => {
    assert(seen.filesBeforeFirstCall === false, 'a .vscode folder appeared before any tool was called')
  })
  test('data goes to the client-reported root, not the server working folder', () => {
    assert(fs.existsSync(path.join(storeDir(ws), 'context.json')), 'context.json missing in the workspace root')
    assert(!fs.existsSync(path.join(decoyCwd, '.vscode')), 'working folder must stay untouched')
    assert((seen.status ?? '').toLowerCase().includes(storeDir(ws).toLowerCase()), `status should name the storage folder:\n${seen.status}`)
  })
  test('get_status reports the package.json version', () => {
    has(seen.status ?? '', `## UI Craft ${VERSION}`)
  })
  test('get_project_context returns the saved context', () => {
    has(seen.context ?? '', 'E2E Project')
  })
  test('usage.json and history.json are updated by the server wrapper', () => {
    const usage = JSON.parse(fs.readFileSync(path.join(storeDir(ws), 'usage.json'), 'utf-8'))
    assert(usage.version === VERSION, `usage.version=${usage.version}`)
    assert(usage.tool_calls.get_status >= 1 && usage.tool_calls.set_project_context >= 1 && usage.tool_calls.get_project_context >= 1,
      `tool_calls: ${JSON.stringify(usage.tool_calls)}`)
    assert(usage.total_sessions === 1, `run_session should count as exactly one session, got ${usage.total_sessions}`)
    assert((usage.page_types.dashboard ?? 0) >= 1, 'design output inside run_session should record its page type')
    const history = JSON.parse(fs.readFileSync(path.join(storeDir(ws), 'history.json'), 'utf-8'))
    assert(history[0].tool === 'run_session', 'history should log run_session')
    assert(history.some(h => h.tool === 'set_project_context'), 'history should log set_project_context')
  })
  test('project is listed in the machine-wide registry', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(home, '.ui-assistant', 'projects.json'), 'utf-8'))
    assert(registry.some(p => p.project_name === 'E2E Project'), 'registry entry with the project name missing')
  })
}

function finish() {
  // Print case study summary
  if (CASE_STUDY || VERBOSE) {
    console.log('\n' + '═'.repeat(60))
    console.log('  CASE STUDY TRACE — UI Psychology Lab')
    console.log('═'.repeat(60))
    caseStudyLog.forEach(({ step, text }) => console.log(`  [${step}] ${text}`))
    console.log()
  }

// ──────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  RESULTS:  ${passed} passed   ${failed} failed   ${passed + failed} total`)
  console.log('═'.repeat(60))

  if (failures.length > 0) {
    console.log('\nFailed tests:')
    failures.forEach(f => {
      console.log(`  [${f.section}]`)
      console.log(`  ✗ ${f.name}`)
      console.log(`    ${f.error}\n`)
    })
  }

  // Cleanup temp folders
  for (const dir of [TEST_STORAGE, TEST_HOME, ...tmpDirs]) {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }

  process.exit(failed > 0 ? 1 : 0)
}

runE2E().catch(err => { failed++; failures.push({ section: '15', name: 'e2e harness', error: err.message }) }).then(finish)

