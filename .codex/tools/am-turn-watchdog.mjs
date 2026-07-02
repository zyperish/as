#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  resolveProjectRoot,
  turnWatchMarkStale,
  turnWatchStatus,
} from './am-local-store.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const projectRoot = resolveProjectRoot(args['project-root']);
const goalId = args['goal-id'] || '';
const turnId = args['turn-id'] || '';
const intervalMs = clampNumber(args['interval-ms'], 2000, 500, 60000);
const maxSeconds = clampNumber(args['max-seconds'], 7200, 30, 86400);
const startedAt = Date.now();

if (!turnId) {
  process.exit(0);
}

while (Date.now() - startedAt < maxSeconds * 1000) {
  const status = await turnWatchStatus(projectRoot, { goalId, turnId, limit: 1 }).catch(() => null);
  const watch = status?.watches?.[0];
  if (!watch || ['released', 'resolved', 'completed', 'cancelled', 'canceled'].includes(String(watch.status || '').toLowerCase())) {
    process.exit(0);
  }

  const activityAt = await latestActivityAt(watch);
  const baseline = Date.parse(activityAt || watch.lastActivityAt || watch.updatedAt || watch.timestamp || '');
  const expected = clampNumber(watch.expectedHeartbeatSeconds, 30, 5, 3600);
  const inactiveSeconds = Number.isFinite(baseline) ? Math.max(0, (Date.now() - baseline) / 1000) : expected + 1;

  if (inactiveSeconds > expected) {
    await turnWatchMarkStale(projectRoot, {
      goalId,
      turnId,
      inactiveSeconds,
      resumeTrigger: 'turn_stale',
      proof: `No visible session activity for ${Math.round(inactiveSeconds)} seconds; creating one-shot resume request.`,
      reason: 'turn_stale',
    }).catch(() => null);
    startBridgeCheck();
    startRetryMonitor();
    process.exit(0);
  }

  await sleep(intervalMs);
}

process.exit(0);

async function latestActivityAt(watch) {
  const transcriptPath = normalizePath(watch.transcriptPath);
  if (!transcriptPath) {
    return watch.lastActivityAt || watch.updatedAt || watch.timestamp || '';
  }
  try {
    const stat = await fsp.stat(transcriptPath);
    return stat.mtime.toISOString();
  } catch {
    return watch.lastActivityAt || watch.updatedAt || watch.timestamp || '';
  }
}

function normalizePath(value) {
  const text = String(value || '').trim();
  return text.replace(/^\\\\\?\\/u, '');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startBridgeCheck() {
  const bridgeScript = path.join(scriptDir, 'am-resume-automation-bridge.mjs');
  const child = spawn(process.execPath, [bridgeScript, '--project-root', projectRoot, '--mode', 'check'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function startRetryMonitor() {
  const monitorScript = path.join(scriptDir, 'am-resume-retry-monitor.mjs');
  const child = spawn(process.execPath, [monitorScript, '--project-root', projectRoot, '--goal-id', goalId, '--turn-id', turnId], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}
