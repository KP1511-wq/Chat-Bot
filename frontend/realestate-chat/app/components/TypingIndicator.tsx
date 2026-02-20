"use client";

export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 msg-appear">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
            fill="white" opacity="0.9" />
          <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none" opacity="0.2"/>
          <path d="M8 12h8M12 8v8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Bubble */}
      <div className="bg-white border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--text-muted)] inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--text-muted)] inline-block" />
          <span className="typing-dot w-2 h-2 rounded-full bg-[var(--text-muted)] inline-block" />
        </div>
      </div>
    </div>
  );
}
