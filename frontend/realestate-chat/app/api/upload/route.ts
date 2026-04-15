import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8001";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const response = await fetch(`${BACKEND_URL}/ingest/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/upload error]", message);
    return NextResponse.json({ detail: `Upload failed: ${message}` }, { status: 502 });
  }
}
