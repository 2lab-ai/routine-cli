/**
 * Routine management commands: add, list, show
 */

import { generateRoutineId } from '../id.js';
import { parseRFC3339 } from '../time.js';
import {
  CLIError,
  ERR_INVALID_ARGS,
  ERR_TS_REQUIRED,
  ERR_INVALID_TIME_FORMAT,
  ERR_ROUTINE_NOT_FOUND,
  ERR_AMBIGUOUS_ROUTINE,
  EXIT_NOT_FOUND,
  EXIT_AMBIGUITY
} from '../errors.js';

/**
 * Get system timezone
 */
function getSystemTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * routine add command
 */
export function routineAdd(db, args) {
  // Validate required args
  if (!args.name) {
    throw new CLIError(ERR_INVALID_ARGS, '--name is required');
  }
  if (!args.rule) {
    throw new CLIError(ERR_INVALID_ARGS, '--rule is required');
  }
  if (!args.ts) {
    throw new CLIError(ERR_TS_REQUIRED, '--ts is required for state-changing commands');
  }

  // Validate timestamp
  const tsResult = parseRFC3339(args.ts);
  if (!tsResult.valid) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --ts: ${tsResult.error}`);
  }

  const id = generateRoutineId();
  const tz = args.tz || getSystemTz();
  const createdAt = args.ts;

  const stmt = db.prepare(`
    INSERT INTO routines (id, name, tz, rule, created_at, archived_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `);
  stmt.run(id, args.name, tz, args.rule, createdAt);

  return {
    routine: {
      id,
      name: args.name,
      tz,
      rule: args.rule,
      createdAt,
      archivedAt: null
    }
  };
}

/**
 * routine list command
 */
export function routineList(db, args) {
  const stmt = db.prepare(`
    SELECT id, name, tz, rule, created_at as createdAt, archived_at as archivedAt
    FROM routines
    ORDER BY (archived_at IS NOT NULL), name ASC, id ASC
  `);
  const rows = stmt.all();

  return {
    routines: rows.map(r => ({
      id: r.id,
      name: r.name,
      tz: r.tz,
      rule: r.rule,
      createdAt: r.createdAt,
      archivedAt: r.archivedAt
    }))
  };
}

/**
 * Find routine by ID or name
 * @returns {{ routine: object } | { error: CLIError }}
 */
export function findRoutine(db, identifier) {
  // Try by ID first
  if (identifier.startsWith('rtn_')) {
    const stmt = db.prepare(`
      SELECT id, name, tz, rule, created_at as createdAt, archived_at as archivedAt
      FROM routines WHERE id = ?
    `);
    const row = stmt.get(identifier);
    if (row) {
      return { routine: row };
    }
    throw new CLIError(ERR_ROUTINE_NOT_FOUND, `routine not found: ${identifier}`, { id: identifier }, EXIT_NOT_FOUND);
  }

  // Try by name
  const stmt = db.prepare(`
    SELECT id, name, tz, rule, created_at as createdAt, archived_at as archivedAt
    FROM routines WHERE name = ?
  `);
  const rows = stmt.all(identifier);

  if (rows.length === 0) {
    throw new CLIError(ERR_ROUTINE_NOT_FOUND, `routine not found: ${identifier}`, { name: identifier }, EXIT_NOT_FOUND);
  }

  if (rows.length > 1) {
    throw new CLIError(
      ERR_AMBIGUOUS_ROUTINE,
      'multiple routines match name',
      {
        name: identifier,
        candidates: rows.map(r => ({ id: r.id, name: r.name, tz: r.tz }))
      },
      EXIT_AMBIGUITY
    );
  }

  return { routine: rows[0] };
}

/**
 * routine show command
 */
export function routineShow(db, args) {
  if (!args.routine) {
    throw new CLIError(ERR_INVALID_ARGS, '--routine is required');
  }

  const { routine } = findRoutine(db, args.routine);

  return { routine };
}
