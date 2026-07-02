import { NextResponse } from "next/server";
import { updatePhase } from "@/lib/server/storage";
import type { SessionState } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subjectId?: string;
      sessionId?: string;
      phase?: SessionState["phase"];
    };
    if (!body.subjectId || !body.sessionId || !body.phase) {
      throw new Error("subjectId, sessionId, and phase are required.");
    }
    return NextResponse.json({ state: await updatePhase(body.subjectId, body.sessionId, body.phase) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update phase." },
      { status: 400 }
    );
  }
}
