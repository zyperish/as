#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { remember } from '../tools/am-local-store.mjs';

const args = parseArgs(process.argv.slice(2));
const channel = sanitizePathSegment(args.channel || 'desktop');
const mode = args.mode || 'archive';
const payloadText = await readStdin();
const payload = parseJson(payloadText) || {};
const projectRoot = resolveProjectRoot(args.projectRoot || payload.cwd || process.cwd());
const codexRoot = findCodexRoot(projectRoot);
let sessionPath = resolveSessionPath(payload, projectRoot);
let promptContext = null;

try {
  if (mode === 'prompt') {
    await recordPromptContext(projectRoot, channel, payload);
    process.exit(0);
  }
  promptContext = await readPromptContext(projectRoot, channel);
  if (!sessionPath && promptContext) {
    sessionPath = resolveSessionPath(promptContext, projectRoot);
    if (sessionPath) {
      await writeDiagnostic(projectRoot, `INFO ${channel} archive using prompt-context transcript path`);
    }
  }
  if (!sessionPath) {
    const payloadKeys = Object.keys(payload || {}).sort().join(',') || 'none';
    const contextState = promptContext ? 'prompt-context present without transcriptPath/sessionId' : 'prompt-context missing';
    await writeDiagnostic(projectRoot, `WARN ${channel} archive skipped: session path missing; payload keys=${payloadKeys}; ${contextState}`);
    process.exit(0);
  }
  if (!fssync.existsSync(sessionPath)) {
    await writeDiagnostic(projectRoot, `WARN ${channel} archive skipped: transcript path not found: ${sessionPath}`);
    process.exit(0);
  }
  const transcript = await readSessionTranscript(sessionPath);
  if (transcript.turns.length === 0) {
    await writeDiagnostic(projectRoot, `WARN desktop archive skipped: no readable conversation in ${sessionPath}`);
    process.exit(0);
  }
  const fingerprint = buildFingerprint(sessionPath, transcript);
  if (await wasAlreadyArchived(projectRoot, channel, fingerprint)) {
    process.exit(0);
  }
  const markdown = renderMarkdown({
    channel,
    projectRoot,
    sessionPath,
    sessionId: String(payload.session_id || promptContext?.sessionId || transcript.sessionId || ''),
    archivedAt: new Date(),
    turns: transcript.turns,
  });
  const archiveDir = path.join(projectRoot, '.codex', 'conversation-archive', channel);
  await fs.mkdir(archiveDir, { recursive: true });
  await rotateArchiveFiles(archiveDir, 5);
  const markdownPath = path.join(archiveDir, 'conversation-1.md');
  await fs.writeFile(markdownPath, markdown, 'utf8');
  await writeFingerprint(projectRoot, channel, fingerprint);
  const flushedArchiveKeys = await flushQueuedAgentmemory(projectRoot, codexRoot);
  const archivePayload = {
    content: markdown,
    concepts: ['conversation-archive', `conversation-${channel}`, 'codex-desktop'],
    files: [markdownPath],
    contentPath: markdownPath,
  };
  const synced = flushedArchiveKeys.has(markdownPath)
    ? true
    : await syncAgentmemory(projectRoot, codexRoot, archivePayload);
  if (!synced) {
    await enqueueAgentmemory(projectRoot, archivePayload);
  }
} catch (error) {
  await writeDiagnostic(projectRoot, `WARN desktop archive failed: ${error instanceof Error ? error.message : String(error)}`);
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--channel' && next) {
      out.channel = next;
      index += 1;
    } else if (arg === '--project-root' && next) {
      out.projectRoot = next;
      index += 1;
    } else if (arg === '--mode' && next) {
      out.mode = next;
      index += 1;
    }
  }
  return out;
}

async function recordPromptContext(projectRoot, channel, payload) {
  const dir = path.join(projectRoot, '.codex', 'conversation-archive');
  await fs.mkdir(dir, { recursive: true });
  const contextPath = path.join(dir, `.${channel}-prompt-context.json`);
  await fs.writeFile(contextPath, JSON.stringify({
    recordedAt: new Date().toISOString(),
    cwd: payload.cwd || projectRoot,
    sessionId: payload.session_id || null,
    transcriptPath: payload.transcript_path || payload.transcriptPath || payload.session_path || payload.sessionPath || null,
    prompt: payload.prompt || payload.user_prompt || payload.message || payload.text || '',
  }, null, 2), 'utf8');
}

async function readPromptContext(projectRoot, channel) {
  const contextPath = path.join(projectRoot, '.codex', 'conversation-archive', `.${channel}-prompt-context.json`);
  try {
    const raw = await fs.readFile(contextPath, 'utf8');
    const parsed = parseJson(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function parseJson(text) {
  try {
    const normalized = stripBom(String(text || '')).trim();
    return normalized ? JSON.parse(normalized) : null;
  } catch {
    return null;
  }
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/u, '');
}

function resolveProjectRoot(value) {
  return path.resolve(String(value || process.cwd()));
}

function resolveSessionPath(payload, projectRoot) {
  const baseRoot = typeof payload?.cwd === 'string' && payload.cwd.trim()
    ? path.resolve(projectRoot, payload.cwd.trim())
    : projectRoot;
  for (const key of ['transcript_path', 'transcriptPath', 'session_path', 'sessionPath', 'rollout_path', 'rolloutPath']) {
    const value = typeof payload?.[key] === 'string' ? payload[key].trim() : '';
    if (value) {
      return path.resolve(baseRoot, value);
    }
  }
  const sessionId = typeof payload?.session_id === 'string' ? payload.session_id.trim() : '';
  if (!sessionId) {
    return null;
  }
  const codexHome = process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.codex');
  const sessionsRoot = path.join(codexHome, 'sessions');
  const candidates = findSessionCandidates(sessionsRoot, sessionId);
  return candidates[0] || null;
}

function findSessionCandidates(root, sessionId) {
  const out = [];
  if (!root || !fssync.existsSync(root)) {
    return out;
  }
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fssync.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith('.jsonl')) {
        out.push(fullPath);
      }
    }
  }
  return out.sort((a, b) => fssync.statSync(b).mtimeMs - fssync.statSync(a).mtimeMs);
}

async function readSessionTranscript(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  const turns = [];
  let sessionId = '';
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) {
      continue;
    }
    const entry = parseJson(line);
    if (!entry) {
      continue;
    }
    if (entry.type === 'session_meta' && entry.payload?.id) {
      sessionId = String(entry.payload.id);
    }
    const extracted = extractConversationItem(entry);
    if (!extracted) {
      continue;
    }
    const previous = turns.at(-1);
    if (previous && previous.role === extracted.role) {
      previous.text = `${previous.text}\n\n${extracted.text}`.trim();
    } else {
      turns.push(extracted);
    }
  }
  return {
    sessionId,
    turns,
  };
}

function extractConversationItem(entry) {
  const payload = entry?.payload || {};
  if (entry.type === 'event_msg' && payload.type === 'user_message') {
    const text = normalizeText(payload.message || payload.text || textElementsToText(payload.text_elements));
    return text ? { role: 'user', text } : null;
  }
  if (entry.type !== 'response_item' || payload.type !== 'message') {
    return null;
  }
  const role = payload.role === 'assistant' ? 'assistant' : payload.role === 'user' ? 'user' : '';
  if (!role) {
    return null;
  }
  const text = normalizeText(contentToText(payload.content));
  return text ? { role, text } : null;
}

function textElementsToText(value) {
  if (!Array.isArray(value)) {
    return '';
  }
  return value.map((item) => item?.text || item?.content || '').filter(Boolean).join('\n\n');
}

function contentToText(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      return item?.text || item?.content || item?.input_text || item?.output_text || '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function renderMarkdown({ channel, projectRoot, sessionPath, sessionId, archivedAt, turns }) {
  const lines = [
    '# Conversation Archive',
    '',
    `- Archived at: ${archivedAt.toISOString()}`,
    `- Channel: ${channel}`,
    `- Project: ${projectRoot}`,
    `- Session file: ${sessionPath}`,
  ];
  if (sessionId) {
    lines.push(`- Session: ${sessionId}`);
  }
  lines.push('');
  for (const turn of turns) {
    lines.push(`## ${turn.role === 'assistant' ? 'Assistant' : 'User'}`);
    lines.push('');
    lines.push(turn.text || '_(empty)_');
    lines.push('');
  }
  return lines.join('\n');
}

function buildFingerprint(sessionPath, transcript) {
  const last = transcript.turns.at(-1);
  return JSON.stringify({
    sessionPath,
    count: transcript.turns.length,
    lastRole: last?.role || '',
    lastText: last?.text || '',
  });
}

async function wasAlreadyArchived(projectRoot, channel, fingerprint) {
  const pathName = fingerprintPath(projectRoot, channel);
  try {
    return (await fs.readFile(pathName, 'utf8')) === fingerprint;
  } catch {
    return false;
  }
}

async function writeFingerprint(projectRoot, channel, fingerprint) {
  const pathName = fingerprintPath(projectRoot, channel);
  await fs.mkdir(path.dirname(pathName), { recursive: true });
  await fs.writeFile(pathName, fingerprint, 'utf8');
}

function fingerprintPath(projectRoot, channel) {
  return path.join(projectRoot, '.codex', 'conversation-archive', `.${channel}-last-fingerprint`);
}

async function rotateArchiveFiles(archiveDir, maxArchives) {
  await fs.rm(path.join(archiveDir, `conversation-${maxArchives}.md`), { force: true });
  for (let index = maxArchives - 1; index >= 1; index -= 1) {
    const source = path.join(archiveDir, `conversation-${index}.md`);
    const target = path.join(archiveDir, `conversation-${index + 1}.md`);
    if (fssync.existsSync(source)) {
      await fs.rm(target, { force: true });
      await fs.rename(source, target);
    }
  }
}

async function flushQueuedAgentmemory(projectRoot, codexRoot) {
  const queuePath = agentmemoryQueuePath(projectRoot);
  if (!fssync.existsSync(queuePath)) {
    return new Set();
  }
  const pendingPath = `${queuePath}.pending-${process.pid}`;
  let pendingCount = 0;
  const syncedArchiveKeys = new Set();
  const pending = await fs.open(pendingPath, 'w');
  try {
    const rl = readline.createInterface({
      input: fssync.createReadStream(queuePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      const payload = parseJson(line);
      const archiveKey = firstString(payload?.contentPath, payload?.files?.[0]);
      if (archiveKey && syncedArchiveKeys.has(archiveKey)) {
        continue;
      }
      if (payload && await syncAgentmemory(projectRoot, codexRoot, payload)) {
        if (archiveKey) syncedArchiveKeys.add(archiveKey);
        continue;
      }
      await pending.write(`${line}\n`);
      pendingCount += 1;
    }
  } finally {
    await pending.close();
  }
  if (pendingCount === 0) {
    await fs.rm(queuePath, { force: true });
    await fs.rm(pendingPath, { force: true });
    return syncedArchiveKeys;
  }
  await fs.rename(pendingPath, queuePath);
  return syncedArchiveKeys;
}

async function syncAgentmemory(projectRoot, codexRoot, payload) {
  try {
    const archivePath = firstString(payload?.contentPath, payload?.files?.[0]);
    const archiveName = archivePath ? path.basename(archivePath) : 'conversation archive';
    const isLegacyInlineArchive = typeof payload?.content === 'string' && payload.content.startsWith('# Conversation Archive');
    if (archivePath && await hasActiveArchiveReference(projectRoot, archivePath)) {
      return true;
    }
    const content = archivePath
      ? [
        'Conversation archive stored on disk.',
        `Archive path: ${archivePath}`,
        'Use the archive file as the source of truth; do not promote old archive bodies as new memories by default.',
      ].join('\n')
      : String(payload?.content || '');
    if (isLegacyInlineArchive && !archivePath) {
      return true;
    }
    const result = await remember(projectRoot, {
      content,
      title: `Conversation Archive Reference: ${archiveName}`,
      type: 'conversation_archive',
      layer: 'episodic',
      importance: 'normal',
      concepts: payload?.concepts || ['conversation-archive', 'codex-desktop'],
      files: payload?.files || [],
      project: projectRoot,
      source: {
        kind: 'conversation_archive',
        path: payload?.files?.[0] || '',
      },
    });
    return Boolean(result.ok);
  } catch {
    return false;
  }
}

async function hasActiveArchiveReference(projectRoot, archivePath) {
  const memoriesPath = path.join(projectRoot, '.codex', 'memory', 'am', 'memories.jsonl');
  if (!fssync.existsSync(memoriesPath)) return false;
  const tombstones = await readTombstoneTargets(projectRoot);
  return new Promise((resolve) => {
    let found = false;
    const stream = fssync.createReadStream(memoriesPath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (found || !line.trim()) return;
      const record = parseJson(line);
      if (!record || record.kind !== 'memory' || record.type !== 'conversation_archive' || tombstones.has(record.id)) return;
      const existingPath = firstString(record.source?.path, record.files?.[0], record.sourcePath);
      if (existingPath === archivePath) {
        found = true;
        rl.close();
        stream.destroy();
      }
    });
    rl.on('close', () => resolve(found));
    rl.on('error', () => resolve(false));
    stream.on('error', () => resolve(false));
  });
}

async function readTombstoneTargets(projectRoot) {
  const tombstonePath = path.join(projectRoot, '.codex', 'memory', 'am', 'tombstones.jsonl');
  const targets = new Set();
  if (!fssync.existsSync(tombstonePath)) return targets;
  const rl = readline.createInterface({
    input: fssync.createReadStream(tombstonePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const record = parseJson(line);
    if (record?.targetId) targets.add(record.targetId);
  }
  return targets;
}

async function enqueueAgentmemory(projectRoot, payload) {
  const queuePath = agentmemoryQueuePath(projectRoot);
  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  const queued = {
    ...payload,
    content: payload?.contentPath ? undefined : payload?.content,
  };
  await fs.appendFile(queuePath, `${JSON.stringify(queued)}\n`, 'utf8');
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function agentmemoryQueuePath(projectRoot) {
  return path.join(projectRoot, '.codex', 'conversation-archive', '.agentmemory-queue.jsonl');
}

async function writeDiagnostic(projectRoot, message) {
  const logPath = path.join(projectRoot, '.codex', 'conversation-archive', 'archive-hook.log');
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function findCodexRoot(projectRoot) {
  let current = projectRoot;
  while (true) {
    const candidate = path.join(current, '.codex', 'start-agentmemory-mcp.ps1');
    if (fssync.existsSync(candidate)) {
      return path.join(current, '.codex');
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    }
    current = parent;
  }
}

function sanitizePathSegment(value) {
  return String(value || '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .trim() || 'conversation';
}
