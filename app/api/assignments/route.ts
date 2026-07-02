import { NextResponse } from "next/server";
import { listAssignmentFiles } from "@/lib/server/storage";

export async function GET() {
  return NextResponse.json({ assignments: await listAssignmentFiles() });
}
