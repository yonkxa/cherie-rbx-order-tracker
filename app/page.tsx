"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Session } from "@supabase/supabase-js";
import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  CalendarDays,
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
  ShieldCheck,
  Sun,
  Users,
  WalletCards,
  X,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderStatus = "pending" | "processing" | "completed" | "refunded";
type ProcessType = "fast" | "slow";
type PayoutStatus = OrderStatus;
type SourceGroup = "A (supp)" | "A (d'isle)" | "B (supp)" | "C (supp)" | "D (supp)" | "E (supp)";
type View = "overview" | "gamepasses" | "payouts" | "archive" | "settings";
type GamepassLink = { amount: number; link: string };

type ArchiveRecord = { id: string; source_id: string; record_type: "gamepass" | "payout"; archived_period_start: string; archived_at: string; data: GamepassOrder | RobuxPayout; created_by_email: string | null; updated_by_email: string | null; };
type StaffRole = "owner" | "admin";
const OWNER_EMAIL = "espantaleonnika6@gmail.com";
const ADMIN_EMAIL = "nicslibunao@gmail.com";
const STAFF: Record<string, StaffRole> = { [OWNER_EMAIL]: "owner", [ADMIN_EMAIL]: "admin" };
function staffLabel(email: string | null | undefined) {
  if (!email) return "System";
  const role = STAFF[email.toLowerCase()];
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "System";
}

type GamepassOrder = {
  id: string; robux_amount: number; process_type: ProcessType; gamepass_link: string;
  gamepass_links: GamepassLink[] | null; buyer_username: string; status: OrderStatus;
  notes: string | null; created_by: string | null; created_by_email: string | null; updated_by: string | null; updated_by_email: string | null; completed_at: string | null; created_at: string; updated_at: string;
};

type RobuxPayout = {
  id: string; buyer_username: string; roblox_username: string; robux_amount: number; source_group: SourceGroup;
  status: PayoutStatus; notes: string | null; created_by: string | null; created_by_email: string | null; updated_by: string | null; updated_by_email: string | null; completed_at: string | null; created_at: string; updated_at: string;
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
  const [archives, setArchives] = useState<ArchiveRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [processFilter, setProcessFilter] = useState<"all" | ProcessType>("all");
  const [groupFilter, setGroupFilter] = useState<"all" | SourceGroup>("all");
  const [archivePeriod, setArchivePeriod] = useState<"month" | "week" | "year" | "all">("month");
  const [archiveDate, setArchiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showGamepassModal, setShowGamepassModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedGamepasses, setSelectedGamepasses] = useState<Set<string>>(new Set());
  const [selectedPayouts, setSelectedPayouts] = useState<Set<string>>(new Set());
  const [selectedArchives, setSelectedArchives] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ title: string; message: string; confirmLabel: string; danger: boolean; action: () => Promise<void> } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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
    document.body.classList.toggle("modal-open", showGamepassModal || showPayoutModal || !!confirmDialog);
    return () => document.body.classList.remove("modal-open");
  }, [showGamepassModal, showPayoutModal, confirmDialog]);

  async function loadAll() {
    setLoading(true);
    const [ordersResult, payoutsResult, archiveResult] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("robux_payouts").select("*").order("created_at", { ascending: false }),
      supabase.from("archive_records").select("*").order("archived_period_start", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (ordersResult.error) setMessage(ordersResult.error.message); else setGamepasses((ordersResult.data ?? []) as GamepassOrder[]);
    if (payoutsResult.error) setMessage(payoutsResult.error.message); else setPayouts((payoutsResult.data ?? []) as RobuxPayout[]);
    if (archiveResult.error) setMessage(archiveResult.error.message); else setArchives((archiveResult.data ?? []) as ArchiveRecord[]);
    setLoading(false);
  }

  async function login(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setMessage(friendlyAuthError(error.message));
  }
  async function logout() { await supabase.auth.signOut(); setView("overview"); }
  function go(viewName: View) { setView(viewName); setMobileNavOpen(false); setSearch(""); setSelectedGamepasses(new Set()); setSelectedPayouts(new Set()); setSelectedArchives(new Set()); }
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
    const { error } = await supabase.from("orders").insert({ robux_amount: amount, process_type: gamepassForm.process_type, gamepass_link: links[0].link, gamepass_links: links, buyer_username: cleanUsername(gamepassForm.buyer_username), status: gamepassForm.status, notes: gamepassForm.notes.trim() || null });
    if (error) return setMessage(error.message);
    setShowGamepassModal(false); await loadAll();
  }

  async function addPayout(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const amount = Number(payoutForm.robux_amount.replace(/,/g, ""));
    if (!amount || amount <= 0) return setMessage("Enter a valid Robux amount.");
    if (!payoutForm.buyer_username.trim()) return setMessage("Add the buyer username.");
    if (!payoutForm.roblox_username.trim()) return setMessage("Add the Roblox recipient username.");
    const { error } = await supabase.from("robux_payouts").insert({ buyer_username: cleanUsername(payoutForm.buyer_username), roblox_username: cleanUsername(payoutForm.roblox_username), robux_amount: amount, source_group: payoutForm.source_group, status: payoutForm.status, notes: payoutForm.notes.trim() || null });
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

  function toggleGamepassSelected(id: string) {
    setSelectedGamepasses(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAllGamepasses(ids: string[], checked: boolean) {
    setSelectedGamepasses(prev => { const next = new Set(prev); ids.forEach(id => checked ? next.add(id) : next.delete(id)); return next; });
  }
  function togglePayoutSelected(id: string) {
    setSelectedPayouts(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAllPayouts(ids: string[], checked: boolean) {
    setSelectedPayouts(prev => { const next = new Set(prev); ids.forEach(id => checked ? next.add(id) : next.delete(id)); return next; });
  }

  function requestConfirm(opts: { title: string; message: string; confirmLabel: string; danger?: boolean; action: () => Promise<void> }) {
    setConfirmDialog({ danger: false, ...opts });
  }
  async function runConfirmDialog() {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    await confirmDialog.action();
    setConfirmBusy(false);
    setConfirmDialog(null);
  }

  async function archiveSelectedGamepasses() {
    if (selectedGamepasses.size === 0) return;
    setBulkBusy(true); setMessage("");
    const { error } = await supabase.rpc("archive_selected_records", { p_gamepass_ids: Array.from(selectedGamepasses), p_payout_ids: [] });
    setBulkBusy(false);
    if (error) return setMessage(error.message);
    setSelectedGamepasses(new Set()); await loadAll();
  }
  async function deleteSelectedGamepasses() {
    if (selectedGamepasses.size === 0) return;
    setBulkBusy(true); setMessage("");
    const { error } = await supabase.from("orders").delete().in("id", Array.from(selectedGamepasses));
    setBulkBusy(false);
    if (error) return setMessage(error.message);
    setSelectedGamepasses(new Set()); await loadAll();
  }
  async function archiveSelectedPayouts() {
    if (selectedPayouts.size === 0) return;
    setBulkBusy(true); setMessage("");
    const { error } = await supabase.rpc("archive_selected_records", { p_gamepass_ids: [], p_payout_ids: Array.from(selectedPayouts) });
    setBulkBusy(false);
    if (error) return setMessage(error.message);
    setSelectedPayouts(new Set()); await loadAll();
  }
  async function deleteSelectedPayouts() {
    if (selectedPayouts.size === 0) return;
    setBulkBusy(true); setMessage("");
    const { error } = await supabase.from("robux_payouts").delete().in("id", Array.from(selectedPayouts));
    setBulkBusy(false);
    if (error) return setMessage(error.message);
    setSelectedPayouts(new Set()); await loadAll();
  }

  function toggleArchiveSelected(id: string) {
    setSelectedArchives(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function toggleAllArchives(ids: string[], checked: boolean) {
    setSelectedArchives(prev => { const next = new Set(prev); ids.forEach(id => checked ? next.add(id) : next.delete(id)); return next; });
  }
  async function deleteSelectedArchives() {
    if (currentRole !== "owner" || selectedArchives.size === 0) return;
    setBulkBusy(true); setMessage("");
    const { error } = await supabase.from("archive_records").delete().in("id", Array.from(selectedArchives));
    setBulkBusy(false);
    if (error) return setMessage(error.message);
    setSelectedArchives(new Set()); await loadAll();
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

  const currentEmail = session?.user.email?.toLowerCase() ?? "";
  const currentRole = STAFF[currentEmail];
  const visibleArchives = useMemo(() => {
    const anchor = new Date(`${archiveDate}T12:00:00`);
    const start = new Date(anchor);
    const end = new Date(anchor);
    if (archivePeriod === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1); end.setDate(1); }
    else if (archivePeriod === "week") { const day = start.getDay(); const diff = day === 0 ? -6 : 1 - day; start.setDate(start.getDate() + diff); end.setTime(start.getTime()); end.setDate(start.getDate() + 7); }
    else if (archivePeriod === "year") { start.setMonth(0, 1); end.setFullYear(end.getFullYear() + 1, 0, 1); }
    else return archives;
    return archives.filter(r => { const created = new Date((r.data as any).created_at ?? r.archived_period_start); return created >= start && created < end; });
  }, [archives, archivePeriod, archiveDate]);

  async function deleteArchive(id: string) {
    if (currentRole !== "owner") return setMessage("Only the owner can permanently delete archived records.");
    requestConfirm({
      title: "Delete archived record?",
      message: "Permanently delete this archived record? This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
      action: async () => {
        const { error } = await supabase.from("archive_records").delete().eq("id", id);
        if (error) setMessage(error.message); else await loadAll();
      },
    });
  }

  if (!session) return <Login email={email} password={password} setEmail={setEmail} setPassword={setPassword} login={login} message={message} />;

  const activeTitle = view === "overview" ? "Overview" : view === "gamepasses" ? "Gamepass orders" : view === "payouts" ? "Robux payouts" : view === "archive" ? "Archive" : "Settings";

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
          <button className="account-chip" onClick={() => go("settings")} title="Open settings"><span className="account-avatar">
  <img
    src={
      session.user.email?.toLowerCase() === OWNER_EMAIL
        ? "/owner.jpg"
        : "/admin.jpg"
    }
    alt={currentRole === "owner" ? "Owner" : "Admin"}
  />
</span><span className="account-email">{currentRole === "owner" ? "Owner" : currentRole === "admin" ? "Admin" : "Unauthorized"}</span><ChevronDown size={14} /></button>
        </div>
      </header>

      {mobileNavOpen && <button className="mobile-nav-overlay" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}
      <div className="workspace">
        <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-context"><span>WORKSPACE</span><strong>Order Desk</strong></div>
          <div className="sidebar-section-label">Navigate</div>
          <NavButton active={view === "overview"} icon={<ArrowUpRight size={16} />} onClick={() => go("overview")}>Overview</NavButton>
          <NavButton active={view === "gamepasses"} icon={<Gamepad2 size={16} />} onClick={() => go("gamepasses")}><span className="nav-label">Gamepass orders</span><span className="nav-count">{gamepasses.length}</span></NavButton>
          <NavButton active={view === "payouts"} icon={<WalletCards size={16} />} onClick={() => go("payouts")}><span className="nav-label">Robux payouts</span><span className="nav-count">{payouts.length}</span></NavButton>
          <NavButton active={view === "archive"} icon={<Archive size={16} />} onClick={() => go("archive")}><span className="nav-label">Archive</span><span className="nav-count">{archives.length}</span></NavButton>
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
            <div className="page-title-block"><span className="page-kicker">CHÉRIE ORDER DESK</span><h1>{activeTitle}</h1></div>
            {view === "gamepasses" && <button className="primary-btn" onClick={openGamepassModal}><Plus size={16} /> New order</button>}
            {view === "payouts" && <button className="primary-btn" onClick={openPayoutModal}><Plus size={16} /> New payout</button>}
          </div>
          {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss"><X size={15} /></button></div>}

          {view === "overview" && <Overview gamepasses={gamepasses} payouts={payouts} pendingGamepasses={pendingGamepasses} processingGamepasses={processingGamepasses} pendingPayouts={pendingPayouts} processingPayouts={processingPayouts} completedGamepasses={completedGamepasses} completedPayouts={completedPayouts} onGamepasses={() => go("gamepasses")} onPayouts={() => go("payouts")} />}
          {view === "gamepasses" && <>
            <div className="summary-row"><Summary label="Pending" value={money(pendingGamepasses)} detail="Not yet sent to supp" tone="amber" /><Summary label="Processing" value={money(processingGamepasses)} detail="Already sent to supp" tone="blue" /><Summary label="Completed" value={money(completedGamepasses)} detail="Gamepass already bought" tone="green" /><Summary label="Orders" value={String(gamepasses.length)} detail="All gamepass records" tone="neutral" /></div>
            <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Process" thirdValue={processFilter} thirdOptions={["all", "fast", "slow"]} setThirdValue={v => setProcessFilter(v as "all" | ProcessType)} />
            {selectedGamepasses.size > 0 && <SelectionBar count={selectedGamepasses.size} busy={bulkBusy} onClear={() => setSelectedGamepasses(new Set())} onArchive={() => requestConfirm({ title: "Archive selected orders?", message: `Archive ${selectedGamepasses.size} gamepass order(s) now? They'll move to the Archive tab.`, confirmLabel: "Archive", action: archiveSelectedGamepasses })} onDelete={() => requestConfirm({ title: "Delete selected orders?", message: `Permanently delete ${selectedGamepasses.size} gamepass order(s)? This cannot be undone.`, confirmLabel: "Delete", danger: true, action: deleteSelectedGamepasses })} />}
            <GamepassTable orders={visibleGamepasses} loading={loading} onStatus={updateGamepassStatus} selected={selectedGamepasses} onToggle={toggleGamepassSelected} onToggleAll={toggleAllGamepasses} />
          </>}
          {view === "payouts" && <>
            <div className="summary-row"><Summary label="Pending" value={money(pendingPayouts)} detail="Not yet sent" tone="amber" /><Summary label="Processing" value={money(processingPayouts)} detail="Already sent" tone="blue" /><Summary label="Completed" value={money(completedPayouts)} detail="Robux sent" tone="green" /><Summary label="Payouts" value={String(payouts.length)} detail="All payout records" tone="neutral" /></div>
            <Toolbar search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} thirdLabel="Group" thirdValue={groupFilter} thirdOptions={["all", ...GROUPS]} setThirdValue={v => setGroupFilter(v as "all" | SourceGroup)} />
            {selectedPayouts.size > 0 && <SelectionBar count={selectedPayouts.size} busy={bulkBusy} onClear={() => setSelectedPayouts(new Set())} onArchive={() => requestConfirm({ title: "Archive selected payouts?", message: `Archive ${selectedPayouts.size} Robux payout(s) now? They'll move to the Archive tab.`, confirmLabel: "Archive", action: archiveSelectedPayouts })} onDelete={() => requestConfirm({ title: "Delete selected payouts?", message: `Permanently delete ${selectedPayouts.size} Robux payout(s)? This cannot be undone.`, confirmLabel: "Delete", danger: true, action: deleteSelectedPayouts })} />}
            <PayoutTable payouts={visiblePayouts} loading={loading} onStatus={updatePayoutStatus} selected={selectedPayouts} onToggle={togglePayoutSelected} onToggleAll={toggleAllPayouts} />
          </>}
          {view === "archive" && <ArchiveView records={visibleArchives} period={archivePeriod} setPeriod={setArchivePeriod} date={archiveDate} setDate={setArchiveDate} canDelete={currentRole === "owner"} onDelete={deleteArchive} selected={selectedArchives} onToggle={toggleArchiveSelected} onToggleAll={toggleAllArchives} bulkBusy={bulkBusy} onDeleteSelected={() => requestConfirm({ title: "Delete archived records?", message: `Permanently delete ${selectedArchives.size} archived record(s)? This cannot be undone.`, confirmLabel: "Delete", danger: true, action: deleteSelectedArchives })} />}
          {view === "settings" && <SettingsView session={session} role={currentRole} darkMode={darkMode} setDarkMode={setDarkMode} onRefresh={loadAll} onSignOut={logout} />}
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
      {confirmDialog && <ConfirmDialog {...confirmDialog} busy={confirmBusy} onConfirm={runConfirmDialog} onCancel={() => setConfirmDialog(null)} />}
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

function DatePicker({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedDate = value ? new Date(`${value}T12:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  useEffect(() => {
    const d = value ? new Date(`${value}T12:00:00`) : new Date();
    setViewYear(d.getFullYear()); setViewMonth(d.getMonth());
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect(); if (!rect) return;
      const width = 280; const height = 340;
      const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));
      const top = window.innerHeight - rect.bottom < height && rect.top > height ? rect.top - height - 7 : rect.bottom + 7;
      setPosition({ top, left });
    };
    update();
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); window.removeEventListener("keydown", esc); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (event: PointerEvent) => {
      const target = event.target as Node;
      const menu = document.getElementById("cherie-datepicker-menu");
      if (!triggerRef.current?.contains(target) && !menu?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const displayLabel = selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  function goMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; }
    setViewMonth(m); setViewYear(y);
  }
  function toKey(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { day: number; muted: boolean; key: string }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, muted: true, key: "" });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, muted: false, key: toKey(viewYear, viewMonth, d) });
  while (cells.length % 7 !== 0) { const idx = cells.length - (firstDay + daysInMonth); cells.push({ day: idx + 1, muted: true, key: "" }); }

  const todayKey = toKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return <div className={`datepicker-wrap ${className}`}>
    <button ref={triggerRef} type="button" className={`datepicker-trigger ${open ? "open" : ""}`} onClick={() => setOpen(v => !v)}>
      <CalendarDays size={14} /><span>{displayLabel}</span>
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div id="cherie-datepicker-menu" className="datepicker-menu" style={{ top: position.top, left: position.left }}>
        <div className="datepicker-head">
          <strong>{monthLabel}</strong>
          <div className="datepicker-nav"><button type="button" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button><button type="button" onClick={() => goMonth(1)} aria-label="Next month">›</button></div>
        </div>
        <div className="datepicker-weekdays">{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d}>{d}</span>)}</div>
        <div className="datepicker-grid">
          {cells.map((cell, i) => {
            const isSelected = cell.key === value;
            const isToday = cell.key === todayKey;
            return <button key={i} type="button" disabled={cell.muted} className={`datepicker-cell ${cell.muted ? "muted" : ""} ${isSelected ? "selected" : ""} ${isToday && !isSelected ? "today" : ""}`} onClick={() => { onChange(cell.key); setOpen(false); }}>{cell.day}</button>;
          })}
        </div>
        <div className="datepicker-footer">
          <button type="button" onClick={() => { const t = new Date(); onChange(toKey(t.getFullYear(), t.getMonth(), t.getDate())); setOpen(false); }}>Today</button>
        </div>
      </div>, document.body)}
  </div>;
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) { return <button className={`nav-btn ${active ? "active" : ""}`} onClick={onClick}>{icon}<span className="nav-content">{children}</span></button>; }
function Summary({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) { return <div className={`summary-card ${tone}`}><div className="summary-mark" /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

function Overview(props: { gamepasses: GamepassOrder[]; payouts: RobuxPayout[]; pendingGamepasses: number; processingGamepasses: number; pendingPayouts: number; processingPayouts: number; completedGamepasses: number; completedPayouts: number; onGamepasses: () => void; onPayouts: () => void }) {
  const activity = [...props.gamepasses.map(o => ({ id: `g-${o.id}`, type: "Gamepass", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at })), ...props.payouts.map(o => ({ id: `p-${o.id}`, type: "Payout", buyer: o.buyer_username, amount: o.robux_amount, status: o.status, date: o.created_at }))].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);
  return <><div className="hero-panel"><div><span className="eyebrow">TODAY</span><h2>Keep every order moving.</h2><p>See what is waiting, what has already been sent to the supplier, and what your staff has completed.</p></div><div className="hero-actions"><button className="secondary-btn" onClick={props.onGamepasses}><Gamepad2 size={16} /> Gamepass orders</button><button className="secondary-btn" onClick={props.onPayouts}><WalletCards size={16} /> Robux payouts</button></div></div><div className="overview-grid"><OverviewCard icon={<Gamepad2 size={18} />} label="Gamepass outstanding" value={money(props.pendingGamepasses + props.processingGamepasses)} detail={`${money(props.pendingGamepasses)} pending · ${money(props.processingGamepasses)} processing`} /><OverviewCard icon={<CircleDollarSign size={18} />} label="Robux payout outstanding" value={money(props.pendingPayouts + props.processingPayouts)} detail={`${money(props.pendingPayouts)} pending · ${money(props.processingPayouts)} processing`} /><OverviewCard icon={<Check size={18} />} label="Completed" value={money(props.completedGamepasses + props.completedPayouts)} detail={`${money(props.completedGamepasses)} gamepasses · ${money(props.completedPayouts)} payouts`} /><OverviewCard icon={<Users size={18} />} label="Total records" value={String(props.gamepasses.length + props.payouts.length)} detail={`${props.gamepasses.length} gamepasses · ${props.payouts.length} payouts`} /></div><div className="activity-card"><div className="section-title"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Latest records</h2></div></div>{activity.length === 0 ? <Empty title="No records yet" text="Your newest orders and payouts will appear here." /> : <div className="activity-list">{activity.map(item => <div className="activity-item" key={item.id}><div className="activity-dot" /><div className="activity-main"><strong>@{item.buyer}</strong><span>{item.type} · {dateTime(item.date)}</span></div><div className="activity-amount">{money(item.amount)}</div><StatusBadge status={item.status} /></div>)}</div>}</div></>;
}
function OverviewCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) { return <div className="overview-card"><div className="card-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }

function Toolbar({ search, setSearch, statusFilter, setStatusFilter, thirdLabel, thirdValue, thirdOptions, setThirdValue }: { search: string; setSearch: (value: string) => void; statusFilter: "all" | OrderStatus; setStatusFilter: (value: "all" | OrderStatus) => void; thirdLabel: string; thirdValue: string; thirdOptions: string[]; setThirdValue: (value: string) => void }) {
  const label = (value: string) => value === "all" ? "All" : value === "fast" ? "Fast" : value === "slow" ? "Slow" : value;
  return <div className="toolbar"><div className="search-box"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search buyer, recipient, amount, or link..." /><kbd>⌘ K</kbd></div><div className="toolbar-select"><Dropdown value={statusFilter} onChange={v => setStatusFilter(v as "all" | OrderStatus)} options={["all", ...STATUSES].map(v => ({ value: v, label: v === "all" ? "All statuses" : statusLabel(v) }))} /></div><div className="toolbar-select"><Dropdown value={thirdValue} onChange={setThirdValue} options={thirdOptions.map(v => ({ value: v, label: v === "all" ? `All ${thirdLabel.toLowerCase()}s` : label(v) }))} /></div></div>;
}

function SelectionBar({ count, busy, onClear, onArchive, onDelete }: { count: number; busy: boolean; onClear: () => void; onArchive?: () => void; onDelete: () => void }) {
  return <div className="selection-bar"><span className="selection-count">{count} selected</span><div className="selection-actions"><button className="secondary-btn" type="button" disabled={busy} onClick={onClear}>Clear</button>{onArchive && <button className="secondary-btn" type="button" disabled={busy} onClick={onArchive}><Archive size={15} /> Archive</button>}<button className="secondary-btn danger" type="button" disabled={busy} onClick={onDelete}><Trash2 size={15} /> Delete</button></div></div>;
}
function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; danger: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [busy, onCancel]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && !busy && onCancel()}>
    <div className="confirm-dialog">
      <div className={`confirm-icon ${danger ? "danger" : ""}`}>{danger ? <Trash2 size={18} /> : <Archive size={18} />}</div>
      <h3>{title}</h3>
      <p>{message}</p>
      <div className="confirm-actions">
        <button type="button" className="secondary-btn" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={`primary-btn ${danger ? "danger" : ""}`} disabled={busy} onClick={onConfirm}>{busy ? "Working..." : confirmLabel}</button>
      </div>
    </div>
  </div>;
}
function HeaderCheckbox({ ids, selected, onToggleAll }: { ids: string[]; selected: Set<string>; onToggleAll: (ids: string[], checked: boolean) => void }) {
  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
  const someSelected = !allSelected && ids.some(id => selected.has(id));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = someSelected; }, [someSelected]);
  return <input ref={ref} type="checkbox" className="row-checkbox" checked={allSelected} onChange={e => onToggleAll(ids, e.target.checked)} aria-label="Select all rows" />;
}

function GamepassTable({ orders, loading, onStatus, selected, onToggle, onToggleAll }: { orders: GamepassOrder[]; loading: boolean; onStatus: (id: string, status: OrderStatus) => void; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[], checked: boolean) => void }) {
  const ids = orders.map(o => o.id);
  return <><div className="table-card desktop-table"><div className="table-wrap"><table><thead><tr><th className="checkbox-col"><HeaderCheckbox ids={ids} selected={selected} onToggleAll={onToggleAll} /></th><th>Buyer</th><th>Robux</th><th>Process</th><th>Gamepass links</th><th>Status</th><th>Added</th><th>Added by</th><th>Updated by</th></tr></thead><tbody>{loading ? <tr><td colSpan={9}><div className="table-empty">Loading records...</div></td></tr> : orders.length === 0 ? <tr><td colSpan={9}><Empty title="No gamepass orders" text="Try changing your filters or add a new order." /></td></tr> : orders.map(o => <tr key={o.id} className={selected.has(o.id) ? "row-selected" : ""}><td className="checkbox-col"><input type="checkbox" className="row-checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} aria-label={`Select order from @${o.buyer_username}`} /></td><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className={`process-chip ${o.process_type}`}>{o.process_type}</span></td><td><GamepassLinks order={o} /></td><td><StatusSelect status={o.status} onChange={v => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td><td className="actor-cell">{staffLabel(o.created_by_email)}</td><td className="actor-cell">{staffLabel(o.updated_by_email ?? o.created_by_email)}</td></tr>)}</tbody></table></div></div><div className="mobile-record-list">{loading ? <div className="mobile-empty">Loading records...</div> : orders.length === 0 ? <Empty title="No gamepass orders" text="Try changing your filters or add a new order." /> : orders.map(o => <GamepassMobileCard key={o.id} order={o} onStatus={onStatus} selected={selected.has(o.id)} onToggle={() => onToggle(o.id)} />)}</div></>;
}
function GamepassLinks({ order }: { order: GamepassOrder }) {
  const links = parseGamepassLinks(order);
  return <div className="links-list">{links.map((item, index) => <a key={`${item.link}-${index}`} className="link-row" href={item.link} target="_blank" rel="noreferrer"><span className="link-index">{index + 1}</span><span className="link-copy"><strong>{money(item.amount)}</strong><span>{item.link}</span></span><ExternalLink size={14} /></a>)}</div>;
}
function GamepassMobileCard({ order, onStatus, selected, onToggle }: { order: GamepassOrder; onStatus: (id: string, status: OrderStatus) => void; selected: boolean; onToggle: () => void }) { return <article className={`record-card ${selected ? "row-selected" : ""}`}><div className="record-card-head"><label className="record-select"><input type="checkbox" className="row-checkbox" checked={selected} onChange={onToggle} aria-label={`Select order from @${order.buyer_username}`} /><div><strong>@{order.buyer_username}</strong><span>{dateTime(order.created_at)}</span></div></label><StatusSelect status={order.status} onChange={v => onStatus(order.id, v)} /></div><div className="record-meta"><span><b>{money(order.robux_amount)}</b> total</span><span className={`process-chip ${order.process_type}`}>{order.process_type}</span></div><GamepassLinks order={order} />{order.notes && <p className="record-note">{order.notes}</p>}<div className="record-audit"><span>Added by <b>{staffLabel(order.created_by_email)}</b></span><span>Updated by <b>{staffLabel(order.updated_by_email ?? order.created_by_email)}</b></span></div></article>; }

function PayoutTable({ payouts, loading, onStatus, selected, onToggle, onToggleAll }: { payouts: RobuxPayout[]; loading: boolean; onStatus: (id: string, status: PayoutStatus) => void; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[], checked: boolean) => void }) {
  const ids = payouts.map(o => o.id);
  return <><div className="table-card desktop-table"><div className="table-wrap"><table><thead><tr><th className="checkbox-col"><HeaderCheckbox ids={ids} selected={selected} onToggleAll={onToggleAll} /></th><th>Buyer</th><th>Send to</th><th>Robux</th><th>From group</th><th>Status</th><th>Added</th><th>Added by</th><th>Updated by</th></tr></thead><tbody>{loading ? <tr><td colSpan={9}><div className="table-empty">Loading records...</div></td></tr> : payouts.length === 0 ? <tr><td colSpan={9}><Empty title="No Robux payouts" text="Try changing your filters or add a new payout." /></td></tr> : payouts.map(o => <tr key={o.id} className={selected.has(o.id) ? "row-selected" : ""}><td className="checkbox-col"><input type="checkbox" className="row-checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} aria-label={`Select payout to @${o.roblox_username}`} /></td><td><strong className="table-buyer">@{o.buyer_username}</strong>{o.notes && <small className="table-note">{o.notes}</small>}</td><td><strong className="recipient">@{o.roblox_username}</strong><small className="recipient-label">Roblox recipient</small></td><td><strong className="amount">{money(o.robux_amount)}</strong></td><td><span className="group-chip">{o.source_group}</span></td><td><StatusSelect status={o.status} onChange={v => onStatus(o.id, v)} /></td><td className="date-cell">{dateTime(o.created_at)}</td><td className="actor-cell">{staffLabel(o.created_by_email)}</td><td className="actor-cell">{staffLabel(o.updated_by_email ?? o.created_by_email)}</td></tr>)}</tbody></table></div></div><div className="mobile-record-list">{loading ? <div className="mobile-empty">Loading records...</div> : payouts.length === 0 ? <Empty title="No Robux payouts" text="Try changing your filters or add a new payout." /> : payouts.map(o => <PayoutMobileCard key={o.id} payout={o} onStatus={onStatus} selected={selected.has(o.id)} onToggle={() => onToggle(o.id)} />)}</div></>;
}
function PayoutMobileCard({ payout, onStatus, selected, onToggle }: { payout: RobuxPayout; onStatus: (id: string, status: PayoutStatus) => void; selected: boolean; onToggle: () => void }) { return <article className={`record-card ${selected ? "row-selected" : ""}`}><div className="record-card-head"><label className="record-select"><input type="checkbox" className="row-checkbox" checked={selected} onChange={onToggle} aria-label={`Select payout to @${payout.roblox_username}`} /><div><strong>@{payout.buyer_username}</strong><span>{dateTime(payout.created_at)}</span></div></label><StatusSelect status={payout.status} onChange={v => onStatus(payout.id, v)} /></div><div className="recipient-card"><span>Send Robux to</span><strong>@{payout.roblox_username}</strong></div><div className="record-meta"><span><b>{money(payout.robux_amount)}</b></span><span className="group-chip">{payout.source_group}</span></div>{payout.notes && <p className="record-note">{payout.notes}</p>}<div className="record-audit"><span>Added by <b>{staffLabel(payout.created_by_email)}</b></span><span>Updated by <b>{staffLabel(payout.updated_by_email ?? payout.created_by_email)}</b></span></div></article>; }

function StatusSelect({ status, onChange }: { status: OrderStatus; onChange: (status: OrderStatus) => void }) { return <div className={`status-select ${status}`}><Dropdown value={status} onChange={v => onChange(v as OrderStatus)} options={STATUSES.map(s => ({ value: s, label: statusLabel(s) }))} /></div>; }
function StatusBadge({ status }: { status: OrderStatus }) { return <span className={`status-badge ${status}`}>{statusLabel(status)}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div className="empty-icon"><Search size={16} /></div><strong>{title}</strong><span>{text}</span></div>; }

function ArchiveView({ records, period, setPeriod, date, setDate, canDelete, onDelete, selected, onToggle, onToggleAll, bulkBusy, onDeleteSelected }: { records: ArchiveRecord[]; period: "month" | "week" | "year" | "all"; setPeriod: (v: "month" | "week" | "year" | "all") => void; date: string; setDate: (v: string) => void; canDelete: boolean; onDelete: (id: string) => void; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: (ids: string[], checked: boolean) => void; bulkBusy: boolean; onDeleteSelected: () => void }) {
  const label = period === "all" ? "All archived records" : period === "month" ? "Monthly archive" : period === "week" ? "Weekly archive" : "Yearly archive";
  const ids = records.map(r => r.id);
  const colSpan = canDelete ? 9 : 7;
  return <div className="archive-page"><div className="archive-intro"><div><h2>{label}</h2><p>Records move here automatically after their calendar month closes. Archived data stays out of the active workspace.</p></div><div className="archive-meta"><Archive size={18} /><span>{records.length} records</span></div></div><div className="archive-toolbar"><div className="period-tabs">{(["month", "week", "year", "all"] as const).map(v => <button key={v} className={period === v ? "active" : ""} onClick={() => setPeriod(v)}>{v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}</button>)}</div>{period !== "all" && <DatePicker value={date} onChange={setDate} />}</div>{canDelete && selected.size > 0 && <SelectionBar count={selected.size} busy={bulkBusy} onClear={() => onToggleAll(ids, false)} onDelete={onDeleteSelected} />}<div className="table-card archive-table"><div className="table-wrap"><table><thead><tr>{canDelete && <th className="checkbox-col"><HeaderCheckbox ids={ids} selected={selected} onToggleAll={onToggleAll} /></th>}<th>Type</th><th>Buyer</th><th>Robux</th><th>Status</th><th>Archived</th><th>Added by</th><th>Updated by</th>{canDelete && <th />}</tr></thead><tbody>{records.length === 0 ? <tr><td colSpan={colSpan}><Empty title="Nothing archived here" text="Try another period or wait for the next monthly archive run." /></td></tr> : records.map(record => { const data = record.data as any; return <tr key={record.id} className={selected.has(record.id) ? "row-selected" : ""}>{canDelete && <td className="checkbox-col"><input type="checkbox" className="row-checkbox" checked={selected.has(record.id)} onChange={() => onToggle(record.id)} aria-label={`Select archived record for @${data.buyer_username}`} /></td>}<td><span className="archive-type">{record.record_type === "gamepass" ? "Gamepass" : "Payout"}</span></td><td><strong className="table-buyer">@{data.buyer_username}</strong></td><td><strong className="amount">{money(data.robux_amount)}</strong></td><td><StatusBadge status={data.status} /></td><td className="date-cell">{dateTime(record.archived_at)}</td><td className="actor-cell">{staffLabel(record.created_by_email)}</td><td className="actor-cell">{staffLabel(record.updated_by_email ?? record.created_by_email)}</td>{canDelete && <td><button className="table-delete" title="Permanently delete" onClick={() => onDelete(record.id)}><Trash2 size={15} /></button></td>}</tr>; })}</tbody></table></div></div><div className="archive-note"><ShieldCheck size={15} /><span><b>Retention:</b> archives are kept until an owner permanently deletes them. Deleting an archive record cannot be undone.</span></div></div>;
}

function SettingsView({ session, role, darkMode, setDarkMode, onRefresh, onSignOut }: { session: Session; role: StaffRole; darkMode: boolean; setDarkMode: (v: boolean) => void; onRefresh: () => void; onSignOut: () => void }) {
  return <div className="settings-page"><div className="settings-intro"><div><p>Control how this workspace looks and manage your staff session.</p></div></div><div className="settings-grid"><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Sun size={17} /></div><div><strong>Appearance</strong><span>Choose your workspace theme.</span></div></div><div className="theme-options"><button className={`theme-option ${!darkMode ? "selected" : ""}`} onClick={() => setDarkMode(false)}><Sun size={17} /><span><b>Light</b><small>Clean white workspace</small></span>{!darkMode && <Check size={16} />}</button><button className={`theme-option ${darkMode ? "selected" : ""}`} onClick={() => setDarkMode(true)}><Moon size={17} /><span><b>Dark</b><small>Low-light workspace</small></span>{darkMode && <Check size={16} />}</button></div></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><ShieldCheck size={17} /></div><div><strong>Staff access</strong><span>Only two fixed staff accounts can access the workspace.</span></div></div><div className="staff-list">
  <div className="staff-row">
    <span className="account-avatar">
      <img src="/owner.jpg" alt="Owner" />
    </span>

    <div>
      <strong>Owner</strong>
      <small>Owner · permanent archive deletion</small>
    </div>
  </div>

  <div className="staff-row">
    <span className="account-avatar">
      <img src="/admin.jpg" alt="Admin" />
    </span>

    <div>
      <strong>Admin</strong>
      <small>Admin · manage active records</small>
    </div>
  </div>

  <div className="current-role">
    <span>Signed in as</span>
    <b>{role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Unauthorized"}</b>
  </div>
</div></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><RefreshCw size={17} /></div><div><strong>Workspace actions</strong><span>Useful controls for shared records.</span></div></div><button className="settings-action" onClick={onRefresh}><span><RefreshCw size={16} /><b>Refresh records</b></span><ArrowUpRight size={15} /></button><button className="settings-action danger" onClick={onSignOut}><span><LogOut size={16} /><b>Sign out</b></span><ArrowUpRight size={15} /></button></section><section className="settings-card"><div className="settings-card-head"><div className="settings-icon"><Settings size={17} /></div><div><strong>Workspace</strong><span>Current application information.</span></div></div><div className="info-list"><div><span>Workspace</span><b>Chérie RBX Order Desk</b></div><div><span>Access</span><b>Private staff workspace</b></div><div><span>Data</span><b>Shared through Supabase</b></div></div></section></div></div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-head"><div><span className="eyebrow">CREATE RECORD</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" type="button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>{children}</div></div>;
}