"use client";

import dynamic from "next/dynamic";

const VegaChart = dynamic(() => import("./VegaChart"), { ssr: false });

type MessageRole = "user" | "agent";

export interface Message {
  id:        string;
  role:      MessageRole;
  content:   string | Record<string, unknown>;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

function isVegaSpec(content: unknown): content is Record<string, unknown> {
  return (
    typeof content === "object" &&
    content !== null &&
    ("mark" in content || "$schema" in content)
  );
}

function formatText(text: string): React.ReactNode {
  // Convert **bold** and line breaks
  return text.split("\n").map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i}>
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j} className="font-semibold text-[var(--text-primary)]">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          )
        )}
        {i < text.split("\n").length - 1 && <br />}
      </span>
    );
  });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser  = message.role === "user";
  const isChart = !isUser && isVegaSpec(message.content);
  const isError = !isUser &&
    typeof message.content === "string" &&
    message.content.toLowerCase().startsWith("error");

  return (
    <div className={`flex items-start gap-3 msg-appear ${isUser ? "flex-row-reverse" : "flex-row"}`}>

      {/* Avatar */}
      {isUser ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-gray-700 to-gray-900
                        flex items-center justify-center text-white text-xs font-semibold shadow-sm">
          U
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700
                        flex items-center justify-center shadow-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z"
              stroke="white" strokeWidth="1.5" fill="none"/>
            <path d="M9 9h1.5v6H9zM13.5 9H15v6h-1.5z" fill="white"/>
          </svg>
        </div>
      )}

      {/* Bubble */}
      <div className={`max-w-[80%] ${isChart ? "w-full max-w-2xl" : ""}`}>
        {isUser ? (
          <div className="bg-[var(--user-bubble)] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm
                          text-sm leading-relaxed">
            {typeof message.content === "string" ? message.content : ""}
          </div>
        ) : isChart ? (
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1 ml-1">Chart generated</div>
            <VegaChart spec={message.content as Record<string, unknown>} />
          </div>
        ) : (
          <div className={`rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm text-sm leading-relaxed
            ${isError
              ? "bg-red-50 border border-red-100 text-red-700"
              : "bg-[var(--agent-bubble)] border border-[var(--border)] text-[var(--text-primary)]"
            }`}>
            {typeof message.content === "string"
              ? formatText(message.content)
              : JSON.stringify(message.content)}
          </div>
        )}

        {/* Timestamp */}
        <div className={`text-xs text-[var(--text-muted)] mt-1 ${isUser ? "text-right mr-1" : "ml-1"}`}>
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
