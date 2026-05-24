# pi-review-gate

## Overview

`pi-review-gate` is an extension for the Pi Extension Runtime. It reviews the coding agent's work at the end of each session cycle via the `agent_end` hook, using a separate reviewer model.

In `block` mode, a rejection injects a mandatory correction follow-up that the agent must address. In `warn` mode, a rejection is persisted and optionally notified without blocking the agent.

The goal is to reduce incomplete, incorrect, or unvalidated deliveries.

## What it does

- Registers the `agent_end` hook to run after each agent response cycle.
- Collects context from the current delivery (`event.messages`).
- Collects Git context (status, diff stat, diff) when enabled.
- Assembles a review context and calls a separately configured reviewer model.
- Validates the reviewer's structured JSON response.
- Persists results via `pi.appendEntry`.
- Injects a mandatory correction follow-up in `block` mode when the review is rejected.
- Respects a configurable maximum correction cycle limit.
- Exposes `/review-gate*` commands for status inspection and configuration.

## What it does not do

- Does not visually block the agent's first final response.
- Does not execute commands suggested by the reviewer.
- Does not perform multi-agent review.
- Does not perform full semantic analysis of the entire repository.
- Does not send the entire session by default.
- Does not retry model calls automatically.
- Does not switch models automatically.
- Does not implement real manual review in V1 (`/review-gate manual` is a placeholder).
- Does not replace tests or CI.

## Installation

```bash
pnpm install
pnpm typecheck
pnpm check
pnpm test
```

The extension must be loaded into the Pi Extension Runtime following the user's environment setup. The exact local installation or linking step depends on the Pi Extension Runtime setup. After the extension is installed in the runtime, run `/reload`.

## Loading in Pi

`pi-review-gate` is declared as a Pi extension in `package.json`:

```json
{
  "name": "pi-review-gate",
  "main": "./src/index.ts",
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

After local installation or linking, run `/reload` in Pi. Then verify that the following commands are available:

- `/review-gate-status`
- `/review-gate-model`
- `/review-gate-on`
- `/review-gate-off`
- `/review-gate`

## Configuration

The configuration file is stored at:

```
~/.config/pi-review-gate/config.json
```

### Configuration fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Master enable/disable switch. |
| `mode` | `"block" \| "warn"` | `"block"` | Review enforcement mode. |
| `reviewerModel` | `object \| null` | `null` | Reviewer model config. Must be set for review to run. |
| `reviewerModel.provider` | `string` | — | Provider identifier (required when set). |
| `reviewerModel.id` | `string` | — | Model identifier (required when set). |
| `reviewerModel.thinkingLevel` | `string` | `undefined` | Thinking level: `off`, `minimal`, `low`, `medium`, `high`, or `xhigh`. |
| `maxCorrectionCycles` | `number` | `2` | Maximum correction cycles before final failure. |
| `context.includeEventMessages` | `boolean` | `true` | Include the current cycle's serialized messages. |
| `context.includeSessionSlice` | `boolean` | `true` | Include session entries since the last real user message. |
| `context.maxSessionEntries` | `number` | `40` | Maximum session entries in the slice. |
| `git.enabled` | `boolean` | `true` | Enable Git context collection. |
| `git.includeStatus` | `boolean` | `true` | Include `git status --short` output. |
| `git.includeDiffStat` | `boolean` | `true` | Include `git diff --stat` output. |
| `git.includeDiff` | `boolean` | `true` | Include `git diff` output. |
| `reviewer.timeoutMs` | `number` | `120000` | Model request timeout in milliseconds. |
| `reviewer.requireJson` | `boolean` | `true` | Require JSON response from reviewer. |
| `reviewer.failClosedOnInvalidJson` | `boolean` | `true` | If `true`, invalid JSON produces a blocking rejection. If `false`, an error is thrown. |
| `ui.notifyOnPass` | `boolean` | `true` | Notify when review passes (when notification API is available). |
| `ui.notifyOnFail` | `boolean` | `true` | Notify when review fails or errors occur. |
| `ui.showReviewerSummary` | `boolean` | `true` | Reserved for future UI support. |

### Minimal example

```json
{
  "enabled": true,
  "mode": "block",
  "reviewerModel": {
    "provider": "test-provider",
    "id": "test-model",
    "thinkingLevel": "high"
  },
  "maxCorrectionCycles": 2
}
```

A complete reference example is available at `examples/config.example.json`.

The `reviewerModel` must be configured for review to run. When `reviewerModel` is `null`, reviews are skipped and a skip entry is persisted.

## Commands

### Direct commands

| Command | Description |
|---------|-------------|
| `/review-gate` | Open the review gate menu. |
| `/review-gate-status` | Show current review gate configuration. |
| `/review-gate-model` | List available models or set the reviewer model. |
| `/review-gate-model <provider>/<id> [thinkingLevel]` | Set the reviewer model with optional thinking level. |
| `/review-gate-on` | Enable the review gate. |
| `/review-gate-off` | Disable the review gate. |

### Menu sub-commands

These are invoked via `/review-gate <sub-command>`:

| Sub-command | Description |
|-------------|-------------|
| `status` | Alias for `/review-gate-status`. |
| `on` | Alias for `/review-gate-on`. |
| `off` | Alias for `/review-gate-off`. |
| `model` | Alias for `/review-gate-model`. |
| `model <provider>/<id> [thinkingLevel]` | Set reviewer model via menu. |
| `thinking <thinkingLevel>` | Set thinking level on the already configured model. |
| `max-cycles <number>` | Set `maxCorrectionCycles` to a positive integer. |
| `toggle-git-diff` | Toggle `git.includeDiff` on or off. |
| `toggle-session-context` | Toggle `context.includeSessionSlice` on or off. |
| `manual` | Trigger a manual review (placeholder in V1). |

`/review-gate manual` is currently a placeholder in V1. It returns `"Manual review is not implemented yet."`. Manual review will be implemented in a future version.

## Review flow

1. `agent_end` is triggered by the Pi runtime.
2. Configuration is loaded from `~/.config/pi-review-gate/config.json`.
3. If `enabled` is `false`, the handler returns immediately.
4. If a review is already active (`state.activeReview` is `true`), the handler returns immediately.
5. The current user prompt is extracted from `event.messages`.
6. Cycle state is updated: a new real user prompt resets the cycle counter; a prompt containing the correction marker increments it.
7. If `reviewerModel` is `null`, a skip entry is persisted and the handler returns.
8. Git context is collected when enabled.
9. The session slice is obtained from `sessionManager.getBranch()` when `context.includeSessionSlice` is enabled.
10. A `ReviewContext` is assembled.
11. The reviewer model is called with stable system and user prompts.
12. The model response is parsed and validated as structured JSON.
13. The result is persisted via `pi.appendEntry` (entry type: `pi-review-gate-result`).
14. If approved, the handler returns without injecting a follow-up.
15. If rejected in `block` mode and cycles remain, a mandatory correction follow-up is injected via `pi.sendUserMessage`.
16. If rejected in `warn` mode, the result is persisted; a notification may be sent if configured. No follow-up is injected.
17. If the maximum correction cycles are exceeded, a final failure entry is persisted and no further follow-up is injected.
18. The `activeReview` guard is released in a `finally` block.

## Modes

### `block`

- Rejection generates a mandatory correction follow-up.
- The follow-up is sent with the marker `[pi-review-gate:correction-request]`.
- The correction cycle limit prevents infinite loops (default: 2).
- A model error in `block` mode is a visible failure; it does not silently approve.

### `warn`

- Rejection does **not** inject a follow-up.
- The result is persisted via `pi.appendEntry`.
- A notification may be sent when the notification API is available and `ui.notifyOnFail` is enabled.
- A model error in `warn` mode is logged but does not block the agent.

## Correction cycles

- Default maximum correction cycles: `2`.
- Controlled by `maxCorrectionCycles` in the configuration.
- Cycles are associated with the `[pi-review-gate:correction-request]` marker.
- A new real user prompt (without the marker) resets the cycle counter to `0`.
- A prompt containing the correction marker increments the cycle counter by `1`.
- When the cycle counter reaches `maxCorrectionCycles`, no further follow-up is injected.
- A final failure entry (`pi-review-gate-final-failure`) is persisted with reason:

```
Maximum correction cycles exceeded.
```

## Follow-up marker

The follow-up message injected by the review gate always starts with:

```
[pi-review-gate:correction-request]
```

This marker:

- Appears as the first line of the injected follow-up.
- Identifies prompts injected by the extension.
- Is used to distinguish correction prompts from real user prompts for cycle state purposes.
- Must not be changed without updating tests and state logic.

## Git context

The extension collects Git context using only fixed commands:

- `git status --short`
- `git diff --stat`
- `git diff`

Configuration flags control which commands run:

- `git.includeStatus` — controls `git status --short`
- `git.includeDiffStat` — controls `git diff --stat`
- `git.includeDiff` — controls `git diff`

Behavior:

- A non-Git directory does **not** automatically fail the review.
- Large outputs are truncated with a `[TRUNCATED: original length ..., included first ... chars]` marker.
- When Git is unavailable because the directory is not a repository, the context includes:

```
Git context unavailable: not a git repository.
```

- When Git collection is disabled in config, the context includes:

```
Git collection is disabled.
```

## Session context

- `event.messages` is the primary context source.
- The session slice is optional and controlled by `context.includeSessionSlice`.
- When enabled, the slice is filtered to start from the last real user message (messages with the correction marker are ignored as real user prompts).
- The entire session is **not** sent by default.
- `context.maxSessionEntries` limits the slice (default: 40).

## Persistence and audit entries

Results and operational events are persisted as session entries via `pi.appendEntry`:

| Entry type | When used |
|------------|-----------|
| `pi-review-gate-result` | Every review decision (approved or rejected). |
| `pi-review-gate-skipped` | Reviewer model is not configured (`reviewerModel` is `null`). |
| `pi-review-gate-final-failure` | Maximum correction cycles exceeded. |
| `pi-review-gate-error` | Operational failure in model invocation or reviewer processing. |

Each entry includes a timestamp, the attempt number, and the reviewer model used.

## Reviewer model

The reviewer model is separate from the main agent model. It is configured via:

```
/review-gate-model <provider>/<id> [thinkingLevel]
```

Examples:

```
/review-gate-model openrouter/deepseek/deepseek-v3.2 high
/review-gate-model test-provider/test-model
```

Valid thinking levels:

```
off
minimal
low
medium
high
xhigh
```

- The model is resolved from the Pi model registry. When the registry does not support direct lookup, the extension falls back to listing available models.
- When no reviewer model is configured (`reviewerModel` is `null`), reviews are skipped with a persisted entry — this does not block the agent.
- The reviewer model must support the `complete` method.

## Validation

### Automated

```bash
pnpm typecheck          # TypeScript type checking (tsc --noEmit)
pnpm check              # Biome lint and format check
pnpm test               # Vitest test suite
```

### Manual validation

A manual validation checklist covering `/reload`, command registration, config persistence, approved/block/warn agent_end flows, and runtime behavior is available at [`docs/manual-validation.md`](docs/manual-validation.md). This checklist is designed for execution inside the Pi Runtime after the extension is loaded.

**Step 20.2 status:** The validation checklist for approved, rejected-block, rejected-warn, persistence, follow-up marker, and audit entries has been prepared. Automated validations (typecheck, biome, vitest) passed with 0 errors. Manual runtime execution is pending — the checklist is ready for execution inside the Pi Runtime.

## Manual smoke test

1. Install dependencies: `pnpm install`.
2. Run typecheck: `pnpm typecheck`.
3. Run lint/format check: `pnpm check`.
4. Run tests: `pnpm test`.
5. Load or reload the extension in Pi: `/reload`.
6. Run `/review-gate-status` to inspect the current configuration.
7. Run `/review-gate-model` to list available models (requires model registry).
8. Configure a reviewer model: `/review-gate-model <provider>/<id>`.
9. Enable the gate: `/review-gate-on`.
10. Trigger a simple task expected to pass review.
11. Trigger a task expected to fail in `block` mode.
12. Confirm the rejection injects a follow-up starting with `[pi-review-gate:correction-request]`.
13. Change `mode` to `warn` in `~/.config/pi-review-gate/config.json`:
    ```json
    { "mode": "warn" }
    ```
14. Trigger a task expected to fail and confirm the rejected review does **not** inject a follow-up.
15. Test outside a Git repository and confirm the non-Git condition does not fail the review automatically.
16. Return configuration to `block` mode when done.

## Troubleshooting

### Extension does not load

- Run `/reload` in Pi.
- Verify the entrypoint in `package.json` (`main` and `pi.extensions`).
- Run `pnpm typecheck` and `pnpm test` to ensure the code is valid.

### Commands are missing

- Verify `/reload` was executed after installation.
- Verify that `registerCommands` runs in the extension entrypoint (`src/index.ts`).

### Review is skipped

- Most likely `reviewerModel` is `null`.
- Configure it with `/review-gate-model <provider>/<id>`.

### No follow-up appears

- Verify `mode` is `block` (warn mode does not inject follow-ups).
- Verify the reviewer actually rejected the delivery.
- Verify `maxCorrectionCycles` has not been exceeded.
- Verify the reviewer model is correctly configured.

### Git context unavailable

- Confirm the working directory is a Git repository.
- Check that `git.enabled` is `true` in the configuration.
- This condition does **not** automatically fail the review.

### Invalid reviewer JSON

- The reviewer model must return JSON only (no markdown, no prose).
- `failClosedOnInvalidJson` (default: `true`) controls behavior when JSON is invalid.
- When fail-closed, the invalid response is treated as a blocking rejection.

### Model call failed or timed out

- Review the configured model provider and ID.
- Check that the model is available in the Pi model registry.
- Review the configured `reviewer.timeoutMs` value (default: 120000ms).
- Model errors do not silently approve the delivery.

## V1 limitations

- No visual blocking of the agent's first final response (review happens after the response is delivered).
- Manual review (`/review-gate manual`) is a placeholder and not yet implemented.
- No automatic model retry on failure.
- No automatic provider or model fallback.
- No advanced dashboard or analytics.
- No multi-agent review.
- No full semantic analysis of the entire repository.
- No external CI integration.
- The exact Pi Extension Runtime API may require fine-tuning after manual validation.

## Development notes

### Architecture principles

- `src/index.ts` must remain thin — it only wires up the hook and commands.
- `src/model.ts` is the only module authorized to call a model.
- `src/follow-up.ts` must remain pure (no Pi runtime imports, no `sendUserMessage`).
- `src/git.ts` only executes fixed Git commands (`git status --short`, `git diff --stat`, `git diff`).
- `src/commands.ts` must not execute Git commands, call models, or run reviews directly.
- Tests use inline mocks of the Pi runtime — no external test harness is required.
- Biome is required for linting and formatting.
- Vitest is the test runner.
- Do not add dependencies unless strictly necessary.
