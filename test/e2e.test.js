/**
 * E2E/Integration tests for routine-cli
 * Tests: start->active->stop and multi-active sessions
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'src', 'cli.js');

function run(args, dbPath) {
  const cmd = `node ${CLI} ${args} --db "${dbPath}" --format json`;
  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { success: true, output: JSON.parse(output) };
  } catch (err) {
    try {
      return { success: false, output: JSON.parse(err.stdout || '{}'), stderr: err.stderr, code: err.status };
    } catch {
      return { success: false, stderr: err.stderr || err.message, code: err.status };
    }
  }
}

describe('routine-cli E2E tests', () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'routine-cli-test-'));
    dbPath = join(tmpDir, 'test.sqlite3');
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Basic routine CRUD', () => {
    test('add routine', () => {
      const result = run('add --name "Deep Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output.ok, true);
      assert.ok(result.output.data.routine.id.startsWith('rtn_'));
      assert.strictEqual(result.output.data.routine.name, 'Deep Work');
      assert.strictEqual(result.output.data.routine.rule, 'daily>=30m');
    });

    test('list routines', () => {
      run('add --name "Routine A" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      run('add --name "Routine B" --rule "daily>=10m" --ts 2026-01-31T09:01:00+09:00', dbPath);
      
      const result = run('list', dbPath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output.ok, true);
      assert.strictEqual(result.output.data.routines.length, 2);
    });

    test('show routine by name', () => {
      run('add --name "My Routine" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      const result = run('show --routine "My Routine"', dbPath);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output.ok, true);
      assert.strictEqual(result.output.data.routine.name, 'My Routine');
    });

    test('add routine without --ts fails', () => {
      const result = run('add --name "Test" --rule "daily>=5m"', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_TS_REQUIRED');
    });
  });

  describe('Session lifecycle: start->active->stop', () => {
    test('start->active->stop flow', () => {
      // Add routine
      run('add --name "Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      // Start session
      const startResult = run('start --routine "Work" --ts 2026-01-31T09:00:00+09:00', dbPath);
      assert.strictEqual(startResult.success, true);
      assert.strictEqual(startResult.output.ok, true);
      const sessionId = startResult.output.data.session.id;
      assert.ok(sessionId.startsWith('ses_'));
      assert.strictEqual(startResult.output.data.session.status, 'running');
      
      // Check active sessions
      const activeResult = run('active --as-of 2026-01-31T09:15:00+09:00', dbPath);
      assert.strictEqual(activeResult.success, true);
      assert.strictEqual(activeResult.output.ok, true);
      assert.strictEqual(activeResult.output.data.sessions.length, 1);
      assert.strictEqual(activeResult.output.data.sessions[0].id, sessionId);
      assert.strictEqual(activeResult.output.data.sessions[0].status, 'running');
      
      // Stop session
      const stopResult = run(`stop --session "${sessionId}" --ts 2026-01-31T09:30:00+09:00`, dbPath);
      assert.strictEqual(stopResult.success, true);
      assert.strictEqual(stopResult.output.ok, true);
      assert.strictEqual(stopResult.output.data.session.status, 'stopped');
      assert.strictEqual(stopResult.output.data.session.computed.activeSeconds, 1800); // 30 minutes
      
      // No active sessions after stop
      const activeAfter = run('active', dbPath);
      assert.strictEqual(activeAfter.output.data.sessions.length, 0);
    });

    test('start->pause->resume->stop flow', () => {
      run('add --name "Focus" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      // Start
      const startResult = run('start --routine "Focus" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const sessionId = startResult.output.data.session.id;
      
      // Pause at 09:10
      const pauseResult = run(`pause --session "${sessionId}" --ts 2026-01-31T09:10:00+09:00`, dbPath);
      assert.strictEqual(pauseResult.success, true);
      assert.strictEqual(pauseResult.output.data.session.status, 'paused');
      
      // Resume at 09:15
      const resumeResult = run(`resume --session "${sessionId}" --ts 2026-01-31T09:15:00+09:00`, dbPath);
      assert.strictEqual(resumeResult.success, true);
      assert.strictEqual(resumeResult.output.data.session.status, 'running');
      
      // Stop at 09:30
      const stopResult = run(`stop --session "${sessionId}" --ts 2026-01-31T09:30:00+09:00`, dbPath);
      assert.strictEqual(stopResult.success, true);
      
      // Total duration: 30 min, paused: 5 min, active: 25 min
      assert.strictEqual(stopResult.output.data.session.computed.durationSeconds, 1800);
      assert.strictEqual(stopResult.output.data.session.computed.pausedSeconds, 300);
      assert.strictEqual(stopResult.output.data.session.computed.activeSeconds, 1500);
    });

    test('session stop requires --session', () => {
      run('add --name "Test" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      run('start --routine "Test" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      const result = run('stop --ts 2026-01-31T09:30:00+09:00', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_SESSION_REQUIRED');
      assert.ok(result.output.error.details.activeSessions.length > 0);
    });
  });

  describe('Multi-active sessions', () => {
    test('multiple active sessions allowed', () => {
      // Add two routines
      run('add --name "Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      run('add --name "Exercise" --rule "daily>=20m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      // Start both
      const work = run('start --routine "Work" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const exercise = run('start --routine "Exercise" --ts 2026-01-31T09:05:00+09:00', dbPath);
      
      assert.strictEqual(work.success, true);
      assert.strictEqual(exercise.success, true);
      
      // Both should be active
      const active = run('active --as-of 2026-01-31T09:10:00+09:00', dbPath);
      assert.strictEqual(active.output.data.sessions.length, 2);
      
      // Sessions are sorted by start time
      assert.strictEqual(active.output.data.sessions[0].routineName, 'Work');
      assert.strictEqual(active.output.data.sessions[1].routineName, 'Exercise');
    });

    test('same routine can have multiple active sessions', () => {
      run('add --name "Deep Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      // Start two sessions for same routine
      const s1 = run('start --routine "Deep Work" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const s2 = run('start --routine "Deep Work" --ts 2026-01-31T09:30:00+09:00', dbPath);
      
      assert.strictEqual(s1.success, true);
      assert.strictEqual(s2.success, true);
      assert.notStrictEqual(s1.output.data.session.id, s2.output.data.session.id);
      
      // Both active
      const active = run('active', dbPath);
      assert.strictEqual(active.output.data.sessions.length, 2);
    });

    test('pause/stop specific session in multi-active', () => {
      run('add --name "Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      run('add --name "Exercise" --rule "daily>=20m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      const work = run('start --routine "Work" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const exercise = run('start --routine "Exercise" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      const workId = work.output.data.session.id;
      const exerciseId = exercise.output.data.session.id;
      
      // Pause only work
      run(`pause --session "${workId}" --ts 2026-01-31T09:10:00+09:00`, dbPath);
      
      // Check statuses
      const status = run('active --as-of 2026-01-31T09:15:00+09:00', dbPath);
      const workSession = status.output.data.sessions.find(s => s.id === workId);
      const exerciseSession = status.output.data.sessions.find(s => s.id === exerciseId);
      
      assert.strictEqual(workSession.status, 'paused');
      assert.strictEqual(exerciseSession.status, 'running');
      
      // Stop only exercise
      run(`stop --session "${exerciseId}" --ts 2026-01-31T09:20:00+09:00`, dbPath);
      
      // Only work should be active
      const activeAfter = run('active', dbPath);
      assert.strictEqual(activeAfter.output.data.sessions.length, 1);
      assert.strictEqual(activeAfter.output.data.sessions[0].id, workId);
    });
  });

  describe('Error handling', () => {
    test('invalid RFC3339 timestamp', () => {
      run('add --name "Test" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      // Missing timezone
      const result = run('start --routine "Test" --ts 2026-01-31T09:00:00', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_INVALID_TIME_FORMAT');
    });

    test('routine not found', () => {
      const result = run('start --routine "NonExistent" --ts 2026-01-31T09:00:00+09:00', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_ROUTINE_NOT_FOUND');
    });

    test('session not found', () => {
      const result = run('stop --session "ses_invalid" --ts 2026-01-31T09:00:00+09:00', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_SESSION_NOT_FOUND');
    });

    test('cannot pause already paused session', () => {
      run('add --name "Test" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const start = run('start --routine "Test" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const sessionId = start.output.data.session.id;
      
      run(`pause --session "${sessionId}" --ts 2026-01-31T09:05:00+09:00`, dbPath);
      const result = run(`pause --session "${sessionId}" --ts 2026-01-31T09:06:00+09:00`, dbPath);
      
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_INVALID_STATE');
    });

    test('cannot resume running session', () => {
      run('add --name "Test" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const start = run('start --routine "Test" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const sessionId = start.output.data.session.id;
      
      const result = run(`resume --session "${sessionId}" --ts 2026-01-31T09:05:00+09:00`, dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_INVALID_STATE');
    });

    test('cannot stop before start', () => {
      run('add --name "Test" --rule "daily>=5m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const start = run('start --routine "Test" --ts 2026-01-31T09:30:00+09:00', dbPath);
      const sessionId = start.output.data.session.id;
      
      const result = run(`stop --session "${sessionId}" --ts 2026-01-31T09:00:00+09:00`, dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_END_BEFORE_START');
    });

    test('stub commands return ERR_NOT_IMPLEMENTED', () => {
      const result = run('streak --routine "Test" --as-of 2026-01-31', dbPath);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.output.error.code, 'ERR_NOT_IMPLEMENTED');
    });
  });

  describe('Today summary', () => {
    test('today returns summary with sessions', () => {
      run('add --name "Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00', dbPath);
      
      const start = run('start --routine "Work" --ts 2026-01-31T09:00:00+09:00', dbPath);
      const sessionId = start.output.data.session.id;
      run(`stop --session "${sessionId}" --ts 2026-01-31T09:30:00+09:00`, dbPath);
      
      const today = run('today --date 2026-01-31', dbPath);
      assert.strictEqual(today.success, true);
      assert.strictEqual(today.output.data.date, '2026-01-31');
      assert.strictEqual(today.output.data.sessions.length, 1);
      assert.strictEqual(today.output.data.totals.sessionsCount, 1);
      assert.strictEqual(today.output.data.totals.activeSeconds, 1800);
    });
  });
});
