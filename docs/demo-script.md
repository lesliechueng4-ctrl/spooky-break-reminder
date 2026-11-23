# Demo Script: Spooky Break Reminder

This script drives the Demo_Video (Requirement 31). Times are m:ss from the start of the video.

**Running time: 2:50 (170 seconds).** The segments run from 0:00 to 2:50. That meets the 2:50 limit for the segments (31.2) and the 3:00 limit for the video (31.1), with no spare seconds under the segment limit. The narration, which is also the English caption text, totals 117 words, within the 120-word limit.

## Setup

- Browser: Chrome on desktop, in a fresh profile, with notifications off.
- Open the Live_URL with `?demo=1`. Demo_Mode runs the candle and the escalation 60 times faster, shows the "Demo x60" badge (25.6) and keeps its data apart from normal use (25.7).
- Use default settings, except the two settings below.

**Setup note: Snooze_Duration is 1 minute for this demo.** Before the recording starts, open Settings and set Snooze_Duration to 1 minute. Set it before the first Start click, because a Haunting uses the Snooze_Duration in effect when the Haunting starts (Glossary). Nightmare_Mode is turned on in the video at 0:12. Snooze and Ritual lengths run in wall-clock time (25.4), so the Snooze lasts 1 real minute on camera.

- Record the App footage from 0:12 to 2:13 in one take. The Snooze is shown in real time and is not cut.

## Shot list

| Start | End | Segment | On-screen action | Narration (English caption) | Words |
|---|---|---|---|---|---|
| 0:00 | 0:08 | Hook | Black screen, one candle flame flickering, title "Spooky Break Reminder". No App footage. | "Ignore your break and this app starts to haunt you." | 10 |
| 0:08 | 0:12 | Demo start | Open the Live_URL with `?demo=1` and show the Onboarding screen. Click Start at 0:12. The first Work_Interval starts and the "Demo x60" badge shows. | "Demo mode runs the candle 60x faster." | 7 |
| 0:12 | 0:24 | Nightmare_Mode | Calm Main_Screen with the candle lit. Open Settings and turn on Nightmare_Mode. The content warning describes the Jump_Scare and the scream. Click "I understand, enable". The Nightmare indicator shows on the Main_Screen. Close Settings. | "Office-safe is the default. Nightmare Mode is opt-in." | 8 |
| 0:24 | 0:32 | Ghost Window | Click the Ghost Window control on the Main_Screen. Click a text editor so the Ghost Window floats above it and shows the candle. The candle burns down and goes out at 0:32, which starts Haunting_Level 1 (dark veil, small ghost). | "The Ghost Window floats above other apps." | 7 |
| 0:32 | 0:38 | Levels 1 to 4 | Click the App tab at 0:32. Level 2 at 0:34: fog creeps in from the edges. Level 3 at 0:36: cracks appear. Level 4 at 0:38: the ghost moves toward the viewer. Click the Snooze control at 0:38 (labelled 1 min). | "The candle goes out, then fog, cracks and a closer ghost." | 11 |
| 0:38 | 1:38 | Snooze | The Haunting_Effects hide in the App and in the Ghost Window. The Snooze control becomes a countdown of the remaining time, from 1:00 down to 0:00, shown in the App. Overdue time keeps accruing for the full minute. | "Snooze hides the ghost. Overdue time keeps running." | 8 |
| 1:38 | 1:40 | Jump_Scare | The Snooze ends with about 66 minutes overdue: about 6 minutes before the Snooze, plus about 60 minutes accrued during it. The Haunting returns at Haunting_Level 5. The Jump_Scare plays: a full-screen ghost with a scream, about 1.6 s. | "Snooze ends at level five. Nightmare Mode jumps." | 8 |
| 1:40 | 2:00 | Eye Ritual | Click the Eye_Ritual control. The dark screen shows the 20-second countdown, the instruction and the Abandon control. Do not press a key or click during the countdown. The countdown reaches zero at 2:00 and the chime plays. | "Look at something 20 feet away for 20 seconds." | 9 |
| 2:00 | 2:03 | Ritual_Exorcism | The fog, cracks and ghost dissolve over about 2.5 s and the candle relights. Close the Ghost Window. | "The break ends the haunting, and the candle relights." | 9 |
| 2:03 | 2:13 | Language switch | Open Settings. Choose 简体中文: the screen re-renders in Chinese without a reload. Choose English again. Close Settings. Open the Pause control and choose "until resumed", so no Haunting starts during the Kiro shots. The Pause runs in real time and is cut from the recording, so only its start is shown. The 30-minute Pause is not used. | "Switch the language in Settings." | 5 |
| 2:13 | 2:22 | Kiro: spec files | Editor on `.kiro/specs/spooky-break-reminder/`: scroll through requirements.md, design.md and tasks.md. Then show the `.kiro/steering/` folder. | "Kiro built this from specs, steering files and hooks." | 9 |
| 2:22 | 2:30 | Kiro: hook run | Save a file under `src/`. The run-tests-on-save hook starts `npm.cmd run test` in the terminal. | "Saving a file runs the tests through a Kiro hook." | 10 |
| 2:30 | 2:42 | Kiro: property tests | Terminal output of `npm.cmd run test` (non-watch). The property tests pass, including the Snooze and escalation properties. Hold on the summary line. | "Property-based tests check the scheduler on generated inputs." | 8 |
| 2:42 | 2:50 | Close | Browser on the repository README, showing the Live_URL with `?demo=1` and the MIT License link. No App footage. | "Try the live link with demo mode on." | 8 |

Narration total: 117 words.

## Requirement check

- 31.1 and 31.2: the segments are contiguous and end at 2:50. That is within the 2:50 segment limit and the 3:00 video limit.
- 31.4: English captions come from the Narration column.
- 31.5: the content warning appears from 0:12 to 0:24, before the first Jump_Scare at 1:38.
- 31.6: levels 1 to 4 appear from 0:32 to 0:38. The Snooze runs from 0:38 to 1:38 and returns at Haunting_Level 5 at 1:38. The Ghost Window appears from 0:24 to 0:32. The Eye_Ritual completes at 2:00, the language switch runs from 2:03 to 2:13, and the Jump_Scare runs from 1:38 to 1:40.
- 31.7: the spec files, one hook run and the Property_Based_Test output appear from 2:13 to 2:42.
- 31.8: the audio is the App's own synthesized sound, with no music track.

## Recording notes

- The timings assume default settings except Snooze_Duration, a Start click at 0:12, and a Snooze_Duration of 1 minute set before Start.
- In Demo_Mode, the candle lasts 20 s of wall-clock time (20 minutes of schedule time at 60x). Each level step lasts 2 s of wall-clock time (2 minutes of schedule time at 60x).
- The Snooze lasts 60 s of wall-clock time (25.4). Overdue time accrues at 60x during it, so the Snooze ends at Haunting_Level 5.
- Nightmare_Mode must be on before the Haunting starts at 0:32. Turning it on at level 5 would hold the Jump_Scare until a later moment named in 6.6.
- During the Eye_Ritual countdown, any key press or pointer press outside the Abandon control restarts the countdown at 20 s (8.4).
- The first Whisper starts 3 s after level 3 begins, which is 0:39, inside the Snooze. Audio is muted during a Snooze (11.4), so no Whisper caption appears in this cut.
- If the Ghost Window cannot open in the recording browser, grant notification permission during Onboarding. Then minimize the browser at 0:24, so a system notification fires when the Haunting starts at 0:32 with the document hidden. Use that notification shot in the same slot.
- Edit only the hook, the Kiro shots and the close. Keep the App footage from 0:12 to 2:13 uncut, including the full Snooze minute.
- The Pause is cut from the recording. Only its start appears in the language switch shot.
- Chinese interface text is not speech, so it has no caption (31.4).
