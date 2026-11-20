---
inclusion: always
---

# Technical Conventions: Spooky Break Reminder

Source of truth: `.kiro/specs/spooky-break-reminder/design.md` and `requirements.md`. Requirement numbers below refer to `requirements.md`.

## Stack

- TypeScript with `strict: true` in `tsconfig.json`. Preact with JSX (`jsx: react-jsx` with `jsxImportSource: preact`), `@preact/signals` for shared state.
- Vite with `@preact/preset-vite`. `vite.config.ts` sets `base: '/spooky-break-reminder/'`.
- Vitest for unit and property tests, fast-check for property-based tests, happy-dom for the few component tests.
- Node 24 in CI. Do not add a runtime dependency without a reason that the design supports. Validation uses the hand-written validators generated from `SETTINGS_SPEC`, so do not add zod, valibot or similar.

## Commands on Windows

- Use `npm.cmd` and `npx.cmd`. Windows PowerShell blocks `npm.ps1` under the default execution policy.
- Chain commands with `;` in PowerShell. Do not use `&&`.
- Scripts in `package.json`: `dev`, `build`, `preview`, `typecheck`, `test` (`vitest run`), `check:kiro`, `check:i18n`, `verify:deploy`.
- `npm.cmd run test` runs `vitest run`, which is non-watch. Never use watch mode in a script, a hook or a CI step.
- Commit `package-lock.json`. The pipeline runs `npm ci`.

## Pure core rule

- `src/core` contains the schedule, the escalation, the continuity classifier, the Rituals, the policies, settings, persistence and the RNG.
- `src/core` must not import from `src/platform`, `src/ui` or `src/effects`. A Vitest import-boundary test scans `src/core` and fails on such an import (task 5.13).
- `src/core` never reads `Date.now()`, `performance.now()` or `Math.random()`. It never touches the DOM and never schedules timers.
- Core functions take explicit durations and return new state. Example: `advance(state, dt, cfg)` returns `{ state, events }`.
- Randomness comes only from the seeded RNG in `src/core/rng.ts`, used for crack layouts and Whisper delays.
- Platform adapters inject `wall()` and `mono()`. Only `src/app/engine.ts` calls `dispatch`.

## Time

- Every duration and timestamp is an integer number of milliseconds. Round to integer milliseconds at the boundary where a value enters the core.
- Schedule time = wall-clock delta x speed, where speed is 1 normally and 60 in Demo_Mode (`SPEED`).
- A backward wall-clock step adds zero schedule time (`scheduleDelta` clamps to 0, Requirement 1.6 and 14.7).
- Constants from `src/core/time.ts`:
  - `GAP_TOLERANCE_MS = 45_000`. The longest gap that counts as continuous running time. It is below the smallest Natural_Break_Duration of 1 minute.
  - `UNOBSERVED_GAP_LIMIT_MS = 3_600_000`. An Intervention_Signal can count at most 60 minutes as elapsed.
  - `SUSPEND_EVIDENCE_MS = 30_000`.
  - `HEARTBEAT_MS = 30_000`. Persistence heartbeat (Requirement 14.1).
- Rituals, countdowns and Whisper scheduling use wall-clock time in every mode (Requirement 25.4). Ritual state machines are pure, so the shell passes them monotonic timestamps read from `performance.now()`. Whispers are scheduled on the `AudioContext` clock.
- Wake-up cadence: visible document uses `setTimeout` clamped to 16 to 1000 ms. Hidden document uses the Worker metronome every 10 s, with main-thread timers as a backup.

## Scheduler invariants

- `advance` splits the duration at every boundary (Due_Time, Snooze end, Pause end). One call with `D` equals any partition of `D` into chunks (Property 1).
- `configChanged` clamps Work_Elapsed to the new Work_Interval and Break_Counter to `frequency - 1`. A running Haunting keeps its Escalation_Step and Snooze_Duration snapshots.
- Snooze only accrues overdue time. It never pauses it (Requirement 11.3).
- A Ritual freezes Overdue_Duration (Requirement 3.4).

## Storage and persistence

- All data is in `localStorage`. Keys use the prefix `sbr:v1:`. Demo_Mode keys use `sbr:v1:demo:`.
- Every stored record uses the envelope `{ "v": 1, "kind": "<kind>", "data": { ... } }`. Another version, kind or shape is invalid.
- `parseStored` returns null on any violation. Invalid stored data loads the defaults, starts a new Work_Interval and raises the reset notice (task 10.4).
- A probe write at startup detects unavailable storage. A quota error switches to an in-memory map and shows the "changes will not be saved" notice.
- Erase-all removes every key that starts with `sbr:`.

## Internationalization

- Every user-facing string goes through `t(key, params)` in `src/i18n/index.ts`. Do not hard-code English or Chinese text in components.
- `MessageKey = keyof typeof en`. The English file is the reference set.
- `en.json` and `zh-CN.json` must have identical key sets. `npm.cmd run check:i18n` enforces this (Requirement 20.1, 29.9).
- A missing key in the active language falls back to English (Requirement 20.6). Language detection maps any `zh` prefix to `zh-CN`.
- Set the `lang` attribute on every document that renders the UI, including the Ghost_Window.

## Browser APIs and origins

- No third-party origins. Scripts, styles, fonts, images, audio and the favicon load from the App's own origin (Requirement 21.8). No CDN, no analytics, no external font host.
- Build every asset URL under `/spooky-break-reminder/`. The metronome Worker uses `new Worker(new URL('./metronome.worker.ts', import.meta.url), { type: 'module' })` so Vite emits it under the base path.
- Feature-detect every browser API (Freeze/resume, `wasDiscarded`, Idle Detection, Document Picture-in-Picture, Web Locks). An absent signal reports `'none'`.
- Adapter errors (audio, notifications, Ghost_Window) are caught at the adapter boundary and logged. They never stop the engine.
- Single active tab uses `navigator.locks` with `ifAvailable` and `steal`. Demo_Mode uses a different lock name.
- Animate only `opacity` and `transform`. Schedule `requestAnimationFrame` only while a channel moves and the document is visible.

## Tests

- Example unit tests go in `tests/*.test.ts`. Property tests go in `tests/*.prop.test.ts`.
- Each property in the design has exactly one fast-check test. Tag it with a comment in this form: `// **Feature: spooky-break-reminder, Property {number}: {property text}**`. Add `**Validates: Requirements x.y**` next to it.
- Run core properties with `{ numRuns: 200 }`. Use `{ numRuns: 100 }` for the Flash_Guard and the fog coverage sampling.
- Shared generators `arbConfig`, `arbState` and `arbEvents` live in `tests/arbitraries.ts`. Property-specific generators stay in their own test file.
- Generators must respect the input space. `arbState` folds `arbEvents` from the initial state so that every generated state is reachable. Bias time generators toward the boundaries, such as exactly the remaining Work_Interval.
- Property tests use real core functions and no mocks. Use fake clocks (`vi.useFakeTimers()`) and hand-written fakes for `Notification`, `IdleDetector`, `navigator.locks`, `AudioContext` and storage only in example tests.
- Use `happy-dom` per file with a `// @vitest-environment happy-dom` comment. The default environment is `node`.
- The Test_Suite must never be empty, because `vitest run` exits 1 when it finds no test files.
- Do not write tests that pass by faking the behavior under test. Tests run the real code.

## Build and deployment

- CI order: `check:kiro`, `check:i18n`, `typecheck`, `test`, `build`, then deploy. A failing step stops the deployment.
- Do not change the `.gitignore` file so that it matches anything under `.kiro`. The Kiro_Guard checks this.
- Do not run `git config`. The agent does not set the git identity.
