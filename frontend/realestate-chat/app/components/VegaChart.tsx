"use client";

import { useEffect, useRef } from "react";

interface VegaChartProps {
  spec: Record<string, unknown>;
}

export default function VegaChart({ spec }: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup: (() => void) | undefined;

    const renderChart = async () => {
      try {
        const vegaEmbed = (await import("vega-embed")).default;
        const result = await vegaEmbed(containerRef.current!, spec, {
          actions: {
            export:  true,
            source:  false,
            editor:  false,
            compiled: false,
          },
          theme: "default",
          renderer: "canvas",
        });
        cleanup = () => result.finalize();
      } catch (err) {
        console.error("Vega render error:", err);
        if (containerRef.current) {
          containerRef.current.innerHTML =
            `<p class="text-red-500 text-sm p-3">Chart render failed: ${err}</p>`;
        }
      }
    };

    renderChart();
    return () => cleanup?.();
  }, [spec]);

  return (
    <div className="vega-container mt-2 rounded-xl overflow-hidden bg-white border border-[var(--border)] p-3">
      <div ref={containerRef} />
    </div>
  );
}
