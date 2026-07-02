"use client";

import { useEffect, useRef, useState } from "react";
import { participantText } from "@/lib/content";
import type { FormalStimulus, SessionState, StartSessionResponse, TrainingStimulus } from "@/lib/types";

type Runtime = {
  state: SessionState;
  training: TrainingStimulus[];
  formal: FormalStimulus[];
  resumed: boolean;
};

export default function Home() {
  const [assignments, setAssignments] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("S001");
  const [assignmentFile, setAssignmentFile] = useState("");
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/assignments")
      .then((response) => response.json())
      .then((data: { assignments: string[] }) => {
        setAssignments(data.assignments);
        setAssignmentFile(data.assignments[0] ?? "");
      })
      .catch(() => setError("Could not load assignment list."));
  }, []);

  async function startSession() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId, assignmentFile })
    });
    const data = (await response.json()) as StartSessionResponse | { error: string };
    setLoading(false);
    if (!response.ok || "error" in data) {
      setError("error" in data ? data.error : "Failed to start.");
      return;
    }
    setRuntime({ state: data.state, training: data.training, formal: data.formal, resumed: data.resumed });
  }

  if (runtime) {
    return <Session runtime={runtime} setRuntime={setRuntime} />;
  }

  return (
    <main className="setup">
      <section className="setupPanel">
        <h1>Monitor Quality Rating Tool</h1>
        <p>Local monitor-only session runner with pseudo stimuli support.</p>
        <div className="setupGrid">
          <label className="field">
            <span>Subject ID</span>
            <input value={subjectId} onChange={(event) => setSubjectId(event.target.value)} />
          </label>
          <label className="field">
            <span>Formal assignment CSV</span>
            <select value={assignmentFile} onChange={(event) => setAssignmentFile(event.target.value)}>
              {assignments.map((assignment) => (
                <option value={assignment} key={assignment}>
                  {assignment}
                </option>
              ))}
            </select>
          </label>
          {error ? <div className="error">{error}</div> : null}
          <button onClick={startSession} disabled={loading || !subjectId || !assignmentFile}>
            {loading ? "Starting..." : "Start / Resume Monitor Session"}
          </button>
        </div>
      </section>
    </main>
  );
}

function Session({
  runtime,
  setRuntime
}: {
  runtime: Runtime;
  setRuntime: (runtime: Runtime) => void;
}) {
  const { state, training, formal } = runtime;
  const currentTraining = training[state.trainingIndex];
  const currentFormal = formal[state.formalIndex];
  const [videoTiming, setVideoTiming] = useState({ startedAt: "", endedAt: "" });
  const [resumeNoticeDismissed, setResumeNoticeDismissed] = useState(!runtime.resumed);

  async function setPhase(phase: SessionState["phase"]) {
    const response = await fetch("/api/session/phase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectId: state.subjectId, sessionId: state.sessionId, phase })
    });
    const data = (await response.json()) as { state: SessionState };
    setRuntime({ ...runtime, state: data.state });
  }

  async function onSaved(nextState: SessionState) {
    setRuntime({ ...runtime, state: nextState });
  }

  return (
    <main className="sessionShell">
      <div className="researchBar">
        <strong>Session</strong>
        <div>
          <span>Subject: {state.subjectId}</span>
          <span>Session: {state.sessionId}</span>
          {runtime.resumed ? <span>Resumed unfinished session</span> : null}
          <span>Training: {state.lastCompletedTraining}/{training.length}</span>
          <span>Formal: {state.lastCompletedFormal}/{formal.length}</span>
        </div>
      </div>
      <section className="stage">
        {!resumeNoticeDismissed ? (
          <InfoScreen title="偵測到未完成測試" button={participantText.next} onNext={() => setResumeNoticeDismissed(true)}>
            <p>此受試者已有未完成的測試紀錄，系統將繼續上次進度。</p>
          </InfoScreen>
        ) : null}
        {resumeNoticeDismissed && state.phase === "instructions" ? (
          <InfoScreen title={participantText.instructionTitle} button={participantText.next} onNext={() => setPhase("training_intro")}>
            {participantText.instructionParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </InfoScreen>
        ) : null}
        {resumeNoticeDismissed && state.phase === "training_intro" ? (
          <InfoScreen title={participantText.trainingTitle} button={participantText.startTraining} onNext={() => setPhase("training_video")}>
            <p>{participantText.trainingIntro}</p>
          </InfoScreen>
        ) : null}
        {resumeNoticeDismissed && state.phase === "training_video" && currentTraining ? (
          <VideoScreen
            videoPath={currentTraining.video_path}
            onStarted={() => setVideoTiming({ startedAt: new Date().toISOString(), endedAt: "" })}
            onEnded={() => {
              setVideoTiming((timing) => ({ ...timing, endedAt: new Date().toISOString() }));
              setPhase("training_rating");
            }}
          />
        ) : null}
        {resumeNoticeDismissed && state.phase === "training_rating" && currentTraining ? (
          <RatingScreen
            kind="training"
            subjectId={state.subjectId}
            sessionId={state.sessionId}
            trialNumber={currentTraining.training_trial}
            videoStartedAt={videoTiming.startedAt}
            videoEndedAt={videoTiming.endedAt}
            onSaved={onSaved}
          />
        ) : null}
        {resumeNoticeDismissed && state.phase === "formal_ready" ? (
          <InfoScreen title={participantText.formalReadyTitle} button={participantText.startFormal} onNext={() => setPhase("formal_video")}>
            <p>{participantText.formalReadyBody}</p>
          </InfoScreen>
        ) : null}
        {resumeNoticeDismissed && state.phase === "formal_video" && currentFormal ? (
          <VideoScreen
            videoPath={currentFormal.video_path}
            preloadPath={formal[state.formalIndex + 1]?.video_path}
            onStarted={() => setVideoTiming({ startedAt: new Date().toISOString(), endedAt: "" })}
            onEnded={() => {
              setVideoTiming((timing) => ({ ...timing, endedAt: new Date().toISOString() }));
              setPhase("formal_rating");
            }}
          />
        ) : null}
        {resumeNoticeDismissed && state.phase === "formal_rating" && currentFormal ? (
          <RatingScreen
            kind="formal"
            subjectId={state.subjectId}
            sessionId={state.sessionId}
            trialNumber={currentFormal.trial}
            videoStartedAt={videoTiming.startedAt}
            videoEndedAt={videoTiming.endedAt}
            onSaved={onSaved}
          />
        ) : null}
        {resumeNoticeDismissed && state.phase === "complete" ? (
          <InfoScreen title={participantText.completeTitle} button="" onNext={() => undefined}>
            <p>{participantText.completeBody}</p>
          </InfoScreen>
        ) : null}
      </section>
    </main>
  );
}

function InfoScreen({
  title,
  children,
  button,
  onNext
}: {
  title: string;
  children: React.ReactNode;
  button: string;
  onNext: () => void;
}) {
  return (
    <div className="participantPanel">
      <h1>{title}</h1>
      {children}
      {button ? (
        <div className="actionRow">
          <button onClick={onNext}>{button}</button>
        </div>
      ) : null}
    </div>
  );
}

function VideoScreen({
  videoPath,
  preloadPath,
  onStarted,
  onEnded
}: {
  videoPath: string;
  preloadPath?: string;
  onStarted: () => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setBlocked(false);
    video.play().catch(() => setBlocked(true));
  }, [videoPath]);

  async function startPlayback() {
    const video = videoRef.current;
    if (!video) return;
    setBlocked(false);
    try {
      await video.play();
    } catch {
      setBlocked(true);
    }
  }

  return (
    <div className="videoStage">
      <div className="videoFrame">
        <video
          ref={videoRef}
          src={`/${videoPath}`}
          autoPlay
          muted
          playsInline
          controls={false}
          preload="auto"
          onPlay={onStarted}
          onEnded={onEnded}
        />
        {preloadPath ? <video src={`/${preloadPath}`} preload="auto" style={{ display: "none" }} /> : null}
        {blocked ? (
          <button className="playOverlay" onClick={startPlayback}>
            開始播放
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RatingScreen({
  kind,
  subjectId,
  sessionId,
  trialNumber,
  videoStartedAt,
  videoEndedAt,
  onSaved
}: {
  kind: "training" | "formal";
  subjectId: string;
  sessionId: string;
  trialNumber: number;
  videoStartedAt: string;
  videoEndedAt: string;
  onSaved: (state: SessionState) => void;
}) {
  const [rating, setRating] = useState(50);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [shownAt] = useState(() => new Date().toISOString());

  async function submit() {
    const submittedAt = new Date().toISOString();
    setSaving(true);
    setError("");
    const response = await fetch("/api/rating", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId,
        sessionId,
        kind,
        trialNumber,
        rating,
        videoStartedAt,
        videoEndedAt,
        ratingScreenShownAt: shownAt,
        ratingSubmittedAt: submittedAt,
        responseTimeMs: Date.parse(submittedAt) - Date.parse(shownAt)
      })
    });
    const data = (await response.json()) as { state?: SessionState; error?: string };
    setSaving(false);
    if (!response.ok || !data.state) {
      setError(data.error ?? "Save failed.");
      return;
    }
    onSaved(data.state);
  }

  return (
    <div className="ratingPanel">
      <h1>{participantText.ratingPrompt}</h1>
      {participantText.ratingHelp ? <p>{participantText.ratingHelp}</p> : null}
      <input
        className="slider"
        type="range"
        min="0"
        max="100"
        value={rating}
        onChange={(event) => {
          setTouched(true);
          setRating(Number(event.target.value));
        }}
        onInput={() => setTouched(true)}
        onPointerDown={() => setTouched(true)}
        onKeyDown={() => setTouched(true)}
      />
      <div className="scaleLabels">
        {participantText.labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="actionRow">
        <button onClick={submit} disabled={!touched || saving}>
          {saving ? participantText.saving : participantText.submitRating}
        </button>
      </div>
    </div>
  );
}
