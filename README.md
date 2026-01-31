# clawd-ogm

Minimal routine runner CLI for executing automated workflows.

## Installation

```bash
npm install
npm link  # Optional: to use 'clawd-ogm' globally
```

## Usage

```bash
# Create a new routine
clawd-ogm init my-task

# Validate a routine file
clawd-ogm validate my-task.yaml

# List routines in a directory
clawd-ogm list ./routines

# Run a routine
clawd-ogm run my-task.yaml
```

## Routine Format

Routines are defined in YAML or JSON:

```yaml
name: my-routine
description: What this routine does

steps:
  - name: step-1
    type: exec
    command: echo "Hello!"
    
  - name: pause
    type: sleep
    duration: 1000  # milliseconds
    
  - name: final-step
    type: exec
    command: ls -la
    workdir: /tmp  # optional
```

### Step Types

| Type | Description | Properties |
|------|-------------|------------|
| `exec` | Execute shell command | `command` (required), `workdir`, `timeout` |
| `sleep` | Pause execution | `duration` in ms (required) |
| `http` | HTTP request (optional) | `url`, `method`, `headers`, `body`, `timeout` |

## Exit Codes

- `0` - All steps passed
- `1` - One or more steps failed
- `2` - Invalid routine file or usage error

## Run History

Run history is automatically saved to `.history/` as JSON files:

```json
{
  "routine": "my-task.yaml",
  "name": "my-routine",
  "startedAt": "2025-01-31T10:00:00Z",
  "completedAt": "2025-01-31T10:00:05Z",
  "status": "passed",
  "steps": [...]
}
```

## Examples

See the `examples/` directory for sample routines:

- `hello.yaml` - Simple hello world
- `deploy-example.yaml` - Simulated deployment workflow
- `failing.yaml` - Example with a failing step
- `invalid.yaml` - Invalid file for testing validation

## License

MIT
