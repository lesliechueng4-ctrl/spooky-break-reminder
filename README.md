# Spooky Break Reminder

While you work, a candle burns down toward your next break. If you ignore it, the screen grows more haunted until you finish a short break activity that clears the Haunting.

- Live app: https://GITHUB_USER.github.io/spooky-break-reminder/ <!-- Replace GITHUB_USER with the GitHub user name after the first deployment (task 4). -->
- Demo mode (schedule time runs 60 times faster): https://GITHUB_USER.github.io/spooky-break-reminder/?demo=1
- Demo video: [PLACEHOLDER: YouTube link, added before submission] <!-- Task 23 replaces this line with the published YouTube URL. -->

Built with Kiro for the Kiroween hackathon and licensed under the [MIT License](LICENSE). The section [How we built it with Kiro](#how-we-built-it-with-kiro) links to the spec, steering and hook files.

## Screenshots

Placeholder. Three screenshots will be added before submission, one for each of these views:

- Calm state: `docs/screenshots/calm.png`
- A Haunting at level 3 or higher: `docs/screenshots/haunting-level-3.png`
- A running Ritual: `docs/screenshots/ritual.png`

## What the App does

The App runs in a browser tab. It counts down a work interval, 20 minutes by default. When the interval ends, a Haunting starts. The Haunting gets stronger the longer you stay overdue. The only way to end it is to complete a Ritual, which is a short break activity, or to step away from the computer for long enough. There is no skip button.

The App also keeps a daily count of completed Rituals, away breaks and Snoozes. The count resets at the start of each local calendar day.

## The mechanic

### Calm state

While you work, the main screen shows:

- a candle whose height matches the time left,
- the time left in minutes and seconds,
- whether the next break is a Micro break or a Long break,
- an early-break control, which starts the Ritual for the next break now,
- a Pause control.

By default, every third break is a Long break. In Settings, you can set this to every 1st to every 10th break.

### Haunting levels

When the work interval ends, a Haunting starts at level 1. The level goes up by one for each Escalation step of overdue time. The default step is 2 minutes, and the level stops at 5. With the default step, level 2 starts at 2 minutes overdue, level 3 at 4 minutes, level 4 at 6 minutes and level 5 at 8 minutes.

Each effect below carries a piece of break information. Each one starts at the level shown.

| Haunting effect | From level | Break information it carries |
|---|---|---|
| Candle goes out, dark veil over the screen (at least 30% opacity), a small ghost in the distance | 1 | The break is due now. |
| Fog creeps in from the screen edges and gets deeper with overdue time | 2 | You are drifting further overdue. |
| Cracks across the screen. Each Snooze adds one more crack. | 3 | Each Snooze makes the Haunting visibly worse. |
| Whispers, with on-screen captions that name the Ritual that ends the Haunting | 3 | This is the Ritual to do now. |
| The ghost moves toward the viewer | 4 | Last warning before the maximum level. |
| Possession: fog and ghost cover at least 60% of the screen | 5 | Maximum overdue. |
| Jump scare (Nightmare mode only, see below) | 5 | Maximum overdue, shown once per Haunting. |

Each level keeps the effects of the levels below it. The Haunting level also appears as text on the main screen, together with the overdue minutes and the name of the Ritual.

### Rituals

A Ritual ends the Haunting when you complete it.

| Ritual | Used for | What you do | Completes when |
|---|---|---|---|
| Eye ritual | Micro break | Look at something at least 6 meters (20 feet) away. The screen goes dark and shows only a 20-second countdown. | The countdown reaches zero. A key press (except Escape) or a click anywhere except the Abandon control restarts the countdown. |
| Breathing ritual | Long break | Follow 6 breath cycles, each with a 4-second inhale and a 6-second exhale. For each cycle, press and hold the Space key or the pointer on the breathing target, then release. | You make 6 valid holds. A hold is valid when it lasts 3 to 6 seconds. A hold that starts less than 4 seconds after the last release does not count. |
| Stretch ritual | Long break | Do 4 stretches in order: neck tilt, shoulder roll, wrist and finger stretch, standing reach. Each step lasts 20 seconds. | You confirm the fourth step after its countdown ends. |

Rules that apply to every Ritual:

- You can complete it with the keyboard alone or with the pointer alone.
- Escape or the Abandon control ends the Ritual without completion. The Haunting returns at the level that the overdue time gives.
- If the tab is hidden during a Ritual, the Ritual pauses. If the tab stays hidden for 60 seconds, the Ritual ends without completion.
- A completed Micro break adds one to the count toward the next Long break. A completed Long break resets that count to zero.

### Snooze

A Snooze hides the Haunting effects for the snooze length. The default is 5 minutes, and Settings allows 1 to 15 minutes. You can use up to 3 Snoozes in one Haunting.

Overdue time keeps running during a Snooze. When the Snooze ends, the effects come back at the level that the full overdue time gives, including the snoozed time. Each Snooze also adds a crack. During a Snooze, the sound and the notifications stay off. After the third Snooze, the Snooze control is replaced by a message that says no more Snoozes are allowed for this Haunting.

### Pause

Pause is available only in Calm state. You can pause for 30 minutes, 60 minutes, 120 minutes, or until you resume. Work time does not count during a Pause, so a Haunting cannot start during it. Resume ends the Pause early. Notifications stay off during a Pause.

### Ending a Haunting

A Haunting ends in one of two ways:

- You complete a Ritual.
- You are away for at least the Natural break duration (5 minutes by default). The App can see an absence only in the ways described under [Browser support](#browser-support). An absence also resets the count toward the next Long break.

## Office-safe and Nightmare modes

Office-safe mode is the default. It is eerie, dim, quiet and slow. The screen corrupts gradually. There is no jump scare, and no sound starts suddenly. Each sound rises from silence over at least 2 seconds. Screen changes between levels take at least 1 second. Whispers play at 40%, 70% and 100% of the master volume at levels 3, 4 and 5.

Nightmare mode is off by default and you must turn it on yourself. It adds a jump scare: a full-screen ghost image with a scream that lasts about 1.6 seconds. The jump scare appears at most once per Haunting, and only at level 5.

- Turning on Nightmare mode shows a content warning that describes the jump scare and the scream. The mode turns on only after you confirm the warning. If you dismiss it, Nightmare mode stays off.
- Turning on Nightmare mode during a level 5 Haunting does not trigger the scare right away. The scare waits until you next return to the tab, a Snooze ends, or a Ritual ends without completion.
- Turning off Nightmare mode cancels any scare that has not played yet.
- While Nightmare mode is on, the main screen shows an indicator.

## Accessibility and safety

- Reduced motion follows the reduced-motion setting of your operating system. Settings can also force it on or off. In this mode, moving and scaling effects become still images and fades. The jump scare follows the same rule.
- No more than 3 flashes happen in any 1-second window, including the jump scare.
- Text, countdowns and status labels have a contrast ratio of at least 4.5:1 against an opaque panel.
- Every control and every Ritual works with the keyboard and with the pointer. Focus is always visible.
- Level changes and the name of the due Ritual are announced to screen readers through a polite live region.
- Sound starts only after you press a control. If the browser blocks sound, the App shows a button to enable it. The visual effects keep running.
- The layout does not scroll sideways from 360 to 2560 CSS pixels wide.

## Privacy and local data

- All your data stays in the localStorage of your browser. The keys start with `sbr:v1:`. Demo mode uses `sbr:v1:demo:` so that its data never mixes with normal use.
- The App has no backend, no accounts, no analytics and no cross-device sync.
- The App does not use the camera, the microphone or any biometric check. It can only verify breaks through timers, clicks and key presses, so it cannot prove that you actually rested.
- Scripts, styles, fonts, images and audio load from the App's own origin. The App makes no requests to third-party servers.
- The erase-all control removes every key the App wrote and restores the default settings.
- If the saved data is unreadable or fails validation, the App loads the defaults, starts a new work interval and shows a notice.
- If localStorage is unavailable or full, the App keeps running from memory and shows a notice that changes will not be saved.

## Optional features

The onboarding screen offers each of these as a separate control. The App asks for a browser permission only after you press the control for that permission.

- **System notifications:** Notifications for Haunting events. They stay silent during a Snooze and a Pause.
- **Ghost window:** A small always-on-top window that mirrors the Haunting. It uses the Document Picture-in-Picture API.
- **Away detection:** Uses the Idle Detection API to notice when you are idle or when the screen is locked. It is off by default and needs a permission.

The tab title and the favicon need no permission. The title shows the Haunting state, such as the level and the overdue minutes, or whether a Snooze or Pause is active. The favicon changes with the level in every browser except Safari.

## Browser support

The target is the latest stable desktop version of Chrome, Edge, Firefox and Safari. Mobile layouts stay usable, but the App is built for an office desktop browser.

| Feature | Chrome and Edge | Firefox (desktop) | Safari (desktop) | Fallback |
|---|---|---|---|---|
| Calm state, Haunting, Rituals, Snooze, Pause, Settings, language switch | Yes | Yes | Yes | Not needed |
| Ghost window (Document Picture-in-Picture) | Yes, Chrome and Edge 116 or later | Yes, Firefox 151 or later | No | No ghost window. The main screen, title and favicon still work. |
| Away detection (Idle Detection API) | Yes, with permission | No | No | Off. The App cannot see that you are idle while its tab stays open. |
| Freeze and discard signals from the browser | Yes | No | No | Without the signal, a freeze or tab unload that lasts at least the Natural break duration counts as an absence. |
| Due time detection while the tab is hidden | Within 60 seconds | Within 60 seconds | Best effort | The App checks the schedule again as soon as the tab is visible. |
| Favicon changes made by the page | Yes | Yes | No. The favicon stays the same. | The title still shows the Haunting state. |
| System notifications | Yes, with permission | Yes, with permission | Yes, with permission | Without permission, the in-tab Haunting still works. |

### Known limitations

These limits come from what browsers report to a web page.

- Browsers do not report device sleep. In Firefox and Safari, which do not give the App a freeze or discard signal, a browser freeze or tab unload that lasts at least the Natural break duration counts as an absence. This happens even when you kept working in other windows. The App then skips the reminder for that work interval instead of haunting you when you return.
- In Chrome and Edge, the App learns when the browser froze or discarded it. If the computer also slept during that time, the App counts the gap as elapsed time, up to 60 minutes. The exception is when it has evidence that you were away: an open idle report, a locked screen, or a sleep signal on macOS and Linux. The sleep signal does not work on Windows. After a discard, the sleep signal is not available, because the reload starts a new page session.
- Chrome's Energy Saver and Memory Saver can freeze or discard background tabs. Check Chrome's performance settings if you want to keep the App active.
- Safari ignores favicon changes that a page makes, so the favicon stays the same there. The title still shows the Haunting state.
- Safari gives no wake-up timing for hidden pages. Timing in a hidden Safari tab is best effort. The App checks the schedule again as soon as the tab is visible.

## Settings

| Setting | Default | Range |
|---|---|---|
| Work interval | 20 minutes | 5 to 90 minutes, in 1-minute steps |
| Long break frequency | Every 3rd break | Every 1st to every 10th break |
| Escalation step | 2 minutes | 1 to 10 minutes |
| Snooze duration | 5 minutes (at most 3 Snoozes per Haunting) | 1 to 15 minutes |
| Natural break duration | 5 minutes | 1 to 30 minutes |
| Master volume | 30% | 0% to 100%, in 5% steps |
| Nightmare mode | Off | On or off. Turning it on requires confirming a content warning. |
| Reduced motion | Follows the operating system | System, on or off |
| Away detection | Off | On or off |

A value outside its range is rejected. The previous value stays, and the Settings panel shows the valid range.

## Languages

The App is available in English and Simplified Chinese. Switch the language in Settings. The switch updates the whole screen without a reload, and the choice is saved. On the first visit, a browser language that starts with `zh` selects Simplified Chinese. If a text has no translation in the active language, the English text appears.

## Demo mode

Open the App with `?demo=1` at the end of its address to enable Demo mode. In this mode, schedule time runs 60 times faster than the clock. The Natural break duration is 1 minute of real time. A "Demo x60" label stays on the main screen.

Rituals, countdowns and Whisper timing still run at real speed. A full work interval and the escalation to level 5 take about 28 seconds in Demo mode. Demo mode keeps its own data and its own lock, so it never changes your normal data. The Settings panel has a toggle that opens the App with or without `?demo=1`.

## Run locally

The commands below use Node.js 24, the version that CI uses.

Windows PowerShell blocks `npm.ps1` under the default execution policy, so use `npm.cmd` there. On macOS and Linux, use `npm` in place of `npm.cmd`.

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run build
npm.cmd run test
npm.cmd run typecheck
```

- `npm.cmd ci` installs the exact versions from `package-lock.json`.
- `npm.cmd run dev` starts the Vite development server. Open the address that Vite prints. The App is served under `/spooky-break-reminder/`.
- `npm.cmd run build` writes the production files to `dist/`.
- `npm.cmd run test` runs the Vitest suite once. It does not watch for changes.
- `npm.cmd run typecheck` runs the TypeScript compiler without writing output.
- `npm.cmd run check:kiro` checks the Kiro rules for the repository and the LICENSE file.
- `npm.cmd run check:i18n` checks that the English and Chinese text files have the same keys.

The Agent Hooks in `.kiro/hooks/` run the same checks through `npm.cmd`, so they work in the Windows setup this project uses.

## Deployment

A push to the `main` branch starts the GitHub Actions workflow in `.github/workflows/deploy.yml`. The workflow runs the Kiro check, the translation check, the type check and the test suite. It then builds the App and deploys it to GitHub Pages. If any of these steps fails, the workflow stops before deployment. After deployment, the workflow requests the live page and its main script, and fails if either one does not return HTTP 200.

## Project layout

```
.github/workflows/    deployment workflow
.kiro/specs/          requirements, design and tasks of the spec
.kiro/steering/       product, technical and structure rules
.kiro/hooks/          Agent Hooks
docs/                 submission checklist (and, later, screenshots and the demo script)
public/               favicons and static files
scripts/              Kiro check, translation check and deployment check
src/core/             pure logic: schedule, escalation, Rituals, settings, storage format
src/platform/         browser adapters: timers, storage, lifecycle, audio, notifications
src/effects/          fog, cracks and ghost rendering
src/ui/               Preact screens and Ritual dialogs
src/i18n/             translation function and locale files
src/app/              engine, signal store and entry point
tests/                unit tests and property-based tests
```

The code in `src/core` does not read the clock, the random source or the DOM. The engine passes durations in and gets new state back. The browser adapters do the rest.

The Kiro specs are in [`.kiro/specs/spooky-break-reminder/`](.kiro/specs/spooky-break-reminder/). The submission checklist is in [`docs/submission-checklist.md`](docs/submission-checklist.md).

## How we built it with Kiro

We wrote the spec first, then built the App from the task list in `tasks.md`. Kiro's Specs, Steering Documents, Agent Hooks and property-based tests each did a separate job.

- **Specs.** [requirements.md](.kiro/specs/spooky-break-reminder/requirements.md) lists the acceptance criteria. [design.md](.kiro/specs/spooky-break-reminder/design.md) describes the architecture and the correctness properties. [tasks.md](.kiro/specs/spooky-break-reminder/tasks.md) breaks the work into milestones and checkable tasks. [.config.kiro](.kiro/specs/spooky-break-reminder/.config.kiro) holds the spec settings.
- **Steering Documents.** [product.md](.kiro/steering/product.md) holds the mechanic and the horror-safety rules. [tech.md](.kiro/steering/tech.md) holds the technical conventions, including the rule that the core imports nothing from the browser layers. [structure.md](.kiro/steering/structure.md) describes where new code goes.
- **Agent Hooks.** [run-tests-on-save.json](.kiro/hooks/run-tests-on-save.json) runs the test suite when a source file is saved. [i18n-parity-on-save.json](.kiro/hooks/i18n-parity-on-save.json) runs the translation key check when a locale file is saved. [kiro-guard-on-gitignore-save.json](.kiro/hooks/kiro-guard-on-gitignore-save.json) runs the Kiro check when `.gitignore` is saved.
- **Property-based tests.** Each correctness property in the design has one fast-check test in `tests/*.prop.test.ts`. Examples are [p22-breathing-ritual.prop.test.ts](tests/p22-breathing-ritual.prop.test.ts), which checks that the Breathing ritual completes at the sixth valid hold, and [p25-settings-roundtrip.prop.test.ts](tests/p25-settings-roundtrip.prop.test.ts), which checks that settings survive a save and load. Shared generators are in [tests/arbitraries.ts](tests/arbitraries.ts). The rest of the tests are in the [tests/](tests/) folder.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
