# clawd-ogm MVP Specification

**clawd-ogm** - A minimal routine runner CLI for executing automated workflows.

## Commands

| Command | Description |
|---------|-------------|
| `init [name]` | Create a new routine YAML file with template |
| `validate <file>` | Validate a routine file against schema |
| `list [dir]` | List all routine files in directory |
| `run <file>` | Execute a routine file |

## Routine File Format

Routines are defined in YAML or JSON:

```yaml
name: example-routine
description: Optional description
steps:
  - name: step-1
    type: exec
    command: echo "Hello"
    
  - name: step-2
    type: sleep
    duration: 1000  # milliseconds
    
  - name: step-3
    type: exec
    command: ls -la
    workdir: /tmp  # optional
```

## Step Types

### exec
Execute a shell command.
- `command` (required): Command string to execute
- `workdir` (optional): Working directory
- `timeout` (optional): Timeout in ms (default: 30000)

### sleep
Pause execution.
- `duration` (required): Duration in milliseconds

### http (optional, future)
Make HTTP request.

## Logging

- Per-step: `[STEP] <name> started` / `[STEP] <name> completed (XXms)` / `[STEP] <name> FAILED`
- Summary: Total steps, passed, failed, duration

## Exit Codes

- 0: All steps passed
- 1: One or more steps failed
- 2: Invalid routine file

## Run History

Stored in `.history/` as JSON files:
```json
{
  "routine": "example.yaml",
  "startedAt": "2025-01-31T10:00:00Z",
  "completedAt": "2025-01-31T10:00:05Z",
  "status": "passed|failed",
  "steps": [...]
}
```
