import { useEffect, useRef } from "react";

type Props = { src: string; config: Record<string, unknown>; className?: string };

export function TradingViewWidget({ src, config, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(config);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.type = "text/javascript";
    s.innerHTML = key;
    el.appendChild(s);
    return () => { el.innerHTML = ""; };
  }, [src, key]);
  return <div ref={ref} className={`tradingview-widget-container ${className ?? ""}`} />;
}
