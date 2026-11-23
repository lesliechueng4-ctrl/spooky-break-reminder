# Requirements Document

## Introduction

Spooky Break Reminder (working title) is a browser-based break reminder for office workers, built with Kiro as an entry for the Kiroween hackathon. The brief asks for a polished, memorable spooky UI whose horror elements enhance the app's function instead of acting as a cosmetic skin. Judging weighs Impact, Tech, Design, Idea and Presentation equally, so the demo video and the "How we built it with Kiro" write-up are in scope.

Core mechanic: while the user works, a candle burns down to show the time left until the next break. When the candle goes out, a Haunting begins. The longer the user delays the break, the more haunted the App becomes: the screen darkens, fog creeps in, the glass cracks, a ghost approaches, whispers begin, and finally the screen is possessed. The Haunting_Level is the overdue indicator. The user ends the Haunting with an exorcism Ritual that is a real break activity: an eye-rest ritual based on the 20-20-20 rule, a guided breathing ritual or a guided stretching ritual.

This document also covers the mandatory submission deliverables (public repository, MIT license, committed /.kiro directory, live URL, English README, public demo video), because a missing item disqualifies the entry. The Submission_Deadline is 2026-12-04 14:00 PST, which is 2026-12-05 06:00 Beijing time. Work starts on 2026-11-20.

### Confirmed Decisions

1. Escalating Haunting plus exorcism Rituals, as described above.
2. Break verification uses interaction only: timers, clicks and key presses. Camera and microphone are excluded. Away detection through the browser Idle Detection API is optional (Chrome and Edge only, permission-gated) and degrades gracefully. The team accepts that real breaks cannot be strictly verified.
3. Spec documents, README and video subtitles are in English. The UI offers a Simplified Chinese / English language switch.
4. Office-safe intensity by default: eerie, dim, quiet, slow screen corruption, no jump scares and no sudden loud sounds. An opt-in Nightmare_Mode adds a jump scare. The demo video uses Nightmare_Mode for highlights.

### Assumptions

These defaults were adopted without explicit confirmation and can be changed during review:

- Out-of-tab signals: system notifications, a haunted tab title and favicon, and an optional always-on-top Ghost_Window based on the Document Picture-in-Picture API (Chrome, Edge and Firefox 151 or later on desktop), with fallbacks.
- All data stays in the browser's localStorage. There is no backend and no account.
- Default values: Work_Interval 20 minutes, a Long_Break every 3rd break, Escalation_Step 2 minutes, Snooze_Duration 5 minutes with at most 3 Snoozes per Haunting, Natural_Break_Duration 5 minutes, Master_Volume 30%.
- Pause is available only in Calm_State. There is no "skip break" control: a Haunting ends only through a completed Ritual or an Away_Period, and Snooze only delays the Haunting while the Haunting keeps growing.
- Demo_Mode (time accelerated 60 times) lets judges and the demo video show the full escalation within seconds.
- The Daily_Log (counts for the current day) is a small addition beyond the original request and can be dropped.
- Tooling: Vite, TypeScript, Vitest and fast-check; GitHub Actions deploys to GitHub Pages. The repository name is spooky-break-reminder.
- The user creates the public repository and enables GitHub Pages in the GitHub web UI, because the GitHub CLI is not installed. Windows PowerShell blocks plain `npm`, so commands use `npm.cmd`.

### Known Limitations

These limitations follow from what browsers report to a page. The README browser support table lists them (Requirement 30.5).

- Browsers report neither device sleep nor, outside Chrome and Edge, browser freezes and discards. In Firefox and Safari, which provide no Intervention_Signal, a browser freeze or tab unload of at least Natural_Break_Duration counts as an Away_Period even if the user kept working in other windows (Requirement 14.8); the App then skips the reminder for that Work_Interval instead of haunting a returning user.
- In Chrome and Edge, if the host device sleeps while the browser has frozen or discarded the App, the Scheduler counts the Unobserved_Gap as elapsed time, up to the Unobserved_Gap_Limit, unless Suspend_Evidence or an open Idle_Monitor report of an idle user or a locked screen exists (Requirements 14.4 and 14.6). After a discard, Suspend_Evidence cannot exist, because the reload starts a new page session.
- Safari ignores favicon changes made by the page, so the favicon stays static in Safari; the document title still shows the Haunting state (Requirements 16.3 and 16.4).
- Safari publishes no wake-up guarantee for hidden pages, so in Safari the 60-second bounds for a hidden App document (Requirements 1.8 and 16.6) are best-effort; the App re-evaluates the schedule as soon as the App document becomes visible.

### Out of Scope

- Camera, microphone and any biometric verification of breaks.
- Backend services, accounts, analytics and cross-device sync.
- Browser extensions, native desktop apps and mobile-first layouts (the layout stays usable on small screens, but the target is an office desktop browser).

## Glossary

- **App**: The Spooky Break Reminder single-page web application running in the user's browser.
- **Scheduler**: The App component that tracks Work_Interval progress, break types, Hauntings, Snoozes, Pauses and Away_Periods.
- **Ritual_Engine**: The App component that runs Rituals and decides when a Ritual is complete.
- **Audio_Engine**: The App component that produces all sounds.
- **Notifier**: The App component that shows system notifications through the browser Notifications API.
- **Idle_Monitor**: The App component that detects user inactivity and screen lock through the browser Idle Detection API.
- **Ghost_Window**: An optional always-on-top floating window opened through the Document Picture-in-Picture API that mirrors the App state.
- **Settings_Panel**: The App screen where the user changes settings.
- **Onboarding_Screen**: The App screen shown on first use that explains the mechanic and offers optional permissions.
- **Main_Screen**: The App screen that shows the candle, the Haunting_Effects and the primary controls.
- **Local_Storage**: The browser localStorage area of the App's origin.
- **Work_Interval**: The period of work between two breaks. Default 20 minutes; configurable from 5 to 90 minutes in 1-minute steps.
- **Work_Elapsed**: The time elapsed in the current Work_Interval, excluding time during a Pause, capped at the Work_Interval length.
- **Due_Time**: The moment at which Work_Elapsed reaches the Work_Interval length.
- **Micro_Break**: A short break ended by the Eye_Ritual.
- **Long_Break**: A longer break ended by the Breathing_Ritual or the Stretch_Ritual.
- **Long_Break_Frequency**: The position of the Long_Break in the break cycle; a value of N makes every Nth break a Long_Break. Default 3; configurable from 1 to 10.
- **Break_Counter**: The number of Micro_Breaks completed since the last Long_Break or the last qualifying Away_Period, capped at Long_Break_Frequency minus 1.
- **Calm_State**: The Scheduler state in which no Haunting is active.
- **Haunting**: The state that starts at the Due_Time and lasts until an Exorcism.
- **Overdue_Duration**: The time elapsed since the Due_Time of the current Haunting, excluding time during which a Ritual is in progress.
- **Escalation_Step**: The Overdue_Duration needed to raise the Haunting_Level by one. Default 2 minutes; configurable from 1 to 10 minutes. A Haunting uses the Escalation_Step in effect when the Haunting started.
- **Haunting_Level**: An integer from 0 to 5 that expresses how overdue the break is; 0 in Calm_State, 1 to 5 during a Haunting.
- **Haunting_Effect**: A visual or audio effect of a Haunting: the extinguished candle, the darkened screen, the ghost, the fog, the cracks, the Whispers and the Possession effect.
- **Possession_Effect**: The Haunting_Effect at Haunting_Level 5, in which the ghost and the fog cover most of the Main_Screen.
- **Whisper**: A short eerie audio cue paired with an on-screen caption that names the due break activity.
- **Ritual**: A guided break activity that ends a Haunting when completed: the Eye_Ritual, the Breathing_Ritual or the Stretch_Ritual.
- **Eye_Ritual**: A 20-second eye-rest Ritual based on the 20-20-20 rule (every 20 minutes, look at something 20 feet away for 20 seconds).
- **Breathing_Ritual**: A guided breathing Ritual of 6 breath cycles that the user follows with a hold input.
- **Stretch_Ritual**: A guided stretching Ritual of 4 timed stretch steps.
- **Exorcism**: The end of a Haunting, either by a completed Ritual (Ritual_Exorcism) or by a qualifying Away_Period (Away_Exorcism).
- **Ritual_Exorcism**: An Exorcism caused by a completed Ritual.
- **Away_Exorcism**: An Exorcism caused by an Away_Period of at least Natural_Break_Duration.
- **Snooze**: A user action during a Haunting that hides the Haunting_Effects for the Snooze_Duration while Overdue_Duration keeps accruing.
- **Snooze_Duration**: The wall-clock length of one Snooze. Default 5 minutes; configurable from 1 to 15 minutes. A Haunting uses the Snooze_Duration in effect when the Haunting started.
- **Pause**: A user action in Calm_State that suspends Work_Elapsed for a chosen wall-clock duration.
- **Away_Period**: A continuous period in which the user is treated as absent: the Idle_Monitor reports the user as idle or the screen as locked, or an Unobserved_Gap is classified as an Away_Period under Requirement 14.
- **Natural_Break_Duration**: The minimum Away_Period length that counts as a break. Default 5 minutes; configurable from 1 to 30 minutes.
- **Gap_Tolerance**: The longest time between two consecutive schedule evaluations of the App that the Scheduler counts as continuous running time: 45 seconds, which is below the smallest configurable Natural_Break_Duration of 1 minute.
- **Unobserved_Gap**: The wall-clock time between two consecutive schedule evaluations of the App, including evaluations before and after an App reload or restart, when that time exceeds the Gap_Tolerance.
- **Unobserved_Gap_Limit**: The longest Unobserved_Gap that an Intervention_Signal can make the Scheduler count as elapsed time: 60 minutes.
- **Intervention_Signal**: A browser report that the browser itself suspended the App: a Chromium freeze event followed by a resume event (an Intervention_Signal of a freeze), or `document.wasDiscarded` set to true when the App reloads (an Intervention_Signal of a discard). Chrome and Edge provide Intervention_Signals; Firefox and Safari provide none.
- **Suspend_Evidence**: The observation that, within one page session (no reload in between), the wall clock (`Date.now()`) advanced at least 30 seconds more than the monotonic clock (`performance.now()`) across an Unobserved_Gap, which indicates that the host device slept. The monotonic clock pauses during device sleep on macOS and Linux but not on Windows, so Suspend_Evidence occurs only on macOS and Linux.
- **Office_Safe_Mode**: The default intensity mode, active whenever Nightmare_Mode is disabled.
- **Nightmare_Mode**: An opt-in intensity mode that enables the Jump_Scare.
- **Jump_Scare**: A sudden full-screen ghost image with a scream sound, lasting at most 2 seconds.
- **Reduced_Motion**: The App state in which moving and scaling effects are replaced with static images and opacity transitions.
- **Flash**: A pair of opposing changes in relative luminance as defined by WCAG 2.2 Success Criterion 2.3.1.
- **Master_Volume**: The overall sound level setting. Default 30%; configurable from 0% to 100% in 5% steps.
- **Demo_Mode**: A mode for judges and the demo video in which schedule time, which drives the Work_Interval and the escalation, runs 60 times faster than wall-clock time (Requirement 25.4).
- **Daily_Log**: The counts of breaks and Snoozes for the current local calendar day.
- **Active_Instance**: The single App tab that runs the Scheduler when the App is open in several tabs of the same mode; normal use and Demo_Mode each have their own Active_Instance.
- **Live_URL**: The public GitHub Pages address of the App, `https://<github-user>.github.io/spooky-break-reminder/`.
- **Repository**: The public GitHub repository named spooky-break-reminder that contains the App source.
- **Deployment_Pipeline**: The GitHub Actions workflow that checks, tests, builds and deploys the App to GitHub Pages.
- **Kiro_Guard**: An automated check script that verifies the /.kiro directory and the LICENSE file meet the submission rules.
- **Test_Suite**: The automated unit tests and Property_Based_Tests of the Repository, run in non-watch mode.
- **Property_Based_Test**: A test that checks a stated property against many generated inputs using the fast-check library.
- **README**: The README.md file at the Repository root.
- **Demo_Video**: The submission video of the App, published on YouTube.
- **Demo_Script**: The timestamped script for the Demo_Video, stored in the Repository.
- **Submission_Checklist**: The dated checklist document in the Repository that tracks every mandatory submission item.
- **Submission_Deadline**: 2026-12-04 14:00 PST (UTC-8), equal to 2026-12-05 06:00 Beijing time (UTC+8). The organizers grant no extension.
- **Kiro**: The AI development environment (IDE, CLI or Web) used to build the App.
- **Spec**: A Kiro specification consisting of requirements.md, design.md and tasks.md under /.kiro/specs/.
- **Steering_Document**: A Kiro steering file under /.kiro/steering/ that gives the Kiro agent persistent project rules.
- **Agent_Hook**: A Kiro hook file under /.kiro/hooks/ that runs an action automatically on an IDE event.

## Requirements

### Requirement 1: Break Schedule

**User Story:** As an office worker, I want breaks scheduled automatically while I work, so that I rest my eyes and body at regular intervals without tracking time myself.

#### Acceptance Criteria

1. THE Scheduler SHALL use a default Work_Interval of 20 minutes.
2. THE Scheduler SHALL classify the next break as a Long_Break when Break_Counter plus 1 equals Long_Break_Frequency, and as a Micro_Break otherwise.
3. WHEN a Haunting for a Micro_Break ends with a Ritual_Exorcism, THE Scheduler SHALL increase Break_Counter by 1.
4. WHEN a Haunting for a Long_Break ends with a Ritual_Exorcism, THE Scheduler SHALL reset Break_Counter to 0.
5. WHEN an Exorcism occurs, THE Scheduler SHALL start a new Work_Interval at the time of the Exorcism.
6. WHEN the Scheduler evaluates the schedule, THE Scheduler SHALL compute Work_Elapsed and Overdue_Duration within 1 second of the true elapsed wall-clock time, independent of the number of timer callbacks the browser delivered.
7. WHILE the App document is visible, THE Scheduler SHALL detect the Due_Time within 1 second after the Due_Time.
8. WHERE the App runs in Chrome, Edge or Firefox, WHILE the App document is hidden, THE Scheduler SHALL detect the Due_Time within 60 seconds after the Due_Time.
9. WHEN the user changes the Work_Interval during Calm_State, THE Scheduler SHALL apply the new Work_Interval length to the current Work_Interval.

### Requirement 2: Calm State Screen

**User Story:** As an office worker, I want to see at a glance how long I have until my next break, so that I can plan my work around the break.

#### Acceptance Criteria

1. WHILE the Scheduler is in Calm_State, THE Main_Screen SHALL display a candle whose visible height is proportional to the remaining time until the Due_Time.
2. WHILE the Scheduler is in Calm_State, THE Main_Screen SHALL display the remaining time until the Due_Time in minutes and seconds.
3. WHILE the Scheduler is in Calm_State, THE Main_Screen SHALL display whether the next break is a Micro_Break or a Long_Break.
4. WHILE the Scheduler is in Calm_State, THE Main_Screen SHALL display an early-break control.
5. WHEN the user activates the early-break control, THE Ritual_Engine SHALL start the Ritual offered for the next break type.
6. WHEN a Ritual started from the early-break control completes, THE Scheduler SHALL record the next break as taken with a Ritual_Exorcism.

### Requirement 3: Haunting Escalation

**User Story:** As an office worker who tends to ignore reminders, I want the App to grow more haunted the longer I delay a break, so that the scare level itself tells me how overdue the break is.

#### Acceptance Criteria

1. WHEN Work_Elapsed reaches the Work_Interval length, THE Scheduler SHALL start a Haunting for the due break type at Haunting_Level 1.
2. WHILE the Scheduler is in Calm_State, THE Scheduler SHALL hold the Haunting_Level at 0.
3. WHILE a Haunting is active, THE Scheduler SHALL set the Haunting_Level to the smaller of 5 and the value 1 plus the number of whole Escalation_Steps contained in the Overdue_Duration.
4. WHILE a Ritual is in progress, THE Scheduler SHALL stop accruing Overdue_Duration.
5. WHILE a Haunting is active, THE Main_Screen SHALL display the Overdue_Duration in whole minutes and the name of the Ritual that ends the Haunting.
6. WHEN an Exorcism occurs, THE Scheduler SHALL end the Haunting and enter Calm_State with Haunting_Level 0.

### Requirement 4: Horror Effects That Carry Break Information

**User Story:** As an office worker, I want each horror effect to convey break information, so that the spooky presentation helps me act instead of only decorating the screen.

#### Acceptance Criteria

1. WHILE the Haunting_Level is 1 or higher, THE Main_Screen SHALL show the extinguished candle, a dark overlay of at least 30% opacity and the ghost at a distance.
2. WHILE the Haunting_Level is 2 or higher, THE Main_Screen SHALL show fog advancing from the screen edges, with the fog coverage growing as the Overdue_Duration grows.
3. WHILE the Haunting_Level is 3 or higher, THE Main_Screen SHALL show cracks across the screen.
4. WHILE the Haunting_Level is 3 or higher, THE Audio_Engine SHALL play a Whisper at random intervals between 20 and 40 seconds.
5. WHILE the Haunting_Level is 4 or higher, THE Main_Screen SHALL show the ghost moving toward the viewer.
6. WHEN the Haunting_Level increases, THE Main_Screen SHALL increase the displayed size of the ghost.
7. WHILE the Haunting_Level is 5, THE Main_Screen SHALL show the Possession_Effect, in which the ghost and the fog cover at least 60% of the Main_Screen area.
8. THE Main_Screen SHALL include at each Haunting_Level every Haunting_Effect of the lower Haunting_Levels.
9. WHILE a Haunting is active, THE Main_Screen SHALL show one additional crack for each Snooze used during the current Haunting.
10. WHILE a Haunting is active, THE Main_Screen SHALL render the Ritual start control and the Snooze control above all Haunting_Effects with a text contrast ratio of at least 4.5:1.
11. WHILE a Ritual is in progress, THE Main_Screen SHALL reduce the intensity of the Haunting_Effects in proportion to the Ritual progress.
12. WHEN a Ritual_Exorcism occurs, THE Main_Screen SHALL dissolve the fog, the cracks and the ghost and relight the candle within 3 seconds.
13. THE App SHALL use Whisper captions that name the activity of the due Ritual.
14. WHEN a Whisper plays, THE App SHALL display the Whisper caption on screen in the active language for the duration of the Whisper.

### Requirement 5: Office-Safe Intensity

**User Story:** As an office worker in a shared space, I want the default horror to be eerie but quiet and free of sudden shocks, so that I can use the App at work without startling myself or my colleagues.

#### Acceptance Criteria

1. WHEN the App starts for the first time, THE App SHALL activate Office_Safe_Mode.
2. THE App SHALL restrict Jump_Scare presentation to periods in which Nightmare_Mode is enabled.
3. WHEN the Haunting_Level increases, THE Main_Screen SHALL transition the Haunting_Effects to the new Haunting_Level over at least 1 second.
4. WHILE Office_Safe_Mode is active, THE Audio_Engine SHALL raise the gain of every sound from silence to the target gain of the sound over at least 2 seconds.

### Requirement 6: Nightmare Mode

**User Story:** As a user who wants a real scare, I want an opt-in Nightmare_Mode with a jump scare, so that ignoring a break for too long becomes unforgettable.

#### Acceptance Criteria

1. THE Settings_Panel SHALL provide a Nightmare_Mode toggle that is off by default.
2. WHEN the user turns on the Nightmare_Mode toggle, THE App SHALL display a content warning that describes the Jump_Scare and the scream sound.
3. WHEN the user confirms the content warning, THE App SHALL enable Nightmare_Mode.
4. IF the user dismisses the content warning without confirming, THEN THE App SHALL keep Nightmare_Mode disabled.
5. WHERE Nightmare_Mode is enabled, WHEN the Haunting_Level reaches 5 while the App document or the Ghost_Window is visible and no Snooze or Ritual is active, THE App SHALL present the Jump_Scare.
6. WHERE Nightmare_Mode is enabled, WHEN the App document or the Ghost_Window becomes visible, a Snooze ends or a Ritual ends without completion during a Haunting at Haunting_Level 5 whose Jump_Scare has not been presented, and at that moment the App document or the Ghost_Window is visible and no Snooze or Ritual is active, THE App SHALL present the Jump_Scare.
7. THE App SHALL present at most one Jump_Scare per Haunting.
8. THE App SHALL end each Jump_Scare within 2 seconds of the Jump_Scare start.
9. WHILE Nightmare_Mode is enabled, THE Main_Screen SHALL display a Nightmare_Mode indicator.
10. WHEN the user disables Nightmare_Mode, THE App SHALL cancel any pending Jump_Scare.
11. WHEN Nightmare_Mode becomes enabled during a Haunting at Haunting_Level 5 whose Jump_Scare has not been presented, THE App SHALL withhold that Jump_Scare until the next moment named in 6.6: the App document or the Ghost_Window becomes visible, a Snooze ends or a Ritual ends without completion.

### Requirement 7: Exorcism Rituals

**User Story:** As an office worker, I want to clear the Haunting by performing a real break activity, so that the scary escalation turns into a healthy habit.

#### Acceptance Criteria

1. WHILE a Haunting for a Micro_Break is active, THE App SHALL offer the Eye_Ritual.
2. WHILE a Haunting for a Long_Break is active, THE App SHALL offer the Breathing_Ritual and the Stretch_Ritual for the user to choose.
3. WHEN the user starts a Ritual, THE Ritual_Engine SHALL display the Ritual instructions in the active language, a progress indicator and an Abandon control.
4. WHEN a Ritual completes, THE Ritual_Engine SHALL report a Ritual_Exorcism to the Scheduler.
5. WHEN the user activates the Abandon control, THE Ritual_Engine SHALL end the Ritual and discard the Ritual progress.
6. WHEN a Ritual ends without completion during a Haunting, THE Main_Screen SHALL restore the Haunting_Effects for the Haunting_Level computed from the Overdue_Duration.
7. IF the document presenting a Ritual becomes hidden while the Ritual is in progress, THEN THE Ritual_Engine SHALL pause the Ritual until the document becomes visible again.
8. IF the document presenting a paused Ritual stays hidden for 60 seconds, THEN THE Ritual_Engine SHALL end the Ritual without completion.
9. THE Ritual_Engine SHALL make every Ritual completable with a keyboard alone and with a pointer alone.

### Requirement 8: Eye Ritual

**User Story:** As a screen worker, I want a 20-second eye ritual that follows the 20-20-20 rule, so that I reduce digital eye strain.

#### Acceptance Criteria

1. WHEN the user starts the Eye_Ritual, THE Ritual_Engine SHALL display an instruction to look at an object at least 6 meters (20 feet) away.
2. WHEN the user starts the Eye_Ritual, THE Ritual_Engine SHALL start a 20-second countdown.
3. WHILE the Eye_Ritual countdown is running, THE App SHALL show a dark screen that contains only the countdown, the instruction and the Abandon control.
4. IF the user presses a key or a pointer button on the Ritual surface outside the Abandon control during the Eye_Ritual countdown, THEN THE Ritual_Engine SHALL restart the countdown at 20 seconds.
5. WHEN the Eye_Ritual countdown reaches zero, THE Audio_Engine SHALL play a completion chime.
6. WHEN the Eye_Ritual countdown reaches zero, THE Ritual_Engine SHALL complete the Eye_Ritual.

### Requirement 9: Breathing Ritual

**User Story:** As a stressed office worker, I want a guided breathing ritual that I follow by holding a key or a pointer, so that I calm down and the App can tell that I took part.

#### Acceptance Criteria

1. WHEN the user starts the Breathing_Ritual, THE Ritual_Engine SHALL guide 6 breath cycles, each consisting of a 4-second inhale phase followed by a 6-second exhale phase.
2. WHILE the Breathing_Ritual is in progress, THE App SHALL display the name of the current phase and a visual timer for the current phase.
3. WHILE the Breathing_Ritual is in progress, THE Audio_Engine SHALL play a cue tone at each phase change.
4. THE Ritual_Engine SHALL accept a held Space key and a held pointer press on the breathing target as the hold input.
5. WHEN the user releases the hold input after holding for 3 to 6 seconds, THE Ritual_Engine SHALL count one completed breath cycle.
6. IF the user releases the hold input after holding for less than 3 seconds or more than 6 seconds, THEN THE Ritual_Engine SHALL display a pacing hint and keep the breath cycle count unchanged.
7. IF the user starts the hold input less than 4 seconds after the previous release, THEN THE Ritual_Engine SHALL display an exhale reminder and exclude that hold from the breath cycle count.
8. WHEN the breath cycle count reaches 6, THE Ritual_Engine SHALL complete the Breathing_Ritual.
9. IF the Breathing_Ritual receives no hold input for 60 seconds, THEN THE Ritual_Engine SHALL end the Breathing_Ritual without completion.

### Requirement 10: Stretch Ritual

**User Story:** As an office worker who sits for hours, I want a short guided stretching ritual, so that I relieve tension in my neck, shoulders and wrists.

#### Acceptance Criteria

1. WHEN the user starts the Stretch_Ritual, THE Ritual_Engine SHALL present 4 stretch steps in this order: neck tilt, shoulder roll, wrist and finger stretch, standing reach.
2. WHILE a stretch step is active, THE App SHALL display an illustration of the stretch, the stretch instruction in the active language and a 20-second step countdown.
3. WHEN a stretch step countdown reaches zero, THE Ritual_Engine SHALL enable the completion control of the stretch step.
4. WHEN the user activates the enabled completion control of the first, second or third stretch step, THE Ritual_Engine SHALL start the next stretch step.
5. WHEN the user activates the enabled completion control of the fourth stretch step, THE Ritual_Engine SHALL complete the Stretch_Ritual.
6. IF an enabled completion control stays unactivated for 60 seconds, THEN THE Ritual_Engine SHALL end the Stretch_Ritual without completion.

### Requirement 11: Snooze

**User Story:** As an office worker in the middle of a task, I want to bargain with the ghost for a few more minutes, so that I can finish my thought, knowing that the Haunting returns stronger.

#### Acceptance Criteria

1. WHILE a Haunting is active and fewer than 3 Snoozes have been used during the current Haunting, THE App SHALL display a Snooze control labeled with the Snooze_Duration.
2. WHEN the user activates the Snooze control, THE App SHALL hide all Haunting_Effects in the App document and in the Ghost_Window for the Snooze_Duration.
3. WHILE a Snooze is active, THE Scheduler SHALL continue accruing Overdue_Duration.
4. WHILE a Snooze is active, THE Audio_Engine SHALL hold the output gain at zero.
5. WHILE a Snooze is active, THE Notifier SHALL withhold Haunting notifications.
6. WHILE a Snooze is active, THE App SHALL display the remaining Snooze time.
7. WHEN a Snooze ends, THE App SHALL resume the Haunting_Effects for the Haunting_Level computed from the full Overdue_Duration, including the snoozed time.
8. IF 3 Snoozes have been used during the current Haunting, THEN THE App SHALL replace the Snooze control with a message stating that the ghost accepts no further bargains for the current Haunting.
9. WHEN the user starts a Ritual while a Snooze is active, THE Scheduler SHALL end the Snooze and keep the Snooze counted toward the 3 Snoozes per Haunting.

### Requirement 12: Pause

**User Story:** As an office worker heading into a meeting, I want to pause reminders for a set time, so that the App stays silent while I present or talk.

#### Acceptance Criteria

1. WHILE the Scheduler is in Calm_State, THE Main_Screen SHALL offer a Pause control with the durations 30 minutes, 60 minutes, 120 minutes and until resumed.
2. WHILE a Pause is active, THE Scheduler SHALL stop accruing Work_Elapsed.
3. WHILE a Pause is active, THE Main_Screen SHALL display the remaining Pause time and a Resume control.
4. WHILE a Pause is active, THE Notifier SHALL withhold all notifications.
5. WHEN the Pause duration ends, THE Scheduler SHALL resume accruing Work_Elapsed from the value recorded when the Pause started.
6. WHEN the user activates the Resume control, THE Scheduler SHALL end the Pause and resume accruing Work_Elapsed from the value recorded when the Pause started.
7. WHILE a Pause is active, THE Scheduler SHALL defer the start of a Haunting until the Pause ends, including when the user shortens the Work_Interval to a length at or below the Work_Elapsed value recorded by the Pause.

### Requirement 13: Away Detection

**User Story:** As an office worker who leaves the desk for meetings or lunch, I want the App to notice that I stepped away, so that a real absence counts as a break and I am not haunted on my return.

#### Acceptance Criteria

1. WHERE the browser supports the Idle Detection API, THE Settings_Panel SHALL provide an away-detection toggle that is off by default.
2. WHEN the user turns on the away-detection toggle, THE Idle_Monitor SHALL request the idle-detection permission.
3. WHILE away detection is on and the idle-detection permission is granted, THE Idle_Monitor SHALL record an Away_Period that lasts from the start of user inactivity or screen lock until the next user activity, using a detection threshold of 60 seconds.
4. WHEN an Away_Period of at least Natural_Break_Duration ends during Calm_State, THE Scheduler SHALL reset Work_Elapsed to zero, including the Work_Elapsed value recorded by an active Pause, and reset Break_Counter to 0.
5. WHEN an Away_Period of at least Natural_Break_Duration ends during a Haunting, THE Scheduler SHALL end the Haunting with an Away_Exorcism and reset Break_Counter to 0.
6. WHEN an Away_Period of at least Natural_Break_Duration ends, THE Main_Screen SHALL display a welcome-back message that states the length of the Away_Period in whole minutes.
7. WHILE the Idle_Monitor reports the user as idle or the screen as locked, THE Audio_Engine SHALL hold the output gain at zero.
8. IF the browser lacks the Idle Detection API, THEN THE Settings_Panel SHALL state that away detection requires Chrome or Edge on desktop.
9. IF the user denies the idle-detection permission, THEN THE App SHALL turn off away detection and display instructions for granting the permission in the browser site settings.
10. WHILE away detection is unavailable or off, THE App SHALL keep every Ritual_Exorcism feature and every Away_Period rule of Requirement 14 available.

### Requirement 14: Schedule Continuity

**User Story:** As an office worker, I want the schedule to survive reloads, device sleep and closed tabs, so that the App neither loses my progress nor haunts me after I was away.

#### Acceptance Criteria

1. THE App SHALL persist the schedule state to Local_Storage on every Scheduler state transition and at least once every 30 seconds while running.
2. WHEN the App starts after having stopped running for less than Natural_Break_Duration, THE Scheduler SHALL restore the persisted schedule state and count the stopped time as elapsed time.
3. WHEN the App starts after having stopped running for at least Natural_Break_Duration, THE Scheduler SHALL treat the stopped time as an Away_Period.
4. IF the App reloads with an Intervention_Signal of a discard and the Unobserved_Gap is at most the Unobserved_Gap_Limit, THEN THE Scheduler SHALL restore the persisted schedule state and count the Unobserved_Gap as elapsed time.
5. IF an Unobserved_Gap of at least Natural_Break_Duration begins while the Idle_Monitor reports neither an idle user nor a locked screen, and the Unobserved_Gap has Suspend_Evidence, has no Intervention_Signal or exceeds the Unobserved_Gap_Limit, THEN THE Scheduler SHALL treat the Unobserved_Gap as an Away_Period.
6. IF the App resumes after an Intervention_Signal of a freeze, without Suspend_Evidence, and the Unobserved_Gap is at most the Unobserved_Gap_Limit, THEN THE Scheduler SHALL count the Unobserved_Gap as elapsed time.
7. IF the system clock moves backwards, THEN THE Scheduler SHALL treat the backward step as zero elapsed time.
8. WHERE the browser provides no Intervention_Signal, THE Scheduler SHALL apply Requirements 14.2 and 14.3 to every Unobserved_Gap.

### Requirement 15: System Notifications

**User Story:** As an office worker working in other windows, I want a system notification when a Haunting starts or worsens, so that I notice a due break while the App tab is hidden.

#### Acceptance Criteria

1. WHEN the user activates the notification enable control, THE Notifier SHALL request the browser notification permission.
2. WHILE the notification permission is granted and the App document is hidden, WHEN a Haunting starts, a Snooze reaches the end of its Snooze_Duration or the Haunting_Level reaches 5, THE Notifier SHALL display a system notification that states the break type, the Haunting_Level and the Overdue_Duration in the active language.
3. THE Notifier SHALL replace the previous Haunting notification with each new Haunting notification.
4. WHEN the user clicks a Haunting notification, THE App SHALL bring the App tab to the foreground and display the offered Ritual.
5. WHEN a Haunting ends, THE Notifier SHALL close every open Haunting notification that the Notifier displayed since the App document was last loaded.
6. IF the notification permission is denied or the browser lacks the Notifications API, THEN THE Settings_Panel SHALL display the notification status and instructions for changing the permission in the browser site settings.

### Requirement 16: Tab Title and Favicon

**User Story:** As an office worker with many tabs open, I want the App tab title and icon to show the Haunting state, so that I can read the break status from the tab strip.

#### Acceptance Criteria

1. WHILE the Scheduler is in Calm_State, THE App SHALL set the document title to the remaining time until the Due_Time in whole minutes, rounded up.
2. WHILE a Haunting is active, THE App SHALL set the document title to the Haunting_Level and the Overdue_Duration in whole minutes in the active language.
3. WHERE the browser applies favicon changes made by the page, WHILE a Haunting is active, THE App SHALL display the favicon assigned to the current Haunting_Level, with a distinct favicon for each of the 5 Haunting_Levels.
4. WHERE the browser applies favicon changes made by the page, WHILE the Scheduler is in Calm_State, THE App SHALL display the candle favicon.
5. WHILE a Snooze or a Pause is active, THE App SHALL include a snoozed or paused indicator in the document title.
6. WHEN the Scheduler state, the remaining whole minutes or the Haunting_Level changes, THE App SHALL update the document title and the favicon within 1 second while the App document is visible and, in Chrome, Edge and Firefox, within 60 seconds while the App document is hidden.

### Requirement 17: Ghost Window

**User Story:** As an office worker who keeps the App tab in the background, I want an optional floating ghost that stays on top of my other windows, so that I see the Haunting grow while I work.

#### Acceptance Criteria

1. WHERE the browser supports the Document Picture-in-Picture API, THE Main_Screen SHALL display a control that opens the Ghost_Window.
2. WHEN the user activates the Ghost_Window control, THE App SHALL open the Ghost_Window as an always-on-top window with an initial size of at most 320 by 320 CSS pixels.
3. WHILE the Ghost_Window is open during Calm_State, THE Ghost_Window SHALL display the candle and the remaining time until the Due_Time.
4. WHILE the Ghost_Window is open during a Haunting, THE Ghost_Window SHALL display the Haunting_Effects for the current Haunting_Level, a Ritual start control and the Snooze control.
5. WHEN the user activates the Ritual start control in the Ghost_Window, THE App SHALL present the offered Ritual.
6. WHEN the user closes the Ghost_Window, THE App SHALL continue signaling Hauntings through the App document, the document title, the favicon and the Notifier.
7. IF the browser lacks the Document Picture-in-Picture API, THEN THE Settings_Panel SHALL state that the Ghost_Window requires a desktop browser that supports Document Picture-in-Picture, such as Chrome, Edge or Firefox 151 or later.

### Requirement 18: Audio

**User Story:** As an office worker, I want control over the App's sounds, so that whispers and cues help me without disturbing others.

#### Acceptance Criteria

1. THE Audio_Engine SHALL start audio output only after the first user gesture on the App.
2. IF the browser blocks audio output, THEN THE App SHALL display an enable-sound control and continue the visual presentation.
3. THE Settings_Panel SHALL provide a Master_Volume control and a Mute toggle.
4. THE Audio_Engine SHALL cap the gain of every sound, including the Jump_Scare sound, at the Master_Volume.
5. WHILE Mute is on, THE Audio_Engine SHALL hold the output gain at zero.
6. THE Audio_Engine SHALL set the Whisper gain to 40%, 70% and 100% of the Master_Volume at Haunting_Levels 3, 4 and 5 respectively.
7. WHILE the App document is hidden, THE Audio_Engine SHALL continue playing Whispers.

### Requirement 19: Accessibility and Visual Safety

**User Story:** As a user with motion sensitivity, photosensitivity or a disability, I want the horror effects to stay safe and the App to remain operable, so that I can use the App without harm.

#### Acceptance Criteria

1. WHEN the operating system reports a reduced-motion preference, THE App SHALL activate Reduced_Motion.
2. THE Settings_Panel SHALL provide a Reduced_Motion setting that overrides the operating system preference.
3. WHILE Reduced_Motion is active, THE App SHALL replace every moving and scaling effect, including the Jump_Scare, with static images and opacity transitions.
4. THE App SHALL limit every visual effect, including the Jump_Scare, to at most 3 Flashes in any 1-second period.
5. THE App SHALL make every control operable by keyboard alone with a visible focus indicator.
6. THE App SHALL render control labels, countdowns and status text with a contrast ratio of at least 4.5:1 against the background at every Haunting_Level.
7. WHEN the Haunting_Level changes, THE App SHALL announce the new Haunting_Level and the due Ritual to assistive technology through a polite live region.
8. THE App SHALL render without horizontal scrolling at viewport widths from 360 to 2560 CSS pixels.
9. THE App SHALL score at least 90 in the Lighthouse accessibility audit of the Live_URL.
10. WHILE the App document is hidden, THE App SHALL stop rendering visual animation frames in the App document.

### Requirement 20: Language Switch

**User Story:** As a bilingual user, I want to switch the interface between Simplified Chinese and English, so that both my colleagues and international judges can read the App.

#### Acceptance Criteria

1. THE App SHALL provide all user-facing text in English and Simplified Chinese, including Ritual instructions, Whisper captions, notifications, the document title and the Ghost_Window.
2. WHEN the App starts with no persisted language, THE App SHALL select Simplified Chinese if the preferred browser language begins with "zh", and English otherwise.
3. WHEN the user selects a language, THE App SHALL display all user-facing text in the selected language within 1 second without reloading the page.
4. WHEN the active language changes, THE App SHALL set the document language attribute to "en" or "zh-CN" to match the active language.
5. THE App SHALL persist the selected language and apply the persisted language on later starts.
6. IF a text key lacks a translation in the active language, THEN THE App SHALL display the English text for that key.

### Requirement 21: Settings and Local Data

**User Story:** As a user, I want to tune the schedule and keep my data on my device, so that the App fits my workday and respects my privacy.

#### Acceptance Criteria

1. THE Settings_Panel SHALL let the user configure Work_Interval, Long_Break_Frequency, Escalation_Step, Snooze_Duration, Natural_Break_Duration and Master_Volume within the ranges defined in the Glossary.
2. IF the user enters a setting value outside the defined range, THEN THE Settings_Panel SHALL keep the previous value and display the valid range.
3. WHEN the user changes a setting, THE App SHALL persist the setting to Local_Storage within 1 second.
4. IF the persisted data is unreadable or fails schema validation, THEN THE App SHALL load the default settings, start a new Work_Interval and display a notice that the saved data was reset.
5. IF Local_Storage is unavailable or full, THEN THE App SHALL continue operating with in-memory state and display a notice that changes will not be saved.
6. WHEN the user confirms the erase-all-data control, THE App SHALL delete all App data from Local_Storage and restore the default settings.
7. THE App SHALL store all user data exclusively in Local_Storage on the user's device.
8. THE App SHALL load all scripts, styles, fonts, images and audio files from the App's own origin.

### Requirement 22: Single Active Tab

**User Story:** As a user who opens the App twice by accident, I want only one tab to run the Haunting, so that I do not get duplicate notifications and sounds.

#### Acceptance Criteria

1. WHEN the App starts while another App tab is the Active_Instance, THE App SHALL display a notice that the Haunting runs in another tab, together with a take-over control.
2. WHILE an App tab is not the Active_Instance, THE App SHALL suspend scheduling, notifications and audio in the inactive App tab.
3. WHEN the user activates the take-over control, THE App SHALL make the current App tab the Active_Instance within 2 seconds.
4. WHEN the Active_Instance closes while another App tab is open, THE App SHALL make one remaining App tab the Active_Instance within 5 seconds.

### Requirement 23: Daily Exorcism Log

**User Story:** As an office worker, I want to see how many breaks I took today, so that I stay motivated to keep the habit.

#### Acceptance Criteria

1. THE App SHALL record in the Daily_Log the number of completed Rituals per Ritual type, the number of Away_Exorcisms and the number of Snoozes for the current local calendar day.
2. THE Main_Screen SHALL display the current Daily_Log counts.
3. WHEN the local calendar day changes, THE App SHALL reset the Daily_Log counts to zero.

### Requirement 24: Onboarding

**User Story:** As a first-time user or a judge, I want a short introduction to the Haunting mechanic and the optional permissions, so that I understand the App quickly and decide what to enable.

#### Acceptance Criteria

1. WHEN the App starts with no persisted data, THE App SHALL display the Onboarding_Screen.
2. THE Onboarding_Screen SHALL explain the escalation mechanic, the three Rituals and the difference between Office_Safe_Mode and Nightmare_Mode in at most 120 words in the active language.
3. THE Onboarding_Screen SHALL offer separate optional controls to enable notifications, away detection and the Ghost_Window.
4. THE App SHALL request each browser permission only in response to the user activating the control for that permission.
5. THE Onboarding_Screen SHALL offer a control that enables Demo_Mode.
6. WHEN the user activates the start control on the Onboarding_Screen, THE Scheduler SHALL start the first Work_Interval.
7. WHEN the user activates the start control on the Onboarding_Screen, THE Audio_Engine SHALL unlock audio output.

### Requirement 25: Demo Mode

**User Story:** As a hackathon judge or demo presenter, I want to fast-forward time, so that I can see every Haunting_Level within a minute instead of waiting 20 minutes.

#### Acceptance Criteria

1. WHEN the App URL contains the query parameter demo=1, THE App SHALL enable Demo_Mode.
2. THE Settings_Panel SHALL provide a Demo_Mode toggle.
3. WHERE Demo_Mode is enabled, THE Scheduler SHALL advance Work_Elapsed and Overdue_Duration 60 times faster than wall-clock time.
4. THE App SHALL use schedule time only for the Work_Interval candle and the escalation, which are Work_Elapsed and Overdue_Duration. In every mode, including Demo_Mode, the Snooze countdown, the Pause countdown, every Ritual countdown and every Whisper interval SHALL run on wall-clock time. In every mode, a Snooze_Duration and a Pause duration SHALL last their stated wall-clock length, so in Demo_Mode a 5 minute Snooze lasts 5 minutes of wall-clock time.
5. WHERE Demo_Mode is enabled, THE Scheduler SHALL use a Natural_Break_Duration of 1 minute of wall-clock time.
6. WHERE Demo_Mode is enabled, THE Main_Screen SHALL display a persistent "Demo x60" indicator.
7. WHERE Demo_Mode is enabled, THE App SHALL keep Demo_Mode activity separate from the Daily_Log and from the persisted schedule state of normal use.

### Requirement 26: Build, Deployment and Browser Support

**User Story:** As the team, I want every push to the main branch deployed automatically to a working public URL, so that the live App the judges open is current and never a blank page.

#### Acceptance Criteria

1. THE App SHALL be a static single-page application served at the Live_URL over HTTPS.
2. THE Deployment_Pipeline SHALL build the App with every asset URL prefixed by the base path /spooky-break-reminder/.
3. WHEN a commit is pushed to the main branch, THE Deployment_Pipeline SHALL run the Kiro_Guard, the TypeScript type check and the Test_Suite, build the App and deploy the build output to GitHub Pages.
4. IF the Kiro_Guard, the type check or the Test_Suite fails, THEN THE Deployment_Pipeline SHALL stop before deployment and mark the workflow run as failed.
5. WHEN a deployment completes, THE Deployment_Pipeline SHALL request the Live_URL and the main script asset of the deployed page.
6. IF the Live_URL or the main script asset returns an HTTP status other than 200 after deployment, THEN THE Deployment_Pipeline SHALL mark the workflow run as failed.
7. THE App SHALL provide the Calm_State screen, Hauntings, Rituals, Snooze, Pause, the Settings_Panel and the language switch in the latest stable desktop versions of Chrome, Edge, Firefox and Safari.

### Requirement 27: Repository Compliance and Kiro Guard

**User Story:** As the team, I want the Repository to satisfy every mandatory submission rule with automated checks, so that a missing license or an ignored /.kiro directory cannot disqualify the entry.

#### Acceptance Criteria

1. THE Repository SHALL be a public GitHub repository whose first commit is dated after 2026-10-30.
2. THE Repository SHALL contain a file named LICENSE at the Repository root with the MIT License text, the year 2026 and the name of the copyright holder.
3. THE Repository SHALL contain the /.kiro directory at the Repository root, with every Spec, Steering_Document and Agent_Hook file committed to version control.
4. THE Repository SHALL contain a .gitignore file whose patterns match no path under /.kiro.
5. IF a .gitignore pattern matches a path under /.kiro, THEN THE Kiro_Guard SHALL exit with a non-zero status and print the matching pattern.
6. IF /.kiro contains no file tracked by git, THEN THE Kiro_Guard SHALL exit with a non-zero status and print the failed condition.
7. IF the LICENSE file is missing from the Repository root, THEN THE Kiro_Guard SHALL exit with a non-zero status and print the missing file name.
8. THE Kiro_Guard SHALL run locally through a single npm script.

### Requirement 28: Kiro Development Artifacts

**User Story:** As the team, I want our Kiro Specs, Steering_Documents and Agent_Hooks committed and in active use, so that the "How we built it with Kiro" write-up is backed by real files the judges can inspect.

#### Acceptance Criteria

1. THE Repository SHALL contain requirements.md, design.md and tasks.md for this feature under /.kiro/specs/spooky-break-reminder/.
2. THE Repository SHALL contain Steering_Documents under /.kiro/steering/ that cover the product rules (including the horror-safety rules of Requirements 5 and 19), the technical conventions and the project structure.
3. THE Repository SHALL contain an Agent_Hook under /.kiro/hooks/ that runs the Test_Suite when a source file is saved.
4. THE Repository SHALL contain an Agent_Hook under /.kiro/hooks/ that runs the translation key parity check when a locale file is saved.
5. THE Repository SHALL contain an Agent_Hook under /.kiro/hooks/ that runs the Kiro_Guard when the .gitignore file is saved.

### Requirement 29: Automated Tests

**User Story:** As the team, I want property-based and unit tests for the timing and escalation logic, so that the core mechanic stays correct while we iterate fast.

#### Acceptance Criteria

1. THE Test_Suite SHALL run to completion through a single command in non-watch mode.
2. THE Test_Suite SHALL include a Property_Based_Test verifying that, for generated sequences of schedule events, the Haunting_Level is 0 in Calm_State, stays between 1 and 5 during a Haunting and does not decrease while the Overdue_Duration increases.
3. THE Test_Suite SHALL include a Property_Based_Test verifying that every Long_Break_Frequency-th break is a Long_Break.
4. THE Test_Suite SHALL include a Property_Based_Test verifying that a Snooze leaves the accrual of Overdue_Duration unchanged and that the Scheduler accepts at most 3 Snoozes per Haunting.
5. THE Test_Suite SHALL include a Property_Based_Test verifying that Pause time is excluded from Work_Elapsed and that a backward clock step adds zero elapsed time.
6. THE Test_Suite SHALL include a Property_Based_Test verifying that every Away_Period of at least Natural_Break_Duration leads to Calm_State with Work_Elapsed of zero.
7. THE Test_Suite SHALL include a Property_Based_Test verifying that the Breathing_Ritual counts exactly the valid holds and completes at the sixth valid hold.
8. THE Test_Suite SHALL include a Property_Based_Test verifying that persisting and then loading any valid settings yields equal settings, and that loading invalid data yields the default settings.
9. THE Test_Suite SHALL include a check that the English and Simplified Chinese translation files define identical key sets.

### Requirement 30: README

**User Story:** As a hackathon judge, I want an English README that explains the features and how Kiro was used, so that I can evaluate the entry without asking questions.

#### Acceptance Criteria

1. THE README SHALL be written in English.
2. THE README SHALL contain the Live_URL, the Demo_Mode URL and the Demo_Video URL within the first 20 lines.
3. THE README SHALL contain a feature description with a table that maps each Haunting_Effect to the break information that the Haunting_Effect conveys.
4. THE README SHALL contain a section titled "How we built it with Kiro" that describes the use of Specs, Steering_Documents, Agent_Hooks and Property_Based_Tests and links to the corresponding files under /.kiro.
5. THE README SHALL contain a browser support table that lists the features with limited browser support and the fallback behavior.
6. THE README SHALL contain safety notes on Office_Safe_Mode, Nightmare_Mode, the Jump_Scare content warning, Reduced_Motion and the Flash limit.
7. THE README SHALL state that all user data stays in the Local_Storage of the user's browser.
8. THE README SHALL contain local development instructions, including the npm.cmd form of each command for Windows PowerShell.
9. THE README SHALL contain at least 3 screenshots or animated images that show Calm_State, a Haunting at Haunting_Level 3 or higher, and a Ritual.
10. THE README SHALL name the MIT License and link to the LICENSE file.

### Requirement 31: Demo Video

**User Story:** As the team, I want a demo video under three minutes that shows the mechanic and our Kiro workflow, so that the Presentation score reflects the work.

#### Acceptance Criteria

1. THE Demo_Video SHALL have a duration of at most 3 minutes 0 seconds.
2. THE Repository SHALL contain the Demo_Script with timestamped segments that total at most 2 minutes 50 seconds.
3. THE Demo_Video SHALL be published on YouTube with the visibility set to Public.
4. THE Demo_Video SHALL include English subtitles for all narration and on-screen speech.
5. THE Demo_Video SHALL display a jump-scare content warning before the first Jump_Scare appears.
6. THE Demo_Video SHALL show the escalation from Haunting_Level 1 to Haunting_Level 5, one completed Ritual, a Snooze that returns at a higher Haunting_Level, the Ghost_Window or a system notification, the language switch and a Nightmare_Mode Jump_Scare.
7. THE Demo_Video SHALL show the Kiro workflow, including the Spec files, one Agent_Hook run and the Property_Based_Test results.
8. THE Demo_Video SHALL use only audio and imagery that the team created or that is licensed for public reuse.

### Requirement 32: Submission Checklist and Schedule

**User Story:** As the team, I want a dated checklist of every mandatory item, so that we submit a complete entry before the deadline with time to spare.

#### Acceptance Criteria

1. THE Submission_Checklist SHALL list every mandatory submission item: a project created after 2026-10-30 and built with Kiro, the public Repository, the MIT LICENSE file at the Repository root, the committed /.kiro directory that no .gitignore pattern matches, the working Live_URL, the English feature description with the "How we built it with Kiro" write-up, and the public Demo_Video of at most 3 minutes.
2. THE Submission_Checklist SHALL state, for each item, the verification method, the owner and the verification date.
3. THE Submission_Checklist SHALL state the Submission_Deadline as 2026-12-04 14:00 PST (UTC-8), equal to 2026-12-05 06:00 Beijing time (UTC+8).
4. THE Submission_Checklist SHALL set the internal submission target to 2026-12-04 06:00 Beijing time, 24 hours before the Submission_Deadline.
5. THE Submission_Checklist SHALL include the steps to make the Repository public and to set the GitHub Pages source to "GitHub Actions" in the Repository settings.
6. THE Submission_Checklist SHALL schedule these milestones: a placeholder page live at the Live_URL by 2026-11-21; the Scheduler, the escalation and the Rituals by 2026-11-27; notifications, the Ghost_Window, Nightmare_Mode, the language switch and accessibility by 2026-11-30; the README and screenshots by 2026-12-01; the Demo_Video published by 2026-12-03.
7. THE Submission_Checklist SHALL include a final verification step, performed in a logged-out private browser window, that opens the Repository, the LICENSE file, the /.kiro directory, the Live_URL and the Demo_Video.
