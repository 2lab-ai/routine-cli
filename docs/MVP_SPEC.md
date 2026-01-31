# clawd-ogm — Routine CLI MVP Spec

This document defines the **minimum viable product (MVP)** for `clawd-ogm`, a small CLI for running “routines” composed of steps.

It is written so another engineer can implement the runner without guessing.

---

## 1) MVP Scope

### 1.1 Primary goals (MVP)

`clawd-ogm` MUST:

1. **Initialize** a working directory structure for routines and run logs.
2. **Validate** a routine definition file (schema + basic semantics).
3. **List** available routines from a routines directory.
4. **Run** a routine step-by-step (sequential), with deterministic failure behavior.
5. **Show logs** for past runs (by run id, or “last run”).

### 1.2 Supported step types (MVP)

MVP MUST support these step types:

- `exec` — run a shell command.
- `sleep` — wait for a duration.

Optional (stretch):

- `http` — perform a single HTTP request and assert basic expectations.

**MVP requirement re: optional steps:**
- If `http` is not implemented, the validator MUST reject `http` steps by default.
- The validator MUST support `--allow-unsupported` to allow unknown step types to pass validation (still requiring well-formed step objects).
- The runner (`run`) MUST reject routines containing unsupported step types (because it cannot execute them).

### 1.3 Determinism / execution model

- Steps execute **in order**, one at a time.
- If a step fails, the routine **stops immediately** and is marked failed (unless the step sets `continueOnError: true`).
- No parallel execution in MVP.

---

## 2) Non-goals (explicitly out of scope for MVP)

MVP does **NOT** need:

- Scheduling/cron integration.
- Parallel steps, DAGs, or conditional branching.
- Secret management/vault integration.
- Remote execution.
- Complex templating.
- Step-level retries/backoff.
- Artifact uploading.

---

## 3) CLI Commands & Global Options (Required)

CLI binary name: **`clawd-ogm`**

### 3.1 Global options (apply to all commands)

- `--format text|json` (default: `text`)
  - In `json` mode, the command MUST print **exactly one JSON object** to stdout.
  - In `json` mode, stderr MAY contain diagnostics, but stdout MUST be JSON-only.
- `--home <dir>`: overrides the state directory (config + run logs).

Home directory resolution order:

1. `--home <dir>`
2. env `CLAWD_OGM_HOME`
3. `./.clawd-ogm` (in current working directory)

**Routines directory default:** `./routines`.

Commands that read routines from a directory (`init`, `list`, `run <name>`) MUST support:
- `--routines-dir <dir>` (default: `./routines`)

### 3.2 `clawd-ogm init`

Creates a local project scaffold.

**Behavior:**
- Creates routines directory (default `./routines` or `--routines-dir`).
- Creates home directory (default `./.clawd-ogm` or `--home`).
- Writes `<home>/config.json` with defaults.
- Writes at least one sample routine under the routines directory.

**Idempotency:**
- If already initialized, MUST NOT overwrite existing routines/logs by default.
- MAY support `--force` to overwrite only *sample* files created by `init`.

### 3.3 `clawd-ogm validate`

Validates a routine file.

**Behavior:**
- Validates file parse (YAML or JSON).
- Validates schema (required fields, types).
- Validates semantics (e.g., `steps` non-empty, unique step ids).

**Options:**
- `--allow-unsupported`: allow unknown step `type` values to pass validation.
  - Unknown *fields* MUST still be rejected (to prevent silent typos).

### 3.4 `clawd-ogm list`

Lists routines available in a routines directory.

**Behavior:**
- Scans a routines directory (default `./routines` or `--routines-dir`).
- For each routine file, attempts to parse enough to read `name` and `description`.
- MUST NOT abort listing other files if one file is invalid; invalid files are reported as errors.

### 3.5 `clawd-ogm run`

Runs a routine from a file path or by routine name.

**Routine resolution (MVP):**

- If invoked with `--file <path>`, load that exact file.
- If invoked with a routine name:
  - scan the routines directory (default `./routines` or `--routines-dir`) for `*.yaml|*.yml|*.json`
  - parse each candidate and select the one whose `name` matches exactly
  - if none match, return exit code `2`
  - if multiple match, return validation error (exit code `1`) and explain the conflict

**Behavior:**
- Resolves the routine definition.
- Creates a new **run id**.
- Executes steps sequentially.
- Captures stdout/stderr for `exec` steps.
- Writes a run record and per-step logs to disk.
- Prints a summary and exits with a defined exit code.

### 3.6 `clawd-ogm logs`

Shows logs for a past run.

**Behavior:**
- Given a `runId`, prints:
  - overall status
  - step summary
  - location of log files
- MUST support selecting last run via `--last`.

---

## 4) Routine File Schema (Minimal)

### 4.1 File format

A routine file MUST be either:

- YAML (`.yml` / `.yaml`) or
- JSON (`.json`)

YAML is recommended for humans.

### 4.2 Top-level fields

A routine definition is an object with:

- `version` (required, integer): schema version. MVP value: `1`
- `name` (required, string): routine identifier used by `run <name>`.
- `description` (optional, string)
- `defaults` (optional, object)
- `steps` (required, array; length >= 1)

Naming constraints (MVP):
- `name` MUST match regex: `^[A-Za-z0-9][A-Za-z0-9._-]*$`
  - This ensures it is safe to use in filenames and log paths.

`defaults` (optional) fields:

- `cwd` (optional, string): default working directory for `exec` steps.
  - If relative, it is resolved relative to the CLI process working directory.
- `env` (optional, object<string,string>): default environment additions for `exec`.
- `shell` (optional, string): shell invocation hint. MVP semantics:
  - if `shell: bash`, run commands as `bash -lc <command>`
  - if `shell: sh`, run commands as `sh -lc <command>`
  - if omitted, default is `sh`.

### 4.3 Step object (common fields)

Each element of `steps` MUST be an object with:

- `id` (required, string): unique within the routine.
- `type` (required, string): one of `exec`, `sleep` (and optionally `http`).
- `name` (optional, string): human label.
- `continueOnError` (optional, boolean; default `false`).

Step id constraints (MVP):
- `id` MUST match regex: `^[A-Za-z0-9][A-Za-z0-9._-]*$`
- Runner MUST use `id` as the directory name under `runs/<runId>/steps/<id>/`.

Unknown fields:
- Validator MUST fail on unknown top-level fields and unknown fields within a step, to prevent silent typos.

### 4.4 `exec` step

Required fields:

- `command` (required, string): command text passed to the chosen shell.

Optional fields:

- `cwd` (optional, string): overrides `defaults.cwd`.
  - If relative, it is resolved relative to the CLI process working directory.
- `env` (optional, object<string,string>): merged over `defaults.env`.
  - If a key exists in both, the step value overrides the default value.
- `timeoutMs` (optional, integer): if set, the command MUST be terminated after this duration.

Execution rules:

- Runner MUST capture `stdout` and `stderr` separately.
- Runner MUST record the process exit code.
- If exit code != 0, step status is `FAILED`.
- If the process is terminated due to `timeoutMs`, runner MUST record `timedOut: true` and step status MUST be `FAILED`.

### 4.5 `sleep` step

Required fields:

- `ms` (required, integer): sleep duration in milliseconds. Must be `>= 0`.

Execution rules:

- Sleeping for `0` is allowed.
- Negative is invalid (validation error).

### 4.6 Optional `http` step (stretch)

If implemented, `http` step fields are:

Required:
- `method` (required, string): `GET|POST|PUT|PATCH|DELETE|HEAD`.
- `url` (required, string)

Optional:
- `headers` (object<string,string>)
- `timeoutMs` (integer)
- `body` (string) — raw body
- `json` (any JSON value) — if provided, runner sends JSON and sets `Content-Type: application/json`
- `expect` (object): expectations
  - `status` (integer)
  - `bodyContains` (string)

Failure rules:
- Request error or expectation mismatch => step status `FAILED`.

---

## 5) Status model & failure behavior (Normative)

### 5.1 Status enums (MVP)

**Run status** MUST be one of:
- `SUCCESS`
- `FAILED`
- `CANCELLED`
- `SUCCESS_WITH_WARNINGS`

**Step status** MUST be one of:
- `OK`
- `FAILED`
- `FAILED_CONTINUED`
- `CANCELLED`

### 5.2 Routine failure

A run is **FAILED** when:
- any step has status `FAILED` or `CANCELLED` and that step did not have `continueOnError: true`.

A run is **SUCCESS** when:
- all steps have status `OK`.

A run is **SUCCESS_WITH_WARNINGS** when:
- at least one step was allowed to fail via `continueOnError: true`.

### 5.3 `continueOnError`

If `continueOnError: true` and the step fails:

- the step status MUST be recorded as `FAILED_CONTINUED`,
- execution continues to the next step,
- final run status MUST be `SUCCESS_WITH_WARNINGS`.

### 5.4 Interrupts

On SIGINT/SIGTERM:

- Runner SHOULD stop the current step (terminate process if `exec`).
- Mark run status as `CANCELLED`.
- Exit code SHOULD be `130`.

---

## 6) Run logs & persistence

### 6.1 Directory layout (MVP)

Under `<home>/`:

- `config.json` — initialization/config file (minimal)
- `runs/`
  - `<runId>/`
    - `run.json` — run summary metadata
    - `events.jsonl` — append-only event stream (one JSON per line)
    - `steps/`
      - `<stepId>/`
        - `stdout.log` (exec only; may be empty)
        - `stderr.log` (exec only; may be empty)
        - `step.json` (step result, exit code, timing)

Run id constraints (MVP):
- `runId` MUST be filesystem-safe and MUST match: `^[A-Za-z0-9][A-Za-z0-9._-]*$`
- It MUST be unique per run.
- Recommended format: `YYYYMMDD-HHMMSS-<random>` (example: `20260131-210455-4f2c`).

### 6.2 `run.json` minimal shape

`run.json` MUST be a JSON object containing at least:

- `runId` (string)
- `routine` (string) — routine name
- `routineFile` (string, optional) — resolved routine file path
- `status` (string) — one of the run statuses in §5.1
- `startedAt` (ISO 8601 string)
- `finishedAt` (ISO 8601 string, or `null` while running)

### 6.3 `step.json` minimal shape

Each `steps/<stepId>/step.json` MUST be a JSON object containing at least:

- `id` (string)
- `type` (string)
- `status` (string) — one of the step statuses in §5.1
- `startedAt` (ISO 8601 string)
- `finishedAt` (ISO 8601 string)
- `durationMs` (integer >= 0)

For `exec` steps, it MUST also include:
- `exitCode` (integer, or `null` if unavailable)

If a timeout occurs, it MUST include:
- `timedOut` (boolean, true)

### 6.4 Event format (`events.jsonl`)

Each line MUST be a JSON object with at least:

- `ts` (ISO 8601 string)
- `runId` (string)
- `event` (string): one of `run_started`, `step_started`, `step_finished`, `run_finished`
- `stepId` (string, optional)
- `data` (object, optional)

Recommended `data` contents (MVP):
- `run_started`: `{ "routine": "...", "routineFile": "..." }`
- `step_started`: `{ "type": "..." }`
- `step_finished`: `{ "status": "OK|FAILED|FAILED_CONTINUED|CANCELLED", "exitCode": 0 }` (exitCode only for exec)
- `run_finished`: `{ "status": "SUCCESS|FAILED|CANCELLED|SUCCESS_WITH_WARNINGS" }`

This file enables `clawd-ogm logs --format json` without parsing all other files.

---

## 7) Exit Codes (MVP)

These exit codes apply to all commands.

- `0` — success
- `1` — validation error **or CLI usage error** (invalid flags/arguments)
- `2` — not found (missing routine file, missing runs, missing dir)
- `3` — routine executed but ended in `FAILED`
- `4` — internal error (unexpected exception)
- `130` — cancelled by signal (SIGINT)

Command-specific expectations:

### `init`
- `0` initialized (or already initialized)
- `1` invalid usage
- `4` internal

### `validate`
- `0` valid
- `1` invalid
- `2` file not found
- `4` internal

### `list`
- `0` listed
- `2` routines dir not found
- `4` internal

### `run`
- `0` run `SUCCESS` or `SUCCESS_WITH_WARNINGS`
- `3` run `FAILED`
- `2` routine not found
- `1` routine invalid (failed validation) or invalid invocation
- `4` internal
- `130` cancelled

### `logs`
- `0` logs printed
- `2` runId not found
- `1` invalid invocation
- `4` internal

---

## 8) Output / logging expectations

### 8.1 Human output (default)

Commands SHOULD print concise, stable lines.

`run` output MUST include:

- resolved routine name
- run id
- per-step status lines
- final status line
- location of logs

Example shape:

```
$ clawd-ogm run hello
run_id: 20260131-210455-4f2c
routine: hello

[1/3] exec greet ... ok (12ms)
[2/3] sleep pause ... ok (500ms)
[3/3] exec done ... ok (4ms)

status: SUCCESS
logs: .clawd-ogm/runs/20260131-210455-4f2c
```

### 8.2 JSON output (`--format json`)

When `--format json` is provided, the command MUST print **exactly one JSON object** to stdout, suitable for scripting.

For `run`, the JSON output MUST include at least:

- `runId` (string)
- `routine` (string)
- `status` (string)
- `steps` (array)
- `home` (string)
- `runDir` (string)
- `startedAt` (string)
- `finishedAt` (string)

Example for `run`:

```json
{
  "runId": "20260131-210455-4f2c",
  "routine": "hello",
  "status": "SUCCESS",
  "startedAt": "2026-01-31T21:04:55.123Z",
  "finishedAt": "2026-01-31T21:04:55.789Z",
  "home": "/abs/path/.clawd-ogm",
  "runDir": "/abs/path/.clawd-ogm/runs/20260131-210455-4f2c",
  "steps": [
    {"id":"greet","type":"exec","status":"OK","exitCode":0,"durationMs":12},
    {"id":"pause","type":"sleep","status":"OK","durationMs":500},
    {"id":"done","type":"exec","status":"OK","exitCode":0,"durationMs":4}
  ]
}
```

Stderr MAY include human diagnostics, but stdout MUST be JSON-only in json mode.

---

## 9) Full example routines (copy/paste)

### 9.1 Example 1 — “hello” (exec + sleep)

File: `routines/hello.yaml`

```yaml
version: 1
name: hello
description: Minimal routine: exec + sleep + exec

defaults:
  shell: sh
  env:
    ROUTINE_GREETING: "Hello"

steps:
  - id: greet
    type: exec
    command: 'echo "$ROUTINE_GREETING from clawd-ogm"'

  - id: pause
    type: sleep
    ms: 500

  - id: done
    type: exec
    command: 'echo "done"'
```

### 9.2 Example 2 — “failure-demo” (demonstrates failure + continueOnError)

File: `routines/failure-demo.yaml`

```yaml
version: 1
name: failure-demo
description: Shows failure behavior and continueOnError

defaults:
  shell: sh

steps:
  - id: ok-1
    type: exec
    command: "echo first"

  - id: fail-but-continue
    type: exec
    command: "echo about-to-fail; exit 7"
    continueOnError: true

  - id: ok-2
    type: sleep
    ms: 200

  - id: ok-3
    type: exec
    command: "echo still-ran"
```

Expected:
- `fail-but-continue` marked `FAILED_CONTINUED`, but routine continues.
- final status `SUCCESS_WITH_WARNINGS`.

### 9.3 (Optional) Example 3 — “http-check” (only if http supported)

File: `routines/http-check.yaml`

```yaml
version: 1
name: http-check
description: Optional HTTP step example

steps:
  - id: check
    type: http
    method: GET
    url: https://example.com/
    expect:
      status: 200
      bodyContains: "Example Domain"
```

---

## 10) Golden path demo script (exact commands)

Assumes `clawd-ogm` is on your PATH.

```bash
set -euo pipefail

# 1) start fresh
mkdir -p /tmp/ogm-demo
cd /tmp/ogm-demo

# 2) initialize
clawd-ogm init

# EXPECTED (shape):
# initialized home: /tmp/ogm-demo/.clawd-ogm
# created routines dir: /tmp/ogm-demo/routines
# wrote sample routine: routines/hello.yaml

# 3) list routines
clawd-ogm list
# EXPECTED (shape): a list including "hello"

# 4) validate a routine file
clawd-ogm validate routines/hello.yaml
# EXPECTED (shape): "VALID" and exit code 0

# 5) run by name and capture run id from json output
RUN_ID=$(clawd-ogm run hello --format json | python -c 'import sys,json; print(json.load(sys.stdin)["runId"])')

# EXPECTED (shape): json object with keys runId, routine, status, steps, home, runDir

# 6) show logs for that run
clawd-ogm logs "$RUN_ID"
# EXPECTED (shape): summary + step statuses + location of log files

# 7) inspect the run directory
ls -la ".clawd-ogm/runs/$RUN_ID"
# EXPECTED (shape): run.json, events.jsonl, steps/
```

If your implementation uses a different run id format, keep it stable and filesystem-safe, and ensure it prints in `run` output.
