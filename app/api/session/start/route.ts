import { NextResponse } from "next/server";
import { createSession } from "@/lib/server/storage";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { subjectId?: string; assignmentFile?: string };
    if (!body.subjectId) throw new Error("Subject ID is required.");
    if (!body.assignmentFile) throw new Error("Assignment CSV is required.");
    const session = await createSession(body.subjectId, body.assignmentFile);
    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start session." },
      { status: 400 }
    );
  }
}
