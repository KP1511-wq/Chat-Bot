"use client";

import { useState, useEffect } from "react";

const API_BASE = "http://127.0.0.1:8001";

interface SuggestedQueriesProps {
  onSelect: (query: string) => void;
  refreshKey?: number;
}

type Suggestion = { icon: string; text: string };

const FALLBACK_SUGGESTIONS: Suggestion[] = [
  { icon: "🔍", text: "Show the first 5 records" },
  { icon: "📊", text: "Plot a chart of the data" },
  { icon: "💡", text: "What columns are in this dataset?" },
];

export default function SuggestedQueries({ onSelect, refreshKey = 0 }: SuggestedQueriesProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(FALLBACK_SUGGESTIONS);

  useEffect(() => {
    let cancelled = false;
    async function fetchSuggestions() {
      try {
        const res = await fetch(`${API_BASE}/schema/suggestions`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.suggestions?.length) {
            setSuggestions(data.suggestions);
          }
        }
      } catch {
        // keep fallback
      }
    }
    fetchSuggestions();
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {suggestions.map((s) => (
        <button
          key={s.text}
          onClick={() => onSelect(s.text)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[var(--border)]
                     text-sm text-[var(--text-secondary)] hover:border-[var(--brand)] hover:text-[var(--brand)]
                     hover:bg-[var(--brand-light)] transition-all duration-200 shadow-sm hover:shadow-md
                     whitespace-nowrap"
        >
          <span>{s.icon}</span>
          <span>{s.text}</span>
        </button>
      ))}
    </div>
  );
}
