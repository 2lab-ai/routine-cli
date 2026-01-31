/**
 * Daily summary command: today
 */

import { parseRFC3339, nowRFC3339, isValidDate, getDateInTz, secondsBetween, isBefore, isAfter } from '../time.js';
import { findRoutine } from './routine.js';
import {
  CLIError,
  ERR_INVALID_ARGS,
  ERR_INVALID_TIME_FORMAT
} from '../errors.js';

/**
 * Get system timezone
 */
function getSystemTz() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Get current date in timezone
 */
function getCurrentDate(tz) {
  return getDateInTz(new Date().toISOString(), tz);
}

/**
 * Get day boundaries as RFC3339 strings
 */
function getDayBoundariesRFC3339(date, tz) {
  // Parse date
  const [year, month, day] = date.split('-').map(Number);
  
  // Create date strings at 00:00 and 23:59:59.999
  // We need to figure out the UTC offset for the timezone on this date
  const testDate = new Date(`${date}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false
  });
  
  // Calculate offset by comparing UTC and local
  const utcHour = testDate.getUTCHours();
  const localParts = formatter.formatToParts(testDate);
  const localHour = parseInt(localParts.find(p => p.type === 'hour')?.value || '12', 10);
  
  // This is approximate - for production use a proper library
  // For now, we'll just use ISO strings and filter by date in tz
  
  // Start of day in UTC (approximate)
  const dayStart = new Date(`${date}T00:00:00Z`);
  // Adjust for timezone - this is simplified
  const offset = new Date().toLocaleString('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  
  return {
    startDate: date,
    // We'll filter sessions by their date in the timezone
  };
}

/**
 * Calculate session contribution to a specific day
 * Handles sessions that cross midnight
 */
function sessionDayContribution(session, date, tz) {
  const sessionStart = new Date(session.start);
  const sessionEnd = session.end ? new Date(session.end) : new Date();
  
  // Get date boundaries (00:00:00 to 23:59:59.999 in tz)
  const dayStartStr = `${date}T00:00:00`;
  const dayEndStr = `${date}T23:59:59.999`;
  
  // Create dates in the target timezone
  // This is simplified - just check if session overlaps with the date
  const sessionStartDate = getDateInTz(session.start, tz);
  const sessionEndDate = session.end ? getDateInTz(session.end, tz) : getDateInTz(new Date().toISOString(), tz);
  
  // If session doesn't overlap with this date, return 0
  if (sessionStartDate > date && sessionEndDate > date) return 0;
  if (sessionStartDate < date && sessionEndDate < date) return 0;
  
  // Calculate contribution
  // For simplicity in MVP, we'll use total session time if it overlaps
  // TODO: Implement proper day bucket splitting for sessions crossing midnight
  
  return {
    durationSeconds: session.computed.durationSeconds,
    pausedSeconds: session.computed.pausedSeconds,
    activeSeconds: session.computed.activeSeconds
  };
}

/**
 * routine today command
 */
export function todaySummary(db, args) {
  // Determine timezone
  let tz = args.tz || getSystemTz();
  let routineFilter = null;

  // If routine specified, use its timezone
  if (args.routine) {
    const { routine } = findRoutine(db, args.routine);
    routineFilter = routine.id;
    if (!args.tz) {
      tz = routine.tz;
    }
  }

  // Determine date
  const date = args.date || getCurrentDate(tz);
  if (args.date && !isValidDate(args.date)) {
    throw new CLIError(ERR_INVALID_TIME_FORMAT, 'invalid --date format (use YYYY-MM-DD)');
  }

  // Query sessions
  let query = `
    SELECT s.*, r.name as routine_name, r.tz as routine_tz
    FROM sessions s
    JOIN routines r ON r.id = s.routine_id
    WHERE s.deleted_at IS NULL
  `;
  const params = [];

  if (routineFilter) {
    query += ' AND s.routine_id = ?';
    params.push(routineFilter);
  }

  // Filter by date overlap (simplified: sessions where start or end is on this date)
  // This is a simplified approach - proper implementation would check tz-aware date ranges
  query += ` AND (
    date(s.start_ts) <= ? AND (s.end_ts IS NULL OR date(s.end_ts) >= ?)
  )`;
  params.push(date, date);

  query += ' ORDER BY s.start_ts ASC, s.id ASC';

  const stmt = db.prepare(query);
  const rows = stmt.all(...params);

  // Build sessions with computed fields
  const asOf = args.asOf || nowRFC3339();
  const sessions = [];
  let totalDuration = 0;
  let totalActive = 0;
  let totalPaused = 0;

  for (const row of rows) {
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
    
    let pausedSeconds = 0;
    for (const p of pauses) {
      const pauseEnd = p.end || effectiveEnd;
      const pStart = isAfter(p.start, row.start_ts) ? p.start : row.start_ts;
      const pEnd = isBefore(pauseEnd, effectiveEnd) ? pauseEnd : effectiveEnd;
      if (isAfter(pEnd, pStart)) {
        pausedSeconds += secondsBetween(pStart, pEnd);
      }
    }

    const activeSeconds = Math.max(0, durationSeconds - pausedSeconds);

    const session = {
      id: row.id,
      routineId: row.routine_id,
      routineName: row.routine_name,
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
      updatedAt: row.updated_at
    };

    sessions.push(session);
    totalDuration += durationSeconds;
    totalActive += activeSeconds;
    totalPaused += pausedSeconds;
  }

  return {
    date,
    tz,
    routineId: routineFilter || undefined,
    routineName: routineFilter ? sessions[0]?.routineName : undefined,
    sessions,
    totals: {
      durationSeconds: totalDuration,
      activeSeconds: totalActive,
      pausedSeconds: totalPaused,
      sessionsCount: sessions.length
    }
  };
}
