# Monitor Rating App

Local Next.js app for running a monitor-based video quality rating session.

The app is monitor-only. Participant-facing text is Traditional Chinese.

## Run Locally

```powershell
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

## Inputs

Training and formal trials are controlled by CSV files.

```txt
data/
  inputs/
    training/
      monitor_training.csv
    assignments/
      monitor_S001.csv
```

Session length is determined only by CSV row count. If the training CSV has 5 rows, the app runs 5 training videos.

Video paths are relative to `public/`.

## Outputs

Experiment output is written locally under:

```txt
data/
  experiments/
    S001/
      monitor_session_YYYYMMDDHHMMSS/
```

Generated files include:

```txt
S001_events.ndjson
S001_training_data.csv
S001_training_data.json
S001_trial_data.csv
S001_trial_data.json
autosave.json
session.json
training.snapshot.csv
assignment.snapshot.csv
```

Training data and formal trial data are physically separate. Formal analysis should use only `*_trial_data.csv` or `*_trial_data.json`.

Condition metadata such as game, high/low labels, or quality coding is kept in the snapshot CSVs and is not written into the output data files.

## Pseudo Stimuli

The repository includes short pseudo MP4 files under `public/videos/` so the flow can be tested without real experiment videos.

Replace the CSV paths and video files when real stimuli are available.

## Build Check

```powershell
npm run build
```
