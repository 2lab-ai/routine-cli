/**
 * Session/Timer commands: start, active, status, pause, resume, stop
 */

import { generateSessionId, generateEventId, isSessionId } from '../id.js';
import { parseRFC3339, nowRFC3339, secondsBetween, isBefore, isAfter } from '../time.js';
import { findRoutine } from './routine.js';
import {
  CLIError,
  ERR_INVALID_ARGS,
  ERR_TS_REQUIRED,
  ERR_INVALID_TIME_FORMAT,
  ERR_SESSION_NOT_FOUND,
  ERR_SESSION_REQUIRED,
  ERR_SESSION_NOT_ACTIVE,
  ERR_INVALID_STATE,
  ERR_END_BEFORE_START,
  EXIT_NOT_FOUND
} from '../errors.js';

/**
 * Build Session object from DB row with computed fields
 */
function buildSession(db, row, asOf) {
  // Get routine info
  const routineStmt = db.prepare('SELECT name, tz FROM routines WHERE id = ?');
  const routine = routineStmt.get(row.routine_id);

  // Get pause events
  const eventsStmt = db.prepare(`
    SELECT type, ts FROM session_events 
    WHERE session_id = ? 
    ORDER BY ts ASC
  `);
  const events = eventsStmt.all(row.id);

  // Build pauses array
  const pauses = [];
  let currentPause = null;
  for (const evt of events) {
    if (evt.type === 'pause') {
      currentPause = { start: evt.ts, end: null };
    } else if (evt.type === 'resume' && currentPause) {
      currentPause.end = evt.ts;
      pauses.push(currentPause);
      currentPause = null;
    }
  }
  // If still paused, add the open pause
  if (currentPause) {
    pauses.push(currentPause);
  }

  // Determine status
  let status = 'running';
  if (row.end_ts) {
    status = 'stopped';
  } else if (currentPause && !currentPause.end) {
    status = 'paused';
  }

  // Get tags
  const tagsStmt = db.prepare('SELECT tag FROM session_tags WHERE session_id = ? ORDER BY tag ASC');
  const tags = tagsStmt.all(row.id).map(t => t.tag);

  // Compute durations
  const effectiveEnd = row.end_ts || asOf;
  const durationSeconds = secondsBetween(row.start_ts, effectiveEnd);
  
  // Calculate paused seconds
  let pausedSeconds = 0;
  for (const p of pauses) {
    const pauseEnd = p.end || effectiveEnd;
    // Clip to [start, asOf]
    const pStart = isAfter(p.start, row.start_ts) ? p.start : row.start_ts;
    const pEnd = isBefore(pauseEnd, effectiveEnd) ? pauseEnd : effectiveEnd;
    if (isAfter(pEnd, pStart)) {
      pausedSeconds += secondsBetween(pStart, pEnd);
    }
  }

  const activeSeconds = Math.max(0, durationSeconds - pausedSeconds);

  return {
    id: row.id,
    routineId: row.routine_id,
    routineName: routine?.name || '',
    start: row.start_ts,
    end: row.end_ts,
    status,
    pauses,
    computed: {
      asOf,
      durationSeconds,
      pausedSeconds,
      activeSeconds
    },
    note: row.note,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

/**
 * Get a session by ID
 */
function getSession(db, sessionId) {
  const stmt = db.prepare(`
    SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL
  `);
  return stmt.get(sessionId);
}

/**
 * routine start command
 */
export function sessionStart(db, args) {
  if (!args.routine) {
    throw new CLIError(ERR_INVALID_ARGS, '--routine is required');
  }
  if (!args.ts) {
    throw new CLIError(ERR_TS_REQUIRED, '--ts is required for state-changing commands');
  }

  const tsResult = parseRFC3339(args.ts);
  if (!tsResult.valid) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --ts: ${tsResult.error}`);
  }

  const { routine } = findRoutine(db, args.routine);

  const sessionId = generateSessionId();
  const now = args.ts;

  const stmt = db.prepare(`
    INSERT INTO sessions (id, routine_id, start_ts, end_ts, note, created_at, updated_at, deleted_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?, NULL)
  `);
  stmt.run(sessionId, routine.id, now, args.note || null, now, now);

  // Insert tags if provided
  if (args.tag && args.tag.length > 0) {
    const tagStmt = db.prepare('INSERT INTO session_tags (session_id, tag) VALUES (?, ?)');
    for (const tag of args.tag) {
      tagStmt.run(sessionId, tag);
    }
  }

  const row = getSession(db, sessionId);
  return { session: buildSession(db, row, now) };
}

/**
 * routine active command
 */
export function sessionActive(db, args) {
  const asOf = args.asOf || nowRFC3339();
  
  if (args.asOf) {
    const tsResult = parseRFC3339(args.asOf);
    if (!tsResult.valid) {
      throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --as-of: ${tsResult.error}`);
    }
  }

  const stmt = db.prepare(`
    SELECT * FROM sessions 
    WHERE end_ts IS NULL AND deleted_at IS NULL
    ORDER BY start_ts ASC, id ASC
  `);
  const rows = stmt.all();

  return {
    asOf,
    sessions: rows.map(row => buildSession(db, row, asOf))
  };
}

/**
 * routine status command
 */
export function sessionStatus(db, args) {
  const asOf = args.asOf || nowRFC3339();

  if (args.asOf) {
    const tsResult = parseRFC3339(args.asOf);
    if (!tsResult.valid) {
      throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --as-of: ${tsResult.error}`);
    }
  }

  // If specific session requested
  if (args.session) {
    const row = getSession(db, args.session);
    if (!row) {
      throw new CLIError(ERR_SESSION_NOT_FOUND, `session not found: ${args.session}`, { sessionId: args.session }, EXIT_NOT_FOUND);
    }
    return { session: buildSession(db, row, asOf) };
  }

  // If specific routine requested
  if (args.routine) {
    const { routine } = findRoutine(db, args.routine);
    const stmt = db.prepare(`
      SELECT * FROM sessions 
      WHERE routine_id = ? AND end_ts IS NULL AND deleted_at IS NULL
      ORDER BY start_ts ASC, id ASC
    `);
    const rows = stmt.all(routine.id);
    return {
      asOf,
      sessions: rows.map(row => buildSession(db, row, asOf))
    };
  }

  // Default: all active sessions
  return sessionActive(db, args);
}

/**
 * routine pause command
 */
export function sessionPause(db, args) {
  if (!args.session) {
    // Get active sessions for error details
    const activeStmt = db.prepare(`
      SELECT s.id, s.routine_id, r.name as routine_name, s.start_ts
      FROM sessions s
      JOIN routines r ON r.id = s.routine_id
      WHERE s.end_ts IS NULL AND s.deleted_at IS NULL
      ORDER BY s.start_ts ASC
    `);
    const activeSessions = activeStmt.all().map(s => ({
      id: s.id,
      routineId: s.routine_id,
      routineName: s.routine_name,
      start: s.start_ts
    }));

    throw new CLIError(ERR_SESSION_REQUIRED, '--session is required', { activeSessions });
  }
  if (!args.ts) {
    throw new CLIError(ERR_TS_REQUIRED, '--ts is required for state-changing commands');
  }

  const tsResult = parseRFC3339(args.ts);
  if (!tsResult.valid) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --ts: ${tsResult.error}`);
  }

  const row = getSession(db, args.session);
  if (!row) {
    throw new CLIError(ERR_SESSION_NOT_FOUND, `session not found: ${args.session}`, { sessionId: args.session }, EXIT_NOT_FOUND);
  }

  if (row.end_ts) {
    throw new CLIError(ERR_SESSION_NOT_ACTIVE, 'session is already stopped', { sessionId: args.session, endTs: row.end_ts });
  }

  // Check if already paused
  const lastEventStmt = db.prepare(`
    SELECT type FROM session_events 
    WHERE session_id = ? 
    ORDER BY ts DESC LIMIT 1
  `);
  const lastEvent = lastEventStmt.get(args.session);
  if (lastEvent && lastEvent.type === 'pause') {
    throw new CLIError(ERR_INVALID_STATE, 'cannot pause a paused session', { sessionId: args.session, status: 'paused' });
  }

  // Insert pause event
  const eventId = generateEventId();
  const eventStmt = db.prepare(`
    INSERT INTO session_events (id, session_id, type, ts, created_at)
    VALUES (?, ?, 'pause', ?, ?)
  `);
  eventStmt.run(eventId, args.session, args.ts, args.ts);

  // Update session updated_at
  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(args.ts, args.session);

  const updatedRow = getSession(db, args.session);
  return { session: buildSession(db, updatedRow, args.ts) };
}

/**
 * routine resume command
 */
export function sessionResume(db, args) {
  if (!args.session) {
    const activeStmt = db.prepare(`
      SELECT s.id, s.routine_id, r.name as routine_name, s.start_ts
      FROM sessions s
      JOIN routines r ON r.id = s.routine_id
      WHERE s.end_ts IS NULL AND s.deleted_at IS NULL
      ORDER BY s.start_ts ASC
    `);
    const activeSessions = activeStmt.all().map(s => ({
      id: s.id,
      routineId: s.routine_id,
      routineName: s.routine_name,
      start: s.start_ts
    }));

    throw new CLIError(ERR_SESSION_REQUIRED, '--session is required', { activeSessions });
  }
  if (!args.ts) {
    throw new CLIError(ERR_TS_REQUIRED, '--ts is required for state-changing commands');
  }

  const tsResult = parseRFC3339(args.ts);
  if (!tsResult.valid) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --ts: ${tsResult.error}`);
  }

  const row = getSession(db, args.session);
  if (!row) {
    throw new CLIError(ERR_SESSION_NOT_FOUND, `session not found: ${args.session}`, { sessionId: args.session }, EXIT_NOT_FOUND);
  }

  if (row.end_ts) {
    throw new CLIError(ERR_SESSION_NOT_ACTIVE, 'session is already stopped', { sessionId: args.session, endTs: row.end_ts });
  }

  // Check if running (not paused)
  const lastEventStmt = db.prepare(`
    SELECT type FROM session_events 
    WHERE session_id = ? 
    ORDER BY ts DESC LIMIT 1
  `);
  const lastEvent = lastEventStmt.get(args.session);
  if (!lastEvent || lastEvent.type !== 'pause') {
    throw new CLIError(ERR_INVALID_STATE, 'cannot resume a running session', { sessionId: args.session, status: 'running' });
  }

  // Insert resume event
  const eventId = generateEventId();
  const eventStmt = db.prepare(`
    INSERT INTO session_events (id, session_id, type, ts, created_at)
    VALUES (?, ?, 'resume', ?, ?)
  `);
  eventStmt.run(eventId, args.session, args.ts, args.ts);

  // Update session updated_at
  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(args.ts, args.session);

  const updatedRow = getSession(db, args.session);
  return { session: buildSession(db, updatedRow, args.ts) };
}

/**
 * routine stop command
 */
export function sessionStop(db, args) {
  if (!args.session) {
    const activeStmt = db.prepare(`
      SELECT s.id, s.routine_id, r.name as routine_name, s.start_ts
      FROM sessions s
      JOIN routines r ON r.id = s.routine_id
      WHERE s.end_ts IS NULL AND s.deleted_at IS NULL
      ORDER BY s.start_ts ASC
    `);
    const activeSessions = activeStmt.all().map(s => ({
      id: s.id,
      routineId: s.routine_id,
      routineName: s.routine_name,
      start: s.start_ts
    }));

    throw new CLIError(ERR_SESSION_REQUIRED, '--session is required', { activeSessions });
  }
  if (!args.ts) {
    throw new CLIError(ERR_TS_REQUIRED, '--ts is required for state-changing commands');
  }

  const tsResult = parseRFC3339(args.ts);
  if (!tsResult.valid) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, `invalid --ts: ${tsResult.error}`);
  }

  const row = getSession(db, args.session);
  if (!row) {
    throw new CLIError(ERR_SESSION_NOT_FOUND, `session not found: ${args.session}`, { sessionId: args.session }, EXIT_NOT_FOUND);
  }

  if (row.end_ts) {
    throw new CLIError(ERR_SESSION_NOT_ACTIVE, 'session is already stopped', { sessionId: args.session, endTs: row.end_ts });
  }

  // Validate end is after start
  if (isBefore(args.ts, row.start_ts)) {
    throw new CLIError(ERR_END_BEFORE_START, 'stop time cannot be before start time', { start: row.start_ts, end: args.ts });
  }

  // If paused, close the pause with stop time
  const lastEventStmt = db.prepare(`
    SELECT type FROM session_events 
    WHERE session_id = ? 
    ORDER BY ts DESC LIMIT 1
  `);
  const lastEvent = lastEventStmt.get(args.session);
  if (lastEvent && lastEvent.type === 'pause') {
    // Add a resume event at stop time to close the pause
    const eventId = generateEventId();
    const eventStmt = db.prepare(`
      INSERT INTO session_events (id, session_id, type, ts, created_at)
      VALUES (?, ?, 'resume', ?, ?)
    `);
    eventStmt.run(eventId, args.session, args.ts, args.ts);
  }

  // Update session
  const updateStmt = db.prepare(`
    UPDATE sessions SET end_ts = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?
  `);
  updateStmt.run(args.ts, args.note || null, args.ts, args.session);

  // Add tags if provided
  if (args.tag && args.tag.length > 0) {
    const tagStmt = db.prepare('INSERT OR IGNORE INTO session_tags (session_id, tag) VALUES (?, ?)');
    for (const tag of args.tag) {
      tagStmt.run(args.session, tag);
    }
  }

  const updatedRow = getSession(db, args.session);
  return { session: buildSession(db, updatedRow, args.ts) };
}

export { buildSession };
