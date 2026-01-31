/**
 * Stub commands - not fully implemented in MVP
 * Returns ERR_NOT_IMPLEMENTED
 */

import {
  CLIError,
  ERR_NOT_IMPLEMENTED,
  EXIT_NOT_IMPLEMENTED
} from '../errors.js';

function notImplemented(command) {
  throw new CLIError(
    ERR_NOT_IMPLEMENTED,
    `command '${command}' is not implemented in MVP`,
    { command },
    EXIT_NOT_IMPLEMENTED
  );
}

/**
 * routine log - backfill a session
 */
export function sessionLog(db, args) {
  notImplemented('log');
}

/**
 * routine amend - modify existing session
 */
export function sessionAmend(db, args) {
  notImplemented('amend');
}

/**
 * routine rm - delete session
 */
export function sessionRm(db, args) {
  notImplemented('rm');
}

/**
 * routine streak - streak calculation
 */
export function routineStreak(db, args) {
  notImplemented('streak');
}

/**
 * routine skip - skip a date
 */
export function routineSkip(db, args) {
  notImplemented('skip');
}

/**
 * routine unskip - remove skip
 */
export function routineUnskip(db, args) {
  notImplemented('unskip');
}
