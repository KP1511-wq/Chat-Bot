"use client";

import { useState, useEffect } from "react";
import { BarChart2, Search, Lightbulb, TrendingUp, Filter, Hash } from "lucide-react";

type Suggestion = { icon: string; text: string };

const ICON_MAP: Record<string, React.ReactNode> = {
  "📊": <BarChart2 size={14} />,
  "🔍": <Search    size={14} />,
  "💡": <Lightbulb size={14} />,
  "📈": <TrendingUp size={14} />,
  "📍": <Filter    size={14} />,
  "🔢": <Hash      size={14} />,
};

const FALLBACK: Suggestion[] = [
  { icon: "🔍", text: "Show the first 5 records" },
  { icon: "📊", text: "Plot a chart of the data" },
  { icon: "💡", text: "What columns are in this dataset?" },
  { icon: "📈", text: "Show top 5 records by value" },
];

interface Props {
  onSelect: (query: string) => void;
  refreshKey?: number;
}

export default function SuggestedQueries({ onSelect, refreshKey = 0 }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(FALLBACK);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/suggestions`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data.suggestions?.length) setSuggestions(data.suggestions);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="grid grid-cols-2 gap-2.5 w-full max-w-xl">
      {suggestions.map((s, i) => (
        <button
          key={s.text}
          onClick={() => onSelect(s.text)}
          className="glass glass-hover group flex items-start gap-3 p-3.5 rounded-xl text-left transition-all duration-200 card-enter"
          style={{
            animationDelay: `${i * 60}ms`,
            border: "1px solid var(--border-md)",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(59,130,246,0.4)";
            (e.currentTarget as HTMLElement).style.boxShadow  = "0 0 16px rgba(59,130,246,0.12)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border-md)";
            (e.currentTarget as HTMLElement).style.boxShadow  = "none";
          }}
        >
          <span className="flex-shrink-0 mt-0.5 text-accent"
            style={{ color: "#3B82F6" }}>
            {ICON_MAP[s.icon] ?? <Search size={14} />}
          </span>
          <span className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>
            {s.text}
          </span>
        </button>
      ))}
    </div>
  );
}
