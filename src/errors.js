/**
 * Error codes and types for routine-cli
 * Per MVP_SPEC.md Section 6
 */

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_GENERIC_FAILURE = 1;
export const EXIT_USER_INPUT_ERROR = 2;
export const EXIT_NOT_FOUND = 3;
export const EXIT_AMBIGUITY = 4;
export const EXIT_NOT_IMPLEMENTED = 5;

// Error codes
export const ERR_INVALID_ARGS = 'ERR_INVALID_ARGS';
export const ERR_TS_REQUIRED = 'ERR_TS_REQUIRED';
export const ERR_INVALID_TIME_FORMAT = 'ERR_INVALID_TIME_FORMAT';
export const ERR_ROUTINE_NOT_FOUND = 'ERR_ROUTINE_NOT_FOUND';
export const ERR_AMBIGUOUS_ROUTINE = 'ERR_AMBIGUOUS_ROUTINE';
export const ERR_SESSION_NOT_FOUND = 'ERR_SESSION_NOT_FOUND';
export const ERR_SESSION_REQUIRED = 'ERR_SESSION_REQUIRED';
export const ERR_SESSION_NOT_ACTIVE = 'ERR_SESSION_NOT_ACTIVE';
export const ERR_INVALID_STATE = 'ERR_INVALID_STATE';
export const ERR_END_BEFORE_START = 'ERR_END_BEFORE_START';
export const ERR_ALREADY_EXISTS = 'ERR_ALREADY_EXISTS';
export const ERR_NOT_IMPLEMENTED = 'ERR_NOT_IMPLEMENTED';

/**
 * CLIError class with code and details
 */
export class CLIError extends Error {
  constructor(code, message, details = {}, exitCode = EXIT_USER_INPUT_ERROR) {
    super(message);
    this.code = code;
    this.details = details;
    this.exitCode = exitCode;
  }
}

/**
 * Create error result object for JSON output
 */
export function errorResult(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      details: Object.keys(details).length > 0 ? details : undefined
    }
  };
}

/**
 * Create success result object for JSON output
 */
export function successResult(command, data, warnings = [], meta = {}) {
  return {
    ok: true,
    command,
    data,
    warnings,
    meta
  };
}

/**
 * Map error code to exit code
 */
export function getExitCode(errorCode) {
  switch (errorCode) {
    case ERR_ROUTINE_NOT_FOUND:
    case ERR_SESSION_NOT_FOUND:
      return EXIT_NOT_FOUND;
    case ERR_AMBIGUOUS_ROUTINE:
      return EXIT_AMBIGUITY;
    case ERR_NOT_IMPLEMENTED:
      return EXIT_NOT_IMPLEMENTED;
    default:
      return EXIT_USER_INPUT_ERROR;
  }
}
