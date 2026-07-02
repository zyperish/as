import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const codexRoot = path.dirname(hooksDir);
const projectRoot = path.dirname(codexRoot);

async function withTempRoot(fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'server-preflight-hook-'));
  try {
    const tempCodex = path.join(root, '.codex');
    await fsp.mkdir(path.join(tempCodex, 'hooks'), { recursive: true });
    await fsp.copyFile(path.join(hooksDir, 'pre_tool_use.py'), path.join(tempCodex, 'hooks', 'pre_tool_use.py'));
    await fsp.copyFile(path.join(hooksDir, 'codex_hook_adapter.py'), path.join(tempCodex, 'hooks', 'codex_hook_adapter.py'));
    await fsp.copyFile(path.join(hooksDir, 'run-python-hook.ps1'), path.join(tempCodex, 'hooks', 'run-python-hook.ps1'));
    await fsp.copyFile(path.join(codexRoot, 'server-tool-policy.json'), path.join(tempCodex, 'server-tool-policy.json'));
    await fn(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

function runHook(root, payload) {
  return spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, '.codex', 'hooks', 'run-python-hook.ps1'),
    '-Hook',
    'pre_tool_use.py',
  ], {
    cwd: root,
    input: Buffer.from(JSON.stringify(payload), 'utf8'),
    encoding: 'utf8',
  });
}

function runHookByName(root, hook, payload) {
  return spawnSync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    path.join(root, '.codex', 'hooks', 'run-python-hook.ps1'),
    '-Hook',
    hook,
  ], {
    cwd: root,
    input: Buffer.from(JSON.stringify(payload), 'utf8'),
    encoding: 'utf8',
  });
}

test('blocks remote server command without exact preflight approval', async () => {
  await withTempRoot(async (root) => {
    const command = 'ssh root@example.com "systemctl restart nginx"';
    const result = runHook(root, {
      cwd: root,
      tool_input: { command },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.match(output.reason, /服务器\/基础设施高危命令已被拦截/u);
    assert.match(output.reason, /Invoke-ServerPreflight\.ps1/u);
  });
});

test('allows exact approved command once and marks approval used', async () => {
  await withTempRoot(async (root) => {
    const command = 'ssh root@example.com "systemctl restart nginx"';
    const preflight = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(projectRoot, 'scripts', 'Invoke-ServerPreflight.ps1'),
      '-ProjectRoot',
      root,
      '-Command',
      command,
      '-Target',
      'example.com nginx service',
      '-ExpectedEffect',
      'restart nginx after verified config change',
      '-BlastRadius',
      'public web traffic on example.com may be briefly affected',
      '-FailureModes',
      'nginx config error, service restart failure, website unavailable',
      '-Rollback',
      'restore previous config and run systemctl restart nginx again',
      '-HealthChecks',
      'systemctl status nginx and curl public website',
      '-ApprovedByUser',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);

    const first = runHook(root, {
      cwd: root,
      tool_input: { command },
    });
    assert.equal(first.status, 0, first.stderr);
    const firstOutput = JSON.parse(first.stdout);
    assert.notEqual(firstOutput.decision, 'block');
    assert.match(firstOutput.systemMessage, /已通过精确预演审批/u);

    const second = runHook(root, {
      cwd: root,
      tool_input: { command },
    });
    assert.equal(second.status, 0, second.stderr);
    const secondOutput = JSON.parse(second.stdout);
    assert.equal(secondOutput.decision, 'block');
  });
});

test('blocks absolute deny command even with exact approval', async () => {
  await withTempRoot(async (root) => {
    const command = 'ssh root@example.com "rm -rf /"';
    const preflight = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(projectRoot, 'scripts', 'Invoke-ServerPreflight.ps1'),
      '-ProjectRoot',
      root,
      '-Command',
      command,
      '-Target',
      'example.com root filesystem',
      '-ExpectedEffect',
      'attempt to remove the root filesystem',
      '-BlastRadius',
      'complete server loss',
      '-FailureModes',
      'irreversible data loss and SSH lockout',
      '-Rollback',
      'restore from provider snapshot',
      '-HealthChecks',
      'server remains reachable and filesystem intact',
      '-ApprovedByUser',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(preflight.status, 0, preflight.stderr || preflight.stdout);

    const result = runHook(root, {
      cwd: root,
      tool_input: { command },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.match(output.reason, /绝对禁止规则/u);
    assert.match(output.reason, /delete-root/u);
  });
});

test('does not block ordinary local command', async () => {
  await withTempRoot(async (root) => {
    const result = runHook(root, {
      cwd: root,
      tool_input: { command: 'node --check .codex/tools/am-local-store.mjs' },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '');
  });
});

test('blocks Windows recursive force delete command', async () => {
  await withTempRoot(async (root) => {
    for (const command of [
      'Remove-Item -LiteralPath .\\important -Recurse -Force',
      'Remove-Item -Force -LiteralPath .\\important -Recurse',
      'rd /q /s .\\important',
      'rmdir /s /q .\\important',
    ]) {
      const result = runHook(root, {
        cwd: root,
        tool_input: { command },
      });

      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.decision, 'block', command);
      assert.match(output.reason, /windows-recursive-delete/u);
    }
  });
});

test('blocks destructive git reset command', async () => {
  await withTempRoot(async (root) => {
    for (const command of [
      'git reset --hard HEAD',
      'git clean -fdx',
    ]) {
      const result = runHook(root, {
        cwd: root,
        tool_input: { command },
      });

      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.equal(output.decision, 'block', command);
      assert.match(output.reason, /git-destructive-reset/u);
    }
  });
});

test('allows git clean dry-run command', async () => {
  await withTempRoot(async (root) => {
    for (const command of [
      'git clean -nfd',
      'git clean --dry-run -fdx',
    ]) {
      const result = runHook(root, {
        cwd: root,
        tool_input: { command },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), '', command);
    }
  });
});

test('redacts bearer tokens from audit previews and block messages', async () => {
  await withTempRoot(async (root) => {
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const command = `curl -H "Authorization: Bearer ${token}" https://example.com && ssh root@example.com "systemctl restart nginx"`;
    const result = runHook(root, {
      cwd: root,
      tool_input: { command },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.doesNotMatch(output.reason, new RegExp(token, 'u'));
    assert.match(output.reason, /Bearer \*\*\*/u);

    const auditDir = path.join(root, '.codex', 'server-preflight', 'audit');
    const files = await fsp.readdir(auditDir);
    const content = await fsp.readFile(path.join(auditDir, files[0]), 'utf8');
    assert.doesNotMatch(content, new RegExp(token, 'u'));
  });
});

test('redacts secrets without hiding ordinary key assignments', async () => {
  await withTempRoot(async (root) => {
    const apiKey = 'test-key-abcdefghijklmnopqrstuvwxyz';
    const cliToken = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const command = `echo key=value && curl --api-key ${apiKey} --token=${cliToken} https://user:pass@example.com && ssh root@example.com "systemctl restart nginx"`;
    const result = runHook(root, {
      cwd: root,
      tool_input: { command },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.match(output.reason, /key=value/u);
    assert.doesNotMatch(output.reason, new RegExp(apiKey, 'u'));
    assert.doesNotMatch(output.reason, new RegExp(cliToken, 'u'));
    assert.doesNotMatch(output.reason, /user:pass@example/u);
    assert.match(output.reason, /user:\*\*\*@example/u);
  });
});

test('pre-tool runner fails closed when requested hook file is missing', async () => {
  await withTempRoot(async (root) => {
    await fsp.rm(path.join(root, '.codex', 'hooks', 'pre_tool_use.py'));
    const result = runHookByName(root, 'pre_tool_use.py', {
      cwd: root,
      tool_input: { command: 'ssh root@example.com "systemctl restart nginx"' },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.match(output.reason, /Hook runner failed closed/u);
  });
});

test('non-pre-tool runner failures stay fail-open', async () => {
  await withTempRoot(async (root) => {
    const result = runHookByName(root, 'session_start.py.missing', {
      cwd: root,
      tool_input: { command: 'ssh root@example.com "systemctl restart nginx"' },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), '');
  });
});

test('pre-tool runner fails closed when python hook exits non-zero', async () => {
  await withTempRoot(async (root) => {
    await fsp.writeFile(path.join(root, '.codex', 'hooks', 'pre_tool_use.py'), 'raise RuntimeError("boom")\n', 'utf8');
    const result = runHook(root, {
      cwd: root,
      tool_input: { command: 'node --version' },
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.decision, 'block');
    assert.match(output.reason, /Hook runner failed closed|Hook failed closed/u);
  });
});

test('writes audit record when high-risk command is blocked', async () => {
  await withTempRoot(async (root) => {
    const command = 'ssh root@example.com "systemctl restart nginx"';
    const result = runHook(root, {
      cwd: root,
      tool_input: { command },
    });
    assert.equal(result.status, 0, result.stderr);

    const auditDir = path.join(root, '.codex', 'server-preflight', 'audit');
    const files = await fsp.readdir(auditDir);
    assert.equal(files.length, 1);
    const content = await fsp.readFile(path.join(auditDir, files[0]), 'utf8');
    const audit = JSON.parse(content.trim());
    assert.equal(audit.decision, 'block');
    assert.equal(audit.approvalRequired, true);
    assert.match(audit.commandPreview, /systemctl restart nginx/u);
  });
});
