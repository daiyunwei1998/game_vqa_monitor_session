# Monitor Quality Rating Tool - Technical Considerations

## Scope

This project is for the monitor session only.

Do not include HMD workflow, HMD checkpoint logic, multi-display comparison features, or general participant tracking. The app should stay focused on running a local monitor-based video quality rating session.

## App Shape

Build as a local Next.js app running on localhost.

Primary screens:

- Setup screen: enter/select subject ID and load the monitor assignment playlist.
- Instruction screen: present monitor-session instructions before training.
- Training screen: play practice videos and collect practice ratings.
- Session screen: play one formal monitor video at a time, then collect a 0-100 quality rating.
- Completion screen: show save/export status and session completion.

Researcher/admin controls should be minimal and should not distract the participant.

## Language And Participant-Facing Text

Participant-facing UI text should be shown in Traditional Chinese.

This includes:

- Instructions.
- Training intro and transition screens.
- Rating prompt.
- Rating scale helper text.
- Button labels visible to the participant.
- Completion message.
- Break/stop reminders visible to the participant.

Researcher-facing setup, validation, debug, and export controls may use English or bilingual labels if that makes development and operation clearer.

The app should keep participant-facing copy in a central content/config file rather than scattering strings across components. This makes wording review easier before pilot sessions.

## Inputs

The app should load a CSV file specifying the stimulus order for a subject/session.

Suggested input folder:

```txt
data/
  inputs/
    training/
      monitor_training.csv
    assignments/
      monitor_S001.csv
      monitor_S002.csv
```

Training and formal stimuli should be specified separately.

The number of trials is controlled only by the CSV row count. Do not hard-code training or formal session length in the app. If the training CSV contains 5 rows, the app should run 5 training videos. If the formal assignment CSV contains 80 rows, the app should run 80 formal videos.

Training input:

```csv
training_trial,video_id,video_path,training_label,duration_sec,notes
1,train_high,videos/training/high.mp4,high,30,
2,train_mid,videos/training/mid.mp4,mid,30,
3,train_low,videos/training/low.mp4,low,30,
```

Formal assignment input:

```csv
trial,video_id,video_path,condition,game,quality_level,duration_sec,notes
1,clip_001,videos/formal/clip_001.mp4,q1,game_a,,30,
2,clip_002,videos/formal/clip_002.mp4,q2,game_a,,30,
```

Required training columns:

- `training_trial`: 1-based training order.
- `video_id`: stable training stimulus identifier.
- `video_path`: local video path.

Required formal assignment columns:

- `trial`: 1-based presentation order.
- `video_id`: stable stimulus identifier.
- `video_path`: local video path, preferably relative to the app/public media folder or configured media root.
- `condition`: experimental condition code used for analysis.

Optional columns:

- `game`
- `quality_level`
- `duration_sec`
- `notes`

Validation rules:

- Training trial numbers must be unique within the training CSV.
- Formal trial numbers must be unique within the formal assignment CSV.
- Trial order should be sorted by `training_trial` or `trial`.
- `video_id` must be non-empty.
- `video_path` must exist before the session starts.
- Formal assignment CSV files should not contain training rows.
- The app should show a clear researcher-facing validation report before allowing the session to begin.

## Experiment Flow

1. Researcher enters subject ID and selects or confirms the monitor assignment CSV.
2. App validates the assignment CSV and all referenced video paths.
3. App creates or resumes a local session record.
4. App shows monitor-session instructions.
5. App runs training trials from the separate training CSV.
6. App lets the researcher confirm that the participant is ready for formal trials.
7. App runs formal trials from the separate formal assignment CSV.
8. For each trial, app plays the assigned video.
9. After video playback ends, app shows the rating interface.
10. Participant rates visual quality on a continuous 0-100 scale.
11. Participant submits rating.
12. App saves the rating and waits for confirmed success.
13. App advances to the next trial.
14. At the end, app marks the session complete and writes final derived outputs.

The UI should treat saving as blocking. Do not advance to the next trial until the save API confirms success.

## Instruction And Training Flow

The participant should see instructions before any video playback.

Recommended flow:

```txt
Setup
-> Instructions
-> Training intro
-> Training video/rating loop for every row in training CSV
-> Researcher ready check
-> Formal video/rating loop for every row in assignment CSV
-> Completion
```

Training ratings should be saved separately from formal ratings. Do not include training ratings in `trial_data.csv` or `trial_data.json`.

The app should write events for instruction display, training start, training completion, formal start, and formal completion.

## Rating Interface

Use a continuous 0-100 scale.

Reference labels:

- Bad
- Poor
- Fair
- Good
- Excellent

The participant should rate after each video, not during playback. The rating should reflect the overall visual quality of the just-viewed video, not game preference or content preference.

## Local Data Storage

Use one folder per subject/session.

Suggested structure:

```txt
data/
  experiments/
    S001/
      monitor_session_001/
        session.json
        training.snapshot.csv
        assignment.snapshot.csv
        S001_events.ndjson
        S001_training_data.json
        S001_training_data.csv
        S001_trial_data.json
        S001_trial_data.csv
        autosave.json
```

`{subject_id}_events.ndjson` is the source of truth for reconstruction and fault recovery.

`{subject_id}_training_data.json` and `{subject_id}_training_data.csv` contain practice ratings only.

`{subject_id}_trial_data.json` and `{subject_id}_trial_data.csv` are per-subject/per-session formal data outputs for analysis. They should contain one row/object per formal rated trial.

Formal analysis should use only `{subject_id}_trial_data.json` or `{subject_id}_trial_data.csv`.

Output data files should not include condition metadata such as game name, quality level, high/low labels, or other messy experimental coding. Keep that metadata in `assignment.snapshot.csv` or `training.snapshot.csv`, and join it later during analysis if needed.

`assignment.snapshot.csv` is a copy of the exact assignment file used for the session. This prevents later assignment edits from changing the interpretation of old data.

`training.snapshot.csv` is a copy of the exact training file used for the session.

## Session Metadata

Create `session.json` when the session starts.

Example:

```json
{
  "subjectId": "S001",
  "display": "monitor",
  "sessionId": "monitor_session_001",
  "playlistId": "monitor_v1",
  "trainingFile": "monitor_training.csv",
  "assignmentFile": "monitor_S001.csv",
  "startedAt": "2026-07-03T00:00:00.000+08:00",
  "status": "in_progress"
}
```

## Event Log

Append every important experiment action to `events.ndjson` immediately.

Example events:

```json
{"type":"session_started","time":"2026-07-03T00:00:00.000+08:00"}
{"type":"instructions_shown","time":"2026-07-03T00:00:20.000+08:00"}
{"type":"training_started","time":"2026-07-03T00:00:40.000+08:00"}
{"type":"video_started","trial":1,"videoId":"clip_001","time":"2026-07-03T00:01:00.000+08:00"}
{"type":"video_ended","trial":1,"videoId":"clip_001","time":"2026-07-03T00:01:30.000+08:00"}
{"type":"rating_submitted","trial":1,"videoId":"clip_001","rating":74,"time":"2026-07-03T00:01:45.000+08:00"}
{"type":"formal_started","time":"2026-07-03T00:05:00.000+08:00"}
```

Rules:

- Append events; do not rewrite history.
- Save after every rating.
- Clearly mark incomplete trials rather than deleting them.
- Include timestamps for video start, video end, and rating submission.
- On app startup, detect unfinished sessions and offer resume behavior.

## Trial Data Outputs

After each formal submitted rating, update both `trial_data.json` and `trial_data.csv`.

After each training submitted rating, update both `training_data.json` and `training_data.csv`.

Training and formal outputs must be physically separate files.

Suggested `trial_data.csv` columns:

```csv
subject_id,session_id,display,trial,video_id,video_path,rating_0_100,video_started_at,video_ended_at,rating_screen_shown_at,rating_submitted_at,response_time_ms,save_confirmed_at,trial_status
```

Suggested `training_data.csv` columns:

```csv
subject_id,session_id,display,training_trial,video_id,video_path,rating_0_100,video_started_at,video_ended_at,rating_screen_shown_at,rating_submitted_at,response_time_ms,save_confirmed_at,trial_status
```

Suggested `trial_data.json` shape:

```json
{
  "subjectId": "S001",
  "sessionId": "monitor_session_001",
  "display": "monitor",
  "assignmentFile": "monitor_S001.csv",
  "trials": [
    {
      "trial": 1,
      "videoId": "clip_001",
      "videoPath": "videos/formal/clip_001.mp4",
      "rating_0_100": 82,
      "videoStartedAt": "2026-07-03T00:01:00.000+08:00",
      "videoEndedAt": "2026-07-03T00:01:30.000+08:00",
      "ratingScreenShownAt": "2026-07-03T00:01:31.000+08:00",
      "ratingSubmittedAt": "2026-07-03T00:01:45.000+08:00",
      "responseTimeMs": 14000,
      "saveConfirmedAt": "2026-07-03T00:01:45.200+08:00",
      "trialStatus": "completed"
    }
  ]
}
```

Use `.tmp` files for writes, then rename after a successful write:

- `{subject_id}_training_data.json.tmp` -> `{subject_id}_training_data.json`
- `{subject_id}_training_data.csv.tmp` -> `{subject_id}_training_data.csv`
- `{subject_id}_trial_data.json.tmp` -> `{subject_id}_trial_data.json`
- `{subject_id}_trial_data.csv.tmp` -> `{subject_id}_trial_data.csv`

If a derived file becomes invalid or incomplete, rebuild it from:

- `{subject_id}_events.ndjson`
- `training.snapshot.csv` for training outputs
- `assignment.snapshot.csv` for formal outputs

Formal rebuilds should never mix in training trials.

## Autosave And Resume

Maintain `autosave.json` with the current state needed to resume:

- subject ID
- session ID
- playlist ID
- assignment file
- current trial index
- current video ID
- current phase
- last completed trial
- session status

If the browser refreshes or the app restarts, the app should detect the unfinished session and resume from the correct trial.

## Save Semantics

Although file writes can use asynchronous JavaScript internally, the participant-facing flow should behave synchronously:

1. Submit rating.
2. Show brief saving state.
3. Wait for successful API response.
4. Advance to next video.

If saving fails, keep the participant on the rating screen and show a researcher-facing error/retry control.

## Video Preloading

Local playback is expected to be reliable, but preloading the next video is still worthwhile.

Recommended behavior:

- Keep the current video ready for playback.
- While the participant is rating trial `n`, preload video `n + 1`.
- Preload only the next video, not the entire playlist.
- Prefer local disk video paths over cloud-streamed paths.
- Avoid depending on active Dropbox or network sync during sessions.

Suggested flow:

```txt
Play video n
-> show rating screen
-> preload video n + 1 while participant rates
-> submit rating
-> wait for save success
-> start video n + 1
```

## Fault Tolerance Priorities

Highest priority:

- Do not lose submitted ratings.
- Do not silently skip trials.
- Be able to reconstruct the session from `events.ndjson`.

Important behaviors:

- Detect existing unfinished session on startup.
- Support resume rather than forced restart.
- Write one event at a time.
- Confirm save before advancing.
- Preserve issue/error events for later analysis.

## Out Of Scope For Initial Build

- HMD sessions.
- HMD checkpoints.
- Online database sync.
- Multi-user remote dashboard.
- Complex authentication.
- Full participant master tracking.
- Advanced analytics inside the app.
