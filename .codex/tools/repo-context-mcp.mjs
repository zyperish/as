#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args['project-root'] || process.env.REPO_CONTEXT_PROJECT_ROOT || process.cwd());
const cacheDir = path.join(projectRoot, '.codex', 'repo-context');
const cachePath = path.join(cacheDir, 'index.json');
const maxTextBytes = Number.parseInt(args['max-text-bytes'] || '1048576', 10);

const ignoreDirNames = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.godot',
  '.import',
  'logs',
  'tmp',
  'temp',
  'agentmemory-runtime',
  'conversation-archive',
  'ralph-runs',
  'downloads',
  'engines',
]);

const binaryExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.zip',
  '.7z',
  '.rar',
  '.exe',
  '.dll',
  '.pdb',
  '.mp3',
  '.mp4',
  '.mov',
  '.wav',
  '.pdf',
]);

const toolSchemas = [
  {
    name: 'status',
    description: 'Return repo-context cache status for the current project.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'index',
    description: 'Index readable project files with dependency, build, cache, log, binary, and large-file skips.',
    inputSchema: {
      type: 'object',
      properties: { force: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
  {
    name: 'search',
    description: 'Search indexed file paths and, optionally, readable file contents.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number' },
        includeContent: { type: 'boolean' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'structure',
    description: 'Summarize directory structure, counts, and language distribution.',
    inputSchema: {
      type: 'object',
      properties: { maxDepth: { type: 'number' } },
      additionalProperties: false,
    },
  },
  {
    name: 'entrypoints',
    description: 'Identify likely README, config, app, test, script, and build entrypoint files.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'context_for_files',
    description: 'Given target files, suggest must-read files, related tests, and likely impacted files.',
    inputSchema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string' } } },
      required: ['files'],
      additionalProperties: false,
    },
  },
  {
    name: 'analyze_change',
    description: 'Inspect git changes when available and suggest context, tests, and risk areas.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

let inputBuffer = Buffer.alloc(0);
let processing = Promise.resolve();

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  processing = processing.then(() => processBufferedInput()).catch((error) => {
    writeLog(`repo-context input error: ${error.message}`);
  });
});

process.stdin.on('end', () => {
  processing
    .then(() => processBufferedInput())
    .then(() => process.exit(0))
    .catch((error) => {
      writeLog(`repo-context shutdown error: ${error.message}`);
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
        serverInfo: { name: 'repo-context', version: '0.1.0' },
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
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
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
    case 'status':
      return getStatus();
    case 'index':
      return buildAndSaveIndex(Boolean(toolArgs.force));
    case 'search':
      return searchIndex(String(toolArgs.query || ''), Number(toolArgs.maxResults || 25), toolArgs.includeContent !== false);
    case 'structure':
      return structureSummary(Number(toolArgs.maxDepth || 3));
    case 'entrypoints':
      return entrypointsSummary();
    case 'context_for_files':
      return contextForFiles(Array.isArray(toolArgs.files) ? toolArgs.files : []);
    case 'analyze_change':
      return analyzeChange();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function getStatus() {
  const cache = await readIndexIfPresent();
  return {
    projectRoot,
    cachePath,
    cacheExists: Boolean(cache),
    indexedAt: cache?.indexedAt || null,
    fileCount: cache?.files?.length || 0,
    ignoredDirectories: [...ignoreDirNames].sort(),
  };
}

async function buildAndSaveIndex() {
  const files = [];
  await walk(projectRoot, async (absolutePath, stat) => {
    const relativePath = toRelative(absolutePath);
    if (shouldSkipFile(relativePath, stat.size)) {
      return;
    }
    files.push({
      path: relativePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      ext: path.extname(relativePath).toLowerCase(),
      language: languageFor(relativePath),
    });
  });
  files.sort((a, b) => a.path.localeCompare(b.path));
  const index = {
    projectRoot,
    indexedAt: new Date().toISOString(),
    files,
  };
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.writeFile(cachePath, JSON.stringify(index, null, 2), 'utf8');
  return {
    projectRoot,
    cachePath,
    indexedAt: index.indexedAt,
    fileCount: files.length,
    languageCounts: countBy(files.map((file) => file.language)),
  };
}

async function searchIndex(query, maxResults, includeContent) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { projectRoot, query, results: [] };
  }
  const index = await ensureIndex();
  const results = [];
  for (const file of index.files) {
    if (results.length >= maxResults) {
      break;
    }
    const pathHit = file.path.toLowerCase().includes(normalizedQuery);
    let textHit = null;
    if (!pathHit && includeContent && file.size <= maxTextBytes && !isBinaryPath(file.path)) {
      const text = await readTextSafe(file.path);
      const line = findLine(text, normalizedQuery);
      if (line) {
        textHit = line;
      }
    }
    if (pathHit || textHit) {
      results.push({
        path: file.path,
        language: file.language,
        size: file.size,
        match: pathHit ? 'path' : 'content',
        line: textHit,
      });
    }
  }
  return { projectRoot, query, results };
}

async function structureSummary(maxDepth) {
  const index = await ensureIndex();
  const tree = new Map();
  for (const file of index.files) {
    const parts = file.path.split(/[\\/]+/u);
    const depth = Math.min(parts.length - 1, Math.max(1, maxDepth));
    const key = parts.slice(0, depth).join('/');
    const item = tree.get(key) || { path: key || '.', files: 0, bytes: 0 };
    item.files += 1;
    item.bytes += file.size;
    tree.set(key, item);
  }
  return {
    projectRoot,
    fileCount: index.files.length,
    languageCounts: countBy(index.files.map((file) => file.language)),
    directories: [...tree.values()].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 200),
  };
}

async function entrypointsSummary() {
  const index = await ensureIndex();
  const files = index.files.map((file) => file.path);
  const categories = {
    readme: pick(files, /(^|[\\/])readme(\.[^.]+)?$/iu),
    package: pick(files, /(^|[\\/])package\.json$/iu),
    godot: pick(files, /(^|[\\/])project\.godot$/iu),
    app: pick(files, /(^|[\\/])(main|app|index|server|cli)\.(js|mjs|cjs|ts|tsx|py|gd)$/iu),
    tests: pick(files, /(^|[\\/])(test|tests|__tests__)[\\/]|(\.test|\.spec)\.(js|mjs|cjs|ts|tsx|py)$/iu),
    scripts: pick(files, /(^|[\\/])scripts[\\/]|\.ps1$/iu),
    configs: pick(files, /(^|[\\/])(\.mcp\.json|tsconfig\.json|vite\.config|project\.godot|pyproject\.toml|package\.json)$/iu),
  };
  return { projectRoot, categories };
}

async function contextForFiles(targetFiles) {
  const index = await ensureIndex();
  const files = index.files.map((file) => file.path);
  const normalizedTargets = targetFiles.map((item) => normalizeRel(item)).filter(Boolean);
  const mustRead = new Set();
  const suggestedRead = new Set();
  const tests = new Set();
  const likelyImpacted = new Set();

  for (const target of normalizedTargets) {
    if (files.includes(target)) {
      mustRead.add(target);
    }
    const dir = path.dirname(target).replace(/\\/gu, '/');
    const base = path.basename(target, path.extname(target)).toLowerCase();
    for (const file of files) {
      const fileDir = path.dirname(file).replace(/\\/gu, '/');
      const fileBase = path.basename(file, path.extname(file)).toLowerCase();
      if (fileDir === dir && file !== target) {
        suggestedRead.add(file);
      }
      if (isTestPath(file) && (fileBase.includes(base) || base.includes(fileBase))) {
        tests.add(file);
      }
      if (file !== target && (file.toLowerCase().includes(base) || fileBase.includes(base))) {
        likelyImpacted.add(file);
      }
    }
    const refs = await filesReferencing(target, files, 20);
    refs.forEach((item) => likelyImpacted.add(item));
  }

  addEntrypointHints(files, mustRead);
  return {
    projectRoot,
    targets: normalizedTargets,
    mustRead: limitSet(mustRead, 30),
    suggestedRead: limitSet(suggestedRead, 50),
    tests: limitSet(tests, 50),
    likelyImpacted: limitSet(likelyImpacted, 80),
  };
}

async function analyzeChange() {
  const changedFiles = gitChangedFiles();
  if (changedFiles.length === 0) {
    return {
      projectRoot,
      gitAvailable: isGitRepo(),
      changedFiles: [],
      note: 'No git changes detected, or this directory is not a git repository.',
    };
  }
  const context = await contextForFiles(changedFiles);
  return {
    projectRoot,
    gitAvailable: true,
    changedFiles,
    context,
  };
}

async function ensureIndex() {
  const cache = await readIndexIfPresent();
  if (cache?.files) {
    return cache;
  }
  await buildAndSaveIndex();
  return readIndexIfPresent();
}

async function readIndexIfPresent() {
  try {
    return JSON.parse(await fsp.readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function walk(current, onFile) {
  let entries = [];
  try {
    entries = await fsp.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    const relativePath = toRelative(fullPath);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(relativePath, entry.name)) {
        await walk(fullPath, onFile);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    let stat = null;
    try {
      stat = await fsp.stat(fullPath);
    } catch {
      continue;
    }
    await onFile(fullPath, stat);
  }
}

function shouldSkipDirectory(relativePath, name) {
  if (ignoreDirNames.has(name)) {
    return true;
  }
  const normalized = relativePath.replace(/\\/gu, '/');
  return normalized === '.codex/repo-context' || normalized === '.codex/memory';
}

function shouldSkipFile(relativePath, size) {
  if (size > maxTextBytes * 2) {
    return true;
  }
  return isBinaryPath(relativePath);
}

function isBinaryPath(relativePath) {
  return binaryExtensions.has(path.extname(relativePath).toLowerCase());
}

async function readTextSafe(relativePath) {
  try {
    return await fsp.readFile(path.join(projectRoot, relativePath), 'utf8');
  } catch {
    return '';
  }
}

function findLine(text, query) {
  const lines = String(text || '').split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase().includes(query)) {
      return { number: index + 1, text: lines[index].slice(0, 300) };
    }
  }
  return null;
}

async function filesReferencing(target, files, max) {
  const refs = [];
  const stem = path.basename(target, path.extname(target)).toLowerCase();
  const importName = target.replace(/\\/gu, '/').replace(/\.[^.]+$/u, '').toLowerCase();
  for (const file of files) {
    if (refs.length >= max || file === target || isBinaryPath(file)) {
      continue;
    }
    const stat = await statSafe(file);
    if (!stat || stat.size > maxTextBytes) {
      continue;
    }
    const text = (await readTextSafe(file)).toLowerCase();
    if (text.includes(importName) || text.includes(stem)) {
      refs.push(file);
    }
  }
  return refs;
}

async function statSafe(relativePath) {
  try {
    return await fsp.stat(path.join(projectRoot, relativePath));
  } catch {
    return null;
  }
}

function addEntrypointHints(files, out) {
  for (const file of files) {
    if (/readme(\.[^.]+)?$/iu.test(file) || /(^|[\\/])package\.json$/iu.test(file) || /(^|[\\/])project\.godot$/iu.test(file)) {
      out.add(file);
    }
  }
}

function gitChangedFiles() {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' });
  if (status.status !== 0) {
    return [];
  }
  return status.stdout
    .split(/\r?\n/u)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .map((line) => normalizeRel(line.replace(/^"|"$/gu, '')));
}

function isGitRepo() {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: projectRoot, encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function pick(files, regex) {
  return files.filter((file) => regex.test(file)).slice(0, 50);
}

function isTestPath(file) {
  return /(^|[\\/])(test|tests|__tests__)[\\/]|(\.test|\.spec)\./iu.test(file);
}

function languageFor(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const map = {
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.ps1': 'powershell',
    '.gd': 'gdscript',
    '.tscn': 'godot-scene',
    '.json': 'json',
    '.md': 'markdown',
    '.toml': 'toml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.html': 'html',
    '.css': 'css',
  };
  return map[ext] || (ext ? ext.slice(1) : 'text');
}

function countBy(values) {
  const out = {};
  for (const value of values) {
    out[value] = (out[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

function limitSet(set, max) {
  return [...set].filter(Boolean).slice(0, max);
}

function normalizeRel(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const absolute = path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
  return toRelative(absolute);
}

function toRelative(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/gu, '/');
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
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
  }
}
