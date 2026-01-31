# Code Review Report: routine-cli

**Date:** 2025-01-31  
**Reviewer:** Automated review (claude-opus-4-5)

---

## (a) Issues Found

### Security Issues

1. **YAML Injection in Template Generation (CRITICAL)**
   - `generateTemplate()` embedded user input directly into YAML template
   - Attack: `clawd-ogm init "name: evil\nsteps:\n  - type: exec"` would inject YAML
   - Impact: Could create malicious routine files when `init` is called with crafted names

2. **No Input Validation on Routine/Step Names (MEDIUM)**
   - Names like `../etc/passwd` or `; rm -rf /` could be accepted
   - Used in file paths (history), log output, and templates
   - Risk: Path traversal, log injection

3. **HTTP Body Sent on GET/HEAD Requests (LOW)**
   - `httpStep()` would JSON.stringify body even for GET requests
   - Violates HTTP spec and could cause request failures

### Correctness Issues

1. **Misleading Example Comment**
   - `failing.yaml` step-3 comment said "This will also run" 
   - Actually won't run because routine stops on step-2 failure (no `continueOnError`)

2. **Name Parsing Edge Case in `init`**
   - `clawd-ogm init "name.yaml.yaml"` would create `name.yaml.yaml.yaml`
   - Now properly strips `.yaml` or `.yml` suffix before adding

### Code Quality

1. **Unused Variable Pattern** (minor)
   - Some patterns could be simplified but no bugs

---

## (b) Changes Made

### Security Fixes

1. **Fixed YAML injection in `loader.js`**
   - Added `yamlSafe()` function using `JSON.stringify()` for proper escaping
   - Template now safely embeds any name string

2. **Added Safe Name validation**
   - Schema now enforces `^[A-Za-z0-9][A-Za-z0-9._-]*$` for routine and step names
   - Prevents path traversal (`../`), spaces, and special characters
   - Added validation in `cmdInit()` before file creation

3. **Fixed HTTP body handling**
   - Only send body on methods that support it (not GET/HEAD)

### Test Coverage

1. **Added `test/loader.test.js`**
   - Tests YAML injection is properly escaped
   - Tests special characters (quotes, newlines, backslashes)

2. **Expanded `test/schema.test.js`**
   - Tests rejection of path traversal attempts
   - Tests rejection of names with spaces
   - Tests acceptance of valid names with dots, dashes, underscores

### Documentation Fixes

1. **Fixed `examples/failing.yaml`**
   - Corrected misleading comment about step-3 execution

---

## (c) Remaining Risks

### Accepted Risks (by design)

1. **Shell Command Execution**
   - `exec` steps run arbitrary shell commands with `shell: true`
   - This is the core feature; users are expected to trust their routine files
   - Mitigation: Don't run routines from untrusted sources

2. **Workdir Not Validated**
   - `workdir` in exec steps could point anywhere on filesystem
   - Acceptable because exec commands themselves can `cd` anywhere

### Low Priority / Future Work

1. **No `--format json` option** (spec mentions it but not implemented)
2. **No `logs` command** (spec mentions it but not MVP)
3. **No `continueOnError` support** (spec mentions but not implemented)
4. **History files use timestamps that include colons** (not filesystem-safe on Windows)
5. **No rate limiting on HTTP steps** (could be used for DoS if pointed at external services)

### Supply Chain

- **Dependencies are minimal and well-known:**
  - `yaml` (YAML parsing) - widely used, no known issues
  - `zod` (schema validation) - widely used, no known issues
- **Dev dependencies:**
  - `eslint`, `esbuild`, `globals` - all widely used, standard tooling
- **Recommendation:** Run `npm audit` periodically

---

## Test Results

```
✓ All tests pass (9/9)
✓ Lint passes
✓ Build succeeds
```

---

## Files Changed

```
src/cli.js       - Added SAFE_NAME_PATTERN validation in cmdInit
src/loader.js    - Added yamlSafe() to prevent YAML injection  
src/runner.js    - Fixed HTTP body handling for GET/HEAD
src/schema.js    - Added SafeName pattern validation
examples/failing.yaml - Fixed misleading comment
test/loader.test.js   - NEW: YAML injection tests
test/schema.test.js   - Added name validation tests
```
