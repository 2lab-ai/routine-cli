/**
 * ID generation for routine-cli
 * Uses ULID with prefixes per entity type
 */

import { ulid } from 'ulid';

/**
 * Generate routine ID
 * @returns {string} - rtn_<ULID>
 */
export function generateRoutineId() {
  return `rtn_${ulid()}`;
}

/**
 * Generate session ID
 * @returns {string} - ses_<ULID>
 */
export function generateSessionId() {
  return `ses_${ulid()}`;
}

/**
 * Generate event ID
 * @returns {string} - evt_<ULID>
 */
export function generateEventId() {
  return `evt_${ulid()}`;
}

/**
 * Generate skip ID
 * @returns {string} - skp_<ULID>
 */
export function generateSkipId() {
  return `skp_${ulid()}`;
}

/**
 * Check if string is a valid routine ID
 * @param {string} id 
 * @returns {boolean}
 */
export function isRoutineId(id) {
  return typeof id === 'string' && id.startsWith('rtn_');
}

/**
 * Check if string is a valid session ID
 * @param {string} id 
 * @returns {boolean}
 */
export function isSessionId(id) {
  return typeof id === 'string' && id.startsWith('ses_');
}
