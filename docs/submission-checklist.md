# Submission Checklist: Spooky Break Reminder

This checklist covers every mandatory submission item (Requirement 32) and the manual integration checks from the design's Testing Strategy. Each row gives a verification method, an owner and a verification date.

- Owner: every row lists `lesliechueng4-ctrl` as a placeholder. Replace it with the name of the person who performs the check.
- Verified on: the value stays `Not yet` until the check passes. Then enter the date as `YYYY-MM-DD`.

## Key facts

| Item | Value |
|---|---|
| Repository | https://github.com/lesliechueng4-ctrl/spooky-break-reminder |
| Live_URL | https://lesliechueng4-ctrl.github.io/spooky-break-reminder/ |
| Demo_Video | `[YouTube URL, to be added after publishing]` |
| Submission_Deadline | 2026-12-04 14:00 PST (UTC-8), which equals 2026-12-05 06:00 Beijing time (UTC+8). The organizers grant no extension. |
| Internal submission target | 2026-12-04 06:00 Beijing time (UTC+8), which equals 2026-12-03 14:00 PST. It is 24 hours before the Submission_Deadline. |
| Work start | 2026-11-20 |

## Milestones

| Milestone | Due date | Scope |
|---|---|---|
| M1 | 2026-11-21 | A placeholder page is live at the Live_URL through the Deployment_Pipeline. |
| M2 | 2026-11-27 | Scheduler, escalation and the Rituals. |
| M3 | 2026-11-30 | Notifications, Ghost_Window, Nightmare_Mode, the language switch and accessibility. |
| M4 | 2026-12-01 | README and screenshots, plus the Demo_Script. |
| M5 | 2026-12-03 | Demo_Video published on YouTube. |

## Create the public Repository and enable GitHub Pages

Owner steps in the GitHub web UI:

1. Sign in to GitHub as `lesliechueng4-ctrl`.
2. Select New repository. Name it exactly `spooky-break-reminder` and set visibility to Public. Leave "Add a README file", ".gitignore" and "Choose a license" unchecked. An empty repository keeps the local commit as the root commit, and the repository name must match the Live_URL base path.
3. Before the first commit, set the git identity on this machine with `git config --global user.name` and `git config --global user.email`. A GitHub noreply address works for the email.
4. After the owner confirms the GitHub user name, the agent runs `git remote add origin https://github.com/lesliechueng4-ctrl/spooky-break-reminder.git` and then `git push -u origin main`.
5. Open Settings, then Pages, then Build and deployment. Set Source to "GitHub Actions". If the option is unavailable until the first push, set it right after the push. Then open the Actions tab and choose "Re-run all jobs" on the failed run.
6. Confirm the Repository header shows the Public label.

## Mandatory items

| # | Item | Requirement | Verification method | Owner | Verified on |
|---|---|---|---|---|---|
| 1 | The project was created after 2026-10-30 and built with Kiro | 32.1 | Run `git log --reverse --format=%cI` and confirm the first commit date is after 2026-10-30. Run `git ls-files -- .kiro` and confirm the spec, steering and hook files are tracked. | lesliechueng4-ctrl | Not yet |
| 2 | Public Repository | 32.1 | In the logged-out private window (final check below), open the Repository URL. It loads without a sign-in prompt, and the header shows Public. | lesliechueng4-ctrl | Not yet |
| 3 | MIT LICENSE file at the Repository root | 32.1, 30.10 | Open the root of the `main` branch. Confirm a LICENSE file with the MIT License text and the copyright line exists, and that the repository sidebar shows "MIT License". Run `npm.cmd run check:kiro` and confirm it exits 0. | lesliechueng4-ctrl | Not yet |
| 4 | Committed `/.kiro` directory that no `.gitignore` pattern matches | 32.1, 27.4 | Run `git check-ignore -v --no-index .kiro/specs/spooky-break-reminder/requirements.md`. The command prints nothing and exits 1. Run `git ls-files -- .kiro` and confirm files are listed. Open the Repository root and confirm `.kiro` is visible. | lesliechueng4-ctrl | Not yet |
| 5 | Working Live_URL | 32.1, 26.5, 26.6 | In the logged-out private window, open the Live_URL. It returns the App, not a 404 or a blank page. Run `npm.cmd run verify:deploy -- https://lesliechueng4-ctrl.github.io/spooky-break-reminder/` and confirm it exits 0. In the Actions tab, the build, deploy and verify jobs of the latest `main` run are green. | lesliechueng4-ctrl | Not yet |
| 6 | English feature description with the "How we built it with Kiro" write-up | 32.1, 30.1-30.10 | Open README.md on `main`. Confirm the first 20 lines hold the title, the one-line pitch, the Live_URL, the Demo_Mode URL (`?demo=1`) and the Demo_Video URL. Confirm a section named "How we built it with Kiro" links to `/.kiro` and `tests/`. Confirm the text is English and that the README names the MIT License and links to LICENSE. | lesliechueng4-ctrl | Not yet |
| 7 | Public Demo_Video of at most 3:00 | 32.1, 31.1, 31.3, 31.4 | Open the YouTube link in the logged-out private window. Confirm it plays without a sign-in, the visibility is Public, the length shown is 3:00 or less, and English subtitles are available. | lesliechueng4-ctrl | Not yet |

## Documentation and video content checks

These rows apply Requirements 30 to 31 before the internal target. They are checked against this list, as the design requires.

| # | Item | Requirement | Verification method | Owner | Verified on |
|---|---|---|---|---|---|
| 8 | Demo_Script with timestamped segments in `docs/demo-script.md` | 31.2 | Add up the segment timestamps. The last segment ends at 2:50 or earlier. | lesliechueng4-ctrl | Not yet |
| 9 | Demo_Video content | 31.5, 31.6, 31.7, 31.8 | Watch the video and confirm each item: a content warning card before the first Jump_Scare; escalation from Haunting_Level 1 to 5; one completed Ritual; a Snooze that returns at a higher level; the Ghost_Window or a system notification; the language switch; a Nightmare_Mode Jump_Scare; the Kiro workflow (Spec files, one Agent_Hook run, Property_Based_Test output); audio and imagery that the team created or that are licensed for reuse. | lesliechueng4-ctrl | Not yet |
| 10 | At least three screenshots linked from the README | Design, Submission Deliverables | Confirm files exist in `docs/screenshots/` for Calm_State, a Haunting at level 3 or higher, and a Ritual, and that the README links them. | lesliechueng4-ctrl | Not yet |

## Manual integration checks

| # | Check | Requirements | Verification method | Owner | Verified on |
|---|---|---|---|---|---|
| 11 | Hidden-tab behavior in Chrome and Firefox | 1.8, 16.6, 18.7 | Open the Live_URL and click Start so audio unlocks. In Settings, set the Work_Interval to 5 minutes. Start the Work_Interval, then leave the App tab hidden for 10 minutes. Afterwards, confirm the Due_Time (at 5 minutes) was detected within 60 seconds, the title changed as the Haunting grew, and a Whisper played while the tab was hidden. With the default Escalation_Step, Haunting_Level 3 is reached at about 9 minutes, so Whispers fall inside the 10 minutes. Repeat in Chrome and in Firefox. | lesliechueng4-ctrl | Not yet |
| 12 | Two-tab take-over and close hand-over | 22.1, 22.2, 22.3, 22.4 | Open the App in tab 1 and start a Work_Interval. Open tab 2. Confirm tab 2 shows the take-over notice and tab 1 keeps running. In tab 2, activate the take-over control, then confirm tab 2 becomes the Active_Instance within 2 seconds and tab 1 stops scheduling, notifications and audio. Close tab 2 while tab 1 is open, then confirm tab 1 becomes the Active_Instance within 5 seconds. | lesliechueng4-ctrl | Not yet |
| 13 | Ghost_Window open, Ritual inside it, close | 17.1 to 17.7 | In Chrome and in Firefox 151 or later, open the Ghost_Window from the Main_Screen. Confirm it is always on top and no larger than 320 by 320 CSS pixels. In Calm_State, confirm it shows the candle and remaining time. Let a Haunting start and confirm the effects, the Ritual start control and the Snooze control appear. Start and complete a Ritual inside the window. Then reopen a Haunting, close the window, and confirm the title, the favicon and the notifications keep signaling. In a browser without Document Picture-in-Picture, confirm Settings states the browser requirement. | lesliechueng4-ctrl | Not yet |
| 14 | Keyboard-only pass with a visible focus indicator | 19.5, 7.9, 9.4 | Do not use the mouse or the pointer. Start a Work_Interval from Onboarding. Trigger a Haunting with a short Work_Interval. Complete the Eye_Ritual, the Breathing_Ritual (hold Space) and the Stretch_Ritual. Use Snooze, Pause, Settings and the language switch. Confirm every focused control shows a visible focus indicator. Keep the keyboard untouched for the 20 seconds of the Eye_Ritual, because a key press restarts its countdown. | lesliechueng4-ctrl | Not yet |
| 15 | Responsive layout at 360 and 2560 CSS pixels | 19.8 | In browser developer tools, set the viewport to 360 and then to 2560 CSS pixels. Check Calm_State, a level 5 Haunting (use `?demo=1`), a Ritual, the Settings_Panel and Onboarding. Confirm no horizontal scrolling and no clipped controls at either width. | lesliechueng4-ctrl | Not yet |
| 16 | Lighthouse accessibility score of at least 90 | 19.9 | In a logged-out private window, run the Lighthouse accessibility audit on the Live_URL. Confirm the score is 90 or higher. This is a manual run until an automated `a11y` job is added to the Deployment_Pipeline. | lesliechueng4-ctrl | Not yet |
| 17 | Kiro hooks run their commands on save | 28.3, 28.4, 28.5 | Save a file under `src/` and confirm `npm.cmd run test` runs. Save a locale file under `src/i18n/locales/` and confirm `npm.cmd run check:i18n` runs. Save `.gitignore` without changes and confirm `npm.cmd run check:kiro` runs. | lesliechueng4-ctrl | Not yet |

### Cross-browser matrix

Requirement 26.7 covers the latest stable desktop versions of Chrome, Edge, Firefox and Safari. Replace the `[ ]` in a cell with `[x]` after the check passes in that browser.

| Feature | Chrome | Edge | Firefox | Safari | Owner | Verified on |
|---|---|---|---|---|---|---|
| Calm_State screen | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Haunting and Haunting_Levels 1 to 5 | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Eye_Ritual, Breathing_Ritual and Stretch_Ritual | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Snooze | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Pause | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Settings_Panel | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |
| Language switch (English and Simplified Chinese) | [ ] | [ ] | [ ] | [ ] | lesliechueng4-ctrl | Not yet |

Safari ignores favicon changes made by the page, so the favicon check does not apply to Safari. The document title still shows the Haunting state.

## Final check in a logged-out private window (32.7)

Run this check after the Repository is public and the Live_URL works. It uses a private browser window with no GitHub session, so confirm that GitHub shows "Sign in" before you start.

1. Open https://github.com/lesliechueng4-ctrl/spooky-break-reminder. The Repository loads, shows Public, and renders the README.
2. Open the LICENSE file at the root. The MIT License text and the copyright line are visible, and the sidebar shows "MIT License".
3. Open the `.kiro` folder at the root. The `specs`, `steering` and `hooks` folders are visible.
4. Open https://lesliechueng4-ctrl.github.io/spooky-break-reminder/. The App loads with the candle favicon. It is not a 404 and not a blank page.
5. Open the Demo_Video link. It plays without a sign-in, its visibility is Public, its length is 3:00 or less, and English subtitles are available.
6. Enter the date and the owner in the "Verified on" column for rows 1 to 7. If any step fails, fix the cause and repeat the whole check.

Final sign-off: all mandatory rows (1 to 7) show a verification date before the internal target of 2026-12-04 06:00 Beijing time.
