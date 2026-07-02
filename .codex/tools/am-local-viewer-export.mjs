#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildGoalBoard,
  buildHealthReport,
  buildMemoryIndex,
  cleanupDryRun,
} from './am-vnext.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { projectRoot: DEFAULT_PROJECT_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project-root') {
      args.projectRoot = argv[i + 1] || args.projectRoot;
      i += 1;
    }
  }
  args.projectRoot = path.resolve(args.projectRoot);
  return args;
}

function amPaths(projectRoot) {
  const root = path.join(projectRoot, '.codex', 'memory', 'am');
  return {
    root,
    viewer: path.join(projectRoot, '.codex', 'memory', 'am-viewer', 'index.html'),
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
    goalCompletions: path.join(root, 'goal-completions'),
    archiveRoot: path.join(projectRoot, '.codex', 'conversation-archive'),
  };
}

async function readJsonl(file) {
  let text = '';
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      rows.push({ kind: 'parse_error', file, raw: trimmed.slice(0, 500) });
    }
  }
  return rows;
}

async function fileSize(file) {
  try {
    return (await fsp.stat(file)).size;
  } catch {
    return 0;
  }
}

async function listArchiveFiles(archiveRoot) {
  const files = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = await fsp.stat(full).catch(() => null);
        if (stat) {
          let preview = '';
          try {
            preview = (await fsp.readFile(full, 'utf8')).slice(0, 1200);
          } catch {
            preview = '';
          }
          files.push({
            path: full,
            relativePath: toRel(archiveRoot, full),
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            preview,
            url: fileLink(full),
          });
        }
      }
    }
  }
  await walk(archiveRoot);
  files.sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
  return files;
}

function toRel(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function fileLink(file) {
  return pathToFileURL(path.resolve(file)).href;
}

function compactText(text, limit) {
  const value = String(text || '');
  if (value.length <= limit) {
    return { text: value, truncated: false };
  }
  return { text: `${value.slice(0, limit)}\n\n[内容过长，已在查看器中截断；完整内容请打开源文件。]`, truncated: true };
}

function sourcePath(record, projectRoot) {
  const source = record?.source || {};
  const file = source.path || source.file || record?.files?.[0] || '';
  if (!file) {
    return null;
  }
  return path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
}

function sourceLabel(record) {
  const source = record?.source || {};
  return source.kind || record?.sourceKind || record?.type || 'local';
}

function hasEncodingDamage(text) {
  const value = String(text || '');
  return value.includes('\uFFFD') || /D:\\\?{2,}|D:\/\?{2,}|\?{3,}/.test(value);
}

function normalizeMemory(record, index, projectRoot) {
  const sourceFile = sourcePath(record, projectRoot);
  const isArchive = record?.type === 'conversation_archive' || record?.source?.kind === 'conversation_archive';
  const limit = isArchive ? 500 : 700;
  const content = compactText(record?.content || record?.summary || '', limit);
  return {
    id: record?.id || `memory-${index + 1}`,
    timestamp: record?.timestamp || '',
    title: record?.title || firstLine(record?.content) || '(无标题记忆)',
    type: record?.type || 'memory',
    layer: record?.layer || 'semantic',
    importance: record?.importance || 'normal',
    confidence: record?.confidence || 'unknown',
    reusable: Boolean(record?.reusable),
    needsVerification: Boolean(record?.needsVerification || record?.needs_verification),
    project: record?.project || '',
    concepts: Array.isArray(record?.concepts) ? record.concepts : [],
    files: Array.isArray(record?.files) ? record.files : [],
    sourceKind: sourceLabel(record),
    sourcePath: sourceFile ? toRel(projectRoot, sourceFile) : '',
    sourceUrl: sourceFile && fs.existsSync(sourceFile) ? fileLink(sourceFile) : '',
    content: content.text,
    truncated: content.truncated,
    encodingWarning: hasEncodingDamage(record?.content) || hasEncodingDamage(record?.title),
  };
}

function mergeVnextMemory(memory, indexed) {
  if (!indexed) return memory;
  return {
    ...memory,
    quality: indexed.quality || null,
    coveredBy: indexed.coveredBy || null,
    deploymentProjects: indexed.deploymentProjects || [],
    primaryDeploymentProject: indexed.primaryDeploymentProject || null,
    recallText: [memory.title, memory.content, memory.sourceKind, memory.sourcePath, ...(memory.concepts || []), ...(memory.files || [])].join('\n').toLowerCase(),
  };
}

function firstLine(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function countBy(items, key) {
  const result = {};
  for (const item of items) {
    const value = item[key] || 'unknown';
    result[value] = (result[value] || 0) + 1;
  }
  return result;
}

function latestGoalSnapshots(records) {
  const latestById = new Map();
  for (const goal of records.filter((record) => record?.kind === 'goal')) {
    const existing = latestById.get(goal.id);
    if (!existing || String(goal.updatedAt || goal.createdAt || '').localeCompare(String(existing.updatedAt || existing.createdAt || '')) >= 0) {
      latestById.set(goal.id, goal);
    }
  }
  return [...latestById.values()].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function normalizeGoal(goal, projectRoot, eventsByGoal, heartbeatsByGoal, watchdogByGoal, resumeByGoal) {
  const fallbackCompletionPath = path.join(projectRoot, '.codex', 'memory', 'am', 'goal-completions', goal.id || '');
  const completionPath = goal?.completion?.packetPath ? path.resolve(projectRoot, goal.completion.packetPath) : fallbackCompletionPath;
  const heartbeats = heartbeatsByGoal.get(goal.id) || [];
  const watchdog = watchdogByGoal.get(goal.id) || [];
  const resumePackets = resumeByGoal.get(goal.id) || [];
  const participants = latestParticipants(heartbeats);
  const openResumePackets = resumePackets.filter((packet) => packet.status === 'open');
  const resolvedResumePackets = resumePackets.filter((packet) => packet.status === 'resolved');
  return {
    id: goal.id,
    title: goal.title || '(无标题目标)',
    objective: goal.objective || '',
    status: goal.status || 'active',
    projectRoot: goal.projectRoot || '',
    createdAt: goal.createdAt || '',
    updatedAt: goal.updatedAt || '',
    successCriteria: Array.isArray(goal.successCriteria) ? goal.successCriteria : [],
    progressSummary: goal.progressSummary || '',
    nextActions: Array.isArray(goal.nextActions) ? goal.nextActions : [],
    evidenceRefs: Array.isArray(goal.evidenceRefs) ? goal.evidenceRefs : [],
    archiveRefs: Array.isArray(goal.archiveRefs) ? goal.archiveRefs : [],
    completion: goal.completion || null,
    completionUrl: fs.existsSync(completionPath) ? fileLink(completionPath) : '',
    completionPath: goal?.completion?.packetPath || '',
    events: (eventsByGoal.get(goal.id) || []).slice(0, 40),
    heartbeats: heartbeats.slice(0, 80),
    participants,
    watchdog: watchdog.slice(0, 80),
    resumePackets: resumePackets.slice(0, 20),
    openResumePackets: openResumePackets.slice(0, 20),
    resolvedResumePackets: resolvedResumePackets.slice(0, 20),
    latestStageReview: watchdog.find((item) => item.type === 'stage_review') || null,
    latestCompletionAudit: watchdog.find((item) => item.type === 'completion_audit') || null,
    latestWatchdogCheck: watchdog.find((item) => item.type === 'watchdog_check') || null,
  };
}

function latest(items, count) {
  return [...items]
    .sort((a, b) => String(b.timestamp || b.mtime || '').localeCompare(String(a.timestamp || a.mtime || '')))
    .slice(0, count);
}

function groupByGoal(records) {
  const map = new Map();
  for (const record of records) {
    if (!record?.goalId) {
      continue;
    }
    if (!map.has(record.goalId)) {
      map.set(record.goalId, []);
    }
    map.get(record.goalId).push(record);
  }
  for (const list of map.values()) {
    list.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  }
  return map;
}

function latestParticipants(heartbeats) {
  const map = new Map();
  for (const heartbeat of heartbeats) {
    const id = heartbeat.participantId || 'participant';
    const existing = map.get(id);
    if (!existing || String(heartbeat.timestamp || '').localeCompare(String(existing.timestamp || '')) >= 0) {
      map.set(id, heartbeat);
    }
  }
  return [...map.values()].sort((a, b) => String(a.participantId || '').localeCompare(String(b.participantId || '')));
}

function escHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function jsonScript(value) {
  return JSON.stringify(value).replaceAll('</script', '<\\/script');
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n > 1024 * 1024) {
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }
  if (n > 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${n} B`;
}

async function buildData(projectRoot) {
  const paths = amPaths(projectRoot);
  const [
    rawMemories,
    sessions,
    maintenance,
    tombstones,
    rawGoals,
    rawGoalEvents,
    rawGoalHeartbeats,
    rawGoalWatchdog,
    rawGoalResumePackets,
    rawTurnWatches,
    rawResumeAutomationRequests,
    archiveFiles,
  ] = await Promise.all([
    readJsonl(paths.memories),
    readJsonl(paths.sessions),
    readJsonl(paths.maintenance),
    readJsonl(paths.tombstones),
    readJsonl(paths.goals),
    readJsonl(paths.goalEvents),
    readJsonl(paths.goalHeartbeats),
    readJsonl(paths.goalWatchdog),
    readJsonl(paths.goalResumePackets),
    readJsonl(paths.turnWatches),
    readJsonl(paths.resumeAutomationRequests),
    listArchiveFiles(paths.archiveRoot),
  ]);
  const tombstoned = new Set(tombstones.map((item) => item?.targetId).filter(Boolean));
  const memories = rawMemories
    .filter((record) => record?.kind === 'memory' && !tombstoned.has(record.id))
    .map((record, index) => normalizeMemory(record, index, projectRoot))
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const goalEvents = rawGoalEvents
    .filter((record) => record?.kind === 'goal_event')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const eventsByGoal = new Map();
  for (const event of goalEvents) {
    if (!eventsByGoal.has(event.goalId)) {
      eventsByGoal.set(event.goalId, []);
    }
    eventsByGoal.get(event.goalId).push(event);
  }
  const goalHeartbeats = rawGoalHeartbeats
    .filter((record) => record?.kind === 'goal_heartbeat')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const goalWatchdog = rawGoalWatchdog
    .filter((record) => record?.kind === 'goal_watchdog')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const goalResumePackets = rawGoalResumePackets
    .filter((record) => record?.kind === 'goal_resume_packet')
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const turnWatches = rawTurnWatches
    .filter((record) => record?.kind === 'turn_watch')
    .sort((a, b) => String(b.updatedAt || b.timestamp).localeCompare(String(a.updatedAt || a.timestamp)));
  const resumeAutomationRequests = rawResumeAutomationRequests
    .filter((record) => record?.kind === 'resume_automation_request')
    .sort((a, b) => String(b.updatedAt || b.timestamp).localeCompare(String(a.updatedAt || a.timestamp)));
  const heartbeatsByGoal = groupByGoal(goalHeartbeats);
  const watchdogByGoal = groupByGoal(goalWatchdog);
  const resumeByGoal = groupByGoal(goalResumePackets);
  const goals = latestGoalSnapshots(rawGoals)
    .map((goal) => normalizeGoal(goal, projectRoot, eventsByGoal, heartbeatsByGoal, watchdogByGoal, resumeByGoal));
  const [vnextIndex, healthReport, cleanupPlan, goalBoard] = await Promise.all([
    buildMemoryIndex(projectRoot, { write: true, includeMemories: true, memoryLimit: 10000 }),
    buildHealthReport(projectRoot),
    cleanupDryRun(projectRoot, { limit: 300 }),
    buildGoalBoard(projectRoot),
  ]);
  const indexedById = new Map((vnextIndex.memories || []).map((memory) => [memory.id, memory]));
  const enhancedMemories = memories.map((memory) => mergeVnextMemory(memory, indexedById.get(memory.id)));
  const stats = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    storePath: paths.root,
    viewerPath: paths.viewer,
    memories: memories.length,
    rawMemories: rawMemories.filter((record) => record?.kind === 'memory').length,
    archives: archiveFiles.length,
    sessions: sessions.length,
    maintenance: maintenance.length,
    goals: goals.length,
    activeGoals: goals.filter((goal) => goal.status === 'active').length,
    goalHeartbeats: goalHeartbeats.length,
    goalWatchdog: goalWatchdog.length,
    goalResumePackets: goalResumePackets.length,
    turnWatches: turnWatches.length,
    resumeAutomationRequests: resumeAutomationRequests.length,
    tombstones: tombstones.length,
    encodingWarnings: healthReport.counts.encodingWarnings,
    duplicateGroups: healthReport.counts.duplicateGroups,
    orphanResumePackets: healthReport.counts.orphanResumePackets,
    staleGoals: healthReport.counts.staleGoals,
    coveredMemories: healthReport.counts.coveredMemories || 0,
    deploymentProjects: vnextIndex.projectBoard?.projects?.length || 0,
    assignedDeploymentMemories: vnextIndex.projectBoard?.summary?.assignedMemories || 0,
    unassignedProjectMemories: vnextIndex.projectBoard?.summary?.unassignedMemories || 0,
    cleanupActions: cleanupPlan.summary.suggestedActions,
    layers: countBy(memories, 'layer'),
    types: countBy(memories, 'type'),
    files: {
      memories: formatBytes(await fileSize(paths.memories)),
      events: formatBytes(await fileSize(paths.events)),
      sessions: formatBytes(await fileSize(paths.sessions)),
      maintenance: formatBytes(await fileSize(paths.maintenance)),
      goalHeartbeats: formatBytes(await fileSize(paths.goalHeartbeats)),
      goalWatchdog: formatBytes(await fileSize(paths.goalWatchdog)),
      goalResumePackets: formatBytes(await fileSize(paths.goalResumePackets)),
      turnWatches: formatBytes(await fileSize(paths.turnWatches)),
      resumeAutomationRequests: formatBytes(await fileSize(paths.resumeAutomationRequests)),
    },
  };
  return {
    stats,
    memories: enhancedMemories,
    goals,
    vnext: {
      index: {
        generatedAt: vnextIndex.generatedAt,
        stats: vnextIndex.stats,
        facets: vnextIndex.facets,
        duplicateGroups: vnextIndex.duplicateGroups,
      },
      health: healthReport,
      cleanup: cleanupPlan,
      goalBoard,
      projectBoard: vnextIndex.projectBoard,
    },
    goalEvents,
    archives: archiveFiles,
    sessions: latest(sessions, 80),
    maintenance: latest(maintenance, 120),
    rawFiles: [
      { label: 'memories.jsonl', path: paths.memories, url: fileLink(paths.memories), size: stats.files.memories },
      { label: 'events.jsonl', path: paths.events, url: fileLink(paths.events), size: stats.files.events },
      { label: 'sessions.jsonl', path: paths.sessions, url: fileLink(paths.sessions), size: stats.files.sessions },
      { label: 'maintenance.jsonl', path: paths.maintenance, url: fileLink(paths.maintenance), size: stats.files.maintenance },
      { label: 'goals.jsonl', path: paths.goals, url: fileLink(paths.goals), size: formatBytes(await fileSize(paths.goals)) },
      { label: 'goal-events.jsonl', path: paths.goalEvents, url: fileLink(paths.goalEvents), size: formatBytes(await fileSize(paths.goalEvents)) },
      { label: 'goal-heartbeats.jsonl', path: paths.goalHeartbeats, url: fileLink(paths.goalHeartbeats), size: stats.files.goalHeartbeats },
      { label: 'goal-watchdog.jsonl', path: paths.goalWatchdog, url: fileLink(paths.goalWatchdog), size: stats.files.goalWatchdog },
      { label: 'goal-resume-packets.jsonl', path: paths.goalResumePackets, url: fileLink(paths.goalResumePackets), size: stats.files.goalResumePackets },
      { label: 'turn-watches.jsonl', path: paths.turnWatches, url: fileLink(paths.turnWatches), size: stats.files.turnWatches },
      { label: 'resume-automation-requests.jsonl', path: paths.resumeAutomationRequests, url: fileLink(paths.resumeAutomationRequests), size: stats.files.resumeAutomationRequests },
      { label: 'am-project-board.json', path: path.join(paths.root, 'am-project-board.json'), url: fileLink(path.join(paths.root, 'am-project-board.json')), size: formatBytes(await fileSize(path.join(paths.root, 'am-project-board.json'))) },
      { label: 'goal-completions', path: paths.goalCompletions, url: fileLink(paths.goalCompletions), size: `${goals.filter((goal) => goal.completion).length} completed` },
      { label: 'conversation archive', path: paths.archiveRoot, url: fileLink(paths.archiveRoot), size: `${archiveFiles.length} files` },
    ],
    turnWatches: turnWatches.slice(0, 40),
    resumeAutomationRequests: resumeAutomationRequests.slice(0, 40),
  };
}

function renderHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AM 本地记忆查看器</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --panel: #ffffff;
      --panel-soft: #f0f5ff;
      --line: #d6e0ef;
      --line-strong: #b8c8dc;
      --text: #13213a;
      --muted: #5a6d87;
      --blue: #1f65d6;
      --blue-soft: #e6f0ff;
      --gold: #ad7c1d;
      --green: #157347;
      --red: #b42318;
      --shadow: 0 16px 40px rgba(18, 38, 63, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 236px minmax(0, 1fr); }
    aside {
      border-right: 1px solid var(--line);
      background: #eef3fa;
      padding: 22px 16px;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; margin-bottom: 24px; }
    .logo {
      width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center;
      color: #fff; background: var(--blue); font-weight: 900;
    }
    nav { display: grid; gap: 8px; }
    .nav-btn {
      border: 1px solid transparent;
      background: transparent;
      color: #173154;
      border-radius: 8px;
      padding: 11px 12px;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .nav-btn.active { background: var(--blue-soft); color: #075bd8; font-weight: 700; }
    main { padding: 26px 28px 42px; min-width: 0; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
    h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.1; }
    .sub { color: var(--muted); margin: 0; line-height: 1.55; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      border-radius: 8px;
      padding: 9px 12px;
      font: inherit;
      cursor: pointer;
      min-height: 38px;
    }
    .btn.primary { background: var(--blue); color: #fff; border-color: var(--blue); }
    .grid { display: grid; gap: 12px; }
    .stats { grid-template-columns: repeat(6, minmax(130px, 1fr)); margin: 18px 0; }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .stat { padding: 15px 16px; box-shadow: none; }
    .stat .label { color: var(--muted); font-size: 13px; }
    .stat .value { font-size: 28px; font-weight: 900; margin-top: 4px; }
    .toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 160px 160px 110px; gap: 10px; margin: 18px 0 12px; }
    input, select {
      width: 100%;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      border-radius: 8px;
      padding: 10px 11px;
      font: inherit;
      min-height: 40px;
    }
    label.check {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--muted);
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 8px;
      padding: 8px 10px;
      min-height: 40px;
    }
    label.check input { width: auto; min-height: 0; }
    .section { display: none; }
    .section.active { display: block; }
    .list { display: grid; gap: 10px; }
    .memory { padding: 15px 16px; box-shadow: none; }
    .memory-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; margin-bottom: 8px; }
    .memory-title { font-weight: 800; font-size: 16px; line-height: 1.35; }
    .meta { color: var(--muted); font-size: 12px; line-height: 1.55; }
    .badges { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      background: #f2f5f9;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 3px 8px;
      color: #263b5a;
      font-size: 12px;
      max-width: 100%;
    }
    .badge.high { background: #fff5db; border-color: #f2d18a; color: #734e05; }
    .badge.good { background: #eaf8ef; border-color: #bbe3c8; color: var(--green); }
    .badge.warn { background: #fff0ed; border-color: #ffc7bf; color: var(--red); }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #f8fbff;
      border: 1px dashed var(--line-strong);
      border-radius: 8px;
      padding: 12px;
      margin: 10px 0 0;
      color: #213654;
      font: 13px/1.55 Consolas, "Microsoft YaHei", monospace;
      max-height: 340px;
      overflow: auto;
    }
    .two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .panel { padding: 16px; box-shadow: none; }
    .panel h2 { margin: 0 0 10px; font-size: 18px; }
    .empty { color: var(--muted); padding: 18px; border: 1px dashed var(--line-strong); border-radius: 8px; background: #fbfdff; }
    .tiny { font-size: 12px; color: var(--muted); }
    .render-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .render-error {
      color: var(--red);
      border: 1px solid #ffc7bf;
      background: #fff6f4;
      border-radius: 8px;
      padding: 12px;
      white-space: pre-wrap;
    }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td { text-align: left; border-bottom: 1px solid var(--line); padding: 10px 8px; vertical-align: top; }
    .table th { color: var(--muted); font-size: 12px; font-weight: 700; }
    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      aside { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
      nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .stats, .two, .toolbar { grid-template-columns: 1fr; }
      main { padding: 20px 16px 34px; }
      .topbar { display: block; }
      .actions { margin-top: 12px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand"><div class="logo">AM</div><span>本地记忆</span></div>
      <nav>
        <button class="nav-btn active" data-tab="memories">对话与长期记忆</button>
        <button class="nav-btn" data-tab="goals">目标 Goal</button>
        <button class="nav-btn" data-tab="archives">完整对话归档</button>
        <button class="nav-btn" data-tab="lessons">经验反思</button>
        <button class="nav-btn" data-tab="maintenance">维护记录</button>
        <button class="nav-btn" data-tab="files">原始文件</button>
      </nav>
    </aside>
    <main>
      <div class="topbar">
        <div>
          <h1>AM 本地记忆查看器</h1>
          <p class="sub">这是静态 HTML，只读取本地 AM 文件和完整对话归档；不启动 REST、viewer、health 或任何端口。</p>
        </div>
        <div class="actions">
          <button class="btn primary" onclick="location.reload()">刷新本页</button>
          <a class="btn" href="${escHtml(fileLink(data.stats.storePath))}">打开数据目录</a>
          <div class="render-note" id="refreshNote">生成时间：${escHtml(data.stats.generatedAt)} · 切换面板会重新渲染当前数据；新记忆写入后请重新运行 View-AM-Memory.ps1 生成最新快照</div>
        </div>
      </div>

      <div class="grid stats">
        <div class="card stat"><div class="label">可用记忆</div><div class="value">${data.stats.memories}</div></div>
        <div class="card stat"><div class="label">目标</div><div class="value">${data.stats.goals}</div></div>
        <div class="card stat"><div class="label">完整归档</div><div class="value">${data.stats.archives}</div></div>
        <div class="card stat"><div class="label">维护记录</div><div class="value">${data.stats.maintenance}</div></div>
        <div class="card stat"><div class="label">已遗忘标记</div><div class="value">${data.stats.tombstones}</div></div>
        <div class="card stat"><div class="label">编码告警</div><div class="value">${data.stats.encodingWarnings}</div></div>
      </div>

      <section id="memories" class="section active">
        <div class="toolbar">
          <input id="q" placeholder="筛选标题、内容、来源、标签" />
          <select id="typeFilter"><option value="">全部类型</option></select>
          <select id="layerFilter"><option value="">全部层级</option></select>
          <label class="check"><input id="importantOnly" type="checkbox" />只看重要</label>
        </div>
        <div id="memoryList" class="list"></div>
      </section>

      <section id="goals" class="section">
        <div class="card panel">
          <h2>目标 Goal</h2>
          <p class="sub">这里展示 AI 自动维护的长期目标、进度、证据、完成包和阻塞记录。这个页面只读，不需要你手动填。</p>
        </div>
        <div id="goalList" class="list" style="margin-top:12px"></div>
      </section>

      <section id="archives" class="section">
        <div class="grid two">
          <div class="card panel">
            <h2>完整对话归档</h2>
            <p class="sub">归档保留完整原文；查看器只显示预览，点开源文件看全部内容。</p>
          </div>
          <div class="card panel">
            <h2>归档用途</h2>
            <p class="sub">AM 的摘要、事实、经验和项目状态都应该从这些原文派生，避免只存少量摘要导致新对话读不到真实上下文。</p>
          </div>
        </div>
        <div id="archiveList" class="list" style="margin-top:12px"></div>
      </section>

      <section id="lessons" class="section">
        <div class="card panel">
          <h2>经验反思</h2>
          <p class="sub">这里筛出 procedural、reflection、lesson、diagnostic 等长期工作规则。它不是人工维护面板，是给 AI 下次工作前看的。</p>
        </div>
        <div id="lessonList" class="list" style="margin-top:12px"></div>
      </section>

      <section id="maintenance" class="section">
        <div class="card panel">
          <h2>维护记录</h2>
          <p class="sub">显示归档、总结、整理、反思、诊断等本地 AM 链路最近做了什么。没有端口健康页，能读写这些文件就是可用。</p>
        </div>
        <div id="maintenanceList" class="list" style="margin-top:12px"></div>
      </section>

      <section id="files" class="section">
        <div class="card panel">
          <h2>原始文件</h2>
          <table class="table" id="rawFiles"></table>
        </div>
      </section>
    </main>
  </div>

  <script id="am-data" type="application/json">${jsonScript(data)}</script>
  <script>
    const data = JSON.parse(document.getElementById('am-data').textContent);
    const validTabs = new Set(['memories', 'goals', 'archives', 'lessons', 'maintenance', 'files']);
    const tabFromHash = () => {
      const value = String(location.hash || '').replace(/^#/, '');
      return validTabs.has(value) ? value : 'memories';
    };
    const state = { tab: tabFromHash(), query: '', type: '', layer: '', importantOnly: false, lastHiddenAt: 0 };
    const $ = (id) => document.getElementById(id);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const fmtDate = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未知时间';
    const includes = (item, q) => [item.title, item.content, item.sourcePath, item.sourceKind, ...(item.concepts || []), ...(item.files || [])].join('\\n').toLowerCase().includes(q);

    function badge(text, cls = '') {
      return '<span class="badge ' + cls + '">' + esc(text) + '</span>';
    }

    function populateFilters() {
      const types = [...new Set(data.memories.map(item => item.type).filter(Boolean))].sort();
      const layers = [...new Set(data.memories.map(item => item.layer).filter(Boolean))].sort();
      $('typeFilter').innerHTML += types.map(type => '<option value="' + esc(type) + '">' + esc(type) + '</option>').join('');
      $('layerFilter').innerHTML += layers.map(layer => '<option value="' + esc(layer) + '">' + esc(layer) + '</option>').join('');
    }

    function renderMemory(item) {
      const source = item.sourceUrl
        ? '<a href="' + esc(item.sourceUrl) + '">' + esc(item.sourcePath || item.sourceKind) + '</a>'
        : esc(item.sourcePath || item.sourceKind || 'local');
      const concepts = (item.concepts || []).slice(0, 12).map(x => badge(x)).join('');
      const flags = [
        badge(item.layer),
        badge(item.type),
        item.importance === 'high' || item.importance === 'critical' ? badge('重要', 'high') : '',
        item.reusable ? badge('可复用', 'good') : '',
        item.needsVerification ? badge('需复核', 'warn') : '',
        item.encodingWarning ? badge('历史编码损坏', 'warn') : '',
        item.truncated ? badge('已截断', 'warn') : '',
      ].join('');
      return '<article class="card memory" id="' + esc(item.id) + '">'
        + '<div class="memory-head"><div><div class="memory-title">' + esc(item.title) + '</div><div class="meta">' + fmtDate(item.timestamp) + ' · 来源：' + source + '</div></div><div class="meta">' + esc(item.confidence) + '</div></div>'
        + '<div class="badges">' + flags + concepts + '</div>'
        + '<pre>' + esc(item.content || item.summary || '') + '</pre>'
        + '</article>';
    }

    function filteredMemories() {
      const q = state.query.trim().toLowerCase();
      return data.memories.filter(item => {
        if (q && !includes(item, q)) return false;
        if (state.type && item.type !== state.type) return false;
        if (state.layer && item.layer !== state.layer) return false;
        if (state.importantOnly && !(item.importance === 'high' || item.importance === 'critical' || item.reusable)) return false;
        return true;
      });
    }

    function renderMemories() {
      const items = filteredMemories().slice(0, 300);
      $('memoryList').innerHTML = items.length
        ? items.map(renderMemory).join('')
        : '<div class="empty">没有匹配的记忆。</div>';
      updateRefreshNote('对话与长期记忆已刷新，显示 ' + items.length + ' 条。');
    }

    function renderArchives() {
      $('archiveList').innerHTML = data.archives.length
        ? data.archives.map(item => '<article class="card memory"><div class="memory-head"><div><div class="memory-title"><a href="' + esc(item.url) + '">' + esc(item.relativePath) + '</a></div><div class="meta">' + fmtDate(item.mtime) + ' · ' + esc(item.size) + ' bytes</div></div></div><pre>' + esc(item.preview) + '</pre></article>').join('')
        : '<div class="empty">还没有完整对话归档。</div>';
      updateRefreshNote('完整对话归档已刷新，显示 ' + data.archives.length + ' 个归档。');
    }

    function renderGoal(goal) {
      const latestCheck = goal.latestWatchdogCheck || {};
      const latestAudit = goal.latestCompletionAudit || {};
      const latestStage = goal.latestStageReview || {};
      const flags = [
        badge(goal.status, goal.status === 'completed' ? 'good' : goal.status === 'blocked' ? 'warn' : goal.status === 'active' ? 'high' : ''),
        goal.completion ? badge('已生成完成包', 'good') : '',
        latestCheck.status ? badge('监督 ' + latestCheck.status, latestCheck.status === 'PASS' ? 'good' : 'warn') : '',
        latestAudit.status ? badge('验收 ' + latestAudit.status, latestAudit.status === 'PASS' ? 'good' : 'warn') : '',
        goal.openResumePackets && goal.openResumePackets.length ? badge('未解决恢复包 ' + goal.openResumePackets.length, 'warn') : '',
        goal.resolvedResumePackets && goal.resolvedResumePackets.length ? badge('已解决恢复包 ' + goal.resolvedResumePackets.length, 'good') : '',
        goal.participants && goal.participants.length ? badge('参与者 ' + goal.participants.length) : '',
        goal.archiveRefs && goal.archiveRefs.length ? badge('归档 ' + goal.archiveRefs.length) : '',
        goal.evidenceRefs && goal.evidenceRefs.length ? badge('证据 ' + goal.evidenceRefs.length) : '',
      ].join('');
      const criteria = (goal.successCriteria || []).map(item => '- ' + item).join('\\n') || '暂无成功标准。';
      const next = (goal.nextActions || []).map(item => '- ' + item).join('\\n') || '暂无下一步。';
      const events = (goal.events || []).slice(0, 8).map(event => '<div class="meta">' + fmtDate(event.timestamp) + ' · ' + esc(event.eventType) + '</div><pre>' + esc(event.summary || '') + '</pre>').join('');
      const participants = (goal.participants || []).slice(0, 12).map(item => '<tr><td>' + esc(item.participantId || '') + '</td><td>' + esc(item.status || '') + '</td><td>' + esc(item.kind || '') + '</td><td>' + esc(item.taskId || '') + '</td><td>' + fmtDate(item.timestamp) + '</td><td>' + esc(item.lastProof || '') + '</td></tr>').join('');
      const resumePackets = (goal.openResumePackets || []).slice(0, 5).map(item => '<div class="meta">' + fmtDate(item.timestamp) + ' · ' + esc(item.reason || item.status || 'resume') + ' · ' + esc(item.resumeTrigger || '') + ' · ' + esc(item.incidentKey || '') + '</div><pre>' + esc(item.instruction || item.summary || JSON.stringify(item.missingCriteria || [], null, 2)) + '</pre>').join('');
      const resolvedPackets = (goal.resolvedResumePackets || []).slice(0, 5).map(item => '<div class="meta">' + fmtDate(item.resolvedAt || item.timestamp) + ' · ' + esc(item.resolution || 'resolved') + ' · ' + esc(item.incidentKey || '') + '</div><pre>' + esc(item.instruction || '') + '</pre>').join('');
      const auditRows = (latestAudit.criteria || []).map(item => '<tr><td>' + esc(item.status || '') + '</td><td>' + esc(item.criterion || '') + '</td><td>' + esc(item.note || '') + '</td></tr>').join('');
      const stageReview = latestStage.summary || latestStage.drift || latestStage.lessons
        ? '<div class="badges">' + badge('阶段复盘') + (latestStage.drift ? badge('方向 ' + latestStage.drift, latestStage.drift === 'on_track' ? 'good' : 'warn') : '') + '</div><pre>' + esc(JSON.stringify({ summary: latestStage.summary, drift: latestStage.drift, nextActions: latestStage.nextActions, lessons: latestStage.lessons }, null, 2)) + '</pre>'
        : '';
      const completion = goal.completionUrl
        ? '<div class="meta">完成包：<a href="' + esc(goal.completionUrl) + '">' + esc(goal.completionPath || goal.id) + '</a></div>'
        : '';
      return '<article class="card memory">'
        + '<div class="memory-head"><div><div class="memory-title">' + esc(goal.title) + '</div><div class="meta">' + fmtDate(goal.updatedAt || goal.createdAt) + ' · ' + esc(goal.projectRoot || '') + '</div></div></div>'
        + '<div class="badges">' + flags + '</div>'
        + '<pre>Objective:\\n' + esc(goal.objective || '') + '\\n\\nSuccess criteria:\\n' + esc(criteria) + '\\n\\nProgress:\\n' + esc(goal.progressSummary || '') + '\\n\\nNext actions:\\n' + esc(next) + '</pre>'
        + completion
        + (participants ? '<div class="badges">' + badge('参与者心跳') + '</div><table class="table compact"><thead><tr><th>参与者</th><th>状态</th><th>类型</th><th>任务</th><th>最后心跳</th><th>证明</th></tr></thead><tbody>' + participants + '</tbody></table>' : '')
        + (resumePackets ? '<div class="badges">' + badge('未解决恢复包', 'warn') + '</div>' + resumePackets : '')
        + (resolvedPackets ? '<div class="badges">' + badge('已解决恢复包', 'good') + '</div>' + resolvedPackets : '')
        + (auditRows ? '<div class="badges">' + badge('完成验收') + '</div><table class="table compact"><thead><tr><th>状态</th><th>标准</th><th>说明</th></tr></thead><tbody>' + auditRows + '</tbody></table>' : '')
        + stageReview
        + (events ? '<div class="badges">' + badge('最近事件') + '</div>' + events : '')
        + '</article>';
    }

    function renderGoals() {
      const active = data.goals.filter(goal => goal.status === 'active');
      const rest = data.goals.filter(goal => goal.status !== 'active');
      const ordered = [...active, ...rest];
      $('goalList').innerHTML = ordered.length
        ? ordered.map(renderGoal).join('')
        : '<div class="empty">还没有 AM Goal。AI 在接到长期目标时会自动创建并维护。</div>';
      updateRefreshNote('目标 Goal 已刷新，显示 ' + ordered.length + ' 个目标。');
    }

    function renderLessons() {
      const items = data.memories.filter(item => {
        const key = [item.type, item.layer, item.title, ...(item.concepts || [])].join(' ').toLowerCase();
        return key.includes('lesson') || key.includes('reflection') || key.includes('diagnostic') || key.includes('procedural') || key.includes('workflow-rule');
      }).slice(0, 120);
      $('lessonList').innerHTML = items.length ? items.map(renderMemory).join('') : '<div class="empty">还没有提取到经验反思；对话结束维护会继续追加。</div>';
      updateRefreshNote('经验反思已刷新，显示 ' + items.length + ' 条。');
    }

    function renderMaintenance() {
      $('maintenanceList').innerHTML = data.maintenance.length
        ? data.maintenance.map(item => '<article class="card memory"><div class="memory-head"><div><div class="memory-title">' + esc(item.type || item.kind || 'maintenance') + '</div><div class="meta">' + fmtDate(item.timestamp) + ' · ' + esc(item.status || '记录') + '</div></div></div><pre>' + esc(JSON.stringify(item.result || item.data || item, null, 2)) + '</pre></article>').join('')
        : '<div class="empty">还没有维护记录。</div>';
      updateRefreshNote('维护记录已刷新，显示 ' + data.maintenance.length + ' 条。');
    }

    function renderRawFiles() {
      $('rawFiles').innerHTML = '<thead><tr><th>文件</th><th>大小</th><th>路径</th></tr></thead><tbody>'
        + data.rawFiles.map(item => '<tr><td><a href="' + esc(item.url) + '">' + esc(item.label) + '</a></td><td>' + esc(item.size) + '</td><td><span class="tiny">' + esc(item.path) + '</span></td></tr>').join('')
        + '</tbody>';
      updateRefreshNote('原始文件列表已刷新。');
    }

    function updateRefreshNote(message) {
      const note = $('refreshNote');
      if (!note) return;
      note.textContent = message + ' 生成时间：' + data.stats.generatedAt;
    }

    function showRenderError(tab, error) {
      const targetByTab = {
        memories: 'memoryList',
        goals: 'goalList',
        archives: 'archiveList',
        lessons: 'lessonList',
        maintenance: 'maintenanceList',
        files: 'rawFiles',
      };
      const target = $(targetByTab[tab]);
      if (!target) return;
      const message = error && error.stack ? error.stack : String(error || '未知渲染错误');
      target.innerHTML = '<div class="render-error">当前面板刷新失败：\\n' + esc(message) + '</div>';
    }

    function renderCurrentTab() {
      try {
        if (state.tab === 'memories') renderMemories();
        else if (state.tab === 'goals') renderGoals();
        else if (state.tab === 'archives') renderArchives();
        else if (state.tab === 'lessons') renderLessons();
        else if (state.tab === 'maintenance') renderMaintenance();
        else if (state.tab === 'files') renderRawFiles();
      } catch (error) {
        showRenderError(state.tab, error);
      }
    }

    function setTab(tab) {
      tab = validTabs.has(tab) ? tab : 'memories';
      state.tab = tab;
      if (location.hash !== '#' + tab) {
        history.replaceState(null, '', '#' + tab);
      }
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
      document.querySelectorAll('.section').forEach(section => section.classList.toggle('active', section.id === tab));
      renderCurrentTab();
    }

    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
    $('q').addEventListener('input', (event) => { state.query = event.target.value; state.tab = 'memories'; renderCurrentTab(); });
    $('typeFilter').addEventListener('change', (event) => { state.type = event.target.value; state.tab = 'memories'; renderCurrentTab(); });
    $('layerFilter').addEventListener('change', (event) => { state.layer = event.target.value; state.tab = 'memories'; renderCurrentTab(); });
    $('importantOnly').addEventListener('change', (event) => { state.importantOnly = event.target.checked; state.tab = 'memories'; renderCurrentTab(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        state.lastHiddenAt = Date.now();
        return;
      }
      if (state.lastHiddenAt && Date.now() - state.lastHiddenAt > 15000) {
        location.reload();
      }
    });
    window.addEventListener('focus', () => renderCurrentTab());
    window.addEventListener('hashchange', () => setTab(tabFromHash()));

    populateFilters();
    setTab(state.tab);
  </script>
</body>
</html>
`;
}

function renderVnextHtml(data) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AM Console</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#090d12;
      --panel:#101720;
      --panel2:#0d131b;
      --line:#273544;
      --line2:#384b5f;
      --text:#e7edf4;
      --muted:#94a5b7;
      --blue:#28b7ff;
      --green:#4bd38a;
      --gold:#f4c25d;
      --red:#ff6f7f;
      --shadow:0 18px 50px rgba(0,0,0,.28);
    }
    * { box-sizing:border-box; }
    body {
      margin:0;
      font-family:"Microsoft YaHei","Segoe UI",system-ui,sans-serif;
      background:var(--bg);
      color:var(--text);
      letter-spacing:0;
    }
    button,input,select { font:inherit; }
    button {
      border:1px solid var(--line2);
      background:#121c27;
      color:var(--text);
      border-radius:8px;
      padding:9px 11px;
      cursor:pointer;
    }
    button.active,button.primary { border-color:rgba(40,183,255,.75); background:rgba(40,183,255,.14); }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .app { min-height:100vh; display:grid; grid-template-columns:244px minmax(0,1fr); }
    aside {
      position:sticky;
      top:0;
      height:100vh;
      padding:18px 14px;
      border-right:1px solid var(--line);
      background:#0c1219;
    }
    .brand { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
    .mark { width:34px; height:34px; border-radius:8px; display:grid; place-items:center; background:linear-gradient(135deg,#28b7ff,#4bd38a); color:#061018; font-weight:900; }
    .brand h1 { margin:0; font-size:17px; line-height:1.2; }
    .brand small { color:var(--muted); display:block; margin-top:2px; }
    nav { display:grid; gap:7px; }
    .nav { text-align:left; width:100%; }
    main { padding:18px; min-width:0; }
    .top { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; margin-bottom:14px; }
    .title h2 { margin:0; font-size:24px; }
    .title .meta { margin-top:5px; }
    .meta,.muted { color:var(--muted); font-size:12px; line-height:1.45; }
    .toolbar { display:grid; grid-template-columns:minmax(180px,1.5fr) repeat(7,minmax(108px,.65fr)); gap:8px; margin-bottom:12px; }
    input,select {
      min-width:0;
      width:100%;
      border:1px solid var(--line);
      border-radius:8px;
      background:#0d141c;
      color:var(--text);
      padding:10px;
    }
    .metrics { display:grid; grid-template-columns:repeat(6,minmax(110px,1fr)); gap:10px; margin-bottom:12px; }
    .metric,.panel,.item {
      background:var(--panel);
      border:1px solid var(--line);
      border-radius:8px;
      box-shadow:var(--shadow);
    }
    .metric { padding:12px; box-shadow:none; }
    .metric small { color:var(--muted); display:block; margin-bottom:5px; }
    .metric b { font-size:24px; }
    .section { display:none; }
    .section.active { display:block; }
    .grid { display:grid; gap:10px; }
    .two { grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
    .three { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .panel { padding:13px; box-shadow:none; }
    .panel h3 { margin:0 0 10px; font-size:16px; }
    .list { display:grid; gap:9px; }
    .item { padding:12px; box-shadow:none; }
    .head { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
    .item h3 { margin:0; font-size:15px; line-height:1.35; }
    .badges { display:flex; flex-wrap:wrap; gap:6px; margin:8px 0; }
    .badge { display:inline-flex; max-width:100%; border:1px solid var(--line2); border-radius:999px; padding:3px 7px; font-size:11px; color:#c9d6e4; background:#121c27; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .badge.good { border-color:rgba(75,211,138,.5); color:#b9f5d0; background:rgba(75,211,138,.1); }
    .badge.warn { border-color:rgba(244,194,93,.55); color:#ffe2a0; background:rgba(244,194,93,.12); }
    .badge.bad { border-color:rgba(255,111,127,.55); color:#ffc2ca; background:rgba(255,111,127,.1); }
    .badge.blue { border-color:rgba(40,183,255,.52); color:#b9e8ff; background:rgba(40,183,255,.1); }
    pre {
      margin:8px 0 0;
      padding:10px;
      max-height:260px;
      overflow:auto;
      white-space:pre-wrap;
      word-break:break-word;
      border:1px dashed var(--line2);
      border-radius:8px;
      background:#0b1118;
      color:#d8e2ed;
      font:12px/1.5 Consolas,"Microsoft YaHei",monospace;
    }
    .score { min-width:54px; text-align:right; color:var(--muted); }
    .score b { color:var(--text); }
    .timeline { position:relative; display:grid; gap:8px; }
    .timeline .item { border-left:3px solid var(--blue); }
    .table { width:100%; border-collapse:collapse; }
    .table th,.table td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    .table th { color:var(--muted); font-size:12px; }
    .empty { border:1px dashed var(--line2); border-radius:8px; padding:14px; color:var(--muted); background:#0d141c; }
    @media (max-width:1180px) {
      .app { grid-template-columns:1fr; }
      aside { position:static; height:auto; border-right:0; border-bottom:1px solid var(--line); }
      nav { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .metrics { grid-template-columns:repeat(3,minmax(110px,1fr)); }
      .toolbar,.two,.three { grid-template-columns:1fr; }
      .top { display:block; }
    }
    @media (max-width:680px) {
      main { padding:12px; }
      nav { grid-template-columns:1fr 1fr; }
      .metrics { grid-template-columns:1fr 1fr; }
      .head { display:block; }
      .score { text-align:left; margin-top:8px; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <div class="brand"><div class="mark">AM</div><div><h1>AM Console</h1><small>local / stdio / no port</small></div></div>
      <nav>
        <button class="nav active" data-tab="projects">Project Board</button>
        <button class="nav" data-tab="search">Memory Search</button>
        <button class="nav" data-tab="timeline">Timeline</button>
        <button class="nav" data-tab="goals">Goal Board</button>
        <button class="nav" data-tab="resume">Resume Packets</button>
        <button class="nav" data-tab="encoding">Encoding Health</button>
        <button class="nav" data-tab="maintenance">Maintenance Queue</button>
        <button class="nav" data-tab="cleanup">Cleanup Dry Run</button>
        <button class="nav" data-tab="files">Raw Files</button>
      </nav>
    </aside>
    <main>
      <div class="top">
        <div class="title">
          <h2>Local Memory Platform</h2>
          <div class="meta">${escHtml(data.stats.generatedAt)} / ${escHtml(data.stats.projectRoot)}</div>
        </div>
        <div class="actions">
          <button class="primary" onclick="location.reload()">Refresh</button>
          <a class="button" href="${escHtml(fileLink(data.stats.storePath))}"><button>Open Store</button></a>
        </div>
      </div>

      <div class="metrics">
        <div class="metric"><small>Memories</small><b>${data.stats.memories}</b></div>
        <div class="metric"><small>Goals</small><b>${data.stats.goals}</b></div>
        <div class="metric"><small>Encoding</small><b>${data.stats.encodingWarnings}</b></div>
        <div class="metric"><small>Duplicates</small><b>${data.stats.duplicateGroups}</b></div>
        <div class="metric"><small>Projects</small><b>${data.stats.deploymentProjects}</b></div>
        <div class="metric"><small>Assigned</small><b>${data.stats.assignedDeploymentMemories}</b></div>
        <div class="metric"><small>Unassigned</small><b>${data.stats.unassignedProjectMemories}</b></div>
      </div>

      <section id="search" class="section">
        <div class="toolbar">
          <input id="query" placeholder="Search memories, concepts, files, sources" />
          <select id="projectFilter"><option value="">All deployed projects</option></select>
          <select id="conceptFilter"><option value="">All concepts</option></select>
          <select id="sourceFilter"><option value="">All sources</option></select>
          <select id="typeFilter"><option value="">All types</option></select>
          <select id="layerFilter"><option value="">All layers</option></select>
          <select id="importanceFilter"><option value="">All importance</option></select>
          <select id="qualityFilter"><option value="">All quality</option><option value="prefer">Prefer</option><option value="review_encoding">Encoding</option><option value="dedupe_demote">Duplicates</option><option value="downrank">Downrank</option></select>
        </div>
        <div id="memoryList" class="list"></div>
      </section>

      <section id="timeline" class="section">
        <div id="timelineList" class="timeline"></div>
      </section>

      <section id="projects" class="section active">
        <div id="projectList" class="list"></div>
      </section>

      <section id="goals" class="section">
        <div id="goalList" class="list"></div>
      </section>

      <section id="resume" class="section">
        <div id="resumeList" class="list"></div>
      </section>

      <section id="encoding" class="section">
        <div class="grid two">
          <div class="panel"><h3>Encoding Warnings</h3><div id="encodingList" class="list"></div></div>
          <div class="panel"><h3>Duplicate Groups</h3><div id="duplicateList" class="list"></div></div>
        </div>
      </section>

      <section id="maintenance" class="section">
        <div class="grid two">
          <div class="panel"><h3>Health Report</h3><div id="healthList" class="list"></div></div>
          <div class="panel"><h3>Maintenance Records</h3><div id="maintenanceList" class="list"></div></div>
        </div>
      </section>

      <section id="cleanup" class="section">
        <div id="cleanupList" class="list"></div>
      </section>

      <section id="files" class="section">
        <div class="panel"><h3>Raw Files</h3><table class="table" id="rawFiles"></table></div>
      </section>
    </main>
  </div>

  <script id="am-data" type="application/json">${jsonScript(data)}</script>
  <script>
    const data = JSON.parse(document.getElementById('am-data').textContent);
    const state = { tab:'projects', query:'', project:'', concept:'', source:'', type:'', layer:'', importance:'', quality:'' };
    const tabs = new Set(['search','projects','timeline','goals','resume','encoding','maintenance','cleanup','files']);
    const $ = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const fmt = value => value ? new Date(value).toLocaleString('zh-CN', { hour12:false }) : '';
    const lower = value => String(value || '').toLowerCase();
    const badge = (text, cls='') => '<span class="badge ' + cls + '">' + esc(text) + '</span>';
    const empty = text => '<div class="empty">' + esc(text) + '</div>';

    function fillFilters() {
      fillProjectSelect('projectFilter', data.vnext.projectBoard?.projects || []);
      fillSelect('conceptFilter', data.vnext.index.facets.concepts || []);
      fillSelect('sourceFilter', data.vnext.index.facets.sources || []);
      fillSelect('typeFilter', data.vnext.index.facets.types || []);
      fillSelect('layerFilter', data.vnext.index.facets.layers || []);
      fillSelect('importanceFilter', data.vnext.index.facets.importance || []);
    }
    function fillSelect(id, items) {
      const el = $(id);
      const first = el.options[0].outerHTML;
      el.innerHTML = first + items.slice(0, 120).map(item => '<option value="' + esc(item.value) + '">' + esc(item.value) + ' (' + esc(item.count) + ')</option>').join('');
    }
    function fillProjectSelect(id, projects) {
      const el = $(id);
      const first = el.options[0].outerHTML;
      el.innerHTML = first + projects.slice(0, 80).map(project => '<option value="' + esc(project.id) + '">' + esc(project.name) + ' (' + esc(project.counts.memories) + ')</option>').join('');
    }
    function memoryHaystack(item) {
      return lower([item.title,item.content,item.sourceKind,item.sourcePath,item.project,...(item.concepts||[]),...(item.files||[])].join('\\n'));
    }
    function filteredMemories() {
      const q = lower(state.query).trim();
      return data.memories.filter(item => {
        if (q && !memoryHaystack(item).includes(q)) return false;
        if (state.project && !(item.deploymentProjects || []).some(project => project.id === state.project)) return false;
        if (state.concept && !(item.concepts || []).includes(state.concept)) return false;
        if (state.source && item.sourceKind !== state.source) return false;
        if (state.type && item.type !== state.type) return false;
        if (state.layer && item.layer !== state.layer) return false;
        if (state.importance && item.importance !== state.importance) return false;
        if (state.quality && (!item.quality || item.quality.recommendation !== state.quality)) return false;
        return true;
      }).sort((a,b) => ((b.quality && b.quality.overall) || 0) - ((a.quality && a.quality.overall) || 0) || String(b.timestamp).localeCompare(String(a.timestamp)));
    }
    function renderMemory(item) {
      const q = item.quality || {};
      const cls = q.recommendation === 'prefer' ? 'good' : q.recommendation === 'review_encoding' || q.recommendation === 'dedupe_demote' ? 'warn' : q.recommendation === 'downrank' ? 'bad' : '';
      const flags = [
        badge(item.layer || 'memory','blue'),
        badge(item.type || 'memory'),
        badge(item.importance || 'normal', item.importance === 'high' || item.importance === 'critical' ? 'warn' : ''),
        item.reusable ? badge('reusable','good') : '',
        item.encodingWarning ? badge('encoding','bad') : '',
        item.coveredBy ? badge('covered','warn') : '',
        q.recommendation ? badge(q.recommendation, cls) : '',
      ].join('');
      const concepts = (item.concepts || []).slice(0, 10).map(x => badge(x)).join('');
      const projectBadges = (item.deploymentProjects || []).slice(0, 3).map(project => badge(project.name || project.id, project.id === item.primaryDeploymentProject?.id ? 'good' : '')).join('');
      const reasons = (q.reasons || []).length ? '<div class="meta">quality reasons: ' + esc((q.reasons || []).join(', ')) + '</div>' : '';
      const covered = item.coveredBy ? '<div class="meta">covered by: ' + esc(item.coveredBy.title || item.coveredBy.id) + ' (' + esc(item.coveredBy.timestamp || '') + ')</div>' : '';
      return '<article class="item" id="' + esc(item.id) + '"><div class="head"><div><h3>' + esc(item.title) + '</h3><div class="meta">' + fmt(item.timestamp) + ' | ' + esc(item.sourceKind || 'local') + ' | ' + esc(item.sourcePath || item.project || '') + '</div></div><div class="score"><b>' + esc(q.overall ?? '-') + '</b><br><span>quality</span></div></div><div class="badges">' + projectBadges + flags + concepts + '</div>' + reasons + covered + '<pre>' + esc(item.content || item.summary || '') + '</pre></article>';
    }
    function renderSearch() {
      const items = filteredMemories().slice(0, 260);
      $('memoryList').innerHTML = items.length ? items.map(renderMemory).join('') : empty('No matching memories.');
    }
    function renderProjects() {
      const board = data.vnext.projectBoard || { projects:[], unassigned:{ count:0, latestMemories:[] } };
      const summary = board.summary || {};
      const cards = [
        '<article class="item"><div class="head"><div><h3>Project Organization</h3><div class="meta">' + esc(summary.organization || 'derived_non_destructive') + '</div></div><div class="score"><b>' + esc(summary.assignedPercent ?? 0) + '%</b><br><span>assigned</span></div></div><div class="badges">' + badge('assigned ' + (summary.assignedMemories || 0),'good') + badge('primary ' + (summary.primaryAssignedMemories || 0),'good') + badge('unassigned ' + (summary.unassignedMemories || 0), summary.unassignedMemories ? 'warn' : 'good') + badge('threshold ' + (summary.classificationThreshold || 0)) + '</div><pre>' + esc(summary.note || 'Memories are grouped by deployed project without rewriting historical AM data.') + '</pre></article>',
      ];
      cards.push(...board.projects.map(project => {
        const evidence = (project.evidenceFiles || []).map(file => badge((file.exists ? 'ok ' : 'missing ') + file.path, file.exists ? 'good' : 'warn')).join('');
        const goals = (project.goals || []).slice(0, 5).map(goal => '- ' + goal.status + ': ' + goal.title).join('\\n');
        const latest = (project.latestMemories || []).slice(0, 8).map(memory => fmt(memory.timestamp) + ' | ' + memory.title).join('\\n');
        return '<article class="item"><div class="head"><div><h3>' + esc(project.name) + '</h3><div class="meta">' + esc(project.kind) + ' | ' + esc(project.status) + '</div></div><div class="score"><b>' + esc(project.counts.memories) + '</b><br><span>memories</span></div></div><div class="badges">' + badge('primary ' + project.counts.primaryMemories,'good') + badge('archive ' + project.counts.archiveBacked) + badge('warnings ' + project.counts.encodingWarnings, project.counts.encodingWarnings ? 'warn' : 'good') + badge('covered ' + project.counts.coveredMemories, project.counts.coveredMemories ? 'warn' : '') + evidence + '</div><pre>' + esc(project.description) + '\\n\\nLatest memories:\\n' + esc(latest || 'None') + '\\n\\nGoals:\\n' + esc(goals || 'None') + '</pre></article>';
      }));
      const unassignedConcepts = (board.unassigned.topConcepts || []).slice(0, 10).map(item => item.value + ' (' + item.count + ')').join(', ');
      const unassignedSources = (board.unassigned.sourceKinds || []).slice(0, 10).map(item => item.value + ' (' + item.count + ')').join(', ');
      cards.push('<article class="item"><h3>Unassigned Memory</h3><div class="badges">' + badge('count ' + board.unassigned.count, board.unassigned.count ? 'warn' : 'good') + '</div><pre>Top concepts: ' + esc(unassignedConcepts || 'None') + '\\nTop sources: ' + esc(unassignedSources || 'None') + '\\n\\nLatest:\\n' + esc((board.unassigned.latestMemories || []).slice(0, 12).map(memory => fmt(memory.timestamp) + ' | ' + memory.title).join('\\n') || 'All memories have a deployed-project bucket.') + '</pre></article>');
      $('projectList').innerHTML = cards.length ? cards.join('') : empty('No deployed project buckets.');
    }
    function renderTimeline() {
      const memories = data.memories.slice(0, 80).map(item => ({ kind:'memory', time:item.timestamp, title:item.title, text:item.summary || item.content, status:item.type }));
      const events = (data.goalEvents || []).slice(0, 80).map(item => ({ kind:'goal', time:item.timestamp, title:item.eventType, text:item.summary, status:item.goalId }));
      const sessions = (data.sessions || []).slice(0, 40).map(item => ({ kind:'session', time:item.timestamp, title:item.type || item.kind, text:item.sessionId || '', status:item.project || '' }));
      const items = memories.concat(events, sessions).filter(x => x.time).sort((a,b) => String(b.time).localeCompare(String(a.time))).slice(0, 160);
      $('timelineList').innerHTML = items.length ? items.map(item => '<article class="item"><div class="head"><div><h3>' + esc(item.title || item.kind) + '</h3><div class="meta">' + fmt(item.time) + ' | ' + esc(item.kind) + ' | ' + esc(item.status || '') + '</div></div></div><pre>' + esc(String(item.text || '').slice(0, 900)) + '</pre></article>').join('') : empty('No timeline events.');
    }
    function renderGoals() {
      const board = data.vnext.goalBoard || { items:[] };
      $('goalList').innerHTML = board.items.length ? board.items.map(goal => {
        const statusCls = goal.status === 'completed' ? 'good' : goal.status === 'blocked' ? 'bad' : goal.status === 'active' ? 'warn' : '';
        const packets = (goal.openResumePackets || []).length;
        const missing = goal.missingCriteria || [];
        return '<article class="item"><div class="head"><div><h3>' + esc(goal.title) + '</h3><div class="meta">' + fmt(goal.updatedAt || goal.createdAt) + ' | ' + esc(goal.projectRoot || '') + '</div></div><div class="score"><b>' + esc(goal.completionAllowed ? 'PASS' : 'WAIT') + '</b><br><span>audit</span></div></div><div class="badges">' + badge(goal.status,statusCls) + badge('criteria ' + (goal.successCriteria || []).length) + (packets ? badge('resume ' + packets,'warn') : '') + (missing.length ? badge('missing ' + missing.length,'bad') : '') + '</div><pre>Objective:\\n' + esc(goal.objective || '') + '\\n\\nProgress:\\n' + esc(goal.progressSummary || '') + '\\n\\nNext:\\n' + esc((goal.nextActions || []).map(x => '- ' + x).join('\\n')) + '\\n\\nMissing:\\n' + esc(missing.map(x => '- ' + x).join('\\n')) + '</pre></article>';
      }).join('') : empty('No AM goals.');
    }
    function renderResume() {
      const goals = data.vnext.goalBoard.items || [];
      const packets = goals.flatMap(goal => (goal.openResumePackets || []).map(packet => ({ goal, packet })));
      $('resumeList').innerHTML = packets.length ? packets.map(({goal, packet}) => '<article class="item"><h3>' + esc(goal.title) + '</h3><div class="badges">' + badge(packet.status || 'open','warn') + badge(packet.reason || packet.resumeTrigger || 'resume') + '</div><div class="meta">' + fmt(packet.timestamp) + ' | ' + esc(packet.incidentKey || '') + '</div><pre>' + esc(packet.instruction || packet.summary || JSON.stringify(packet.missing || packet.missingCriteria || [], null, 2)) + '</pre></article>').join('') : empty('No open resume packets.');
    }
    function renderEncoding() {
      const warnings = data.vnext.health.encodingWarnings || [];
      $('encodingList').innerHTML = warnings.length ? warnings.map(item => '<article class="item"><h3><a href="#' + esc(item.id) + '">' + esc(item.title) + '</a></h3><div class="badges">' + badge(item.severity, item.severity === 'high' ? 'bad' : 'warn') + badge(item.sourceKind || 'memory') + '</div><div class="meta">' + esc(item.sourcePath || '') + '</div><pre>' + esc(item.sample || '') + '</pre></article>').join('') : empty('No encoding warnings.');
      const groups = data.vnext.health.duplicateGroups || [];
      $('duplicateList').innerHTML = groups.length ? groups.slice(0, 100).map(group => '<article class="item"><h3>' + esc(group.primaryTitle || group.key) + '</h3><div class="badges">' + badge('count ' + group.count,'warn') + badge('keep ' + group.primaryId,'good') + '</div><pre>' + esc((group.items || []).map(x => x.id + ' | ' + x.title).join('\\n')) + '</pre></article>').join('') : empty('No duplicate groups.');
    }
    function renderMaintenance() {
      const recs = data.vnext.health.recommendations || [];
      const covered = data.vnext.health.coveredMemories || [];
      const coveredHtml = covered.length ? '<article class="item"><h3>Covered Memories</h3><div class="badges">' + badge('downrank candidates ' + covered.length,'warn') + '</div><pre>' + esc(covered.slice(0, 80).map(item => item.id + ' -> ' + (item.coveredBy && (item.coveredBy.id || item.coveredBy.title) || 'newer representative')).join('\\n')) + '</pre></article>' : '';
      $('healthList').innerHTML = (recs.map(item => '<article class="item"><h3>Recommendation</h3><pre>' + esc(item) + '</pre></article>').join('') + coveredHtml) || empty('No recommendations.');
      $('maintenanceList').innerHTML = data.maintenance.length ? data.maintenance.slice(0, 120).map(item => '<article class="item"><h3>' + esc(item.type || item.kind || 'maintenance') + '</h3><div class="meta">' + fmt(item.timestamp) + ' | ' + esc(item.status || '') + '</div><pre>' + esc(JSON.stringify(item.result || item.data || item, null, 2)) + '</pre></article>').join('') : empty('No maintenance records.');
    }
    function renderCleanup() {
      const plan = data.vnext.cleanup || { actions:[], summary:{} };
      const head = '<article class="item"><h3>Dry Run Summary</h3><div class="badges">' + badge('actions ' + (plan.summary.suggestedActions || 0),'warn') + badge('destructive 0','good') + '</div><pre>' + esc(JSON.stringify(plan.summary, null, 2)) + '</pre></article>';
      $('cleanupList').innerHTML = head + (plan.actions || []).slice(0, 240).map(action => '<article class="item"><h3>' + esc(action.type) + '</h3><div class="badges">' + badge(action.severity || 'info', action.severity === 'high' ? 'bad' : action.severity === 'medium' ? 'warn' : '') + badge(action.destructive ? 'destructive' : 'non-destructive','good') + '</div><pre>' + esc(JSON.stringify(action, null, 2)) + '</pre></article>').join('');
    }
    function renderFiles() {
      $('rawFiles').innerHTML = '<thead><tr><th>File</th><th>Size</th><th>Path</th></tr></thead><tbody>' + data.rawFiles.map(item => '<tr><td><a href="' + esc(item.url) + '">' + esc(item.label) + '</a></td><td>' + esc(item.size) + '</td><td class="muted">' + esc(item.path) + '</td></tr>').join('') + '</tbody>';
    }
    function render() {
      if (state.tab === 'search') renderSearch();
      else if (state.tab === 'projects') renderProjects();
      else if (state.tab === 'timeline') renderTimeline();
      else if (state.tab === 'goals') renderGoals();
      else if (state.tab === 'resume') renderResume();
      else if (state.tab === 'encoding') renderEncoding();
      else if (state.tab === 'maintenance') renderMaintenance();
      else if (state.tab === 'cleanup') renderCleanup();
      else if (state.tab === 'files') renderFiles();
    }
    function setTab(tab) {
      state.tab = tabs.has(tab) ? tab : 'search';
      document.querySelectorAll('.nav').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === state.tab));
      document.querySelectorAll('.section').forEach(section => section.classList.toggle('active', section.id === state.tab));
      history.replaceState(null, '', '#' + state.tab);
      render();
    }
    document.querySelectorAll('.nav').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
    $('query').addEventListener('input', e => { state.query = e.target.value; renderSearch(); });
    $('projectFilter').addEventListener('change', e => { state.project = e.target.value; renderSearch(); });
    $('conceptFilter').addEventListener('change', e => { state.concept = e.target.value; renderSearch(); });
    $('sourceFilter').addEventListener('change', e => { state.source = e.target.value; renderSearch(); });
    $('typeFilter').addEventListener('change', e => { state.type = e.target.value; renderSearch(); });
    $('layerFilter').addEventListener('change', e => { state.layer = e.target.value; renderSearch(); });
    $('importanceFilter').addEventListener('change', e => { state.importance = e.target.value; renderSearch(); });
    $('qualityFilter').addEventListener('change', e => { state.quality = e.target.value; renderSearch(); });
    fillFilters();
    setTab(tabs.has(location.hash.slice(1)) ? location.hash.slice(1) : 'projects');
  </script>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = await buildData(args.projectRoot);
  await fsp.mkdir(path.dirname(data.stats.viewerPath), { recursive: true });
  await fsp.writeFile(data.stats.viewerPath, renderVnextHtml(data), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    viewer: data.stats.viewerPath,
    memories: data.stats.memories,
    goals: data.stats.goals,
    activeGoals: data.stats.activeGoals,
    archives: data.stats.archives,
    maintenance: data.stats.maintenance,
    portsRequired: false,
  }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
