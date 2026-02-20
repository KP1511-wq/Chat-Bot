"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ChatMessage, { Message } from "./components/ChatMessage";
import TypingIndicator from "./components/TypingIndicator";
import SuggestedQueries from "./components/SuggestedQueries";

const AGENT_URL = "http://127.0.0.1:8001/chat";

const WELCOME: Message = {
  id:        "welcome",
  role:      "agent",
  content:   "Hi! I'm your **AI Real Estate Analyst**. I can help you explore the California Housing dataset — find specific properties, compare prices, or generate charts.\n\nTry one of the suggestions below, or ask me anything!",
  timestamp: new Date(),
};

export default function Page() {
  const [messages,    setMessages]    = useState<Message[]>([WELCOME]);
  const [input,       setInput]       = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const abortRef     = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setShowWelcome(false);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const userMsg: Message = {
      id:        crypto.randomUUID(),
      role:      "user",
      content:   trimmed,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(AGENT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: trimmed }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      const raw  = data.response;

      const agentMsg: Message = {
        id:        crypto.randomUUID(),
        role:      "agent",
        content:   typeof raw === "string" ? raw : raw,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, agentMsg]);

    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const errorMsg: Message = {
        id:        crypto.randomUUID(),
        role:      "agent",
        content:   `Error: Could not reach the agent. Make sure chatbot_agent.py is running on port 8001.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([WELCOME]);
    setShowWelcome(true);
  };

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden">

      {/* ── SIDEBAR ────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-64 bg-[var(--bg-sidebar)] border-r border-[var(--border)] py-6 px-4 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 px-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="white" strokeWidth="2" fill="none"/>
              <polyline points="9 22 9 12 15 12 15 22" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)] leading-tight">RE Analyst</div>
            <div className="text-xs text-[var(--text-muted)]">California Housing</div>
          </div>
        </div>

        {/* New Chat */}
        <button
          onClick={clearChat}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium
                     bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)]
                     transition-colors duration-150 shadow-sm mb-4"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          New Chat
        </button>

        {/* Divider */}
        <div className="border-t border-[var(--border-light)] my-2" />

        {/* Capabilities */}
        <div className="mt-2">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider px-1 mb-3">
            Capabilities
          </p>
          {[
            { icon: "🔍", label: "Search properties" },
            { icon: "📊", label: "Generate charts" },
            { icon: "💡", label: "Price analysis" },
            { icon: "📍", label: "Location filter" },
          ].map(item => (
            <div key={item.label}
              className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--border-light)] transition-colors">
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {/* Dataset info */}
        <div className="mt-auto">
          <div className="rounded-xl bg-[var(--brand-light)] border border-[var(--brand)]/20 p-3">
            <p className="text-xs font-semibold text-[var(--brand)] mb-1">Dataset</p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              California Housing — 20,640 records with location, pricing, and property features.
            </p>
          </div>
        </div>
      </aside>

      {/* ── MAIN CHAT AREA ─────────────────────────────────────── */}
      <main className="flex flex-col flex-1 min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile logo */}
            <div className="md:hidden w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="white" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[var(--text-primary)]">AI Real Estate Analyst</h1>
              <p className="text-xs text-[var(--text-muted)]">California Housing Dataset</p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Agent online
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5">

          {/* Welcome hero */}
          {showWelcome && (
            <div className="flex flex-col items-center text-center pt-6 pb-2 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700
                              flex items-center justify-center shadow-lg mb-4">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
                    stroke="white" strokeWidth="1.8" fill="none"/>
                  <polyline points="9 22 9 12 15 12 15 22" stroke="white" strokeWidth="1.8"/>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">
                California Housing Explorer
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-sm leading-relaxed">
                Ask me to find properties, compare prices across regions, or generate visualizations from the dataset.
              </p>
            </div>
          )}

          {/* Message list */}
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Typing indicator */}
          {isLoading && <TypingIndicator />}

          {/* Suggestions (shown when only welcome message) */}
          {showWelcome && !isLoading && (
            <div className="pt-2">
              <p className="text-xs text-[var(--text-muted)] text-center mb-3">Try asking…</p>
              <SuggestedQueries onSelect={sendMessage} />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── INPUT BAR ──────────────────────────────────────────── */}
        <div className="shrink-0 px-4 md:px-8 py-4 bg-white border-t border-[var(--border)]">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 bg-[var(--bg)] border border-[var(--border)]
                            rounded-2xl px-4 py-3 shadow-sm focus-within:border-[var(--brand)]
                            focus-within:shadow-md transition-all duration-200">

              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about properties, prices, charts…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] resize-none
                           outline-none placeholder:text-[var(--text-muted)] leading-relaxed
                           max-h-40 overflow-y-auto"
              />

              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
                           bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)]
                           disabled:opacity-30 disabled:cursor-not-allowed
                           transition-all duration-150 shadow-sm hover:shadow-md"
              >
                {isLoading ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] text-center mt-2">
              Press <kbd className="px-1 py-0.5 bg-[var(--border-light)] rounded text-[10px] font-mono">Enter</kbd> to send
              &nbsp;·&nbsp;
              <kbd className="px-1 py-0.5 bg-[var(--border-light)] rounded text-[10px] font-mono">Shift+Enter</kbd> for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
