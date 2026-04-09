"use client";

import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="msg-enter flex items-start gap-3 mb-5">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#3B82F6,#6366F1)", boxShadow: "0 0 12px rgba(59,130,246,0.35)" }}>
        <Bot size={15} color="white" />
      </div>

      {/* Glass bubble */}
      <div className="glass px-4 py-3 rounded-2xl rounded-tl-sm"
        style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
        <div className="flex items-center gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#3B82F6" }} />
          <span className="typing-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#3B82F6" }} />
          <span className="typing-dot w-2 h-2 rounded-full inline-block"
            style={{ background: "#3B82F6" }} />
        </div>
      </div>
    </div>
  );
}
