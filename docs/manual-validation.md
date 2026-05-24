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
