import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hookDir = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(hookDir, 'archive-conversation.mjs');

async function withTempRoot(fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'archive-hook-'));
  try {
    await fn(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test('archive hook stores archive references instead of full archive bodies', async () => {
  await withTempRoot(async (root) => {
    const sessionPath = path.join(root, 'session.jsonl');
    await fsp.writeFile(sessionPath, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'archive-test-session' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '请记住最新规则。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: '已经按最新规则处理。' }] } }),
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      hookPath,
      '--project-root',
      root,
      '--channel',
      'desktop',
    ], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_path: sessionPath, session_id: 'archive-test-session' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const memoriesPath = path.join(root, '.codex', 'memory', 'am', 'memories.jsonl');
    const memories = (await fsp.readFile(memoriesPath, 'utf8'))
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const archiveMemory = memories.find((memory) => memory.type === 'conversation_archive');
    assert.ok(archiveMemory);
    assert.match(archiveMemory.content, /Conversation archive stored on disk/u);
    assert.ok(archiveMemory.content.includes(path.join('desktop', 'conversation-1.md')));
    assert.equal(archiveMemory.content.includes('请记住最新规则'), false);
  });
});

test('archive hook flushes legacy inline archive queue without promoting old body text', async () => {
  await withTempRoot(async (root) => {
    const queuePath = path.join(root, '.codex', 'conversation-archive', '.agentmemory-queue.jsonl');
    await fsp.mkdir(path.dirname(queuePath), { recursive: true });
    await fsp.writeFile(queuePath, `${JSON.stringify({
      content: '# Conversation Archive\n\nold body should not become a new memory',
      concepts: ['conversation-archive'],
      files: [],
    })}\n`, 'utf8');

    const sessionPath = path.join(root, 'session.jsonl');
    await fsp.writeFile(sessionPath, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'flush-test-session' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '新会话。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: '新回复。' }] } }),
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      hookPath,
      '--project-root',
      root,
      '--channel',
      'desktop',
    ], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_path: sessionPath, session_id: 'flush-test-session' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const memoriesPath = path.join(root, '.codex', 'memory', 'am', 'memories.jsonl');
    const memories = await fsp.readFile(memoriesPath, 'utf8');
    assert.equal(memories.includes('old body should not become a new memory'), false);
  });
});

test('archive hook deduplicates queued archive references by path during flush', async () => {
  await withTempRoot(async (root) => {
    const queuePath = path.join(root, '.codex', 'conversation-archive', '.agentmemory-queue.jsonl');
    const queuedArchivePath = path.join(root, '.codex', 'conversation-archive', 'desktop', 'conversation-1.md');
    await fsp.mkdir(path.dirname(queuePath), { recursive: true });
    await fsp.writeFile(queuePath, [
      JSON.stringify({
        contentPath: queuedArchivePath,
        concepts: ['conversation-archive'],
        files: [queuedArchivePath],
      }),
      JSON.stringify({
        contentPath: queuedArchivePath,
        concepts: ['conversation-archive'],
        files: [queuedArchivePath],
      }),
      '',
    ].join('\n'), 'utf8');

    const sessionPath = path.join(root, 'session.jsonl');
    await fsp.writeFile(sessionPath, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'dedupe-test-session' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '新会话。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: '新回复。' }] } }),
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      hookPath,
      '--project-root',
      root,
      '--channel',
      'desktop',
    ], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_path: sessionPath, session_id: 'dedupe-test-session' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const memoriesPath = path.join(root, '.codex', 'memory', 'am', 'memories.jsonl');
    const memories = (await fsp.readFile(memoriesPath, 'utf8'))
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const queuedRefs = memories.filter((memory) => memory.type === 'conversation_archive'
      && memory.content.includes(queuedArchivePath));
    assert.equal(queuedRefs.length, 1);
  });
});

test('archive hook does not write another active reference for an existing archive path', async () => {
  await withTempRoot(async (root) => {
    const archivePath = path.join(root, '.codex', 'conversation-archive', 'desktop', 'conversation-1.md');
    const memoriesPath = path.join(root, '.codex', 'memory', 'am', 'memories.jsonl');
    await fsp.mkdir(path.dirname(memoriesPath), { recursive: true });
    await fsp.writeFile(memoriesPath, `${JSON.stringify({
      id: 'mem_existing_archive_ref',
      kind: 'memory',
      type: 'conversation_archive',
      title: 'Conversation Archive Reference: conversation-1.md',
      content: `Conversation archive stored on disk.\nArchive path: ${archivePath}`,
      timestamp: '2026-06-29T00:00:00.000Z',
      files: [archivePath],
      source: { kind: 'conversation_archive', path: archivePath },
    })}\n`, 'utf8');

    const sessionPath = path.join(root, 'session.jsonl');
    await fsp.writeFile(sessionPath, [
      JSON.stringify({ type: 'session_meta', payload: { id: 'existing-ref-test-session' } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: '新会话。' } }),
      JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ text: '新回复。' }] } }),
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      hookPath,
      '--project-root',
      root,
      '--channel',
      'desktop',
    ], {
      cwd: root,
      input: JSON.stringify({ cwd: root, session_path: sessionPath, session_id: 'existing-ref-test-session' }),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const refs = (await fsp.readFile(memoriesPath, 'utf8'))
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((memory) => memory.type === 'conversation_archive' && memory.files?.[0] === archivePath);
    assert.equal(refs.length, 1);
  });
});
