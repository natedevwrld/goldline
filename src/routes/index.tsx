import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Bell, BarChart3, LineChart, User, ShieldCheck, Zap, Globe2, Download, Bot } from "lucide-react";
import type { SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { RobotTab } from "@/components/RobotTab";
import { TradingViewWidget } from "@/components/TradingViewWidget";
import { canUseSW, registerSW, subscribePush } from "@/lib/pwa";
import { isWeekendUtc } from "@/lib/market-calendar";
import { getSupabaseClient } from "@/lib/supabase";
import { getVapidPublicKey, sendWelcomePush } from "@/lib/push.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Goldline Markets — Trade Forex, Gold & Crypto" },
      { name: "description", content: "Goldline Markets mini app: live TradingView charts, market overview and instant alerts." },
      { property: "og:title", content: "Goldline Markets — Trade Forex, Gold & Crypto" },
      { property: "og:description", content: "Live charts, market overview and instant push alerts in one installable app." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SYMBOLS = [
  { s: "OANDA:XAUUSD", l: "Gold" },
  { s: "FX:EURUSD", l: "EUR/USD" },
  { s: "FX:GBPUSD", l: "GBP/USD" },
  { s: "BITSTAMP:BTCUSD", l: "Bitcoin" },
  { s: "OANDA:NAS100USD", l: "Nasdaq" },
];

type Tab = "home" | "robot" | "chart" | "markets" | "account";

function Index() {
  const [tab, setTab] = useState<Tab>("home");
  const [symbol, setSymbol] = useState("OANDA:XAUUSD");
  const [weekendMarket, setWeekendMarket] = useState(() => isWeekendUtc());
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => { registerSW().catch(() => {}); }, []);
  useEffect(() => {
    if (localStorage.getItem("goldline-onboarding-complete") !== "true") setShowOnboarding(true);
  }, []);
  useEffect(() => {
    const updateMarketDay = () => setWeekendMarket(isWeekendUtc());
    const interval = window.setInterval(updateMarketDay, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <header className="safe-top sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-192.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="font-display text-lg font-bold">Goldline<span className="text-gold"> Markets</span></span>
        </div>
        <a href="https://goldlinemarkets.com/" target="_blank" rel="noreferrer"
          className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-gold">
          Open account
        </a>
      </header>

      <div className="h-[46px] border-b">
        <TradingViewWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js"
          config={{ symbols: SYMBOLS.map((x) => ({ proName: x.s, title: x.l })), colorTheme: "dark", isTransparent: true, displayMode: "compact", locale: "en" }}
        />
      </div>

      <main className="flex-1 pb-24">
        {tab === "home" && <Home onTrade={(s) => { setSymbol(s); setTab("chart"); }} />}
        {tab === "chart" && <ChartTab symbol={weekendMarket ? "BITSTAMP:BTCUSD" : symbol} setSymbol={setSymbol} weekendMarket={weekendMarket} />}
        {tab === "markets" && (
          <div className="h-[calc(100vh-200px)] p-3">
            <TradingViewWidget
              src="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
              config={{ colorTheme: "dark", isTransparent: true, width: "100%", height: "100%", locale: "en", showChart: true,
                tabs: [
                  { title: "Forex", symbols: [{ s: "FX:EURUSD" }, { s: "FX:GBPUSD" }, { s: "FX:USDJPY" }, { s: "FX:AUDUSD" }] },
                  { title: "Metals", symbols: [{ s: "OANDA:XAUUSD" }, { s: "OANDA:XAGUSD" }] },
                  { title: "Indices", symbols: [{ s: "OANDA:NAS100USD" }, { s: "OANDA:SPX500USD" }, { s: "OANDA:US30USD" }] },
                  { title: "Crypto", symbols: [{ s: "BITSTAMP:BTCUSD" }, { s: "BITSTAMP:ETHUSD" }] },
                ] }}
              className="h-full"
            />
          </div>
        )}
        {tab === "robot" && <RobotTab />}
        {tab === "account" && <Account />}
      </main>

      <Onboarding open={showOnboarding} onOpenChange={setShowOnboarding} />

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t bg-card/95 backdrop-blur">
        <div className="grid grid-cols-5">
          {([
            ["home", "Home", Zap], ["robot", "Robot", Bot], ["chart", "Chart", LineChart], ["markets", "Markets", BarChart3], ["account", "Account", User],
          ] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors ${tab === k ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />{label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Onboarding({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0);
  const pages = [
    { title: "Markets at a glance", description: "Follow forex, metals, indices, and crypto from one compact workspace." },
    { title: "Charts and strategies", description: "Explore TradingView charts and review the demo robot before connecting any live account." },
    { title: "Alerts when it matters", description: "Enable push alerts and install Goldline from your browser for quick access." },
  ];

  function finish() {
    localStorage.setItem("goldline-onboarding-complete", "true");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) finish(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="pr-6">
          <p className="text-xs font-semibold uppercase text-primary">Welcome to Goldline</p>
          <DialogTitle>{pages[step]!.title}</DialogTitle>
          <DialogDescription>{pages[step]!.description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${pages.length}`}>
          {pages.map((page, index) => <span key={page.title} className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-secondary"}`} />)}
        </div>
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <button onClick={finish} className="text-sm text-muted-foreground">Skip</button>
          {step < pages.length - 1 ? (
            <button onClick={() => setStep((current) => current + 1)} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-foreground">Continue</button>
          ) : (
            <button onClick={finish} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-primary-foreground">Get started</button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Home({ onTrade }: { onTrade: (s: string) => void }) {
  return (
    <div className="space-y-5">
      <section className="bg-hero px-5 pb-6 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-foreground">Regulated · Fast · Transparent</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight">Trade the world's markets with <span className="text-gold">golden precision</span></h1>
        <p className="mt-3 text-sm text-muted-foreground">Forex, gold, indices and crypto — tight spreads and lightning execution.</p>
        <div className="mt-5 flex gap-3">
          <a href="https://goldlinemarkets.com/" target="_blank" rel="noreferrer" className="flex-1 rounded-xl bg-gold py-3 text-center font-semibold text-primary-foreground shadow-gold">Start trading</a>
          <button onClick={() => onTrade("OANDA:XAUUSD")} className="flex-1 rounded-xl border bg-secondary py-3 font-semibold">Live chart</button>
        </div>
      </section>

      <div className="px-4"><NotifyCard /></div>
      <div className="px-4"><InstallCard /></div>

      <section className="px-4">
        <h2 className="mb-3 text-lg font-semibold">Popular instruments</h2>
        <div className="space-y-2">
          {SYMBOLS.map((x) => (
            <button key={x.s} onClick={() => onTrade(x.s)} className="block w-full overflow-hidden rounded-xl border bg-card text-left">
              <div className="pointer-events-none h-[72px]">
                <TradingViewWidget
                  src="https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js"
                  config={{ symbol: x.s, colorTheme: "dark", isTransparent: true, width: "100%", locale: "en" }}
                />
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 px-4">
        {[[ShieldCheck, "Secure funds"], [Zap, "Fast execution"], [Globe2, "Global markets"]].map(([Icon, t]) => {
          const I = Icon as typeof Zap;
          return (
            <div key={t as string} className="rounded-xl border bg-card p-3 text-center">
              <I className="mx-auto h-5 w-5 text-primary" />
              <p className="mt-2 text-xs font-medium">{t as string}</p>
            </div>
          );
        })}
      </section>
      <p className="px-6 text-center text-[11px] text-muted-foreground">Trading CFDs carries a high level of risk and may not be suitable for all investors.</p>
    </div>
  );
}

function ChartTab({ symbol, setSymbol, weekendMarket }: { symbol: string; setSymbol: (s: string) => void; weekendMarket: boolean }) {
  return (
    <div className="flex h-[calc(100vh-190px)] flex-col">
      {weekendMarket && <p className="px-4 pt-3 text-xs text-muted-foreground">Weekend market: showing BTC/USD</p>}
      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {(weekendMarket ? SYMBOLS.filter((x) => x.s === "BITSTAMP:BTCUSD") : SYMBOLS).map((x) => (
          <button key={x.s} onClick={() => setSymbol(x.s)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${symbol === x.s ? "bg-gold text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {x.l}
          </button>
        ))}
      </div>
      <div className="flex-1 px-2">
        <TradingViewWidget
          src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
          config={{ autosize: true, symbol, interval: "60", timezone: "Etc/UTC", theme: "dark", style: "1", locale: "en", allow_symbol_change: true, hide_side_toolbar: true, backgroundColor: "rgba(0,0,0,0)" }}
          className="h-full"
        />
      </div>
    </div>
  );
}

function NotifyCard() {
  const [state, setState] = useState<"idle" | "working" | "done" | "denied" | "unsupported" | "error">("idle");
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) setState("unsupported");
    else if (Notification.permission === "granted") setState("done");
    else if (Notification.permission === "denied") setState("denied");
  }, []);

  async function enable() {
    setState("working");
    try {
      if (!canUseSW()) { setState("unsupported"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("denied"); return; }
      await registerSW();
      const { key } = await getVapidPublicKey();
      const sub = await subscribePush(key);
      await sendWelcomePush({ data: sub.toJSON() as never });
      setState("done");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  const msg = {
    idle: "Get instant alerts on price moves and account updates.",
    working: "Setting up alerts…",
    done: "Alerts are on. Check your welcome notification!",
    denied: "Notifications are blocked in your browser settings.",
    unsupported: "Alerts work in the published, installed app.",
    error: "Couldn't turn on alerts. Please try again.",
  }[state];

  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
      <div className="rounded-xl bg-accent p-2.5"><Bell className="h-5 w-5 text-accent-foreground" /></div>
      <div className="flex-1">
        <p className="text-sm font-semibold">Market alerts</p>
        <p className="text-xs text-muted-foreground">{msg}</p>
      </div>
      {(state === "idle" || state === "error") && (
        <button onClick={enable} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-primary-foreground">Enable</button>
      )}
    </div>
  );
}

type BIPEvent = Event & { prompt: () => Promise<void> };
function InstallCard() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!evt && !isIos) return null;
  return (
    <div className="rounded-xl border bg-card p-4">
      <button onClick={() => { if (evt) { void evt.prompt(); setEvt(null); } else setShowInstructions((shown) => !shown); }} className="flex w-full items-center gap-3 text-left">
        <div className="rounded-lg bg-accent p-2.5"><Download className="h-5 w-5 text-accent-foreground" /></div>
        <div><p className="text-sm font-semibold">Install Goldline app</p><p className="text-xs text-muted-foreground">Add it to your home screen for quick access.</p></div>
      </button>
      {isIos && showInstructions && <p className="mt-3 text-xs text-muted-foreground">In Safari, tap Share, then choose Add to Home Screen.</p>}
    </div>
  );
}

function Account() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [role, setRole] = useState("user");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user) { setRole("user"); return; }
    let active = true;
    void supabase.from("profiles").select("role").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (active) setRole(data?.role ?? "user");
    });
    return () => { active = false; };
  }, [supabase, user]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setAuthMessage("");
    const result = creatingAccount
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setAuthMessage(result.error.message);
    else if (creatingAccount && !result.data.session) setAuthMessage("Check your email to confirm your account.");
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthMessage(error.message);
    setBusy(false);
  }

  return (
    <div className="space-y-4 p-4">
      {user ? (
        <section className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Signed in</p>
          <p className="mt-1 text-sm font-semibold">{user.email}</p>
          <button onClick={() => void supabase?.auth.signOut()} className="mt-3 text-sm text-primary">Sign out</button>
        </section>
      ) : (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold">{creatingAccount ? "Create account" : "Sign in"}</h2>
          {!supabase ? (
            <p className="mt-2 text-sm text-muted-foreground">Authentication is not configured yet.</p>
          ) : (
            <>
              <form onSubmit={submitAuth} className="mt-3 space-y-3">
                <input aria-label="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm" />
                <input aria-label="Password" type="password" autoComplete={creatingAccount ? "new-password" : "current-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm" />
                <button disabled={busy} className="w-full rounded-lg bg-gold py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Please wait…" : creatingAccount ? "Create account" : "Sign in"}</button>
              </form>
              <button disabled={busy} onClick={() => void signInWithGoogle()} className="mt-2 w-full rounded-lg border bg-secondary py-2.5 text-sm font-semibold disabled:opacity-50">Continue with Google</button>
              <button onClick={() => { setCreatingAccount((value) => !value); setAuthMessage(""); }} className="mt-3 w-full text-sm text-primary">{creatingAccount ? "Already registered? Sign in" : "Create an account"}</button>
              {authMessage && <p role="status" className="mt-3 text-xs text-muted-foreground">{authMessage}</p>}
            </>
          )}
        </section>
      )}
      {user && supabase && <WalletPanel supabase={supabase} userId={user.id} />}
      {user && role === "admin" && supabase && <AdminPanel supabase={supabase} />}
      <NotifyCard />
      {[["Open live account", "https://goldlinemarkets.com/"], ["Deposit funds", "https://goldlinemarkets.com/"], ["Support", "https://goldlinemarkets.com/"]].map(([t, u]) => (
        <a key={t} href={t === "Support" ? "https://t.me/traderedge777" : u} target="_blank" rel="noreferrer" className="block rounded-xl border bg-card px-4 py-3.5 text-sm font-medium">{t === "Support" ? "Support on Telegram" : t}</a>
      ))}
    </div>
  );
}

type WalletTransaction = {
  id: string;
  kind: "deposit" | "withdrawal";
  amount: number | string;
  currency: string;
  status: string;
  created_at: string;
};

function WalletPanel({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [kind, setKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [walletResult, transactionResult] = await Promise.all([
      supabase.from("wallets").select("balance").eq("user_id", userId).maybeSingle(),
      supabase.from("transactions").select("id,kind,amount,currency,status,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    if (!walletResult.error) setBalance(walletResult.data ? Number(walletResult.data.balance) : 0);
    if (!transactionResult.error) setTransactions((transactionResult.data ?? []) as WalletTransaction[]);
  }, [supabase, userId]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel(`wallet-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${userId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, supabase, userId]);

  async function requestTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("transactions").insert({ user_id: userId, kind, amount: value });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setAmount("");
      setMessage("Request submitted for manual review.");
      await refresh();
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <p className="text-xs text-muted-foreground">USDT wallet balance</p>
        <p className="mt-1 font-display text-2xl font-bold text-gold">{balance === null ? "Loading…" : `${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}</p>
      </div>
      <form onSubmit={requestTransaction} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <select aria-label="Transaction type" value={kind} onChange={(event) => setKind(event.target.value as "deposit" | "withdrawal")} className="min-w-0 rounded-lg border bg-background px-2 py-2 text-xs">
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdraw</option>
        </select>
        <input aria-label="Amount in USDT" type="number" min="0.00000001" step="any" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" className="min-w-0 rounded-lg border bg-background px-2 py-2 text-xs" />
        <button disabled={busy} className="rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">Request</button>
      </form>
      <p className="text-[11px] text-muted-foreground">Deposit and withdrawal requests are manually reviewed before the wallet changes.</p>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      <div className="divide-y border-t">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between gap-2 py-2 text-xs">
            <span className="capitalize">{transaction.kind} · {transaction.status}</span>
            <span>{Number(transaction.amount).toLocaleString()} {transaction.currency}</span>
          </div>
        ))}
        {transactions.length === 0 && <p className="py-2 text-xs text-muted-foreground">No wallet transactions yet.</p>}
      </div>
    </section>
  );
}

type AdminTransaction = WalletTransaction & { user_id: string };
type AdminNotice = { id: string; title: string; body: string; created_at: string };

function AdminPanel({ supabase }: { supabase: SupabaseClient }) {
  const [pending, setPending] = useState<AdminTransaction[]>([]);
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [transactionResult, noticeResult] = await Promise.all([
      supabase.from("transactions").select("id,user_id,kind,amount,currency,status,created_at").eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("admin_notifications").select("id,title,body,created_at").order("created_at", { ascending: false }).limit(20),
    ]);
    if (!transactionResult.error) setPending((transactionResult.data ?? []) as AdminTransaction[]);
    if (!noticeResult.error) setNotices((noticeResult.data ?? []) as AdminNotice[]);
  }, [supabase]);

  useEffect(() => {
    void refresh();
    const channel = supabase.channel("admin-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, supabase]);

  async function process(id: string, approve: boolean) {
    const { error } = await supabase.rpc("process_transaction", { p_transaction_id: id, p_approve: approve });
    setMessage(error ? error.message : approve ? "Transaction processed." : "Transaction rejected.");
    if (!error) await refresh();
  }

  return (
    <section className="space-y-4 border-t pt-4">
      <h2 className="text-lg font-semibold">Admin</h2>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Pending transactions</h3>
        {pending.length === 0 && <p className="text-xs text-muted-foreground">No pending requests.</p>}
        <div className="space-y-2">
          {pending.map((transaction) => (
            <div key={transaction.id} className="rounded-lg border bg-card p-3">
              <p className="text-xs">{transaction.kind} · {Number(transaction.amount).toLocaleString()} {transaction.currency}</p>
              <p className="mt-1 break-all text-[10px] text-muted-foreground">{transaction.user_id}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void process(transaction.id, true)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Approve</button>
                <button onClick={() => void process(transaction.id, false)} className="rounded-md border px-3 py-1.5 text-xs font-semibold">Reject</button>
              </div>
            </div>
          ))}
        </div>
        {message && <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Recent admin notifications</h3>
        <div className="divide-y rounded-lg border bg-card px-3">
          {notices.map((notice) => <div key={notice.id} className="py-2"><p className="text-xs font-semibold">{notice.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{notice.body}</p></div>)}
          {notices.length === 0 && <p className="py-2 text-xs text-muted-foreground">No notifications yet.</p>}
        </div>
      </div>
    </section>
  );
}
