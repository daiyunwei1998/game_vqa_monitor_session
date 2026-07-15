import { NextResponse } from "next/server";
import { appendEvent } from "@/lib/server/storage";

type RestPayload = {
  subjectId: string;
  sessionId: string;
  action: "started" | "ended";
  restStartedAt?: string;
  restEndedAt?: string;
  restDurationMs?: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RestPayload;
    if (!payload.subjectId || !payload.sessionId) {
      throw new Error("Missing subjectId or sessionId.");
    }
    if (payload.action !== "started" && payload.action !== "ended") {
      throw new Error("Invalid rest action.");
    }

    await appendEvent(
      { subjectId: payload.subjectId, sessionId: payload.sessionId },
      {
        type: payload.action === "started" ? "rest_started" : "rest_ended",
        restStartedAt: payload.restStartedAt,
        restEndedAt: payload.restEndedAt,
        restDurationMs: payload.restDurationMs
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record rest event." },
      { status: 400 }
    );
  }
}
