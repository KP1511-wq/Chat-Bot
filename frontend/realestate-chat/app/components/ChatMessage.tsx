"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Bot, User, ChevronDown, BarChart2, Table2, Zap, CheckCircle2 } from "lucide-react";

const VegaChart = dynamic(() => import("./VegaChart"), { ssr: false });

export type MessageRole = "user" | "agent";

export interface Message {
  id: string;
  role: MessageRole;
  content: string | Record<string, unknown>;
  timestamp: Date;
  isError?: boolean;
  userQuery?: string;
  isDataResponse?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isVegaSpec(c: unknown): c is Record<string, unknown> {
  return typeof c === "object" && c !== null && ("mark" in c || "$schema" in c);
}

function formatText(text: string): React.ReactNode {
  return text.split("\n").map((line, i, arr) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <span key={i}>
        {parts.map((p, j) =>
          p.startsWith("**") && p.endsWith("**")
            ? <strong key={j} className="font-semibold text-slate-100">{p.slice(2, -2)}</strong>
            : p
        )}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

function generateMockSQL(query: string, table: string): string {
  const q = query.toLowerCase();
  const tbl = table || "dataset";

  if (q.includes("plot") || q.includes("chart") || q.includes("average") || q.includes("avg")) {
    const m = q.match(/by\s+(\w+)/);
    const grp = m?.[1] ?? "category";
    return `SELECT\n  ${grp},\n  AVG(value) AS avg_value\nFROM ${tbl}\nGROUP BY ${grp}\nORDER BY avg_value DESC\nLIMIT 20;`;
  }
  if (q.includes("count") || q.includes("how many")) {
    const m = q.match(/by\s+(\w+)/);
    const grp = m?.[1] ?? "category";
    return `SELECT\n  ${grp},\n  COUNT(*) AS total\nFROM ${tbl}\nGROUP BY ${grp}\nORDER BY total DESC;`;
  }
  if (q.includes("top") || q.includes("highest") || q.includes("most")) {
    return `SELECT *\nFROM ${tbl}\nORDER BY value DESC\nLIMIT 5;`;
  }
  if (q.includes("bottom") || q.includes("lowest") || q.includes("least")) {
    return `SELECT *\nFROM ${tbl}\nORDER BY value ASC\nLIMIT 5;`;
  }
  if (q.includes("sum") || q.includes("total")) {
    return `SELECT\n  category,\n  SUM(value) AS total_value\nFROM ${tbl}\nGROUP BY category\nORDER BY total_value DESC;`;
  }
  return `SELECT *\nFROM ${tbl}\nWHERE 1=1\nLIMIT 10;`;
}

function highlightSQL(sql: string): React.ReactNode {
  const keywords = /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|COUNT|AVG|SUM|MAX|MIN|AS|DESC|ASC|AND|OR|IN|LIKE|JOIN|ON|HAVING|DISTINCT)\b/g;
  return sql.split("\n").map((line, i) => {
    const parts = line.split(keywords);
    return (
      <div key={i}>
        {parts.map((part, j) =>
          keywords.test(part)
            ? <span key={j} style={{ color: "#c084fc" }}>{part}</span>
            : <span key={j} style={{ color: "#7dd3fc" }}>{part}</span>
        )}
      </div>
    );
  });
}

// ── System Thinking accordion ─────────────────────────────────────────────────
function SystemThinking({ userQuery, datasetName }: { userQuery: string; datasetName: string }) {
  const [open, setOpen] = useState(false);
  const sql = generateMockSQL(userQuery, datasetName);

  const steps = [
    "Analyzing query intent",
    "Mapping to dataset schema",
    "Generating optimized SQL",
    "Executing query & synthesizing result",
  ];

  return (
    <div className="mt-3 rounded-xl overflow-hidden"
      style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.25)" }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
        style={{ color: "#64748B" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <Zap size={13} style={{ color: "#F59E0B", flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: "#94A3B8", letterSpacing: "0.02em" }}>
          System Thinking
        </span>
        <ChevronDown
          size={13}
          style={{
            marginLeft: "auto", color: "#475569",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      <div className={`accordion-content ${open ? "open" : "closed"}`}>
        <div style={{ padding: "0 16px 14px" }}>
          {/* Steps */}
          <div className="flex flex-col gap-1.5 mb-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <CheckCircle2 size={11} style={{ color: "#10B981", flexShrink: 0 }} />
                <span style={{ fontSize: 11.5, color: "#64748B" }}>{step}</span>
              </div>
            ))}
          </div>

          {/* SQL */}
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Generated SQL
          </div>
          <div className="code-block" style={{ fontSize: 12 }}>
            {highlightSQL(sql)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Data table ─────────────────────────────────────────────────────────────────
function DataTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <p style={{ color: "#64748B", fontSize: 12, padding: 12 }}>No data</p>;
  const keys = Object.keys(data[0]);
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
      <table className="data-table">
        <thead>
          <tr>{keys.map(k => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr>
        </thead>
        <tbody>
          {data.slice(0, 20).map((row, i) => (
            <tr key={i}>
              {keys.map(k => (
                <td key={k}>
                  {typeof row[k] === "number"
                    ? (Number.isInteger(row[k]) ? (row[k] as number).toLocaleString() : (row[k] as number).toFixed(2))
                    : String(row[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Chart card with Visual Toggle ─────────────────────────────────────────────
function ChartCard({
  spec, userQuery, datasetName,
}: {
  spec: Record<string, unknown>;
  userQuery: string;
  datasetName: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const rawData = (spec as { data?: { values?: Record<string, unknown>[] } }).data?.values ?? [];

  return (
    <div className="card-enter">
      {/* Toggle bar */}
      <div className="flex items-center gap-1.5 mb-4">
        <span style={{ fontSize: 11, color: "#475569", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}>
          View
        </span>
        {(["chart", "table"] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
            style={{
              fontSize: 12, fontWeight: 500,
              background: view === v ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${view === v ? "rgba(59,130,246,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: view === v ? "#93C5FD" : "#64748B",
            }}
          >
            {v === "chart" ? <BarChart2 size={12} /> : <Table2 size={12} />}
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, padding: "2px 8px", color: "#93C5FD" }}>
          {rawData.length} rows
        </span>
      </div>

      {/* Content */}
      <div className="fade-enter" key={view}>
        {view === "chart"
          ? <VegaChart spec={spec} />
          : <DataTable data={rawData} />}
      </div>

      <SystemThinking userQuery={userQuery} datasetName={datasetName} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ChatMessage({
  message,
  datasetName = "dataset",
}: {
  message: Message;
  datasetName?: string;
}) {
  const isUser  = message.role === "user";
  const isChart = !isUser && isVegaSpec(message.content);
  const isError = message.isError;
  const showSystemThinking = !isUser && !isChart && !isError && !!message.isDataResponse;

  return (
    <div
      className="msg-enter flex items-start gap-3 mb-5"
      style={{ flexDirection: isUser ? "row-reverse" : "row" }}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
          <User size={14} style={{ color: "#93C5FD" }} />
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#3B82F6,#6366F1)", boxShadow: "0 0 12px rgba(59,130,246,0.35)" }}>
          <Bot size={15} color="white" />
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: isChart ? "100%" : "80%", flex: isChart ? 1 : undefined }}>
        {isUser ? (
          /* User bubble */
          <div style={{
            background: "rgba(59,130,246,0.12)",
            border: "1px solid rgba(59,130,246,0.25)",
            padding: "10px 16px",
            borderRadius: "16px 16px 4px 16px",
            fontSize: 14, lineHeight: 1.65, color: "#E2E8F0",
          }}>
            {typeof message.content === "string" ? message.content : ""}
          </div>
        ) : isChart ? (
          /* Bento chart card */
          <div className="glass card-enter rounded-2xl p-5"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset" }}>
            <ChartCard
              spec={message.content as Record<string, unknown>}
              userQuery={message.userQuery ?? ""}
              datasetName={datasetName}
            />
          </div>
        ) : (
          /* Bento text card */
          <div className="glass card-enter rounded-2xl p-5"
            style={{
              boxShadow: isError
                ? "0 0 0 1px rgba(239,68,68,0.3), 0 4px 24px rgba(0,0,0,0.3)"
                : "0 4px 24px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.06) inset",
              borderColor: isError ? "rgba(239,68,68,0.25)" : undefined,
            }}>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: isError ? "#FCA5A5" : "#CBD5E1" }}>
              {typeof message.content === "string"
                ? formatText(message.content)
                : JSON.stringify(message.content)}
            </p>

            {showSystemThinking && (
              <SystemThinking
                userQuery={message.userQuery ?? "query"}
                datasetName={datasetName}
              />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div suppressHydrationWarning style={{
          fontSize: 10.5, marginTop: 5, color: "#334155",
          textAlign: isUser ? "right" : "left",
          paddingLeft: isUser ? 0 : 2, paddingRight: isUser ? 2 : 0,
        }}>
          {new Date(message.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
