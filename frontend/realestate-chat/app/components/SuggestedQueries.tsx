"use client";

interface SuggestedQueriesProps {
  onSelect: (query: string) => void;
}

const SUGGESTIONS = [
  { icon: "🏆", text: "Show the 5 most expensive houses" },
  { icon: "💰", text: "Find the cheapest houses near the ocean" },
  { icon: "📊", text: "Plot average price by ocean proximity" },
  { icon: "🏘️", text: "Find houses under $200,000 and plot their age distribution" },
  { icon: "📈", text: "Show total houses by ocean proximity as a pie chart" },
  { icon: "🏡", text: "Find the largest houses by total rooms" },
];

export default function SuggestedQueries({ onSelect }: SuggestedQueriesProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {SUGGESTIONS.map((s) => (
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
