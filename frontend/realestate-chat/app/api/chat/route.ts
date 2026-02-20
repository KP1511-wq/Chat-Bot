import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = "http://127.0.0.1:8001/chat";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch(AGENT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Agent returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/chat proxy error]", message);
    return NextResponse.json(
      {
        response:
          "Cannot reach the agent backend. Make sure chatbot_agent.py is running on port 8001.",
      },
      { status: 502 }
    );
  }
}
