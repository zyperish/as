#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const wrapperArgs = separator >= 0 ? args.slice(0, separator) : [];
const childArgs = separator >= 0 ? args.slice(separator + 1) : args;

let payloadFile = '';
for (let index = 0; index < wrapperArgs.length; index += 1) {
  if (wrapperArgs[index] === '--payload-file' && wrapperArgs[index + 1]) {
    payloadFile = wrapperArgs[index + 1];
    index += 1;
  }
}

if (childArgs.length === 0) {
  process.exit(0);
}

let input = Buffer.alloc(0);
if (payloadFile) {
  try {
    input = await fs.readFile(payloadFile);
  } catch {
    input = Buffer.alloc(0);
  }
}

const child = spawn(process.execPath, childArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.stdin.end(input);

child.on('error', () => process.exit(0));
child.on('exit', (code) => process.exit(code || 0));
