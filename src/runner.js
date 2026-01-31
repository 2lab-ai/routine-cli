import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Logger for routine execution
 */
class Logger {
  log(level, message) {
    const ts = new Date().toISOString();
    const prefix = { info: '●', step: '▶', ok: '✓', fail: '✗', summary: '═' }[level] || '•';
    console.log(`${ts} ${prefix} ${message}`);
  }
  
  info(msg) { this.log('info', msg); }
  step(msg) { this.log('step', msg); }
  ok(msg) { this.log('ok', msg); }
  fail(msg) { this.log('fail', msg); }
  summary(msg) { this.log('summary', msg); }
}

const logger = new Logger();

/**
 * Execute a shell command
 * @returns {Promise<{ success: boolean, output?: string, error?: string, exitCode: number }>}
 */
async function execStep(step) {
  return new Promise((resolve) => {
    const opts = {
      shell: true,
      cwd: step.workdir || process.cwd(),
    };
    
    const proc = spawn(step.command, [], opts);
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (d) => { stdout += d; process.stdout.write(d); });
    proc.stderr?.on('data', (d) => { stderr += d; process.stderr.write(d); });
    
    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ success: false, error: 'Timeout', exitCode: -1 });
    }, step.timeout || 30000);
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        success: code === 0,
        output: stdout,
        error: stderr,
        exitCode: code ?? -1,
      });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err.message, exitCode: -1 });
    });
  });
}

/**
 * Sleep for duration
 * @returns {Promise<{ success: boolean }>}
 */
async function sleepStep(step) {
  await new Promise(r => setTimeout(r, step.duration));
  return { success: true };
}

/**
 * HTTP request step (optional)
 * @returns {Promise<{ success: boolean, statusCode?: number, body?: string, error?: string }>}
 */
async function httpStep(step) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), step.timeout || 30000);
    
    const res = await fetch(step.url, {
      method: step.method || 'GET',
      headers: step.headers,
      body: step.body ? JSON.stringify(step.body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const body = await res.text();
    
    return {
      success: res.ok,
      statusCode: res.status,
      body,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Run a single step
 */
async function runStep(step) {
  switch (step.type) {
    case 'exec': return execStep(step);
    case 'sleep': return sleepStep(step);
    case 'http': return httpStep(step);
    default:
      return { success: false, error: `Unknown step type: ${step.type}` };
  }
}

/**
 * Run a routine
 * @param {object} routine - Validated routine object
 * @param {string} routineFile - Original file path (for history)
 * @returns {Promise<{ success: boolean, results: object[] }>}
 */
export async function runRoutine(routine, routineFile) {
  const startedAt = new Date();
  const results = [];
  let allPassed = true;
  
  logger.info(`Starting routine: ${routine.name}`);
  if (routine.description) {
    logger.info(`Description: ${routine.description}`);
  }
  logger.info(`Steps: ${routine.steps.length}`);
  console.log('');
  
  for (let i = 0; i < routine.steps.length; i++) {
    const step = routine.steps[i];
    const stepNum = `[${i + 1}/${routine.steps.length}]`;
    
    logger.step(`${stepNum} ${step.name} (${step.type})`);
    const stepStart = Date.now();
    
    const result = await runStep(step);
    const duration = Date.now() - stepStart;
    
    results.push({
      name: step.name,
      type: step.type,
      duration,
      ...result,
    });
    
    if (result.success) {
      logger.ok(`${stepNum} ${step.name} completed (${duration}ms)`);
    } else {
      logger.fail(`${stepNum} ${step.name} FAILED (${duration}ms)`);
      if (result.error) {
        console.error(`    Error: ${result.error}`);
      }
      allPassed = false;
    }
    console.log('');
  }
  
  const completedAt = new Date();
  const totalDuration = completedAt - startedAt;
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  // Summary
  console.log('═'.repeat(50));
  logger.summary(`Routine: ${routine.name}`);
  logger.summary(`Status: ${allPassed ? 'PASSED' : 'FAILED'}`);
  logger.summary(`Steps: ${passed} passed, ${failed} failed, ${routine.steps.length} total`);
  logger.summary(`Duration: ${totalDuration}ms`);
  console.log('═'.repeat(50));
  
  // Save history
  saveHistory({
    routine: routineFile,
    name: routine.name,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    duration: totalDuration,
    status: allPassed ? 'passed' : 'failed',
    steps: results,
  });
  
  return { success: allPassed, results };
}

/**
 * Save run history to .history folder
 */
function saveHistory(record) {
  try {
    const historyDir = join(process.cwd(), '.history');
    if (!existsSync(historyDir)) {
      mkdirSync(historyDir, { recursive: true });
    }
    
    const filename = `${record.startedAt.replace(/[:.]/g, '-')}.json`;
    const filepath = join(historyDir, filename);
    writeFileSync(filepath, JSON.stringify(record, null, 2));
  } catch (err) {
    // Non-critical, just log
    console.error(`Warning: Could not save history: ${err.message}`);
  }
}
