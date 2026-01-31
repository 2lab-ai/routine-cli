import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const repoRoot = path.resolve(process.cwd());
const cli = path.join(repoRoot, 'src', 'cli.js');

function runCli(args, { cwd } = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

test('integration: validate + run examples with correct exit codes', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'clawd-ogm-test-'));

  try {
    // validate valid example -> 0
    {
      const ex = path.join(repoRoot, 'examples', 'ci-smoke.yaml');
      const res = runCli(['validate', ex], { cwd: tmp });
      assert.equal(res.status, 0);
    }

    // run valid example -> 0
    {
      const ex = path.join(repoRoot, 'examples', 'ci-smoke.yaml');
      const res = runCli(['run', ex], { cwd: tmp });
      assert.equal(res.status, 0);
    }

    // validate invalid example -> 2
    {
      const ex = path.join(repoRoot, 'examples', 'invalid.yaml');
      const res = runCli(['validate', ex], { cwd: tmp });
      assert.equal(res.status, 2);
    }

    // run failing routine -> 1
    {
      const ex = path.join(repoRoot, 'examples', 'failing.yaml');
      const res = runCli(['run', ex], { cwd: tmp });
      assert.equal(res.status, 1);
    }

    // runner should have created a history file in tmp/.history
    {
      const historyDir = path.join(tmp, '.history');
      // Existence is enough; content is timestamped so don't snapshot.
      assert.equal(existsSync(historyDir), true);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
