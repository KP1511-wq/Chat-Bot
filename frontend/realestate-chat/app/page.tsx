"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, Plus, Upload, FolderOpen, Database,
  Send, Loader2, PanelLeftClose, PanelLeftOpen, Sparkles,
  MessageSquare, Circle,
} from "lucide-react";
import ChatMessage from "./components/ChatMessage";
import SuggestedQueries from "./components/SuggestedQueries";
import TypingIndicator from "./components/TypingIndicator";
import type { Message } from "./components/ChatMessage";

const AGENT_URL = "/api/chat";

interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  messages: Message[];
}

interface DatasetInfo {
  csv_file: string;
  table_name: string;
  row_count: number;
  display_name: string;
}

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "agent",
  content: "Hello! I'm your AI data analyst. Upload a dataset and start asking questions — I can query records, compute statistics, and build charts.",
  timestamp: new Date(),
};

function loadChatHistory(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem("chatHistory") || "[]"); }
  catch { return []; }
}

function saveChatHistory(sessions: ChatSession[]) {
  localStorage.setItem("chatHistory", JSON.stringify(sessions.slice(0, 30)));
}

// ── Sidebar section header ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "#334155",
      padding: "0 12px", marginBottom: 4,
    }}>
      {children}
    </p>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Page() {
  const [sidebarOpen,       setSidebarOpen]       = useState(true);
  const [messages,          setMessages]          = useState<Message[]>([WELCOME_MSG]);
  const [inputValue,        setInputValue]        = useState("");
  const [isLoading,         setIsLoading]         = useState(false);
  const [chatHistory,       setChatHistory]       = useState<ChatSession[]>([]);
  const [currentChatId,     setCurrentChatId]     = useState<string | null>(null);
  const [datasetInfo,       setDatasetInfo]       = useState<DatasetInfo | null>(null);
  const [loadPath,          setLoadPath]          = useState("");
  const [loadError,         setLoadError]         = useState("");
  const [isUploadLoading,   setIsUploadLoading]   = useState(false);
  const [isPathLoading,     setIsPathLoading]     = useState(false);
  const [suggestRefreshKey, setSuggestRefreshKey] = useState(0);

  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const uploadRef      = useRef<HTMLInputElement>(null);
  const abortRef       = useRef<AbortController | null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => { setChatHistory(loadChatHistory()); }, []);

  const fetchActiveDataset = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const d = await res.json();
        setDatasetInfo({
          csv_file:     d.csv_source,
          table_name:   d.table,
          row_count:    d.row_count ?? 0,
          display_name: d.display_name ?? d.csv_source,
        });
      }
    } catch { setDatasetInfo(null); }
  }, []);

  useEffect(() => { fetchActiveDataset(); }, [fetchActiveDataset]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [inputValue]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    if (currentChatId && messages.length > 1) {
      const title   = messages.find(m => m.role === "user")?.content?.toString().slice(0, 46) ?? "Untitled";
      const updated = [
        { id: currentChatId, title, timestamp: new Date().toISOString(), messages },
        ...chatHistory.filter(s => s.id !== currentChatId),
      ];
      saveChatHistory(updated);
      setChatHistory(updated);
    }
    setMessages([WELCOME_MSG]);
    setCurrentChatId(null);
    setInputValue("");
  }, [currentChatId, messages, chatHistory]);

  const loadChat = useCallback((session: ChatSession) => {
    setMessages(session.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })));
    setCurrentChatId(session.id);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const chatId = currentChatId ?? `chat_${Date.now()}`;
    if (!currentChatId) setCurrentChatId(chatId);

    const userMsg: Message = {
      id: `u_${Date.now()}`, role: "user",
      content: trimmed, timestamp: new Date(),
    };
    setMessages(prev => [...prev.filter(m => m.id !== "welcome"), userMsg]);
    setInputValue("");
    setIsLoading(true);
    abortRef.current = new AbortController();

    try {
      const res     = await fetch(AGENT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: trimmed }),
        signal:  abortRef.current.signal,
      });
      const data    = await res.json();
      const content = data.response ?? "No response.";

      const agentMsg: Message = {
        id: `a_${Date.now()}`, role: "agent",
        content, timestamp: new Date(),
        isError:   typeof content === "string" && content.startsWith("Error:"),
        userQuery: trimmed,
      };

      setMessages(prev => {
        const updated = [...prev, agentMsg];
        const title   = trimmed.slice(0, 46);
        const session: ChatSession = { id: chatId, title, timestamp: new Date().toISOString(), messages: updated };
        const history = [session, ...chatHistory.filter(s => s.id !== chatId)];
        saveChatHistory(history);
        setChatHistory(history);
        return updated;
      });
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setMessages(prev => [...prev, {
          id: `err_${Date.now()}`, role: "agent",
          content: "Connection error. Is the backend running on port 8001?",
          timestamp: new Date(), isError: true,
        }]);
      }
    } finally { setIsLoading(false); }
  }, [isLoading, currentChatId, chatHistory]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputValue); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadLoading(true); setLoadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) { const d = await res.json(); setLoadError(d.detail ?? "Upload failed."); }
      else { await fetchActiveDataset(); setSuggestRefreshKey(k => k + 1); }
    } catch { setLoadError("Upload failed."); }
    finally { setIsUploadLoading(false); if (uploadRef.current) uploadRef.current.value = ""; }
  };

  const handleLoadByPath = async () => {
    if (!loadPath.trim()) return;
    setIsPathLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv_file: loadPath }),
      });
      if (!res.ok) { const d = await res.json(); setLoadError(d.detail ?? "Load failed."); }
      else { await fetchActiveDataset(); setSuggestRefreshKey(k => k + 1); setLoadPath(""); }
    } catch { setLoadError("Load failed."); }
    finally { setIsPathLoading(false); }
  };

  const showWelcome    = messages.length === 1 && messages[0].id === "welcome";
  const visibleMessages = messages.filter(m => m.id !== "welcome");

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      background: "#0B0F1A",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside style={{
        width:     sidebarOpen ? 248 : 0,
        minWidth:  sidebarOpen ? 248 : 0,
        overflow:  "hidden",
        transition: "width 0.25s cubic-bezier(0.16,1,0.3,1), min-width 0.25s cubic-bezier(0.16,1,0.3,1)",
        background: "#0D1117",
        display:   "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          padding: "20px 16px 14px",
          display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: "linear-gradient(135deg,#3B82F6,#6366F1)",
            boxShadow: "0 0 16px rgba(59,130,246,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bot size={16} color="white" />
          </div>
          <div>
            <p style={{ color: "#F1F5F9", fontWeight: 700, fontSize: 13, letterSpacing: "-0.02em" }}>
              AI Analyst
            </p>
            <p style={{ color: "#334155", fontSize: 10, marginTop: 1 }}>Data Intelligence</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#334155", cursor: "pointer", padding: 4, borderRadius: 6,
              transition: "color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#64748B")}
            onMouseLeave={e => (e.currentTarget.style.color = "#334155")}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>

        {/* New chat */}
        <div style={{ padding: "12px 10px 10px", flexShrink: 0 }}>
          <button
            onClick={startNewChat}
            className="glass-hover"
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "9px 12px", borderRadius: 10,
              border: "1px solid rgba(59,130,246,0.2)", background: "rgba(59,130,246,0.07)",
              color: "#93C5FD", fontSize: 13, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(59,130,246,0.14)";
              e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)";
              e.currentTarget.style.boxShadow = "0 0 14px rgba(59,130,246,0.15)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(59,130,246,0.07)";
              e.currentTarget.style.borderColor = "rgba(59,130,246,0.2)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Plus size={14} />
            New conversation
          </button>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 10px 10px", flexShrink: 0 }} />

        {/* Data Sources */}
        <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
          <SectionLabel>Data Sources</SectionLabel>

          {/* Active dataset */}
          {datasetInfo ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 9,
              background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)",
              marginBottom: 8,
            }}>
              <Database size={12} style={{ color: "#10B981", flexShrink: 0 }} />
              <div style={{ overflow: "hidden" }}>
                <p style={{ color: "#6EE7B7", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {datasetInfo.display_name}
                </p>
                <p style={{ color: "#064E3B", fontSize: 10.5, marginTop: 1 }}>
                  {datasetInfo.row_count.toLocaleString()} rows · active
                </p>
              </div>
              <Circle size={6} style={{ color: "#10B981", marginLeft: "auto", flexShrink: 0 }} fill="#10B981" />
            </div>
          ) : (
            <p style={{ fontSize: 11.5, color: "#334155", padding: "6px 10px", marginBottom: 6 }}>
              No dataset loaded
            </p>
          )}

          {/* Path input */}
          <input
            type="text"
            value={loadPath}
            onChange={e => setLoadPath(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLoadByPath()}
            placeholder="Path to CSV or Excel…"
            style={{
              width: "100%", padding: "7px 10px", fontSize: 12,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, color: "#94A3B8", outline: "none", marginBottom: 6,
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
            onBlur={e  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
          />

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleLoadByPath}
              disabled={isPathLoading || !loadPath.trim()}
              style={{
                flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8, border: "none",
                background: "#3B82F6", color: "#fff",
                cursor: !loadPath.trim() || isPathLoading ? "not-allowed" : "pointer",
                opacity: !loadPath.trim() ? 0.4 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (loadPath.trim()) (e.currentTarget as HTMLElement).style.background = "#2563EB"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#3B82F6"; }}
            >
              {isPathLoading
                ? <Loader2 size={12} className="spinner" />
                : <><FolderOpen size={12} /> Load</>}
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              disabled={isUploadLoading}
              style={{
                flex: 1, padding: "7px 0", fontSize: 12, borderRadius: 8,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
                color: "#94A3B8", cursor: isUploadLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
            >
              {isUploadLoading
                ? <Loader2 size={12} className="spinner" />
                : <><Upload size={12} /> Upload</>}
            </button>
          </div>

          {loadError && <p style={{ color: "#F87171", fontSize: 11, marginTop: 6 }}>{loadError}</p>}
          <input ref={uploadRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} style={{ display: "none" }} />
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 10px 10px", flexShrink: 0 }} />

        {/* Recent Queries */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px" }}>
          <SectionLabel>Recent Queries</SectionLabel>
          {chatHistory.length === 0 ? (
            <p style={{ fontSize: 11.5, color: "#1E293B", padding: "6px 10px" }}>No history yet</p>
          ) : (
            chatHistory.slice(0, 25).map(session => (
              <button
                key={session.id}
                onClick={() => loadChat(session)}
                style={{
                  width: "100%", textAlign: "left", padding: "7px 10px 7px 8px",
                  borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: 12, marginBottom: 1,
                  background: currentChatId === session.id ? "rgba(59,130,246,0.1)" : "transparent",
                  color: currentChatId === session.id ? "#93C5FD" : "#475569",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 7,
                  transition: "all 0.15s",
                  borderLeft: currentChatId === session.id ? "2px solid #3B82F6" : "2px solid transparent",
                }}
                onMouseEnter={e => {
                  if (currentChatId !== session.id) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                    (e.currentTarget as HTMLElement).style.color = "#94A3B8";
                  }
                }}
                onMouseLeave={e => {
                  if (currentChatId !== session.id) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "#475569";
                  }
                }}
              >
                <MessageSquare size={11} style={{ flexShrink: 0, opacity: 0.6 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {session.title || "Untitled"}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ══════════════════ MAIN WORKSPACE ══════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(13,17,23,0.8)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          flexShrink: 0,
          zIndex: 10,
        }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              padding: 7, borderRadius: 8, border: "none",
              background: "rgba(255,255,255,0.05)",
              color: "#475569", cursor: "pointer", display: "flex",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "#94A3B8"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "#475569"; }}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!sidebarOpen && (
              <div style={{
                width: 26, height: 26, borderRadius: 8,
                background: "linear-gradient(135deg,#3B82F6,#6366F1)",
                boxShadow: "0 0 10px rgba(59,130,246,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Bot size={13} color="white" />
              </div>
            )}
            <span style={{ fontWeight: 600, fontSize: 14, color: "#E2E8F0", letterSpacing: "-0.02em" }}>
              {datasetInfo?.display_name ?? "AI Data Analyst"}
            </span>
            {datasetInfo && (
              <span style={{
                fontSize: 10.5, color: "#3B82F6", background: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.2)", borderRadius: 20,
                padding: "1px 8px", fontWeight: 500,
              }}>
                {datasetInfo.row_count.toLocaleString()} rows
              </span>
            )}
          </div>

          {/* Status */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#10B981", display: "inline-block",
              boxShadow: "0 0 6px rgba(16,185,129,0.6)",
            }} />
            <span style={{ fontSize: 12, color: "#334155", fontWeight: 500 }}>Agent online</span>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
          {showWelcome ? (
            /* Welcome screen */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", minHeight: "100%", padding: "64px 24px",
            }}>
              {/* Hero icon */}
              <div style={{
                position: "relative", marginBottom: 28,
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 20,
                  background: "linear-gradient(135deg,#3B82F6,#6366F1)",
                  boxShadow: "0 0 40px rgba(59,130,246,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Sparkles size={28} color="white" />
                </div>
                <div style={{
                  position: "absolute", inset: -2, borderRadius: 22,
                  border: "1px solid rgba(59,130,246,0.3)",
                  pointerEvents: "none",
                }} />
              </div>

              <h1 style={{
                fontSize: 28, fontWeight: 800, color: "#F1F5F9",
                letterSpacing: "-0.04em", marginBottom: 12, textAlign: "center",
              }}>
                What do you want to discover?
              </h1>
              <p style={{
                fontSize: 15, color: "#475569", textAlign: "center",
                maxWidth: 440, marginBottom: 44, lineHeight: 1.7,
              }}>
                Upload a CSV or Excel file, then ask anything. I&apos;ll query your data,
                run statistics, and render interactive charts.
              </p>

              <SuggestedQueries onSelect={sendMessage} refreshKey={suggestRefreshKey} />
            </div>
          ) : (
            /* Chat messages */
            <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px" }}>
              {visibleMessages.map(msg => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  datasetName={datasetInfo?.table_name ?? "dataset"}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating input bar */}
        <div style={{
          padding: "10px 20px 20px",
          background: "linear-gradient(to top, #0B0F1A 70%, transparent)",
          flexShrink: 0,
        }}>
          <div style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              className="input-glow"
              style={{
                display: "flex", alignItems: "flex-end", gap: 8,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 18, padding: "10px 10px 10px 16px",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            >
              {/* Upload button */}
              <button
                onClick={() => uploadRef.current?.click()}
                style={{
                  flexShrink: 0, padding: "7px 10px", borderRadius: 10,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "#475569", cursor: "pointer", fontSize: 12,
                  display: "flex", alignItems: "center", gap: 5,
                  transition: "all 0.15s", whiteSpace: "nowrap",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.1)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.3)";
                  (e.currentTarget as HTMLElement).style.color = "#93C5FD";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLElement).style.color = "#475569";
                }}
              >
                <Upload size={13} />
                <span style={{ display: "none", "@media(min-width:600px)": { display: "inline" } } as React.CSSProperties}>
                  Upload CSV
                </span>
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about your data…"
                rows={1}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  fontSize: 14, color: "#E2E8F0", resize: "none", lineHeight: 1.6,
                  maxHeight: 160, fontFamily: "inherit",
                }}
              />

              {/* Send button */}
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                style={{
                  flexShrink: 0, width: 36, height: 36, borderRadius: 11, border: "none",
                  background: inputValue.trim() && !isLoading
                    ? "linear-gradient(135deg,#3B82F6,#6366F1)"
                    : "rgba(255,255,255,0.06)",
                  color: inputValue.trim() && !isLoading ? "#fff" : "#334155",
                  cursor: inputValue.trim() && !isLoading ? "pointer" : "not-allowed",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: inputValue.trim() && !isLoading ? "0 0 16px rgba(59,130,246,0.4)" : "none",
                  transition: "all 0.2s",
                }}
              >
                {isLoading
                  ? <Loader2 size={15} className="spinner" />
                  : <Send size={14} />}
              </button>
            </div>

            <p style={{ textAlign: "center", fontSize: 11, color: "#1E293B", marginTop: 8 }}>
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
