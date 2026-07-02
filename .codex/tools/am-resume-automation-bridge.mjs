#!/usr/bin/env node
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveProjectRoot,
  resumeAutomationRequestList,
  resumeAutomationRequestMarkWake,
  resumeAutomationRequestResolve,
  resumeAutomationRequestRetryDue,
  writeMaintenance,
} from './am-local-store.mjs';

const args = parseArgs(process.argv.slice(2));
const projectRoot = resolveProjectRoot(args['project-root']);
const mode = args.mode || 'check';
const codexHome = path.join(os.homedir(), '.codex');
const automationsRoot = path.join(codexHome, 'automations');
const now = Date.now();

if (mode === 'check' || mode === 'create') {
  await resumeAutomationRequestRetryDue(projectRoot, {});
  const cleanedAutomations = await cleanupResumeAutomations(projectRoot);
  const closedOrphanRequests = await closeMaxedCreatedRequestsWithoutAutomation(projectRoot);

  const pending = await resumeAutomationRequestList(projectRoot, { status: 'pending', limit: clampNumber(args.limit, 20, 1, 50) });
  const pendingRequests = latestRequestsByIncident(pending.requests || []);
  const requestsToWrite = pendingRequests;

  const created = [];
  for (const request of requestsToWrite) {
    const automationId = buildAutomationId(request);
    await writeAutomationToml(automationId, request);
    const marked = await resumeAutomationRequestMarkWake(projectRoot, {
      requestId: request.id,
      automationId,
      status: 'created',
      bridgeStatus: 'CREATED',
      resolution: `Created one-shot resume heartbeat automation attempt ${request.attempt || 1}/${request.maxAttempts || 10}.`,
    });
    created.push(...(marked.updated || []));
  }

  await writeMaintenance(projectRoot, {
    type: 'resume_automation_bridge',
    status: 'PASS',
    pending: pendingRequests.length,
    created: created.length,
    cleanedLegacyAutomations: cleanedAutomations.legacy,
    cleanedOrphanAutomations: cleanedAutomations.orphan,
    closedOrphanRequests,
    summary: created.length
      ? 'Created one-shot AM resume heartbeat automation file(s).'
      : 'No pending AM resume automation request was due.',
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    bridge: 'FILE_AUTOMATION',
    pending: pendingRequests.length,
    refreshOnly: false,
    cleanedLegacyAutomations: cleanedAutomations.legacy,
    cleanedOrphanAutomations: cleanedAutomations.orphan,
    closedOrphanRequests,
    created: created.map((item) => ({
      requestId: item.id,
      automationId: item.automationId,
      attempt: item.attempt,
      refreshed: Boolean(item.refreshed),
    })),
  }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ ok: false, error: 'unknown_mode', mode }, null, 2)}\n`);
  process.exitCode = 1;
}

async function writeAutomationToml(automationId, request) {
  const dir = path.join(automationsRoot, automationId);
  await fsp.mkdir(dir, { recursive: true });
  const threadId = firstString(request.threadId, process.env.CODEX_THREAD_ID, '');
  const cleanupRequest = {
    requestId: request.id,
    resumePacketId: request.resumePacketId,
    incidentKey: request.incidentKey,
    status: 'completed',
    bridgeStatus: 'WAKE_CONFIRMED',
    automationId,
    resolvedBy: 'am-one-shot-automation',
    resolution: 'Thread resumed by one-shot automation.',
  };
  const cleanupPacket = {
    resumePacketId: request.resumePacketId,
    resolvedBy: 'am-one-shot-automation',
    reason: 'Thread resumed by one-shot automation.',
  };
  const prompt = [
    'AM Goal one-shot recovery.',
    `automationId=${automationId}`,
    `requestId=${request.id}`,
    `resumePacketId=${request.resumePacketId}`,
    `incidentKey=${request.incidentKey}`,
    `attempt=${request.attempt || 1}/${request.maxAttempts || 10}`,
    '',
    'Before notifying the user, check local AM state for this request/packet. If the request status is no longer pending/created or the resume packet is already resolved, do not send user-facing text; only delete this automation id.',
    '',
    formatRecoveryMessage(request),
    '',
    'After sending the recovery message, run local AM cleanup with these JSON payloads:',
    `resume-automation-request-resolve ${JSON.stringify(cleanupRequest)}`,
    `goal-resume-packet-resolve ${JSON.stringify(cleanupPacket)}`,
    `Then delete this automation id "${automationId}" so it does not become a fixed poller.`,
  ].join('\n');
  const toml = [
    'version = 1',
    `id = ${tomlString(automationId)}`,
    'kind = "heartbeat"',
    `name = ${tomlString(`AM resume ${request.attempt || 1}/${request.maxAttempts || 10}`)}`,
    `prompt = ${tomlString(prompt)}`,
    'status = "ACTIVE"',
    'rrule = "FREQ=MINUTELY;INTERVAL=1"',
    threadId ? `target_thread_id = ${tomlString(threadId)}` : '',
    `created_at = ${now}`,
    `updated_at = ${now}`,
    '',
  ].filter(Boolean).join('\n');
  await fsp.writeFile(path.join(dir, 'automation.toml'), toml, 'utf8');
}

async function cleanupResumeAutomations(projectRoot) {
  const removed = { legacy: [], orphan: [] };
  const activeAutomationIds = await listActiveResumeAutomationIds(projectRoot);
  try {
    const entries = await fsp.readdir(automationsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!String(entry.name).startsWith('am-goal-resume-')) continue;
      const isRetryAutomation = /^am-goal-resume-resume_req_.+-try-\d+$/u.test(entry.name);
      if (isRetryAutomation && activeAutomationIds === null) continue;
      if (isRetryAutomation && activeAutomationIds.has(entry.name)) continue;
      const target = path.join(automationsRoot, entry.name);
      const resolvedRoot = path.resolve(automationsRoot);
      const resolvedTarget = path.resolve(target);
      if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) continue;
      await fsp.rm(resolvedTarget, { recursive: true, force: true });
      if (isRetryAutomation) {
        removed.orphan.push(entry.name);
      } else {
        removed.legacy.push(entry.name);
      }
    }
  } catch {
    return removed;
  }
  return removed;
}

async function listActiveResumeAutomationIds(projectRoot) {
  const activeIds = new Set();
  try {
    const listed = await resumeAutomationRequestList(projectRoot, { status: '', limit: 100 });
    for (const request of listed.requests || []) {
      const status = String(request.status || '').toLowerCase();
      if (!['pending', 'created'].includes(status)) continue;
      const automationId = firstString(request.automationId, buildAutomationId(request));
      if (automationId) activeIds.add(automationId);
    }
  } catch {
    // If AM cannot list requests, prefer not deleting retry automations blindly.
    return null;
  }
  return activeIds;
}

async function closeMaxedCreatedRequestsWithoutAutomation(projectRoot) {
  const closed = [];
  const listed = await resumeAutomationRequestList(projectRoot, { status: 'created', limit: 100 }).catch(() => null);
  for (const request of listed?.requests || []) {
    const attempt = clampNumber(request.attempt, 1, 1, 10);
    const maxAttempts = clampNumber(request.maxAttempts, 10, 1, 10);
    if (attempt < maxAttempts) continue;
    const automationId = firstString(request.automationId, buildAutomationId(request));
    if (automationId && await automationExists(automationId)) continue;
    const resolved = await resumeAutomationRequestResolve(projectRoot, {
      requestId: request.id,
      resumePacketId: request.resumePacketId,
      incidentKey: request.incidentKey,
      status: 'wake_failed',
      bridgeStatus: 'ORPHAN_CLEANED',
      automationId,
      resolvedBy: 'am-resume-automation-bridge',
      resolution: `Closed orphaned resume request after ${attempt}/${maxAttempts} attempts; no automation file remained.`,
    }).catch(() => null);
    if (resolved?.resolved?.length) closed.push(request.id);
  }
  return closed;
}

async function automationExists(automationId) {
  const name = String(automationId || '').trim();
  if (!name) return false;
  const target = path.resolve(automationsRoot, name);
  const root = path.resolve(automationsRoot);
  if (!target.startsWith(`${root}${path.sep}`)) return false;
  try {
    const stats = await fsp.stat(path.join(target, 'automation.toml'));
    return stats.isFile();
  } catch {
    return false;
  }
}

function buildAutomationId(request) {
  return safeId(`am-goal-resume-${firstString(request.id, 'request')}-try-${request.attempt || 1}`);
}

function formatRecoveryMessage(request) {
  const missing = normalizeList(request.missing).join('; ') || 'current turn exceeded the interruption threshold without release or visible activity';
  const nextActions = normalizeList(request.nextActions).join('; ') || 'read AM resume packet and continue from the latest checkpoint';
  return `Send the user-facing recovery message in Chinese. Include: continue; interruption detected; missing items: ${missing}; next step: ${nextActions}`;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
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
  return [...latestByIncident.values()];
}

function compareRequestRetryOrder(a, b) {
  const attemptDiff = clampNumber(a?.attempt, 0, 0, 1000) - clampNumber(b?.attempt, 0, 0, 1000);
  if (attemptDiff !== 0) return attemptDiff;
  const aTime = Date.parse(a?.updatedAt || a?.timestamp || '') || 0;
  const bTime = Date.parse(b?.updatedAt || b?.timestamp || '') || 0;
  return aTime - bTime;
}

function safeId(value) {
  return String(value || 'am-goal-resume')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
}

function tomlString(value) {
  return JSON.stringify(String(value || ''));
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
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

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
