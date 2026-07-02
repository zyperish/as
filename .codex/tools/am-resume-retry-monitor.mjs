#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveProjectRoot,
  resumeAutomationRequestList,
  resumeAutomationRequestResolve,
} from './am-local-store.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const projectRoot = resolveProjectRoot(args['project-root']);
const goalId = args['goal-id'] || '';
const turnId = args['turn-id'] || '';
const intervalMs = clampNumber(args['interval-ms'], 30000, 5000, 3600000);
const maxAttempts = clampNumber(args['max-attempts'], 10, 1, 10);
const bridgeScript = path.join(scriptDir, 'am-resume-automation-bridge.mjs');
const automationsRoot = path.join(os.homedir(), '.codex', 'automations');

for (let index = 0; index < maxAttempts; index += 1) {
  await sleep(intervalMs);
  const list = await resumeAutomationRequestList(projectRoot, { goalId, status: '', limit: 50 }).catch(() => null);
  const related = (list?.requests || []).filter((request) => !turnId || request.turnId === turnId);
  if (!related.length) process.exit(0);
  const latest = related.sort((a, b) => String(b.updatedAt || b.timestamp || '').localeCompare(String(a.updatedAt || a.timestamp || '')))[0];
  if (latest?.wakeConfirmedAt || latest?.resolvedAt || String(latest?.status || '').toLowerCase() === 'completed') {
    process.exit(0);
  }
  if (Number(latest?.attempt || 1) >= Number(latest?.maxAttempts || maxAttempts)) {
    await resumeAutomationRequestResolve(projectRoot, {
      requestId: latest.id,
      resumePacketId: latest.resumePacketId,
      incidentKey: latest.incidentKey,
      status: 'wake_failed',
      bridgeStatus: 'WAKE_FAILED',
      automationId: latest.automationId,
      resolvedBy: 'am-resume-retry-monitor',
      resolution: `No wake confirmation after ${latest?.attempt || maxAttempts}/${latest?.maxAttempts || maxAttempts} attempts.`,
    }).catch(() => null);
    await removeAutomation(latest.automationId);
    process.exit(0);
  }
  const child = spawn(process.execPath, [bridgeScript, '--project-root', projectRoot, '--mode', 'check'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
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

async function removeAutomation(automationId) {
  const name = String(automationId || '').trim();
  if (!name) return;
  const target = path.resolve(automationsRoot, name);
  const root = path.resolve(automationsRoot);
  if (!target.startsWith(`${root}${path.sep}`)) return;
  if (!/^am-goal-resume-/u.test(name)) return;
  await fsp.rm(target, { recursive: true, force: true }).catch(() => null);
}
