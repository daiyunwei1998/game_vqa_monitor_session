import { NextResponse } from "next/server";
import { saveRating } from "@/lib/server/storage";
import type { RatingPayload } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RatingPayload;
    const state = await saveRating(payload);
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rating." },
      { status: 400 }
    );
  }
}
