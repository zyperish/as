#!/usr/bin/env node
import {
  goalCheckpoint,
  goalParticipantRelease,
  goalStageReview,
  goalStatus,
  observe,
  remember,
  resolveProjectRoot,
  sessionEvent,
  turnWatchStart,
  turnWatchActivity,
  turnWatchStop,
  writeMaintenance,
} from './am-local-store.mjs';
import { amFirstFinish } from './am-first.mjs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = parseArgs(process.argv.slice(2));
const script = args.script || args._[0] || '';
const payload = await readPayload(args);
const projectRoot = resolveProjectRoot(validPath(payload.cwd) ? payload.cwd : args['project-root']);

if (isSdkChildContext(payload)) {
  process.exit(0);
}

try {
  const result = await handleHook(script, payload, projectRoot);
  if (args.verbose === 'true') {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  await writeMaintenance(projectRoot, {
    type: 'hook_error',
    status: 'WARN',
    script,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function handleHook(scriptName, payloadValue, root) {
  const sessionId = payloadValue.session_id || payloadValue.sessionId || 'unknown';
  const base = {
    sessionId,
    project: validPath(payloadValue.cwd) ? payloadValue.cwd : root,
    cwd: validPath(payloadValue.cwd) ? payloadValue.cwd : root,
    timestamp: new Date().toISOString(),
  };

  if (scriptName === 'session-start.mjs' || scriptName === 'session-end.mjs') {
    return sessionEvent(root, scriptName === 'session-start.mjs' ? 'start' : 'end', base);
  }

  if (scriptName === 'prompt-submit.mjs') {
    const promptText = firstString(payloadValue.prompt, payloadValue.user_prompt, payloadValue.message, payloadValue.text);
    const observed = await observe(root, {
      ...base,
      hookType: 'prompt_submit',
      data: {
        prompt: promptText,
      },
    });
    if (isAutomationHeartbeatPayload(payloadValue, promptText)) {
      return { ok: true, observed, turnWatch: { skipped: true, reason: 'automation_heartbeat_payload' } };
    }
    const activeGoal = await goalStatus(root, { projectRoot: root });
    if (activeGoal.activeGoal) {
      const turn = await turnWatchStart(root, {
        goalId: activeGoal.activeGoal.id,
        sessionId,
        threadId: firstString(payloadValue.thread_id, payloadValue.threadId, sessionId),
        turnId: buildTurnId(sessionId, payloadValue),
        taskId: 'prompt-submit.mjs',
        transcriptPath: firstString(payloadValue.transcriptPath, payloadValue.transcript_path, payloadValue.sessionPath, payloadValue.session_path, payloadValue.session_file),
        expectedHeartbeatSeconds: 30,
        proof: 'UserPromptSubmit registered a local turn watcher for interruption recovery.',
      });
      if (turn.ok && turn.watch && !turn.reused) {
        startTurnWatchdog(root, activeGoal.activeGoal.id, turn.watch.turnId);
      }
      return { ok: true, observed, turnWatch: turn };
    }
    return observed;
  }

  if (scriptName === 'pre-tool-use.mjs' || scriptName === 'post-tool-use.mjs' || scriptName === 'post-tool-failure.mjs') {
    const observed = await observe(root, {
      ...base,
      hookType: scriptName.replace(/\.mjs$/u, '').replace(/-/gu, '_'),
      data: compactPayload(payloadValue),
    });
    const activeGoal = await goalStatus(root, { projectRoot: root });
    if (!activeGoal.activeGoal) {
      return observed;
    }
    const isPreTool = scriptName === 'pre-tool-use.mjs';
    const activity = await turnWatchActivity(root, {
      goalId: activeGoal.activeGoal.id,
      sessionId,
      hookType: scriptName.replace(/\.mjs$/u, '').replace(/-/gu, '_'),
      toolName: firstString(payloadValue.tool_name, payloadValue.toolName, payloadValue.name),
      status: isPreTool ? 'tool_running' : 'watching',
      expectedHeartbeatSeconds: isPreTool ? 300 : 30,
      proof: isPreTool
        ? 'Tool execution started; interruption watchdog should not mark this turn stale while a tool is actively running.'
        : 'Tool execution finished or failed; interruption watchdog returned to normal turn monitoring.',
    });
    return { ok: true, observed, turnWatchActivity: activity };
  }

  if (scriptName === 'pre-compact.mjs') {
    const reason = 'archive_promotion_disabled_for_pre_compact';
    const summary = { ok: true, skipped: true, reason };
    const consolidated = { ok: true, skipped: true, reason };
    const activeGoal = await goalStatus(root, { projectRoot: root });
    const goalReview = activeGoal.activeGoal
      ? await goalStageReview(root, {
        goalId: activeGoal.activeGoal.id,
        sessionId,
        summary: `PreCompact stage review for active goal: ${activeGoal.activeGoal.title}`,
        nextActions: activeGoal.activeGoal.nextActions || [],
      })
      : { ok: true, skipped: 'no_active_goal' };
    return writeMaintenance(root, {
      type: 'pre_compact',
      status: summary.ok || consolidated.ok || goalReview.ok ? 'PASS' : 'WARN',
      sessionId,
      summary,
      consolidated,
      goalReview,
    });
  }

  if (scriptName === 'task-completed.mjs') {
    return remember(root, {
      content: JSON.stringify(compactPayload(payloadValue), null, 2),
      title: 'Task completion event',
      type: 'task_completion',
      layer: 'episodic',
      importance: 'normal',
      concepts: ['task-completed', 'AM'],
      source: { kind: 'hook', script: scriptName, sessionId },
    });
  }

  if (scriptName === 'stop.mjs') {
    const steps = [];
    steps.push(['sessionEnd', await sessionEvent(root, 'end', base)]);
    const archiveRef = await latestArchiveRef(root);
    steps.push(['amFirstFinish', await amFirstFinish(root, {
      title: 'AM automatic turn completion summary',
      summary: buildStopFinishSummary(sessionId, archiveRef),
      importance: 'low',
      reusable: false,
      concepts: [
        'AM',
        'am-first',
        'turn-completion',
        'every-conversation-am',
        'stop-hook',
      ],
      files: archiveRef?.path ? [archiveRef.path] : [],
    })]);
    const activeGoal = await goalStatus(root, { projectRoot: root });
    if (activeGoal.activeGoal) {
      steps.push(['goalParticipantRelease', await goalParticipantRelease(root, {
        goalId: activeGoal.activeGoal.id,
        participantId: `codex-turn-${sessionId || 'desktop'}`,
        kind: 'codex-turn',
        taskId: scriptName,
        sessionId,
        lastProof: 'Stop hook completed normally; no interrupt recovery needed for this turn.',
        archiveRefs: archiveRef ? [archiveRef] : [],
      })]);
      steps.push(['turnWatchStop', await turnWatchStop(root, {
        goalId: activeGoal.activeGoal.id,
        sessionId,
        participantId: `codex-turn-${sessionId || 'desktop'}`,
        status: 'released',
        reason: 'Stop hook completed normally; local turn watcher should exit.',
      })]);
      steps.push(['goalCheckpoint', await goalCheckpoint(root, {
        goalId: activeGoal.activeGoal.id,
        sessionId,
        progressSummary: `Stop hook ran AM-first finish and linked latest conversation archive for active goal: ${activeGoal.activeGoal.title}`,
        nextActions: activeGoal.activeGoal.nextActions || [],
        archiveRefs: archiveRef ? [archiveRef] : [],
        evidenceRefs: [],
        eventType: 'checkpoint',
      })]);
    }
    const status = steps.every(([, result]) => result?.ok !== false) ? 'PASS' : 'WARN';
    return writeMaintenance(root, {
      type: 'stop',
      status,
      sessionId,
      project: root,
      steps: Object.fromEntries(steps),
    });
  }

  return observe(root, {
    ...base,
    hookType: scriptName || 'unknown',
    data: compactPayload(payloadValue),
  });
}

function buildStopFinishSummary(sessionId, archiveRef) {
  return [
    `AM automatic turn completion summary for session ${sessionId || 'unknown'}.`,
    'The Stop hook ran the required every-turn AM closeout after a completed conversation response.',
    'This closeout stores only a concise explicit summary, then runs AM diagnosis and recall verification.',
    'Archive-derived summary, consolidation, and reflection remain disabled unless --promote-archives or --force is explicitly requested.',
    archiveRef?.path ? `Latest archive reference: ${archiveRef.path}.` : 'No latest archive reference was available.',
  ].join(' ');
}

async function latestArchiveRef(root) {
  try {
    const { sessionHistory } = await import('./am-local-store.mjs');
    const history = await sessionHistory(root, { limit: 1 });
    const archive = history?.archives?.[0];
    if (!archive) {
      return null;
    }
    return {
      kind: 'conversation_archive',
      path: archive.relativePath || archive.path,
      summary: `Latest conversation archive ${archive.relativePath || archive.path}`,
    };
  } catch {
    return null;
  }
}

function compactPayload(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const key of [
    'cwd',
    'session_id',
    'tool_name',
    'tool_input',
    'tool_response',
    'tool_error',
    'command',
    'status',
    'prompt',
    'message',
    'text',
  ]) {
    if (value[key] !== undefined) {
      out[key] = truncateDeep(value[key]);
    }
  }
  return out;
}

function truncateDeep(value) {
  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(truncateDeep);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, truncateDeep(item)]));
  }
  return value;
}

function isAutomationHeartbeatPayload(payloadValue, promptText = '') {
  let payloadText = '';
  try {
    payloadText = JSON.stringify(payloadValue || {}).slice(0, 8000);
  } catch {
    payloadText = '';
  }
  const text = [
    promptText,
    payloadValue?.instructions,
    payloadValue?.message,
    payloadValue?.text,
    payloadValue?.automation_id,
    payloadValue?.automationId,
    payloadValue?.kind,
    payloadValue?.type,
    payloadValue?.event,
    payloadText,
  ].filter(Boolean).join('\n');
  return /<heartbeat\b|automationId=am-goal-resume-|AM Goal one-shot recovery|am-goal-resume-/iu.test(text);
}

function isSdkChildContext(payloadValue) {
  if (process.env.AGENTMEMORY_SDK_CHILD === '1') return true;
  if (!payloadValue || typeof payloadValue !== 'object') return false;
  return payloadValue.entrypoint === 'sdk-ts';
}

function startTurnWatchdog(root, goalId, turnId) {
  try {
    const entry = path.join(__dirname, 'am-turn-watchdog.mjs');
    if (!fs.existsSync(entry)) return;
    const child = spawn(process.execPath, [
      entry,
      '--project-root',
      root,
      '--goal-id',
      goalId,
      '--turn-id',
      turnId,
      '--interval-ms',
      '2000',
      '--max-seconds',
      '7200',
    ], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        AGENTMEMORY_PROJECT_ROOT: root,
      },
    });
    child.unref();
  } catch {
  }
}

function buildTurnId(sessionId, payloadValue) {
  return [
    'turn',
    String(sessionId || 'desktop').replace(/[^A-Za-z0-9_.-]+/gu, '-').slice(0, 80),
    String(Date.now()),
  ].join('-');
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

async function readPayload(options) {
  if (options['payload-file']) {
    const text = await import('node:fs/promises').then((fs) => fs.readFile(options['payload-file'], 'utf8'));
    if (!text.trim()) {
      return {};
    }
    return JSON.parse(stripBom(text));
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
  }
  const input = Buffer.concat(chunks).toString('utf8');
  if (!input.trim()) {
    return {};
  }
  try {
    return JSON.parse(stripBom(input));
  } catch {
    return {};
  }
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/u, '');
}

function validPath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
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
