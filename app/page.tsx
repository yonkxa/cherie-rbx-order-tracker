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
  Minus,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderStatus = "pending" | "processing" | "completed" | "refunded";
type ProcessType = "fast" | "slow";
type PayoutStatus = OrderStatus;
type SourceGroup =
  | "A (supp)"
  | "A (d'isle)"
  | "B (supp)"
  | "C (supp)"
  | "D (supp)"
  | "E (supp)";
type View = "overview" | "gamepasses" | "payouts";

type GamepassLink = { amount: number; link: string };

type GamepassOrder = {
  id: string;
  robux_amount: number;
  process_type: ProcessType;
  gamepass_link: string;
  gamepass_links: GamepassLink[] | null;
  buyer_username: string;
  status: OrderStatus;
  notes: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RobuxPayout = {
  id: string;
  buyer_username: string;
  roblox_username: string;
  robux_amount: number;
  source_group: SourceGroup;
  status: PayoutStatus;
  notes: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DropdownOption = { value: string; label: string; hint?: string };

const GROUPS: SourceGroup[] = [
  "A (supp)",
  "A (d'isle)",
  "B (supp)",
  "C (supp)",
  "D (supp)",
  "E (supp)",
];
const STATUSES: OrderStatus[] = ["pending", "processing", "completed", "refunded"];
const money = (n: number) => `${n.toLocaleString()} R$`;
const dateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );

function statusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function cleanUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

function parseGamepassLinks(order: GamepassOrder): GamepassLink[] {
  if (Array.isArray(order.gamepass_links) && order.gamepass_links.length > 0) {
    return order.gamepass_links;
  }
  return order.gamepass_link
    ? [{ amount: order.robux_amount, link: order.gamepass_link }]
    : [];
}

function friendlyAuthError(message: string) {
  if (message.toLowerCase().includes("email not confirmed")) {
    return "This staff email is not confirmed in Supabase.";
  }
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [gamepassForm, setGamepassForm] = useState({
    buyer_username: "",
    robux_amount: "",
    process_type: "slow" as ProcessType,
    status: "pending" as OrderStatus,
    notes: "",
  });
  const [gamepassLinks, setGamepassLinks] = useState<GamepassLink[]>([{ amount: 0, link: "" }]);

  const [payoutForm, setPayoutForm] = useState({
    buyer_username: "",
    roblox_username: "",
    robux_amount: "",
    source_group: "A (supp)" as SourceGroup,
    status: "pending" as PayoutStatus,
    notes: "",
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("cherie-theme");
    setDarkMode(saved === "dark");

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadAll();
      else setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadAll();
      else {
        setGamepasses([]);
        setPayouts([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    window.localStorage.setItem("cherie-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  async function loadAll() {
    setLoading(true);
    const [ordersResult, payoutsResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("robux_payouts").select("*").order("created_at", { ascending: false }),
    ]);

    if (ordersResult.error) setMessage(ordersResult.error.message);
    else setGamepasses((ordersResult.data ?? []) as GamepassOrder[]);

    if (payoutsResult.error) setMessage(payoutsResult.error.message);
    else setPayouts((payoutsResult.data ?? []) as RobuxPayout[]);

    setLoading(false);
  }

  async function login(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage(friendlyAuthError(error.message));
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  function resetGamepassForm() {
    setGamepassForm({ buyer_username: "", robux_amount: "", process_type: "slow", status: "pending", notes: "" });
    setGamepassLinks([{ amount: 0, link: "" }]);
  }

  function addGamepassLine() {
    setGamepassLinks((items) => [...items, { amount: 0, link: "" }]);
  }

  function removeGamepassLine(index: number) {
    setGamepassLinks((items) => (items.length === 1 ? items : items.filter((_, i) => i !== index)));
  }

  function updateGamepassLine(index: number, key: keyof GamepassLink, value: string) {
    setGamepassLinks((items) =>
      items.map((item, i) =>
        i === index ? { ...item, [key]: key === "amount" ? Number(value.replace(/,/g, "")) || 0 : value } : item,
      ),
    );
  }

  async function addGamepass(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const amount = Number(gamepassForm.robux_amount.replace(/,/g, ""));
    const links = gamepassLinks.map((item) => ({ amount: Number(item.amount) || 0, link: item.link.trim() }));
    const splitTotal = links.reduce((sum, item) => sum + item.amount, 0);

    if (!amount || amount <= 0) return setMessage("Enter a valid total Robux amount.");
    if (!gamepassForm.buyer_username.trim()) return setMessage("Add the buyer username.");
    if (!gamepassForm.process_type) return setMessage("Choose a process type.");
    if (!gamepassForm.status) return setMessage("Choose a status.");
    if (links.some((item) => !item.amount || item.amount <= 0)) return setMessage("Each gamepass needs a valid Robux amount.");
    if (links.some((item) => !item.link)) return setMessage("Add a link for every gamepass.");
    if (links.some((item) => !/^https?:\/\//i.test(item.link))) return setMessage("Each gamepass link must start with http:// or https://.");
    if (splitTotal !== amount) return setMessage(`The gamepass split totals ${money(splitTotal)}, but the order is ${money(amount)}.`);
    if (!gamepassForm.status) return setMessage("Choose a status.");

    const { error } = await supabase.from("orders").insert({
      robux_amount: amount,
      process_type: gamepassForm.process_type,
      gamepass_link: links[0].link,
      gamepass_links: links,
      buyer_username: cleanUsername(gamepassForm.buyer_username),
      status: gamepassForm.status,
      notes: gamepassForm.notes.trim() || null,
      created_by: session?.user.id,
    });

    if (error) return setMessage(error.message);
    resetGamepassForm();
    setShowGamepassModal(false);
    await loadAll();
  }

  async function addPayout(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    const amount = Number(payoutForm.robux_amount.replace(/,/g, ""));
    if (!amount || amount <= 0) return setMessage("Enter a valid Robux amount.");
    if (!payoutForm.buyer_username.trim()) return setMessage("Add the buyer username.");
    if (!payoutForm.roblox_username.trim()) return setMessage("Add the Roblox recipient username.");

    const { error } = await supabase.from("robux_payouts").insert({
      buyer_username: cleanUsername(payoutForm.buyer_username),
      roblox_username: cleanUsername(payoutForm.roblox_username),
      robux_amount: amount,
      source_group: payoutForm.source_group,
      status: payoutForm.status,
      notes: payoutForm.notes.trim() || null,
      created_by: session?.user.id,
    });

    if (error) return setMessage(error.message);
    setPayoutForm({ buyer_username: "", roblox_username: "", robux_amount: "", source_group: "A (supp)", status: "pending", notes: "" });
    setShowPayoutModal(false);
    await loadAll();
  }

  async function updateGamepassStatus(id: string, status: OrderStatus) {
    const { error } = await supabase
      .from("orders")
      .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) setMessage(error.message);
    else await loadAll();
  }

  async function updatePayoutStatus(id: string, status: PayoutStatus) {
    const { error } = await supabase
      .from("robux_payouts")
      .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) setMessage(error.message);
    else await loadAll();
  }

  const pendingGamepasses = gamepasses.filter((o) => o.status === "pending").reduce((s, o) => s + o.robux_amount, 0);
  const processingGamepasses = gamepasses.filter((o) => o.status === "processing").reduce((s, o) => s + o.robux_amount, 0);
  const pendingPayouts = payouts.filter((o) => o.status === "pending").reduce((s, o) => s + o.robux_amount, 0);
  const processingPayouts = payouts.filter((o) => o.status === "processing").reduce((s, o) => s + o.robux_amount, 0);
  const completedGamepasses = gamepasses.filter((o) => o.status === "completed").reduce((s, o) => s + o.robux_amount, 0);
  const completedPayouts = payouts.filter((o) => o.status === "completed").reduce((s, o) => s + o.robux_amount, 0);

  const visibleGamepasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return gamepasses.filter((o) => {
      const links = parseGamepassLinks(o);
      const matchesSearch = !q || [
        o.buyer_username,
        o.gamepass_link,
        o.notes ?? "",
        String(o.robux_amount),
        ...links.map((item) => `${item.amount} ${item.link}`),
      ].some((v) => v.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesProcess = processFilter === "all" || o.process_type === processFilter;
      return matchesSearch && matchesStatus && matchesProcess;
    });
  }, [gamepasses, search, statusFilter, processFilter]);

  const visiblePayouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payouts.filter((o) => {
      const matchesSearch = !q || [o.buyer_username, o.roblox_username, o.source_group, o.notes ?? "", String(o.robux_amount)].some((v) => v.toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesGroup = groupFilter === "all" || o.source_group === groupFilter;
      return matchesSearch && matchesStatus && matchesGroup;
    });
  }, [payouts, search, statusFilter, groupFilter]);

  if (!session) {
    return (
      <main className="login-page">
        <div className="login-card">
          <Logo className="login-logo" />
          <p className="login-kicker">CHÉRIE · INTERNAL</p>
          <h1>Order desk</h1>
          <p className="login-copy">A private workspace for managing gamepass orders and Robux payouts.</p>
          <form onSubmit={login} className="login-form">
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="staff email" required /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></Field>
            {message && <div className="error-box">{message}</div>}
            <button className="primary-btn full" type="submit">Sign in</button>
          </form>
          <p className="login-foot">Private access · Supabase authenticated</p>
        </div>
      </main>
    );
  }

  const activeTitle = view === "overview" ? "Overview" : view === "gamepasses" ? "Gamepass orders" : "Robux payouts";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Logo className="brand-logo" />
          <div className="brand-copy"><strong>Chérie</strong><span>Order desk</span></div>
          <div className="top-divider" />
          <span className="workspace-name">Private workspace</span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDarkMode((v) => !v)} title="Toggle theme">{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
          <button className="icon-btn" onClick={loadAll} title="Refresh"><RefreshCw size={17} /></button>
          <div className="account-menu"><span>{session.user.email}</span><ChevronDown size={14} /></div>
          <button className="icon-btn" onClick={logout} title="Sign out"><LogOut size={17} /></button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-section-label">Workspace</div>
          <NavButton active={view === "overview"} icon={<ArrowUpRight size={16} />} onClick={() => setView("overview")}>Overview</NavButton>
          <NavButton active={view === "gamepasses"} icon={<Gamepad2 size={16} />} onClick={() => setView("gamepasses")}><span className="nav-label">Gamepass orders</span><span className="nav-count">{gamepasses.length}</span></NavButton>
          <NavButton active={view === "payouts"} icon={<WalletCards size={16} />} onClick={() => setView("payouts")}><span className="nav-label">Robux payouts</span><span className="nav-count">{payouts.length}</span></NavButton>

          <div className="sidebar-divider" />
          <div className="sidebar-section-label">Quick add</div>
          <button className="sidebar-add" onClick={() => { resetGamepassForm(); setShowGamepassModal(true); }}><Plus size={15} /> Gamepass order</button>
          <button className="sidebar-add" onClick={() => setShowPayoutModal(true)}><Plus size={15} /> Robux payout</button>
        </aside>

        <section className="content">
          <div className="page-heading">
            <div><p className="breadcrumb">Chérie / {activeTitle}</p><h1>{activeTitle}</h1></div>
            {view !== "overview" && (
              <button className="primary-btn" onClick={() => view === "gamepasses" ? (resetGamepassForm(), setShowGamepassModal(true)) : setShowPayoutModal(true)}><Plus size={16} /> New {view === "gamepasses" ? "gamepass" : "payout"}</button>
            )}
          </div>

          {message && <div className="notice">{message}<button onClick={() => setMessage("")}><X size={15} /></button></div>}

          {view === "overview" ? (
            <Overview gamepasses={gamepasses} payouts={payouts} pendingGamepasses={pendingGamepasses} processingGamepasses={processingGamepasses} pendingPayouts={pendingPayouts} processingPayouts={processingPayouts} completedGamepasses={completedGamepasses} completedPayouts={completedPayouts} onGamepasses={() => setView("gamepasses")} onPayouts={() => setView("payouts")} />
          ) : view === "gamepasses" ? (
            <>
              <div className="summary-row">
                <Summary label="Pending" value={money(pendingGamepasses)} detail="Not yet sent to supp" />
                <Summary label="Processing" value={money(processingGamepasses)} detail="Already sent to supp" />
                <Summary label="Completed" value={money(completedGamepasses)} detail="Gamepass already bought" />
                <Summary label="Orders" value={String(gamepasses.length)} detail="All gamepass records" />
              </div>
              <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Process" thirdValue={processFilter} thirdOptions={["all", "fast", "slow"]} setThirdValue={(v) => setProcessFilter(v as "all" | ProcessType)} />
              <GamepassTable orders={visibleGamepasses} loading={loading} onStatus={updateGamepassStatus} />
            </>
          ) : (
            <>
              <div className="summary-row">
                <Summary label="Pending" value={money(pendingPayouts)} detail="Not yet sent to supp" />
                <Summary label="Processing" value={money(processingPayouts)} detail="Already sent" />
                <Summary label="Completed" value={money(completedPayouts)} detail="Robux sent" />
                <Summary label="Payouts" value={String(payouts.length)} detail="All payout records" />
              </div>
              <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Group" thirdValue={groupFilter} thirdOptions={["all", ...GROUPS]} setThirdValue={(v) => setGroupFilter(v as "all" | SourceGroup)} />
              <PayoutTable payouts={visiblePayouts} loading={loading} onStatus={updatePayoutStatus} />
            </>
          )}
        </section>
      </div>

      <footer>Chérie Order Desk · shared workspace for authorized staff</footer>

      {showGamepassModal && <Modal title="New gamepass order" onClose={() => setShowGamepassModal(false)}>
        <form onSubmit={addGamepass} className="form-grid">
          <Field label="Buyer username"><input value={gamepassForm.buyer_username} onChange={(e) => setGamepassForm({ ...gamepassForm, buyer_username: e.target.value })} placeholder="buyer username" required /></Field>
          <Field label="Total Robux"><input inputMode="numeric" value={gamepassForm.robux_amount} onChange={(e) => setGamepassForm({ ...gamepassForm, robux_amount: e.target.value })} placeholder="10,000" required /></Field>
          <Field label="Process"><Dropdown value={gamepassForm.process_type} onChange={(v) => setGamepassForm({ ...gamepassForm, process_type: v as ProcessType })} options={[{ value: "fast", label: "Fast" }, { value: "slow", label: "Slow" }]} /></Field>
          <Field label="Status"><Dropdown value={gamepassForm.status} onChange={(v) => setGamepassForm({ ...gamepassForm, status: v as OrderStatus })} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} /></Field>

          <div className="field-span gamepass-lines">
            <div className="lines-heading"><div><span className="field-title">Gamepass links</span><small>One order can contain multiple gamepasses.</small></div><span className="split-total">Split: {money(gamepassLinks.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</span></div>
            <div className="line-list">
              {gamepassLinks.map((item, index) => (
                <div className="gamepass-line" key={index}>
                  <div className="line-number">{index + 1}</div>
                  <input className="line-amount" inputMode="numeric" value={item.amount || ""} onChange={(e) => updateGamepassLine(index, "amount", e.target.value)} placeholder="5,000" aria-label={`Gamepass ${index + 1} amount`} required />
                  <input className="line-link" type="url" value={item.link} onChange={(e) => updateGamepassLine(index, "link", e.target.value)} placeholder="https://www.roblox.com/game-pass/..." aria-label={`Gamepass ${index + 1} link`} required />
                  <button type="button" className="line-remove" onClick={() => removeGamepassLine(index)} disabled={gamepassLinks.length === 1} title="Remove gamepass"><Minus size={15} /></button>
                </div>
              ))}
            </div>
            <button type="button" className="add-line-btn" onClick={addGamepassLine}><Plus size={14} /> Add another gamepass</button>
            <div className="split-hint"><Link2 size={13} /> Example: 10,000 total → 5,000 + 3,000 + 2,000</div>
          </div>

          <div className="field-span"><Field label="Notes"><textarea rows={3} value={gamepassForm.notes} onChange={(e) => setGamepassForm({ ...gamepassForm, notes: e.target.value })} placeholder="Optional note" /></Field></div>
          <div className="form-actions field-span"><button type="button" className="secondary-btn" onClick={() => setShowGamepassModal(false)}>Cancel</button><button type="submit" className="primary-btn"><Check size={16} /> Add order</button></div>
        </form>
      </Modal>}

      {showPayoutModal && <Modal title="New Robux payout" onClose={() => setShowPayoutModal(false)}>
        <form onSubmit={addPayout} className="form-grid">
          <Field label="Buyer username"><input value={payoutForm.buyer_username} onChange={(e) => setPayoutForm({ ...payoutForm, buyer_username: e.target.value })} placeholder="buyer username" required /></Field>
          <Field label="Roblox recipient username"><input value={payoutForm.roblox_username} onChange={(e) => setPayoutForm({ ...payoutForm, roblox_username: e.target.value })} placeholder="username receiving the Robux" required /></Field>
          <Field label="Amount of Robux"><input inputMode="numeric" value={payoutForm.robux_amount} onChange={(e) => setPayoutForm({ ...payoutForm, robux_amount: e.target.value })} placeholder="10,000" required /></Field>
          <Field label="From which group"><Dropdown value={payoutForm.source_group} onChange={(v) => setPayoutForm({ ...payoutForm, source_group: v as SourceGroup })} options={GROUPS.map((g) => ({ value: g, label: g }))} /></Field>
          <Field label="Status"><Dropdown value={payoutForm.status} onChange={(v) => setPayoutForm({ ...payoutForm, status: v as PayoutStatus })} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} /></Field>
          <div className="field-span"><Field label="Notes"><textarea rows={3} value={payoutForm.notes} onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })} placeholder="Optional note" /></Field></div>
          <div className="form-actions field-span"><button type="button" className="secondary-btn" onClick={() => setShowPayoutModal(false)}>Cancel</button><button type="submit" className="primary-btn"><Check size={16} /> Add payout</button></div>
        </form>
      </Modal>}
    </main>
  );
}

function Logo({ className }: { className: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className={`${className} logo-fallback`}>C</div> : <img className={className} src="/logo.png" alt="Chérie" onError={() => setFailed(true)} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Dropdown({ value, onChange, options, className = "" }: { value: string; onChange: (value: string) => void; options: DropdownOption[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 160 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = Math.max(rect.width, 160);
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 10);
      const spaceBelow = window.innerHeight - rect.bottom;
      const menuHeight = Math.min(260, options.length * 44 + 10);
      const top = spaceBelow < menuHeight && rect.top > menuHeight ? rect.top - menuHeight - 5 : rect.bottom + 5;
      setPosition({ top, left: Math.max(10, left), width: menuWidth });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const menu = document.getElementById("cherie-dropdown-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return <div className={`dropdown-wrap ${className}`}>
    <button ref={triggerRef} type="button" className={`dropdown-trigger ${open ? "open" : ""}`} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
      <span>{selected?.label ?? value}</span><ChevronDown size={14} className={open ? "rotate" : ""} />
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div id="cherie-dropdown-menu" className="dropdown-menu" style={{ top: position.top, left: position.left, minWidth: position.width }} role="listbox">
        {options.map((option) => (
          <button key={option.value} type="button" className={`dropdown-option ${option.value === value ? "selected" : ""}`} onClick={() => { onChange(option.value); setOpen(false); }} role="option" aria-selected={option.value === value}>
            <span className="dropdown-option-copy"><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
            {option.value === value && <Check size={15} />}
          </button>
        ))}
      </div>,
      document.body,
    )}
  </div>;
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return <button className={`nav-btn ${active ? "active" : ""}`} onClick={onClick}>{icon}<span className="nav-content">{children}</span></button>;
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="summary-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Overview(props: {
  gamepasses: GamepassOrder[];
  payouts: RobuxPayout[];
  pendingGamepasses: number;
  processingGamepasses: number;
  pendingPayouts: number;
  processingPayouts: number;
  completedGamepasses: number;
  completedPayouts: number;
  onGamepasses: () => void;
  onPayouts: () => void;
}) {
  const activity = [
    ...props.gamepasses.map((o) => ({ id: `g-${o.id}`, type: "Gamepass", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at })),
    ...props.payouts.map((o) => ({ id: `p-${o.id}`, type: "Payout", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at })),
  ].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);

  return <>
    <div className="welcome-row"><div><p className="muted-label">Workspace summary</p><h2>Everything in one place.</h2><p>Track what still needs to move, what is already with the supplier, and what has been completed.</p></div><div className="quick-actions"><button className="secondary-btn" onClick={props.onGamepasses}><Gamepad2 size={16} /> Gamepasses</button><button className="secondary-btn" onClick={props.onPayouts}><WalletCards size={16} /> Payouts</button></div></div>
    <div className="overview-grid">
      <div className="overview-card"><div className="card-icon"><Gamepad2 size={17} /></div><div><span>Gamepass outstanding</span><strong>{money(props.pendingGamepasses + props.processingGamepasses)}</strong><small>{money(props.pendingGamepasses)} pending · {money(props.processingGamepasses)} processing</small></div></div>
      <div className="overview-card"><div className="card-icon"><CircleDollarSign size={17} /></div><div><span>Robux payout outstanding</span><strong>{money(props.pendingPayouts + props.processingPayouts)}</strong><small>{money(props.pendingPayouts)} pending · {money(props.processingPayouts)} processing</small></div></div>
      <div className="overview-card"><div className="card-icon"><Check size={17} /></div><div><span>Completed</span><strong>{money(props.completedGamepasses + props.completedPayouts)}</strong><small>{money(props.completedGamepasses)} gamepasses · {money(props.completedPayouts)} payouts</small></div></div>
      <div className="overview-card"><div className="card-icon"><Users size={17} /></div><div><span>Total records</span><strong>{props.gamepasses.length + props.payouts.length}</strong><small>{props.gamepasses.length} gamepasses · {props.payouts.length} payouts</small></div></div>
    </div>
    <div className="activity-card"><div className="section-title"><div><span className="muted-label">Recent activity</span><h2>Latest records</h2></div></div>{activity.length === 0 ? <Empty icon="○" title="No records yet" text="Your newest gamepass orders and payouts will appear here." /> : <div className="activity-list">{activity.map((item) => <div className="activity-item" key={item.id}><div className="activity-dot" /><div className="activity-main"><strong>@{item.buyer}</strong><span>{item.type} · {dateTime(item.date)}</span></div><div className="activity-amount">{money(item.amount)}</div><StatusBadge status={item.status} /></div>)}</div>}</div>
  </>;
}

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, thirdLabel, thirdValue, thirdOptions, setThirdValue }: {
  search: string; setSearch: (value: string) => void; statusFilter: "all" | OrderStatus; setStatusFilter: (value: "all" | OrderStatus) => void;
  thirdLabel: string; thirdValue: string; thirdOptions: string[]; setThirdValue: (value: string) => void;
}) {
  const label = (value: string) => value === "all" ? "All" : value === "fast" ? "Fast" : value === "slow" ? "Slow" : value;
  return <div className="toolbar"><div className="search-box"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyer, Roblox username, amount, link..." /></div><div className="toolbar-select"><Dropdown value={statusFilter} onChange={(v) => setStatusFilter(v as "all" | OrderStatus)} options={["all", ...STATUSES].map((v) => ({ value: v, label: v === "all" ? "All statuses" : statusLabel(v) }))} /></div><div className="toolbar-select"><span className="sr-only">{thirdLabel}</span><Dropdown value={thirdValue} onChange={setThirdValue} options={thirdOptions.map((v) => ({ value: v, label: v === "all" ? `All ${thirdLabel.toLowerCase()}s` : label(v) }))} /></div></div>;
}

function GamepassTable({ orders, loading, onStatus }: { orders: GamepassOrder[]; loading: boolean; onStatus: (id: string, status: OrderStatus) => void }) {
  return <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Buyer</th><th>Robux</th><th>Process</th><th>Gamepasses</th><th>Status</th><th>Added</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="table-empty">Loading...</div></td></tr> : orders.length === 0 ? <tr><td colSpan={6}><Empty icon="⌕" title="No gamepass orders" text="Try changing your filters or add a new order." /></td></tr> : orders.map((o) => <tr key={o.id}><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className={`process-chip ${o.process_type}`}>{o.process_type}</span></td><td><GamepassLinksCell order={o} /></td><td><StatusSelect status={o.status} onChange={(v) => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td></tr>)}</tbody></table></div></div>;
}

function GamepassLinksCell({ order }: { order: GamepassOrder }) {
  const links = parseGamepassLinks(order);
  const [open, setOpen] = useState(false);
  if (links.length === 1) {
    return <a className="link-cell" href={links[0].link} target="_blank" rel="noreferrer">Open gamepass <ExternalLink size={13} /></a>;
  }
  return <div className="links-popover-wrap"><button type="button" className="links-summary" onClick={() => setOpen((v) => !v)}><Link2 size={14} /> {links.length} gamepasses <ChevronDown size={13} className={open ? "rotate" : ""} /></button>{open && <><div className="popover-shield" onClick={() => setOpen(false)} /><div className="links-popover"><div className="popover-title">Gamepass split · {money(order.robux_amount)}</div>{links.map((item, index) => <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer" className="popover-link"><span><strong>#{index + 1} · {money(item.amount)}</strong><small>{item.link}</small></span><ExternalLink size={13} /></a>)}</div></>}</div>;
}

function PayoutTable({ payouts, loading, onStatus }: { payouts: RobuxPayout[]; loading: boolean; onStatus: (id: string, status: PayoutStatus) => void }) {
  return <div className="table-card"><div className="table-wrap"><table><thead><tr><th>Buyer</th><th>Send to</th><th>Robux</th><th>From group</th><th>Status</th><th>Added</th></tr></thead><tbody>{loading ? <tr><td colSpan={6}><div className="table-empty">Loading...</div></td></tr> : payouts.length === 0 ? <tr><td colSpan={6}><Empty icon="⌕" title="No Robux payouts" text="Try changing your filters or add a new payout." /></td></tr> : payouts.map((o) => <tr key={o.id}><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="recipient">@{o.roblox_username}</strong><small className="recipient-label">Roblox recipient</small></td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className="group-chip">{o.source_group}</span></td><td><StatusSelect status={o.status} onChange={(v) => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td></tr>)}</tbody></table></div></div>;
}

function StatusSelect({ status, onChange }: { status: OrderStatus; onChange: (status: OrderStatus) => void }) {
  return <div className={`status-select ${status}`}><Dropdown value={status} onChange={(v) => onChange(v as OrderStatus)} options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} /></div>;
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge ${status}`}>{statusLabel(status)}</span>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><strong>{title}</strong><span>{text}</span></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-head"><div><span className="muted-label">Create record</span><h2>{title}</h2></div><button className="icon-btn" type="button" onClick={onClose}><X size={17} /></button></div>{children}</div></div>;
}
