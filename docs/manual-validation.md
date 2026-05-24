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

- [ ] Extension installed/linked into Pi runtime
      (Run `pnpm link` or symlink into Pi extension directory)
- [ ] `/reload` executed
- [ ] No load error shown (check for TypeError, import failures)
- [ ] `agent_end` hook registration does not throw
      (Trigger an agent cycle and confirm no crash)

## Commands

### Direct commands

- [ ] `/review-gate-status` responds with status text including: enabled, mode, reviewer model, max correction cycles, context, git, reviewer
- [ ] `/review-gate-on` responds with "Review gate enabled." and persists `enabled: true`
- [ ] `/review-gate-off` responds with "Review gate disabled." and persists `enabled: false`
- [ ] `/review-gate-model` (no args) responds: lists models if registry available, or clear message if unavailable
- [ ] `/review-gate-model <provider>/<id> [thinkingLevel]` persists reviewer model when valid
- [ ] `/review-gate` (no args) shows menu with available sub-commands

### Menu sub-commands (via `/review-gate <sub-command>`)

- [ ] `/review-gate status` works (alias of `/review-gate-status`)
- [ ] `/review-gate on` works (alias of `/review-gate-on`)
- [ ] `/review-gate off` works (alias of `/review-gate-off`)
- [ ] `/review-gate model` works (alias of `/review-gate-model`)
- [ ] `/review-gate model <provider>/<id> [thinkingLevel]` persists reviewer model
- [ ] `/review-gate thinking <thinkingLevel>` sets thinking level on configured model
- [ ] `/review-gate max-cycles <number>` persists maxCorrectionCycles
- [ ] `/review-gate toggle-git-diff` toggles git.includeDiff
- [ ] `/review-gate toggle-session-context` toggles context.includeSessionSlice
- [ ] `/review-gate manual` returns "Manual review is not implemented yet."

## Config persistence

- [ ] Config file exists or is created at `~/.config/pi-review-gate/config.json`
- [ ] After `/review-gate-on`, config file contains `"enabled": true`
- [ ] After `/review-gate-off`, config file contains `"enabled": false`
- [ ] After `/review-gate-model <provider>/<id>`, `reviewerModel` is persisted
- [ ] After `/review-gate max-cycles <N>`, `maxCorrectionCycles` is persisted
- [ ] `/review-gate-status` reflects persisted values after changes
- [ ] After manual edit of config file + `/reload`, status reflects new values
- [ ] Config file permissions attempt `0600` (chmod) — may not apply on all platforms

## Model command specifics

- [ ] `/review-gate-model` (no args): lists models when model registry is available
- [ ] `/review-gate-model` (no args): returns "Model registry is not available." when no registry
- [ ] `/review-gate-model <provider>/<id>`: persists reviewerModel when model found in registry
- [ ] `/review-gate-model <provider>/<id>`: returns "Reviewer model not found: ..." when model not in registry
- [ ] `/review-gate-model <provider>/<id> <thinkingLevel>`: persists with thinking level
- [ ] Invalid thinking level returns clear error

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
