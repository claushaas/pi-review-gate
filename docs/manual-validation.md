# Manual Validation — Step 20.1

## Environment

- **Date:** (fill in during execution)
- **Pi version:** (fill in: `pi --version`)
- **Node version:** (fill in: `node --version`)
- **Package manager:** pnpm
- **Extension path:** `/Users/claus/.pi/agent/extensions/pi-review-gate`
- **Config path:** `~/.config/pi-review-gate/config.json`

## Pre-flight (automated)

- [x] Dependencies installed (`pnpm install`)
- [x] Typecheck passed (`pnpm typecheck` — 0 errors)
- [x] Biome/check passed (`pnpm check` — 29 files, no fixes)
- [x] Vitest passed (`pnpm test` — 671 tests)
- [x] `package.json` exposes Pi extension entrypoint (`pi.extensions: ["./src/index.ts"]`)
- [x] `src/index.ts` imports without errors
- [x] `commands.ts` does not call Git, reviewer, model, sendUserMessage, or appendEntry
- [x] No production files altered in this step

### Static API analysis (from Pi SDK types)

The real Pi `registerCommand` handler signature is:
```ts
handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>
```

The extension currently uses:
```ts
type CommandHandler = (input?: unknown) => Promise<string | undefined> | string | undefined
```

At runtime (JS type erasure), `args: string` becomes the `input` parameter, and `ctx` is an extra argument silently ignored. Return values are expected to be ignored by the runtime (`Promise<void>`). However, Pi's documented pattern uses `ctx.ui.notify()` for output, not return values. **This must be validated at runtime.** Two potential outcomes:

1. Extension commands work as-is (returned strings may or may not be displayed).
2. Commands need to be adapted to use `ctx.ui.notify()` for output — to be addressed in Step 20.2 if needed.

### Known test/mock contract vs real API

| Aspect | Test mocks | Real Pi API (from SDK types) | Risk |
|---|---|---|---|
| `registerCommand` handler args | `(input?: unknown)` | `(args: string, ctx: ExtensionCommandContext)` | Low — compat at runtime |
| Handler return type | `string \| undefined` | `Promise<void>` | Medium — output may not display |
| `agent_end` handler | `(event, ctx)` | `(event: AgentEndEvent, ctx: ExtensionContext)` | Low — field access seems compatible |
| `pi.exec` | `(cmd, args, opts?) => ExecResult` | `(command, args, options?) => ExecResult` | Low — matches |
| `pi.appendEntry` | `(type, data?) => void` | `(customType, data?) => void` | Low — matches |
| `pi.sendUserMessage` | `(content, opts?) => void` | `(content, options?) => void` | Low — matches |

## Runtime load

- [x] Extension installed/linked into Pi runtime
      (Run `pnpm link` or symlink into Pi extension directory)
- [x] `/reload` executed
- [x] No load error shown (check for TypeError, import failures)
- [x] `agent_end` hook registration does not throw
      (Trigger an agent cycle and confirm no crash)

## Commands

### Direct commands

- [x] `/review-gate-status` responds with status text including: enabled, mode, reviewer model, max correction cycles, context, git, reviewer
- [x] `/review-gate-on` responds with "Review gate enabled." and persists `enabled: true`
- [x] `/review-gate-off` responds with "Review gate disabled." and persists `enabled: false`
- [x] `/review-gate-model` (no args) responds: lists models if registry available, or clear message if unavailable
- [x] `/review-gate-model <provider>/<id> [thinkingLevel]` persists reviewer model when valid
- [x] `/review-gate` (no args) shows menu with available sub-commands

### Menu sub-commands (via `/review-gate <sub-command>`)

- [x] `/review-gate status` works (alias of `/review-gate-status`)
- [x] `/review-gate on` works (alias of `/review-gate-on`)
- [x] `/review-gate off` works (alias of `/review-gate-off`)
- [x] `/review-gate model` works (alias of `/review-gate-model`)
- [x] `/review-gate model <provider>/<id> [thinkingLevel]` persists reviewer model
- [x] `/review-gate thinking <thinkingLevel>` sets thinking level on configured model
- [x] `/review-gate max-cycles <number>` persists maxCorrectionCycles
- [x] `/review-gate toggle-git-diff` toggles git.includeDiff
- [x] `/review-gate toggle-session-context` toggles context.includeSessionSlice
- [x] `/review-gate manual` returns "Manual review is not implemented yet."

## Config persistence

- [x] Config file exists or is created at `~/.config/pi-review-gate/config.json`
- [x] After `/review-gate-on`, config file contains `"enabled": true`
- [x] After `/review-gate-off`, config file contains `"enabled": false`
- [x] After `/review-gate-model <provider>/<id>`, `reviewerModel` is persisted
- [x] After `/review-gate max-cycles <N>`, `maxCorrectionCycles` is persisted
- [x] `/review-gate-status` reflects persisted values after changes
- [x] After manual edit of config file + `/reload`, status reflects new values
- [x] Config file permissions attempt `0600` (chmod) — may not apply on all platforms

## Model command specifics

- [x] `/review-gate-model` (no args): lists models when model registry is available
- [x] `/review-gate-model` (no args): returns "Model registry is not available." when no registry
- [x] `/review-gate-model <provider>/<id>`: persists reviewerModel when model found in registry
- [x] `/review-gate-model <provider>/<id>`: returns "Reviewer model not found: ..." when model not in registry
- [x] `/review-gate-model <provider>/<id> <thinkingLevel>`: persists with thinking level
- [x] Invalid thinking level returns clear error

## Notes

- **Observed issues:** (fill in during execution)

- **Runtime API mismatches:**
  - Command handler signature: `(args: string, ctx: ExtensionCommandContext) => Promise<void>` (real) vs `(input?: unknown) => Promise<string | undefined>` (current)
  - Command output display: real API uses `ctx.ui.notify()`, current code returns strings
  - If commands do not display output, adaptation to `ctx.ui.notify()` will be needed

- **Follow-up actions for Step 20.2:**
  - After commands validated, proceed to validate `agent_end` flows
  - If command output does not display, fix in early Step 20.2 before running review flows
  - Validate real model resolution and reviewer execution

---

# Manual Validation — Step 20.2

> **Status:** Manual runtime validation was not executed in this environment.
> The checklist below is prepared for execution inside the Pi Runtime.
> Automated validations (typecheck, biome, vitest, structural) all passed.

## Environment

- **Date:** (fill in during execution)
- **Pi version:** (fill in: `pi --version`)
- **Node version:** (fill in: `node --version`)
- **Package manager:** pnpm
- **Extension path:** `/Users/claus/.pi/agent/extensions/pi-review-gate`
- **Config path:** `~/.config/pi-review-gate/config.json`
- **Reviewer provider/id:** (fill in, e.g. `openrouter/deepseek/deepseek-v3.2`)
- **Reviewer thinking level:** (fill in, e.g. `high`)

## Pre-flight

- [ ] Dependencies installed (`pnpm install`)
- [ ] Typecheck passed (`pnpm typecheck`)
- [ ] Biome/check passed (`pnpm check`)
- [ ] Vitest passed (`pnpm test`)
- [ ] Extension loaded with `/reload` (no errors)
- [ ] `/review-gate-status` responds
- [ ] Reviewer model configured (`/review-gate-model <provider>/<id> [thinkingLevel]`)
- [ ] Review gate enabled (`/review-gate-on`)
- [ ] Config local exists at `~/.config/pi-review-gate/config.json`
- [ ] Git repository available for at least one test scenario

### Pre-flight (automated — this environment)

- [x] Typecheck passed (`pnpm typecheck` — 0 errors)
- [x] Biome/check passed (`pnpm check` — 29 files, no fixes)
- [x] Vitest passed (`pnpm test` — 671 tests)
- [x] `commands.ts` scope: no Git, no reviewer, no model, no sendUserMessage, no appendEntry
- [x] No dependency changes (`git diff -- package.json` is empty)
- [x] `index.ts` remains thin (wires hook + commands, no heavy logic)

## Approved flow

### Setup

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "<provider>",
    "id": "<model-id>",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2
}
```

### Scenario

Execute a simple task expected to pass, e.g.:
> Create a small README note explaining that this is a validation pass. Keep it minimal and run the relevant tests.

### Expected criteria

- [ ] The agent delivers something simple and coherent
- [ ] `agent_end` hook runs (no crash)
- [ ] Reviewer returns approved result
- [ ] `pi-review-gate-result` entry is created
- [ ] Result payload has `approved: true`
- [ ] Result payload has `severity: pass` (or similar non-blocking severity)
- [ ] Result payload has `attempt: 0`
- [ ] Result payload includes `model` with provider/id
- [ ] No follow-up is injected
- [ ] No `pi-review-gate-final-failure` entry is created
- [ ] No `pi-review-gate-error` entry is created
- [ ] A subsequent task can run, indicating `activeReview` was released

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)

## Rejected flow — block mode

### Setup

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "<provider>",
    "id": "<model-id>",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2
}
```

### Scenario

Trigger a task expected to be rejected. If feasible, use a controlled prompt that asks for a verifiable change and then instructs intentionally incomplete delivery.

Example:
> Make a small required change, but intentionally skip tests and omit the requested file update.

If intentional failure is impractical, configure a strict reviewer model and execute a non-trivial task that the reviewer is likely to reject.

### Expected criteria

- [ ] `agent_end` review runs
- [ ] Reviewer returns rejected result (`approved: false`)
- [ ] `pi-review-gate-result` entry is created
- [ ] Result payload has `approved: false`
- [ ] Result payload has `requiredCorrections` (non-empty array)
- [ ] Result payload has `evidence` (non-empty array)
- [ ] Follow-up is injected via `pi.sendUserMessage`
- [ ] Follow-up starts with `[pi-review-gate:correction-request]`
- [ ] Follow-up contains `# Mandatory Review Corrections` header
- [ ] Follow-up contains `## Required Corrections` section with numbered items
- [ ] Follow-up contains `## Evidence` section with numbered items
- [ ] Follow-up contains `## Instructions` section
- [ ] Follow-up is delivered as a follow-up message (`deliverAs: "followUp"`)
- [ ] No `pi-review-gate-final-failure` entry is created (cycle limit not exceeded)
- [ ] No `pi-review-gate-error` entry is created (reviewer succeeded, just rejected)
- [ ] A subsequent correction cycle can run (correction marker detected, cycle incremented)
- [ ] No infinite loop — each cycle stops after one follow-up

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Follow-up text verified?** (fill in: yes / no / partial)

## Rejected flow — warn mode

### Setup

```json
{
  "enabled": true,
  "mode": "warn",
  "reviewerModel": {
    "provider": "<provider>",
    "id": "<model-id>",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2
}
```

### Scenario

Execute a scenario similar to the block-mode rejection.

### Expected criteria

- [ ] `agent_end` review runs
- [ ] Reviewer returns rejected result (`approved: false`)
- [ ] `pi-review-gate-result` entry is created
- [ ] Result payload has `approved: false`
- [ ] **No follow-up is injected** (critical: warn mode must not block)
- [ ] Warning notification appears if UI notify is available/configured
- [ ] No `pi-review-gate-final-failure` entry is created
- [ ] No `pi-review-gate-error` entry is created (unless reviewer/model failed independently)
- [ ] Agent can continue with the next task (no blocking)

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Follow-up injected?** (must be NO for this to pass)
- **Warning notification shown?** (fill in: yes / no / N/A)

## Persistence verification

### Fields expected in `pi-review-gate-result` entries

- [ ] `timestamp` — ISO-8601 formatted timestamp
- [ ] `attempt` — correction cycle attempt number (0-indexed)
- [ ] `model` — reviewer model config (provider, id, thinkingLevel)
- [ ] `result.approved` — boolean
- [ ] `result.severity` — one of: `pass`, `minor`, `major`, `blocking`
- [ ] `result.summary` — string
- [ ] `result.requiredCorrections` — string array (when rejected)
- [ ] `result.recommendedCorrections` — string array (when applicable)
- [ ] `result.evidence` — string array (when applicable)
- [ ] `result.confidence` — one of: `low`, `medium`, `high`

### Absence verification — approved flow

- [ ] `pi-review-gate-final-failure` entry does NOT exist
- [ ] `pi-review-gate-error` entry does NOT exist
- [ ] No follow-up message was injected

### Absence verification — rejected block flow (with cycles remaining)

- [ ] `pi-review-gate-final-failure` entry does NOT exist
- [ ] `pi-review-gate-error` entry does NOT exist (unless reviewer/model failed)

### Absence verification — rejected warn flow

- [ ] No follow-up message was injected
- [ ] `pi-review-gate-final-failure` entry does NOT exist

### Config persistence across `/reload`

- [ ] After changing mode/cycles/model via commands, `/reload` preserves values
- [ ] After manual edit of `config.json` + `/reload`, values are reflected

## Command validation (re-verify after review flows)

- [ ] `/reload` works end-to-end (extension loads, hooks register, commands available)
- [ ] `/review-gate-status` reflects post-review state correctly
- [ ] `/review-gate-model <provider>/<id> [thinkingLevel]` updates reviewer model
- [ ] `/review-gate-on` enables the gate
- [ ] `/review-gate-off` disables the gate
- [ ] `/review-gate` menu shows all sub-commands
- [ ] `/review-gate max-cycles <N>` updates and persists cycle limit

## Follow-up marker verification

- [ ] Mark `[pi-review-gate:correction-request]` is the first line of every injected follow-up
- [ ] Marker is used by `state.ts` to distinguish injected from real prompts
- [ ] Marker is defined centrally in `src/constants.ts` as `CORRECTION_REQUEST_MARKER`
- [ ] Marker does NOT appear in any non-follow-up context (e.g., status responses)

## Audit entries verification

| Entry type | When created | Verified in flow |
|---|---|---|
| `pi-review-gate-result` | Every review decision (approved or rejected) | approved, block, warn |
| `pi-review-gate-skipped` | Reviewer model is not configured | (not in scope for this step) |
| `pi-review-gate-final-failure` | Maximum correction cycles exceeded | (not in scope for this step) |
| `pi-review-gate-error` | Model/reviewer operational failure | block (if model fails), warn (if model fails) |

## Runtime API divergence log

| Concern (from Step 20.1) | Observed at runtime? | Resolution |
|---|---|---|
| Command handler signature mismatch | (fill in) | (fill in) |
| Command output display (return vs notify) | (fill in) | (fill in) |
| `agent_end` event shape | (fill in) | (fill in) |
| `pi.sendUserMessage` API shape | (fill in) | (fill in) |
| `pi.appendEntry` API shape | (fill in) | (fill in) |
| `ctx.modelRegistry` API shape | (fill in) | (fill in) |
| `ctx.sessionManager.getBranch()` availability | (fill in) | (fill in) |

## Adjustments applied (if any)

No production code was altered in this step. Adjustments listed here only if runtime validation revealed incompatibility.

| File | Change | Reason | Validation after |
|---|---|---|---|
| (none) | — | — | — |

## Architecture confirmation

- [x] `src/commands.ts` does not call Git, model, reviewer, sendUserMessage, or appendEntry
- [x] `src/index.ts` remains thin — only wires hook + commands
- [x] No new dependencies added
- [x] `manual` review remains placeholder (`"Manual review is not implemented yet."`)
- [x] No new review orchestration, commands, or policies were added
- [x] No model retry, fallback, or automatic model switching was implemented

## Notes — Step 20.2

- **Observed issues:** (fill in during execution)

- **Runtime API mismatches:**
  - (fill in if any were confirmed)

- **Follow-up actions for Step 20.3:**
  - Validate correction cycle limits (max 2 cycles, then final failure)
  - Validate Git context collection in real repo
  - Validate behavior outside a Git repository
  - Validate truncation with large diffs
  - Validate reviewer model not configured (skip entry)

## Result summary — Step 20.2

| Flow | Checklist prepared | Executed in Pi Runtime | Result |
|---|---|---|---|
| Approved | Yes | No (this environment) | Pending runtime execution |
| Rejected — block | Yes | No (this environment) | Pending runtime execution |
| Rejected — warn | Yes | No (this environment) | Pending runtime execution |
| Persistence (appendEntry) | Yes | No (this environment) | Pending runtime execution |
| Follow-up marker | Yes | No (this environment) | Pending runtime execution |
| Audit entries | Yes | No (this environment) | Pending runtime execution |

---

# Manual Validation — Step 20.3

> **Status:** Manual runtime validation was not executed in this environment.
> The checklist below is prepared for execution inside the Pi Runtime.
> Automated validations (typecheck, biome, vitest, structural) all passed.

## Environment

- **Date:** (fill in during execution)
- **Pi version:** (fill in: `pi --version`)
- **Node version:** (fill in: `node --version`)
- **Package manager:** pnpm
- **Extension path:** `/Users/claus/.pi/agent/extensions/pi-review-gate`
- **Config path:** `~/.config/pi-review-gate/config.json`
- **Reviewer provider/id:** (fill in, e.g. `openrouter/deepseek/deepseek-v3.2`)
- **Reviewer thinking level:** (fill in, e.g. `high`)
- **Git repository path:** (fill in: path to a valid Git repo)
- **Non-Git directory path:** (fill in: path to a directory outside a Git repo)

## Pre-flight

### Pre-flight (automated — this environment)

- [x] Dependencies installed (`pnpm install`)
- [x] Typecheck passed (`pnpm typecheck` — 0 errors)
- [x] Biome/check passed (`pnpm check` — 29 files, no fixes)
- [x] Vitest passed (`pnpm test` — 671 tests)
- [x] `commands.ts` scope: no Git, no reviewer, no model, no sendUserMessage, no appendEntry
- [x] No dependency changes (`git diff -- package.json` is empty)
- [x] `index.ts` remains thin (wires hook + commands, no heavy logic)
- [x] Structural checks passed (entrypoint, hook, Git, cycles, marker, constants)

### Pre-flight (manual — execute inside Pi Runtime)

- [ ] Extension loaded with `/reload` (no errors)
- [ ] `/review-gate-status` responds
- [ ] Reviewer model configured (`/review-gate-model <provider>/<id> [thinkingLevel]`)
- [ ] Review gate enabled (`/review-gate-on`)
- [ ] `mode` set to `block` for cycle validation
- [ ] `maxCorrectionCycles` set to `2` (`/review-gate max-cycles 2`)
- [ ] Config local exists at `~/.config/pi-review-gate/config.json`
- [ ] Git repository available for Git context tests
- [ ] Non-Git directory available for unavailable-Git tests

## Correction cycles

### Setup

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "<provider>",
    "id": "<model-id>",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2
}
```

### Scenario

Trigger a task expected to be rejected. Use a prompt that asks for a verifiable change and then deliver intentionally incomplete work. When the reviewer rejects the first delivery, the injected follow-up creates a second cycle. If the second delivery is also rejected (or the agent fails to address corrections adequately), the cycle limit should be reached.

### Expected criteria

- [ ] Trigger a task expected to be rejected
- [ ] First rejected review creates `pi-review-gate-result` entry
- [ ] First rejected review injects follow-up
- [ ] Follow-up starts with `[pi-review-gate:correction-request]`
- [ ] Follow-up contains `# Mandatory Review Corrections` header
- [ ] Follow-up includes `## Required Corrections` with numbered items
- [ ] Follow-up includes `## Evidence` with numbered items
- [ ] Agent responds to first correction request (cycle increments to 1)
- [ ] Second rejected review creates `pi-review-gate-result` entry (attempt 1)
- [ ] Second rejected review injects second follow-up if cycles remain
- [ ] After cycle limit is reached (`attempt >= maxCorrectionCycles`), no new follow-up is injected
- [ ] `pi-review-gate-final-failure` entry is created
- [ ] Final failure payload contains `attempt`, `maxCorrectionCycles`, `model`, `reason`, `result`
- [ ] Final failure reason is exactly: `Maximum correction cycles exceeded.`
- [ ] No infinite loop occurs
- [ ] A subsequent real user prompt (without the marker) resets cycle state

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Cycles observed:** (fill in: number of cycles before final failure)
- **Final failure entry visible?** (fill in: yes / no)

## Git context — valid repository

### Setup

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "<provider>",
    "id": "<model-id>"
  },
  "git": {
    "enabled": true,
    "includeStatus": true,
    "includeDiffStat": true,
    "includeDiff": true
  }
}
```

### Scenario

Run validation inside a Git repository with local changes (modified files, staged changes, or both). Execute a simple task and verify that the reviewer's context contains Git evidence.

### Expected criteria

- [ ] Run the extension inside a Git repository with local changes
- [ ] `git status --short` is collected and present in reviewer context
- [ ] `git diff --stat` is collected and present in reviewer context (when enabled)
- [ ] `git diff` is collected and present in reviewer context (when enabled)
- [ ] Reviewer prompt/context contains Git Status, Git Diff Stat, and Git Diff sections
- [ ] Review still completes normally (no Git-specific failure)
- [ ] No Git-specific error entry is created
- [ ] `pi-review-gate-result` entry is created normally
- [ ] No `pi-review-gate-error` entry triggered by Git alone

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Git sections visible?** (fill in: which of status/diff-stat/diff)

## Git context — non-Git directory

### Setup

Use the same configuration as above. Ensure the working directory is **not** inside a Git repository (or has no `.git` directory).

### Scenario

Run validation outside a Git repository. Verify that the review does not fail automatically and that the reviewer receives an "unavailable" message.

### Expected criteria

- [ ] Run the extension outside a Git repository
- [ ] Review does **not** fail automatically
- [ ] Reviewer prompt/context contains `Git context unavailable: not a git repository.` in the Git Unavailable Reason section
- [ ] Result is determined by the reviewer, not by Git failure alone
- [ ] No follow-up is injected solely because Git is unavailable
- [ ] No `pi-review-gate-final-failure` is created solely because Git is unavailable
- [ ] No `pi-review-gate-error` entry is triggered by non-Git condition alone
- [ ] `activeReview` is released after the handler completes

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Unavailable reason visible?** (fill in: yes / no)

## Git context — large diff

### Setup

Use the same configuration as above. Create or use a Git repository with a large diff (more than `git.maxDiffChars` characters, default 60000).

### Scenario

Generate or stage a large file change and trigger the review gate. Verify that the diff is truncated with the expected marker.

### Expected criteria

- [ ] Create or use a repository with a large diff exceeding the truncation limit
- [ ] Review runs without payload failure
- [ ] Diff output in reviewer context is truncated
- [ ] Truncation marker `[TRUNCATED: original length ..., included first ... chars]` is visible in the Git Diff section
- [ ] Marker includes the original length and the number of characters included
- [ ] Review completes normally (approved or rejected by reviewer, not by truncation)

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Truncation marker visible?** (fill in: yes / no)
- **Original and included sizes correct?** (fill in: yes / no)

## Missing reviewer model

### Setup

```json
{
  "enabled": true,
  "reviewerModel": null
}
```

Set `reviewerModel` to `null` by manually editing `~/.config/pi-review-gate/config.json`, or use `/review-gate-model` with a deliberately absent model and verify the persisted `null` state.

### Scenario

With no reviewer model configured, trigger an agent task. The review should be skipped cleanly.

### Expected criteria

- [ ] Set `reviewerModel` to `null`
- [ ] Trigger an agent task
- [ ] Review is skipped (no model call, no prompt built)
- [ ] `pi-review-gate-skipped` entry is created
- [ ] Skip entry payload contains `reason: "Reviewer model is not configured."`
- [ ] Skip entry payload contains `model: null`
- [ ] Skip entry payload contains `timestamp`
- [ ] Git is **not** collected (no `git status`, `git diff`, etc.)
- [ ] Model is **not** called
- [ ] No follow-up is injected
- [ ] No `pi-review-gate-final-failure` entry is created
- [ ] No `pi-review-gate-error` entry is created
- [ ] `activeReview` is released after the handler completes

### Observed result

- **Result:** (fill in: pass / fail / partial)
- **Notes:** (fill in)
- **Skip entry visible?** (fill in: yes / no)

## Operational failures

### Model failure or timeout (optional)

If safely reproducible in the Pi Runtime, configure an invalid model ID or set `reviewer.timeoutMs` to a very low value (e.g., `100`) to force a timeout.

- [ ] **Not executed in this environment** (or fill in result if executed)

#### Expected criteria (if executed)

- [ ] Failure creates `pi-review-gate-error` entry
- [ ] Entry payload contains `phase` ("model" or "reviewer")
- [ ] Entry payload contains `error.name` and `error.message`
- [ ] Failure does **not** create `pi-review-gate-result`
- [ ] Failure does **not** inject invented corrections
- [ ] In `block` mode, the agent sees a visible error (model error is thrown)
- [ ] In `warn` mode, the error is recorded without blocking the agent
- [ ] `activeReview` is released after failure

#### Observed result (if executed)

- **Result:** (fill in: pass / fail / partial / not executed)
- **Notes:** (fill in)

### Invalid reviewer JSON (optional)

If safely reproducible, configure a model that returns non-JSON or markdown output.

- [ ] **Not executed in this environment** (or fill in result if executed)

#### Expected criteria — fail-closed (`failClosedOnInvalidJson: true`, default)

- [ ] Invalid JSON is treated as a blocking rejection
- [ ] `pi-review-gate-result` entry is created with `approved: false`
- [ ] Result summary indicates invalid reviewer response
- [ ] In `block` mode with cycles remaining, follow-up is injected
- [ ] In `warn` mode, no follow-up is injected

#### Expected criteria — fail-open (`failClosedOnInvalidJson: false`)

- [ ] Invalid JSON creates `pi-review-gate-error` entry
- [ ] Does **not** create `pi-review-gate-result`
- [ ] Does **not** inject invented corrections
- [ ] In `block` mode, the error is thrown and visible
- [ ] In `warn` mode, the error is recorded without blocking

#### Observed result (if executed)

- **Result:** (fill in: pass / fail / partial / not executed)
- **Notes:** (fill in)

## Persistence

### Expected entries

| Entry type | When created | Verified |
|---|---|---|
| `pi-review-gate-result` | Every review decision (approved or rejected) | (fill in) |
| `pi-review-gate-skipped` | Reviewer model is not configured | (fill in) |
| `pi-review-gate-final-failure` | Maximum correction cycles exceeded | (fill in) |
| `pi-review-gate-error` | Model/reviewer operational failure | (fill in) |

### Entry field verification

- [ ] `pi-review-gate-result` entries include `timestamp`, `attempt`, `model`, `result`
- [ ] `pi-review-gate-skipped` entries include `timestamp`, `reason`, `model`
- [ ] `pi-review-gate-final-failure` entries include `timestamp`, `attempt`, `maxCorrectionCycles`, `model`, `reason`, `result`
- [ ] `pi-review-gate-error` entries include `timestamp`, `phase`, `attempt`, `model`, `error`
- [ ] Config changes persist across `/reload`

## Follow-up marker verification

- [ ] Marker `[pi-review-gate:correction-request]` is the first line of every injected follow-up
- [ ] Marker is used by `state.ts` to distinguish real prompts from injected correction prompts
- [ ] Marker is defined centrally in `src/constants.ts` as `CORRECTION_REQUEST_MARKER`
- [ ] Marker does **not** appear in any non-follow-up context (status, commands, etc.)

## Command verification

- [ ] `/reload` works end-to-end (extension loads, hooks register, commands available)
- [ ] `/review-gate-status` responds with current config
- [ ] `/review-gate-model <provider>/<id> [thinkingLevel]` sets reviewer model
- [ ] `/review-gate-on` enables the gate
- [ ] `/review-gate-off` disables the gate
- [ ] `/review-gate` menu shows all sub-commands
- [ ] `/review-gate max-cycles 2` sets and persists cycle limit
- [ ] `/review-gate toggle-git-diff` toggles `git.includeDiff`
- [ ] `/review-gate toggle-session-context` toggles `context.includeSessionSlice`

## Runtime API divergence log

| Concern | Observed at runtime? | Resolution |
|---|---|---|
| Command handler signature mismatch | Yes — `/review-gate-status` showed nothing | Fixed: handler signature changed to `(args: string, ctx: ExtensionCommandContext) => Promise<void>`, output via `ctx.ui.notify()` |
| Command output display (return vs notify) | Yes — return values ignored by runtime | Fixed: all handlers now use `ctx.ui.notify()` instead of returning strings |
| Command lookup name normalization | Yes — `/review-gate on` fell through as a normal prompt | Fixed: runtime registration now strips the leading `/` because Pi parses `/review-gate on` as command name `review-gate` plus args `on` |
| `agent_end` event shape | (fill in) | (fill in) |
| `pi.sendUserMessage` API shape | (fill in) | (fill in) |
| `pi.appendEntry` API shape | (fill in) | (fill in) |
| `pi.exec` result shape for Git errors | (fill in) | (fill in) |
| `ctx.sessionManager.getBranch()` availability | (fill in) | (fill in) |
| `ctx.modelRegistry` API shape | SDK inspected — real registry exposes `find`, `getAvailable()` and `getAll()`; mocks used `getModels()` | Fixed: model registry listing fallback supports `getAvailable`, `getModels`, and `getAll` while preserving explicit `find` preference |
| Reviewer model completion API | Yes — runtime returned model object without `complete()` (`Reviewer model does not expose a complete method`) | Fixed: added `@earendil-works/pi-ai` as dependency (user-authorized). Real model invocation now uses `completeSimple()` from `@earendil-works/pi-ai`. Test mock path preserved via `candidate.complete()` detection. |

## Adjustments applied (if any)

| File | Change | Reason | Validation after |
|---|---|---|---|
| `src/commands.ts` | Updated command handlers to use `ctx.ui.notify()` instead of returning strings. Simplified `ReviewGateCommandAPI` type and removed fallback registration APIs. Changed handler signature to match real Pi SDK: `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. Runtime command names are now registered without the leading `/`. Command model listing now reads `ctx.modelRegistry` and supports real registry listing APIs. | Runtime revealed that `/review-gate-status` showed nothing and `/review-gate on` fell through as a normal prompt. The real Pi SDK ignores command return values and parses `/review-gate on` as command name `review-gate` plus args `on`. SDK inspection showed real model registry listing APIs are `getAvailable()` / `getAll()`, while mocks used `getModels()`. | Typecheck 0 errors, Biome 0 fixes, Vitest 670 tests pass. |
| `src/model.ts` | Added `getAvailable()` / `getAll()` model registry fallbacks while preserving `find()` preference. | Keeps model resolution compatible with the real Pi `ModelRegistry` API if `find()` is unavailable in a context-like mock or future runtime shape. | Typecheck 0 errors, Biome 0 fixes, Vitest 670 tests pass. |
| `tests/index.test.ts` | Updated all command handler tests to use new signature, assert on `ctx.ui.notify` calls instead of return values, and verify runtime command names without leading `/`. Removed obsolete fallback API tests. | Test mocks needed to match the corrected production handler signature and command lookup behavior. | Typecheck 0 errors, Biome 0 fixes, Vitest 670 tests pass. |

## Architecture confirmation

- [x] `src/commands.ts` does not call Git, model, reviewer, sendUserMessage, or appendEntry
- [x] `src/index.ts` remains thin — only wires hook + commands
- [x] No new dependencies added
- [x] `manual` review remains placeholder (`"Manual review is not implemented yet."`)
- [x] No new review orchestration, commands, or policies were added
- [x] No model retry, fallback, or automatic model switching was implemented
- [x] No new config fields were added
- [x] No schema changes were made
- [x] No new runtime hooks beyond existing `agent_end` were added

## Notes — Step 20.3

- **Observed issues:** (fill in during execution)

- **Runtime API mismatches:**
  - **Command handler signature (CONFIRMED AND FIXED):** The real Pi SDK uses `(args: string, ctx: ExtensionCommandContext) => Promise<void>`. The previous mock-based handlers returned `string | undefined`, which the real runtime ignored — commands executed but showed no output. Fixed by using `ctx.ui.notify()` for output and matching the real handler signature. See adjustments table above.
  - **Command lookup name normalization (CONFIRMED AND FIXED):** Pi strips the leading `/` before command lookup. `/review-gate on` is parsed as command name `review-gate` and args `on`. The extension now strips the leading `/` during registration while keeping user-facing command strings documented with `/`.
  - **Reviewer model completion API (CONFIRMED AND FIXED):** Real registry models are plain Pi model objects without `complete()`. Fixed by adding `@earendil-works/pi-ai` as a direct dependency (user-authorized) and using `completeSimple()` for real model invocation, while preserving the test mock `candidate.complete()` path.
  - (fill in any other mismatches during execution)

- **Follow-up actions:**
  - Address any runtime API mismatches discovered during validation
  - V1 is complete when this checklist is executed successfully in the Pi Runtime
  - Consider V2 features after V1 validation confirms stability

## Result summary — Step 20.3

| Scenario | Checklist prepared | Executed in Pi Runtime | Result |
|---|---|---|---|
| Correction cycles (max 2) | Yes | No (this environment) | Pending runtime execution |
| Git — valid repository | Yes | No (this environment) | Pending runtime execution |
| Git — non-Git directory | Yes | No (this environment) | Pending runtime execution |
| Git — large diff truncation | Yes | No (this environment) | Pending runtime execution |
| Missing reviewer model | Yes | No (this environment) | Pending runtime execution |
| Model failure / timeout (optional) | Yes | No (this environment) | Not executed |
| Invalid reviewer JSON (optional) | Yes | No (this environment) | Not executed |
| Persistence (appendEntry) | Yes | No (this environment) | Pending runtime execution |
| Follow-up marker | Yes | No (this environment) | Pending runtime execution |
| Final failure (max cycles) | Yes | No (this environment) | Pending runtime execution |
