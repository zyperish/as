#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consolidate,
  currentFactSupersededIdSet,
  diagnose,
  goalCheckpoint,
  goalStageReview,
  goalStatus,
  memoryCleanupDryRun,
  memoryIndex,
  memoryGoalBoard,
  memoryHealth,
  memoryProjectBoard,
  recall,
  remember,
  sessionHistory,
  summarizeLatestArchive,
  reflect as reflectArchives,
  listArchives,
} from './am-local-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SECRET_PATTERNS = [
  /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[A-Za-z0-9_\-./+=]{16,}["']?/iu,
  /\bsk-[A-Za-z0-9_\-]{20,}\b/u,
  /\bghp_[A-Za-z0-9_]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/u,
  /\b(?:OPENAI|ANTHROPIC|GOOGLE|GITHUB)_[A-Z0-9_]*(?:KEY|TOKEN|SECRET)\b/u,
];

export async function amFirstStatus(projectRoot, options = {}) {
  const deep = bool(options.deep || options.full || false);
  const [
    store,
    health,
    goalBoard,
    projectBoard,
    history,
    cleanup,
  ] = await Promise.all([
    readStoreStatus(projectRoot, { fast: true }),
    deep ? memoryHealth(projectRoot, { write: false }) : Promise.resolve(leanHealth()),
    deep ? memoryGoalBoard(projectRoot, { write: false }) : Promise.resolve(leanGoalBoard()),
    deep ? memoryProjectBoard(projectRoot, { write: false }) : Promise.resolve(leanProjectBoard()),
    sessionHistory(projectRoot, { limit: options.historyLimit || 3 }),
    deep ? memoryCleanupDryRun(projectRoot, { limit: options.cleanupLimit || 12, write: false }) : Promise.resolve(leanCleanup()),
  ]);
  return {
    ok: true,
    command: 'status',
    amPriority: 'highest',
    portsRequired: false,
    store,
    summary: {
      memories: store.counts?.memories ?? null,
      events: store.counts?.events ?? null,
      sessions: store.counts?.sessions ?? null,
      archives: store.counts?.archives ?? 0,
      encodingWarnings: store.counts?.encodingWarnings ?? null,
      activeGoals: countByStatus(goalBoard, 'active'),
      blockedGoals: countByStatus(goalBoard, 'blocked'),
      projectCount: projectBoard.projects?.length || 0,
      cleanupSuggestions: cleanup.suggestions?.length || cleanup.actions?.length || cleanup.items?.length || 0,
    },
    health: summarizeHealth(health, { storeEncodingWarnings: store.counts?.encodingWarnings }),
    goalBoard: summarizeGoalBoard(goalBoard),
    projectBoard: summarizeProjectBoard(projectBoard),
    sessionHistory: summarizeHistory(history),
    cleanupDryRun: summarizeCleanup(cleanup),
  };
}

export async function amFirstStart(projectRoot, options = {}) {
  const query = String(options.query || options.summary || options.task || '').trim();
  const deep = bool(options.deep || options.full || false);
  const includeHistory = deep || bool(options.history || options.includeHistory || false);
  const includeGoal = deep || bool(options.goal || options.includeGoal || false);
  const [
    store,
    recalled,
    history,
    goal,
    goalBoard,
    projectBoard,
    health,
  ] = await Promise.all([
    readStoreStatus(projectRoot, { fast: true }),
    query ? fastIndexRecall(projectRoot, { query, limit: options.limit || 5 }) : Promise.resolve({ ok: true, query, results: [] }),
    includeHistory ? sessionHistory(projectRoot, { limit: options.historyLimit || 3 }) : Promise.resolve({ ok: true, archives: [], sessions: [], skipped: 'lean_start' }),
    includeGoal ? goalStatus(projectRoot, { projectRoot }) : Promise.resolve({ ok: true, activeGoal: null, events: [], skipped: 'lean_start' }),
    deep ? memoryGoalBoard(projectRoot, { write: false }) : Promise.resolve(leanGoalBoard()),
    deep ? memoryProjectBoard(projectRoot, { write: false }) : Promise.resolve(leanProjectBoard()),
    deep ? memoryHealth(projectRoot, { write: false }) : Promise.resolve(leanHealth()),
  ]);
  return {
    ok: true,
    command: 'start',
    amPriority: 'highest',
    portsRequired: false,
    query,
    used: includeHistory || includeGoal || deep
      ? ['diagnose', 'recall', 'session_history', 'goal_status', 'goal_board', 'project_board', 'memory_health']
      : ['diagnose', 'fast_recall'],
    store: summarizeStore(store),
    activeGoal: summarizeGoal(goal.activeGoal),
    recall: summarizeRecall(recalled),
    sessionHistory: summarizeHistory(history),
    goalBoard: summarizeGoalBoard(goalBoard),
    projectBoard: summarizeProjectBoard(projectBoard),
    health: summarizeHealth(health, { storeEncodingWarnings: store.counts?.encodingWarnings }),
    nextAmActions: [
      'Use this context pack before acting.',
      'Call am-first stage after each meaningful phase.',
      'Call am-first finish or reflect before stopping.',
    ],
  };
}

export async function amFirstStage(projectRoot, options = {}) {
  const summary = requiredSummary(options);
  assertSafeUserFields({ summary, options }, ['summary', 'title', 'files', 'file', 'lessons', 'lesson', 'nextActions', 'next', 'todo', 'concepts', 'tags']);
  const status = await goalStatus(projectRoot, { projectRoot });
  const files = splitList(options.files || options.file);
  const nextActions = splitList(options.nextActions || options.next || options.todo);
  const lessons = splitList(options.lessons || options.lesson);
  let stage;
  let checkpoint = null;
  if (status.activeGoal) {
    stage = await goalStageReview(projectRoot, {
      goalId: status.activeGoal.id,
      summary,
      lessons,
      nextActions,
      evidenceRefs: files.map((file) => ({ path: file, summary: 'AM-first stage evidence' })),
    });
    checkpoint = await goalCheckpoint(projectRoot, {
      goalId: status.activeGoal.id,
      summary,
      nextActions: nextActions.length ? nextActions : status.activeGoal.nextActions || [],
      evidenceRefs: files.map((file) => ({ path: file, summary: 'AM-first stage checkpoint evidence' })),
      eventType: 'am_first_stage_checkpoint',
    });
  } else {
    stage = await remember(projectRoot, {
      title: options.title || 'AM-first stage summary',
      content: summary,
      type: 'am_first_stage_summary',
      layer: 'episodic',
      importance: options.importance || 'normal',
      reusable: false,
      concepts: unique(['AM', 'am-first', 'stage-summary', ...splitList(options.concepts || options.tags)]),
      files,
      source: { kind: 'am_first_stage' },
    });
  }
  const verification = await recall(projectRoot, {
    query: buildVerificationQuery(summary, 'am-first stage'),
    limit: 3,
    enhanced: false,
  });
  return {
    ok: stage.ok !== false,
    command: 'stage',
    amPriority: 'highest',
    portsRequired: false,
    used: status.activeGoal
      ? ['goal_stage_review', 'goal_checkpoint', 'recall_verify']
      : ['remember', 'recall_verify'],
    activeGoal: summarizeGoal(status.activeGoal),
    stage,
    checkpoint,
    verification: summarizeRecall(verification),
  };
}

export async function amFirstFinish(projectRoot, options = {}) {
  const summary = requiredSummary(options);
  assertSafeUserFields({ summary, options }, ['summary', 'title', 'files', 'file', 'lessons', 'lesson', 'nextActions', 'next', 'todo', 'concepts', 'tags']);
  const concepts = unique(['AM', 'am-first', 'finish-summary', 'conversation-summary', ...splitList(options.concepts || options.tags)]);
  const files = splitList(options.files || options.file);
  const finalMemory = await remember(projectRoot, {
    title: options.title || 'AM-first finish summary',
    content: summary,
    type: 'am_first_finish_summary',
    layer: 'episodic',
    importance: options.importance || 'high',
    reusable: options.reusable === undefined ? true : bool(options.reusable),
    concepts,
    files,
    source: { kind: 'am_first_finish' },
  });
  const goal = await goalStatus(projectRoot, { projectRoot });
  let stage = null;
  if (goal.activeGoal) {
    stage = await goalStageReview(projectRoot, {
      goalId: goal.activeGoal.id,
      summary,
      lessons: splitList(options.lessons || options.lesson),
      nextActions: splitList(options.nextActions || options.next || options.todo),
      evidenceRefs: files.map((file) => ({ path: file, summary: 'AM-first finish evidence' })),
    });
  }
  const maintenance = await runMaintenanceOnce(projectRoot, options);
  const store = await diagnose(projectRoot);
  const verification = await recall(projectRoot, {
    query: buildVerificationQuery(summary, 'am-first finish'),
    limit: 5,
    enhanced: false,
  });
  return {
    ok: finalMemory.ok !== false && store.ok !== false,
    command: 'finish',
    amPriority: 'highest',
    portsRequired: false,
    used: ['remember', 'summarize_latest_archive', 'consolidate', 'reflect', 'diagnose', 'recall_verify'],
    finalMemoryId: finalMemory.record?.id || null,
    activeGoal: summarizeGoal(goal.activeGoal),
    stage,
    archiveSummary: maintenance.archiveSummary,
    consolidated: maintenance.consolidated,
    reflected: maintenance.reflected,
    maintenanceSkipped: maintenance.skipped,
    store: summarizeStore(store),
    verification: summarizeRecall(verification),
  };
}

export async function amFirstReflect(projectRoot, options = {}) {
  const summary = requiredSummary(options);
  assertSafeUserFields({ summary, options }, ['summary', 'title', 'files', 'file', 'concepts', 'tags']);
  const memory = await remember(projectRoot, {
    title: options.title || 'AM-first reusable reflection',
    content: summary,
    type: 'am_first_reflection',
    layer: 'procedural',
    importance: options.importance || 'high',
    reusable: true,
    concepts: unique(['AM', 'am-first', 'reflection', 'workflow-rule', ...splitList(options.concepts || options.tags)]),
    files: splitList(options.files || options.file),
    source: { kind: 'am_first_reflection' },
  });
  const shouldReflect = await shouldRunArchiveReflection(projectRoot, options);
  const reflected = shouldReflect.run
    ? await runArchiveReflectionSafely(projectRoot, options)
    : { ok: true, skipped: true, reason: shouldReflect.reason };
  const store = await diagnose(projectRoot);
  const verification = await recall(projectRoot, {
    query: buildVerificationQuery(summary, 'am-first reflection'),
    limit: 5,
    enhanced: false,
  });
  return {
    ok: memory.ok !== false,
    command: 'reflect',
    amPriority: 'highest',
    portsRequired: false,
    used: ['remember', 'reflect', 'diagnose', 'recall_verify'],
    memoryId: memory.record?.id || null,
    reflected,
    store: summarizeStore(store),
    verification: summarizeRecall(verification),
  };
}

async function runArchiveReflectionSafely(projectRoot, options = {}) {
  const latest = (await listArchives(projectRoot, 1))[0] || null;
  const safety = await archivePromotionSafety(latest);
  if (safety.ok === false) {
    return { ok: false, skipped: true, reason: safety.reason };
  }
  return reflectArchives(projectRoot, { limit: options.archiveLimit || 1 }).catch((error) => ({ ok: false, error: error.message }));
}

export async function runMaintenanceOnce(projectRoot, options = {}) {
  const force = bool(options.forceMaintenance || options.force || false);
  const promoteArchives = bool(options.promoteArchives || false);
  const latest = (await listArchives(projectRoot, 1))[0] || null;
  const archivePath = latest?.relativePath || '';
  if (!latest) {
    return {
      ok: true,
      archivePath,
      skipped: ['summary:no_archive', 'consolidate:no_archive', 'reflect:no_archive'],
      archiveSummary: { ok: false, skipped: true, reason: 'no_archive' },
      consolidated: { ok: false, skipped: true, reason: 'no_archive' },
      reflected: { ok: true, skipped: true, reason: 'no_archive' },
    };
  }
  if (!force && !promoteArchives) {
    const reason = 'archive_promotion_requires_force_or_promote_archives';
    return {
      ok: true,
      archivePath,
      skipped: [`summary:${reason}`, `consolidate:${reason}`, `reflect:${reason}`],
      archiveSummary: { ok: true, skipped: true, reason, sourceArchive: archivePath },
      consolidated: { ok: true, skipped: true, reason, sourceArchive: archivePath },
      reflected: { ok: true, skipped: true, reason },
    };
  }
  const state = await archiveMaintenanceState(projectRoot, archivePath);
  const archiveSafe = latest && (force || promoteArchives)
    ? await archivePromotionSafety(latest)
    : { ok: true };
  const skipped = [];
  let archiveSummary;
  let consolidated;
  let reflected;

  if (!latest) {
    archiveSummary = { ok: false, skipped: true, reason: 'no_archive' };
    consolidated = { ok: false, skipped: true, reason: 'no_archive' };
    skipped.push('summary:no_archive', 'consolidate:no_archive');
  } else if (!force && !promoteArchives) {
    archiveSummary = { ok: true, skipped: true, reason: 'archive_promotion_requires_force_or_promote_archives', sourceArchive: archivePath };
    skipped.push('summary:archive_promotion_requires_force_or_promote_archives');
  } else if (!force && state.hasSummary) {
    archiveSummary = { ok: true, skipped: true, reason: 'latest_archive_summary_exists', sourceArchive: archivePath };
    skipped.push('summary:latest_archive_summary_exists');
  } else if (archiveSafe.ok === false) {
    archiveSummary = { ok: false, skipped: true, reason: archiveSafe.reason, sourceArchive: archivePath };
    skipped.push(`summary:${archiveSafe.reason}`);
  } else {
    archiveSummary = await summarizeLatestArchive(projectRoot, {}).catch((error) => ({ ok: false, error: error.message }));
  }

  if (!latest) {
    // Already represented above.
  } else if (!force && !promoteArchives) {
    consolidated = { ok: true, skipped: true, reason: 'archive_promotion_requires_force_or_promote_archives', sourceArchive: archivePath };
    skipped.push('consolidate:archive_promotion_requires_force_or_promote_archives');
  } else if (!force && state.hasConsolidated) {
    consolidated = { ok: true, skipped: true, reason: 'latest_archive_consolidated_memory_exists', sourceArchive: archivePath };
    skipped.push('consolidate:latest_archive_consolidated_memory_exists');
  } else if (archiveSafe.ok === false) {
    consolidated = { ok: false, skipped: true, reason: archiveSafe.reason, sourceArchive: archivePath };
    skipped.push(`consolidate:${archiveSafe.reason}`);
  } else {
    consolidated = await consolidate(projectRoot, { limit: options.archiveLimit || 1 }).catch((error) => ({ ok: false, error: error.message }));
  }

  const reflectionDecision = await shouldRunArchiveReflection(projectRoot, options, state);
  if (reflectionDecision.run) {
    reflected = await reflectArchives(projectRoot, { limit: options.archiveLimit || 1 }).catch((error) => ({ ok: false, error: error.message }));
  } else {
    reflected = { ok: true, skipped: true, reason: reflectionDecision.reason };
    skipped.push(`reflect:${reflectionDecision.reason}`);
  }

  return { ok: true, archivePath, skipped, archiveSummary, consolidated, reflected };
}

async function archiveMaintenanceState(projectRoot, archivePath) {
  const state = {
    archivePath,
    hasSummary: false,
    hasConsolidated: false,
    hasRecentReflection: false,
  };
  if (!archivePath) {
    return state;
  }
  const index = await memoryIndex(projectRoot, { write: false, includeMemories: true, memoryLimit: 10000 });
  const memories = index.memories || [];
  state.hasSummary = memories.some((memory) => memory.type === 'conversation_summary' && samePath(memory.sourcePath || memory.files?.[0], archivePath));
  state.hasConsolidated = memories.some((memory) => memory.type === 'consolidated_memory' && samePath(memory.sourcePath || memory.files?.[0], archivePath));
  state.hasRecentReflection = memories.some((memory) => {
    if (!/reflection|am_first_reflection|goal_lesson/u.test(memory.type || '')) return false;
    const ageMs = Date.now() - Date.parse(memory.timestamp || '');
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 24 * 60 * 60 * 1000;
  });
  return state;
}

async function shouldRunArchiveReflection(projectRoot, options = {}, knownState = null) {
  if (bool(options.forceMaintenance || options.force || false)) {
    return { run: true, reason: 'force' };
  }
  if (!bool(options.promoteArchives || false)) {
    return { run: false, reason: 'archive_promotion_requires_force_or_promote_archives' };
  }
  const latest = (await listArchives(projectRoot, 1))[0] || null;
  const state = knownState || await archiveMaintenanceState(projectRoot, latest?.relativePath || '');
  if (state.hasRecentReflection) {
    return { run: false, reason: 'recent_reflection_exists' };
  }
  return { run: true, reason: 'no_recent_reflection' };
}

async function archivePromotionSafety(archive) {
  if (!archive?.path) {
    return { ok: false, reason: 'no_archive' };
  }
  const text = await fsp.readFile(archive.path, 'utf8').catch(() => '');
  try {
    assertNoSecrets(text);
  } catch {
    return { ok: false, reason: 'archive_secret_scan_failed' };
  }
  return { ok: true };
}

export async function runAmFirstCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'status';
  const projectRoot = path.resolve(args.projectRoot || args['project-root'] || process.env.AGENTMEMORY_PROJECT_ROOT || DEFAULT_PROJECT_ROOT);
  let result;
  if (command === 'status' || command === 'health') {
    result = await amFirstStatus(projectRoot, args);
  } else if (command === 'start') {
    result = await amFirstStart(projectRoot, args);
  } else if (command === 'stage') {
    result = await amFirstStage(projectRoot, args);
  } else if (command === 'finish' || command === 'summary') {
    result = await amFirstFinish(projectRoot, args);
  } else if (command === 'reflect') {
    result = await amFirstReflect(projectRoot, args);
  } else if (command === 'viewer') {
    result = runViewer(projectRoot);
  } else {
    result = { ok: false, error: 'unknown_command', command, usage: usage() };
  }
  return result;
}

function runViewer(projectRoot) {
  const script = path.join(__dirname, 'am-local-viewer-export.mjs');
  const child = spawnSync(process.execPath, [script, '--project-root', projectRoot], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  return {
    ok: child.status === 0,
    command: 'viewer',
    amPriority: 'highest',
    portsRequired: false,
    status: child.status,
    stdout: child.stdout.trim(),
    stderr: child.stderr.trim(),
  };
}

function requiredSummary(options) {
  const value = String(options.summary || options.text || options.content || options.note || '').trim();
  if (!value) {
    throw new Error('summary is required; pass --summary "..."');
  }
  return value;
}

// Secret scanning is reserved for archive-derived promotion. Explicit user-authored
// AM summaries may contain sensitive operational data when the workflow requires it.
function assertNoSecrets(value) {
  const text = String(value || '');
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      throw new Error('summary appears to contain a secret; store a redacted summary and file path reference instead');
    }
  }
}

function assertSafeUserFields(context, names) {
  const values = [];
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(context, name)) {
      values.push([name, context[name]]);
    }
    if (context.options && Object.prototype.hasOwnProperty.call(context.options, name)) {
      values.push([name, context.options[name]]);
    }
  }
  for (const [name, value] of values) {
    const text = Array.isArray(value) ? value.join('\n') : String(value || '');
    if (looksLikeRawLongLog(name, text)) {
      throw new Error(`${name} appears to contain raw long log content; store a concise summary and file path reference instead`);
    }
  }
}

function looksLikeRawLongLog(name, text) {
  if (['files', 'file'].includes(name)) return false;
  const value = String(text || '');
  if (value.length < 12000) return false;
  const lineCount = value.split(/\r?\n/u).length;
  return lineCount > 80 || /^(?:\[[^\]]+\]|\d{4}-\d{2}-\d{2}|ERROR|WARN|INFO)\b/imu.test(value);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    if (eq >= 0) {
      args[camel(raw.slice(0, eq))] = raw.slice(eq + 1);
      args[raw.slice(0, eq)] = raw.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[camel(raw)] = true;
      args[raw] = true;
      continue;
    }
    args[camel(raw)] = next;
    args[raw] = next;
    i += 1;
  }
  return args;
}

async function readStoreStatus(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const store = path.join(root, '.codex', 'memory', 'am');
  const fast = bool(options.fast || options.lean || false);
  if (fast) {
    const [memoriesStat, eventsStat, sessionsStat, archives] = await Promise.all([
      fsp.stat(path.join(store, 'memories.jsonl')).catch(() => null),
      fsp.stat(path.join(store, 'events.jsonl')).catch(() => null),
      fsp.stat(path.join(store, 'sessions.jsonl')).catch(() => null),
      listArchives(root, 1).catch(() => []),
    ]);
    return {
      ok: true,
      projectRoot: root,
      store,
      counts: {
        memories: null,
        events: null,
        sessions: null,
        archives: archives.length,
        encodingWarnings: null,
      },
      fileBytes: {
        memories: memoriesStat?.size ?? null,
        events: eventsStat?.size ?? null,
        sessions: sessionsStat?.size ?? null,
      },
      latestArchive: archives[0]?.relativePath || null,
      portsRequired: false,
      readOnly: true,
      fast: true,
      healthMode: 'streaming-fast',
      countsFresh: false,
      countsHint: 'Fast AM status does not use stale am-health-report.json and does not scan large JSONL files. Run memory-health for live counts.',
    };
  }
  const [memories, events, sessions, archives] = await Promise.all([
    readJsonlCount(path.join(store, 'memories.jsonl')),
    readJsonlCount(path.join(store, 'events.jsonl')),
    readJsonlCount(path.join(store, 'sessions.jsonl')),
    listArchives(root, 1000).catch(() => []),
  ]);
  const badEncoding = await countEncodingWarnings(path.join(store, 'memories.jsonl'));
  return {
    ok: true,
    projectRoot: root,
    store,
    counts: {
      memories,
      events,
      sessions,
      archives: archives.length,
      encodingWarnings: badEncoding,
    },
    latestArchive: archives[0]?.relativePath || null,
    portsRequired: false,
    readOnly: true,
  };
}

async function readJsonlCount(file) {
  return scanJsonlLines(file, () => true);
}

async function scanJsonlLines(file, predicate) {
  let count = 0;
  try {
    const { createInterface } = await import('node:readline');
    const { createReadStream } = await import('node:fs');
    const rl = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const rawLine of rl) {
      const line = String(rawLine || '').trim();
      if (!line) continue;
      if (predicate(line)) count += 1;
    }
  } catch {
    return 0;
  }
  return count;
}

function hasEncodingDamage(value) {
  const text = String(value || '').replace(/\\\\\?\\/gu, '');
  return /\uFFFD|鑰|鎴|鐢|杩|涓|绛|妯|鍥|鑷||埗|Ã.|Â.|â€|è‡|åˆ|ä¸|æ–|æœ|çš|ç”|ç»|å¾|ä»|å·|ç¼|å¼|[A-Za-z]:[\\/]\?{2,}[\\/]|\/\?{2,}|(?:^|[^\p{L}\p{N}])\?{3,}(?:[^\p{L}\p{N}]|$)/iu.test(text);
}

function leanHealth() {
  return { ok: true, lean: true, summary: { mode: 'lean', encodingWarnings: 'not_scanned' }, portsRequired: false };
}

function leanGoalBoard() {
  return { ok: true, lean: true, items: [], goals: [], summary: { mode: 'lean' } };
}

function leanProjectBoard() {
  return { ok: true, lean: true, projects: [], unassigned: { count: null }, summary: { mode: 'lean' } };
}

function leanCleanup() {
  return { ok: true, lean: true, suggestions: [] };
}

async function fastIndexRecall(projectRoot, options = {}) {
  const query = String(options.query || '').trim();
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 20));
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const indexPath = path.join(root, '.codex', 'memory', 'am', 'am-vnext-index.json');
  const currentFactPath = path.join(root, '.codex', 'memory', 'am', 'current_fact_index.json');
  const memoriesPath = path.join(root, '.codex', 'memory', 'am', 'memories.jsonl');
  const tombstonesPath = path.join(root, '.codex', 'memory', 'am', 'tombstones.jsonl');
  try {
    const [index, recentMemories, tombstones, currentFacts] = await Promise.all([
      readJsonFile(indexPath).catch(() => null),
      readRecentJsonlMemories(memoriesPath, { maxRecords: 120, maxBytes: 2 * 1024 * 1024 }).catch(() => []),
      readTombstones(tombstonesPath).catch(() => new Set()),
      readJsonFile(currentFactPath).catch(() => null),
    ]);
    if (!index && recentMemories.length === 0) {
      throw new Error('fast recall sources unavailable');
    }
    const tokens = tokenizeRecallQuery(query);
    const supersededIds = currentFactSupersededIdSet(currentFacts);
    const showSuperseded = isHistoryContextQuery(tokens, query);
    const candidates = mergeMemoryCandidates(index?.memories || [], recentMemories);
    const scored = [];
    for (const memory of candidates) {
      if (tombstones.has(memory.id)) continue;
      if (!showSuperseded && supersededIds.has(String(memory.id || ''))) continue;
      const score = scoreFastMemory(memory, tokens, query);
      if (score > 0) {
        scored.push({ score, memory });
      }
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.memory.timestamp || '').localeCompare(String(a.memory.timestamp || ''));
    });
    return {
      ok: true,
      query,
      returned: Math.min(scored.length, limit),
      source: recentMemories.length > 0 ? 'am-vnext-index+recent-tail' : 'am-vnext-index',
      results: scored.slice(0, limit).map((item) => ({
        score: item.score,
        why: item.memory.__fastSource === 'recent-tail' ? ['fast-index', 'recent-tail'] : ['fast-index'],
        observation: {
          id: item.memory.id || '',
          title: item.memory.title || '',
          type: item.memory.type || '',
          layer: item.memory.layer || '',
          importance: item.memory.importance || '',
          summary: item.memory.summary || summarizeMemoryContent(item.memory.content),
          files: item.memory.files || [],
          source: {
            kind: item.memory.source?.kind || item.memory.sourceKind || item.memory.__fastSource || 'am-vnext-index',
            path: item.memory.source?.path || item.memory.sourcePath || item.memory.__fastPath || indexPath,
          },
        },
      })),
    };
  } catch (error) {
    return recall(projectRoot, { query, limit, enhanced: false }).catch((fallbackError) => ({
      ok: false,
      query,
      error: fallbackError.message || error.message,
      results: [],
    }));
  }
}

async function readJsonFile(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function readTombstones(file) {
  const text = await fsp.readFile(file, 'utf8').catch(() => '');
  const tombstones = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (item?.targetId) tombstones.add(item.targetId);
    } catch {
      // Ignore malformed tombstone lines; recall can still use untombstoned records.
    }
  }
  return tombstones;
}

async function readRecentJsonlMemories(file, options = {}) {
  const maxRecords = Math.max(1, Math.min(Number(options.maxRecords || 80), 500));
  const maxBytes = Math.max(4096, Math.min(Number(options.maxBytes || 1024 * 1024), 8 * 1024 * 1024));
  const stat = await fsp.stat(file);
  if (!stat.size) return [];
  const bytesToRead = Math.min(stat.size, maxBytes);
  const start = Math.max(0, stat.size - bytesToRead);
  const handle = await fsp.open(file, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, start);
    let lines = buffer.toString('utf8', 0, bytesRead).split(/\r?\n/u).filter(Boolean);
    if (start > 0) lines = lines.slice(1);
    const records = [];
    for (const line of lines.slice(-maxRecords)) {
      try {
        const record = JSON.parse(line);
        if (record?.kind === 'memory') {
          records.push({ ...record, __fastSource: 'recent-tail', __fastPath: file });
        }
      } catch {
        // Ignore partial or malformed tail lines; the full store remains append-only.
      }
    }
    return records;
  } finally {
    await handle.close();
  }
}

function mergeMemoryCandidates(indexMemories, recentMemories) {
  const byId = new Map();
  const add = (memory, source) => {
    if (!memory) return;
    const id = String(memory.id || `${memory.title || ''}\n${memory.timestamp || ''}`).trim();
    if (!id) return;
    const candidate = { kind: 'memory', ...memory, __fastSource: memory.__fastSource || source };
    const existing = byId.get(id);
    if (!existing || candidate.__fastSource === 'recent-tail') {
      byId.set(id, candidate);
    }
  };
  for (const memory of indexMemories || []) add(memory, 'am-vnext-index');
  for (const memory of recentMemories || []) add(memory, 'recent-tail');
  return [...byId.values()];
}

function scoreFastMemory(memory, tokens, rawQuery = '') {
  const recommendation = String(memory.quality?.recommendation || '');
  if (/downrank|review_encoding/iu.test(recommendation)) return 0;
  if (/verify_first/iu.test(recommendation) && !isVerificationContextQuery(tokens)) return 0;
  if (isNeedsVerificationMemory(memory) && !isVerificationContextQuery(tokens)) return 0;
  if (memoryHasEncodingDamage(memory)) return 0;
  const type = String(memory.type || '');
  if (type === 'goal_lesson' && !isGoalContextQuery(tokens, memory)) return 0;
  if (type === 'conversation_archive' && !isHistoryContextQuery(tokens, rawQuery)) return 0;
  if (isAutoCloseoutType(type) && !isHistoryContextQuery(tokens, rawQuery)) return 0;
  if (isArchiveDerivedType(type) && !isHistoryContextQuery(tokens, rawQuery)) return 0;
  if (isStaleOperationalAccessNoise(memory, tokens, rawQuery)) return 0;
  if (!matchesExplicitProjectDomain(tokens, memory)) return 0;
  if (isDomainStrictMemory(memory) && hasForeignProjectDomainLeak(tokens, memory)) return 0;
  if (isProjectScopedMemory(memory) && requiresProjectAnchor(memory) && !hasProjectAnchorMatch(memory, tokens)) return 0;
  const concepts = (memory.concepts || []).join(' ');
  const files = (memory.files || []).join(' ');
  const sourceText = `${memory.sourcePath || ''} ${memory.source?.path || ''}`;
  const haystack = `${memory.title || ''} ${memory.summary || ''} ${memory.content || ''} ${concepts} ${files} ${sourceText} ${memory.type || ''} ${memory.layer || ''}`.toLowerCase();
  let score = 0;
  let matchedTokens = 0;
  for (const token of tokens) {
    if (textHasToken(haystack, token)) {
      score += 1;
      matchedTokens += 1;
    }
  }
  const specificMatches = countSpecificTokenMatches(haystack, tokens);
  if (specificMatches >= 3) score += 5;
  else if (specificMatches >= 2) score += 3;
  else if (specificMatches === 1 && tokens.filter(isSpecificRecallToken).length === 1) score += 1;
  const hasRuleSignal = /user-preference|workflow[-_]rule|obsidian|ccow|am-first|记忆|规则/iu.test(haystack);
  if (hasRuleSignal && matchedTokens >= 2) score += 2;
  else if (hasRuleSignal && matchedTokens >= 1) score += 1;
  if (memory.__fastSource === 'recent-tail') score += 1;
  if (/critical/iu.test(String(memory.importance || ''))) score += 2;
  if (/high/iu.test(String(memory.importance || ''))) score += 1;
  score += typePriority(type);
  if (isArchiveDerivedType(type) && !isHistoryContextQuery(tokens, rawQuery)) score -= 4;
  return score;
}

function typePriority(type) {
  if (/^(user_preference|project_rule|procedural_rule|workflow_rule)$/u.test(type)) return 4;
  if (/^(project_state|lesson|procedural_lesson|am_first_reflection)$/u.test(type)) return 2;
  if (/^(conversation_summary|consolidated_memory)$/u.test(type)) return -2;
  return 0;
}

function isAutoCloseoutType(type) {
  return type === 'am_first_finish_summary';
}

function isArchiveDerivedType(type) {
  return /^(conversation_summary|consolidated_memory)$/u.test(type);
}

function requiresProjectAnchor(memory = {}) {
  return /^(am_first_stage_summary|conversation_summary|consolidated_memory|am_first_finish_summary)$/u.test(String(memory.type || ''));
}

function memoryHasEncodingDamage(memory = {}) {
  return hasEncodingDamage(memory.title)
    || hasEncodingDamage(memory.summary)
    || hasEncodingDamage(memory.content);
}

function isGoalContextQuery(tokens, memory = {}) {
  const queryText = tokens.join(' ');
  if (/(^|\s)(goal|active-goal|goal_lesson|goal-status|goal-board|resume-packet|handoff|example-world|example-game|example-companion)(\s|$)|目标|恢复|继续上次|交接/iu.test(queryText)) {
    return true;
  }
  const projectText = `${memory.project || ''} ${(memory.files || []).join(' ')} ${memory.title || ''}`.toLowerCase();
  return tokens.some((token) => token.length >= 4 && /example-game|example-world|example-companion|example-service|payment|example-place|example-house/iu.test(token) && textHasToken(projectText, token));
}

function isHistoryContextQuery(tokens, rawQuery = '') {
  const queryText = ` ${tokens.join(' ')} ${String(rawQuery || '').toLowerCase()} `;
  return /(^|\s)(history|archive|conversation|session|handoff|resume|previous|last)(\s|$)|上次|历史|归档|对话|会话|交接|继续/iu.test(queryText);
}

function isOperationalAccessQuery(tokens = [], rawQuery = '') {
  const queryText = ` ${tokens.join(' ')} ${String(rawQuery || '').toLowerCase()} `;
  const hasAccessDetail = /(^|\s)(ssh|ip|port|username|user|password|credential|credentials|login|account|access)(\s|$)|端口|用户名|账号|账户|密码|凭据|登录|连接/iu.test(queryText);
  const hasTarget = /example-site|payment|example-service|example-user|103\.240|shop|服务器|主机|vps|server|host/iu.test(queryText);
  return hasAccessDetail && hasTarget;
}

function isOperationalAccessMemory(memory = {}) {
  const text = [
    memory.type,
    memory.title,
    ...(memory.concepts || []),
    ...(memory.files || []),
  ].join('\n').toLowerCase();
  return /server[-_\s]?access|ssh[-_\s]?access|server[-_\s]?credentials?|credentials?|login[-_\s]?(info|credentials?)|access[-_\s]?note|private[-_\s]?key|ssh[-_\s]?private[-_\s]?key|连接资料|登录资料|服务器资料|凭据|ssh\s*(私钥|密钥|private[-_\s]?key|key)|私钥路径|登录密钥|连接密钥|端口.*(用户名|账号|账户|密码)|username.*password|user.*password/iu.test(text);
}

function isStaleOperationalAccessNoise(memory = {}, tokens = [], rawQuery = '') {
  if (!isOperationalAccessQuery(tokens, rawQuery) || isHistoryContextQuery(tokens, rawQuery)) return false;
  if (isOperationalAccessMemory(memory)) return false;
  return true;
}

function isNeedsVerificationMemory(memory = {}) {
  return Boolean(memory.needsVerification || memory.needs_verification || isImplicitVerificationMemory(memory));
}

function isVerificationContextQuery(tokens = []) {
  const queryText = ` ${tokens.join(' ')} `;
  return /(^|\s)(draft|proposal|patch|pending|unverified|verify|verification|blocked|handoff|resume|partial)(\s|$)|待验证|未验证|未完成|未上线|预案|草案|补丁|阻塞|交接|恢复|继续|ssh\s+(blocked|pending|restore|resume|unverified)|ssh[-_\s]+blocked/iu.test(queryText);
}

function isImplicitVerificationMemory(memory = {}) {
  const type = String(memory.type || '');
  if (!/^(project_state|am_first_stage_summary|am_first_finish_summary)$/u.test(type)) return false;
  const text = [
    memory.title,
    memory.summary,
    memory.content,
  ].join('\n');
  return /待验证|未验证|未完成|未上线|未部署|待上线|预案|草案|管理通道不通|ssh\s+(blocked|pending|timeout|unreachable)|ssh[-_\s]+blocked|blocked by ssh|not deployed|not yet deployed|pending verification|pending fix|patch prepared|prepared but not deployed|draft patch/iu.test(text);
}

function isProjectScopedMemory(memory = {}) {
  return /^(project_state|project_rule|user_preference|procedural_rule|am_first_finish_summary|am_first_stage_summary|conversation_summary|consolidated_memory)$/u.test(String(memory.type || ''));
}

function isDomainStrictMemory(memory = {}) {
  return isProjectScopedMemory(memory)
    || String(memory.type || '') === 'goal_lesson'
    || String(memory.type || '') === 'conversation_archive'
    || String(memory.type || '') === 'workflow_pack'
    || String(memory.type || '') === 'reflection'
    || String(memory.type || '') === 'lesson'
    || String(memory.type || '') === 'procedural_lesson';
}

function matchesExplicitProjectDomain(tokens, memory = {}) {
  const domains = explicitProjectDomains(tokens);
  if (domains.length === 0) return true;
  const text = projectAnchorText(memory);
  return domains.some((domain) => domain.aliases.some((alias) => textHasToken(text, alias)));
}

function hasForeignProjectDomainLeak(tokens, memory = {}) {
  const queryDomains = explicitProjectDomains(tokens).map((domain) => domain.name);
  const memoryDomains = memoryProjectDomains(memory);
  return memoryDomains.some((domain) => !queryDomains.includes(domain));
}

function hasProjectAnchorMatch(memory = {}, tokens = []) {
  const text = projectAnchorText(memory);
  return tokens.some((token) => isSpecificRecallToken(token) && textHasToken(text, token));
}

function projectAnchorText(memory = {}) {
  const concepts = (memory.concepts || []).join(' ');
  return `${memory.id || ''} ${memory.title || ''} ${memory.project || ''} ${(memory.files || []).join(' ')} ${concepts}`.toLowerCase();
}

function explicitProjectDomains(tokens = []) {
  const domains = [
    { name: 'example-game', aliases: ['example-game', 'example-world', 'example-companion', 'example-companion-bridge', 'example-ai'] },
    { name: 'example-service', aliases: ['example-service', 'payment', 'example-site', 'example-shop', 'example-user'] },
    { name: 'example-place', aliases: ['example-place', 'example-house', 'godot', 'blender'] },
  ];
  return domains.filter((domain) => tokens.some((token) => domain.aliases.some((alias) => token === alias || token.includes(alias))));
}

function memoryProjectDomains(memory = {}) {
  const text = `${memory.title || ''} ${memory.summary || ''} ${memory.content || ''} ${memory.project || ''} ${(memory.files || []).join(' ')} ${(memory.concepts || []).join(' ')}`.toLowerCase();
  return explicitProjectDomains(text.split(/[^\p{L}\p{Nd}_-]+/u).filter(Boolean)).map((domain) => domain.name);
}

function isSpecificRecallToken(token) {
  const value = String(token || '').toLowerCase();
  if (value.length < 3) return false;
  const generic = new Set([
    'debug', 'issue', 'problem', 'fix', 'repair', 'review', 'audit', 'deploy', 'rule', 'rules',
    'frontend', 'backend', 'style', 'css', 'ui', 'api', 'page', 'view', 'component',
    '排查', '解决', '修复', '审计', '调试', '部署', '规划', '整理', '规则', '问题', '记录', '只读',
    'am', 'ccow', 'skill', '技能', 'obsidian', '黑曜石',
  ]);
  return !generic.has(value);
}

function countSpecificTokenMatches(text, tokens = []) {
  let count = 0;
  for (const token of tokens) {
    if (isSpecificRecallToken(token) && textHasToken(text, token)) {
      count += 1;
    }
  }
  return count;
}

function textHasToken(text, token) {
  const needle = String(token || '').toLowerCase();
  if (!needle) return false;
  if (/^[a-z0-9_-]+$/u.test(needle)) {
    return new RegExp(`(?<![a-z0-9_-])${escapeRegex(needle)}(?![a-z0-9_-])`, 'u').test(text);
  }
  return text.includes(needle);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function summarizeMemoryContent(content) {
  return String(content || '').replace(/\s+/gu, ' ').trim().slice(0, 420);
}

function tokenizeRecallQuery(query) {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', '你', '我', '去', '的', '了', '要', '用', '一下']);
  const text = String(query || '').toLowerCase();
  const tokens = text.split(/[^\p{L}\p{Nd}_-]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !stop.has(item));
  const phraseTokens = [
    [/记不住|忘记|记忆|回忆|召回|记住/iu, ['记不住', '记忆', '召回', 'am-recall-repair']],
    [/整理|修复|排查|解决/iu, ['整理', '修复']],
    [/用户偏好|偏好|规则|约束/iu, ['用户偏好', 'user-preference', '规则']],
    [/黑曜石|obsidian|ai问题|问题清单|解决记录/iu, ['obsidian', 'ai问题']],
    [/ccow|lw|w-lane|tw|subagent|worker/iu, ['ccow', 'lw']],
    [/\bam\b|agentmemory/iu, ['am', 'agentmemory']],
    [/skill|技能/iu, ['skill', '技能']],
  ];
  for (const [pattern, additions] of phraseTokens) {
    if (pattern.test(text)) tokens.push(...additions);
  }
  return [...new Set(tokens.filter((item) => item.length >= 2 && !stop.has(item)))];
}

function camel(value) {
  return String(value || '').replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function splitList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '')
    .split(/[,\n;]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bool(value) {
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|y|on)$/iu.test(String(value || ''));
}

function samePath(a, b) {
  const left = String(a || '').replace(/\\/g, '/').toLowerCase();
  const right = String(b || '').replace(/\\/g, '/').toLowerCase();
  return Boolean(left && right && left === right);
}

function unique(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))];
}

function summarizeStore(store) {
  return {
    ok: store.ok,
    projectRoot: store.projectRoot,
    counts: store.counts,
    latestArchive: store.latestArchive,
    portsRequired: false,
  };
}

function summarizeRecall(result) {
  return {
    ok: result.ok,
    query: result.query,
    returned: result.returned ?? result.results?.length ?? 0,
    results: (result.results || []).slice(0, 5).map((item) => ({
      id: item.observation?.id || item.id || '',
      title: item.observation?.title || item.title || '',
      type: item.observation?.type || item.type || '',
      score: item.score,
      why: item.why || [],
      summary: item.observation?.summary || item.summary || '',
      files: item.observation?.files || item.files || [],
    })),
  };
}

function summarizeHistory(history) {
  return {
    ok: history.ok,
    archives: (history.archives || []).slice(0, 5).map((item) => ({
      channel: item.channel,
      relativePath: item.relativePath,
      size: item.size,
    })),
    sessions: (history.sessions || []).slice(0, 5).map((item) => ({
      id: item.id,
      type: item.type,
      timestamp: item.timestamp,
      sessionId: item.sessionId,
    })),
  };
}

function summarizeGoal(goal) {
  if (!goal) return null;
  return {
    id: goal.id,
    status: goal.status,
    title: goal.title,
    objective: goal.objective,
    progressSummary: goal.progressSummary,
    nextActions: goal.nextActions || [],
  };
}

function summarizeGoalBoard(board) {
  return {
    ok: board.ok,
    summary: board.summary || null,
    goals: (board.goals || board.items || []).slice(0, 10).map(summarizeGoal),
  };
}

function summarizeProjectBoard(board) {
  return {
    ok: board.ok,
    summary: board.summary || null,
    projects: (board.projects || []).slice(0, 12).map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      assignedMemories: project.assignedMemories || project.memoryCount || project.count || 0,
    })),
    unassigned: board.unassigned?.count ?? null,
  };
}

function summarizeHealth(health, options = {}) {
  const storeEncodingWarnings = options.storeEncodingWarnings ?? null;
  const scannedEncodingWarnings = health.encodingWarnings?.length ?? null;
  return {
    ok: health.ok,
    generatedAt: health.generatedAt,
    summary: health.summary || null,
    encodingWarnings: scannedEncodingWarnings ?? storeEncodingWarnings,
    encodingWarningsSource: scannedEncodingWarnings === null ? 'store_status_or_cached_health' : 'health_scan',
    encodingWarningsScanned: scannedEncodingWarnings !== null,
    duplicateGroups: health.duplicateGroups?.length || health.duplicates?.length || 0,
    staleGoals: health.staleGoals?.length || 0,
    orphanResumePackets: health.orphanResumePackets?.length || 0,
    oversizedArchiveBacked: health.oversizedArchiveBacked?.length || 0,
    portsRequired: false,
  };
}

function summarizeCleanup(cleanup) {
  return {
    ok: cleanup.ok,
    dryRun: true,
    suggestions: (cleanup.suggestions || cleanup.actions || cleanup.items || []).slice(0, 12),
  };
}

function countByStatus(board, status) {
  const goals = board.goals || board.items || [];
  return goals.filter((goal) => goal?.status === status).length;
}

function buildVerificationQuery(summary, fallback) {
  return String(summary || fallback)
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160) || fallback;
}

function usage() {
  return [
    'am-first status --project-root <path>',
    'am-first start --project-root <path> --query <task>',
    'am-first stage --project-root <path> --summary <phase summary>',
    'am-first finish --project-root <path> --summary <final summary>',
    'am-first reflect --project-root <path> --summary <reusable lesson>',
    'am-first viewer --project-root <path>',
  ];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAmFirstCli()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(result.ok === false ? 1 : 0);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exit(1);
    });
}
