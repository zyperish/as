#!/usr/bin/env node
// AI Chatroom MCP server (zero-dependency, stdio JSON-RPC).
// Lets multiple AI clients (Codex, Claude Desktop, etc.) talk through a shared
// local JSONL log. Matches the hand-written protocol used by repo-context-mcp.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args['project-root'] || process.env.AI_CHATROOM_PROJECT_ROOT || process.cwd());
const chatDir = path.join(projectRoot, '.codex', 'ai-chatroom');
const chatLog = path.join(chatDir, 'messages.jsonl');

fs.mkdirSync(chatDir, { recursive: true });
if (!fs.existsSync(chatLog)) {
  fs.writeFileSync(chatLog, '', 'utf8');
}

const toolSchemas = [
  {
    name: 'send_message',
    description: 'Post a message to the shared AI chatroom so other connected AIs can read it.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Your AI identity, e.g. "Codex-GPT" or "Desktop-Claude".' },
        message: { type: 'string', description: 'Message text to post.' },
        replyTo: { type: 'number', description: 'Optional 1-based index of the message you are replying to.' },
      },
      required: ['from', 'message'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_messages',
    description: 'Read recent chatroom messages. Use "since" to poll only for new ones.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many recent messages to return (default 20, max 200).' },
        since: { type: 'string', description: 'ISO timestamp; only return messages strictly after this time.' },
        from: { type: 'string', description: 'Optional filter to one sender.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'wait_for_message',
    description: 'Block until a new message arrives (polling). Useful for turn-taking between AIs.',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO timestamp; wait for a message strictly after this time.' },
        excludeFrom: { type: 'string', description: 'Ignore messages from this sender (usually yourself).' },
        timeoutSeconds: { type: 'number', description: 'Max seconds to wait (default 60, max 300).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_participants',
    description: 'List every AI that has posted, with message counts and last-seen time.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'clear_messages',
    description: 'Archive the current chatroom log and start an empty one. Nothing is permanently deleted.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

let inputBuffer = Buffer.alloc(0);
let processing = Promise.resolve();

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processing = processing.then(() => processBufferedInput()).catch((error) => {
    writeLog(`ai-chatroom input error: ${error.message}`);
  });
});

process.stdin.on('end', () => {
  processing
    .then(() => processBufferedInput())
    .then(() => process.exit(0))
    .catch((error) => {
      writeLog(`ai-chatroom shutdown error: ${error.message}`);
      process.exit(1);
    });
});

async function processBufferedInput() {
  while (inputBuffer.length > 0) {
    const text = inputBuffer.toString('utf8');
    const headerEnd = text.indexOf('\r\n\r\n');
    if (headerEnd >= 0) {
      const header = text.slice(0, headerEnd);
      const match = header.match(/content-length:\s*(\d+)/iu);
      if (!match) {
        inputBuffer = inputBuffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1], 10);
      const bodyStart = Buffer.byteLength(text.slice(0, headerEnd + 4), 'utf8');
      if (inputBuffer.length < bodyStart + length) {
        return;
      }
      const body = inputBuffer.slice(bodyStart, bodyStart + length).toString('utf8');
      inputBuffer = inputBuffer.slice(bodyStart + length);
      await handleMessage(JSON.parse(body));
      continue;
    }

    const newline = text.indexOf('\n');
    if (newline < 0) {
      return;
    }
    const line = text.slice(0, newline).trim();
    inputBuffer = inputBuffer.slice(Buffer.byteLength(text.slice(0, newline + 1), 'utf8'));
    if (line) {
      await handleMessage(JSON.parse(line));
    }
  }
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.id === undefined || message.method === 'notifications/initialized') {
    return;
  }
  try {
    if (message.method === 'initialize') {
      sendResult(message.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'ai-chatroom', version: '1.0.0' },
      });
      return;
    }
    if (message.method === 'tools/list') {
      sendResult(message.id, { tools: toolSchemas });
      return;
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name;
      const toolArgs = message.params?.arguments || {};
      const result = await callTool(name, toolArgs);
      sendResult(message.id, {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      });
      return;
    }
    sendError(message.id, -32601, `Unknown method: ${message.method}`);
  } catch (error) {
    sendError(message.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

async function callTool(name, toolArgs) {
  switch (name) {
    case 'send_message':
      return sendChatMessage(toolArgs);
    case 'read_messages':
      return readChatMessages(toolArgs);
    case 'wait_for_message':
      return waitForMessage(toolArgs);
    case 'list_participants':
      return listParticipants();
    case 'clear_messages':
      return clearMessages();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function readAll() {
  const content = await fsp.readFile(chatLog, 'utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function sendChatMessage(toolArgs) {
  const from = String(toolArgs.from || '').trim();
  const message = String(toolArgs.message || '').trim();
  if (!from) throw new Error('"from" is required');
  if (!message) throw new Error('"message" is required');

  const record = {
    from,
    message,
    timestamp: new Date().toISOString(),
  };
  if (Number.isInteger(toolArgs.replyTo)) {
    record.replyTo = toolArgs.replyTo;
  }

  await fsp.appendFile(chatLog, JSON.stringify(record) + '\n', 'utf8');
  return `Sent as "${from}" at ${record.timestamp}. Other AIs can read it with read_messages.`;
}

function formatMessages(messages, startIndex) {
  return messages
    .map((m, i) => {
      const idx = startIndex + i + 1;
      const reply = m.replyTo ? ` (reply to #${m.replyTo})` : '';
      return `#${idx} [${m.timestamp}] ${m.from}${reply}:\n${m.message}`;
    })
    .join('\n\n');
}

async function readChatMessages(toolArgs) {
  const limit = Math.min(Math.max(Number(toolArgs.limit) || 20, 1), 200);
  const since = toolArgs.since ? new Date(toolArgs.since) : null;
  const fromFilter = toolArgs.from ? String(toolArgs.from) : null;

  let all = await readAll();
  const total = all.length;
  if (since && !Number.isNaN(since.getTime())) {
    all = all.filter((m) => new Date(m.timestamp) > since);
  }
  if (fromFilter) {
    all = all.filter((m) => m.from === fromFilter);
  }

  const slice = all.slice(-limit);
  const startIndex = total - slice.length;

  return {
    count: slice.length,
    totalInRoom: total,
    latestTimestamp: slice.length ? slice[slice.length - 1].timestamp : null,
    messages: slice,
    formatted: slice.length ? formatMessages(slice, startIndex) : 'No matching messages yet.',
  };
}

async function waitForMessage(toolArgs) {
  const since = toolArgs.since ? new Date(toolArgs.since) : new Date(0);
  const excludeFrom = toolArgs.excludeFrom ? String(toolArgs.excludeFrom) : null;
  const timeoutMs = Math.min(Math.max(Number(toolArgs.timeoutSeconds) || 60, 1), 300) * 1000;
  const pollMs = 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const all = await readAll();
    const fresh = all.filter((m) => {
      const isNew = new Date(m.timestamp) > since;
      const allowed = !excludeFrom || m.from !== excludeFrom;
      return isNew && allowed;
    });
    if (fresh.length > 0) {
      const startIndex = all.length - fresh.length;
      return {
        gotMessage: true,
        count: fresh.length,
        latestTimestamp: fresh[fresh.length - 1].timestamp,
        messages: fresh,
        formatted: formatMessages(fresh, startIndex),
      };
    }
    await sleep(pollMs);
  }

  return {
    gotMessage: false,
    note: `No new message within ${timeoutMs / 1000}s. Call wait_for_message again to keep waiting.`,
  };
}

async function listParticipants() {
  const all = await readAll();
  const stats = new Map();
  for (const m of all) {
    const entry = stats.get(m.from) || { from: m.from, messages: 0, lastSeen: null };
    entry.messages += 1;
    entry.lastSeen = m.timestamp;
    stats.set(m.from, entry);
  }
  const participants = [...stats.values()];
  return {
    participantCount: participants.length,
    totalMessages: all.length,
    participants,
  };
}

async function clearMessages() {
  const all = await readAll();
  if (all.length === 0) {
    return 'Chatroom is already empty.';
  }
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const archivePath = path.join(chatDir, `messages-archived-${stamp}.jsonl`);
  await fsp.copyFile(chatLog, archivePath);
  await fsp.writeFile(chatLog, '', 'utf8');
  return `Archived ${all.length} messages to ${path.relative(projectRoot, archivePath)} and reset the chatroom.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function send(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function writeLog(message) {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    // ignore
  }
}
