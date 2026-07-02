import fs from "node:fs/promises";
import path from "node:path";
import { parseCsv, toCsv } from "@/lib/csv";
import type { FormalStimulus, RatingPayload, SessionState, TrainingStimulus } from "@/lib/types";

const root = process.cwd();
const inputRoot = path.join(root, "data", "inputs");
const outputRoot = path.join(root, "data", "experiments");

export const defaultTrainingFile = "monitor_training.csv";

function sanitizeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, "_");
}

export function sessionDir(subjectId: string, sessionId: string): string {
  return path.join(outputRoot, sanitizeId(subjectId), sanitizeId(sessionId));
}

export function assignmentPath(fileName: string): string {
  return path.join(inputRoot, "assignments", fileName);
}

export function trainingPath(fileName = defaultTrainingFile): string {
  return path.join(inputRoot, "training", fileName);
}

export async function listAssignmentFiles(): Promise<string[]> {
  const dir = path.join(inputRoot, "assignments");
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.toLowerCase().endsWith(".csv")).sort();
  } catch {
    return [];
  }
}

export async function readTraining(fileName = defaultTrainingFile): Promise<TrainingStimulus[]> {
  const text = await fs.readFile(trainingPath(fileName), "utf8");
  const rows = parseCsv<TrainingStimulus>(text).map((row) => ({
    ...row,
    training_trial: Number(row.training_trial)
  }));
  validateTraining(rows);
  return rows.sort((a, b) => a.training_trial - b.training_trial);
}

export async function readFormal(fileName: string): Promise<FormalStimulus[]> {
  const text = await fs.readFile(assignmentPath(fileName), "utf8");
  const rows = parseCsv<FormalStimulus>(text).map((row) => ({
    ...row,
    trial: Number(row.trial)
  }));
  validateFormal(rows);
  return rows.sort((a, b) => a.trial - b.trial);
}

function requireUnique(numbers: number[], label: string): void {
  const seen = new Set<number>();
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`${label} must be positive integers.`);
    }
    if (seen.has(number)) {
      throw new Error(`${label} contains duplicate value ${number}.`);
    }
    seen.add(number);
  }
}

function validateTraining(rows: TrainingStimulus[]): void {
  if (rows.length === 0) throw new Error("Training CSV is empty.");
  requireUnique(rows.map((row) => row.training_trial), "training_trial");
  for (const row of rows) {
    if (!row.video_id) throw new Error("Training row is missing video_id.");
    if (!row.video_path) throw new Error(`Training ${row.video_id} is missing video_path.`);
  }
}

function validateFormal(rows: FormalStimulus[]): void {
  if (rows.length === 0) throw new Error("Formal assignment CSV is empty.");
  requireUnique(rows.map((row) => row.trial), "trial");
  for (const row of rows) {
    if (!row.video_id) throw new Error("Formal row is missing video_id.");
    if (!row.video_path) throw new Error(`Formal ${row.video_id} is missing video_path.`);
    if (!row.condition) throw new Error(`Formal ${row.video_id} is missing condition.`);
  }
}

export async function validateVideoPaths(training: TrainingStimulus[], formal: FormalStimulus[]): Promise<string[]> {
  const missing: string[] = [];
  const paths = [...training.map((row) => row.video_path), ...formal.map((row) => row.video_path)];
  for (const videoPath of paths) {
    const publicPath = path.join(root, "public", videoPath);
    try {
      await fs.access(publicPath);
    } catch {
      missing.push(videoPath);
    }
  }
  return missing;
}

export async function createSession(subjectIdRaw: string, assignmentFile: string): Promise<{
  state: SessionState;
  training: TrainingStimulus[];
  formal: FormalStimulus[];
}> {
  const subjectId = sanitizeId(subjectIdRaw);
  const trainingFile = defaultTrainingFile;
  const training = await readTraining(trainingFile);
  const formal = await readFormal(assignmentFile);
  const missing = await validateVideoPaths(training, formal);
  if (missing.length > 0) {
    throw new Error(`Missing video files: ${missing.join(", ")}`);
  }

  const existing = await findIncompleteSession(subjectId);
  if (existing) {
    return existing;
  }

  const sessionId = `monitor_session_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const dir = sessionDir(subjectId, sessionId);
  await fs.mkdir(dir, { recursive: true });

  const state: SessionState = {
    subjectId,
    sessionId,
    status: "in_progress",
    phase: "instructions",
    trainingIndex: 0,
    formalIndex: 0,
    lastCompletedTraining: 0,
    lastCompletedFormal: 0,
    trainingFile,
    assignmentFile
  };

  await fs.copyFile(trainingPath(trainingFile), path.join(dir, "training.snapshot.csv"));
  await fs.copyFile(assignmentPath(assignmentFile), path.join(dir, "assignment.snapshot.csv"));
  await writeJsonAtomic(path.join(dir, "session.json"), {
    subjectId,
    display: "monitor",
    sessionId,
    trainingFile,
    assignmentFile,
    startedAt: now(),
    status: "in_progress"
  });
  await writeState(state);
  await appendEvent(state, { type: "session_started", assignmentFile, trainingFile });

  return { state, training, formal };
}

export async function findIncompleteSession(subjectId: string): Promise<{
  state: SessionState;
  training: TrainingStimulus[];
  formal: FormalStimulus[];
} | null> {
  const subjectDir = path.join(outputRoot, sanitizeId(subjectId));
  try {
    const sessions = (await fs.readdir(subjectDir)).sort().reverse();
    for (const sessionId of sessions) {
      const autosavePath = path.join(subjectDir, sessionId, "autosave.json");
      try {
        const state = JSON.parse(await fs.readFile(autosavePath, "utf8")) as SessionState;
        if (state.status === "in_progress") {
          return {
            state,
            training: await readSnapshotTraining(subjectId, sessionId),
            formal: await readSnapshotFormal(subjectId, sessionId)
          };
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function readSnapshotTraining(subjectId: string, sessionId: string): Promise<TrainingStimulus[]> {
  const text = await fs.readFile(path.join(sessionDir(subjectId, sessionId), "training.snapshot.csv"), "utf8");
  return parseCsv<TrainingStimulus>(text).map((row) => ({ ...row, training_trial: Number(row.training_trial) }));
}

async function readSnapshotFormal(subjectId: string, sessionId: string): Promise<FormalStimulus[]> {
  const text = await fs.readFile(path.join(sessionDir(subjectId, sessionId), "assignment.snapshot.csv"), "utf8");
  return parseCsv<FormalStimulus>(text).map((row) => ({ ...row, trial: Number(row.trial) }));
}

export async function writeState(state: SessionState): Promise<void> {
  await writeJsonAtomic(path.join(sessionDir(state.subjectId, state.sessionId), "autosave.json"), state);
}

export async function appendEvent(state: Pick<SessionState, "subjectId" | "sessionId">, event: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ time: now(), ...event }) + "\n";
  await fs.appendFile(path.join(sessionDir(state.subjectId, state.sessionId), `${state.subjectId}_events.ndjson`), line, "utf8");
}

export async function saveRating(payload: RatingPayload): Promise<SessionState> {
  const dir = sessionDir(payload.subjectId, payload.sessionId);
  const state = JSON.parse(await fs.readFile(path.join(dir, "autosave.json"), "utf8")) as SessionState;
  const training = await readSnapshotTraining(payload.subjectId, payload.sessionId);
  const formal = await readSnapshotFormal(payload.subjectId, payload.sessionId);

  await appendEvent(state, {
    type: "rating_submitted",
    kind: payload.kind,
    trial: payload.trialNumber,
    rating: payload.rating,
    videoStartedAt: payload.videoStartedAt,
    videoEndedAt: payload.videoEndedAt,
    ratingScreenShownAt: payload.ratingScreenShownAt,
    ratingSubmittedAt: payload.ratingSubmittedAt,
    responseTimeMs: payload.responseTimeMs
  });

  if (payload.kind === "training") {
    await upsertTrainingRating(state, training, payload);
    const nextIndex = state.trainingIndex + 1;
    state.lastCompletedTraining = Math.max(state.lastCompletedTraining, payload.trialNumber);
    state.trainingIndex = nextIndex;
    state.phase = nextIndex >= training.length ? "formal_ready" : "training_video";
  } else {
    await upsertFormalRating(state, formal, payload);
    const nextIndex = state.formalIndex + 1;
    state.lastCompletedFormal = Math.max(state.lastCompletedFormal, payload.trialNumber);
    state.formalIndex = nextIndex;
    state.phase = nextIndex >= formal.length ? "complete" : "formal_video";
    if (state.phase === "complete") {
      state.status = "complete";
      await writeJsonAtomic(path.join(dir, "session.json"), {
        subjectId: state.subjectId,
        display: "monitor",
        sessionId: state.sessionId,
        trainingFile: state.trainingFile,
        assignmentFile: state.assignmentFile,
        completedAt: now(),
        status: "complete"
      });
      await appendEvent(state, { type: "session_completed" });
    }
  }

  await writeState(state);
  return state;
}

export async function updatePhase(subjectId: string, sessionId: string, phase: SessionState["phase"]): Promise<SessionState> {
  const state = JSON.parse(await fs.readFile(path.join(sessionDir(subjectId, sessionId), "autosave.json"), "utf8")) as SessionState;
  state.phase = phase;
  await appendEvent(state, { type: "phase_changed", phase });
  await writeState(state);
  return state;
}

async function upsertTrainingRating(state: SessionState, stimuli: TrainingStimulus[], payload: RatingPayload): Promise<void> {
  const stimulus = stimuli.find((row) => row.training_trial === payload.trialNumber);
  if (!stimulus) throw new Error("Training stimulus not found.");
  const fileBase = path.join(sessionDir(state.subjectId, state.sessionId), `${state.subjectId}_training_data`);
  const rows = await readJsonRows(`${fileBase}.json`, "trainingTrials");
  const row = {
    subject_id: state.subjectId,
    session_id: state.sessionId,
    display: "monitor",
    training_trial: stimulus.training_trial,
    video_id: stimulus.video_id,
    video_path: stimulus.video_path,
    rating_0_100: payload.rating,
    video_started_at: payload.videoStartedAt,
    video_ended_at: payload.videoEndedAt,
    rating_screen_shown_at: payload.ratingScreenShownAt,
    rating_submitted_at: payload.ratingSubmittedAt,
    response_time_ms: payload.responseTimeMs,
    save_confirmed_at: now(),
    trial_status: "completed"
  };
  await writeDataFiles(fileBase, "trainingTrials", rows, row, "training_trial", [
    "subject_id", "session_id", "display", "training_trial", "video_id", "video_path", "rating_0_100",
    "video_started_at", "video_ended_at", "rating_screen_shown_at", "rating_submitted_at", "response_time_ms",
    "save_confirmed_at", "trial_status"
  ]);
}

async function upsertFormalRating(state: SessionState, stimuli: FormalStimulus[], payload: RatingPayload): Promise<void> {
  const stimulus = stimuli.find((row) => row.trial === payload.trialNumber);
  if (!stimulus) throw new Error("Formal stimulus not found.");
  const fileBase = path.join(sessionDir(state.subjectId, state.sessionId), `${state.subjectId}_trial_data`);
  const rows = await readJsonRows(`${fileBase}.json`, "trials");
  const row = {
    subject_id: state.subjectId,
    session_id: state.sessionId,
    display: "monitor",
    trial: stimulus.trial,
    video_id: stimulus.video_id,
    video_path: stimulus.video_path,
    rating_0_100: payload.rating,
    video_started_at: payload.videoStartedAt,
    video_ended_at: payload.videoEndedAt,
    rating_screen_shown_at: payload.ratingScreenShownAt,
    rating_submitted_at: payload.ratingSubmittedAt,
    response_time_ms: payload.responseTimeMs,
    save_confirmed_at: now(),
    trial_status: "completed"
  };
  await writeDataFiles(fileBase, "trials", rows, row, "trial", [
    "subject_id", "session_id", "display", "trial", "video_id", "video_path", "rating_0_100", "video_started_at",
    "video_ended_at", "rating_screen_shown_at", "rating_submitted_at", "response_time_ms", "save_confirmed_at",
    "trial_status"
  ]);
}

async function readJsonRows(filePath: string, key: string): Promise<Record<string, unknown>[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
    return (parsed[key] as Record<string, unknown>[] | undefined) ?? [];
  } catch {
    return [];
  }
}

async function writeDataFiles(
  fileBase: string,
  key: string,
  existingRows: Record<string, unknown>[],
  row: Record<string, unknown>,
  idKey: string,
  columns: string[]
): Promise<void> {
  const withoutOld = existingRows.filter((existing) => existing[idKey] !== row[idKey]);
  const rows = [...withoutOld, row].sort((a, b) => Number(a[idKey]) - Number(b[idKey]));
  await writeJsonAtomic(`${fileBase}.json`, { [key]: rows });
  await writeTextAtomic(`${fileBase}.csv`, toCsv(rows, columns));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeTextAtomic(filePath, JSON.stringify(value, null, 2));
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmpPath, text, "utf8");
  await replaceFileWithRetry(tmpPath, filePath);
}

function now(): string {
  return new Date().toISOString();
}

async function replaceFileWithRetry(tmpPath: string, filePath: string): Promise<void> {
  const delays = [20, 50, 100, 200, 400, 800];
  let lastError: unknown;

  for (const delay of delays) {
    try {
      await fs.rename(tmpPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EACCES" && code !== "EEXIST") {
        break;
      }

      try {
        await fs.rm(filePath, { force: true });
        await fs.rename(tmpPath, filePath);
        return;
      } catch (replaceError) {
        lastError = replaceError;
        await sleep(delay);
      }
    }
  }

  try {
    await fs.rm(tmpPath, { force: true });
  } catch {
    // Best effort cleanup. The original write error is more useful.
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
