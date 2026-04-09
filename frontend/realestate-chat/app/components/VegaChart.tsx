"use client";

import { useEffect, useRef } from "react";

interface VegaChartProps {
  spec: Record<string, unknown>;
}


export default function VegaChart({ spec }: VegaChartProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cleanup: (() => void) | undefined;

    import("vega-embed").then(({ default: embed }) => {
      const merged = { ...spec, background: "transparent" } as Parameters<typeof embed>[1];
      embed(ref.current!, merged, { actions: false, renderer: "canvas" })
        .then(result => { cleanup = () => result.finalize(); })
        .catch(err => {
          if (ref.current) ref.current.innerHTML =
            `<p style="color:#f87171;font-size:12px;padding:12px">Chart render failed: ${err}</p>`;
        });
    });

    return () => cleanup?.();
  }, [spec]);

  return (
    <div ref={ref} className="w-full" />
  );
}
