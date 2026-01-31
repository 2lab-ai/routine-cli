/**
 * Time utilities for routine-cli
 * RFC3339 parsing, duration parsing, date handling
 */

/**
 * Strict RFC3339 regex with required timezone offset
 * Examples:
 *   ✅ 2026-01-31T09:00:00+09:00
 *   ✅ 2026-01-31T09:00:00Z
 *   ❌ 2026-01-31T09:00:00 (no tz)
 *   ❌ 2026-01-31 09:00:00+09:00 (space instead of T)
 */
const RFC3339_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Date-only regex (YYYY-MM-DD)
 */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Duration regex (NhNmNs format)
 * Examples: 30m, 1h, 1h30m, 90m, 1h30m45s
 */
const DURATION_REGEX = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/;

/**
 * Validate and parse RFC3339 timestamp
 * @param {string} ts - Timestamp string
 * @returns {{valid: boolean, date?: Date, error?: string}}
 */
export function parseRFC3339(ts) {
  if (!ts || typeof ts !== 'string') {
    return { valid: false, error: 'timestamp is required' };
  }

  if (!RFC3339_REGEX.test(ts)) {
    return { valid: false, error: 'invalid RFC3339 format (must include timezone offset)' };
  }

  const date = new Date(ts);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'invalid date value' };
  }

  return { valid: true, date };
}

/**
 * Validate RFC3339 timestamp (returns boolean)
 * @param {string} ts - Timestamp string
 * @returns {boolean}
 */
export function isValidRFC3339(ts) {
  return parseRFC3339(ts).valid;
}

/**
 * Validate date string (YYYY-MM-DD)
 * @param {string} date - Date string
 * @returns {boolean}
 */
export function isValidDate(date) {
  if (!date || !DATE_REGEX.test(date)) {
    return false;
  }
  // Validate actual date
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Parse duration string to seconds
 * @param {string} duration - Duration string (e.g., "30m", "1h30m")
 * @returns {{valid: boolean, seconds?: number, error?: string}}
 */
export function parseDuration(duration) {
  if (!duration || typeof duration !== 'string') {
    return { valid: false, error: 'duration is required' };
  }

  const match = duration.match(DURATION_REGEX);
  if (!match || (!match[1] && !match[2] && !match[3])) {
    return { valid: false, error: 'invalid duration format (use NhNmNs, e.g., 30m, 1h30m)' };
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return { valid: true, seconds: hours * 3600 + minutes * 60 + seconds };
}

/**
 * Format seconds to human-readable duration
 * @param {number} seconds - Duration in seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  
  return parts.join('');
}

/**
 * Get date string (YYYY-MM-DD) from RFC3339 timestamp in specified timezone
 * @param {string} ts - RFC3339 timestamp
 * @param {string} tz - IANA timezone
 * @returns {string}
 */
export function getDateInTz(ts, tz) {
  const date = new Date(ts);
  // Use Intl.DateTimeFormat to get date parts in specified timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date); // Returns YYYY-MM-DD format
}

/**
 * Get day boundaries (start/end) for a date in specified timezone
 * @param {string} date - YYYY-MM-DD
 * @param {string} tz - IANA timezone
 * @returns {{start: Date, end: Date}}
 */
export function getDayBoundaries(date, tz) {
  // Create date at midnight in the specified timezone
  const [year, month, day] = date.split('-').map(Number);
  
  // Use a reference date-time to find the UTC offset
  const refStr = `${date}T00:00:00`;
  const options = { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  
  // Create date assuming local timezone first, then adjust
  // This is a simplified approach - for production, use a proper library
  const localDate = new Date(`${date}T00:00:00`);
  const utcDate = new Date(localDate.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(localDate.toLocaleString('en-US', { timeZone: tz }));
  const offset = utcDate.getTime() - tzDate.getTime();
  
  const start = new Date(localDate.getTime() + offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  
  return { start, end };
}

/**
 * Calculate seconds between two RFC3339 timestamps
 * @param {string} start - Start timestamp
 * @param {string} end - End timestamp
 * @returns {number}
 */
export function secondsBetween(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
}

/**
 * Check if ts1 is before ts2
 * @param {string} ts1 - First RFC3339 timestamp
 * @param {string} ts2 - Second RFC3339 timestamp
 * @returns {boolean}
 */
export function isBefore(ts1, ts2) {
  return new Date(ts1).getTime() < new Date(ts2).getTime();
}

/**
 * Check if ts1 is after ts2
 * @param {string} ts1 - First RFC3339 timestamp
 * @param {string} ts2 - Second RFC3339 timestamp
 * @returns {boolean}
 */
export function isAfter(ts1, ts2) {
  return new Date(ts1).getTime() > new Date(ts2).getTime();
}

/**
 * Get current timestamp in RFC3339 format (for system time)
 * Note: CLI should use --ts, this is only for asOf default
 * @returns {string}
 */
export function nowRFC3339() {
  return new Date().toISOString();
}
