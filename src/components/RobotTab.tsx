import { useEffect, useMemo, useState } from "react";
import { Bot, Play, Pause, Lock, TrendingUp, TrendingDown } from "lucide-react";

const STRATEGIES = [
  { id: "trend", name: "Trend Rider", desc: "Follows strong moving-average trends", p: 0.62, risk: "Medium" },
  { id: "scalp", name: "Gold Scalper", desc: "Quick in-and-out trades on XAU/USD", p: 0.68, risk: "High" },
  { id: "breakout", name: "Breakout Hunter", desc: "Enters when price breaks key levels", p: 0.55, risk: "High" },
  { id: "revert", name: "Mean Reversion", desc: "Fades overstretched moves back to average", p: 0.6, risk: "Low" },
  { id: "grid", name: "Smart Grid", desc: "Layers orders across a price range", p: 0.7, risk: "Medium" },
] as const;
const PAIRS = ["XAU/USD", "EUR/USD", "GBP/USD", "BTC/USD", "NAS100"];

type Trade = { id: number; s: string; pair: string; side: "Buy" | "Sell"; pnl: number; t: number; acct: Mode };
type Mode = "demo" | "live";
type State = { mode: Mode; strategy: string; running: boolean; balance: Record<Mode, number>; trades: Trade[] };

const KEY = "goldline-robot";
const initial: State = { mode: "demo", strategy: "auto", running: false, balance: { demo: 10000, live: 0 }, trades: [] };

export function RobotTab() {
  const [st, setSt] = useState<State>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setSt({ ...initial, ...JSON.parse(raw), mode: "demo", running: false, balance: { ...initial.balance, ...JSON.parse(raw).balance } });
    } catch (error) {
      console.error("Unable to restore saved demo state", error);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(st)); }, [st, loaded]);

  useEffect(() => {
    if (!st.running) return;
    const iv = setInterval(() => {
      setSt((prev) => {
        if (prev.mode === "live") return { ...prev, running: false };
        const selectedStrategy = prev.strategy === "auto"
          ? STRATEGIES.reduce((best, candidate) => candidate.p > best.p ? candidate : best)
          : STRATEGIES.find((x) => x.id === prev.strategy)!;
        const strat = selectedStrategy;
        const win = Math.random() < strat.p;
        const size = Math.max(5, prev.balance[prev.mode] * 0.005);
        const pnl = +(win ? size * (0.6 + Math.random()) : -size * (0.5 + Math.random() * 0.8)).toFixed(2);
        const trade: Trade = {
          id: Date.now(), s: strat.id, pair: PAIRS[Math.floor(Math.random() * PAIRS.length)]!,
          side: Math.random() > 0.5 ? "Buy" : "Sell", pnl, t: Date.now(), acct: prev.mode,
        };
        return { ...prev, balance: { ...prev.balance, [prev.mode]: +(prev.balance[prev.mode] + pnl).toFixed(2) }, trades: [trade, ...prev.trades].slice(0, 200) };
      });
    }, 3500);
    return () => clearInterval(iv);
  }, [st.running]);

  const acctTrades = st.trades.filter((t) => t.acct === st.mode);
  const stats = useMemo(() => {
    const by: Record<string, { w: number; n: number }> = {};
    for (const t of acctTrades) { const b = (by[t.s] ??= { w: 0, n: 0 }); b.n++; if (t.pnl > 0) b.w++; }
    const n = acctTrades.length, w = acctTrades.filter((t) => t.pnl > 0).length;
    return { by, n, rate: n ? Math.round((w / n) * 100) : 0, pnl: acctTrades.reduce((a, t) => a + t.pnl, 0) };
  }, [acctTrades]);

  const set = (p: Partial<State>) => setSt((s) => ({ ...s, ...p }));
  const switchMode = (m: Mode) => { if (m === "live") return; set({ mode: m, running: false }); };
  const bestStrategy = STRATEGIES
    .map((strategy) => ({ ...strategy, pnl: acctTrades.filter((trade) => trade.s === strategy.id).reduce((total, trade) => total + trade.pnl, 0) }))
    .filter((strategy) => acctTrades.some((trade) => trade.s === strategy.id))
    .sort((first, second) => second.pnl - first.pnl)[0];

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 rounded-xl border bg-card p-1">
        {(["demo", "live"] as const).map((m) => (
          <button key={m} onClick={() => switchMode(m)} disabled={m === "live"}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold capitalize ${st.mode === m ? "bg-gold text-primary-foreground" : "text-muted-foreground"} disabled:opacity-50`}>
            {m === "live" && <Lock className="h-3.5 w-3.5" />}{m} account
          </button>
        ))}
      </div>

      {
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold">Live account not active</p>
          <p className="mt-1 text-xs text-muted-foreground">Live trading is unavailable until a verified brokerage connection is configured.</p>
          <a href="https://goldlinemarkets.com/" target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border bg-secondary py-2 text-center text-xs font-semibold">Open live account</a>
        </div>
      }

      <div className="rounded-2xl border bg-hero p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs capitalize text-muted-foreground">{st.mode} balance</p>
            <p className="mt-1 font-display text-3xl font-bold text-gold">${st.balance[st.mode].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <WinRing rate={stats.rate} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-background/40 p-2"><p className="text-muted-foreground">Trades</p><p className="text-base font-semibold">{stats.n}</p></div>
          <div className="rounded-lg bg-background/40 p-2"><p className="text-muted-foreground">Profit / loss</p>
            <p className={`text-base font-semibold ${stats.pnl >= 0 ? "text-success" : "text-destructive"}`}>{stats.pnl >= 0 ? "+" : ""}${stats.pnl.toFixed(2)}</p></div>
        </div>
        <button onClick={() => set({ running: !st.running })}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold ${st.running ? "border bg-secondary" : "bg-gold text-primary-foreground shadow-gold"}`}>
          {st.running ? <><Pause className="h-4 w-4" />Stop robot</> : <><Play className="h-4 w-4" />Start auto-trading</>}
        </button>
        {st.running && <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-success"><Bot className="h-3.5 w-3.5 animate-pulse" />Robot is trading on your {st.mode} account</p>}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Strategy</h2>
        {bestStrategy && <p className="mb-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs">Best demo performer: <span className="font-semibold">{bestStrategy.name}</span> · {bestStrategy.pnl >= 0 ? "+" : ""}${bestStrategy.pnl.toFixed(2)} P/L</p>}
        <div className="space-y-2">
          <button onClick={() => set({ strategy: "auto" })}
            className={`w-full rounded-xl border p-3 text-left ${st.strategy === "auto" ? "border-primary bg-accent" : "bg-card"}`}>
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">Auto Switch</p><span className="text-xs font-semibold text-primary">{st.strategy === "auto" ? "Active" : ""}</span></div>
            <p className="mt-0.5 text-xs text-muted-foreground">Automatically selects the strategy with the highest configured demo win rate.</p>
          </button>
          {STRATEGIES.map((s) => {
            const b = stats.by[s.id]; const r = b ? Math.round((b.w / b.n) * 100) : null;
            return (
              <button key={s.id} onClick={() => set({ strategy: s.id })}
                className={`w-full rounded-xl border p-3 text-left ${st.strategy === s.id ? "border-primary bg-accent" : "bg-card"}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <span className="text-xs font-semibold text-primary">{r === null ? "—" : `${r}% win`}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc} · {s.risk} risk{b ? ` · ${b.n} trades` : ""}</p>
              </button>
            );
          })}
        </div>
      </section>

      <ScenarioSimulator />

      <section>
        <h2 className="mb-2 text-lg font-semibold">Recent trades</h2>
        {acctTrades.length === 0 ? <p className="text-xs text-muted-foreground">No trades yet. Start the robot to begin.</p> : (
          <div className="divide-y rounded-xl border bg-card">
            {acctTrades.slice(0, 15).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  {t.pnl > 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  <div><p className="font-semibold">{t.side} {t.pair}</p><p className="text-muted-foreground">{STRATEGIES.find((x) => x.id === t.s)?.name}</p></div>
                </div>
                <span className={`font-semibold ${t.pnl > 0 ? "text-success" : "text-destructive"}`}>{t.pnl > 0 ? "+" : ""}${t.pnl.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="text-center text-[11px] text-muted-foreground">Past performance does not guarantee future results. Automated trading carries risk.</p>
    </div>
  );
}

function ScenarioSimulator() {
  const [startingBalance, setStartingBalance] = useState(10000);
  const [days, setDays] = useState(30);
  const [tradesPerDay, setTradesPerDay] = useState(3);
  const [winRate, setWinRate] = useState(55);
  const [riskPercent, setRiskPercent] = useState(1);
  const [result, setResult] = useState<number | null>(null);
  const expectedReturn = startingBalance * riskPercent / 100 * (winRate / 100 * 1.5 - (1 - winRate / 100)) * days * tradesPerDay;

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h2 className="text-lg font-semibold">Strategy scenario</h2>
        <p className="mt-1 text-xs text-muted-foreground">Illustrative estimate only. Not historical data or a forecast.</p>
      </div>
      <label className="block text-xs text-muted-foreground">Starting balance (USDT)
        <input type="number" min="100" step="100" value={startingBalance} onChange={(event) => setStartingBalance(Math.max(0, Number(event.target.value)))} className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted-foreground">Days
          <input type="number" min="1" max="365" value={days} onChange={(event) => setDays(Math.max(1, Number(event.target.value)))} className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="block text-xs text-muted-foreground">Trades per day
          <input type="number" min="1" max="50" value={tradesPerDay} onChange={(event) => setTradesPerDay(Math.max(1, Number(event.target.value)))} className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="block text-xs text-muted-foreground">Assumed win rate (%)
          <input type="number" min="0" max="100" value={winRate} onChange={(event) => setWinRate(Math.min(100, Math.max(0, Number(event.target.value))))} className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="block text-xs text-muted-foreground">Risk per trade (%)
          <input type="number" min="0.1" max="10" step="0.1" value={riskPercent} onChange={(event) => setRiskPercent(Math.min(10, Math.max(0, Number(event.target.value))))} className="mt-1 w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground" />
        </label>
      </div>
      <button onClick={() => setResult(expectedReturn)} className="w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-primary-foreground">Calculate scenario</button>
      {result !== null && <p role="status" className="text-sm">Illustrative expected P/L: <span className={result >= 0 ? "text-success" : "text-destructive"}>{result >= 0 ? "+" : ""}{result.toFixed(2)} USDT</span></p>}
    </section>
  );
}

function WinRing({ rate }: { rate: number }) {
  const c = 2 * Math.PI * 26;
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 60 60" className="h-16 w-16 -rotate-90">
        <circle cx="30" cy="30" r="26" fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx="30" cy="30" r="26" fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * rate) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-sm font-bold">{rate}%</span><span className="text-[9px] text-muted-foreground">win rate</span></div>
    </div>
  );
}
