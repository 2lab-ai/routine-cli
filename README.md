# routine-cli

**Deterministic routine timer CLI for orchestrator integration.**

Per [MVP_SPEC.md](https://github.com/2lab-ai/clawd/blob/main/docs/routine-orchestrator/MVP_SPEC.md) — designed for `routine-orchestrator` to call without ambiguity.

## Key Features

- **sessionId-first**: Multi-active sessions allowed. Commands target specific sessions by ID.
- **Deterministic**: All state-changing commands require `--ts RFC3339` timestamp.
- **JSON output**: Machine-readable output for orchestrator integration.
- **SQLite storage**: Persistent storage with proper schema.

## Installation

```bash
npm install
```

## Usage

```bash
# Create a routine
routine add --name "Deep Work" --rule "daily>=30m" --ts 2026-01-31T09:00:00+09:00

# Start a session
routine start --routine "Deep Work" --ts 2026-01-31T09:00:00+09:00 --format json

# Check active sessions
routine active --format json

# Pause a session
routine pause --session ses_01H... --ts 2026-01-31T09:15:00+09:00

# Resume a session
routine resume --session ses_01H... --ts 2026-01-31T09:20:00+09:00

# Stop a session
routine stop --session ses_01H... --ts 2026-01-31T10:00:00+09:00

# Get today's summary
routine today --date 2026-01-31 --format json
```

## Commands

### Implemented (MVP)

| Command | Description | Required Args |
|---------|-------------|---------------|
| `add` | Create a routine | `--name`, `--rule`, `--ts` |
| `list` | List all routines | - |
| `show` | Show routine details | `--routine` |
| `start` | Start a new session | `--routine`, `--ts` |
| `active` | List active sessions | - |
| `status` | Get session status | - |
| `pause` | Pause a session | `--session`, `--ts` |
| `resume` | Resume a session | `--session`, `--ts` |
| `stop` | Stop a session | `--session`, `--ts` |
| `today` | Daily summary | - |

### Stubs (ERR_NOT_IMPLEMENTED)

- `log` - Backfill a session
- `amend` - Modify a session
- `rm` - Delete a session
- `streak` - Show streak
- `skip` - Skip a date
- `unskip` - Remove skip

## Global Options

- `--format <human|json>` - Output format (default: human)
- `--db <path>` - Database path (default: ~/.routine/routine.sqlite3)
- `--tz <IANA_TZ>` - Timezone for date interpretation

## Determinism Contract

1. **No implicit system clock for state changes**: All state-changing commands require `--ts RFC3339`.
2. **Strict time format**: Only RFC3339 with timezone offset (e.g., `2026-01-31T09:00:00+09:00`).
3. **sessionId-first**: pause/resume/stop require explicit `--session`.
4. **No ambiguity**: CLI fails with error codes + details when input is ambiguous.

## Error Codes

- `ERR_TS_REQUIRED` - `--ts` missing for state-changing command
- `ERR_INVALID_TIME_FORMAT` - Invalid RFC3339/date format
- `ERR_ROUTINE_NOT_FOUND` - Routine not found
- `ERR_AMBIGUOUS_ROUTINE` - Multiple routines match name
- `ERR_SESSION_NOT_FOUND` - Session not found
- `ERR_SESSION_REQUIRED` - `--session` missing
- `ERR_SESSION_NOT_ACTIVE` - Session already stopped
- `ERR_INVALID_STATE` - Invalid state transition (e.g., pause paused)
- `ERR_END_BEFORE_START` - Stop time before start time
- `ERR_NOT_IMPLEMENTED` - Command not implemented

## Exit Codes

- `0` - Success
- `1` - Generic failure
- `2` - User input error
- `3` - Not found
- `4` - Ambiguity/conflict
- `5` - Not implemented

## Tests

```bash
npm test
```

## License

MIT
