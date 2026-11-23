---
inclusion: always
---

# Product Rules: Spooky Break Reminder

Source of truth: `.kiro/specs/spooky-break-reminder/requirements.md` (requirement numbers below refer to it) and `design.md`. If this file and the spec disagree, the spec wins and this file must be corrected.

## The mechanic

- While the user works, a candle burns down to show the time left until the next break (Work_Interval, default 20 minutes).
- When the candle goes out at the Due_Time, a Haunting starts at Haunting_Level 1 (Requirement 3.1).
- Haunting_Level rises with the overdue time: level = min(5, 1 + whole Escalation_Steps overdue). Default Escalation_Step is 2 minutes (Requirement 3.3).
- Each level adds effects that carry break information (Requirement 4):
  - Level 1: candle out, dark veil of at least 30%, a small distant ghost. Meaning: the break is due now.
  - Level 2: fog from the screen edges, deeper as the user gets more overdue. Meaning: drifting further overdue.
  - Level 3: cracks across the screen, and Whispers that name the due Ritual. Each Snooze adds one crack.
  - Level 4: the ghost moves toward the viewer. Meaning: last warning.
  - Level 5: Possession. Fog and ghost cover at least 60% of the screen.
- A Haunting ends only through a Ritual_Exorcism (a completed Ritual) or an Away_Exorcism (an absence of at least Natural_Break_Duration). There is no "skip break" control (Requirements 1.5, 3.6, 13.5).
- Rituals are real break activities: the Eye_Ritual (20-20-20 rule, 20 seconds) for a Micro_Break, and the Breathing_Ritual or the Stretch_Ritual for a Long_Break (Requirement 7).
- Snooze hides the Haunting_Effects for the Snooze_Duration (default 5 minutes, at most 3 per Haunting). Overdue time keeps accruing during a Snooze, so the Haunting returns stronger (Requirement 11).
- Pause (30, 60, 120 minutes or until resumed) exists only in Calm_State (Requirement 12).
- Every Haunting_Effect must keep carrying break information. Do not add a decorative effect that does not map to a Haunting_Level or a Ritual.

## Office_Safe defaults

Office_Safe_Mode is the default and is active whenever Nightmare_Mode is off (Requirement 5.1).

- Eerie, dim, quiet and slow. The screen corrupts gradually.
- No Jump_Scare and no scream outside Nightmare_Mode (Requirement 5.2).
- Every sound rises from silence to its target gain over at least 2 seconds (Requirement 5.4 and the 2.5 s ramp in the design). No sudden loud sounds.
- Screen transitions between Haunting_Levels take at least 1 second (Requirement 5.3). A level increase takes 1.2 s and the dissolve after a Ritual_Exorcism takes 2.5 s.
- Defaults: Work_Interval 20 minutes, Long_Break every 3rd break, Escalation_Step 2 minutes, Snooze_Duration 5 minutes, Natural_Break_Duration 5 minutes, Master_Volume 30%, Nightmare_Mode off, away detection off, Reduced_Motion from the operating system.
- Settings ranges: Work_Interval 5 to 90 minutes (1-minute steps); Long_Break_Frequency 1 to 10; Escalation_Step 1 to 10 minutes; Snooze_Duration 1 to 15 minutes, at most 3 Snoozes per Haunting; Natural_Break_Duration 1 to 30 minutes; Master_Volume 0 to 100% in 5% steps.

## Nightmare_Mode

- Opt-in, off by default (Requirement 6.1).
- Turning it on shows a content warning that describes the Jump_Scare and the scream. The mode turns on only after the user confirms. Dismissing the warning keeps it off (Requirements 6.2 to 6.4).
- A Jump_Scare is a full-screen ghost image with a scream. It lasts at most 2 seconds (Requirement 6.8), and the timeline is rise 60 ms, hold 1 200 ms, fade 300 ms (1 560 ms in total).
- At most one Jump_Scare per Haunting (Requirement 6.7).
- A pending Jump_Scare is held while a Snooze or a Ritual is active. It is presented only at the moments named in Requirement 6.6. Turning Nightmare_Mode on from the Settings_Panel never fires a Jump_Scare on the spot (Requirement 6.11).
- Disabling Nightmare_Mode cancels any pending Jump_Scare (Requirement 6.10).
- While Nightmare_Mode is on, show a visible Nightmare_Mode indicator on the Main_Screen (Requirement 6.9).

## Horror-safety rules

These rules apply to every visual effect, every sound and every screen, in both intensity modes.

- Flash limit: at most 3 Flashes in any 1-second period, including the Jump_Scare (Requirement 19.4). The Flash_Guard defers any target that reverses the luminance direction within 500 ms of the previous reversal.
- Reduced_Motion: activated by the operating system preference (Requirement 19.1). The Settings_Panel can override it (Requirement 19.2). While it is active, replace every moving or scaling effect, including the Jump_Scare, with static images and opacity transitions (Requirement 19.3). Animation frames stop while the App document is hidden (Requirement 19.10).
- Contrast: control labels, countdowns and status text keep a contrast ratio of at least 4.5:1 against their background at every Haunting_Level. Use opaque panels behind text over the effects (Requirements 19.6 and 4.10).
- Keyboard and pointer: every control works with the keyboard alone and with the pointer alone, with a visible focus indicator. Every Ritual is completable by either input method (Requirements 19.5 and 7.9).
- Live updates: announce each Haunting_Level change and the due Ritual through a polite live region (Requirement 19.7).
- Layout: no horizontal scrolling from 360 to 2560 CSS pixels (Requirement 19.8).
- Audio starts only after a user gesture (Requirement 18.1). If the browser blocks audio, show an enable-sound control and keep the visual presentation running (Requirement 18.2).
- Gain caps: every sound, the Jump_Scare sound included, stays at or below Master_Volume (Requirement 18.4). Mute holds the output gain at zero (Requirement 18.5), and so does an active Snooze (Requirement 11.4).
- Whisper gain is 40%, 70% and 100% of Master_Volume at Haunting_Levels 3, 4 and 5 (Requirement 18.6). Each Whisper shows a caption that names the due activity, in the active language, for the duration of the Whisper (Requirements 4.13 and 4.14).

## Privacy and scope

- All user data stays in the browser's localStorage. There is no backend, no account, no analytics and no cross-device sync (Requirement 21 and the Out of Scope list).
- The App does not use the camera, the microphone or any biometric check. Break verification uses timers, clicks and key presses only.
- Away detection through the Idle Detection API is optional, off by default, Chromium-only and permission-gated (Requirement 13).
- Out-of-tab signals (notifications, the title and favicon, and the Ghost_Window) are optional and degrade gracefully.

## Language

- The UI offers English and Simplified Chinese (Requirement 20). Spec, README and Demo_Video subtitles stay in English.
- Every user-facing string goes through the translation function. Each new key goes into both locale files.

## Demo_Mode

- Opened with `?demo=1`. Schedule time runs 60 times faster than wall-clock time, so the whole escalation shows within a few minutes (Requirement 25).
- Only the Work_Interval candle and the escalation run on schedule time, 60 times faster in Demo_Mode. The Snooze, Pause and Ritual countdowns, the Snooze and Pause lengths, and Whisper timing run at wall-clock speed in every mode (Requirement 25.4).
- Demo_Mode uses its own storage namespace and its own lock name, so it never changes normal-use data (Requirement 25.7).
