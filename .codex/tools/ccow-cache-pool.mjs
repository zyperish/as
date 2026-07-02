#!/usr/bin/env node
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_RELATIVE_ROOT = path.join('.codex', 'ccow-cache-pool');
const ARCHIVE_RELATIVE_ROOT = path.join('_archive', 'ccow-cache-pool');
const DEFAULT_CLEANUP_AGE_DAYS = 7;
const PACKET_TYPES = new Set(['started', 'heartbeat', 'w_packet', 'wt_packet', 'error', 'blocked', 'needs_human', 'handoff', 'final']);
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/u,
  /(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_.-]{16,}/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
];

export function cachePoolPath(projectRoot, goalId, runId) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const safeGoal = safeId(goalId, 'goalId');
  const safeRun = safeId(runId, 'runId');
  return path.join(root, CACHE_RELATIVE_ROOT, safeGoal, safeRun);
}

export async function initCachePool(projectRoot, options = {}) {
  const poolRoot = cachePoolPath(projectRoot, options.goalId, options.runId);
  await fsp.mkdir(path.join(poolRoot, 'briefs'), { recursive: true });
  await fsp.mkdir(path.join(poolRoot, 'packets'), { recursive: true });
  await fsp.mkdir(path.join(poolRoot, 'latest'), { recursive: true });
  await fsp.mkdir(path.join(poolRoot, 'messages'), { recursive: true });
  const meta = {
    schemaVersion: 1,
    goalId: safeId(options.goalId, 'goalId'),
    runId: safeId(options.runId, 'runId'),
    createdAt: new Date().toISOString(),
    reasoningEffort: 'xhigh',
    packetTypes: [...PACKET_TYPES],
    rules: {
      localOnly: true,
      noPorts: true,
      noSecrets: true,
      atomicWrites: true,
      lwWritesOwnPathOnly: true,
    },
  };
  await writeJsonAtomic(path.join(poolRoot, 'pool.json'), meta);
  const scoreboard = await rebuildScoreboard(poolRoot);
  return { ok: true, poolRoot, meta, scoreboard };
}

export async function writeBrief(projectRoot, options = {}) {
  const poolRoot = await ensurePool(projectRoot, options);
  const wtId = safeId(options.wtId, 'wtId');
  const lwId = options.lwId ? safeId(options.lwId, 'lwId') : '';
  const brief = sanitizeJsonObject({
    schemaVersion: 1,
    goalId: safeId(options.goalId, 'goalId'),
    runId: safeId(options.runId, 'runId'),
    wtId,
    lwId,
    profileId: options.profileId || '',
    reasoningEffort: 'xhigh',
    cachePoolRequired: true,
    goalMode: true,
    createdAt: new Date().toISOString(),
    summary: options.summary || '',
    prompt: options.prompt || '',
  });
  const file = path.join(poolRoot, 'briefs', lwId ? `${wtId}-${lwId}.json` : `${wtId}.json`);
  await writeJsonAtomic(file, brief);
  return { ok: true, file, brief };
}

export async function writePacket(projectRoot, packet) {
  const normalized = normalizePacket(packet);
  const poolRoot = await ensurePool(projectRoot, normalized);
  assertNoSecrets(normalized);
  const wtId = safeId(normalized.wtId, 'wtId');
  const lwId = safeId(normalized.lwId, 'lwId');
  const seq = normalized.seq || await nextSeq(path.join(poolRoot, 'packets', wtId, lwId));
  const packetType = normalizePacketType(normalized.packetType);
  const fullPacket = sanitizeJsonObject({
    schemaVersion: 1,
    ...normalized,
    reasoningEffort: 'xhigh',
    packetType,
    seq,
    createdAt: normalized.createdAt || new Date().toISOString(),
  });
  const file = path.join(poolRoot, 'packets', wtId, lwId, `${String(seq).padStart(6, '0')}-${packetType}.json`);
  const latestFile = path.join(poolRoot, 'latest', `${wtId}-${lwId}.json`);
  await writeJsonAtomic(file, fullPacket);
  await writeJsonAtomic(latestFile, fullPacket);
  const scoreboard = await rebuildScoreboard(poolRoot);
  return { ok: true, file, latestFile, packet: fullPacket, scoreboard };
}

export async function readCachePool(projectRoot, options = {}) {
  const poolRoot = cachePoolPath(projectRoot, options.goalId, options.runId);
  const [pool, scoreboard] = await Promise.all([
    readJsonFile(path.join(poolRoot, 'pool.json')),
    rebuildScoreboard(poolRoot),
  ]);
  return {
    ok: true,
    poolRoot,
    pool,
    scoreboard,
    briefs: await readJsonFiles(path.join(poolRoot, 'briefs')),
    latest: await readJsonFiles(path.join(poolRoot, 'latest')),
  };
}

export async function rebuildScoreboard(poolRootOrProjectRoot, options = {}) {
  const poolRoot = options.goalId ? cachePoolPath(poolRootOrProjectRoot, options.goalId, options.runId) : path.resolve(poolRootOrProjectRoot);
  const scoreboard = await buildScoreboardForPool(poolRoot, options);
  await writeJsonAtomic(path.join(poolRoot, 'scoreboard.json'), scoreboard).catch(() => {});
  return scoreboard;
}

export async function listCachePools(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const cacheRoot = ensureInside(root, path.join(root, CACHE_RELATIVE_ROOT));
  const olderThanDays = Number(options.olderThanDays ?? DEFAULT_CLEANUP_AGE_DAYS);
  const includeStale = Boolean(options.includeStale);
  const nowMs = options.nowMs === undefined ? Date.now() : Number(options.nowMs);
  const rows = [];
  const goals = await fsp.readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  for (const goal of goals.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!isSafeIdText(goal.name)) continue;
    const goalDir = ensureInside(cacheRoot, path.join(cacheRoot, goal.name));
    const runs = await fsp.readdir(goalDir, { withFileTypes: true }).catch(() => []);
    for (const run of runs.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!isSafeIdText(run.name)) continue;
      const poolRoot = ensureInside(goalDir, path.join(goalDir, run.name));
      const row = await summarizePoolForCleanup(poolRoot, {
        goalId: goal.name,
        runId: run.name,
        nowMs,
        olderThanDays,
        includeStale,
      });
      rows.push(row);
    }
  }
  return {
    ok: true,
    cacheRoot,
    generatedAt: new Date(nowMs).toISOString(),
    olderThanDays,
    includeStale,
    count: rows.length,
    archiveEligibleCount: rows.filter((row) => row.archiveEligible).length,
    pools: rows,
  };
}

export async function archiveCachePool(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || DEFAULT_PROJECT_ROOT);
  const goalId = safeId(options.goalId, 'goalId');
  const runId = safeId(options.runId, 'runId');
  const source = cachePoolPath(root, goalId, runId);
  if (!fs.existsSync(source)) throw new Error(`cache pool does not exist: ${source}`);
  const archiveRoot = ensureInside(root, path.join(root, ARCHIVE_RELATIVE_ROOT, goalId));
  await fsp.mkdir(archiveRoot, { recursive: true });
  const stamp = timestampForFile(new Date(options.nowMs === undefined ? Date.now() : Number(options.nowMs)));
  let target = ensureInside(archiveRoot, path.join(archiveRoot, `${runId}-${stamp}`));
  let suffix = 1;
  while (fs.existsSync(target)) {
    target = ensureInside(archiveRoot, path.join(archiveRoot, `${runId}-${stamp}-${suffix}`));
    suffix += 1;
  }
  const scoreboard = await buildScoreboardForPool(source, options).catch(() => null);
  await fsp.rename(source, target);
  const manifest = {
    schemaVersion: 1,
    archivedAt: new Date(options.nowMs === undefined ? Date.now() : Number(options.nowMs)).toISOString(),
    goalId,
    runId,
    reason: String(options.reason || 'manual_archive'),
    source,
    target,
    movedPaths: [{ from: source, to: target }],
    scoreboardSummary: scoreboard ? { counts: scoreboard.counts, status: classifyPoolStatus(scoreboard) } : null,
    hardDeleted: false,
  };
  await writeJsonAtomic(path.join(target, 'archive-manifest.json'), manifest);
  return { ok: true, archived: true, source, target, manifest };
}

export async function cleanupCachePools(projectRoot, options = {}) {
  const dryRun = !options.execute;
  const listing = await listCachePools(projectRoot, options);
  const candidates = listing.pools.filter((pool) => pool.archiveEligible);
  const archived = [];
  const errors = [];
  if (!dryRun) {
    for (const pool of candidates) {
      try {
        archived.push(await archiveCachePool(projectRoot, {
          goalId: pool.goalId,
          runId: pool.runId,
          reason: options.reason || `cleanup_older_than_${listing.olderThanDays}_days`,
          nowMs: options.nowMs,
        }));
      } catch (error) {
        errors.push({ goalId: pool.goalId, runId: pool.runId, error: error.message });
      }
    }
  }
  return {
    ok: errors.length === 0,
    dryRun,
    policy: {
      hardDelete: false,
      archiveBeforeDelete: true,
      defaultOlderThanDays: DEFAULT_CLEANUP_AGE_DAYS,
      skippedActiveUnlessIncludeStale: true,
    },
    generatedAt: listing.generatedAt,
    cacheRoot: listing.cacheRoot,
    archiveRoot: path.join(path.resolve(projectRoot || DEFAULT_PROJECT_ROOT), ARCHIVE_RELATIVE_ROOT),
    olderThanDays: listing.olderThanDays,
    includeStale: listing.includeStale,
    candidateCount: candidates.length,
    archivedCount: archived.length,
    candidates,
    archived,
    skipped: listing.pools.filter((pool) => !pool.archiveEligible),
    errors,
  };
}

async function buildScoreboardForPool(poolRoot, options = {}) {
  const latestDir = path.join(poolRoot, 'latest');
  const latest = await readJsonFiles(latestDir);
  const now = options.nowMs === undefined ? Date.now() : Number(options.nowMs);
  const staleAfterMs = Number(options.staleAfterMs || 30 * 60 * 1000);
  const wt = {};
  for (const packet of latest) {
    const wtId = packet.wtId || 'unknown-wt';
    if (!wt[wtId]) {
      wt[wtId] = {
        wtId,
        status: 'RUNNING',
        lw: [],
        latestPacketAt: '',
        blockers: [],
        nextActions: [],
      };
    }
    const packetTime = Date.parse(packet.createdAt || '');
    const stale = !['DONE', 'BLOCKED', 'NEEDS_HUMAN', 'ERROR'].includes(String(packet.status || '').toUpperCase()) &&
      Number.isFinite(packetTime) &&
      now - packetTime > staleAfterMs;
    const status = packet.packetType === 'final' || String(packet.status || '').toUpperCase() === 'DONE'
      ? 'DONE'
      : stale ? 'STALE' : normalizeStatus(packet.status, packet.packetType);
    wt[wtId].lw.push({
      lwId: packet.lwId,
      agentId: packet.agentId || '',
      profileId: packet.profileId || '',
      wLane: packet.wLane || '',
      wLanes: stringArray(packet.wLanes),
      wLaneCount: Array.isArray(packet.wLanes) ? stringArray(packet.wLanes).length : (packet.wLane ? 1 : 0),
      taskWorkerId: packet.taskWorkerId || '',
      taskWorkerIds: stringArray(packet.taskWorkerIds),
      taskWorkerCount: Array.isArray(packet.taskWorkerIds) ? stringArray(packet.taskWorkerIds).length : (packet.taskWorkerId ? 1 : 0),
      status,
      packetType: packet.packetType,
      seq: packet.seq,
      summary: packet.summary || '',
      markers: stringArray(packet.markers),
      createdAt: packet.createdAt || '',
    });
    wt[wtId].latestPacketAt = maxIso(wt[wtId].latestPacketAt, packet.createdAt || '');
    wt[wtId].blockers.push(...(Array.isArray(packet.blockers) ? packet.blockers : []));
    wt[wtId].nextActions.push(...(Array.isArray(packet.nextActions) ? packet.nextActions : []));
    wt[wtId].markers = unique([...(wt[wtId].markers || []), ...(Array.isArray(packet.markers) ? packet.markers : [])]);
  }
  const wtItems = Object.values(wt).map((item) => ({
    ...item,
    status: summarizeWtStatus(item.lw),
    blockers: unique(item.blockers).slice(0, 12),
    nextActions: unique(item.nextActions).slice(0, 12),
  })).sort((a, b) => a.wtId.localeCompare(b.wtId));
  const wLanes = unique(latest.flatMap((packet) => {
    const lanes = stringArray(packet.wLanes);
    if (packet.wLane) lanes.push(String(packet.wLane));
    return lanes;
  }));
  const taskWorkerIds = unique(latest.flatMap((packet) => {
    const ids = stringArray(packet.taskWorkerIds);
    if (packet.taskWorkerId) ids.push(String(packet.taskWorkerId));
    return ids;
  }));
  const markers = unique(latest.flatMap((packet) => stringArray(packet.markers)));
  const scoreboard = {
    ok: true,
    schemaVersion: 1,
    squadModel: 'wt_lw_w',
    goalId: path.basename(path.dirname(poolRoot)),
    runId: path.basename(poolRoot),
    generatedAt: new Date().toISOString(),
    poolRoot,
    wtCount: wtItems.length,
    wtIds: wtItems.map((item) => item.wtId),
    functionalLWCount: latest.length,
    wLaneCount: wLanes.length,
    wLanes,
    taskWorkerCount: taskWorkerIds.length,
    taskWorkerIds,
    markers,
    reasoningEffortPolicy: 'xhigh_required',
    allCallsXHigh: latest.every((packet) => (packet.reasoningEffort || packet.reasoning_effort || 'xhigh') === 'xhigh'),
    cachePoolCompliant: true,
    counts: {
      wt: wtItems.length,
      lw: latest.length,
      done: wtItems.filter((item) => item.status === 'DONE').length,
      running: wtItems.filter((item) => item.status === 'RUNNING').length,
      stale: wtItems.filter((item) => item.status === 'STALE').length,
      blocked: wtItems.filter((item) => item.status === 'BLOCKED').length,
      needsHuman: wtItems.filter((item) => item.status === 'NEEDS_HUMAN').length,
      error: wtItems.filter((item) => item.status === 'ERROR').length,
    },
    wt: wtItems,
  };
  return scoreboard;
}

export async function recoverCachePool(projectRoot, options = {}) {
  const poolRoot = cachePoolPath(projectRoot, options.goalId, options.runId);
  const scoreboard = await rebuildScoreboard(poolRoot, { staleAfterMs: options.staleAfterMs });
  return {
    ok: true,
    poolRoot,
    scoreboard,
    recoveryPlan: scoreboard.wt.map((item) => ({
      wtId: item.wtId,
      action: item.status === 'DONE' ? 'reuse_final_packet'
        : item.status === 'STALE' ? 'resume_from_latest_packet'
          : item.status === 'BLOCKED' ? 'inspect_blocker_packet'
            : item.status === 'NEEDS_HUMAN' ? 'request_human_input'
              : item.status === 'ERROR' ? 'enqueue_recovery'
                : 'continue_running',
      status: item.status,
    })),
  };
}

function normalizePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) throw new Error('packet JSON object is required');
  return {
    schemaVersion: 1,
    goalId: safeId(packet.goalId, 'goalId'),
    runId: safeId(packet.runId, 'runId'),
    wtId: safeId(packet.wtId, 'wtId'),
    lwId: safeId(packet.lwId, 'lwId'),
    agentId: packet.agentId || '',
    profileId: packet.profileId || '',
    wLane: packet.wLane || '',
    wLanes: stringArray(packet.wLanes),
    taskWorkerId: packet.taskWorkerId || '',
    taskWorkerIds: stringArray(packet.taskWorkerIds),
    packetType: normalizePacketType(packet.packetType),
    status: packet.status || statusFromPacketType(packet.packetType),
    summary: packet.summary || '',
    ownedFiles: stringArray(packet.ownedFiles),
    changedFiles: stringArray(packet.changedFiles),
    evidenceRefs: Array.isArray(packet.evidenceRefs) ? packet.evidenceRefs : [],
    blockers: stringArray(packet.blockers),
    nextActions: stringArray(packet.nextActions),
    markers: stringArray(packet.markers),
    createdAt: packet.createdAt || '',
    seq: packet.seq ? Number(packet.seq) : 0,
  };
}

async function ensurePool(projectRoot, options) {
  const poolRoot = cachePoolPath(projectRoot, options.goalId, options.runId);
  if (!fs.existsSync(path.join(poolRoot, 'pool.json'))) {
    await initCachePool(projectRoot, { goalId: options.goalId, runId: options.runId });
  }
  return poolRoot;
}

function safeId(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (!/^[A-Za-z0-9_.-]+$/u.test(text)) throw new Error(`${label} contains unsafe characters: ${text}`);
  if (text === '.' || text === '..' || text.includes('..')) throw new Error(`${label} cannot traverse paths`);
  return text;
}

function normalizePacketType(value) {
  const text = String(value || 'heartbeat').trim().toLowerCase();
  if (!PACKET_TYPES.has(text)) throw new Error(`invalid packetType: ${value}`);
  return text;
}

function statusFromPacketType(packetType) {
  const type = String(packetType || '').toLowerCase();
  if (type === 'final') return 'DONE';
  if (type === 'blocked') return 'BLOCKED';
  if (type === 'needs_human') return 'NEEDS_HUMAN';
  if (type === 'error') return 'ERROR';
  return 'RUNNING';
}

function normalizeStatus(status, packetType) {
  const text = String(status || statusFromPacketType(packetType)).toUpperCase();
  if (['DONE', 'RUNNING', 'BLOCKED', 'NEEDS_HUMAN', 'ERROR', 'RECOVERY', 'STALE'].includes(text)) return text;
  return 'RUNNING';
}

function summarizeWtStatus(lw) {
  const statuses = lw.map((item) => item.status);
  if (statuses.includes('ERROR')) return 'ERROR';
  if (statuses.includes('NEEDS_HUMAN')) return 'NEEDS_HUMAN';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.includes('STALE')) return 'STALE';
  if (statuses.length && statuses.every((status) => status === 'DONE')) return 'DONE';
  return 'RUNNING';
}

async function nextSeq(dir) {
  await fsp.mkdir(dir, { recursive: true });
  const files = await fsp.readdir(dir).catch(() => []);
  const numbers = files.map((file) => Number((file.match(/^(\d+)-/u) || [])[1] || 0)).filter(Boolean);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

async function readJsonFiles(dir) {
  const files = await fsp.readdir(dir).catch(() => []);
  const out = [];
  for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
    const value = await readJsonFile(path.join(dir, file));
    if (value) out.push(value);
  }
  return out;
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(tmp, file);
}

function sanitizeJsonObject(value) {
  const text = JSON.stringify(value);
  if (text.length > 120000) throw new Error('packet is too large for cache pool; store long logs as file refs');
  return JSON.parse(text);
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) throw new Error('packet appears to contain a secret; write a redacted summary and file path reference instead');
  }
}

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 80) : [];
}

function maxIso(a, b) {
  return String(b || '').localeCompare(String(a || '')) > 0 ? b : a;
}

function unique(values) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

async function summarizePoolForCleanup(poolRoot, options = {}) {
  const stat = await fsp.stat(poolRoot);
  const pool = await readJsonFile(path.join(poolRoot, 'pool.json'));
  const scoreboard = await buildScoreboardForPool(poolRoot, options).catch(() => null);
  const updatedAt = latestPoolActivity(pool, scoreboard, stat);
  const updatedMs = Date.parse(updatedAt);
  const ageDays = Number.isFinite(updatedMs) ? Math.floor((options.nowMs - updatedMs) / 86400000) : 0;
  const status = scoreboard ? classifyPoolStatus(scoreboard) : 'UNKNOWN';
  const oldEnough = ageDays >= Number(options.olderThanDays);
  const allowedStatus = status === 'DONE' || (options.includeStale && ['STALE', 'ERROR'].includes(status));
  const archiveEligible = oldEnough && allowedStatus;
  return {
    goalId: options.goalId,
    runId: options.runId,
    poolRoot,
    createdAt: pool?.createdAt || stat.birthtime.toISOString(),
    updatedAt,
    ageDays,
    status,
    counts: scoreboard?.counts || null,
    archiveEligible,
    reason: archiveEligible
      ? 'eligible_for_archive'
      : !oldEnough ? 'not_old_enough'
        : allowedStatus ? 'eligible_status_not_archived'
          : 'active_or_incomplete',
  };
}

function latestPoolActivity(pool, scoreboard, stat) {
  const fromScoreboard = (scoreboard?.wt || [])
    .map((item) => item.latestPacketAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return fromScoreboard || pool?.updatedAt || pool?.createdAt || stat.mtime.toISOString();
}

function classifyPoolStatus(scoreboard) {
  const counts = scoreboard?.counts || {};
  if (!counts.wt && !counts.lw) return 'EMPTY';
  if (counts.error > 0) return 'ERROR';
  if (counts.needsHuman > 0) return 'NEEDS_HUMAN';
  if (counts.blocked > 0) return 'BLOCKED';
  if (counts.stale > 0) return 'STALE';
  if (counts.running > 0) return 'RUNNING';
  if (counts.done > 0) return 'DONE';
  return 'UNKNOWN';
}

function ensureInside(parent, target) {
  const root = path.resolve(parent);
  const resolved = path.resolve(target);
  const relative = path.relative(root, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return resolved;
  throw new Error(`Refusing path outside root: ${target}`);
}

function isSafeIdText(value) {
  const text = String(value || '').trim();
  return Boolean(text) && /^[A-Za-z0-9_.-]+$/u.test(text) && text !== '.' && text !== '..' && !text.includes('..');
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}

async function parseJsonArg(value) {
  if (!value) throw new Error('--packet JSON is required');
  const text = String(value);
  if (text.trim().startsWith('{')) return JSON.parse(text);
  return JSON.parse((await fsp.readFile(path.resolve(text), 'utf8')).replace(/^\uFEFF/u, ''));
}

function parseArgs(argv) {
  const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'read';
  const start = command === 'read' && argv[0]?.startsWith('--') ? 0 : 1;
  const out = { _: command };
  for (let index = start; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function usage() {
  return [
    'Usage:',
    '  node ccow-cache-pool.mjs init --goal-id <id> --run-id <id> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs brief --goal-id <id> --run-id <id> --wt-id <id> [--lw-id <id>] [--profile-id <id>]',
    '  node ccow-cache-pool.mjs write --packet <json> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs read --goal-id <id> --run-id <id> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs scoreboard --goal-id <id> --run-id <id> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs recover --goal-id <id> --run-id <id> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs list [--project-root <dir>] [--older-than-days <n>]',
    '  node ccow-cache-pool.mjs archive --goal-id <id> --run-id <id> [--project-root <dir>]',
    '  node ccow-cache-pool.mjs cleanup [--dry-run|--execute] [--older-than-days <n>] [--include-stale]',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    return;
  }
  const projectRoot = path.resolve(args['project-root'] || DEFAULT_PROJECT_ROOT);
  let result;
  if (args._ === 'init') {
    result = await initCachePool(projectRoot, { goalId: args['goal-id'], runId: args['run-id'] });
  } else if (args._ === 'brief') {
    result = await writeBrief(projectRoot, {
      goalId: args['goal-id'],
      runId: args['run-id'],
      wtId: args['wt-id'],
      lwId: args['lw-id'],
      profileId: args['profile-id'],
      summary: args.summary,
      prompt: args.prompt,
    });
  } else if (args._ === 'write') {
    result = await writePacket(projectRoot, await parseJsonArg(args.packet));
  } else if (args._ === 'read') {
    result = await readCachePool(projectRoot, { goalId: args['goal-id'], runId: args['run-id'] });
  } else if (args._ === 'scoreboard') {
    result = await rebuildScoreboard(projectRoot, { goalId: args['goal-id'], runId: args['run-id'] });
  } else if (args._ === 'recover') {
    result = await recoverCachePool(projectRoot, { goalId: args['goal-id'], runId: args['run-id'] });
  } else if (args._ === 'list') {
    result = await listCachePools(projectRoot, {
      olderThanDays: args['older-than-days'],
      includeStale: args['include-stale'],
    });
  } else if (args._ === 'archive') {
    result = await archiveCachePool(projectRoot, {
      goalId: args['goal-id'],
      runId: args['run-id'],
      reason: args.reason,
    });
  } else if (args._ === 'cleanup') {
    result = await cleanupCachePools(projectRoot, {
      execute: Boolean(args.execute),
      dryRun: args['dry-run'] !== false,
      olderThanDays: args['older-than-days'],
      includeStale: args['include-stale'],
      reason: args.reason,
    });
  } else {
    throw new Error(`Unknown command: ${args._}\n${usage()}`);
  }
  console.log(JSON.stringify(result, null, 2));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
