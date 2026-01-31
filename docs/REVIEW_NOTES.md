# Spec/CLI Review Notes (2026-01-31)

This file records doc edits applied during a consistency/edge-case review of:
- `docs/MVP_SPEC.md`
- `docs/CLI_REFERENCE.md`

## Summary of changes

### 1) Made MVP spec and CLI reference consistent (removed “phantom” flags)

- Removed/avoided non-MVP flags from the CLI reference (`--dry-run`, `--step`, `--no-continue-on-error`, `--tail`) because they were not defined as MVP requirements in the spec.
- Ensured every command usage line in `CLI_REFERENCE.md` shows the global flags consistently (`--home`, `--format`).

Why: prevent implementers from building features that aren’t required for MVP and reduce ambiguity.

### 2) Tightened/testabilized run/log persistence requirements

- Fixed the run directory layout in `MVP_SPEC.md` (previous indentation made `run.json/events.jsonl/steps/` look like they were part of the runId *format*).
- Added minimal, testable required shapes for:
  - `run.json`
  - `steps/<stepId>/step.json`
  - `events.jsonl` events and required event names

Why: acceptance criteria needs to be verifiable by inspection (file layout + required JSON keys).

### 3) Clarified status enums and `continueOnError` semantics

- Defined explicit enums for run status and step status.
- Made `SUCCESS_WITH_WARNINGS` mandatory when any step fails with `continueOnError: true`.

Why: previously the spec allowed `SUCCESS` in this case, which makes outcomes ambiguous and hard to assert in tests.

### 4) Aligned JSON output shapes across docs

- Updated `MVP_SPEC.md` run JSON example to match the richer shape in `CLI_REFERENCE.md` (adds `startedAt`, `finishedAt`, `home`, `runDir`).
- Clarified that JSON mode prints exactly one JSON object to stdout.
- Updated `list --format json` to include an `errors` array (the reference mentioned it but the example didn’t include it).
- Adjusted `logs --format json` to prefer `stdoutPath`/`stderrPath` over embedding full logs.

Why: reduces mismatch between “spec example” and “reference example” and makes scripting predictable.

### 5) Removed an execution-model footgun from the examples

- Updated `failure-demo` example to avoid nesting `sh -lc` inside `command`, since the runner already invokes a shell (`sh -lc <command>`).

Why: nesting shells can produce confusing quoting/behavior and was inconsistent with the `exec` semantics.

### 6) Exit-code edge cases

- Clarified that CLI usage errors (missing args, invalid invocation) are exit code `1`.

Why: previously only schema/semantic validation errors were covered, leaving argument errors undefined.

## Not changed (intentional)

- Did not add new step types or execution features beyond what was already described as optional/stretch.
- Did not expand `logs` functionality beyond `--last` (kept MVP tight).
