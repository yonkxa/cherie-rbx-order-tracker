"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  Gamepad2,
  Link2,
  LogOut,
  Menu,
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderStatus = "pending" | "processing" | "completed" | "refunded";
type ProcessType = "fast" | "slow";
type PayoutStatus = OrderStatus;
type SourceGroup = "A (supp)" | "A (d'isle)" | "B (supp)" | "C (supp)" | "D (supp)" | "E (supp)";
type View = "overview" | "gamepasses" | "payouts" | "settings";
type GamepassLink = { amount: number; link: string };

type GamepassOrder = {
  id: string; robux_amount: number; process_type: ProcessType; gamepass_link: string;
  gamepass_links: GamepassLink[] | null; buyer_username: string; status: OrderStatus;
  notes: string | null; created_by: string | null; completed_at: string | null; created_at: string; updated_at: string;
};

type RobuxPayout = {
  id: string; buyer_username: string; roblox_username: string; robux_amount: number; source_group: SourceGroup;
  status: PayoutStatus; notes: string | null; created_by: string | null; completed_at: string | null; created_at: string; updated_at: string;
};

type DropdownOption = { value: string; label: string; hint?: string };

const GROUPS: SourceGroup[] = ["A (supp)", "A (d'isle)", "B (supp)", "C (supp)", "D (supp)", "E (supp)"];
const STATUSES: OrderStatus[] = ["pending", "processing", "completed", "refunded"];
const money = (n: number) => `${n.toLocaleString()} R$`;
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

function statusLabel(status: string) { return status.charAt(0).toUpperCase() + status.slice(1); }
function cleanUsername(value: string) { return value.trim().replace(/^@/, ""); }
function parseGamepassLinks(order: GamepassOrder): GamepassLink[] {
  if (Array.isArray(order.gamepass_links) && order.gamepass_links.length) return order.gamepass_links;
  return order.gamepass_link ? [{ amount: order.robux_amount, link: order.gamepass_link }] : [];
}
function friendlyAuthError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("email not confirmed")) return "This staff email is not confirmed in Supabase.";
  if (lower.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (lower.includes("jwt issued at future")) return "Your session token appears to be from a future time. Check your device date/time, then sign in again.";
  return message;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [gamepasses, setGamepasses] = useState<GamepassOrder[]>([]);
  const [payouts, setPayouts] = useState<RobuxPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [processFilter, setProcessFilter] = useState<"all" | ProcessType>("all");
  const [groupFilter, setGroupFilter] = useState<"all" | SourceGroup>("all");
  const [showGamepassModal, setShowGamepassModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gamepassForm, setGamepassForm] = useState({ buyer_username: "", robux_amount: "", process_type: "slow" as ProcessType, status: "pending" as OrderStatus, notes: "" });
  const [gamepassLinks, setGamepassLinks] = useState<GamepassLink[]>([{ amount: 0, link: "" }]);
  const [payoutForm, setPayoutForm] = useState({ buyer_username: "", roblox_username: "", robux_amount: "", source_group: "A (supp)" as SourceGroup, status: "pending" as PayoutStatus, notes: "" });

  useEffect(() => {
    const saved = window.localStorage.getItem("cherie-theme");
    setDarkMode(saved === "dark");
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(friendlyAuthError(error.message));
      setSession(data.session);
      if (data.session) loadAll(); else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadAll(); else { setGamepasses([]); setPayouts([]); setLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("cherie-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    document.body.classList.toggle("modal-open", showGamepassModal || showPayoutModal);
    return () => document.body.classList.remove("modal-open");
  }, [showGamepassModal, showPayoutModal]);

  async function loadAll() {
    setLoading(true);
    const [ordersResult, payoutsResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("robux_payouts").select("*").order("created_at", { ascending: false }),
    ]);
    if (ordersResult.error) setMessage(ordersResult.error.message); else setGamepasses((ordersResult.data ?? []) as GamepassOrder[]);
    if (payoutsResult.error) setMessage(payoutsResult.error.message); else setPayouts((payoutsResult.data ?? []) as RobuxPayout[]);
    setLoading(false);
  }

  async function login(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage(friendlyAuthError(error.message));
  }
  async function logout() { await supabase.auth.signOut(); setView("overview"); }
  function go(viewName: View) { setView(viewName); setMobileNavOpen(false); setSearch(""); }
  function resetGamepassForm() { setGamepassForm({ buyer_username: "", robux_amount: "", process_type: "slow", status: "pending", notes: "" }); setGamepassLinks([{ amount: 0, link: "" }]); }
  function resetPayoutForm() { setPayoutForm({ buyer_username: "", roblox_username: "", robux_amount: "", source_group: "A (supp)", status: "pending", notes: "" }); }
  function openGamepassModal() { resetGamepassForm(); setMessage(""); setShowGamepassModal(true); }
  function openPayoutModal() { resetPayoutForm(); setMessage(""); setShowPayoutModal(true); }
  function addGamepassLine() { setGamepassLinks(items => [...items, { amount: 0, link: "" }]); }
  function removeGamepassLine(index: number) { setGamepassLinks(items => items.length === 1 ? items : items.filter((_, i) => i !== index)); }
  function updateGamepassLine(index: number, key: keyof GamepassLink, value: string) {
    setGamepassLinks(items => items.map((item, i) => i === index ? { ...item, [key]: key === "amount" ? Number(value.replace(/,/g, "")) || 0 : value } : item));
  }

  async function addGamepass(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const amount = Number(gamepassForm.robux_amount.replace(/,/g, ""));
    const links = gamepassLinks.map(item => ({ amount: Number(item.amount) || 0, link: item.link.trim() }));
    const splitTotal = links.reduce((sum, item) => sum + item.amount, 0);
    if (!amount || amount <= 0) return setMessage("Enter a valid total Robux amount.");
    if (!gamepassForm.buyer_username.trim()) return setMessage("Add the buyer username.");
    if (links.some(item => !item.amount || item.amount <= 0)) return setMessage("Each gamepass needs a valid Robux amount.");
    if (links.some(item => !item.link)) return setMessage("Add a link for every gamepass.");
    if (links.some(item => !/^https?:\/\//i.test(item.link))) return setMessage("Each gamepass link must start with http:// or https://.");
    if (splitTotal !== amount) return setMessage(`The gamepass split totals ${money(splitTotal)}, but the order is ${money(amount)}.`);
    const { error } = await supabase.from("orders").insert({ robux_amount: amount, process_type: gamepassForm.process_type, gamepass_link: links[0].link, gamepass_links: links, buyer_username: cleanUsername(gamepassForm.buyer_username), status: gamepassForm.status, notes: gamepassForm.notes.trim() || null, created_by: session?.user.id });
    if (error) return setMessage(error.message);
    setShowGamepassModal(false); await loadAll();
  }

  async function addPayout(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const amount = Number(payoutForm.robux_amount.replace(/,/g, ""));
    if (!amount || amount <= 0) return setMessage("Enter a valid Robux amount.");
    if (!payoutForm.buyer_username.trim()) return setMessage("Add the buyer username.");
    if (!payoutForm.roblox_username.trim()) return setMessage("Add the Roblox recipient username.");
    const { error } = await supabase.from("robux_payouts").insert({ buyer_username: cleanUsername(payoutForm.buyer_username), roblox_username: cleanUsername(payoutForm.roblox_username), robux_amount: amount, source_group: payoutForm.source_group, status: payoutForm.status, notes: payoutForm.notes.trim() || null, created_by: session?.user.id });
    if (error) return setMessage(error.message);
    setShowPayoutModal(false); await loadAll();
  }

  async function updateGamepassStatus(id: string, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    if (error) setMessage(error.message); else await loadAll();
  }
  async function updatePayoutStatus(id: string, status: PayoutStatus) {
    const { error } = await supabase.from("robux_payouts").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", id);
    if (error) setMessage(error.message); else await loadAll();
  }

  const pendingGamepasses = gamepasses.filter(o => o.status === "pending").reduce((s, o) => s + o.robux_amount, 0);
  const processingGamepasses = gamepasses.filter(o => o.status === "processing").reduce((s, o) => s + o.robux_amount, 0);
  const pendingPayouts = payouts.filter(o => o.status === "pending").reduce((s, o) => s + o.robux_amount, 0);
  const processingPayouts = payouts.filter(o => o.status === "processing").reduce((s, o) => s + o.robux_amount, 0);
  const completedGamepasses = gamepasses.filter(o => o.status === "completed").reduce((s, o) => s + o.robux_amount, 0);
  const completedPayouts = payouts.filter(o => o.status === "completed").reduce((s, o) => s + o.robux_amount, 0);

  const visibleGamepasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gamepasses.filter(o => {
      const links = parseGamepassLinks(o);
      const matchesSearch = !q || [o.buyer_username, o.gamepass_link, o.notes ?? "", String(o.robux_amount), ...links.map(item => `${item.amount} ${item.link}`)].some(v => v.toLowerCase().includes(q));
      return matchesSearch && (statusFilter === "all" || o.status === statusFilter) && (processFilter === "all" || o.process_type === processFilter);
    });
  }, [gamepasses, search, statusFilter, processFilter]);
  const visiblePayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payouts.filter(o => {
      const matchesSearch = !q || [o.buyer_username, o.roblox_username, o.source_group, o.notes ?? "", String(o.robux_amount)].some(v => v.toLowerCase().includes(q));
      return matchesSearch && (statusFilter === "all" || o.status === statusFilter) && (groupFilter === "all" || o.source_group === groupFilter);
    });
  }, [payouts, search, statusFilter, groupFilter]);

  if (!session) return <Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} login={login} message={message} />;

  const activeTitle = view === "overview" ? "Overview" : view === "gamepasses" ? "Gamepass orders" : view === "payouts" ? "Robux payouts" : "Settings";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button className="mobile-menu-btn icon-btn" type="button" onClick={() => setMobileNavOpen(v => !v)} aria-label="Open navigation"><Menu size={18} /></button>
          <Logo className="brand-logo" />
          <div className="brand-copy"><strong>Chérie</strong><span>Order Desk</span></div>
          <span className="top-status"><i /> Shared workspace</span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDarkMode(v => !v)} title={darkMode ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle theme">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button className="icon-btn" onClick={loadAll} title="Refresh records" aria-label="Refresh"><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
          <button className="account-chip" onClick={() => go("settings")} title="Open settings"><span className="account-avatar">{(session.user.email?.[0] ?? "C").toUpperCase()}</span><span className="account-email">{session.user.email}</span><ChevronDown size={14} /></button>
        </div>
      </header>

      {mobileNavOpen && <button className="mobile-nav-overlay" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <div className="workspace">
        <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-brand"><Logo className="sidebar-logo" /><div><strong>Chérie</strong><span>Internal workspace</span></div></div>
          <div className="sidebar-section-label">Workspace</div>
          <NavButton active={view === "overview"} icon={<ArrowUpRight size={16} />} onClick={() => go("overview")}>Overview</NavButton>
          <NavButton active={view === "gamepasses"} icon={<Gamepad2 size={16} />} onClick={() => go("gamepasses")}><span className="nav-label">Gamepass orders</span><span className="nav-count">{gamepasses.length}</span></NavButton>
          <NavButton active={view === "payouts"} icon={<WalletCards size={16} />} onClick={() => go("payouts")}><span className="nav-label">Robux payouts</span><span className="nav-count">{payouts.length}</span></NavButton>
          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Manage</div>
          <NavButton active={view === "settings"} icon={<Settings size={16} />} onClick={() => go("settings")}>Settings</NavButton>
          <div className="sidebar-spacer" />
          <button className="sidebar-add" onClick={openGamepassModal}><Plus size={15} /> New gamepass order</button>
          <button className="sidebar-add" onClick={openPayoutModal}><Plus size={15} /> New Robux payout</button>
          <button className="sidebar-logout" onClick={logout}><LogOut size={15} /> Sign out</button>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div><p className="breadcrumb">Workspace <span>/</span> {activeTitle}</p><h1>{activeTitle}</h1></div>
            {view === "gamepasses" && <button className="primary-btn" onClick={openGamepassModal}><Plus size={16} /> New order</button>}
            {view === "payouts" && <button className="primary-btn" onClick={openPayoutModal}><Plus size={16} /> New payout</button>}
          </div>
          {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}

          {view === "overview" && <Overview gamepasses={gamepasses} payouts={payouts} pendingGamepasses={pendingGamepasses} processingGamepasses={processingGamepasses} pendingPayouts={pendingPayouts} processingPayouts={processingPayouts} completedGamepasses={completedGamepasses} completedPayouts={completedPayouts} onGamepasses={() => go("gamepasses")} onPayouts={() => go("payouts")} />}
          {view === "gamepasses" && <>
            <div className="summary-row"><Summary label="Pending" value={money(pendingGamepasses)} detail="Not yet sent to supp" tone="amber" /><Summary label="Processing" value={money(processingGamepasses)} detail="Already sent to supp" tone="blue" /><Summary label="Completed" value={money(completedGamepasses)} detail="Gamepass already bought" tone="green" /><Summary label="Orders" value={String(gamepasses.length)} detail="All gamepass records" tone="neutral" /></div>
            <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Process" thirdValue={processFilter} thirdOptions={["all", "fast", "slow"]} setThirdValue={v => setProcessFilter(v as "all" | ProcessType)} />
            <GamepassTable orders={visibleGamepasses} loading={loading} onStatus={updateGamepassStatus} />
          </>}
          {view === "payouts" && <>
            <div className="summary-row"><Summary label="Pending" value={money(pendingPayouts)} detail="Not yet sent" tone="amber" /><Summary label="Processing" value={money(processingPayouts)} detail="Already sent" tone="blue" /><Summary label="Completed" value={money(completedPayouts)} detail="Robux sent" tone="green" /><Summary label="Payouts" value={String(payouts.length)} detail="All payout records" tone="neutral" /></div>
            <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Group" thirdValue={groupFilter} thirdOptions={["all", ...GROUPS]} setThirdValue={v => setGroupFilter(v as "all" | SourceGroup)} />
            <PayoutTable payouts={visiblePayouts} loading={loading} onStatus={updatePayoutStatus} />
          </>}
          {view === "settings" && <SettingsView session={session} darkMode={darkMode} setDarkMode={setDarkMode} onRefresh={loadAll} onSignOut={logout} />}
        </section>
      </div>
      <footer><span>Chérie Order Desk</span><span>Private staff workspace · Supabase authenticated</span></footer>

      {showGamepassModal && <Modal title="New gamepass order" subtitle="Add one or more gamepasses to this order." onClose={() => setShowGamepassModal(false)}>
        <form onSubmit={addGamepass} className="form-grid">
          <Field label="Buyer username"><input value={gamepassForm.buyer_username} onChange={e => setGamepassForm({ ...gamepassForm, buyer_username: e.target.value })} placeholder="@username" required /></Field>
          <Field label="Total Robux"><input inputMode="numeric" value={gamepassForm.robux_amount} onChange={e => setGamepassForm({ ...gamepassForm, robux_amount: e.target.value })} placeholder="10,000" required /></Field>
          <Field label="Process"><Dropdown value={gamepassForm.process_type} onChange={v => setGamepassForm({ ...gamepassForm, process_type: v as ProcessType })} options={[{ value: "fast", label: "Fast", hint: "Priority processing" }, { value: "slow", label: "Slow", hint: "Regular processing" }]} /></Field>
          <Field label="Status"><Dropdown value={gamepassForm.status} onChange={v => setGamepassForm({ ...gamepassForm, status: v as OrderStatus })} options={STATUSES.map(s => ({ value: s, label: statusLabel(s) }))} /></Field>
          <div className="field-span gamepass-lines">
            <div className="lines-heading"><div><span className="field-title">Gamepass links</span><small>Every link stays visible in the order table.</small></div><span className={`split-total ${gamepassLinks.reduce((s, x) => s + (Number(x.amount) || 0), 0) === Number(gamepassForm.robux_amount.replace(/,/g, "")) && Number(gamepassForm.robux_amount) > 0 ? "valid" : ""}`}>Split {money(gamepassLinks.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</span></div>
            <div className="line-list">{gamepassLinks.map((item, index) => <div className="gamepass-line" key={index}><div className="line-number">{index + 1}</div><input className="line-amount" inputMode="numeric" value={item.amount || ""} onChange={e => updateGamepassLine(index, "amount", e.target.value)} placeholder="5,000" aria-label={`Gamepass ${index + 1} amount`} required /><input className="line-link" type="url" value={item.link} onChange={e => updateGamepassLine(index, "link", e.target.value)} placeholder="https://www.roblox.com/game-pass/..." aria-label={`Gamepass ${index + 1} link`} required /><button type="button" className="line-remove" onClick={() => removeGamepassLine(index)} disabled={gamepassLinks.length === 1} title="Remove gamepass"><Minus size={15} /></button></div>)}</div>
            <button type="button" className="add-line-btn" onClick={addGamepassLine}><Plus size={14} /> Add another gamepass</button>
            <div className="split-hint"><Link2 size={13} /> Example: 10,000 total → 5,000 + 3,000 + 2,000</div>
          </div>
          <div className="field-span"><Field label="Notes"><textarea rows={3} value={gamepassForm.notes} onChange={e => setGamepassForm({ ...gamepassForm, notes: e.target.value })} placeholder="Optional note for staff" /></Field></div>
          <div className="form-actions field-span"><button type="button" className="secondary-btn" onClick={() => setShowGamepassModal(false)}>Cancel</button><button type="submit" className="primary-btn"><Check size={16} /> Create order</button></div>
        </form>
      </Modal>}
      {showPayoutModal && <Modal title="New Robux payout" subtitle="Record where the Robux should actually be sent." onClose={() => setShowPayoutModal(false)}>
        <form onSubmit={addPayout} className="form-grid">
          <Field label="Buyer username"><input value={payoutForm.buyer_username} onChange={e => setPayoutForm({ ...payoutForm, buyer_username: e.target.value })} placeholder="@buyer" required /></Field>
          <Field label="Roblox recipient username"><input value={payoutForm.roblox_username} onChange={e => setPayoutForm({ ...payoutForm, roblox_username: e.target.value })} placeholder="@recipient" required /></Field>
          <Field label="Amount of Robux"><input inputMode="numeric" value={payoutForm.robux_amount} onChange={e => setPayoutForm({ ...payoutForm, robux_amount: e.target.value })} placeholder="10,000" required /></Field>
          <Field label="From which group"><Dropdown value={payoutForm.source_group} onChange={v => setPayoutForm({ ...payoutForm, source_group: v as SourceGroup })} options={GROUPS.map(g => ({ value: g, label: g }))} /></Field>
          <Field label="Status"><Dropdown value={payoutForm.status} onChange={v => setPayoutForm({ ...payoutForm, status: v as PayoutStatus })} options={STATUSES.map(s => ({ value: s, label: statusLabel(s) }))} /></Field>
          <div className="field-span"><Field label="Notes"><textarea rows={3} value={payoutForm.notes} onChange={e => setPayoutForm({ ...payoutForm, notes: e.target.value })} placeholder="Optional note for staff" /></Field></div>
          <div className="form-actions field-span"><button type="button" className="secondary-btn" onClick={() => setShowPayoutModal(false)}>Cancel</button><button type="submit" className="primary-btn"><Check size={16} /> Create payout</button></div>
        </form>
      </Modal>}
    </main>
  );
}

function Login({ email, password, setEmail, setPassword, login, message }: { email: string; password: string; setEmail: (v: string) => void; setPassword: (v: string) => void; login: (e: FormEvent) => void; message: string }) {
  return <main className="login-page"><div className="login-card"><div className="login-brand"><Logo className="login-logo" /><div><strong>Chérie</strong><span>RBX Order Desk</span></div></div><p className="login-kicker">PRIVATE · STAFF ONLY</p><h1>Welcome back.</h1><p className="login-copy">A focused workspace for tracking gamepass orders, supplier processing, and Robux payouts.</p><form onSubmit={login} className="login-form"><Field label="Staff email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@cherie.local" autoComplete="email" required /></Field><Field label="Password"><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required /></Field>{message && <div className="error-box">{message}</div>}<button className="primary-btn full" type="submit">Sign in <ArrowUpRight size={15} /></button></form><div className="login-meta"><span><i /> Supabase authenticated</span><span>Authorized staff only</span></div></div></main>;
}

function Logo({ className }: { className: string }) { const [failed, setFailed] = useState(false); return failed ? <div className={`${className} logo-fallback`}>C</div> : <img className={className} src="/logo.png" alt="Chérie" onError={() => setFailed(true)} />; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }

function Dropdown({ value, onChange, options, className = "" }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; className?: string }) {
  const [open, setOpen] = useState(false); const [position, setPosition] = useState({ top: 0, left: 0, width: 160 }); const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find(option => option.value === value) ?? options[0];
  useEffect(() => { if (!open) return; const update = () => { const rect = triggerRef.current?.getBoundingClientRect(); if (!rect) return; const width = Math.max(rect.width, 180); const height = Math.min(310, options.length * 48 + 12); const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)); const top = window.innerHeight - rect.bottom < height && rect.top > height ? rect.top - height - 7 : rect.bottom + 7; setPosition({ top, left, width }); }; update(); window.addEventListener("resize", update); window.addEventListener("scroll", update, true); const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); window.addEventListener("keydown", esc); return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); window.removeEventListener("keydown", esc); }; }, [open, options.length]);
  useEffect(() => { if (!open) return; const down = (event: PointerEvent) => { const target = event.target as Node; const menu = document.getElementById("cherie-dropdown-menu"); if (!triggerRef.current?.contains(target) && !menu?.contains(target)) setOpen(false); }; document.addEventListener("pointerdown", down); return () => document.removeEventListener("pointerdown", down); }, [open]);
  return <div className={`dropdown-wrap ${className}`}><button ref={triggerRef} type="button" className={`dropdown-trigger ${open ? "open" : ""}`} onClick={() => setOpen(v => !v)} aria-haspopup="listbox" aria-expanded={open}><span>{selected?.label ?? value}</span><ChevronDown size={14} className={open ? "rotate" : ""} /></button>{open && typeof document !== "undefined" && createPortal(<div id="cherie-dropdown-menu" className="dropdown-menu" style={{ top: position.top, left: position.left, minWidth: position.width }} role="listbox">{options.map(option => <button key={option.value} type="button" className={`dropdown-option ${option.value === value ? "selected" : ""}`} onClick={() => { onChange(option.value); setOpen(false); }} role="option" aria-selected={option.value === value}><span className="dropdown-option-copy"><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>{option.value === value && <Check size={15} />}</button>)}</div>, document.body)}</div>;
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) { return <button className={`nav-btn ${active ? "active" : ""}`} onClick={onClick}>{icon}<span className="nav-content">{children}</span></button>; }
function Summary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`summary-card ${tone}`}><div className="summary-mark" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function Overview(props: { gamepasses: GamepassOrder[]; payouts: RobuxPayout[]; pendingGamepasses: number; processingGamepasses: number; pendingPayouts: number; processingPayouts: number; completedGamepasses: number; completedPayouts: number; onGamepasses: () => void; onPayouts: () => void }) {
  const activity = [...props.gamepasses.map(o => ({ id: `g-${o.id}`, type: "Gamepass", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at })), ...props.payouts.map(o => ({ id: `p-${o.id}`, type: "Payout", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at }))].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);
  return <><div className="hero-panel"><div><span className="eyebrow">WORKSPACE OVERVIEW</span><h2>Keep every order moving.</h2><p>See what is waiting, what has already been sent to the supplier, and what your staff has completed.</p></div><div className="hero-actions"><button className="secondary-btn" onClick={props.onGamepasses}><Gamepad2 size={16} /> Gamepass orders</button><button className="secondary-btn" onClick={props.onPayouts}><WalletCards size={16} /> Robux payouts</button></div></div><div className="overview-grid"><OverviewCard icon={<Gamepad2 size={18} />} label="Gamepass outstanding" value={money(props.pendingGamepasses + props.processingGamepasses)} detail={`${money(props.pendingGamepasses)} pending · ${money(props.processingGamepasses)} processing`} /><OverviewCard icon={<CircleDollarSign size={18} />} label="Robux payout outstanding" value={money(props.pendingPayouts + props.processingPayouts)} detail={`${money(props.pendingPayouts)} pending · ${money(props.processingPayouts)} processing`} /><OverviewCard icon={<Check size={18} />} label="Completed" value={money(props.completedGamepasses + props.completedPayouts)} detail={`${money(props.completedGamepasses)} gamepasses · ${money(props.completedPayouts)} payouts`} /><OverviewCard icon={<Users size={18} />} label="Total records" value={String(props.gamepasses.length + props.payouts.length)} detail={`${props.gamepasses.length} gamepasses · ${props.payouts.length} payouts`} /></div><div className="activity-card"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest records</h2></div></div>{activity.length === 0 ? <Empty title="No records yet" text="Your newest orders and payouts will appear here." /> : <div className="activity-list">{activity.map(item => <div className="activity-item" key={item.id}><div className="activity-dot" /><div className="activity-main"><strong>@{item.buyer}</strong><span>{item.type} · {dateTime(item.date)}</span></div><div className="activity-amount">{money(item.amount)}</div><StatusBadge status={item.status} /></div>)}</div>}</div></>;
}
function OverviewCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <div className="overview-card"><div className="card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, thirdLabel, thirdValue, thirdOptions, setThirdValue }: { search: string; setSearch: (value: string) => void; statusFilter: "all" | OrderStatus; setStatusFilter: (value: "all" | OrderStatus) => void; thirdLabel: string; thirdValue: string; thirdOptions: string[]; setThirdValue: (value: string) => void }) {
  const label = (value: string) => value === "all" ? "All" : value === "fast" ? "Fast" : value === "slow" ? "Slow" : value;
  return <div className="toolbar"><div className="search-box"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search buyer, recipient, amount, or link..." /><kbd>⌘ K</kbd></div><div className="toolbar-select"><Dropdown value={statusFilter} onChange={v => setStatusFilter(v as "all" | OrderStatus)} options={["all", ...STATUSES].map(v => ({ value: v, label: v === "all" ? "All statuses" : statusLabel(v) }))} /></div><div className="toolbar-select"><Dropdown value={thirdValue} onChange={setThirdValue} options={thirdOptions.map(v => ({ value: v, label: v === "all" ? `All ${thirdLabel.toLowerCase()}s` : label(v) }))} /></div></div>;
}

function GamepassTable({ orders, loading, onStatus }: { orders: GamepassOrder[]; loading: boolean; onStatus: (id: string, status: OrderStatus) => void }) {
  return <><div className="table-card desktop-table"><div className="table-wrap"><table><thead><tr><th>Buyer</th><th>Robux</th><th>Process</th><th>Gamepass links</th><th>Status</th><th>Added</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="table-empty">Loading records...</div></td></tr> : orders.length === 0 ? <tr><td colSpan={6}><Empty title="No gamepass orders" text="Try changing your filters or add a new order." /></td></tr> : orders.map(o => <tr key={o.id}><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className={`process-chip ${o.process_type}`}>{o.process_type}</span></td><td><GamepassLinks order={o} /></td><td><StatusSelect status={o.status} onChange={v => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td></tr>)}</tbody></table></div></div><div className="mobile-record-list">{loading ? <div className="mobile-empty">Loading records...</div> : orders.length === 0 ? <Empty title="No gamepass orders" text="Try changing your filters or add a new order." /> : orders.map(o => <GamepassMobileCard key={o.id} order={o} onStatus={onStatus} />)}</div></>;
}
function GamepassLinks({ order }: { order: GamepassOrder }) {
  const links = parseGamepassLinks(order);
  return <div className="links-list">{links.map((item, index) => <a key={`${item.link}-${index}`} className="link-row" href={item.link} target="_blank" rel="noreferrer"><span className="link-index">{index + 1}</span><span className="link-copy"><strong>{money(item.amount)}</strong><span>{item.link}</span></span><ExternalLink size={14} /></a>)}</div>;
}
function GamepassMobileCard({ order, onStatus }: { order: GamepassOrder; onStatus: (id: string, status: OrderStatus) => void }) { return <article className="record-card"><div className="record-card-head"><div><strong>@{order.buyer_username}</strong><span>{dateTime(order.created_at)}</span></div><StatusSelect status={order.status} onChange={v => onStatus(order.id, v)} /></div><div className="record-meta"><span><b>{money(order.robux_amount)}</b> total</span><span className={`process-chip ${order.process_type}`}>{order.process_type}</span></div><GamepassLinks order={order} />{order.notes && <p className="record-note">{order.notes}</p>}</article>; }

function PayoutTable({ payouts, loading, onStatus }: { payouts: RobuxPayout[]; loading: boolean; onStatus: (id: string, status: PayoutStatus) => void }) {
  return <><div className="table-card desktop-table"><div className="table-wrap"><table><thead><tr><th>Buyer</th><th>Send to</th><th>Robux</th><th>From group</th><th>Status</th><th>Added</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="table-empty">Loading records...</div></td></tr> : payouts.length === 0 ? <tr><td colSpan={6}><Empty title="No Robux payouts" text="Try changing your filters or add a new payout." /></td></tr> : payouts.map(o => <tr key={o.id}><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="recipient">@{o.roblox_username}</strong><small className="recipient-label">Roblox recipient</small></td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className="group-chip">{o.source_group}</span></td><td><StatusSelect status={o.status} onChange={v => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td></tr>)}</tbody></table></div></div><div className="mobile-record-list">{loading ? <div className="mobile-empty">Loading records...</div> : payouts.length === 0 ? <Empty title="No Robux payouts" text="Try changing your filters or add a new payout." /> : payouts.map(o => <PayoutMobileCard key={o.id} payout={o} onStatus={onStatus} />)}</div></>;
}
function PayoutMobileCard({ payout, onStatus }: { payout: RobuxPayout; onStatus: (id: string, status: PayoutStatus) => void }) { return <article className="record-card"><div className="record-card-head"><div><strong>@{payout.buyer_username}</strong><span>{dateTime(payout.created_at)}</span></div><StatusSelect status={payout.status} onChange={v => onStatus(payout.id, v)} /></div><div className="recipient-card"><span>Send Robux to</span><strong>@{payout.roblox_username}</strong></div><div className="record-meta"><span><b>{money(payout.robux_amount)}</b></span><span className="group-chip">{payout.source_group}</span></div>{payout.notes && <p className="record-note">{payout.notes}</p>}</article>; }

function StatusSelect({ status, onChange }: { status: OrderStatus; onChange: (status: OrderStatus) => void }) { return <div className={`status-select ${status}`}><Dropdown value={status} onChange={v => onChange(v as OrderStatus)} options={STATUSES.map(s => ({ value: s, label: statusLabel(s) }))} /></div>; }
function StatusBadge({ status }: { status: OrderStatus }) { return <span className={`status-badge ${status}`}>{statusLabel(status)}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div className="empty-icon"><Search size={16} /></div><strong>{title}</strong><span>{text}</span></div>; }

function SettingsView({ session, darkMode, setDarkMode, onRefresh, onSignOut }: { session: Session; darkMode: boolean; setDarkMode: (v: boolean) => void; onRefresh: () => void; onSignOut: () => void }) {
  return <div className="settings-page"><div className="settings-intro"><div><span className="eyebrow">PREFERENCES</span><h2>Settings</h2><p>Control how this workspace looks and manage your staff session.</p></div></div><div className="settings-grid"><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Sun size={17} /></div><div><strong>Appearance</strong><span>Choose your workspace theme.</span></div></div><div className="theme-options"><button className={`theme-option ${!darkMode ? "selected" : ""}`} onClick={() => setDarkMode(false)}><Sun size={17} /><span><b>Light</b><small>Clean white workspace</small></span>{!darkMode && <Check size={16} />}</button><button className={`theme-option ${darkMode ? "selected" : ""}`} onClick={() => setDarkMode(true)}><Moon size={17} /><span><b>Dark</b><small>Low-light workspace</small></span>{darkMode && <Check size={16} />}</button></div></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Users size={17} /></div><div><strong>Staff account</strong><span>Your authenticated workspace identity.</span></div></div><div className="account-detail"><span className="account-avatar large">{(session.user.email?.[0] ?? "C").toUpperCase()}</span><div><strong>{session.user.email}</strong><small>Authenticated staff member</small></div></div></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><RefreshCw size={17} /></div><div><strong>Workspace actions</strong><span>Useful controls for shared records.</span></div></div><button className="settings-action" onClick={onRefresh}><span><RefreshCw size={16} /><b>Refresh records</b></span><ArrowUpRight size={15} /></button><button className="settings-action danger" onClick={onSignOut}><span><LogOut size={16} /><b>Sign out</b></span><ArrowUpRight size={15} /></button></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Settings size={17} /></div><div><strong>Workspace</strong><span>Current application information.</span></div></div><div className="info-list"><div><span>Workspace</span><b>Chérie RBX Order Desk</b></div><div><span>Access</span><b>Private staff workspace</b></div><div><span>Data</span><b>Shared through Supabase</b></div></div></section></div></div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-head"><div><span className="eyebrow">CREATE RECORD</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>{children}</div></div>;
}
