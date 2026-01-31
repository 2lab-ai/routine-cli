# clawd-ogm — CLI Reference

This is the command/flag/environment reference for the `clawd-ogm` routine runner.

Unless otherwise specified, exit codes are defined in `docs/MVP_SPEC.md`.

---

## Global options (apply to all commands)

All commands support:

- `--format text|json` (default: `text`)
- `--home <dir>` (overrides state directory)
- `-h, --help`

### `--format <text|json>`

- In `text` mode: human-oriented output.
- In `json` mode: command MUST print exactly one JSON object to stdout.
  - Stderr MAY contain diagnostics.

### `--home <dir>`

Overrides the `.clawd-ogm` directory. Used for config and run logs.

Home directory resolution order:

1. `--home <dir>`
2. `CLAWD_OGM_HOME`
3. `./.clawd-ogm`

### Environment variables

- `CLAWD_OGM_HOME` — default home/state directory.
- `NO_COLOR` — if set (any value), disable ANSI colors in text output.

---

## `clawd-ogm init`

Initializes a project scaffold.

### Usage

```bash
clawd-ogm init [--routines-dir <dir>] [--force] [--home <dir>] [--format text|json]
```

### Options

- `--routines-dir <dir>`: directory to create (default: `./routines`)
- `--force`: overwrite only the sample routines/config that `init` would create

### Text output (shape)

```
initialized home: <path>
created routines dir: <path>
wrote sample routine: routines/hello.yaml
```

### JSON output (shape)

```json
{
  "home": "/abs/path/.clawd-ogm",
  "routinesDir": "/abs/path/routines",
  "wrote": ["routines/hello.yaml"]
}
```

---

## `clawd-ogm validate`

Validates a routine file.

### Usage

```bash
clawd-ogm validate <file> [--allow-unsupported] [--home <dir>] [--format text|json]
```

### Options

- `--allow-unsupported`: allow step types other than `exec` and `sleep` to pass validation as “unknown but allowed”.
  - Without this flag, unsupported step types MUST be validation errors.
  - Unknown fields (typos) MUST still be validation errors.

### Text output (shape)

Success:

```
VALID: <file>
name: <routine-name>
steps: <n>
```

Failure:

```
INVALID: <file>
- <error message>
- <error message>
```

### JSON output (shape)

```json
{
  "file": "routines/hello.yaml",
  "valid": true,
  "name": "hello",
  "errors": []
}
```

---

## `clawd-ogm list`

Lists routines found in a directory.

### Usage

```bash
clawd-ogm list [--routines-dir <dir>] [--home <dir>] [--format text|json]
```

### Options

- `--routines-dir <dir>`: directory to scan (default: `./routines`)

### Text output (shape)

```
ROUTINES in ./routines
- hello        Minimal routine: exec + sleep + exec   (routines/hello.yaml)
- failure-demo Shows failure behavior and continueOnError (routines/failure-demo.yaml)
```

### JSON output (shape)

```json
{
  "routinesDir": "./routines",
  "routines": [
    {"name":"hello","description":"...","file":"routines/hello.yaml"},
    {"name":"failure-demo","description":"...","file":"routines/failure-demo.yaml"}
  ],
  "errors": [
    {"file":"routines/bad.yaml","error":"YAML parse error: ..."}
  ]
}
```

Notes:
- If a file cannot be parsed or validated enough to read `name`, it SHOULD be reported under `errors`, but SHOULD NOT abort listing other files.

---

## `clawd-ogm run`

Runs a routine.

### Usage

Run by file:

```bash
clawd-ogm run --file <path> [--home <dir>] [--format text|json]
```

Run by name (searches routines dir):

```bash
clawd-ogm run <name> [--routines-dir <dir>] [--home <dir>] [--format text|json]
```

### Options

- `--file <path>`: routine file path (mutually exclusive with `<name>` positional)
- `--routines-dir <dir>`: directory to search for `<name>` (default: `./routines`)

### Text output (shape)

```
run_id: <runId>
routine: <name>

[1/3] exec greet ... ok (12ms)
[2/3] sleep pause ... ok (500ms)
[3/3] exec done ... ok (4ms)

status: SUCCESS
logs: <home>/runs/<runId>
```

On failure, final status becomes `FAILED` and process exits with code `3`.

### JSON output (shape)

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

---

## `clawd-ogm logs`

Prints logs for a past run.

### Usage

```bash
clawd-ogm logs <runId> [--home <dir>] [--format text|json]
clawd-ogm logs --last [--home <dir>] [--format text|json]
```

### Options

- `--last`: select the most recent run (by filesystem mtime)

### Text output (shape)

```
run_id: <runId>
routine: <name>
status: <SUCCESS|FAILED|CANCELLED|SUCCESS_WITH_WARNINGS>

steps:
- greet: OK
- pause: OK
- done: OK

log_dir: <home>/runs/<runId>
```

### JSON output (shape)

```json
{
  "runId": "...",
  "routine": "...",
  "status": "...",
  "runDir": "...",
  "steps": [
    {
      "id": "greet",
      "status": "OK",
      "stdoutPath": ".../steps/greet/stdout.log",
      "stderrPath": ".../steps/greet/stderr.log"
    }
  ]
}
```

Implementation notes:
- Prefer referencing file paths (e.g., `stdoutPath`) instead of embedding huge logs in JSON output.

---

## Common usage examples

### Initialize and run a sample

```bash
clawd-ogm init
clawd-ogm list
clawd-ogm run hello
```

### Validate in CI

`validate` is defined for a single file; in CI, loop over your routine files:

```bash
for f in routines/*.yaml; do
  clawd-ogm validate "$f"
done
```

### Scripted run (machine-readable)

```bash
RUN_ID=$(clawd-ogm run hello --format json | python -c 'import sys,json; print(json.load(sys.stdin)["runId"])')
clawd-ogm logs "$RUN_ID"
```
