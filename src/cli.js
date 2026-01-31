#!/usr/bin/env node

/**
 * routine-cli - Deterministic routine timer CLI
 * Per MVP_SPEC.md
 */

import { homedir } from 'os';
import { join } from 'path';
import { getDb, closeDb } from './db.js';
import { routineAdd, routineList, routineShow } from './commands/routine.js';
import { sessionStart, sessionActive, sessionStatus, sessionPause, sessionResume, sessionStop } from './commands/session.js';
import { todaySummary } from './commands/today.js';
import { sessionLog, sessionAmend, sessionRm, routineStreak, routineSkip, routineUnskip } from './commands/stubs.js';
import {
  CLIError,
  errorResult,
  successResult,
  getExitCode,
  EXIT_SUCCESS,
  EXIT_USER_INPUT_ERROR,
  ERR_INVALID_ARGS
} from './errors.js';

const VERSION = '0.1.0';
const DEFAULT_DB_PATH = join(homedir(), '.routine', 'routine.sqlite3');

const HELP = `routine-cli v${VERSION} - Deterministic routine timer CLI

USAGE:
  routine <command> [options]

COMMANDS:
  Routine Management:
    add        Create a new routine (requires --name, --rule, --ts)
    list       List all routines
    show       Show routine details (requires --routine)

  Timer/Session:
    start      Start a new session (requires --routine, --ts)
    active     List active sessions
    status     Get session status
    pause      Pause a session (requires --session, --ts)
    resume     Resume a paused session (requires --session, --ts)
    stop       Stop a session (requires --session, --ts)

  Daily Summary:
    today      Show today's summary

  Not Implemented (MVP):
    log        Backfill a session
    amend      Modify a session
    rm         Delete a session
    streak     Show streak
    skip       Skip a date
    unskip     Remove skip

GLOBAL OPTIONS:
  --format <human|json>   Output format (default: human)
  --db <path>             Database path (default: ~/.routine/routine.sqlite3)
  --tz <IANA_TZ>          Timezone for date interpretation
  --no-interactive        Disable interactive prompts
  --quiet                 Minimal output

EXAMPLES:
  routine add --name "Deep Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00
  routine start --routine "Deep Work" --ts 2026-01-31T09:00:00+09:00 --format json
  routine active --format json
  routine pause --session ses_01H... --ts 2026-01-31T09:15:00+09:00
  routine stop --session ses_01H... --ts 2026-01-31T10:00:00+09:00

EXIT CODES:
  0 - Success
  1 - Generic failure
  2 - User input error
  3 - Not found
  4 - Ambiguity/conflict
  5 - Not implemented
`;

/**
 * Parse command line arguments
 */
function parseArgs(argv) {
  const args = {
    command: null,
    format: 'human',
    db: DEFAULT_DB_PATH,
    tz: null,
    noInteractive: false,
    quiet: false,
    // Command-specific
    name: null,
    rule: null,
    ts: null,
    routine: null,
    session: null,
    note: null,
    tag: [],
    date: null,
    asOf: null,
    start: null,
    end: null,
    reason: null,
    explain: false,
    granularity: 'day'
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      console.log(HELP);
      process.exit(0);
    }

    if (arg === '-v' || arg === '--version') {
      console.log(`routine-cli v${VERSION}`);
      process.exit(0);
    }

    if (arg === '--format') {
      args.format = argv[++i];
    } else if (arg === '--db') {
      args.db = argv[++i];
    } else if (arg === '--tz') {
      args.tz = argv[++i];
    } else if (arg === '--no-interactive') {
      args.noInteractive = true;
    } else if (arg === '--quiet') {
      args.quiet = true;
    } else if (arg === '--name') {
      args.name = argv[++i];
    } else if (arg === '--rule') {
      args.rule = argv[++i];
    } else if (arg === '--ts') {
      args.ts = argv[++i];
    } else if (arg === '--routine') {
      args.routine = argv[++i];
    } else if (arg === '--session') {
      args.session = argv[++i];
    } else if (arg === '--note') {
      args.note = argv[++i];
    } else if (arg === '--tag') {
      args.tag.push(argv[++i]);
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--as-of') {
      args.asOf = argv[++i];
    } else if (arg === '--start') {
      args.start = argv[++i];
    } else if (arg === '--end') {
      args.end = argv[++i];
    } else if (arg === '--reason') {
      args.reason = argv[++i];
    } else if (arg === '--explain') {
      args.explain = true;
    } else if (arg === '--granularity') {
      args.granularity = argv[++i];
    } else if (!arg.startsWith('-') && !args.command) {
      args.command = arg;
    }

    i++;
  }

  return args;
}

/**
 * Output result in specified format
 */
function output(result, format, command, meta = {}) {
  if (format === 'json') {
    const envelope = result.ok === false ? result : successResult(command, result, [], meta);
    console.log(JSON.stringify(envelope, null, 2));
  } else {
    // Human-readable output
    if (result.ok === false) {
      console.error(`Error: ${result.error.message}`);
      if (result.error.details) {
        console.error(`Details: ${JSON.stringify(result.error.details, null, 2)}`);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }
}

/**
 * Route command to handler
 */
function executeCommand(db, args) {
  switch (args.command) {
    // Routine management
    case 'add':
      return routineAdd(db, args);
    case 'list':
      return routineList(db, args);
    case 'show':
      return routineShow(db, args);

    // Session/Timer
    case 'start':
      return sessionStart(db, args);
    case 'active':
      return sessionActive(db, args);
    case 'status':
      return sessionStatus(db, args);
    case 'pause':
      return sessionPause(db, args);
    case 'resume':
      return sessionResume(db, args);
    case 'stop':
      return sessionStop(db, args);

    // Daily summary
    case 'today':
      return todaySummary(db, args);

    // Stubs
    case 'log':
      return sessionLog(db, args);
    case 'amend':
      return sessionAmend(db, args);
    case 'rm':
      return sessionRm(db, args);
    case 'streak':
      return routineStreak(db, args);
    case 'skip':
      return routineSkip(db, args);
    case 'unskip':
      return routineUnskip(db, args);

    default:
      throw new CLIError(ERR_INVALID_ARGS, `unknown command: ${args.command}`);
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.command) {
    console.log(HELP);
    process.exit(0);
  }

  let db;
  try {
    db = await getDb(args.db);
    const result = executeCommand(db, args);
    output(result, args.format, args.command, { db: args.db, tz: args.tz });
    process.exit(EXIT_SUCCESS);
  } catch (err) {
    if (err instanceof CLIError) {
      const result = errorResult(err.code, err.message, err.details);
      if (args.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error(`Error [${err.code}]: ${err.message}`);
        if (err.details && Object.keys(err.details).length > 0) {
          console.error(`Details: ${JSON.stringify(err.details, null, 2)}`);
        }
      }
      process.exit(err.exitCode || getExitCode(err.code));
    } else {
      // Unexpected error
      console.error(`Fatal error: ${err.message}`);
      if (args.format === 'json') {
        console.log(JSON.stringify(errorResult('ERR_INTERNAL', err.message), null, 2));
      }
      process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main();
