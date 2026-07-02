#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const STORE_VERSION = 1;

export function resolveProjectRoot(value) {
  const requested = String(value || process.env.AGENTMEMORY_PROJECT_ROOT || DEFAULT_PROJECT_ROOT);
  return path.resolve(requested);
}

export function storePaths(projectRoot) {
  const root = path.join(resolveProjectRoot(projectRoot), '.codex', 'memory', 'am');
  return {
    root,
    memories: path.join(root, 'memories.jsonl'),
    events: path.join(root, 'events.jsonl'),
    sessions: path.join(root, 'sessions.jsonl'),
    maintenance: path.join(root, 'maintenance.jsonl'),
    tombstones: path.join(root, 'tombstones.jsonl'),
    goals: path.join(root, 'goals.jsonl'),
    goalEvents: path.join(root, 'goal-events.jsonl'),
    goalHeartbeats: path.join(root, 'goal-heartbeats.jsonl'),
    goalWatchdog: path.join(root, 'goal-watchdog.jsonl'),
    goalResumePackets: path.join(root, 'goal-resume-packets.jsonl'),
    turnWatches: path.join(root, 'turn-watches.jsonl'),
    resumeAutomationRequests: path.join(root, 'resume-automation-requests.jsonl'),
    currentFactIndex: path.join(root, 'current_fact_index.json'),
    goalCompletions: path.join(root, 'goal-completions'),
  };
}

export async function ensureStore(projectRoot) {
  const paths = storePaths(projectRoot);
  await fsp.mkdir(paths.root, { recursive: true });
  const readme = path.join(paths.root, 'README.md');
  if (!fs.existsSync(readme)) {
    await fsp.writeFile(readme, [
      '# AM Local Memory Store',
      '',
      'Local, no-port memory store for Codex hooks and the agentmemory MCP key.',
      '',
      '- `memories.jsonl`: durable facts, summaries, reflections, project state, and reusable lessons.',
      '- `events.jsonl`: low-level hook events; not injected by default.',
      '- `sessions.jsonl`: session lifecycle records.',
      '- `maintenance.jsonl`: summarize/consolidate/reflect/diagnose runs.',
      '- `tombstones.jsonl`: non-destructive forget markers.',
      '- `goals.jsonl`: append-only AM goal snapshots.',
      '- `goal-events.jsonl`: append-only AM goal timeline events.',
      '- `goal-heartbeats.jsonl`: high-frequency participant work proofs.',
      '- `goal-watchdog.jsonl`: goal watchdog checks and stage reviews.',
      '- `goal-resume-packets.jsonl`: local resume packets for stale or incomplete work.',
      '- `turn-watches.jsonl`: local no-port turn watchdog lifecycle records.',
      '- `resume-automation-requests.jsonl`: one-shot app automation bridge requests.',
      '- `goal-completions/`: readable packets for completed goals.',
      '',
      'This directory is local runtime data, not a template asset.',
      '',
    ].join('\n'), 'utf8');
  }
  return paths;
}

export async function remember(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const damage = findEncodingDamage(input);
  if (damage.length && !allowsEncodingDamage(input)) {
    return {
      ok: false,
      error: 'encoding_damage_detected',
      message: 'Refused to write AM memory because the payload already contains high-confidence encoding damage. Use --payload-file/UTF-8 and re-read the source, or set metadata.allowEncodingDamageSample=true only for explicit diagnostic samples.',
      damage,
    };
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const content = firstString(input.content, input.text, input.narrative, input.summary, input.observation);
  if (!content.trim()) {
    return { ok: false, error: 'empty_content' };
  }
  const project = String(input.project || input.cwd || projectRoot || '').trim();
  const concepts = uniqueArray(input.concepts || input.tags || []);
  const files = uniqueArray(input.files || []);
  const layer = normalizeLayer(input.layer || input.type || 'semantic');
  const record = {
    id: input.id || buildId('mem', `${now}\n${content}\n${project}`),
    version: STORE_VERSION,
    timestamp: input.timestamp || now,
    kind: 'memory',
    layer,
    type: String(input.type || layer || 'memory'),
    title: firstString(input.title, titleFromText(content)),
    content,
    summary: firstString(input.summary, summarizeText(content, 420)),
    importance: normalizeImportance(input.importance),
    confidence: normalizeConfidence(input.confidence),
    reusable: input.reusable === undefined ? isReusable(input, content) : Boolean(input.reusable),
    needsVerification: Boolean(input.needsVerification || input.needs_verification),
    project,
    source: normalizeSource(input.source, input, projectRoot),
    concepts,
    files,
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.memories, record);
  const indexRefresh = await refreshCompactIndexAfterMutation(projectRoot, 'remember', { record });
  return { ok: true, record, indexRefresh };
}

export async function observe(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const damage = findEncodingDamage(input);
  if (damage.length && !allowsEncodingDamage(input)) {
    return writeMaintenance(projectRoot, {
      type: 'observe_encoding_damage_rejected',
      status: 'WARN',
      hookType: input.hookType || input.hook || 'unknown',
      sessionId: input.sessionId || input.session_id || 'unknown',
      damage,
    });
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const event = {
    id: input.id || buildId('evt', `${now}\n${JSON.stringify(input).slice(0, 2000)}`),
    version: STORE_VERSION,
    timestamp: input.timestamp || now,
    kind: 'event',
    hookType: input.hookType || input.hook || 'unknown',
    sessionId: input.sessionId || input.session_id || 'unknown',
    project: String(input.project || input.cwd || projectRoot || ''),
    data: input.data || input,
  };
  await appendJsonl(paths.events, event);
  return { ok: true, event };
}

export async function sessionEvent(projectRoot, type, input = {}) {
  const paths = await ensureStore(projectRoot);
  const damage = findEncodingDamage(input);
  if (damage.length && !allowsEncodingDamage(input)) {
    return writeMaintenance(projectRoot, {
      type: 'session_encoding_damage_rejected',
      status: 'WARN',
      sessionType: type,
      sessionId: input.sessionId || input.session_id || 'unknown',
      damage,
    });
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const event = {
    id: buildId('ses', `${now}\n${type}\n${JSON.stringify(input).slice(0, 1000)}`),
    version: STORE_VERSION,
    timestamp: now,
    kind: 'session',
    type,
    sessionId: input.sessionId || input.session_id || 'unknown',
    project: String(input.project || input.cwd || projectRoot || ''),
    data: input,
  };
  await appendJsonl(paths.sessions, event);
  return { ok: true, event };
}

export async function recall(projectRoot, options = {}) {
  if (options.enhanced === true) {
    try {
      const { enhancedRecall } = await import('./am-vnext.mjs');
      return await enhancedRecall(projectRoot, { ...options, enhanced: false });
    } catch {
      // Fall through to the legacy scorer if the vNext analyzer is unavailable.
    }
  }
  if (!boolArg(options.fullScan || options['full-scan'])) {
    const fast = await recallFast(projectRoot, options);
    const query = String(options.query || options.prompt || '').trim();
    const noFastHit = query && (!fast?.ok || !Array.isArray(fast.results) || fast.results.length === 0);
    if (!noFastHit) {
      return fast;
    }
    const full = await recallFullScan(projectRoot, options);
    return {
      ...full,
      mode: 'full-scan-fallback',
      fallbackFrom: fast?.mode || 'fast',
      fastTotal: fast?.total || 0,
    };
  }
  return recallFullScan(projectRoot, options);
}

async function recallFullScan(projectRoot, options = {}) {
  const limit = clampNumber(options.limit, 5, 1, 50);
  const query = String(options.query || options.prompt || '').trim();
  const paths = await ensureStore(projectRoot);
  const tombstones = await readTombstones(paths.tombstones);
  const currentFacts = await readJsonFileIfExists(paths.currentFactIndex);
  const supersededIds = currentFactSupersededIdSet(currentFacts);
  const showSuperseded = isHistoryContextQuery(tokenize(query), query);
  const scored = [];
  let total = 0;
  await scanJsonl(paths.memories, (record) => {
    if (record?.kind !== 'memory' || tombstones.has(record.id)) return;
    if (!showSuperseded && supersededIds.has(String(record.id || ''))) return;
    total += 1;
    const score = scoreRecord(record, query);
    if (score <= 0 && query) return;
    scored.push({ record, score });
    scored.sort(compareScoredRecords);
    if (scored.length > limit) scored.length = limit;
  });
  return {
    ok: true,
    query,
    mode: 'full-scan',
    total,
    results: scored.map(({ record, score }) => ({
      score: Number(score.toFixed(4)),
      observation: compactRecalledRecord(record),
    })),
  };
}

async function recallFast(projectRoot, options = {}) {
  const limit = clampNumber(options.limit, 5, 1, 50);
  const query = String(options.query || options.prompt || '').trim();
  const paths = await ensureStore(projectRoot);
  const indexPath = path.join(paths.root, 'am-vnext-index.json');
  const tombstones = await readTombstones(paths.tombstones);
  const [index, recentMemories, currentFacts] = await Promise.all([
    readJsonFileIfExists(indexPath),
    readRecentJsonlMemories(paths.memories, { maxRecords: 160, maxBytes: 2 * 1024 * 1024 }).catch(() => []),
    readJsonFileIfExists(paths.currentFactIndex),
  ]);
  const supersededIds = currentFactSupersededIdSet(currentFacts);
  const showSuperseded = isHistoryContextQuery(tokenize(query), query);
  const candidates = mergeMemoryCandidates(index?.memories || [], recentMemories);
  const scored = [];
  for (const record of candidates) {
    if (!isMemoryLikeRecord(record) || tombstones.has(record.id)) continue;
    if (!showSuperseded && supersededIds.has(String(record.id || ''))) continue;
    const score = scoreRecord(record, query);
    if (score <= 0 && query) continue;
    scored.push({ record, score });
    scored.sort(compareScoredRecords);
    if (scored.length > limit) scored.length = limit;
  }
  if (!index && recentMemories.length === 0) {
    return {
      ok: false,
      query,
      mode: 'fast',
      error: 'fast recall sources unavailable',
      hint: 'Run memory-index first or use --full-scan true for an explicit full memories.jsonl scan.',
      total: 0,
      results: [],
    };
  }
  return {
    ok: true,
    query,
    mode: 'fast',
    source: recentMemories.length > 0 ? 'am-vnext-index+recent-tail' : 'am-vnext-index',
    total: candidates.length,
    results: scored.map(({ record, score }) => ({
      score: Number(score.toFixed(4)),
      observation: stripFastInternalFields(record),
    })),
  };
}

export async function memoryIndex(projectRoot, options = {}) {
  const { buildMemoryIndex } = await import('./am-vnext.mjs');
  return buildMemoryIndex(projectRoot, options);
}

export async function memoryHealth(projectRoot, options = {}) {
  if (!boolArg(options.full || options.deep || options.vnext)) {
    const result = await diagnose(projectRoot);
    return {
      ok: result.ok !== false,
      mode: 'streaming-diagnose',
      projectRoot: result.projectRoot,
      store: result.store,
      portsRequired: false,
      counts: {
        memories: result.counts?.memories || 0,
        rawMemories: result.counts?.memories || 0,
        archives: result.counts?.archives || 0,
        encodingWarnings: result.counts?.encodingWarnings || 0,
        parseErrors: null,
        duplicateGroups: null,
        orphanResumePackets: null,
        staleGoals: null,
        oversizedArchiveBacked: null,
        coveredMemories: null,
      },
      encodingWarnings: [],
      duplicateGroups: [],
      orphanResumePackets: [],
      staleGoals: [],
      oversizedArchiveBacked: [],
      coveredMemories: [],
      recommendations: [
        'Streaming AM health checked counts and encoding warnings without loading full memory records. Use --full true only for explicit deep vNext health analysis.',
      ],
      latestArchive: result.latestArchive,
    };
  }
  const { buildHealthReport } = await import('./am-vnext.mjs');
  return buildHealthReport(projectRoot, options);
}

export async function memoryCleanupDryRun(projectRoot, options = {}) {
  const { cleanupDryRun } = await import('./am-vnext.mjs');
  return cleanupDryRun(projectRoot, options);
}

async function refreshCompactIndexAfterMutation(projectRoot, reason, options = {}) {
  try {
    const paths = storePaths(projectRoot);
    const indexPath = path.join(paths.root, 'am-vnext-index.json');
    const index = await readJsonFileIfExists(indexPath);
    if (!index) {
      return { ok: false, reason, skipped: true, error: 'index_missing' };
    }
    let memories = Array.isArray(index.memories) ? index.memories : [];
    if (reason === 'remember' && options.record) {
      const compactRecord = compactMemoryForIndex(options.record);
      memories = [compactRecord, ...memories.filter((memory) => memory?.id !== compactRecord.id)];
    } else if (reason === 'forget' && options.targetId) {
      memories = memories.filter((memory) => memory?.id !== options.targetId);
    }
    const compact = {
      ...index,
      generatedAt: new Date().toISOString(),
      memories: selectCompactIndexMemories(memories, 1000),
    };
    await writeJsonFile(indexPath, compact);
    await writeJsonFile(paths.currentFactIndex, buildCurrentFactIndex(compact.memories));
    return { ok: true, reason, indexedMemories: compact.memories.length };
  } catch (error) {
    return {
      ok: false,
      reason,
      error: error?.message || String(error),
    };
  }
}

export async function memoryGoalBoard(projectRoot, options = {}) {
  const { buildGoalBoard } = await import('./am-vnext.mjs');
  return buildGoalBoard(projectRoot, options);
}

export async function memoryProjectBoard(projectRoot, options = {}) {
  const { buildProjectBoard } = await import('./am-vnext.mjs');
  return buildProjectBoard(projectRoot, options);
}

export async function sessionHistory(projectRoot, options = {}) {
  const limit = clampNumber(options.limit, 5, 1, 50);
  const archives = await listArchives(projectRoot, limit);
  const sessions = (await readJsonl(storePaths(projectRoot).sessions)).slice(-limit).reverse();
  return { ok: true, archives, sessions };
}

export async function summarizeLatestArchive(projectRoot, options = {}) {
  const latest = (await listArchives(projectRoot, 1))[0];
  if (!latest) {
    return { ok: false, error: 'no_archive' };
  }
  const text = await fsp.readFile(latest.path, 'utf8');
  const sessionId = options.sessionId || extractLine(text, /^- Session:\s*(.+)$/imu) || 'unknown';
  const content = [
    `Conversation summary for session ${sessionId}.`,
    `Source archive: ${toRel(projectRoot, latest.path)}`,
    '',
    archiveToSummary(text),
  ].join('\n');
  const result = await remember(projectRoot, {
    content,
    title: `Conversation summary ${sessionId}`,
    type: 'conversation_summary',
    layer: 'episodic',
    importance: 'normal',
    project: projectRoot,
    concepts: ['conversation-summary', 'AM', 'codex-session'],
    files: [toRel(projectRoot, latest.path)],
    source: { kind: 'conversation_archive', path: toRel(projectRoot, latest.path), sessionId },
  });
  return { ok: result.ok, sourceArchive: toRel(projectRoot, latest.path), result };
}

export async function consolidate(projectRoot, options = {}) {
  const limit = clampNumber(options.limit, 5, 1, 20);
  const archives = await listArchives(projectRoot, limit);
  const created = [];
  for (const archive of archives) {
    const text = await fsp.readFile(archive.path, 'utf8').catch(() => '');
    const facts = extractHighSignalLines(text);
    if (facts.length === 0) {
      continue;
    }
    const result = await remember(projectRoot, {
      content: [
        'Consolidated project/user memory extracted from conversation archive.',
        `Source archive: ${toRel(projectRoot, archive.path)}`,
        '',
        ...facts.map((line) => `- ${line}`),
      ].join('\n'),
      title: `Consolidated memory from ${path.basename(archive.path)}`,
      type: 'consolidated_memory',
      layer: 'semantic',
      importance: 'high',
      project: projectRoot,
      concepts: ['consolidated-memory', 'user-preference', 'project-state'],
      files: [toRel(projectRoot, archive.path)],
      reusable: true,
      source: { kind: 'conversation_archive', path: toRel(projectRoot, archive.path) },
    });
    if (result.ok) {
      created.push(result.record.id);
    }
  }
  return { ok: true, created: created.length, ids: created };
}

export async function reflect(projectRoot, options = {}) {
  const limit = clampNumber(options.limit || options.maxClusters, 5, 1, 20);
  const archives = await listArchives(projectRoot, limit);
  const lessons = [];
  for (const archive of archives) {
    const text = await fsp.readFile(archive.path, 'utf8').catch(() => '');
    lessons.push(...extractLessons(text));
  }
  const uniqueLessons = uniqueArray(lessons).slice(0, 12);
  if (uniqueLessons.length === 0) {
    return { ok: true, created: 0, message: 'no_lessons_extracted' };
  }
  const result = await remember(projectRoot, {
    content: [
      'AM reflection and reusable work rules.',
      '',
      ...uniqueLessons.map((line) => `- ${line}`),
    ].join('\n'),
    title: 'AM reflection and reusable work rules',
    type: 'reflection',
    layer: 'procedural',
    importance: 'high',
    project: projectRoot,
    concepts: ['reflection', 'lesson', 'workflow-rule', 'AM'],
    reusable: true,
    source: { kind: 'local_reflection', archives: archives.map((item) => toRel(projectRoot, item.path)) },
  });
  return { ok: result.ok, created: result.ok ? 1 : 0, result };
}

export async function diagnose(projectRoot) {
  const paths = await ensureStore(projectRoot);
  const [memoryStats, eventStats, sessionStats, maintenanceStats, goalStats, goalEventStats, archives] = await Promise.all([
    scanJsonlStats(paths.memories, { checkEncoding: true }),
    scanJsonlStats(paths.events, { checkEncoding: true }),
    scanJsonlStats(paths.sessions, { checkEncoding: true }),
    scanJsonlStats(paths.maintenance, { checkEncoding: true }),
    scanJsonlStats(paths.goals, { checkEncoding: true }),
    scanJsonlStats(paths.goalEvents, { checkEncoding: true }),
    listArchives(projectRoot, 1000),
  ]);
  const encodingByFile = {
    memories: memoryStats.encodingWarnings,
    events: eventStats.encodingWarnings,
    sessions: sessionStats.encodingWarnings,
    maintenance: maintenanceStats.encodingWarnings,
    goals: goalStats.encodingWarnings,
    goalEvents: goalEventStats.encodingWarnings,
  };
  const result = {
    ok: true,
    projectRoot: resolveProjectRoot(projectRoot),
    store: paths.root,
    counts: {
      memories: memoryStats.count,
      events: eventStats.count,
      sessions: sessionStats.count,
      archives: archives.length,
      maintenance: maintenanceStats.count,
      goals: goalStats.count,
      goalEvents: goalEventStats.count,
      encodingWarnings: Object.values(encodingByFile).reduce((sum, value) => sum + value, 0),
      encodingWarningsByFile: encodingByFile,
    },
    latestArchive: archives[0]?.relativePath || null,
    portsRequired: false,
  };
  await appendJsonl(paths.maintenance, {
    id: buildId('mnt', `${Date.now()}\n${JSON.stringify(result)}`),
    timestamp: new Date().toISOString(),
    kind: 'maintenance',
    type: 'diagnose',
    status: result.ok ? 'PASS' : 'WARN',
    result,
  });
  return result;
}

export async function forget(projectRoot, options = {}) {
  const paths = await ensureStore(projectRoot);
  const id = String(options.id || '').trim();
  const query = String(options.query || '').trim();
  const tombstone = {
    id: buildId('forget', `${Date.now()}\n${id}\n${query}`),
    timestamp: new Date().toISOString(),
    targetId: id || null,
    query: query || null,
    reason: String(options.reason || 'user_requested_forget'),
  };
  await appendJsonl(paths.tombstones, tombstone);
  const indexRefresh = await refreshCompactIndexAfterMutation(projectRoot, 'forget', { targetId: id });
  return { ok: true, tombstone, indexRefresh };
}

export async function goalStart(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const project = resolveProjectRoot(input.projectRoot || input.project || input.cwd || projectRoot);
  const objective = firstString(input.objective, input.content, input.prompt, input.title);
  if (!objective.trim()) {
    return { ok: false, error: 'empty_objective' };
  }
  const activeGoals = (await goalList(projectRoot, { status: 'active', projectRoot: project, limit: 50 })).goals;
  const paused = [];
  for (const goal of activeGoals) {
    const pausedGoal = {
      ...goal,
      status: 'paused',
      updatedAt: now,
      progressSummary: goal.progressSummary || 'Paused because a new active goal was started.',
      metadata: {
        ...goal.metadata,
        pausedBy: 'goal_start',
      },
    };
    await appendJsonl(paths.goals, pausedGoal);
    await appendGoalEvent(paths, {
      goalId: goal.id,
      eventType: 'paused',
      summary: `Paused because new goal started: ${summarizeText(objective, 180)}`,
      projectRoot: project,
      timestamp: now,
      actor: 'codex',
      evidenceRefs: [],
      archiveRefs: [],
    });
    paused.push(goal.id);
  }

  const goal = {
    id: input.id || buildId('goal', `${now}\n${project}\n${objective}`),
    version: STORE_VERSION,
    kind: 'goal',
    status: normalizeGoalStatus(input.status || 'active', 'active'),
    title: firstString(input.title, titleFromText(objective)),
    objective,
    successCriteria: normalizeStringList(input.successCriteria || input.criteria, [
      'Keep the original objective intact across turns.',
      'Record meaningful progress with evidence.',
      'Verify all success criteria before marking complete.',
    ]),
    projectRoot: project,
    createdAt: input.createdAt || now,
    updatedAt: now,
    progressSummary: firstString(input.progressSummary, 'Goal created; no checkpoint yet.'),
    nextActions: normalizeStringList(input.nextActions, ['Work toward the objective and record the next substantive checkpoint.']),
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
    completion: null,
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.goals, goal);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'created',
    summary: goal.progressSummary,
    projectRoot: project,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: goal.evidenceRefs,
    archiveRefs: goal.archiveRefs,
  });
  return { ok: true, goal, paused };
}

export async function goalStatus(projectRoot, options = {}) {
  const goals = (await goalList(projectRoot, { limit: 200, projectRoot: options.projectRoot || options.project })).goals;
  const goalId = String(options.id || options.goalId || '').trim();
  const selected = goalId ? goals.find((goal) => goal.id === goalId) || null : null;
  const activeGoal = selected || goals.find((goal) => goal.status === 'active') || null;
  const latestCompleted = goals.find((goal) => goal.status === 'completed') || null;
  const blockedGoals = goals.filter((goal) => goal.status === 'blocked').slice(0, 5);
  const events = activeGoal ? await goalEvents(projectRoot, { goalId: activeGoal.id, limit: 20 }) : { ok: true, events: [] };
  return {
    ok: true,
    activeGoal,
    selectedGoal: selected,
    latestCompleted,
    blockedGoals,
    recentGoals: goals.slice(0, 10),
    events: events.events,
  };
}

export async function goalCheckpoint(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const now = new Date().toISOString();
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const archiveRefs = mergeRefs(goal.archiveRefs, normalizeRefs(input.archiveRefs));
  const evidenceRefs = mergeRefs(goal.evidenceRefs, normalizeRefs(input.evidenceRefs || input.files));
  const updatedGoal = {
    ...goal,
    status: normalizeGoalStatus(input.status || goal.status, goal.status),
    updatedAt: now,
    progressSummary: firstString(input.progressSummary, input.summary, input.content, goal.progressSummary),
    nextActions: normalizeStringList(input.nextActions, goal.nextActions || []),
    evidenceRefs,
    archiveRefs,
  };
  await appendJsonl(paths.goals, updatedGoal);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: input.eventType || 'checkpoint',
    summary: updatedGoal.progressSummary,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
  });
  return { ok: true, goal: updatedGoal };
}

export async function goalComplete(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const now = new Date().toISOString();
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const verificationSummary = firstString(input.verificationSummary, input.summary, input.content);
  const evidenceRefs = mergeRefs(goal.evidenceRefs, normalizeRefs(input.evidenceRefs || input.files));
  const archiveRefs = mergeRefs(goal.archiveRefs, normalizeRefs(input.archiveRefs));
  if (!verificationSummary.trim() && evidenceRefs.length === 0 && archiveRefs.length === 0) {
    return { ok: false, error: 'insufficient_completion_evidence' };
  }
  const audit = input.audit || await latestCompletionAudit(paths, goal.id);
  if (!audit || audit.status !== 'PASS') {
    const missingCriteria = audit?.missingCriteria || (goal.successCriteria || []);
    const rejectedEvent = await appendGoalEvent(paths, {
      goalId: goal.id,
      eventType: 'completion_rejected',
      summary: `Completion rejected; ${missingCriteria.length} success criteria still need PASS evidence.`,
      projectRoot: goal.projectRoot,
      sessionId: input.sessionId || input.session_id || '',
      timestamp: now,
      actor: 'codex',
      evidenceRefs,
      archiveRefs,
      metadata: { missingCriteria },
    });
    const resumePacket = await goalResumePacket(projectRoot, {
      goalId: goal.id,
      reason: 'completion_audit_missing_or_failed',
      missing: missingCriteria,
      nextActions: [
        'Continue the active goal instead of marking it complete.',
        'Collect evidence for every missing success criterion.',
        'Run goal_completion_audit again before calling goal_complete.',
      ],
      evidenceRefs,
      archiveRefs,
    });
    return {
      ok: false,
      error: 'completion_audit_required',
      missingCriteria,
      audit: audit || null,
      rejectedEvent,
      resumePacket: resumePacket.packet,
    };
  }
  const completedEvent = await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'completed',
    summary: verificationSummary || 'Goal completed with recorded evidence.',
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs,
    archiveRefs,
  });
  const completionPacket = await writeCompletionPacket(projectRoot, {
    goal: {
      ...goal,
      status: 'completed',
      updatedAt: now,
      progressSummary: verificationSummary || goal.progressSummary,
      evidenceRefs,
      archiveRefs,
    },
    verificationSummary,
    audit,
  });
  const memory = await remember(projectRoot, {
    title: `Completed AM goal: ${goal.title}`,
    content: [
      `Completed AM goal: ${goal.title}`,
      '',
      `Objective: ${goal.objective}`,
      '',
      `Verification: ${verificationSummary || 'Completion evidence recorded.'}`,
      '',
      `Completion packet: ${completionPacket.relativeDir}`,
    ].join('\n'),
    type: 'goal_completion',
    layer: 'episodic',
    importance: 'high',
    reusable: true,
    concepts: ['AM', 'goal', 'goal-completion'],
    files: [completionPacket.relativeDir, ...archiveRefs.map((ref) => ref.path || ref.url || ref.summary || '').filter(Boolean)],
    source: { kind: 'goal_completion', goalId: goal.id, path: completionPacket.relativeDir },
  });
  const completedGoal = {
    ...goal,
    status: 'completed',
    updatedAt: now,
    progressSummary: verificationSummary || goal.progressSummary,
    evidenceRefs,
    archiveRefs,
    completion: {
      completedAt: now,
      verificationSummary,
      packetPath: completionPacket.relativeDir,
      memoryId: memory.record?.id || null,
      eventId: completedEvent.id,
    },
  };
  await appendJsonl(paths.goals, completedGoal);
  return { ok: true, goal: completedGoal, completionPacket, memoryId: memory.record?.id || null };
}

export async function goalBlock(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const now = new Date().toISOString();
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const blocker = firstString(input.blocker, input.reason, input.summary, input.content, 'blocked');
  const blockerKey = summarizeText(blocker.toLowerCase(), 180);
  const existing = (await goalEvents(projectRoot, { goalId: goal.id, limit: 100 })).events
    .filter((event) => event.eventType === 'blocker' && event.blockerKey === blockerKey);
  const attempts = existing.length + 1;
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'blocker',
    summary: blocker,
    blockerKey,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
  });
  if (attempts < 3) {
    return { ok: true, blocked: false, attempts, requiredAttempts: 3, goal };
  }
  const blockedGoal = {
    ...goal,
    status: 'blocked',
    updatedAt: now,
    progressSummary: blocker,
    nextActions: normalizeStringList(input.nextActions, ['Resolve the blocker before resuming this goal.']),
  };
  await appendJsonl(paths.goals, blockedGoal);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'blocked',
    summary: blocker,
    blockerKey,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
  });
  return { ok: true, blocked: true, attempts, goal: blockedGoal };
}

export async function goalList(projectRoot, options = {}) {
  const paths = await ensureStore(projectRoot);
  const limit = clampNumber(options.limit, 20, 1, 200);
  const requestedProject = options.projectRoot || options.project ? resolveProjectRoot(options.projectRoot || options.project) : '';
  const status = String(options.status || '').trim().toLowerCase();
  const snapshots = (await readJsonl(paths.goals)).filter((record) => record?.kind === 'goal');
  const latestById = new Map();
  for (const goal of snapshots) {
    const existing = latestById.get(goal.id);
    if (!existing || String(goal.updatedAt || goal.createdAt || '').localeCompare(String(existing.updatedAt || existing.createdAt || '')) >= 0) {
      latestById.set(goal.id, goal);
    }
  }
  let goals = [...latestById.values()]
    .filter((goal) => !requestedProject || sameProject(goal.projectRoot, requestedProject))
    .filter((goal) => !status || goal.status === status)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  goals = goals.slice(0, limit);
  return { ok: true, total: latestById.size, goals };
}

export async function goalEvents(projectRoot, options = {}) {
  const paths = await ensureStore(projectRoot);
  const limit = clampNumber(options.limit, 50, 1, 500);
  const goalId = String(options.goalId || options.id || '').trim();
  const events = (await readJsonl(paths.goalEvents))
    .filter((event) => event?.kind === 'goal_event')
    .filter((event) => !goalId || event.goalId === goalId)
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, limit);
  return { ok: true, events };
}

export async function goalParticipantRegister(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const participantId = firstString(input.participantId, input.id, input.name, input.worker, `participant-${buildId('p', now).slice(-6)}`);
  const record = {
    id: buildId('goal_hb', `${now}\n${goal.id}\n${participantId}\nregister`),
    version: STORE_VERSION,
    kind: 'goal_heartbeat',
    eventType: 'registered',
    timestamp: now,
    goalId: goal.id,
    participantId,
    participantKind: firstString(input.kind, input.participantKind, 'process'),
    pid: input.pid === undefined || input.pid === null || input.pid === '' ? null : Number(input.pid),
    taskId: firstString(input.taskId, input.task, ''),
    expectedHeartbeatSeconds: clampNumber(input.expectedHeartbeatSeconds || input.expectedSeconds, 30, 5, 3600),
    status: firstString(input.status, 'registered'),
    lastProof: firstString(input.lastProof, input.proof, input.summary, 'participant registered'),
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.goalHeartbeats, record);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'participant_registered',
    summary: `${participantId} registered for ${goal.title}`,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: record.evidenceRefs,
    archiveRefs: [],
    metadata: { participantId, participantKind: record.participantKind, taskId: record.taskId },
  });
  return { ok: true, participant: record, goalId: goal.id };
}

export async function goalHeartbeat(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const participantId = firstString(input.participantId, input.id, input.name, input.worker, 'codex');
  const record = {
    id: buildId('goal_hb', `${now}\n${goal.id}\n${participantId}\nheartbeat`),
    version: STORE_VERSION,
    kind: 'goal_heartbeat',
    eventType: 'heartbeat',
    timestamp: now,
    goalId: goal.id,
    participantId,
    participantKind: firstString(input.kind, input.participantKind, 'process'),
    pid: input.pid === undefined || input.pid === null || input.pid === '' ? null : Number(input.pid),
    taskId: firstString(input.taskId, input.task, ''),
    expectedHeartbeatSeconds: clampNumber(input.expectedHeartbeatSeconds || input.expectedSeconds, 30, 5, 3600),
    status: firstString(input.status, 'working'),
    lastProof: firstString(input.lastProof, input.proof, input.summary, 'still working'),
    claimsComplete: Boolean(input.claimsComplete || input.completed || input.done),
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.goalHeartbeats, record);
  if (['released', 'recovered', 'completed', 'done'].includes(String(record.status || '').toLowerCase())) {
    await goalResumePacketResolve(projectRoot, {
      goalId: goal.id,
      participantId,
      taskId: record.taskId,
      reason: `participant_${record.status}`,
      resolvedBy: participantId,
    });
  }
  return { ok: true, heartbeat: record };
}

export async function goalParticipantRelease(projectRoot, input = {}) {
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const result = await goalHeartbeat(projectRoot, {
    ...input,
    goalId: goal.id,
    status: 'released',
    lastProof: firstString(input.lastProof, input.proof, input.summary, 'participant released normally'),
  });
  return { ok: true, release: result.heartbeat };
}

export async function goalWatchdogCheck(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const focusParticipantId = firstString(input.focusParticipantId, input.participantId, '');
  const focusTaskId = firstString(input.focusTaskId, input.taskId, '');
  const allParticipants = await latestGoalParticipants(paths, goal.id);
  const participants = focusParticipantId
    ? allParticipants.filter((participant) => participant.participantId === focusParticipantId
      && (!focusTaskId || participant.taskId === focusTaskId))
    : allParticipants;
  const stale = [];
  const completeClaims = [];
  const warnings = [];
  for (const participant of participants) {
    const participantStatus = String(participant.status || '').toLowerCase();
    if (['released', 'recovered', 'cancelled', 'canceled', 'idle'].includes(participantStatus)) {
      continue;
    }
    const expected = clampNumber(participant.expectedHeartbeatSeconds, 30, 5, 3600);
    const ageSeconds = secondsSince(participant.timestamp);
    const explicitStale = ['stale', 'request_pending'].includes(participantStatus);
    const processMissing = participant.pid ? !processExists(participant.pid) : false;
    if (explicitStale || ageSeconds > expected || processMissing) {
      const reportedAgeSeconds = clampNumber(participant.metadata?.staleAgeSeconds, ageSeconds, 0, 31536000);
      const incidentKey = buildIncidentKey(goal.id, participant, processMissing ? 'process_missing' : 'stale_participant');
      stale.push({
        participantId: participant.participantId,
        taskId: participant.taskId,
        ageSeconds: reportedAgeSeconds,
        expectedHeartbeatSeconds: expected,
        processMissing,
        lastProof: participant.lastProof,
        incidentKey,
      });
    }
    if (participant.claimsComplete || /complete|completed|done|完成/iu.test(participant.status || '')) {
      completeClaims.push(participant);
    }
  }
  let completionAudit = null;
  if (completeClaims.length > 0 || input.auditCompletion === true) {
    completionAudit = await goalCompletionAudit(projectRoot, {
      goalId: goal.id,
      summary: input.summary || 'Watchdog completion audit',
      evidenceRefs: input.evidenceRefs || [],
    });
    if (completionAudit.status !== 'PASS') {
      warnings.push('A participant claimed completion, but success criteria are not fully PASS.');
    }
  }
  const resumeNeeded = stale.length > 0 || warnings.length > 0 || completionAudit?.status === 'FAIL' || completionAudit?.status === 'WARN';
  let resumePacket = null;
  if (resumeNeeded) {
    const incidentKey = stale[0]?.incidentKey || buildIncidentKey(goal.id, {
      participantId: completeClaims[0]?.participantId || 'completion',
      taskId: completeClaims[0]?.taskId || '',
    }, 'completion_audit_incomplete');
    const existingPacket = await latestOpenResumePacket(paths, goal.id, incidentKey);
    resumePacket = await goalResumePacket(projectRoot, {
      goalId: goal.id,
      reason: stale.length ? 'stale_participant' : 'completion_audit_incomplete',
      incidentKey,
      resumeTrigger: firstString(input.resumeTrigger, stale.length ? 'stale_participant' : 'completion_audit_incomplete'),
      missing: [
        ...stale.map((item) => `${item.participantId} stale for ${Math.round(item.ageSeconds)}s${item.processMissing ? ' and process is missing' : ''}`),
        ...warnings,
        ...(completionAudit?.missingCriteria || []),
      ],
      nextActions: buildResumeActions(goal, stale, completionAudit),
      evidenceRefs: input.evidenceRefs || [],
      existingPacket,
    });
  }
  const record = {
    id: buildId('goal_watchdog', `${now}\n${goal.id}\n${JSON.stringify(stale).slice(0, 1000)}`),
    version: STORE_VERSION,
    kind: 'goal_watchdog',
    type: 'watchdog_check',
    timestamp: now,
    goalId: goal.id,
    status: resumeNeeded ? 'WARN' : 'PASS',
    participants,
    stale,
    warnings,
    completionAudit: completionAudit ? summarizeAudit(completionAudit) : null,
    resumePacketId: resumePacket?.packet?.id || '',
    resumePacketReused: Boolean(resumePacket?.reused),
  };
  await appendJsonl(paths.goalWatchdog, record);
  if (resumeNeeded) {
    await appendGoalEvent(paths, {
      goalId: goal.id,
      eventType: 'watchdog_resume_needed',
      summary: resumePacket?.packet?.instruction || 'Goal watchdog found stale or incomplete work.',
      projectRoot: goal.projectRoot,
      sessionId: input.sessionId || input.session_id || '',
      timestamp: now,
      actor: 'codex',
      evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
      archiveRefs: normalizeRefs(input.archiveRefs),
      metadata: { resumePacketId: resumePacket?.packet?.id || '', staleCount: stale.length },
    });
  }
  return { ok: true, status: record.status, goal, participants, stale, warnings, completionAudit, resumePacket: resumePacket?.packet || null, record };
}

export async function goalStageReview(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const recentEvents = (await goalEvents(projectRoot, { goalId: goal.id, limit: 12 })).events.reverse();
  const summary = firstString(input.summary, inferStageSummary(goal, recentEvents));
  const drift = detectGoalDrift(goal, summary);
  const lessons = normalizeStringList(input.lessons, inferGoalLessons(goal, recentEvents));
  const record = {
    id: buildId('goal_watchdog', `${now}\n${goal.id}\nstage_review`),
    version: STORE_VERSION,
    kind: 'goal_watchdog',
    type: 'stage_review',
    timestamp: now,
    goalId: goal.id,
    status: drift.length ? 'WARN' : 'PASS',
    summary,
    drift,
    nextActions: normalizeStringList(input.nextActions, goal.nextActions || []),
    lessons,
  };
  await appendJsonl(paths.goalWatchdog, record);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'stage_review',
    summary,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
    metadata: { status: record.status, drift },
  });
  if (lessons.length > 0) {
    await remember(projectRoot, {
      title: `Goal lesson: ${goal.title}`,
      content: ['Goal stage review reusable lessons.', '', ...lessons.map((lesson) => `- ${lesson}`)].join('\n'),
      type: 'goal_lesson',
      layer: 'procedural',
      importance: drift.length ? 'high' : 'normal',
      project: goal.projectRoot,
      reusable: true,
      concepts: ['AM', 'goal', 'goal_lesson', 'workflow-rule'],
      source: { kind: 'goal_stage_review', goalId: goal.id, watchdogId: record.id },
    });
  }
  return { ok: true, review: record };
}

export async function goalCompletionAudit(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const evidenceRefs = mergeRefs(goal.evidenceRefs, normalizeRefs(input.evidenceRefs || input.files));
  const summaryText = [
    input.summary,
    input.verificationSummary,
    goal.progressSummary,
    ...evidenceRefs.map((ref) => `${ref.kind || ''} ${ref.path || ''} ${ref.summary || ''}`),
  ].filter(Boolean).join('\n');
  const criteria = (goal.successCriteria || []).map((criterion) => {
    const matchedRefs = evidenceRefs.filter((ref) => refMatchesCriterion(ref, criterion));
    const textMatch = criterionTextSatisfied(summaryText, criterion);
    const status = matchedRefs.length > 0 || textMatch ? 'PASS' : 'MISSING';
    return {
      criterion,
      status,
      evidenceRefs: matchedRefs,
      note: status === 'PASS' ? 'Evidence or verification text found.' : 'No direct evidence found for this criterion.',
    };
  });
  const missingCriteria = criteria.filter((item) => item.status !== 'PASS').map((item) => item.criterion);
  const status = missingCriteria.length === 0 ? 'PASS' : 'FAIL';
  const record = {
    id: buildId('goal_watchdog', `${now}\n${goal.id}\ncompletion_audit`),
    version: STORE_VERSION,
    kind: 'goal_watchdog',
    type: 'completion_audit',
    timestamp: now,
    goalId: goal.id,
    status,
    criteria,
    missingCriteria,
    verificationSummary: firstString(input.verificationSummary, input.summary, ''),
    evidenceRefs,
  };
  await appendJsonl(paths.goalWatchdog, record);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'completion_audit',
    summary: status === 'PASS' ? 'All success criteria have PASS evidence.' : `Completion audit missing ${missingCriteria.length} criteria.`,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs,
    archiveRefs: normalizeRefs(input.archiveRefs),
    metadata: { status, missingCriteria },
  });
  return { ok: true, ...record };
}

export async function goalResumePacket(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const missing = normalizeStringList(input.missing || input.missingCriteria || input.blockers, []);
  const nextActions = normalizeStringList(input.nextActions, goal.nextActions || ['Continue the active goal from the latest checkpoint.']);
  const incidentKey = firstString(input.incidentKey, buildIncidentKey(goal.id, { participantId: 'goal', taskId: '' }, firstString(input.reason, 'resume_needed')));
  const existingPacket = input.existingPacket || await latestOpenResumePacket(paths, goal.id, incidentKey);
  if (existingPacket) {
    return { ok: true, packet: existingPacket, reused: true };
  }
  const packet = {
    id: buildId('goal_resume', `${now}\n${goal.id}\n${missing.join('\n')}`),
    version: STORE_VERSION,
    kind: 'goal_resume_packet',
    timestamp: now,
    goalId: goal.id,
    status: 'open',
    reason: firstString(input.reason, 'resume_needed'),
    incidentKey,
    resumeTrigger: firstString(input.resumeTrigger, input.reason, 'resume_needed'),
    instruction: buildResumeInstruction(goal, missing, nextActions),
    missing,
    nextActions,
    evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
    archiveRefs: normalizeRefs(input.archiveRefs),
    resolvedAt: '',
    resolvedBy: '',
    resolution: '',
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.goalResumePackets, packet);
  await appendGoalEvent(paths, {
    goalId: goal.id,
    eventType: 'resume_packet',
    summary: packet.instruction,
    projectRoot: goal.projectRoot,
    sessionId: input.sessionId || input.session_id || '',
    timestamp: now,
    actor: 'codex',
    evidenceRefs: packet.evidenceRefs,
    archiveRefs: packet.archiveRefs,
    metadata: { resumePacketId: packet.id, reason: packet.reason },
  });
  return { ok: true, packet };
}

export async function goalResumePacketResolve(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const incidentKey = firstString(input.incidentKey, input.participantId ? buildIncidentKey(goal.id, {
    participantId: input.participantId,
    taskId: input.taskId || '',
  }, 'stale_participant') : '');
  const packets = await openResumePackets(paths, goal.id);
  const matched = packets.filter((packet) => {
    if (input.resumePacketId && packet.id === input.resumePacketId) return true;
    if (incidentKey && packet.incidentKey === incidentKey) return true;
    if (input.participantId && String(packet.instruction || '').includes(input.participantId)) return true;
    return false;
  });
  const resolved = [];
  for (const packet of matched) {
    const record = {
      ...packet,
      status: 'resolved',
      resolvedAt: now,
      resolvedBy: firstString(input.resolvedBy, input.participantId, 'codex'),
      resolution: firstString(input.reason, input.summary, 'resolved'),
    };
    await appendJsonl(paths.goalResumePackets, record);
    resolved.push(record);
  }
  if (resolved.length > 0) {
    await appendGoalEvent(paths, {
      goalId: goal.id,
      eventType: 'resume_packet_resolved',
      summary: `Resolved ${resolved.length} resume packet(s).`,
      projectRoot: goal.projectRoot,
      sessionId: input.sessionId || input.session_id || '',
      timestamp: now,
      actor: 'codex',
      evidenceRefs: normalizeRefs(input.evidenceRefs || input.files),
      archiveRefs: normalizeRefs(input.archiveRefs),
      metadata: { resolved: resolved.map((packet) => packet.id), incidentKey },
    });
  }
  return { ok: true, resolved };
}

export async function goalResumePackets(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const status = firstString(input.status, 'open');
  const all = (await readJsonl(paths.goalResumePackets))
    .filter((item) => item?.kind === 'goal_resume_packet' && item.goalId === goal.id);
  const latestById = latestResumePacketsById(all);
  const packets = [...latestById.values()]
    .filter((packet) => !status || packet.status === status)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, clampNumber(input.limit, 10, 1, 50));
  return { ok: true, packets, goalId: goal.id };
}

export async function turnWatchStart(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const sessionId = firstString(input.sessionId, input.session_id, 'unknown');
  const turnId = firstString(input.turnId, input.turn_id, buildId('turn', `${now}\n${sessionId}`));
  const participantId = firstString(input.participantId, `codex-turn-${turnId || sessionId}`);
  const transcriptPath = normalizeLocalPath(firstString(input.transcriptPath, input.transcript_path, input.sessionPath, input.session_path));
  const expectedHeartbeatSeconds = clampNumber(input.expectedHeartbeatSeconds || input.expectedSeconds, 30, 5, 3600);
  const existing = await latestTurnWatch(paths, goal.id, turnId);
  if (existing && ['watching', 'stale', 'request_pending'].includes(existing.status)) {
    return { ok: true, watch: existing, reused: true };
  }
  await goalParticipantRegister(projectRoot, {
    goalId: goal.id,
    participantId,
    kind: 'codex-turn',
    taskId: turnId,
    expectedHeartbeatSeconds,
    status: 'watching',
    proof: firstString(input.proof, 'Turn watch started; waiting for normal release or activity.'),
    sessionId,
    timestamp: now,
    metadata: {
      threadId: firstString(input.threadId, input.thread_id, sessionId),
      turnId,
      transcriptPath,
    },
  });
  const watch = {
    id: buildId('turn_watch', `${now}\n${goal.id}\n${turnId}`),
    version: STORE_VERSION,
    kind: 'turn_watch',
    timestamp: now,
    updatedAt: now,
    goalId: goal.id,
    status: 'watching',
    sessionId,
    threadId: firstString(input.threadId, input.thread_id, sessionId),
    turnId,
    participantId,
    taskId: turnId,
    transcriptPath,
    expectedHeartbeatSeconds,
    lastActivityAt: firstString(input.lastActivityAt, input.last_activity_at, now),
    lastActivityOffset: Number.isFinite(Number(input.lastActivityOffset)) ? Number(input.lastActivityOffset) : null,
    pid: input.pid === undefined || input.pid === null || input.pid === '' ? null : Number(input.pid),
    reason: '',
    resumePacketId: '',
    automationRequestId: '',
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.turnWatches, watch);
  return { ok: true, watch };
}

export async function turnWatchStatus(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const watches = await latestTurnWatches(paths, goal.id);
  const filtered = watches
    .filter((watch) => !input.turnId || watch.turnId === input.turnId)
    .filter((watch) => !input.status || watch.status === input.status)
    .sort((a, b) => String(b.updatedAt || b.timestamp || '').localeCompare(String(a.updatedAt || a.timestamp || '')))
    .slice(0, clampNumber(input.limit, 20, 1, 100));
  return { ok: true, watches: filtered, goalId: goal.id };
}

export async function turnWatchActivity(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = firstString(input.timestamp, input.time, input.at) || new Date().toISOString();
  const watches = await latestTurnWatches(paths, goal.id);
  const matched = watches.filter((watch) => {
    const status = String(watch.status || '').toLowerCase();
    if (['released', 'resolved', 'completed', 'cancelled', 'canceled', 'stale'].includes(status)) return false;
    if (input.watchId && watch.id !== input.watchId) return false;
    if (input.turnId && watch.turnId !== input.turnId) return false;
    if (input.sessionId && watch.sessionId !== input.sessionId) return false;
    if (input.participantId && watch.participantId !== input.participantId) return false;
    return Boolean(input.watchId || input.turnId || input.sessionId || input.participantId);
  });
  const updated = [];
  for (const watch of matched) {
    const expectedHeartbeatSeconds = clampNumber(
      input.expectedHeartbeatSeconds || input.expectedSeconds,
      watch.expectedHeartbeatSeconds || 30,
      5,
      3600,
    );
    const record = {
      ...watch,
      status: firstString(input.status, watch.status, 'watching'),
      updatedAt: now,
      lastActivityAt: now,
      expectedHeartbeatSeconds,
      reason: firstString(input.reason, input.summary, 'turn activity observed'),
      metadata: {
        ...(watch.metadata || {}),
        lastHookType: firstString(input.hookType, input.hook, ''),
        lastToolName: firstString(input.toolName, input.tool, ''),
        lastActivityProof: firstString(input.proof, 'Turn activity observed.'),
      },
    };
    await appendJsonl(paths.turnWatches, record);
    await goalHeartbeat(projectRoot, {
      goalId: goal.id,
      participantId: watch.participantId,
      kind: 'codex-turn',
      taskId: watch.turnId || watch.taskId,
      expectedHeartbeatSeconds,
      status: 'working',
      proof: firstString(input.proof, `${record.status} activity observed for turn ${watch.turnId}.`),
      timestamp: now,
      metadata: {
        hookType: firstString(input.hookType, input.hook, ''),
        toolName: firstString(input.toolName, input.tool, ''),
        turnWatchStatus: record.status,
      },
    });
    updated.push(record);
  }
  return { ok: true, updated, goalId: goal.id };
}

export async function turnWatchStop(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const watches = await latestTurnWatches(paths, goal.id);
  const matched = watches.filter((watch) => {
    if (input.watchId && watch.id === input.watchId) return true;
    if (input.turnId && watch.turnId === input.turnId) return true;
    if (input.sessionId && watch.sessionId === input.sessionId) return true;
    if (input.participantId && watch.participantId === input.participantId) return true;
    return false;
  });
  const stopped = [];
  for (const watch of matched) {
    const record = {
      ...watch,
      status: firstString(input.status, 'released'),
      updatedAt: now,
      reason: firstString(input.reason, input.summary, 'turn watch stopped normally'),
    };
    await appendJsonl(paths.turnWatches, record);
    stopped.push(record);
  }
  if (stopped.length > 0) {
    await goalParticipantRelease(projectRoot, {
      goalId: goal.id,
      participantId: stopped[0].participantId,
      taskId: stopped[0].taskId,
      sessionId: stopped[0].sessionId,
      proof: firstString(input.proof, 'Turn watch stopped; participant released normally.'),
    });
  }
  return { ok: true, stopped };
}

export async function turnWatchMarkStale(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const watch = await latestTurnWatch(paths, goal.id, firstString(input.turnId, ''));
  if (!watch) {
    return { ok: false, error: 'watch_not_found' };
  }
  const heartbeat = await goalHeartbeat(projectRoot, {
    goalId: goal.id,
    participantId: watch.participantId,
    kind: 'codex-turn',
    taskId: watch.turnId || watch.taskId,
    expectedHeartbeatSeconds: watch.expectedHeartbeatSeconds,
    status: 'stale',
    proof: firstString(input.proof, `Turn stale: no activity for ${input.inactiveSeconds || watch.expectedHeartbeatSeconds}s.`),
    timestamp: firstString(input.heartbeatTimestamp, now),
    metadata: {
      staleAgeSeconds: clampNumber(input.inactiveSeconds, watch.expectedHeartbeatSeconds, 0, 31536000),
      staleDetectedAt: now,
    },
  });
  const incidentKey = buildIncidentKey(goal.id, { participantId: watch.participantId, taskId: watch.turnId || watch.taskId }, 'stale_participant');
  const check = await goalWatchdogCheck(projectRoot, {
    goalId: goal.id,
    resumeTrigger: firstString(input.resumeTrigger, 'turn_stale'),
    sessionId: watch.sessionId,
    focusParticipantId: watch.participantId,
    focusTaskId: watch.turnId || watch.taskId,
    incidentKey,
    evidenceRefs: [{ path: watch.transcriptPath, summary: 'Watched transcript/session JSONL' }],
  });
  const request = check.resumePacket
    ? await resumeAutomationRequestCreate(projectRoot, {
      goalId: goal.id,
      resumePacketId: check.resumePacket.id,
      packetId: check.resumePacket.id,
      incidentKey: check.resumePacket.incidentKey || incidentKey,
      threadId: watch.threadId,
      sessionId: watch.sessionId,
      turnId: watch.turnId,
      reason: 'turn_stale',
      prompt: buildAutomationPrompt(check.resumePacket),
      missing: check.resumePacket.missing || [],
      nextActions: check.resumePacket.nextActions || [],
      metadata: {
        watchId: watch.id,
        participantId: watch.participantId,
        bridge: 'pending',
      },
    })
    : null;
  const record = {
    ...watch,
    status: request?.request?.status === 'pending' ? 'request_pending' : 'stale',
    updatedAt: now,
    reason: firstString(input.reason, 'turn_stale'),
    resumePacketId: check.resumePacket?.id || '',
    automationRequestId: request?.request?.id || '',
  };
  await appendJsonl(paths.turnWatches, record);
  return { ok: true, watch: record, heartbeat, watchdog: check, request };
}

export async function resumeAutomationRequestCreate(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const resumePacketId = firstString(input.resumePacketId, input.packetId, input.packet_id);
  const incidentKey = firstString(input.incidentKey, `${goal.id}::${resumePacketId || 'resume'}`);
  const existing = await latestOpenAutomationRequest(paths, goal.id, incidentKey, resumePacketId);
  if (existing) {
    return { ok: true, request: existing, reused: true };
  }
  const attempt = clampNumber(input.attempt, 1, 1, 10);
  const maxAttempts = clampNumber(input.maxAttempts, 10, 1, 10);
  const retryAfterSeconds = clampNumber(input.retryAfterSeconds, 30, 5, 3600);
  const request = {
    id: buildId('resume_req', `${now}\n${goal.id}\n${incidentKey}`),
    version: STORE_VERSION,
    kind: 'resume_automation_request',
    timestamp: now,
    updatedAt: now,
    goalId: goal.id,
    status: firstString(input.status, 'pending'),
    resumePacketId,
    incidentKey,
    reason: firstString(input.reason, 'turn_stale'),
    threadId: firstString(input.threadId, input.thread_id, ''),
    sessionId: firstString(input.sessionId, input.session_id, ''),
    turnId: firstString(input.turnId, input.turn_id, ''),
    prompt: firstString(input.prompt, 'Continue from the AM resume packet checkpoint.'),
    missing: normalizeStringList(input.missing, []),
    nextActions: normalizeStringList(input.nextActions, []),
    bridgeStatus: firstString(input.bridgeStatus, 'pending'),
    automationId: firstString(input.automationId, input.automation_id, ''),
    attempt,
    maxAttempts,
    retryAfterSeconds,
    nextAttemptAt: new Date(Date.parse(now) + retryAfterSeconds * 1000).toISOString(),
    lastWakeAt: '',
    wakeConfirmedAt: '',
    resolvedAt: '',
    resolvedBy: '',
    resolution: '',
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.resumeAutomationRequests, request);
  return { ok: true, request };
}

export async function resumeAutomationRequestList(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const status = Object.prototype.hasOwnProperty.call(input, 'status')
    ? String(input.status || '').trim()
    : 'pending';
  const all = (await readJsonl(paths.resumeAutomationRequests))
    .filter((item) => item?.kind === 'resume_automation_request' && item.goalId === goal.id);
  const latestById = latestRequestsById(all);
  const requests = [...latestById.values()]
    .filter((request) => !status || request.status === status)
    .sort((a, b) => String(b.updatedAt || b.timestamp || '').localeCompare(String(a.updatedAt || a.timestamp || '')))
    .slice(0, clampNumber(input.limit, 20, 1, 100));
  return { ok: true, requests, goalId: goal.id };
}

export async function resumeAutomationRequestResolve(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const requests = [...latestRequestsById((await readJsonl(paths.resumeAutomationRequests))
    .filter((item) => item?.kind === 'resume_automation_request' && item.goalId === goal.id)).values()];
  const matched = requests.filter((request) => {
    if (input.requestId && request.id === input.requestId) return true;
    if (input.resumePacketId && request.resumePacketId === input.resumePacketId) return true;
    if (input.incidentKey && request.incidentKey === input.incidentKey) return true;
    return false;
  });
  const resolved = [];
  for (const request of matched) {
    const isExactRequest = input.requestId && request.id === input.requestId;
    const status = firstString(input.status, 'completed');
    const bridgeStatus = firstString(input.bridgeStatus, input.status, 'completed');
    const wakeConfirmed = ['completed', 'wake_confirmed'].includes(status.toLowerCase())
      || ['completed', 'wake_confirmed'].includes(bridgeStatus.toLowerCase());
    const record = {
      ...request,
      status,
      bridgeStatus,
      automationId: isExactRequest ? firstString(input.automationId, request.automationId) : request.automationId,
      updatedAt: now,
      resolvedAt: now,
      wakeConfirmedAt: firstString(input.wakeConfirmedAt, input.wake_confirmed_at, wakeConfirmed ? now : request.wakeConfirmedAt),
      resolvedBy: firstString(input.resolvedBy, 'codex'),
      resolution: firstString(input.resolution, input.reason, 'resume automation request resolved'),
    };
    await appendJsonl(paths.resumeAutomationRequests, record);
    resolved.push(record);
  }
  return { ok: true, resolved };
}

export async function resumeAutomationRequestMarkWake(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const now = new Date().toISOString();
  const requests = [...latestRequestsById((await readJsonl(paths.resumeAutomationRequests))
    .filter((item) => item?.kind === 'resume_automation_request' && item.goalId === goal.id)).values()];
  const matched = requests.filter((request) => {
    if (input.requestId && request.id === input.requestId) return true;
    if (input.resumePacketId && request.resumePacketId === input.resumePacketId) return true;
    if (input.incidentKey && request.incidentKey === input.incidentKey) return true;
    return false;
  });
  const updated = [];
  for (const request of matched) {
    const record = {
      ...request,
      status: firstString(input.status, 'created'),
      bridgeStatus: firstString(input.bridgeStatus, 'CREATED'),
      automationId: firstString(input.automationId, input.automation_id, request.automationId),
      updatedAt: now,
      lastWakeAt: now,
      nextAttemptAt: new Date(Date.parse(now) + clampNumber(request.retryAfterSeconds, 30, 5, 3600) * 1000).toISOString(),
      resolution: firstString(input.resolution, request.resolution, ''),
    };
    await appendJsonl(paths.resumeAutomationRequests, record);
    updated.push(record);
  }
  return { ok: true, updated };
}

export async function resumeAutomationRequestRetryDue(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = await resolveGoal(projectRoot, input);
  if (!goal) {
    return { ok: false, error: 'no_active_goal' };
  }
  const nowMs = Date.now();
  const latestById = latestRequestsById((await readJsonl(paths.resumeAutomationRequests))
    .filter((item) => item?.kind === 'resume_automation_request' && item.goalId === goal.id));
  const requests = [...latestRequestsByIncident([...latestById.values()]).values()];
  const due = [];
  for (const request of requests) {
    const status = String(request.status || '').toLowerCase();
    if (!['pending', 'created', 'bridge_unavailable', 'wake_failed'].includes(status)) continue;
    if (request.wakeConfirmedAt || request.resolvedAt) continue;
    const attempt = clampNumber(request.attempt, 1, 1, 10);
    const maxAttempts = clampNumber(request.maxAttempts, 10, 1, 10);
    if (attempt >= maxAttempts) continue;
    const nextAttemptMs = Date.parse(request.nextAttemptAt || request.updatedAt || request.timestamp || '');
    if (Number.isFinite(nextAttemptMs) && nextAttemptMs > nowMs) continue;
    const nextAttempt = attempt + 1;
    const retryAfterSeconds = clampNumber(request.retryAfterSeconds, 30, 5, 3600);
    const record = {
      ...request,
      id: buildId('resume_req', `${new Date().toISOString()}\n${goal.id}\n${request.incidentKey}\n${nextAttempt}`),
      timestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
      bridgeStatus: 'pending',
      automationId: '',
      attempt: nextAttempt,
      maxAttempts,
      retryAfterSeconds,
      nextAttemptAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
      lastWakeAt: '',
      resolvedAt: '',
      resolvedBy: '',
      resolution: `Retry attempt ${nextAttempt}/${maxAttempts} after no wake confirmation.`,
    };
    await appendJsonl(paths.resumeAutomationRequests, record);
    due.push(record);
  }
  return { ok: true, due, goalId: goal.id };
}

export async function writeMaintenance(projectRoot, entry = {}) {
  const paths = await ensureStore(projectRoot);
  const damage = findEncodingDamage(entry);
  if (damage.length && !allowsEncodingDamage(entry)) {
    const rejected = {
      id: buildId('mnt', `${Date.now()}\nencoding_damage_rejected_maintenance\n${JSON.stringify(damage)}`),
      timestamp: new Date().toISOString(),
      kind: 'maintenance',
      type: 'encoding_damage_rejected_maintenance',
      status: 'WARN',
      originalType: firstString(entry.type, entry.kind, 'unknown'),
      damage,
    };
    await appendJsonl(paths.maintenance, rejected);
    return { ok: false, error: 'encoding_damage_detected', record: rejected };
  }
  const record = {
    id: entry.id || buildId('mnt', `${Date.now()}\n${JSON.stringify(entry).slice(0, 1000)}`),
    timestamp: entry.timestamp || new Date().toISOString(),
    kind: 'maintenance',
    ...entry,
  };
  await appendJsonl(paths.maintenance, record);
  return { ok: true, record };
}

export async function listArchives(projectRoot, limit = 5) {
  const root = resolveProjectRoot(projectRoot);
  const archiveRoot = path.join(root, '.codex', 'conversation-archive');
  const files = [];
  for (const channel of ['desktop', 'weixin']) {
    const dir = path.join(archiveRoot, channel);
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      const file = path.join(dir, entry.name);
      const stat = await fsp.stat(file).catch(() => null);
      if (stat) {
        files.push({
          channel,
          path: file,
          relativePath: toRel(root, file),
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files.slice(0, limit);
}

async function appendJsonl(file, value) {
  const damage = findEncodingDamage(value);
  if (damage.length && !allowsEncodingDamage(value)) {
    const error = new Error(`Refused to append AM JSONL with high-confidence encoding damage: ${damage.map((item) => item.path).join(', ')}`);
    error.code = 'AM_ENCODING_DAMAGE_DETECTED';
    error.damage = damage;
    throw error;
  }
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

async function readJsonl(file) {
  const records = [];
  await scanJsonl(file, (record) => records.push(record), { includeParseErrors: true });
  return records;
}

async function readJsonFileIfExists(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonFile(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function compactMemoryForIndex(record = {}) {
  const source = record.source && typeof record.source === 'object' ? record.source : {};
  const type = String(record.type || '');
  const currentFact = compactCurrentFactMetadata(record);
  return {
    id: record.id,
    kind: 'memory',
    timestamp: record.timestamp || record.createdAt || new Date().toISOString(),
    title: record.title,
    type,
    layer: record.layer,
    importance: record.importance,
    reusable: type === 'am_first_stage_summary' ? false : Boolean(record.reusable),
    needsVerification: Boolean(record.needsVerification || record.needs_verification),
    project: record.project,
    sourceKind: source.kind || record.sourceKind || '',
    sourcePath: source.path || record.sourcePath || '',
    concepts: Array.isArray(record.concepts) ? record.concepts : [],
    files: Array.isArray(record.files) ? record.files : [],
    metadata: currentFact,
    explicitDeploymentProjectIds: compactExplicitDeploymentProjectIds(record),
    summary: record.summary || summarizeText(record.content, 320),
  };
}

function compactCurrentFactMetadata(record = {}) {
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  const out = {};
  const currentFor = firstString(metadata.currentFor, metadata.current_for, record.currentFor, record.current_for);
  const supersedes = uniqueArray([
    ...asArray(metadata.supersedes),
    ...asArray(metadata.supersedesIds),
    ...asArray(metadata.supersededIds),
    ...asArray(record.supersedes),
    ...asArray(record.supersedesIds),
  ]);
  const supersededBy = uniqueArray([
    ...asArray(metadata.supersededBy),
    ...asArray(metadata.superseded_by),
    ...asArray(record.supersededBy),
    ...asArray(record.superseded_by),
  ]);
  if (currentFor) out.currentFor = currentFor;
  if (supersedes.length) out.supersedes = supersedes;
  if (supersededBy.length) out.supersededBy = supersededBy;
  for (const key of ['validFrom', 'validTo', 'status']) {
    if (metadata[key] !== undefined) out[key] = metadata[key];
    if (record[key] !== undefined) out[key] = record[key];
  }
  return out;
}

export function buildCurrentFactIndex(memories = []) {
  const groups = new Map();
  const explicitByCurrentFor = new Map();
  const globalExplicitSupersededIds = new Set();
  for (const memory of memories) {
    const current = compactCurrentFactMetadata(memory);
    if (current.supersedes) {
      for (const id of current.supersedes) {
        globalExplicitSupersededIds.add(id);
        if (current.currentFor) {
          if (!explicitByCurrentFor.has(current.currentFor)) explicitByCurrentFor.set(current.currentFor, new Set());
          explicitByCurrentFor.get(current.currentFor).add(id);
        }
      }
    }
    if (current.supersededBy?.length && memory?.id) {
      globalExplicitSupersededIds.add(String(memory.id));
      if (current.currentFor) {
        if (!explicitByCurrentFor.has(current.currentFor)) explicitByCurrentFor.set(current.currentFor, new Set());
        explicitByCurrentFor.get(current.currentFor).add(String(memory.id));
      }
    }
    if (!current.currentFor || !memory?.id) continue;
    if (!groups.has(current.currentFor)) groups.set(current.currentFor, []);
    groups.get(current.currentFor).push({ ...memory, metadata: { ...(memory.metadata || {}), ...current } });
  }
  const facts = {};
  const allSuperseded = new Set(globalExplicitSupersededIds);
  for (const [currentFor, candidates] of groups.entries()) {
    const sorted = [...candidates].sort(compareCurrentFactCandidates);
    const current = sorted[0];
    const supersededIds = new Set(explicitByCurrentFor.get(currentFor) || []);
    for (const candidate of sorted) {
      for (const id of asArray(candidate.metadata?.supersedes)) supersededIds.add(String(id));
      if (candidate.id !== current.id) supersededIds.add(String(candidate.id));
    }
    const ownSuperseded = [...supersededIds].filter((id) => id && id !== current.id).sort();
    for (const id of ownSuperseded) allSuperseded.add(id);
    facts[currentFor] = {
      currentId: String(current.id),
      currentTitle: String(current.title || ''),
      updatedAt: String(current.timestamp || ''),
      supersededIds: ownSuperseded,
      candidateIds: sorted.map((item) => String(item.id)).filter(Boolean),
    };
  }
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    facts,
    supersededIds: [...allSuperseded].filter(Boolean).sort(),
  };
}

export function currentFactSupersededIdSet(index = {}) {
  const ids = new Set();
  for (const id of asArray(index?.supersededIds)) ids.add(String(id));
  for (const fact of Object.values(index?.facts || {})) {
    for (const id of asArray(fact?.supersededIds)) ids.add(String(id));
  }
  return ids;
}

function compareCurrentFactCandidates(a = {}, b = {}) {
  const statusDiff = currentFactStatusRank(a.metadata?.status) - currentFactStatusRank(b.metadata?.status);
  if (statusDiff !== 0) return statusDiff;
  const timeDiff = String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  if (timeDiff !== 0) return timeDiff;
  const qualityDiff = Number(b.quality?.overall || 0) - Number(a.quality?.overall || 0);
  if (qualityDiff !== 0) return qualityDiff;
  return importanceRank(b.importance) - importanceRank(a.importance);
}

function currentFactStatusRank(status) {
  const text = String(status || '').toLowerCase();
  if (/current|active|valid|verified|live|已验证|当前/u.test(text)) return 0;
  if (/superseded|old|stale|invalid|replaced|过期|旧/u.test(text)) return 2;
  return 1;
}

function importanceRank(value) {
  const text = String(value || '').toLowerCase();
  if (text === 'critical') return 4;
  if (text === 'high') return 3;
  if (text === 'normal') return 2;
  if (text === 'low') return 1;
  return 0;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[,;]\s*/u);
}

function compactExplicitDeploymentProjectIds(record = {}) {
  const metadata = record.metadata && typeof record.metadata === 'object' ? record.metadata : {};
  return uniqueArray([
    metadata.deploymentProjectId,
    metadata.deployment_project_id,
    metadata.projectId,
    metadata.projectBucket,
    ...(Array.isArray(metadata.deploymentProjectIds) ? metadata.deploymentProjectIds : []),
    ...(Array.isArray(metadata.projectBuckets) ? metadata.projectBuckets : []),
  ].flat()
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim())
    .filter((value) => value && value.toLowerCase() !== 'undefined' && value.toLowerCase() !== 'null'));
}

function selectCompactIndexMemories(memories = [], limit = 1000) {
  const sorted = [...memories].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  const selected = [];
  const countsByType = new Map();
  for (const memory of sorted) {
    const type = String(memory.type || '');
    const cap = compactIndexTypeCap(type);
    const count = countsByType.get(type) || 0;
    if (count >= cap) continue;
    selected.push({ kind: 'memory', ...memory });
    countsByType.set(type, count + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function compactIndexTypeCap(type) {
  const caps = {
    am_first_finish_summary: 80,
    am_first_stage_summary: 40,
    conversation_archive: 10,
    conversation_summary: 80,
    consolidated_memory: 120,
  };
  return Object.prototype.hasOwnProperty.call(caps, type) ? caps[type] : Number.POSITIVE_INFINITY;
}

async function readRecentJsonlMemories(file, options = {}) {
  const maxRecords = clampNumber(options.maxRecords, 120, 1, 500);
  const maxBytes = clampNumber(options.maxBytes, 2 * 1024 * 1024, 4096, 8 * 1024 * 1024);
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

function isMemoryLikeRecord(record = {}) {
  return record?.kind === 'memory' || Boolean(record?.id && (record?.type || record?.title || record?.summary || record?.content));
}

function stripFastInternalFields(record = {}) {
  const { __fastSource, __fastPath, ...clean } = record;
  if (__fastSource || __fastPath) {
    clean.source = {
      ...(clean.source || {}),
      kind: clean.source?.kind || __fastSource || 'am-vnext-index',
      path: clean.source?.path || __fastPath || clean.source?.path || '',
    };
  }
  return compactRecalledRecord(clean);
}

function compactRecalledRecord(record = {}) {
  const content = String(record.content || '');
  const summary = String(record.summary || '');
  const archiveBacked = /conversation_archive|conversation_summary|consolidated_memory|archive-backed/iu.test([
    record.type,
    record.source?.kind,
    record.title,
  ].join(' '));
  const contentLimit = archiveBacked ? 1800 : 6000;
  return {
    ...record,
    content: summarizeText(content, contentLimit),
    summary: summarizeText(summary || content, Math.min(900, contentLimit)),
  };
}

async function scanJsonlStats(file, options = {}) {
  const stats = { count: 0, encodingWarnings: 0 };
  await scanJsonl(file, (record, rawLine) => {
    stats.count += 1;
    if (options.checkEncoding && (hasEncodingDamage(rawLine) || findEncodingDamage(record).length)) {
      stats.encodingWarnings += 1;
    }
  }, { includeParseErrors: true });
  return stats;
}

async function scanJsonl(file, onRecord, options = {}) {
  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        onRecord(JSON.parse(line), line);
      } catch {
        if (options.includeParseErrors) {
          onRecord({ kind: 'parse_error', raw: line.slice(0, 500) }, line);
        }
      }
    }
  } catch {
    return;
  }
}

async function readTombstones(file) {
  const tombstones = await readJsonl(file);
  return new Set(tombstones.map((item) => item.targetId).filter(Boolean));
}

async function latestGoalParticipants(paths, goalId) {
  const records = (await readJsonl(paths.goalHeartbeats))
    .filter((item) => item?.kind === 'goal_heartbeat' && item.goalId === goalId);
  const latestByParticipant = new Map();
  for (const record of records) {
    const key = `${record.participantId || ''}::${record.taskId || ''}`;
    const existing = latestByParticipant.get(key);
    if (!existing || String(record.timestamp || '').localeCompare(String(existing.timestamp || '')) >= 0) {
      latestByParticipant.set(key, record);
    }
  }
  return [...latestByParticipant.values()].sort((a, b) => `${a.participantId || ''}::${a.taskId || ''}`.localeCompare(`${b.participantId || ''}::${b.taskId || ''}`));
}

async function latestTurnWatches(paths, goalId) {
  const records = (await readJsonl(paths.turnWatches))
    .filter((item) => item?.kind === 'turn_watch' && item.goalId === goalId);
  const latestByTurn = new Map();
  for (const record of records) {
    const key = record.turnId || record.id;
    const existing = latestByTurn.get(key);
    if (!existing || String(record.updatedAt || record.timestamp || '').localeCompare(String(existing.updatedAt || existing.timestamp || '')) >= 0) {
      latestByTurn.set(key, record);
    }
  }
  return [...latestByTurn.values()].sort((a, b) => String(a.turnId || '').localeCompare(String(b.turnId || '')));
}

async function latestTurnWatch(paths, goalId, turnId) {
  const watches = await latestTurnWatches(paths, goalId);
  if (turnId) {
    return watches.find((watch) => watch.turnId === turnId) || null;
  }
  return watches
    .sort((a, b) => String(b.updatedAt || b.timestamp || '').localeCompare(String(a.updatedAt || a.timestamp || '')))[0] || null;
}

async function latestCompletionAudit(paths, goalId) {
  const records = (await readJsonl(paths.goalWatchdog))
    .filter((item) => item?.kind === 'goal_watchdog' && item.goalId === goalId && item.type === 'completion_audit')
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  return records[0] || null;
}

async function latestOpenResumePacket(paths, goalId, incidentKey) {
  const packets = await openResumePackets(paths, goalId);
  if (incidentKey) {
    return packets.find((packet) => packet.incidentKey === incidentKey) || null;
  }
  return packets[0] || null;
}

async function openResumePackets(paths, goalId) {
  const records = (await readJsonl(paths.goalResumePackets))
    .filter((item) => item?.kind === 'goal_resume_packet' && item.goalId === goalId);
  return [...latestResumePacketsById(records).values()]
    .filter((packet) => packet.status === 'open')
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

function latestResumePacketsById(records) {
  const latestById = new Map();
  for (const record of records) {
    const existing = latestById.get(record.id);
    if (!existing || String(record.resolvedAt || record.timestamp || '').localeCompare(String(existing.resolvedAt || existing.timestamp || '')) >= 0) {
      latestById.set(record.id, record);
    }
  }
  return latestById;
}

function buildIncidentKey(goalId, participant, reason) {
  return [
    goalId,
    reason || 'incident',
    participant?.participantId || 'participant',
    participant?.taskId || '',
  ].join('::');
}

function secondsSince(timestamp) {
  const value = Date.parse(timestamp || '');
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - value) / 1000);
}

function processExists(pid) {
  const value = Number(pid);
  if (!Number.isFinite(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

function buildResumeActions(goal, stale, audit) {
  const actions = [];
  if (stale.length) {
    actions.push('Continue the active goal from the latest checkpoint; stale participants must report current status or be restarted.');
  }
  if (audit && audit.status !== 'PASS') {
    actions.push('Do not mark the goal complete; collect missing evidence and rerun goal_completion_audit.');
  }
  actions.push(...(goal.nextActions || []));
  return uniqueArray(actions).slice(0, 8);
}

function buildResumeInstruction(goal, missing, nextActions) {
  return [
    `Continue AM Goal: ${goal.title}`,
    `Objective must remain unchanged: ${summarizeText(goal.objective, 260)}`,
    missing.length ? `Missing or stale items: ${missing.join('; ')}` : 'No explicit missing items were listed; resume from latest checkpoint.',
    nextActions.length ? `Next actions: ${nextActions.join('; ')}` : '',
  ].filter(Boolean).join('\n');
}

function buildAutomationPrompt(packet) {
  return [
    'AM Goal 事件触发恢复：当前线程检测到一次真实或模拟断链。',
    `resumePacketId=${packet.id}`,
    `incidentKey=${packet.incidentKey || ''}`,
    '请读取本地 AM 的这个 resume packet，并在当前线程简洁输出：',
    '继续：检测到中断；缺失点：...；下一步：...',
    '然后 resolve 这个 packet；如果这是一次性 automation，触发后必须删除自己，避免变成固定轮询。',
  ].join('\n');
}

async function latestOpenAutomationRequest(paths, goalId, incidentKey, resumePacketId = '') {
  const requests = [...latestRequestsById((await readJsonl(paths.resumeAutomationRequests))
    .filter((item) => item?.kind === 'resume_automation_request' && item.goalId === goalId)).values()];
  return requests
    .filter((request) => ['pending', 'created'].includes(String(request.status || '').toLowerCase()))
    .find((request) => request.incidentKey === incidentKey && (!resumePacketId || request.resumePacketId === resumePacketId)) || null;
}

function latestRequestsById(records) {
  const latestById = new Map();
  for (const record of records) {
    const existing = latestById.get(record.id);
    if (!existing || String(record.updatedAt || record.timestamp || '').localeCompare(String(existing.updatedAt || existing.timestamp || '')) >= 0) {
      latestById.set(record.id, record);
    }
  }
  return latestById;
}

function latestRequestsByIncident(records) {
  const latestByIncident = new Map();
  for (const record of records) {
    const key = firstString(record.incidentKey, record.resumePacketId, record.id);
    const existing = latestByIncident.get(key);
    if (!existing || compareRequestRetryOrder(record, existing) >= 0) {
      latestByIncident.set(key, record);
    }
  }
  return latestByIncident;
}

function compareRequestRetryOrder(a, b) {
  const attemptDiff = clampNumber(a?.attempt, 0, 0, 1000) - clampNumber(b?.attempt, 0, 0, 1000);
  if (attemptDiff !== 0) return attemptDiff;
  const aTime = Date.parse(a?.updatedAt || a?.timestamp || '') || 0;
  const bTime = Date.parse(b?.updatedAt || b?.timestamp || '') || 0;
  return aTime - bTime;
}

function summarizeAudit(audit) {
  return {
    id: audit.id,
    timestamp: audit.timestamp,
    status: audit.status,
    missingCriteria: audit.missingCriteria || [],
  };
}

function inferStageSummary(goal, events) {
  const latest = [...events].reverse().find((event) => event.summary);
  return latest
    ? `Stage review for ${goal.title}: latest event ${latest.eventType} says ${summarizeText(latest.summary, 420)}`
    : `Stage review for ${goal.title}: no recent event summary; continue from current next actions.`;
}

function detectGoalDrift(goal, summary) {
  const drift = [];
  const objective = String(goal.objective || '');
  const text = String(summary || '');
  if (/complete|完成|done/iu.test(text) && !/verify|evidence|验收|证据|audit/iu.test(text)) {
    drift.push('Completion language appeared without verification/evidence language.');
  }
  if (/delete|删除|reset|重置/iu.test(text) && !/archive|归档|preserve|保留/iu.test(objective + text)) {
    drift.push('Destructive cleanup wording appeared without archive/preserve guard.');
  }
  return drift;
}

function inferGoalLessons(goal, events) {
  const lessons = [];
  const text = [goal.objective, goal.progressSummary, ...events.map((event) => event.summary)].join('\n');
  if (/stale|timeout|卡住|失联|中断/iu.test(text)) {
    lessons.push('For long goals, require participant heartbeats and a resume packet before assuming work is still moving.');
  }
  if (/complete|完成|PASS|验收/iu.test(text)) {
    lessons.push('Before completing a goal, run a criteria-by-criteria audit and keep the original objective unchanged.');
  }
  if (/乱码|\?\?\?|encoding|UTF-8/iu.test(text)) {
    lessons.push('For AM goal evidence and archives, verify UTF-8 output before claiming the memory chain is healthy.');
  }
  return lessons;
}

function refMatchesCriterion(ref, criterion) {
  const refText = [ref.path, ref.url, ref.summary, ref.kind].join(' ').toLowerCase();
  const tokens = tokenize(criterion).filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => refText.includes(token)).length;
  return hits >= Math.min(2, tokens.length);
}

function criterionTextSatisfied(text, criterion) {
  const source = String(text || '').toLowerCase();
  const tokens = tokenize(criterion).filter((token) => token.length >= 3);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((token) => source.includes(token)).length;
  if (hits >= Math.min(3, tokens.length)) {
    return /pass|verified|evidence|验收|证据|通过|完成/iu.test(source);
  }
  return false;
}

function scoreRecord(record, query) {
  if (recordHasEncodingDamage(record)) {
    return 0;
  }
  const tokens = tokenize(query);
  const queryText = String(query || '');
  const type = String(record.type || '');
  if (record.type === 'goal_lesson' && !isGoalContextQuery(tokens, record)) {
    return 0;
  }
  if (record.type === 'conversation_archive' && !isHistoryContextQuery(tokens)) {
    return 0;
  }
  if (isAutoCloseoutType(type) && !isHistoryContextQuery(tokens)) {
    return 0;
  }
  if (isArchiveDerivedType(type) && !isHistoryContextQuery(tokens)) {
    return 0;
  }
  if (!matchesExplicitProjectDomain(tokens, record)) {
    return 0;
  }
  if (isDomainStrictRecord(record) && hasForeignProjectDomainLeak(tokens, record)) {
    return 0;
  }
  if (isProjectScopedRecord(record) && requiresProjectAnchor(record) && !hasProjectAnchorMatch(record, tokens)) {
    return 0;
  }
  const text = [
    record.id,
    record.type,
    record.layer,
    record.title,
    record.summary,
    record.content,
    record.project,
    ...(record.concepts || []),
    ...(record.files || []),
  ].join('\n').toLowerCase();
  let score = 0;
  if (tokens.length === 0) {
    score = 0.1;
  }
  for (const token of tokens) {
    if (textHasToken(text, token)) {
      score += token.length > 2 ? 2 : 0.5;
    }
  }
  if (record.importance === 'critical') score += 4;
  if (record.importance === 'high') score += 2;
  if (record.layer === 'procedural') score += 0.8;
  if (record.layer === 'semantic') score += 0.6;
  score += typePriority(type);
  if (isNeedsVerificationRecord(record) && !isVerificationContextQuery(tokens)) return 0;
  if (isStaleOperationalAccessNoise(record, tokens, queryText)) return 0;
  if (isArchiveDerivedType(type) && !isHistoryContextQuery(tokens)) score -= 4;
  const ageMs = Date.now() - Date.parse(record.timestamp || 0);
  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 1000 * 60 * 60 * 24 * 7) {
    score += 0.5;
  }
  return score;
}

function typePriority(type) {
  if (/^(user_preference|project_rule|procedural_rule)$/u.test(type)) return 4;
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

function requiresProjectAnchor(record = {}) {
  return /^(am_first_stage_summary|conversation_summary|am_first_finish_summary)$/u.test(String(record.type || ''));
}

function recordHasEncodingDamage(record = {}) {
  return findEncodingDamage(record).length > 0;
}

function isGoalContextQuery(tokens, record = {}) {
  const queryText = tokens.join(' ');
  if (/(^|\s)(goal|active-goal|goal_lesson|goal-status|goal-board|resume-packet|handoff|example-world|example-game|example-companion)(\s|$)|目标|恢复|继续上次|交接/iu.test(queryText)) {
    return true;
  }
  const projectText = `${record.project || ''} ${(record.files || []).join(' ')} ${record.title || ''}`.toLowerCase();
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

function isOperationalAccessMemory(record = {}) {
  const text = [
    record.type,
    record.title,
    ...(record.concepts || []),
    ...(record.files || []),
  ].join('\n').toLowerCase();
  return /server[-_\s]?access|ssh[-_\s]?access|server[-_\s]?credentials?|credentials?|login[-_\s]?(info|credentials?)|access[-_\s]?note|private[-_\s]?key|ssh[-_\s]?private[-_\s]?key|连接资料|登录资料|服务器资料|凭据|ssh\s*(私钥|密钥|private[-_\s]?key|key)|私钥路径|登录密钥|连接密钥|端口.*(用户名|账号|账户|密码)|username.*password|user.*password/iu.test(text);
}

function isStaleOperationalAccessNoise(record = {}, tokens = [], rawQuery = '') {
  if (!isOperationalAccessQuery(tokens, rawQuery) || isHistoryContextQuery(tokens, rawQuery)) return false;
  if (isOperationalAccessMemory(record)) return false;
  return true;
}

function isNeedsVerificationRecord(record = {}) {
  return Boolean(record.needsVerification || record.needs_verification || isImplicitVerificationRecord(record));
}

function isVerificationContextQuery(tokens = []) {
  const queryText = ` ${tokens.join(' ')} `;
  return /(^|\s)(draft|proposal|patch|pending|unverified|verify|verification|blocked|handoff|resume|partial)(\s|$)|待验证|未验证|未完成|未上线|预案|草案|补丁|阻塞|交接|恢复|继续|ssh\s+(blocked|pending|restore|resume|unverified)|ssh[-_\s]+blocked/iu.test(queryText);
}

function isImplicitVerificationRecord(record = {}) {
  const type = String(record.type || '');
  if (!/^(project_state|am_first_stage_summary|am_first_finish_summary)$/u.test(type)) return false;
  const text = [
    record.title,
    record.summary,
    record.content,
  ].join('\n');
  return /待验证|未验证|未完成|未上线|未部署|待上线|预案|草案|管理通道不通|ssh\s+(blocked|pending|timeout|unreachable)|ssh[-_\s]+blocked|blocked by ssh|not deployed|not yet deployed|pending verification|pending fix|patch prepared|prepared but not deployed|draft patch/iu.test(text);
}

function isProjectScopedRecord(record = {}) {
  return /^(project_state|project_rule|user_preference|procedural_rule|am_first_finish_summary|am_first_stage_summary|conversation_summary|consolidated_memory)$/u.test(String(record.type || ''));
}

function isDomainStrictRecord(record = {}) {
  return isProjectScopedRecord(record)
    || String(record.type || '') === 'goal_lesson'
    || String(record.type || '') === 'conversation_archive'
    || String(record.type || '') === 'workflow_pack'
    || String(record.type || '') === 'reflection'
    || String(record.type || '') === 'lesson'
    || String(record.type || '') === 'procedural_lesson';
}

function matchesExplicitProjectDomain(tokens, record = {}) {
  const domains = explicitProjectDomains(tokens);
  if (domains.length === 0) return true;
  const text = projectAnchorText(record);
  return domains.some((domain) => domain.aliases.some((alias) => textHasToken(text, alias)));
}

function hasForeignProjectDomainLeak(tokens, record = {}) {
  const queryDomains = explicitProjectDomains(tokens).map((domain) => domain.name);
  const memoryDomains = memoryProjectDomains(record);
  return memoryDomains.some((domain) => !queryDomains.includes(domain));
}

function hasProjectAnchorMatch(record = {}, tokens = []) {
  const text = projectAnchorText(record);
  return tokens.some((token) => isSpecificRecallToken(token) && textHasToken(text, token));
}

function projectAnchorText(record = {}) {
  return [
    record.id,
    record.title,
    record.project,
    ...(record.files || []),
    ...(record.concepts || []),
  ].join('\n').toLowerCase();
}

function explicitProjectDomains(tokens = []) {
  const domains = [
    { name: 'example-game', aliases: ['example-game', 'example-world', 'example-companion', 'example-companion-bridge', 'example-ai'] },
    { name: 'example-service', aliases: ['example-service', 'payment', 'example-site', 'example-shop', 'example-user'] },
    { name: 'example-place', aliases: ['example-place', 'example-house', 'godot', 'blender'] },
  ];
  return domains.filter((domain) => tokens.some((token) => domain.aliases.some((alias) => token === alias || token.includes(alias))));
}

function memoryProjectDomains(record = {}) {
  const text = [
    record.title,
    record.summary,
    record.content,
    record.project,
    ...(record.files || []),
    ...(record.concepts || []),
  ].join('\n').toLowerCase();
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

function compareScoredRecords(a, b) {
  return b.score - a.score || String(b.record.timestamp).localeCompare(String(a.record.timestamp));
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_:/.-]+/gu, ' ')
    .split(/\s+/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 80);
}

function archiveToSummary(text) {
  const turns = [...String(text || '').matchAll(/^## (User|Assistant)\s+([\s\S]*?)(?=^## |$)/gmu)];
  const selected = turns.slice(-8).map((match) => `${match[1]}: ${summarizeText(match[2], 280)}`);
  return selected.join('\n\n') || summarizeText(text, 1200);
}

function extractHighSignalLines(text) {
  const lines = String(text || '')
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[-*#>\s]+/u, '').trim())
    .filter((line) => line.length >= 8 && line.length <= 260);
  return lines.filter((line) => /要|不要|必须|记得|以后|不允许|保留|删除|规划|记忆|MCP|AM|Codex|template|hook|local|port|stdio|PowerShell|Godot|Blender|CCOW|Ralph/iu.test(line)).slice(0, 18);
}

function extractLessons(text) {
  const lessons = [];
  if (/乱码|\?\?\?|mojibake|encoding/iu.test(text)) {
    lessons.push('Always verify UTF-8 input/output for AM hooks, local memory, and generated Markdown before calling the task complete.');
  }
  if (/端口|port|3111|8787|9876|stdio/iu.test(text)) {
    lessons.push('Prefer stdio/local-file MCP entries for the base template; do not require background REST, dashboard, or viewer ports.');
  }
  if (/删除|归档|archive|cleanup/iu.test(text)) {
    lessons.push('Archive before removing active template entries; preserve AM data, conversation archives, planning skills, and recovery manifests.');
  }
  if (/规划|计划|plan|handoff|PRD/iu.test(text)) {
    lessons.push('Keep planning, handoff, PRD, diagnosis, and coding workflow skills in the reusable template.');
  }
  if (/记忆|memory|AM|agentmemory/iu.test(text)) {
    lessons.push('Store full conversation archives first, then derive summaries, durable facts, project state, and reusable procedural lessons from the archive.');
  }
  return lessons;
}

function titleFromText(text) {
  return summarizeText(text, 90).replace(/\s+/gu, ' ').trim() || 'Memory';
}

function summarizeText(text, max) {
  const clean = String(text || '')
    .replace(/```[\s\S]*?```/gu, '[code omitted]')
    .replace(/\s+/gu, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 3))}...` : clean;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeLayer(value) {
  const text = String(value || '').toLowerCase();
  if (/event|episode|session|conversation/u.test(text)) return 'episodic';
  if (/rule|lesson|workflow|skill|procedure|reflection/u.test(text)) return 'procedural';
  if (/project|identity|preference|fact|context/u.test(text)) return 'semantic';
  if (/diagnos|maint/u.test(text)) return 'diagnostic';
  return 'semantic';
}

function normalizeImportance(value) {
  const text = String(value || '').toLowerCase();
  if (['critical', 'high', 'normal', 'low'].includes(text)) return text;
  if (text === 'important') return 'high';
  return 'normal';
}

function normalizeConfidence(value) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.min(1, Math.max(0, n));
  return 0.75;
}

function normalizeSource(source, input, projectRoot) {
  if (source && typeof source === 'object') {
    return source;
  }
  return {
    kind: String(input.sourceKind || input.source_kind || 'local'),
    path: input.sourcePath || input.source_path || '',
    sessionId: input.sessionId || input.session_id || '',
    projectRoot: resolveProjectRoot(projectRoot),
  };
}

function normalizeLocalPath(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/^\\\\\?\\/u, '');
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).slice(0, 50));
}

function uniqueArray(value) {
  const array = Array.isArray(value) ? value : String(value || '').split(/[,;]\s*/u);
  return [...new Set(array.map((item) => String(item || '').trim()).filter(Boolean))];
}

function isReusable(input, content) {
  if (input.type && /lesson|rule|workflow|preference|skill|reflection/iu.test(String(input.type))) return true;
  return /以后|每次|必须|不允许|always|never|prefer|rule|workflow/iu.test(content);
}

function hasEncodingDamage(value) {
  const text = String(value || '').replace(/\\\\\?\\/gu, '');
  return /\uFFFD|鑰|鎴|鐢|杩|涓|绛|妯|鍥|鑷||埗|Ã.|Â.|â€|è‡|åˆ|ä¸|æ–|æœ|çš|ç”|ç»|å¾|ä»|å·|ç¼|å¼|[A-Za-z]:[\\/]\?{2,}[\\/]|\/\?{2,}|(?:^|[^\p{L}\p{N}])\?{3,}(?:[^\p{L}\p{N}]|$)/iu.test(text);
}

function findEncodingDamage(value, pathParts = [], out = []) {
  if (out.length >= 20) return out;
  if (typeof value === 'string') {
    if (hasEncodingDamage(value)) {
      out.push({
        path: pathParts.join('.') || '$',
        sample: encodingDamageSample(value),
      });
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, 40); index += 1) {
      findEncodingDamage(value[index], [...pathParts, String(index)], out);
      if (out.length >= 20) break;
    }
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      findEncodingDamage(item, [...pathParts, key], out);
      if (out.length >= 20) break;
    }
  }
  return out;
}

function allowsEncodingDamage(input = {}) {
  const metadata = input.metadata || {};
  return Boolean(
    input.allowEncodingDamageSample
      || input.allow_encoding_damage_sample
      || metadata.allowEncodingDamageSample
      || metadata.allow_encoding_damage_sample
  );
}

function encodingDamageSample(value) {
  return summarizeText(String(value || '').replace(/\s+/gu, ' ').split('').map((char) => {
    if (char === '?' || char.codePointAt(0) > 0x7E) {
      return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return char;
  }).join(''), 220);
}

function normalizeGoalStatus(value, fallback = 'active') {
  const text = String(value || '').trim().toLowerCase();
  return ['active', 'paused', 'completed', 'blocked'].includes(text) ? text : fallback;
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item || '').trim()).filter(Boolean);
    return items.length ? items : fallback;
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\r?\n|[;；]/u)
      .map((item) => item.replace(/^[-*\d.)\s]+/u, '').trim())
      .filter(Boolean);
  }
  return fallback;
}

function normalizeRefs(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return { path: text };
      }
      if (item && typeof item === 'object') {
        const ref = {
          path: firstString(item.path, item.file, item.relativePath),
          url: firstString(item.url, item.href),
          summary: firstString(item.summary, item.title, item.description),
          kind: firstString(item.kind, item.type),
        };
        if (!ref.path && !ref.url && !ref.summary) return null;
        return ref;
      }
      return null;
    })
    .filter(Boolean);
}

function mergeRefs(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    for (const ref of normalizeRefs(group)) {
      const key = JSON.stringify(ref);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(ref);
      }
    }
  }
  return merged;
}

function sameProject(left, right) {
  try {
    return path.resolve(String(left || '')) === path.resolve(String(right || ''));
  } catch {
    return String(left || '') === String(right || '');
  }
}

async function resolveGoal(projectRoot, input = {}) {
  const goalId = String(input.id || input.goalId || '').trim();
  const status = await goalStatus(projectRoot, { id: goalId, projectRoot: input.projectRoot || input.project || input.cwd });
  return goalId ? status.selectedGoal : status.activeGoal;
}

async function appendGoalEvent(paths, input = {}) {
  const now = input.timestamp || new Date().toISOString();
  const event = {
    id: input.id || buildId('goal_evt', `${now}\n${input.goalId}\n${input.eventType}\n${input.summary}`),
    version: STORE_VERSION,
    kind: 'goal_event',
    goalId: input.goalId,
    eventType: input.eventType || 'checkpoint',
    timestamp: now,
    actor: input.actor || 'codex',
    sessionId: input.sessionId || '',
    projectRoot: input.projectRoot || '',
    summary: firstString(input.summary, ''),
    blockerKey: input.blockerKey || '',
    evidenceRefs: normalizeRefs(input.evidenceRefs),
    archiveRefs: normalizeRefs(input.archiveRefs),
    metadata: sanitizeMetadata(input.metadata || {}),
  };
  await appendJsonl(paths.goalEvents, event);
  return event;
}

async function writeCompletionPacket(projectRoot, input = {}) {
  const paths = await ensureStore(projectRoot);
  const goal = input.goal;
  const events = (await goalEvents(projectRoot, { goalId: goal.id, limit: 500 })).events.reverse();
  const dir = path.join(paths.goalCompletions, safeFileName(goal.id));
  await fsp.mkdir(dir, { recursive: true });
  const relativeDir = toRel(projectRoot, dir);
  const evidence = {
    goalId: goal.id,
    title: goal.title,
    status: 'completed',
    completedAt: new Date().toISOString(),
    verificationSummary: input.verificationSummary || '',
    criteriaAudit: input.audit || null,
    evidenceRefs: goal.evidenceRefs || [],
    archiveRefs: goal.archiveRefs || [],
  };
  const completionMarkdown = [
    `# Completed AM Goal: ${goal.title}`,
    '',
    `- Goal ID: ${goal.id}`,
    `- Status: completed`,
    `- Project: ${goal.projectRoot}`,
    `- Completed at: ${evidence.completedAt}`,
    '',
    '## Objective',
    '',
    goal.objective,
    '',
    '## Success Criteria',
    '',
    ...(goal.successCriteria || []).map((item) => `- ${item}`),
    '',
    '## Verification',
    '',
    input.verificationSummary || 'Completion evidence recorded.',
    '',
    '## Evidence',
    '',
    ...(goal.evidenceRefs || []).map((ref) => `- ${ref.path || ref.url || ref.summary}`),
    '',
    '## Archives',
    '',
    ...(goal.archiveRefs || []).map((ref) => `- ${ref.path || ref.url || ref.summary}`),
    '',
  ].join('\n');
  const flowMarkdown = [
    `# Goal Conversation Flow: ${goal.title}`,
    '',
    ...events.map((event) => [
      `## ${event.timestamp} · ${event.eventType}`,
      '',
      event.summary || '(no summary)',
      '',
      ...(event.archiveRefs || []).map((ref) => `- archive: ${ref.path || ref.url || ref.summary}`),
      ...(event.evidenceRefs || []).map((ref) => `- evidence: ${ref.path || ref.url || ref.summary}`),
      '',
    ].join('\n')),
  ].join('\n');
  await Promise.all([
    fsp.writeFile(path.join(dir, 'completion.md'), completionMarkdown, 'utf8'),
    fsp.writeFile(path.join(dir, 'timeline.json'), JSON.stringify(events, null, 2), 'utf8'),
    fsp.writeFile(path.join(dir, 'conversation-flow.md'), flowMarkdown, 'utf8'),
    fsp.writeFile(path.join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2), 'utf8'),
    fsp.writeFile(path.join(dir, 'criteria-audit.json'), JSON.stringify(input.audit || null, null, 2), 'utf8'),
  ]);
  return {
    ok: true,
    dir,
    relativeDir,
    files: {
      completion: toRel(projectRoot, path.join(dir, 'completion.md')),
      timeline: toRel(projectRoot, path.join(dir, 'timeline.json')),
      conversationFlow: toRel(projectRoot, path.join(dir, 'conversation-flow.md')),
      evidence: toRel(projectRoot, path.join(dir, 'evidence.json')),
      criteriaAudit: toRel(projectRoot, path.join(dir, 'criteria-audit.json')),
    },
  };
}

function safeFileName(value) {
  return String(value || 'goal').replace(/[<>:"/\\|?*\x00-\x1f]+/gu, '-').slice(0, 120);
}

function buildId(prefix, value) {
  const hash = crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
  return `${prefix}_${Date.now().toString(36)}_${hash}`;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function boolArg(value) {
  if (typeof value === 'boolean') return value;
  return /^(1|true|yes|y|on)$/iu.test(String(value || ''));
}

function extractLine(text, regex) {
  const match = String(text || '').match(regex);
  return match ? match[1].trim() : '';
}

function toRel(projectRoot, absolutePath) {
  return path.relative(resolveProjectRoot(projectRoot), absolutePath).replace(/\\/gu, '/');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      index += 1;
    } else {
      out[key] = 'true';
    }
  }
  return out;
}

function stripBom(value) {
  return String(value || '').replace(/^\uFEFF/u, '');
}

async function readPayload(args) {
  if (args.json) {
    return JSON.parse(stripBom(args.json));
  }
  if (args['payload-file']) {
    return JSON.parse(stripBom(await fsp.readFile(args['payload-file'], 'utf8')));
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  const input = Buffer.concat(chunks).toString('utf8');
  if (input.trim()) {
    return JSON.parse(stripBom(input));
  }
  return {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'diagnose';
  const projectRoot = resolveProjectRoot(args['project-root']);
  let result;
  if (command === 'remember') {
    result = await remember(projectRoot, await readPayload(args));
  } else if (command === 'observe') {
    result = await observe(projectRoot, await readPayload(args));
  } else if (command === 'recall') {
    result = await recall(projectRoot, {
      query: args.query || '',
      limit: args.limit,
      project: args.project,
      deploymentProject: args['deployment-project'] || args.deploymentProject || args['project-id'],
      concept: args.concept,
      concepts: args.concepts,
      source: args.source,
      file: args.file,
      path: args.path,
      enhanced: args.enhanced === undefined ? undefined : boolArg(args.enhanced),
      fullScan: boolArg(args['full-scan'] || args.fullScan),
    });
  } else if (command === 'memory-index') {
    result = await memoryIndex(projectRoot, { limit: args.limit, includeMemories: args['include-memories'] !== 'false' });
  } else if (command === 'memory-health') {
    result = await memoryHealth(projectRoot, {
      full: boolArg(args.full || args.deep || args.vnext),
      write: args.write === undefined ? undefined : boolArg(args.write),
    });
  } else if (command === 'cleanup-dry-run') {
    result = await memoryCleanupDryRun(projectRoot, { limit: args.limit });
  } else if (command === 'goal-board') {
    result = await memoryGoalBoard(projectRoot);
  } else if (command === 'project-board' || command === 'memory-project-board') {
    result = await memoryProjectBoard(projectRoot);
  } else if (command === 'session-history') {
    result = await sessionHistory(projectRoot, { limit: args.limit });
  } else if (command === 'summarize-latest') {
    result = await summarizeLatestArchive(projectRoot, { sessionId: args['session-id'] });
  } else if (command === 'consolidate') {
    result = await consolidate(projectRoot, { limit: args.limit });
  } else if (command === 'reflect') {
    result = await reflect(projectRoot, { limit: args.limit });
  } else if (command === 'forget') {
    result = await forget(projectRoot, { id: args.id, query: args.query, reason: args.reason });
  } else if (command === 'goal-start') {
    result = await goalStart(projectRoot, await readPayload(args));
  } else if (command === 'goal-status') {
    result = await goalStatus(projectRoot, { id: args.id, goalId: args['goal-id'], projectRoot });
  } else if (command === 'goal-checkpoint') {
    result = await goalCheckpoint(projectRoot, await readPayload(args));
  } else if (command === 'goal-complete') {
    result = await goalComplete(projectRoot, await readPayload(args));
  } else if (command === 'goal-block') {
    result = await goalBlock(projectRoot, await readPayload(args));
  } else if (command === 'goal-list') {
    result = await goalList(projectRoot, { status: args.status, limit: args.limit, projectRoot });
  } else if (command === 'goal-events') {
    result = await goalEvents(projectRoot, { goalId: args['goal-id'] || args.id, limit: args.limit });
  } else if (command === 'goal-participant-register') {
    result = await goalParticipantRegister(projectRoot, await readPayload(args));
  } else if (command === 'goal-heartbeat') {
    result = await goalHeartbeat(projectRoot, await readPayload(args));
  } else if (command === 'goal-participant-release') {
    result = await goalParticipantRelease(projectRoot, await readPayload(args));
  } else if (command === 'goal-watchdog-check') {
    result = await goalWatchdogCheck(projectRoot, await readPayload(args));
  } else if (command === 'goal-stage-review') {
    result = await goalStageReview(projectRoot, await readPayload(args));
  } else if (command === 'goal-completion-audit') {
    result = await goalCompletionAudit(projectRoot, await readPayload(args));
  } else if (command === 'goal-resume-packet') {
    result = await goalResumePacket(projectRoot, await readPayload(args));
  } else if (command === 'goal-resume-packets') {
    result = await goalResumePackets(projectRoot, await readPayload(args));
  } else if (command === 'goal-resume-packet-resolve') {
    result = await goalResumePacketResolve(projectRoot, await readPayload(args));
  } else if (command === 'turn-watch-start') {
    result = await turnWatchStart(projectRoot, await readPayload(args));
  } else if (command === 'turn-watch-status') {
    result = await turnWatchStatus(projectRoot, await readPayload(args));
  } else if (command === 'turn-watch-activity') {
    result = await turnWatchActivity(projectRoot, await readPayload(args));
  } else if (command === 'turn-watch-stop') {
    result = await turnWatchStop(projectRoot, await readPayload(args));
  } else if (command === 'turn-watch-mark-stale') {
    result = await turnWatchMarkStale(projectRoot, await readPayload(args));
  } else if (command === 'resume-automation-request-list') {
    const payload = await readPayload(args);
    result = await resumeAutomationRequestList(projectRoot, {
      ...payload,
      status: firstString(payload.status, args.status, ''),
      goalId: firstString(payload.goalId, args['goal-id'], args.id, ''),
      limit: firstString(payload.limit, args.limit, ''),
    });
  } else if (command === 'resume-automation-request-resolve') {
    result = await resumeAutomationRequestResolve(projectRoot, await readPayload(args));
  } else if (command === 'resume-automation-request-mark-wake') {
    result = await resumeAutomationRequestMarkWake(projectRoot, await readPayload(args));
  } else if (command === 'resume-automation-request-retry-due') {
    result = await resumeAutomationRequestRetryDue(projectRoot, await readPayload(args));
  } else {
    result = await diagnose(projectRoot);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
  });
}
