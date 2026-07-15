export type TrainingStimulus = {
  training_trial: number;
  video_id: string;
  video_path: string;
  training_label?: string;
  duration_sec?: string;
  notes?: string;
};

export type FormalStimulus = {
  trial: number;
  video_id: string;
  video_path: string;
  condition: string;
  game?: string;
  quality_level?: string;
  duration_sec?: string;
  notes?: string;
};

export type AppPhase =
  | "instructions"
  | "training_intro"
  | "training_video"
  | "training_rating"
  | "formal_ready"
  | "formal_video"
  | "formal_rating"
  | "complete";

export type SessionState = {
  subjectId: string;
  sessionId: string;
  status: "in_progress" | "complete";
  phase: AppPhase;
  trainingIndex: number;
  formalIndex: number;
  lastCompletedTraining: number;
  lastCompletedFormal: number;
  trainingFile: string;
  assignmentFile: string;
};

export type StartSessionResponse = {
  subjectId: string;
  sessionId: string;
  resumed: boolean;
  state: SessionState;
  training: TrainingStimulus[];
  formal: FormalStimulus[];
};

export type RatingPayload = {
  subjectId: string;
  sessionId: string;
  kind: "training" | "formal";
  trialNumber: number;
  rating: number;
  videoStartedAt: string;
  videoEndedAt: string;
  ratingScreenShownAt: string;
  ratingSubmittedAt: string;
  responseTimeMs: number;
  takeBreakAfterSubmit?: boolean;
};
