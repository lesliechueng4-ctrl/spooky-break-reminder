# Implementation Plan: Spooky Break Reminder

## Overview

The plan follows the milestones of Requirement 32.6 and de-risks deployment first. Milestone 1 (due 2026-11-21) puts a placeholder page on the Live_URL through the full Deployment_Pipeline. The Kiro_Guard runs in that pipeline and requires the three spec files, a Steering_Document and the three Agent_Hooks to be tracked by git, so those files are created and committed before the workflow file is committed and pushed. Milestone 2 (due 2026-11-27) builds the pure core (Scheduler state machine, escalation, `classifyGap`, Flash_Guard, Rituals) with fast-check property tests, then the platform adapters, the engine and the playable Calm -> Haunting -> Ritual loop. Milestone 3 (due 2026-11-30) adds notifications, the Ghost_Window, Nightmare_Mode, away detection, the single-tab rule, the language switch and accessibility. Milestone 4 (due 2026-12-01) writes the README and the Demo_Script. Milestone 5 (due 2026-12-03) publishes the Demo_Video. The entry is submitted by the internal target of 2026-12-04 06:00 Beijing time (Requirement 32.4), 24 hours before the Submission_Deadline of 2026-12-04 14:00 PST = 2026-12-05 06:00 Beijing time.

Implementation language: TypeScript (Vite, Preact, Vitest, fast-check), as in the design. Steps marked "Manual checkpoint (user)" need the user in the GitHub web UI, on YouTube or on the hackathon site; the coding agent stops there, asks the user to do the listed steps, and runs only the steps marked (agent).

## Tasks

- [x] 1. Scaffold the repository and the placeholder app (Milestone 1, due 2026-11-21)
  - [x] 1.1 Initialize git and the toolchain in the workspace root
    - (user) Before the first commit in task 2.5, set the git author identity (`git config --global user.name` and `user.email`, for example the GitHub noreply address); none is configured on this machine, and the agent does not change git config
    - Run `git init -b main` in the workspace root, which already contains `.kiro`; the branch must be `main` because the workflow triggers on `main` and the `github-pages` environment deploys only from the default branch
    - Create `package.json` (name `spooky-break-reminder`, `private`, `type: module`) with every script from the design table: `dev`, `build`, `preview`, `typecheck`, `test` (`vitest run`), `check:kiro`, `check:i18n`, `verify:deploy`
    - Install current stable `preact`, `@preact/signals`, and as dev dependencies `vite`, `@preact/preset-vite`, `typescript`, `vitest`, `fast-check`, `happy-dom`, using `npm.cmd install`; commit `package-lock.json` because the pipeline runs `npm ci`
    - Add `tsconfig.json` (strict, Preact JSX) and `vite.config.ts` with `base: '/spooky-break-reminder/'`, the Preact preset and a Vitest section (node environment by default; component tests opt into happy-dom per file)
    - Add `.gitignore` with `node_modules/`, `dist/`, `*.log`, `.env*` and no pattern that matches any path under `.kiro`
    - _Requirements: 26.1, 26.2, 27.4, 29.1_
  - [x] 1.2 Add the MIT LICENSE file at the repository root
    - Ask the user for the copyright holder name; write the MIT License text with the line `Copyright (c) 2026 <holder>`
    - _Requirements: 27.2_
  - [x] 1.3 Build the placeholder page
    - `index.html` with `lang="en"`, a title and the candle favicon from `public/icons/candle.svg`; `src/app/main.tsx` renders a static English placeholder (name, one-line pitch, a lit candle) with text contrast of at least 4.5:1
    - Create `src/i18n/locales/en.json` and `src/i18n/locales/zh-CN.json` with the placeholder strings and identical key sets
    - All assets are served from the App's own origin; run `npm.cmd run build` and confirm that `dist/index.html` references only `/spooky-break-reminder/` asset URLs
    - _Requirements: 21.8, 26.1, 26.2_
  - [x] 1.4 Implement the translation key parity check
    - `scripts/check-i18n.mjs` compares the key sets of `en.json` and `zh-CN.json`, prints the missing keys per file and exits 1 on a mismatch; export the comparison so tests can call it
    - `tests/i18n-parity.test.ts` runs the same comparison; it also keeps the Test_Suite non-empty, because `vitest run` exits 1 when it finds no test files
    - _Requirements: 20.1, 28.4, 29.1, 29.9_

- [ ] 2. Create the Kiro artifacts and the Kiro_Guard (Milestone 1)
  - [x] 2.1 Write the Steering_Documents
    - `.kiro/steering/product.md`: the mechanic, Office_Safe defaults and the horror-safety rules (no Jump_Scare outside Nightmare_Mode, at most 3 Flashes per second, Reduced_Motion, 4.5:1 contrast, audio only after a gesture, gain capped at Master_Volume)
    - `.kiro/steering/tech.md`: TypeScript strict, the pure-core rule (`src/core` imports nothing from `src/platform`, `src/ui` or `src/effects`), integer milliseconds, no third-party origins, `npm.cmd` / `npx.cmd` on Windows, property-test conventions
    - `.kiro/steering/structure.md`: the source layout from the design and where new code goes
    - _Requirements: 28.2_
  - [x] 2.2 Implement `scripts/kiro-guard.mjs`
    - Node script without dependencies, run by `npm.cmd run check:kiro`; every failed check prints its condition and the script exits 1
    - Checks from the design table: LICENSE content, `.gitignore` exists, no ignored path under `.kiro` (disk walk plus probe paths, `git check-ignore --no-index --stdin`, then `-v` to print `source:line:pattern`), at least one tracked file under `.kiro`, root commit dated after 2026-10-30 (skipped with a note on shallow clones), untracked `.kiro` files as a warning only
    - Required artifacts tracked by git: the three spec files, at least one Steering_Document and the three Agent_Hooks; find the hooks by the command each one runs (`run test`, `check:i18n`, `check:kiro`) through a text search of the tracked files under `.kiro/hooks/`, so the check accepts the file names and extensions (`.json` or `.kiro.hook`) that the Kiro hook tool produces
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 28.1, 28.2, 28.3, 28.4, 28.5_
  - [x] 2.3 Create the three Agent_Hooks with Kiro's hook creation tool
    - Use Kiro's hook creation tool or the Agent Hooks UI; do not hand-write the hook files
    - `run-tests-on-save`: trigger PostFileSave, matcher `src[\\/].*\.(ts|tsx)$`, command `npm.cmd run test`
    - `i18n-parity-on-save`: trigger PostFileSave, matcher `src[\\/]i18n[\\/]locales[\\/].*\.json$`, command `npm.cmd run check:i18n`
    - `kiro-guard-on-gitignore-save`: trigger PostFileSave, matcher `(^|[\\/])\.gitignore$`, command `npm.cmd run check:kiro`
    - _Requirements: 28.3, 28.4, 28.5_
  - [ ]* 2.4 Write unit tests for the Kiro_Guard
    - Run the guard against temporary git repositories created in the test: ignored `.kiro`, no tracked `.kiro` file, missing LICENSE, a valid repository
    - Never add a `.kiro` pattern to the real `.gitignore`, not even temporarily
    - _Requirements: 27.2, 27.4, 27.5, 27.6, 27.7_
  - [-] 2.5 Commit the scaffold and every file under `.kiro`, then run the guard
    - Commit the files of tasks 1.1-2.4 together with `.kiro/specs/spooky-break-reminder/` (requirements.md, design.md, tasks.md, .config.kiro), `.kiro/steering/` and `.kiro/hooks/`
    - `npm.cmd run check:kiro` exits 0; `git ls-files -- .kiro` lists the spec files, the steering files and the hook files
    - _Requirements: 27.3, 27.6, 28.1, 28.2, 28.3, 28.4, 28.5_

- [ ] 3. Build the Deployment_Pipeline and the Submission_Checklist (Milestone 1)
  - [x] 3.1 Implement `scripts/verify-deploy.mjs`
    - Requests the given URL with retries for up to 3 minutes, requires HTTP 200 and an HTML body that references the main script, then requests that script and requires HTTP 200; any other result exits 1
    - Takes the expected script path as an optional argument (the build job output in CI) and otherwise extracts it from the fetched HTML, so `npm.cmd run verify:deploy -- <url>` also works locally
    - _Requirements: 26.5, 26.6_
  - [ ] 3.2 Write `.github/workflows/deploy.yml` and commit it after task 2.5
    - Triggers: push to `main` and manual dispatch; permissions `contents: read`, `pages: write`, `id-token: write`; concurrency group `pages`
    - build job: checkout with `fetch-depth: 0`, Node 24, `npm ci`, then `check:kiro`, `check:i18n`, `typecheck`, `test`, `build`; output the main script path; `actions/configure-pages`; `actions/upload-pages-artifact` with `path: dist`
    - deploy job: `actions/deploy-pages` in the `github-pages` environment; verify job: `verify-deploy.mjs` against `page_url` with the script path from the build job
    - Commit the workflow together with the remaining Milestone 1 files only after `npm.cmd run check:kiro` passed in task 2.5, so the first pipeline run finds every Kiro artifact tracked
    - _Requirements: 26.2, 26.3, 26.4, 26.5, 26.6_
  - [ ]* 3.3 Write unit tests for the deployment scripts and the build output
    - `verify-deploy.mjs` with a mocked `fetch`: script extraction, retries, non-200 page, non-200 script
    - Build-output test: every asset URL in the build starts with `/spooky-break-reminder/` and no external origin appears; the Test_Suite runs before `build` in CI, so the test builds into a temporary directory itself
    - _Requirements: 21.7, 21.8, 26.2, 26.5, 26.6_
  - [x] 3.4 Write `docs/submission-checklist.md`
    - One row per mandatory item with verification method, owner and verification date (ask the user for the owner names): project created after 2026-10-30 and built with Kiro, public Repository, MIT LICENSE at the root, committed `/.kiro` that no `.gitignore` pattern matches, working Live_URL, English feature description with "How we built it with Kiro", public Demo_Video of at most 3:00
    - The Submission_Deadline 2026-12-04 14:00 PST (UTC-8) = 2026-12-05 06:00 Beijing (UTC+8), the internal target 2026-12-04 06:00 Beijing, the milestones of 32.6, the steps to create the public Repository and set the Pages source to "GitHub Actions", and the final logged-out private-window check
    - Rows for the manual integration checks from the design's Testing Strategy: hidden-tab behavior, two-tab take-over, Ghost_Window, cross-browser matrix, keyboard-only pass, 360 and 2560 CSS pixel widths
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7_

- [ ] 4. Manual checkpoint (user): publish the Repository and the placeholder page (due 2026-11-21)
  - (user) In the GitHub web UI, create a repository named exactly `spooky-break-reminder` with visibility Public and without a README, `.gitignore` or license, so the local commit stays the root commit and the base path matches
  - (user) In Settings > Pages > Build and deployment, set Source to "GitHub Actions"; if the setting is not available on the empty repository, do it right after the first push
  - (agent, after the user confirms and gives the GitHub user name) `git remote add origin https://github.com/<github-user>/spooky-break-reminder.git`, then `git push -u origin main`
  - (user) In the Actions tab, the deploy workflow run is green in the build, deploy and verify jobs; if it failed because Pages was not enabled yet, enable it and choose "Re-run all jobs"
  - (agent) `npm.cmd run verify:deploy -- https://<github-user>.github.io/spooky-break-reminder/` exits 0
  - (user) In a logged-out private browser window: the Live_URL shows the placeholder (not a 404 and not a blank page); the Repository page shows LICENSE at the root detected as MIT and the `.kiro` folder at the root with specs, steering and hooks
  - (agent) Record the date and owner of each verified item in `docs/submission-checklist.md`, commit and push
  - _Requirements: 26.1, 26.3, 27.1, 27.2, 27.3, 32.2, 32.5, 32.6_

- [ ] 5. Build the pure core: time and Scheduler (Milestone 2, due 2026-11-27)
  - [ ] 5.1 Implement `src/core/time.ts` and `src/core/rng.ts`
    - Constants `SPEED`, `GAP_TOLERANCE_MS`, `UNOBSERVED_GAP_LIMIT_MS`, `SUSPEND_EVIDENCE_MS`, `HEARTBEAT_MS`; `scheduleDelta` clamps backward steps to 0; `naturalBreakWallMs` returns 1 minute in Demo_Mode
    - Seeded RNG for crack layouts and Whisper delays; `src/core` never reads `Date.now()`, `performance.now()` or `Math.random()`
    - _Requirements: 1.6, 14.7, 25.3, 25.5_
  - [ ] 5.2 Write property test for clock steps and Demo_Mode scaling
    - **Property 10: Clock steps and Demo_Mode scaling**
    - **Validates: Requirements 1.6, 14.7, 25.3, 29.5**
    - Required by Requirement 29.5, so not optional
  - [ ] 5.3 Implement `src/core/scheduler.ts` and the shared generators
    - Types from the design, `levelFor`, `nextBreakType`, `advance` (segment walk to the next Due_Time, Snooze end or Pause end), `reduce` with the transition table, `derive` for `ScheduleView`
    - `ritualStarted` during a Snooze ends the Snooze and keeps it counted (11.9); emit `snoozeEnded` only where `advance` lets a Snooze run out, so that Snooze sends no notification (15.2)
    - `configChanged` clamps Work_Elapsed to the new Work_Interval and Break_Counter to frequency - 1; a running Haunting keeps its Escalation_Step and Snooze_Duration snapshots; in unpaused Calm a clamp to the full Work_Interval starts the Haunting at level 1 with zero overdue; during a Pause leave the start to the `advance` loop, which starts the Haunting at level 1 with zero overdue when the Pause ends by expiry or Resume (12.7)
    - Shared fast-check generators `arbConfig`, `arbState` and `arbEvents` in `tests/arbitraries.ts`; property tasks only read this file and keep property-specific generators in their own file
    - One example test in `tests/scheduler.test.ts`: a `configChanged` that shortens the Work_Interval below the recorded Work_Elapsed during a Pause keeps Calm_State until the Pause ends, then the Haunting starts at level 1 with zero overdue (12.7)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.9, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.6, 6.7, 7.1, 7.2, 11.1, 11.3, 11.7, 11.8, 11.9, 12.2, 12.5, 12.6, 12.7, 13.4, 13.5_
  - [ ] 5.4 Write property test for level and offer invariants
    - **Property 3: Level and offer invariants over event sequences**
    - **Validates: Requirements 3.2, 3.3, 3.6, 7.1, 7.2, 29.2**
    - Required by Requirement 29.2
  - [ ] 5.5 Write property test for the break cycle
    - **Property 5: Break cycle**
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.6, 29.3**
    - Required by Requirement 29.3
  - [ ] 5.6 Write property test for Exorcism and Away reset
    - **Property 6: Exorcism and Away reset**
    - **Validates: Requirements 1.5, 3.6, 13.4, 13.5, 29.6**
    - Required by Requirement 29.6
  - [ ] 5.7 Write property test for Snooze transparency and the limit of three
    - **Property 8: Snooze is transparent to overdue accrual and limited to three**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.7, 11.8, 11.9, 29.4**
    - Required by Requirement 29.4
  - [ ] 5.8 Write property test for Pause exclusion
    - **Property 9: Pause time is excluded from Work_Elapsed**
    - **Validates: Requirements 12.2, 12.5, 12.6, 29.5**
    - Required by Requirement 29.5
  - [ ]* 5.9 Write property test for time-splitting invariance
    - **Property 1: Time-splitting invariance**
    - **Validates: Requirements 1.6**
  - [ ]* 5.10 Write property test for the Due_Time boundary
    - **Property 2: The Due_Time boundary is exact**
    - **Validates: Requirements 3.1, 3.3**
  - [ ]* 5.11 Write property test for Calm view consistency
    - **Property 4: Calm view consistency**
    - **Validates: Requirements 1.9, 2.1**
  - [ ]* 5.12 Write property test for the Ritual freezing overdue time
    - **Property 7: A Ritual freezes the overdue time**
    - **Validates: Requirements 3.4, 7.6**
  - [ ]* 5.13 Write the import-boundary test for `src/core`
    - A Vitest check that scans every file under `src/core` and fails on imports from `src/platform`, `src/ui` or `src/effects`
    - _Requirements: 1.6, 29.1_

- [ ] 6. Build the pure core: continuity, escalation and Flash_Guard (Milestone 2)
  - [ ] 6.1 Implement `classifyGap` in `src/core/continuity.ts`
    - Rules 1-7 of the design in order: backward, continuous (at most 45 s), open absence, Suspend_Evidence, Intervention_Signal within the Unobserved_Gap_Limit, away at or above Natural_Break_Duration, elapsed otherwise
    - _Requirements: 13.10, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_
  - [ ]* 6.2 Write property test for gap classification
    - **Property 11: Gap classification**
    - **Validates: Requirements 13.10, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8**
  - [ ] 6.3 Implement `effectsFor` and `fogCoverage` in `src/core/escalation.ts`
    - Veil, fog scale (1.65 at the start of level 2 down to 1.0 at level 5), ghost scale and opacity, crack count `base(level) + snoozesUsed`, Whisper gain fraction, possession flag, hidden during a Snooze, Ritual-progress scaling, Reduced_Motion static sizes
    - `fogCoverage(S)` samples the alpha function on a 200 x 200 grid
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11, 11.2, 19.3_
  - [ ]* 6.4 Write property test for cumulative and monotone escalation
    - **Property 12: Escalation effects are cumulative and monotone**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.6, 4.8, 4.9**
  - [ ]* 6.5 Write property test for Possession coverage
    - **Property 13: Possession covers at least 60% of the screen**
    - **Validates: Requirements 4.7**
  - [ ]* 6.6 Write property test for Ritual progress and Snooze modulation
    - **Property 14: Ritual progress and Snooze modulate the effects**
    - **Validates: Requirements 4.11, 11.2**
  - [ ]* 6.7 Write property test for Reduced_Motion
    - **Property 15: Reduced_Motion removes movement**
    - **Validates: Requirements 19.3**
  - [ ] 6.8 Implement the Flash_Guard in `src/core/flashGuard.ts`
    - `guardTarget` defers any target that would reverse the direction of the luminance proxy within 500 ms of the previous reversal; `countFlashes` counts Flashes in a sliding window
    - Jump_Scare timeline constants: rise 60 ms, hold 1 200 ms, fade 300 ms (1 560 ms in total)
    - _Requirements: 6.8, 19.4_
  - [ ]* 6.9 Write property test for the Flash limit
    - **Property 16: Flash limit**
    - **Validates: Requirements 19.4**

- [ ] 7. Build the pure core: Rituals (Milestone 2)
  - [ ] 7.1 Implement `src/core/rituals/common.ts` and the Eye_Ritual
    - Shared outcome type and hidden/visible handling: countdowns stop while hidden, and 60 s hidden ends the Ritual stamped at `hiddenAt + 60 s`
    - `eye.ts`: 20 000 ms countdown; a pointer press outside Abandon or any key except Escape restarts it; Enter, Space, Tab and Shift on the focused Abandon control do not; Escape or Abandon ends it; completes at 0
    - _Requirements: 7.5, 7.7, 7.8, 8.2, 8.4, 8.6_
  - [ ]* 7.2 Write property test for the Eye_Ritual model
    - **Property 21: Eye_Ritual model**
    - **Validates: Requirements 8.4, 8.6**
  - [ ] 7.3 Implement the Breathing_Ritual in `src/core/rituals/breathing.ts`
    - Guide of 6 cycles of 4 s inhale and 6 s exhale; a hold of 3 000-6 000 ms counts; shorter or longer gives a pacing hint; a press less than 4 000 ms after the previous release gives an exhale reminder and is excluded; completes at the 6th valid hold; 60 s without press or release ends it; repeated key events are ignored
    - _Requirements: 7.5, 7.7, 7.8, 9.1, 9.5, 9.6, 9.7, 9.8, 9.9_
  - [ ] 7.4 Write property test for the Breathing_Ritual model
    - **Property 22: Breathing_Ritual model**
    - **Validates: Requirements 9.1, 9.5, 9.6, 9.7, 9.8, 29.7**
    - Required by Requirement 29.7
  - [ ] 7.5 Implement the Stretch_Ritual in `src/core/rituals/stretch.ts`
    - Steps in order: neck tilt, shoulder roll, wrist and finger stretch, standing reach; each counts down 20 s and then enables its completion control; `done` on steps 1-3 advances, on step 4 completes; an enabled control left for 60 s ends the Ritual
    - _Requirements: 7.5, 7.7, 7.8, 10.1, 10.3, 10.4, 10.5, 10.6_
  - [ ]* 7.6 Write property test for the Stretch_Ritual model
    - **Property 23: Stretch_Ritual model**
    - **Validates: Requirements 10.3, 10.4, 10.5**
  - [ ]* 7.7 Write property test for hidden time in Rituals
    - **Property 24: Hidden time never advances a Ritual**
    - **Validates: Requirements 7.7**
  - [ ]* 7.8 Write unit tests for Ritual constants and boundaries
    - Hidden 59 999 ms versus 60 000 ms (7.8), 60 s without hold input (9.9), 60 s with an enabled control (10.6), the 20 s eye countdown (8.2), the stretch step order (10.1)
    - _Requirements: 7.8, 8.2, 9.9, 10.1, 10.6_

- [ ] 8. Build the pure core: settings, persistence and i18n (Milestone 2)
  - [ ] 8.1 Implement `src/core/settings.ts` and `src/core/persistence.ts`
    - `SETTINGS_SPEC` drives defaults, ranges and validation; `parseSettings` returns null on any violation; `applySettingInput` returns the previous Settings and the range for out-of-range input
    - `serialize` and `parseStored` with the envelope `{ "v": 1, "kind", "data" }`; another version, kind or shape is invalid
    - _Requirements: 1.1, 5.1, 6.1, 13.1, 14.1, 20.5, 21.1, 21.2, 21.4_
  - [ ] 8.2 Write property test for settings round trip and validation
    - **Property 25: Settings round trip and validation**
    - **Validates: Requirements 20.5, 21.2, 21.4, 29.8**
    - Required by Requirement 29.8
  - [ ]* 8.3 Write unit test for the defaults
    - One test over `SETTINGS_SPEC` and the default Settings: Work_Interval 20 min, Office_Safe_Mode, Nightmare_Mode off, away detection off, the ranges of the Glossary
    - _Requirements: 1.1, 5.1, 6.1, 13.1, 21.1_
  - [ ] 8.4 Implement `src/i18n/index.ts`
    - `t(key, params)` with English fallback, `MessageKey = keyof typeof en`, the active language as a signal, `detectLanguage` (`zh` prefix selects `zh-CN`), and a setter that writes the `lang` attribute of every registered document
    - _Requirements: 20.2, 20.4, 20.6_
  - [ ]* 8.5 Write property test for language detection and fallback
    - **Property 26: Language detection and fallback**
    - **Validates: Requirements 20.2, 20.6**

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Build the platform adapters and the engine (Milestone 2)
  - [ ] 10.1 Implement `clock.ts`, `ticker.ts` and `metronome.worker.ts` in `src/platform`
    - Injected `wall()` and `mono()`; while visible, `setTimeout` to the next interesting instant clamped to 16-1000 ms; while hidden, the Worker metronome posts every 10 s; main-thread timers stay as a backup when the Worker cannot be created
    - Create the Worker with `new Worker(new URL('./metronome.worker.ts', import.meta.url), { type: 'module' })` so Vite emits it under the base path
    - _Requirements: 1.7, 1.8, 16.6, 19.10, 21.8_
  - [ ] 10.2 Implement `src/platform/lifecycle.ts`
    - `visibilitychange`, `pagehide` (persist now), `pageshow`, Chromium `freeze` (write `frozenAtWall` synchronously) and `resume`, `document.wasDiscarded` at startup; feature-detected, absent signals report `'none'`
    - _Requirements: 14.1, 14.4, 14.6, 14.8_
  - [ ] 10.3 Implement `src/platform/storage.ts`
    - Keys `sbr:v1:*` and `sbr:v1:demo:*`; a probe write at startup detects unavailability; quota errors switch to an in-memory map and raise the "changes will not be saved" notice; erase-all removes every `sbr:` key
    - _Requirements: 21.3, 21.5, 21.6, 21.7, 25.7_
  - [ ] 10.4 Implement `src/app/engine.ts` and `src/app/store.ts`
    - `dispatch(event, atWall)`: measure, `classifyGap` for gaps over 45 s, advance, apply, commit; for an `away` verdict advance through the gap first, then dispatch `awayEnded`; apply past-stamped events at their own time (hidden Ritual timeout at `hiddenAt + 60 s`)
    - Persist on every phase change, every 30 s and on `pagehide`; load with `parseStored`; invalid data loads defaults, starts a new Work_Interval and raises the reset notice
    - Demo_Mode from `?demo=1`: speed 60, the demo storage namespace, Natural_Break_Duration of 1 wall-clock minute
    - Publish `ScheduleView`, notices and the welcome-back data (Away_Period length in whole minutes) as signals; output adapters register listeners, and an adapter error is logged and never stops the engine
    - _Requirements: 1.6, 1.7, 1.8, 13.4, 13.5, 13.6, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 21.4, 21.5, 25.1, 25.3, 25.5, 25.7_
  - [ ]* 10.5 Write unit tests for the engine and storage with fakes
    - Fake clock and storage: persistence cadence (14.1), restart after a short and a long stop (14.2, 14.3), reload after a discard (14.4), hidden Ritual timeout stamping (7.8), `?demo=1` parsing and storage namespaces (25.1, 25.7), storage fallback and erase-all (21.5, 21.6)
    - _Requirements: 7.8, 14.1, 14.2, 14.3, 14.4, 21.5, 21.6, 25.1, 25.7_

- [ ] 11. Build the effects renderer and the Audio_Engine (Milestone 2)
  - [ ] 11.1 Implement `fogTexture.ts`, `cracks.ts` and `ghostArt.ts` in `src/effects`
    - Fog texture from seeded value noise on an offscreen canvas with a CSS radial-gradient fallback; `generateCracks(seed, n)` as a seeded branching random walk; a team-drawn ghost SVG
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.7, 4.9, 21.8, 31.8_
  - [ ] 11.2 Implement `animator.ts` and `hauntLayer.ts` in `src/effects`
    - `createHauntLayer(doc)` builds the layer stack of the design (veil, ghost, fog, cracks, possession, jumpscare) in a fixed, `pointer-events: none` container, so the Main_Screen and the Ghost_Window each get an instance
    - The animator eases each channel toward `effectsFor()` through the Flash_Guard, animates only `opacity` and `transform`, takes 1.2 s for level increases and 2.5 s for the dissolve after a Ritual_Exorcism, and schedules `requestAnimationFrame` only while a channel moves and the document is visible
    - Accept `reducedMotion` as an input (wired to the media query and the setting in task 18.3)
    - _Requirements: 4.6, 4.10, 4.11, 4.12, 5.3, 19.3, 19.4, 19.10_
  - [ ]* 11.3 Write unit tests for the animator
    - Durations with fake time (4.12, 5.3); no animation frame is requested while the document is hidden (19.10)
    - _Requirements: 4.12, 5.3, 19.10_
  - [ ] 11.4 Implement `src/core/audioPolicy.ts`
    - `masterGain` (zero for Mute, Snooze, idle or locked, inactive instance, or locked audio; otherwise the Master_Volume), `whisperGainFor` (0.4, 0.7, 1.0 for levels 3, 4, 5), `nextWhisperDelayMs` uniform in [20 000, 40 000]
    - _Requirements: 4.4, 11.4, 13.7, 18.4, 18.5, 18.6, 22.2_
  - [ ]* 11.5 Write property test for audio gain and envelopes
    - **Property 18: Audio gain and envelopes**
    - **Validates: Requirements 4.4, 5.4, 11.4, 13.7, 18.4, 18.5, 22.2**
  - [ ] 11.6 Implement `src/platform/audio/engine.ts` and `synth.ts`
    - One `AudioContext` unlocked on the first user gesture; an enable-sound signal when `resume()` does not reach `running`; every voice ramps from 0 over 2.5 s through the master gain
    - Whispers (filtered noise with a syllable envelope), the completion chime, phase cue tones and the scream, all synthesized; the first Whisper 3 s after level 3 begins, then `nextWhisperDelayMs()` later on the `AudioContext` clock, at wall-clock speed in every mode; Whisper start and end are published as signals for the captions
    - _Requirements: 4.4, 5.4, 8.5, 9.3, 18.1, 18.2, 18.4, 18.5, 18.6, 18.7, 25.4, 31.8_
  - [ ]* 11.7 Write unit tests for the Audio_Engine with a fake `AudioContext`
    - Unlock and the blocked-audio signal (18.1, 18.2), the Whisper gain table (18.6), Whisper intervals at wall-clock speed in Demo_Mode (25.4)
    - _Requirements: 18.1, 18.2, 18.6, 25.4_

- [ ] 12. Build the Main_Screen, the Ritual UI and the tab status (Milestone 2)
  - [ ] 12.1 Implement `src/core/tabStatus.ts`
    - `formatClock` (mm:ss, whole seconds rounded up); `tabStatus(view, lang)`: Calm title with remaining minutes rounded up, Haunting title with the level and overdue minutes rounded down, "Snoozed" / "Paused" indicator, favicon id `candle` or `level-1` to `level-5`
    - _Requirements: 2.2, 16.1, 16.2, 16.3, 16.4, 16.5_
  - [ ]* 12.2 Write property test for status text formatting
    - **Property 20: Status text formatting**
    - **Validates: Requirements 2.2, 16.1, 16.2, 16.3, 16.4, 16.5**
  - [ ] 12.3 Implement the theme tokens and global styles
    - `src/ui/theme.ts` and the global stylesheet: color tokens, opaque "tombstone" panels for controls and status text, a visible focus indicator, the `data-hidden` rule that pauses CSS animations
    - _Requirements: 4.10, 19.5, 19.6, 19.10_
  - [ ]* 12.4 Write unit test for text contrast
    - Every text/background token pair in `theme.ts` has a WCAG contrast ratio of at least 4.5:1
    - _Requirements: 4.10, 19.6_
  - [ ] 12.5 Implement `MainScreen`, `Candle` and the Whisper caption, and wire the playable loop
    - Calm: candle with `scaleY(candleFraction)`, mm:ss remaining time, next break type, early-break control; Haunting: Overdue_Duration in whole minutes and the Ritual that ends it; "Demo x60" badge in Demo_Mode
    - Whisper caption naming the due Ritual activity in the active language for the duration of the Whisper, `aria-hidden`
    - Replace the placeholder in `src/app/main.tsx`: start the engine, mount the HauntLayer, connect the Audio_Engine; every new text key goes into both locale files
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5, 4.13, 4.14, 25.6_
  - [ ] 12.6 Implement `HauntControls` and `PauseMenu`
    - Ritual start controls (Eye_Ritual for a Micro_Break, a choice of Breathing_Ritual and Stretch_Ritual for a Long_Break), the Snooze control labelled with the Haunting's Snooze_Duration, the remaining Snooze time, the "no further bargains" message after 3 Snoozes
    - Pause menu with 30, 60, 120 minutes and until resumed; remaining Pause time and Resume control
    - _Requirements: 3.5, 4.10, 7.1, 7.2, 11.1, 11.6, 11.8, 12.1, 12.3_
  - [ ] 12.7 Implement `RitualDialog` with `EyeRitual`, `BreathingRitual` and `StretchRitual`
    - Native `<dialog>` with `showModal()`; instructions in the active language, progress indicator and Abandon control; the dark eye screen with only countdown, instruction and Abandon; the breathing target as a large button with pointer capture and Space handled at dialog level; stretch illustrations, instructions and 20 s step countdowns
    - Feed ticks and inputs to the core Ritual machines with monotonic time; completion dispatches `ritualCompleted` and plays the chime; abandon, timeout and hidden-60 s dispatch `ritualEnded`; the early-break control starts the Ritual of the next break type
    - _Requirements: 2.5, 2.6, 4.12, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8.1, 8.3, 8.5, 9.2, 9.3, 9.4, 10.2_
  - [ ]* 12.8 Write component tests for the Main_Screen and the Rituals
    - happy-dom: Calm and Haunting rendering (2.1-2.4, 3.5), keyboard-only and pointer-only runs of each Ritual (7.9)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5, 7.9_
  - [ ] 12.9 Implement `src/platform/tab.ts` with the favicons and wire it
    - Six SVG favicons in `public/icons/` (candle, level-1 to level-5); write `document.title` and the icon `href` only when they change, on every commit
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

- [ ] 13. Build the Settings_Panel, the notices and the Onboarding_Screen (Milestone 2)
  - [ ] 13.1 Implement `Settings`
    - Numeric inputs generated from `SETTINGS_SPEC` that keep the previous value and show the valid range on invalid input; Master_Volume and Mute; the Demo_Mode toggle navigates to the URL with or without `demo=1`; erase-all with a confirmation step; settings persist within 1 s and reach the engine as `configChanged`
    - _Requirements: 1.9, 18.3, 21.1, 21.2, 21.3, 21.6, 25.2_
  - [ ] 13.2 Implement `Notices`
    - Saved-data reset notice, storage-unavailable notice, welcome-back message with the Away_Period length in whole minutes
    - _Requirements: 13.6, 21.4, 21.5_
  - [ ] 13.3 Implement `Onboarding`
    - Shown when no data is persisted; at most 120 words per language about the escalation, the three Rituals and Office_Safe_Mode versus Nightmare_Mode; a Demo_Mode control that reloads with `demo=1` before Start, so the Start gesture unlocks audio in the demo page; Start unlocks audio and starts the first Work_Interval
    - _Requirements: 24.1, 24.2, 24.5, 24.6, 24.7_
  - [ ]* 13.4 Write unit tests for onboarding text and settings input
    - Onboarding text at most 120 words in each language, counting Chinese words with `Intl.Segmenter` (24.2); an out-of-range input keeps the value and shows the range (21.2)
    - _Requirements: 21.2, 24.2_

- [ ] 14. Checkpoint - Milestone 2 (due 2026-11-27): ensure all tests pass and the pipeline is green
  - Ensure all tests pass, ask the user if questions arise.
  - Push `main` and confirm that the deploy workflow run is green in every job.

- [ ] 15. Add notifications and the Ghost_Window (Milestone 3, due 2026-11-30)
  - [ ] 15.1 Implement `src/core/notifyPolicy.ts`
    - Show a Haunting notification only when permission is granted, notifications are enabled, the App document is hidden, the tab is the Active_Instance and no Snooze or Pause is active, for a Haunting start, a Snooze that runs out (`snoozeEnded` from `advance`) or the level reaching 5; request `closeAll` on every transition from a Haunting to Calm_State
    - A Snooze that `ritualStarted` ends produces no `snoozeEnded` event and therefore no notification (15.2)
    - _Requirements: 11.5, 12.4, 15.2, 15.5, 22.2_
  - [ ]* 15.2 Write property test for the notification policy
    - **Property 19: Notification policy**
    - **Validates: Requirements 11.5, 12.4, 15.2, 15.5, 22.2**
    - Generate `ritualStarted` during active Snoozes with the App document hidden and assert that no notification follows
  - [ ] 15.3 Implement `src/platform/notifier.ts` and the notification controls
    - `new Notification(title, { tag: 'sbr-haunting', body, icon })` with break type, level and Overdue_Duration in the active language; close the previous notification before showing a new one; click focuses the tab, closes the notification and opens the offered Ritual; `closeAll` covers the notifications created since the page loaded
    - Enable controls in `Settings` and `Onboarding` that call `Notification.requestPermission()` in the click handler; Settings show the status and site-settings instructions when permission is denied or the API is missing
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 24.3, 24.4_
  - [ ]* 15.4 Write unit tests for the Notifier with a fake `Notification`
    - Permission request on click, replacement, click handling, close-all scope
    - _Requirements: 15.1, 15.3, 15.4, 15.5_
  - [ ] 15.5 Implement `src/platform/pip.ts` and `GhostPanel`
    - `documentPictureInPicture.requestWindow({ width: 320, height: 320 })` from the Main_Screen or Onboarding control; copy the CSS rules, set `lang`, render `GhostPanel` with its own HauntLayer; Calm view with candle and remaining time, Haunting view with effects, Ritual start control and Snooze control
    - A Ritual started there runs in the Ghost_Window; closing the window ends that Ritual without completion and the App keeps signaling through the document, the title, the favicon and the Notifier; the Snooze hides the effects in both documents
    - The control is hidden without the API, and Settings state the browser requirement of 17.7
    - _Requirements: 11.2, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 24.3, 24.4_

- [ ] 16. Add Nightmare_Mode and the Jump_Scare (Milestone 3)
  - [ ] 16.1 Implement `shouldPresentJumpScare` and `nextHold` in `src/core/jumpScare.ts`
    - True only for Nightmare_Mode, no hold, a level-5 Haunting whose Jump_Scare was not shown, no Snooze, no Ritual, the Active_Instance, and the App document or the Ghost_Window visible
    - `nextHold` sets the hold when Nightmare_Mode turns on during a level-5 Haunting whose Jump_Scare was not shown, and clears it when the App document or the Ghost_Window becomes visible, a Snooze ends, a Ritual ends without completion or the Haunting ends
    - _Requirements: 5.2, 6.5, 6.6, 6.7, 6.10, 6.11_
  - [ ]* 16.2 Write property test for the Jump_Scare policy
    - **Property 17: Jump_Scare policy**
    - **Validates: Requirements 5.2, 6.5, 6.6, 6.7, 6.10, 6.11**
    - Generate Nightmare_Mode toggles at every level, including during level-5 Hauntings whose Jump_Scare was not shown; assert no presentation at the toggle and presentation at the first moment at or after the next 6.6 moment at which all conditions hold
  - [ ] 16.3 Implement `NightmareWarning`, the Nightmare_Mode toggle, the indicator and `JumpScare`
    - Settings toggle, off by default; the warning dialog describes the Jump_Scare and the scream; only "I understand, enable" turns Nightmare_Mode on, dismissal keeps it off; turning it off cancels a pending Jump_Scare; Main_Screen indicator while enabled
    - The engine evaluates `shouldPresentJumpScare` at every commit, and visibility changes of both documents cause a commit; `JumpScare` plays the guarded 1 560 ms timeline in every visible surface, the scream plays once through the master gain, then `jumpScarePresented` is dispatched; Reduced_Motion replaces the lunge with an opacity change
    - The engine feeds `nextHold` on every off-to-on change of the `nightmare` setting (this tab or a `storage` event), every visibility change, `snoozeEnded`, `ritualEnded` and Haunting end; the hold is not persisted
    - Example test with the fake clock: confirming the content warning during a level-5 Haunting with the App document visible presents no Jump_Scare; the next Snooze that runs out presents it exactly once (6.11)
    - _Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 18.4, 19.3, 19.4_
  - [ ]* 16.4 Write component tests for the Nightmare_Mode flow
    - Warning confirm and dismiss (6.2-6.4); the Jump_Scare ends within 2 s (6.8)
    - _Requirements: 6.2, 6.3, 6.4, 6.8_

- [ ] 17. Add away detection, the single active tab and the optional Daily_Log (Milestone 3)
  - [ ] 17.1 Implement `src/platform/idle.ts` and the away-detection toggle
    - Toggle in Settings and Onboarding, shown where `IdleDetector` exists and off by default; `requestPermission()` in the click handler; `threshold: 60 000`; report `awayOpenSince` (idle: event time minus 60 s; locked: event time) and `awayEnded(duration)` on the next active and unlocked state; audio gain is zero while idle or locked
    - Denial turns the toggle off and shows site-settings instructions; without the API, Settings state that away detection requires Chrome or Edge on desktop; the gap rules keep working either way
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.7, 13.8, 13.9, 13.10, 24.3, 24.4_
  - [ ]* 17.2 Write unit tests for the Idle_Monitor with a fake `IdleDetector`
    - Permission on click, idle start back-dating, denial handling
    - _Requirements: 13.2, 13.3, 13.9_
  - [ ] 17.3 Implement `src/platform/instanceLock.ts` and the take-over notice
    - `navigator.locks.request` with `ifAvailable` on `sbr-active` or `sbr-active-demo`; when denied, show "The Haunting runs in another tab" with Take over and queue a normal request; take-over aborts the queue and requests with `steal: true`; a tab whose lock was stolen stops its engine, notifications and audio; without Web Locks the tab runs as the Active_Instance
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 25.7_
  - [ ]* 17.4 Write unit tests for the instance lock with a fake `navigator.locks`
    - Notice when the lock is held, take-over with `steal`, hand-over when the holder releases
    - _Requirements: 22.1, 22.3, 22.4_
  - [ ]* 17.5 Implement the Daily_Log (optional, Requirement 23)
    - `src/core/dailyLog.ts` with `recordEvents(log, events, localDay)` and rollover; a `DailyLog` panel on the Main_Screen; the engine records DomainEvents under `sbr:v1:log` or `sbr:v1:demo:log`; skip this task and 17.6 when time is short
    - _Requirements: 23.1, 23.2, 23.3, 25.7_
  - [ ]* 17.6 Write property test for Daily_Log counts and rollover
    - **Property 27: Daily_Log counts and rollover**
    - **Validates: Requirements 23.1, 23.3**

- [ ] 18. Complete the language switch and accessibility (Milestone 3)
  - [ ] 18.1 Implement the language switch and complete the Chinese text
    - Language selector in Settings; the switch re-renders every surface within 1 s without a reload, sets `lang` to `en` or `zh-CN` on the App document and the Ghost_Window, and persists the choice
    - Review `zh-CN.json` so every key, including Ritual instructions, Whisper captions, notifications, the document title and the Ghost_Window, has a real Simplified Chinese text
    - _Requirements: 20.1, 20.3, 20.4, 20.5_
  - [ ]* 18.2 Write component tests for the language switch
    - Switching updates the visible text without a reload and sets the `lang` attribute
    - _Requirements: 20.3, 20.4_
  - [ ] 18.3 Implement Reduced_Motion, the live region and the layout checks
    - `src/platform/media.ts` combines `prefers-reduced-motion` with the setting `system | on | off` (Settings control) and feeds the HauntLayer and `JumpScare`
    - `LiveRegion` with `aria-live="polite"` announces level changes and the due Ritual; every control is reachable by keyboard with the visible focus indicator; the layout has no horizontal scrolling from 360 to 2560 CSS pixels
    - _Requirements: 19.1, 19.2, 19.3, 19.5, 19.7, 19.8, 19.10_
  - [ ] 18.4 Add the Lighthouse accessibility job to the Deployment_Pipeline
    - `a11y` job after `verify` in `deploy.yml`: Lighthouse CI through `npx` against the Live_URL with the assertion `categories:accessibility >= 0.9`
    - _Requirements: 19.9_
  - [ ]* 18.5 Write component tests for Reduced_Motion and the live region
    - With Reduced_Motion the layers receive only opacity changes; a level change produces one polite announcement
    - _Requirements: 19.3, 19.7_

- [ ] 19. Checkpoint - Milestone 3 (due 2026-11-30): ensure all tests pass, then manual integration checks (user)
  - Ensure all tests pass, ask the user if questions arise.
  - Push `main` and confirm that the deploy workflow run is green, including the `a11y` job.
  - (user) Perform the manual integration checks listed in `docs/submission-checklist.md` (hidden tab for 10 minutes in Chrome and Firefox, two-tab take-over, Ghost_Window with a Ritual inside it, the four-browser matrix, keyboard-only pass, 360 and 2560 CSS pixel widths); (agent) record date and owner of each check.
  - _Requirements: 1.8, 16.6, 17.2, 17.5, 17.6, 18.7, 19.5, 19.8, 22.3, 22.4, 26.7_

- [ ] 20. Write the Demo_Script and the README (Milestone 4, due 2026-12-01)
  - [ ] 20.1 Write `docs/demo-script.md`
    - Timestamped segments from the design outline totalling at most 2:50: hook, Calm candle, Demo_Mode escalation 1 to 5 with a Snooze returning stronger, Ritual completion, Ghost_Window or notification, language switch, content warning card then the Jump_Scare, Kiro workflow (spec files, one hook run, property test output), close
    - Notes: English subtitles for all speech, team-made or reuse-licensed audio and imagery only; turn on Nightmare_Mode before the Haunting reaches level 5, because turning it on at level 5 holds the Jump_Scare until the next return to the tab, Snooze end or abandoned Ritual (6.11)
    - _Requirements: 31.2, 31.4, 31.5, 31.6, 31.7, 31.8_
  - [ ]* 20.2 Write unit test for the Demo_Script timing
    - Parse the segment timestamps; segments are contiguous and end at or before 2:50
    - _Requirements: 31.2_
  - [ ] 20.3 Write `README.md` in English
    - Lines 1-20: title, one-line pitch, Live_URL, Demo_Mode URL (`?demo=1`) and a clearly marked Demo_Video placeholder that task 23 replaces
    - Feature description with the table that maps each Haunting_Effect to the break information it carries; "How we built it with Kiro" covering Specs, Steering_Documents, Agent_Hooks and Property_Based_Tests, with links to the actual files under `/.kiro` (use the hook file names that task 2.3 produced) and to `tests/`
    - Browser support table with the fallbacks and every bullet of the Known Limitations in `requirements.md`, including the Chrome and Edge sleep limitation for a frozen or discarded tab
    - Safety notes (Office_Safe_Mode, Nightmare_Mode, the content warning, Reduced_Motion, the Flash limit), the statement that all data stays in localStorage, local development with the `npm.cmd` form of each command and the note that the hooks call `npm.cmd`, image links to `docs/screenshots/calm.png`, `haunting-level-3.png` and `ritual.png`, the MIT License with a link to `LICENSE`
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10_
  - [ ]* 20.4 Write unit test for the README structure
    - The first 20 lines contain the Live_URL, the Demo_Mode URL and a Demo_Video line; the "How we built it with Kiro" heading exists; relative links to `/.kiro`, `tests/`, `LICENSE` and the screenshots resolve
    - _Requirements: 30.2, 30.4, 30.9, 30.10_

- [ ] 21. Manual checkpoint (user): capture the README screenshots (due 2026-12-01)
  - (user) Open the Live_URL with `?demo=1` in a desktop browser window and capture Calm_State, a Haunting at Haunting_Level 3 or higher, and a running Ritual; save them as `docs/screenshots/calm.png`, `docs/screenshots/haunting-level-3.png` and `docs/screenshots/ritual.png` (animated images are optional)
  - (agent) Confirm the three files exist and the README image links resolve; commit, push and confirm the deploy workflow run is green; record date and owner in `docs/submission-checklist.md`
  - _Requirements: 30.9, 32.6_

- [ ] 22. Manual checkpoint (user): record and publish the Demo_Video (due 2026-12-03)
  - (user) Record along `docs/demo-script.md` with `?demo=1` and Nightmare_Mode for the highlights (turned on before the Haunting reaches level 5, see 20.1): a content warning card before the first Jump_Scare, escalation from level 1 to level 5, one completed Ritual, a Snooze that returns at a higher level, the Ghost_Window or a system notification, the language switch, the Jump_Scare, and the Kiro workflow (spec files, one Agent_Hook run, property test output of `npm.cmd run test`)
  - (user) Add English subtitles for all narration and on-screen speech; use only team-made or reuse-licensed audio and imagery; keep the final cut at or below 3:00
  - (user) Upload to YouTube with visibility set to Public (not Unlisted, not Private); in a logged-out private window confirm that the video plays, shows a duration of at most 3:00 and offers English captions; give the URL to the agent
  - (agent) Record the URL, date and owner in `docs/submission-checklist.md`
  - _Requirements: 31.1, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 32.6_

- [ ] 23. Add the Demo_Video URL to the README and close the documentation items
  - Replace the Demo_Video placeholder within the first 20 lines of `README.md` with the YouTube URL; update the README and video rows of `docs/submission-checklist.md`; commit, push and confirm the deploy workflow run is green
  - _Requirements: 30.2, 32.1, 32.2_

- [ ] 24. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - `npm.cmd run check:kiro` exits 0, `git status` is clean, `origin/main` equals the local `main`, and the last deploy workflow run is green in every job.

- [ ] 25. Manual checkpoint (user): final verification and submission (internal target 2026-12-04 06:00 Beijing)
  - (agent) `npm.cmd run verify:deploy -- https://<github-user>.github.io/spooky-break-reminder/` exits 0
  - (user) In a logged-out private browser window, open the Repository (public), `LICENSE` (MIT, 2026, holder name), the `/.kiro` directory (the three spec files, steering, hooks), the Live_URL and the Live_URL with `?demo=1`, the Demo_Video (public, at most 3:00), every link in the first 20 lines of the README, and the README's English feature description and "How we built it with Kiro" section
  - (agent) Record the verification results in `docs/submission-checklist.md`, commit and push before the user submits
  - (user) Submit the entry on the hackathon site with the Repository URL, the Live_URL, the Demo_Video URL, the English feature description and the "How we built it with Kiro" write-up (both copied from the README); keep the confirmation. Hard deadline: 2026-12-04 14:00 PST = 2026-12-05 06:00 Beijing, with no extension
  - After submitting, push to `main` only for a necessary fix, because every push redeploys the Live_URL
  - _Requirements: 26.1, 27.1, 27.2, 27.3, 30.1, 30.2, 30.4, 31.3, 32.1, 32.2, 32.4, 32.7_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. The property tests for Properties 3, 5, 6, 8, 9, 10, 22 and 25 (tasks 5.2, 5.4-5.8, 7.4, 8.2) are not marked optional, because Requirements 29.2-29.8 require exactly these tests in the Test_Suite. The Daily_Log (Requirement 23, tasks 17.5 and 17.6) is optional.
- Each property test lives in its own file `tests/pNN-<slug>.prop.test.ts`, carries the tag comment `Feature: spooky-break-reminder, Property N: <property text>` and runs at least 100 cases (200 for the core properties), so property tasks can run in parallel.
- Every task that adds UI text adds the key to both `en.json` and `zh-CN.json` in the same change; the parity check runs in the Test_Suite, the locale hook and the pipeline.
- Windows PowerShell blocks `npm.ps1`, so commands and hooks use `npm.cmd` and `npx.cmd`. The GitHub CLI is not installed, so GitHub steps happen in the web UI.
- `.kiro` must never match a `.gitignore` pattern, not even temporarily; Kiro_Guard failure paths are tested only in temporary repositories (task 2.4).
- Checkpoints ensure incremental validation; manual checkpoints list the user steps and the agent's verification commands.
- Review resolutions, now stated in the requirements and the design and covered by the tasks named here:
  - 15.2 notifies only when a Snooze reaches the end of its Snooze_Duration; a Snooze that a Ritual start ends (11.9) sends nothing (tasks 5.3, 15.1, 15.2).
  - The second Known Limitations bullet covers a frozen and a discarded tab followed by device sleep (14.4, 14.6); the README takes it from `requirements.md` (task 20.3).
  - New 12.7: during a Pause, a shortened Work_Interval starts the Haunting when the Pause ends (task 5.3).
  - New 6.11: turning on Nightmare_Mode during a level-5 Haunting presents no Jump_Scare at the toggle; the Jump_Scare waits for the next moment named in 6.6 (tasks 16.1-16.3, 20.1, 22).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2", "3.1", "3.4"] },
    { "id": 2, "tasks": ["1.4", "2.4", "3.3"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.5"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["4"] },
    { "id": 7, "tasks": ["5.1", "6.8", "7.1", "8.1", "8.4"] },
    { "id": 8, "tasks": ["5.2", "5.3", "6.1", "6.9", "7.2", "7.3", "7.5", "8.2", "8.3", "8.5"] },
    { "id": 9, "tasks": ["5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "5.10", "5.11", "5.12", "6.2", "6.3", "7.4", "7.6", "7.7", "7.8"] },
    { "id": 10, "tasks": ["5.13", "6.4", "6.5", "6.6", "6.7"] },
    { "id": 11, "tasks": ["9"] },
    { "id": 12, "tasks": ["10.1", "10.2", "10.3", "11.1", "11.4", "12.1", "12.3"] },
    { "id": 13, "tasks": ["10.4", "11.2", "11.5", "11.6", "12.2", "12.4"] },
    { "id": 14, "tasks": ["10.5", "11.3", "11.7"] },
    { "id": 15, "tasks": ["12.5"] },
    { "id": 16, "tasks": ["12.6"] },
    { "id": 17, "tasks": ["12.7"] },
    { "id": 18, "tasks": ["12.8", "12.9"] },
    { "id": 19, "tasks": ["13.1"] },
    { "id": 20, "tasks": ["13.2"] },
    { "id": 21, "tasks": ["13.3"] },
    { "id": 22, "tasks": ["13.4"] },
    { "id": 23, "tasks": ["14"] },
    { "id": 24, "tasks": ["15.1", "16.1"] },
    { "id": 25, "tasks": ["15.2", "15.3", "16.2"] },
    { "id": 26, "tasks": ["15.4", "15.5"] },
    { "id": 27, "tasks": ["16.3"] },
    { "id": 28, "tasks": ["16.4", "17.1"] },
    { "id": 29, "tasks": ["17.2", "17.3"] },
    { "id": 30, "tasks": ["17.4", "17.5"] },
    { "id": 31, "tasks": ["17.6", "18.1"] },
    { "id": 32, "tasks": ["18.2", "18.3"] },
    { "id": 33, "tasks": ["18.4", "18.5"] },
    { "id": 34, "tasks": ["19"] },
    { "id": 35, "tasks": ["20.1", "20.3"] },
    { "id": 36, "tasks": ["20.2", "20.4"] },
    { "id": 37, "tasks": ["21"] },
    { "id": 38, "tasks": ["22"] },
    { "id": 39, "tasks": ["23"] },
    { "id": 40, "tasks": ["24"] },
    { "id": 41, "tasks": ["25"] }
  ]
}
```
