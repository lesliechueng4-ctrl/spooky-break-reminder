---
inclusion: always
---

# Project Structure: Spooky Break Reminder

Source of truth: the "Source Layout" section of `.kiro/specs/spooky-break-reminder/design.md`. Keep this file in step with that section.

## Layout

```
.github/workflows/deploy.yml          Deployment_Pipeline (task 3.2)
.kiro/specs/spooky-break-reminder/    requirements.md, design.md, tasks.md, .config.kiro
.kiro/steering/                       product.md, tech.md, structure.md
.kiro/hooks/                          run-tests-on-save, i18n-parity-on-save,
                                      kiro-guard-on-gitignore-save
docs/                                 demo-script.md, submission-checklist.md, screenshots/
public/icons/                         candle.svg, level-1.svg ... level-5.svg (favicons)
public/fonts/                         display font (.woff2) and OFL.txt
scripts/                              kiro-guard.mjs, check-i18n.mjs, verify-deploy.mjs
src/core/                             pure logic, no DOM, no clock, no timers
  rituals/                            common.ts, eye.ts, breathing.ts, stretch.ts
src/platform/                         browser adapters
  audio/                              engine.ts, synth.ts
src/effects/                          hauntLayer.ts, animator.ts, fogTexture.ts,
                                      cracks.ts, ghostArt.ts
src/ui/                               Preact components
  rituals/                            Ritual screens and EyeRitual
src/i18n/                             index.ts, locales/en.json, locales/zh-CN.json
src/app/                              engine.ts, store.ts, main.tsx
tests/                                *.test.ts (examples), *.prop.test.ts (fast-check),
                                      arbitraries.ts (shared generators)
index.html, vite.config.ts, tsconfig.json, package.json, package-lock.json,
LICENSE, README.md, .gitignore
```

## Where new code goes

- Pure rules (timing, escalation, gap classification, Ritual state machines, policies, validation, persistence format): `src/core`. A Ritual state machine goes in `src/core/rituals/<name>.ts`.
- Anything that touches a browser API (timers, the Worker, storage, lifecycle events, notifications, Idle Detection, Picture-in-Picture, the tab title and favicon, the Web Audio context): `src/platform`. Audio synthesis lives in `src/platform/audio/`.
- Canvas, SVG, CSS custom properties and the animation loop: `src/effects`.
- Preact components, screens and the Ritual dialogs: `src/ui`. Ritual screens go in `src/ui/rituals/`.
- Orchestration (the engine that dispatches events, the store of signals, the entry point): `src/app`. The entry point is `src/app/main.tsx`.
- User-facing text: `src/i18n/locales/en.json` and `src/i18n/locales/zh-CN.json`, with the same keys in both files.
- Tests: `tests/*.test.ts` for examples and `tests/*.prop.test.ts` for property tests. Put shared generators in `tests/arbitraries.ts`, and keep property-specific generators in their own property test file.
- Build and check scripts (plain Node, no dependencies): `scripts/*.mjs`.
- Static assets served from the App's origin: `public/`. Reference them with paths under the base `/spooky-break-reminder/`.
- Kiro artifacts: specs in `.kiro/specs/spooky-break-reminder/`, steering in `.kiro/steering/`, hooks in `.kiro/hooks/`. Create hooks with the Kiro hook tool, not by hand.

## Dependency direction

`src/app` may import from every folder. `src/ui` and `src/effects` may import from `src/core` and `src/i18n`. `src/platform` may import from `src/core`. `src/core` imports nothing from `src/platform`, `src/ui`, `src/effects` or `src/app` (see `tech.md`).

## Do not

- Put a `.kiro` path in `.gitignore`. The Kiro_Guard fails the build when one matches.
- Commit `node_modules/`, `dist/` or `.env*` files. The `.gitignore` excludes them.
- Add a file under `src/core` that reads the clock, the random source or the DOM.
- Add a locale key to one locale file only.
