import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, subDays, startOfDay, isToday, isYesterday, parseISO } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Activity, AlertTriangle, CheckCircle, RefreshCcw, Send, Settings, User, Clock, ChevronDown, ChevronUp, Lock, ExternalLink, X } from "lucide-react";

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
type Ticket = {
  id: string;
  summary: string;
  category: string;
  urgency: "Critical" | "High" | "Medium" | "Low";
  product_area: string;
  sentiment: string;
  is_complaint: boolean;
  suggested_action: string;
  status: "Open" | "In Review" | "Escalated" | "Awaiting User" | "Resolved" | "Dismissed" | "Classifying";
  raw_text: string;
  created_at: string;
  suggested_reply?: string | null;
  telegram_deep_link?: string | null;
  telegram_message_id?: string | null;
  jira_issue_key?: string | null;
  jira_issue_url?: string | null;
  is_admin_message?: boolean;
  group_id?: string;
};

type Community = {
  id: string;
  telegram_group_id: string;
  display_name: string;
};

// -----------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
const URGENCY_COLORS: Record<string, string> = {
  Critical: "bg-rose-500",
  High:     "bg-amber-500",
  Medium:   "bg-indigo-500",
  Low:      "bg-blue-500",
};

// -----------------------------------------------------------------------------
// T3-A: FIELD-LEVEL DIFF GUARD
// -----------------------------------------------------------------------------
function haveTicketsChanged(prev: Ticket[], next: Ticket[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < next.length; i++) {
    const p = prev[i];
    const n = next[i];
    if (
      p.id            !== n.id            ||
      p.status        !== n.status        ||
      p.urgency       !== n.urgency       ||
      p.summary       !== n.summary       ||
      p.category      !== n.category      ||
      p.is_admin_message !== n.is_admin_message ||
      p.group_id      !== n.group_id      ||
      p.suggested_reply !== n.suggested_reply ||
      p.raw_text      !== n.raw_text      ||
      p.jira_issue_key !== n.jira_issue_key
    ) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------
// T3-C: ERROR BOUNDARY
// -----------------------------------------------------------------------------
type ErrState = { hasError: boolean; error?: Error };
type ErrProps = { children: React.ReactNode; fallback?: React.ReactNode };

class ErrorBoundary extends React.Component<ErrProps, ErrState> {
  declare props: ErrProps;
  declare state: ErrState;

  constructor(props: ErrProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): ErrState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          <AlertTriangle className="inline w-4 h-4 mr-2" />
          Something went wrong in this section. Please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}

// -----------------------------------------------------------------------------
// TRAINING VIEW (/train) — flashcard-style human review of AI classifications
// -----------------------------------------------------------------------------
const IS_TRAIN_ROUTE = window.location.pathname.startsWith("/train");

type TrainTicket = {
  id: string;
  summary: string;
  category: string;
  urgency: string;
  product_area: string;
  sentiment: string;
  status: string;
  raw_text: string;
  created_at: string;
};

function TrainView({ apiFetch }: { apiFetch: (endpoint: string, options?: RequestInit) => Promise<Response> }) {
  const [ticket, setTicket]             = useState<TrainTicket | null>(null);
  const [categories, setCategories]     = useState<string[]>([]);
  const [counts, setCounts]             = useState<{ totalTickets: number; correctionsLogged: number }>({ totalTickets: 0, correctionsLogged: 0 });
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [submitting, setSubmitting]     = useState(false);
  const [wrongMode, setWrongMode]       = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [error, setError]               = useState("");

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError("");
    setWrongMode(false);
    setSelectedCategory("");
    try {
      const res  = await apiFetch("/api/train/next");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load next ticket");
      setCategories(data.categories || []);
      setCounts({ totalTickets: data.totalTickets || 0, correctionsLogged: data.correctionsLogged || 0 });
      setTicket(data.ticket);
    } catch (e: any) {
      if (e?.message !== "Unauthorized") setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { loadNext(); }, [loadNext]);

  const submitVerdict = async (verdict: "correct" | "wrong") => {
    if (!ticket || submitting) return;
    if (verdict === "wrong" && !selectedCategory) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/train/correct", {
        method: "POST",
        body: JSON.stringify({
          ticketId: ticket.id,
          verdict,
          ...(verdict === "wrong" ? { correctCategory: selectedCategory } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to save review");
      setSessionReviewed(n => n + 1);
      await loadNext();
    } catch (e: any) {
      if (e?.message !== "Unauthorized") setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white font-sans flex flex-col relative overflow-hidden">
      <div className="fixed top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">PULSEDESK TRAINING</h1>
            <p className="text-[10px] text-indigo-300 font-mono tracking-widest uppercase">Teach the AI - one ticket at a time</p>
          </div>
        </div>
        <a href="/" className="bg-white/5 border border-white/10 px-4 py-2 rounded-xl backdrop-blur-md hover:bg-white/10 transition text-xs font-bold text-white/60 uppercase tracking-widest">
          ← Dashboard
        </a>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-16 w-full">
        <div className="mb-6 flex items-center gap-6 text-[11px] uppercase tracking-widest font-bold text-white/40">
          <span><span className="text-indigo-400">{sessionReviewed}</span> reviewed this session</span>
          <span><span className="text-emerald-400">{counts.correctionsLogged}</span> corrections logged</span>
          <span><span className="text-white/70">{counts.totalTickets}</span> tickets total</span>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />{error}
          </div>
        )}

        {loading ? (
          <div className="p-12 flex justify-center"><div className="animate-spin text-indigo-500"><RefreshCcw /></div></div>
        ) : !ticket ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-12 max-w-xl w-full text-center">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">All caught up</h2>
            <p className="text-sm text-white/50">Every classified ticket has been reviewed. New tickets will appear here as they come in.</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl max-w-xl w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_COLORS[ticket.urgency] || "bg-zinc-500"}`} />
                <span className="text-xs font-bold uppercase tracking-widest text-white/50">{ticket.urgency} · {ticket.status}</span>
              </div>
              <span className="text-xs text-white/30">{(() => { try { return format(parseISO(ticket.created_at), "MMM d, HH:mm"); } catch { return ticket.created_at; } })()}</span>
            </div>

            <div className="p-6">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">User message</p>
              <p className="text-sm text-white/90 whitespace-pre-wrap bg-white/5 border border-white/10 rounded-xl p-4 mb-5 max-h-56 overflow-y-auto">{ticket.raw_text}</p>

              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">AI classified this as</p>
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-bold text-sm mb-6">
                {ticket.category}
              </div>

              {!wrongMode ? (
                <div className="flex gap-3">
                  <button
                    id="train-correct"
                    onClick={() => submitVerdict("correct")}
                    disabled={submitting}
                    className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3 text-sm transition shadow-lg shadow-emerald-500/20"
                  >
                    {submitting ? "Saving..." : "✓ Correct"}
                  </button>
                  <button
                    id="train-wrong"
                    onClick={() => setWrongMode(true)}
                    disabled={submitting}
                    className="flex-1 bg-rose-500/80 hover:bg-rose-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3 text-sm transition shadow-lg shadow-rose-500/20"
                  >
                    ✗ Wrong — fix it
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">What is the correct category?</p>
                  <select
                    id="train-category-select"
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 [&>option]:text-black"
                  >
                    <option value="">Select a category...</option>
                    {categories.filter(c => c !== ticket.category).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <div className="flex gap-3">
                    <button
                      id="train-save-correction"
                      onClick={() => submitVerdict("wrong")}
                      disabled={submitting || !selectedCategory}
                      className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-3 text-sm transition shadow-lg shadow-indigo-500/20"
                    >
                      {submitting ? "Saving..." : "Save correction"}
                    </button>
                    <button
                      onClick={() => { setWrongMode(false); setSelectedCategory(""); }}
                      disabled={submitting}
                      className="px-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-bold rounded-xl py-3 text-sm transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MAIN APP
// -----------------------------------------------------------------------------
export default function App() {
  // -- Auth State -------------------------------------------------------------
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // New: check sessionStorage pd_token; fallback: old localStorage key
    return !!(sessionStorage.getItem("pd_token") || localStorage.getItem("PULSEDESK_ADMIN_KEY"));
  });
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [authError, setAuthError]         = useState<string>("");
  const [authLoading, setAuthLoading]     = useState<boolean>(false);

  // --- Token helpers --------------------------------------------------------------
  const getToken = useCallback((): string => {
    return sessionStorage.getItem("pd_token") || localStorage.getItem("PULSEDESK_ADMIN_KEY") || "";
  }, []);

  const handleCategoryClick = useCallback((category: string) => {
    setFilterCategory(category);
    // Smooth scroll to the ticket feed so user sees the filtered results
    document.getElementById("ticket-feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);


  // --- Dashboard State ------------------------------------------------------------
  const [tickets, setTickets]               = useState<Ticket[]>([]);
  const [communities, setCommunities]       = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>("");
  const [loading, setLoading]               = useState(true);
  const [demoModeBanner, setDemoModeBanner] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode]         = useState<boolean>(false);

  // --- Simulator State ------------------------------------------------------------
  const [simMessage, setSimMessage]             = useState("");
  const [isSimulating, setIsSimulating]         = useState(false);
  const [isBackfilling, setIsBackfilling]       = useState(false);
  const [backfillStatus, setBackfillStatus]     = useState<{ message: string; isError: boolean } | null>(null);
  const [backfillLimit, setBackfillLimit]       = useState<number>(50);
  const [backfillDays, setBackfillDays]         = useState<number>(7);
  const [backfillMinUrgency, setBackfillMinUrgency] = useState<string>("All");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [jiraLoading, setJiraLoading]           = useState<Record<string, boolean>>({});

  // -- Issues-Only filter (default ON - hides General Question, Praise, Spam) --
  const [showIssuesOnly, setShowIssuesOnly] = useState<boolean>(true);

  // -- Backfill progress -----------------------------------------------------
  const [backfillProgress, setBackfillProgress] = useState<{ running: boolean; total: number; done: number; ingested: number; skipped: number } | null>(null);
  const backfillPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Benchmark state ---------------------------------------
  const [evalResults, setEvalResults]   = useState<any>(null);
  const [evalLoading, setEvalLoading]   = useState<boolean>(false);
  const [showBenchmark, setShowBenchmark] = useState<boolean>(false);
  const [testMessageText, setTestMessageText] = useState("");
  const [testMessageLoading, setTestMessageLoading] = useState(false);
  const [testMessageResult, setTestMessageResult] = useState<any>(null);
  const [testMessageError, setTestMessageError] = useState("");

  // -- Training-loop verification state (Milestone 4) -------------------------
  const [verifyState, setVerifyState] = useState<any>(null);
  const [verifyStarting, setVerifyStarting] = useState(false);

  // -- Filters ----------------------------------------------------------------
  const [filterCategory, setFilterCategory]     = useState<string>("All");

  const [filterStatus, setFilterStatus]         = useState<string>("All");
  const [filterDays, setFilterDays]             = useState<string>("30");
  const [filterStartDate, setFilterStartDate]   = useState<string>("");
  const [filterEndDate, setFilterEndDate]       = useState<string>("");
  const [searchQuery, setSearchQuery]           = useState<string>("");
  const [urgencyFilter, setUrgencyFilter]       = useState<string>("All"); // Feature 7 quick filter

  // -- Pagination -------------------------------------------------------------
  const [currentPage, setCurrentPage]     = useState<number>(1);
  const [itemsPerPage, setItemsPerPage]   = useState<number>(20);
  const [totalTickets, setTotalTickets]   = useState<number>(0);
  const [globalStats, setGlobalStats]     = useState<any>(null);

  // -- Notification -----------------------------------------------------------
  const [notification, setNotification] = useState<{ message: string; visible: boolean; type: "success" | "info" }>({
    message: "", visible: false, type: "success",
  });

  const showNotification = useCallback((message: string, type: "success" | "info" = "success") => {
    setNotification({ message, visible: true, type });
    setTimeout(() => setNotification(prev => ({ ...prev, visible: false })), 5000);
  }, []);


  // -- Reset page on filter change --------------------------------------------
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCategory, filterStatus, filterDays, filterStartDate, filterEndDate, searchQuery, itemsPerPage, urgencyFilter]);

  const formatTicketDate = useCallback((dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      if (isToday(d))     return `Today, ${format(d, "HH:mm")}`;
      if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
      return format(d, "MMM d, HH:mm");
    } catch {
      return dateStr;
    }
  }, []);

  // -- apiFetch - reads token from sessionStorage / localStorage --------------
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = getToken();
    const res = await fetch(endpoint, {
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token.length === 64
          ? { Authorization: `Bearer ${token}` }        // new: 64-char hex token
          : { "x-admin-key": token }),                   // legacy: raw password
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      sessionStorage.removeItem("pd_token");
      localStorage.removeItem("PULSEDESK_ADMIN_KEY");
      throw new Error("Unauthorized");
    }
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`API Error: Expected JSON but got ${contentType} on ${endpoint}: ${text.substring(0, 50)}`);
    }
    return res;
  }, [getToken]);

  // -- T1-B: Login handler (calls POST /api/auth/login) ----------------------
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passwordInput.trim()) return;
    setAuthLoading(true);
    setAuthError("");

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const { token } = await res.json();
        sessionStorage.setItem("pd_token", token);
        localStorage.removeItem("PULSEDESK_ADMIN_KEY"); // clean up legacy key
        setIsAuthenticated(true);
        setPasswordInput("");
      } else {
        setAuthError("Invalid access key or insufficient permissions");
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        setAuthError("Request timed out. Please check your connection.");
      } else {
        setAuthError("Network error. Make sure the backend is running.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch { /* best-effort */ }
    sessionStorage.removeItem("pd_token");
    localStorage.removeItem("PULSEDESK_ADMIN_KEY");
    setIsAuthenticated(false);
    setTickets([]);
  }, [apiFetch]);

  // -- Data fetching ----------------------------------------------------------
  useEffect(() => {
    if (isAuthenticated) fetchCommunities();
  }, [isAuthenticated]);

  const fetchCommunities = async () => {
    try {
      const res  = await apiFetch("/api/communities");
      const data = await res.json();
      if (data && data.length > 0) {
        setCommunities(data);
        if (!selectedCommunity) setSelectedCommunity(data[0].telegram_group_id);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
    }
  };

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCommunity) params.set("group_id", selectedCommunity);

      if (urgencyFilter !== "All") params.set("urgency", urgencyFilter);
      if (filterStatus   !== "All") params.set("status",   filterStatus);
      if (filterCategory !== "All") params.set("category", filterCategory);
      if (showIssuesOnly)            params.set("issues_only", "true");
      
      if (filterDays !== "All") params.set("days", filterDays);
      if (filterDays === "Custom") {
        if (filterStartDate) params.set("startDate", filterStartDate);
        if (filterEndDate) params.set("endDate", filterEndDate);
      }
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      params.set("page",     String(currentPage - 1));
      params.set("pageSize", String(itemsPerPage));

      const res  = await apiFetch(`/api/tickets?${params.toString()}`);
      const data = await res.json();

      const newTickets: Ticket[] = Array.isArray(data) ? data : (data.tickets ?? []);
      const total: number        = Array.isArray(data) ? data.length : (data.total ?? 0);
      if (!Array.isArray(data) && data.stats) {
        setGlobalStats(data.stats);
      }

      // Feature 5: detect demo mode
      setIsDemoMode(newTickets.length > 0 && String(newTickets[0]?.id).startsWith("demo-"));

      setTickets(prev => haveTicketsChanged(prev, newTickets) ? newTickets : prev);
      setTotalTickets(total);
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedCommunity, filterStatus, filterCategory, currentPage, itemsPerPage, showIssuesOnly, urgencyFilter, filterDays, filterStartDate, filterEndDate, searchQuery]);

  useEffect(() => {
    // The /train view manages its own data — don't run dashboard polling there
    if (!isAuthenticated || IS_TRAIN_ROUTE) return;
    fetchTickets();
    // Use a fixed interval without recreating it on every render unless auth changes
    const interval = setInterval(() => {
      fetchTickets();
    }, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchTickets]);

  // -- Ticket actions ---------------------------------------------------------
  const handleUpdateStatus = useCallback(async (ticketId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/api/tickets/${ticketId}/status`, {
        method: "POST",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: newStatus as any } : t));
      } else {
        const err = await res.json();
        alert(`Failed to update status: ${err.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update status.");
    }
  }, [apiFetch]);

  // Feature 4: Create Jira ticket
  const handleCreateJiraTicket = useCallback(async (ticketId: string) => {
    setJiraLoading(prev => ({ ...prev, [ticketId]: true }));
    try {
      const res  = await apiFetch(`/api/tickets/${ticketId}/jira`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification(`Jira issue ${data.jira_issue_key} created!`, "success");
        setTickets(prev => prev.map(t =>
          t.id === ticketId
            ? { ...t, jira_issue_key: data.jira_issue_key, jira_issue_url: data.jira_issue_url }
            : t
        ));
      } else {
        alert(`Failed to create Jira issue: ${data.error}`);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
      alert("Failed to reach Jira API.");
    } finally {
      setJiraLoading(prev => ({ ...prev, [ticketId]: false }));
    }
  }, [apiFetch, showNotification]);

  // -- Filtering (client-side on top of server filters) -----------------------
  const filteredTickets = useMemo(() => {
    return tickets;
  }, [tickets]);
  // -- Simulator / Backfill --------------------------------------------------
  const simulateIngestion = async () => {
    if (!simMessage.trim()) return;
    setIsSimulating(true);
    try {
      const res  = await apiFetch("/api/ingest", {
        method: "POST",
        body: JSON.stringify({ text: simMessage, telegramId: Math.floor(Math.random() * 999_999) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSimMessage("");
        fetchTickets();
      } else {
        alert("Error ingesting: " + data.error);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
      alert("Failed to reach ingestion API. Make sure the backend server is running.");
    }
    setIsSimulating(false);
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    setBackfillStatus(null);
    setBackfillProgress(null);
    try {
      const res  = await apiFetch("/api/backfill", {
        method: "POST",
        body: JSON.stringify({ limit: backfillLimit, days: backfillDays, minUrgency: backfillMinUrgency }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackfillStatus({ message: data.message || `Backfill started.`, isError: false });
        // Poll progress every 2 seconds
        if (backfillPollRef.current) clearInterval(backfillPollRef.current);
        backfillPollRef.current = setInterval(async () => {
          try {
            const pr = await apiFetch("/api/backfill/progress");
            const pd = await pr.json();
            setBackfillProgress(pd);
            if (!pd.running) {
              clearInterval(backfillPollRef.current!);
              backfillPollRef.current = null;
              setIsBackfilling(false);
              fetchTickets();
              setBackfillStatus({ message: `✅ Done: ${pd.ingested} classified, ${pd.skipped} skipped out of ${pd.total}`, isError: false });
            }
          } catch { /* silent */ }
        }, 2000);
      } else {
        setBackfillStatus({ message: "Error during backfill: " + data.error, isError: true });
        setIsBackfilling(false);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
      setBackfillStatus({ message: "Failed to reach backfill API.", isError: true });
      setIsBackfilling(false);
    }
  };

  // -- Run AI accuracy benchmark ----------------------------------------------
  const runBenchmark = async (customMessages?: any[]) => {
    setEvalLoading(true);
    setEvalResults(null);
    setShowBenchmark(true);
    try {
      const options: RequestInit = {};
      if (customMessages) {
        options.method = "POST";
        options.body = JSON.stringify({ messages: customMessages });
      }
      const res  = await apiFetch("/api/eval", options);
      const data = await res.json();
      setEvalResults(data);
    } catch (e: any) {
      setEvalResults({ error: e.message });
    }
    setEvalLoading(false);
  };

  const runLiveTest = async () => {
    if (!testMessageText.trim()) return;
    setTestMessageLoading(true);
    setTestMessageResult(null);
    setTestMessageError("");
    try {
      const res = await apiFetch("/api/test-message", {
        method: "POST",
        body: JSON.stringify({ text: testMessageText }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to test message");
      setTestMessageResult(data.classification);
    } catch (e: any) {
      setTestMessageError(e.message);
    } finally {
      setTestMessageLoading(false);
    }
  };

  const handleBenchmarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("JSON must be an array of messages");
        await runBenchmark(parsed);
      } catch (err: any) {
        alert("Invalid JSON file: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // -- Training-loop verification (Milestone 4) -------------------------------
  const pollVerify = useCallback(async () => {
    try {
      const res = await apiFetch("/api/verify/progress");
      setVerifyState(await res.json());
    } catch { /* silent */ }
  }, [apiFetch]);

  const runVerify = async () => {
    setVerifyStarting(true);
    try {
      const res = await apiFetch("/api/verify", { method: "POST", body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) {
        setVerifyState({ running: false, error: data.error || "Failed to start verification", results: [], summary: null });
      } else {
        setVerifyState({ running: true, total: data.total, done: 0, results: [], summary: null, error: null });
      }
    } catch (e: any) {
      if (e?.message !== "Unauthorized") setVerifyState({ running: false, error: e.message, results: [], summary: null });
    }
    setVerifyStarting(false);
  };

  // Load the last verification result when the modal opens; keep polling
  // every 2s while a run is active so the progress bar moves.
  useEffect(() => {
    if (!showBenchmark || IS_TRAIN_ROUTE) return;
    pollVerify();
  }, [showBenchmark, pollVerify]);
  useEffect(() => {
    if (!showBenchmark || !verifyState?.running) return;
    const iv = setInterval(pollVerify, 2000);
    return () => clearInterval(iv);
  }, [showBenchmark, verifyState?.running, pollVerify]);

  // -------------------------------------------------------------------------
  // RENDER: Login Screen
  // -------------------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#05070a] flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none" />
        <form onSubmit={handleLogin} className="bg-white/5 p-8 rounded-2xl backdrop-blur-xl border border-white/10 max-w-sm w-full relative z-10 flex flex-col items-center">
          <div className="mb-6 flex justify-center w-full">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-6 text-center w-full">Secure Access Required</h1>
          <div className="w-full space-y-4">
            <input
              id="password-input"
              type="password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="Access Key"
              autoComplete="current-password"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center tracking-widest font-mono"
            />
            {authError && <div className="text-rose-400 text-xs text-center">{authError}</div>}
            <button
              id="login-button"
              type="submit"
              disabled={authLoading || !passwordInput.trim()}
              className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg px-4 py-3 text-sm transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {authLoading ? "Verifying..." : "Unlock Dashboard"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: Training view (/train) — separate from the main dashboard
  // -------------------------------------------------------------------------
  if (IS_TRAIN_ROUTE) {
    return <TrainView apiFetch={apiFetch} />;
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------
  const ticketsToday    = globalStats?.ticketsTodayCount || 0;
  const openCount       = globalStats?.openCount || 0;
  const activeCount     = globalStats?.activeCount || 0;
  const inReviewCount   = globalStats?.inReviewCount || 0;
  const escalatedCount  = globalStats?.escalatedCount || 0;
  const awaitingUserCount = globalStats?.awaitingUserCount || 0;
  const avgResponseMs   = globalStats?.avgResponseMs ?? null;
  const resolvedTodayCount = globalStats?.resolvedTodayCount || 0;
  const resolvedCount   = globalStats?.resolvedCount || 0;
  const totalIssues     = globalStats ? (globalStats.criticalCount + globalStats.highCount + globalStats.mediumCount + globalStats.lowCount) : 0;
  const urgencyCount    = globalStats ? (
    urgencyFilter === "All" ? (globalStats.criticalCount + globalStats.highCount + globalStats.mediumCount + globalStats.lowCount) :
    urgencyFilter === "High" ? globalStats.highCount :
    urgencyFilter === "Medium" ? globalStats.mediumCount :
    urgencyFilter === "Low" ? globalStats.lowCount : 
    urgencyFilter === "Critical" ? globalStats.criticalCount : 0
  ) : 0;
  const resolutionRate  = globalStats?.resolutionRate || 0;

  // Avg Response Time is null when no ticket has a first admin reply yet
  // (legacy tickets never get one — no fabricated timestamps).
  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—";
    const mins = ms / 60_000;
    if (mins < 1) return "<1m";
    if (mins < 60) return `${Math.round(mins)}m`;
    const hours = mins / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const getKpiTitle = (baseTitle: string) => {
    const parts = [];
    if (filterCategory !== "All") parts.push(filterCategory);
    else if (urgencyFilter !== "All") parts.push(urgencyFilter);
    
    if (parts.length > 0) return `${parts.join(" ")} ${baseTitle}`;
    return baseTitle;
  };

  // -- Chart Data -------------------------------------------------------------
  let maxDays = filterDays === "All" ? 30 : filterDays === "Custom" ? 30 : parseInt(filterDays);
  let refDate = new Date();
  if (filterDays === "Custom" && filterStartDate && filterEndDate) {
    const startD = parseISO(filterStartDate);
    const endD   = parseISO(filterEndDate);
    if (!isNaN(startD.getTime()) && !isNaN(endD.getTime()) && startD <= endD) {
      maxDays = Math.min(Math.ceil(Math.abs(endD.getTime() - startD.getTime()) / 86_400_000) + 1, 60);
      refDate = endD;
    }
  }
  const volumeData = Array.from({ length: maxDays }).map((_, i) => {
    const d       = subDays(refDate, (maxDays - 1) - i);
    const dateStr = format(d, "MMM dd");
    const rawData = globalStats?.rawStatsData || [];
    return { 
      date: dateStr, 
      tickets: rawData.filter((t: any) => {
        if (!t.created_at) return false;
        try {
          const parsed = parseISO(t.created_at);
          if (isNaN(parsed.getTime())) return false;
          return format(parsed, "MMM dd") === dateStr;
        } catch {
          return false;
        }
      }).length 
    };
  });

  const categoryData = globalStats?.categoryCount ? Object.entries(globalStats.categoryCount).map(([name, value]) => ({ name, value })) : [];
  const resolutionData = globalStats?.resolutionData || [];

  const totalPages      = Math.ceil(totalTickets / itemsPerPage);
  const paginatedTickets = filteredTickets;  // server already paginates

  // -------------------------------------------------------------------------
  // RENDER: Dashboard
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#05070a] text-white font-sans overflow-auto flex flex-col relative pb-12">
      {/* Toast Notification */}
      <div className={`fixed top-4 right-4 z-50 transform transition-all duration-300 ${notification.visible ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0 pointer-events-none"}`}>
        <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md border ${notification.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-indigo-500/10 border-indigo-500/20 text-indigo-400"}`}>
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{notification.message}</span>
        </div>
      </div>

      {/* Feature 5: Demo Mode Banner */}
      {isDemoMode && demoModeBanner && (
        <div className="relative z-20 bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4" />
            <span>DEMO MODE - You are viewing sample data. Set <code className="font-mono bg-amber-500/10 px-1 rounded">DEMO_MODE=false</code> to use live data.</span>
          </div>
          <button onClick={() => setDemoModeBanner(false)} className="text-amber-400 hover:text-amber-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="fixed top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Top Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">QUIDAX PULSEDESK</h1>
            <p className="text-[10px] text-indigo-300 font-mono tracking-widest uppercase">Powered by SPICED Values</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <select
              className="bg-transparent text-sm cursor-pointer outline-none text-white appearance-none font-medium [&>option]:text-black"
              value={selectedCommunity}
              onChange={e => setSelectedCommunity(e.target.value)}
            >
              {communities.length === 0 && <option value="">Loading communities...</option>}
              {communities.map(c => <option key={c.telegram_group_id} value={c.telegram_group_id}>{c.display_name}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-white/40 pointer-events-none" />
          </div>
          <button
            id="open-benchmark"
            onClick={() => setShowBenchmark(true)}
            title="AI Accuracy Benchmark"
            className="bg-white/5 border border-white/10 px-3 py-2 rounded-xl backdrop-blur-md hover:bg-indigo-500/10 hover:border-indigo-500/30 transition text-[10px] font-bold text-white/50 hover:text-indigo-300 uppercase tracking-widest flex items-center gap-1.5"
          >
            🎯 Benchmark
          </button>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="bg-white/5 border border-white/10 p-2 rounded-full backdrop-blur-md hover:bg-white/10 transition"
          >
            <User className="w-5 h-5 text-white/60" />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-12 flex justify-center relative z-10"><div className="animate-spin text-indigo-500"><RefreshCcw /></div></div>
      ) : (
        <React.Fragment>
        <main className="max-w-7xl mx-auto px-6 space-y-6 w-full relative z-10">

          {/* Simulator / Actions */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-5 mb-6">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Test Integration (Simulation)</h2>
              <div className="flex items-center space-x-2">
                <select value={backfillDays} onChange={e => setBackfillDays(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] uppercase font-bold text-white outline-none [&>option]:text-black focus:ring-1 focus:ring-indigo-500"
                  disabled={isBackfilling}
                >
                  <option value={1}>Last 24 Hours</option>
                  <option value={3}>Last 3 Days</option>
                  <option value={7}>Last 7 Days</option>
                  <option value={14}>Last 14 Days</option>
                  <option value={30}>Last 30 Days</option>
                </select>
                <select value={backfillLimit} onChange={e => setBackfillLimit(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] uppercase font-bold text-white outline-none [&>option]:text-black focus:ring-1 focus:ring-indigo-500"
                  disabled={isBackfilling}
                >
                  <option value={20}>Max 20</option>
                  <option value={50}>Max 50</option>
                  <option value={100}>Max 100</option>
                  <option value={500}>Max 500</option>
                </select>
                <button onClick={handleBackfill} disabled={isBackfilling}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 transition rounded text-[10px] font-bold uppercase disabled:opacity-50 flex items-center"
                >
                  {isBackfilling ? <RefreshCcw className="w-3 h-3 animate-spin mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                  Sync History Data
                </button>
                <div title="System listens live and background syncs every 15m automatically"
                  className="flex items-center space-x-1.5 ml-2 text-[10px] font-bold uppercase text-emerald-400 border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 rounded cursor-help"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Live Auto-Sync Active</span>
                </div>
              </div>
            </div>
            <div className="flex space-x-3 mb-3">
              <input
                type="text"
                value={simMessage}
                onChange={e => setSimMessage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && simulateIngestion()}
                placeholder="Simulate a customer message (e.g. 'My withdrawal is stuck for 3 hours!')"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-md transition-all"
              />
              <button onClick={simulateIngestion} disabled={isSimulating || !simMessage.trim()}
                className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-6 py-2 text-sm font-medium flex items-center transition shadow-lg shadow-indigo-500/20 border border-indigo-400/20"
              >
                {isSimulating ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" />Classify</>}
              </button>
            </div>
            {backfillStatus && (
              <div className={`p-3 mt-4 rounded-lg text-sm flex items-center ${backfillStatus.isError ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                {backfillStatus.isError ? <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> : <RefreshCcw className={`w-4 h-4 mr-2 flex-shrink-0 ${isBackfilling ? "animate-spin" : ""}`} />}
                {backfillStatus.message}
              </div>
            )}
            {/* Live backfill progress bar - show as soon as backfill is running */}
            {backfillProgress && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-white/50">
                  <span className={backfillProgress.running ? "text-indigo-400" : "text-emerald-400"}>
                    {backfillProgress.running ? `[WAIT] Processing... (${backfillProgress.done}/${backfillProgress.total})` : `✅ Complete`}
                  </span>
                  <span>
                    {backfillProgress.ingested} classified &nbsp;-&nbsp; {backfillProgress.skipped} skipped out of {backfillProgress.total}
                  </span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${backfillProgress.running ? "bg-indigo-500" : "bg-emerald-500"}`}
                    style={{ width: backfillProgress.total > 0 ? `${Math.round((backfillProgress.done / backfillProgress.total) * 100)}%` : "5%" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Feature 7: Urgency Filter Pills - Low is opt-in (hidden by default in Issues Only mode) */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            {(["All", "Critical", "High", "Medium", "Low"] as const).map(level => (
              <button
                key={level}
                id={`urgency-filter-${level.toLowerCase()}`}
                onClick={() => setUrgencyFilter(level)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  urgencyFilter === level
                    ? level === "Critical" ? "bg-red-600 text-white"
                    : level === "High"     ? "bg-orange-500 text-white"
                    : level === "Medium"   ? "bg-yellow-500 text-black"
                    : level === "Low"      ? "bg-blue-500 text-white"
                    : "bg-white text-black"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {level === "Critical" ? <span className="inline-block w-2 h-2 rounded-full mr-1.5 bg-red-500" /> : level === "High" ? <span className="inline-block w-2 h-2 rounded-full mr-1.5 bg-orange-500" /> : level === "Medium" ? <span className="inline-block w-2 h-2 rounded-full mr-1.5 bg-yellow-500" /> : level === "Low" ? <span className="inline-block w-2 h-2 rounded-full mr-1.5 bg-blue-500" /> : null}
                {level}
              </button>
            ))}
          </div>


          {/* Filters Row */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-4 flex flex-wrap gap-4 items-center mb-6">
            <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mr-2">Filters</h2>
            <div className="flex-1 min-w-[200px]">
              <input type="text" placeholder="Search tickets..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-500/50 transition-colors placeholder:text-white/30"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10 items-center">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterDays} onChange={e => setFilterDays(e.target.value)}>
                <option value="All">All Time</option>
                <option value="1">Last 24h</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="Custom">Custom Range</option>
              </select>
              {filterDays === "Custom" && (
                <div className="flex items-center space-x-2 ml-2 px-2 border-l border-white/10">
                  <input type="date" className="bg-transparent text-sm text-white/80 outline-none appearance-none cursor-pointer [color-scheme:dark]" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} />
                  <span className="text-white/40 text-xs">to</span>
                  <input type="date" className="bg-transparent text-sm text-white/80 outline-none appearance-none cursor-pointer [color-scheme:dark]" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Classifying">Classifying</option>
                <option value="Open">Open</option>
                <option value="In Review">In Review</option>
                <option value="Escalated">Escalated</option>
                <option value="Awaiting User">Awaiting User</option>
                <option value="Resolved">Resolved</option>
                <option value="Dismissed">Dismissed</option>
              </select>
            </div>

            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="All">All Categories</option>
                {Array.from(new Set(tickets.map(t => t.category))).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            {(filterDays !== "All" || filterStatus !== "All" || filterCategory !== "All" || filterStartDate || filterEndDate || searchQuery || urgencyFilter !== "All") && (
              <button
                onClick={() => {
                  setFilterDays("All"); setFilterStatus("All"); 
                  setFilterCategory("All"); setFilterStartDate(""); setFilterEndDate("");
                  setSearchQuery(""); setUrgencyFilter("All");
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 ml-auto transition"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-6">
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-rose-400 font-semibold truncate" title={getKpiTitle("Active Issues")}>
                  {getKpiTitle("Active Issues")}
                </p>
                <AlertTriangle className={`w-5 h-5 shrink-0 ml-2 ${activeCount > 0 ? "text-rose-500" : "text-rose-500/40"}`} />
              </div>
              <div className="flex items-end justify-between w-full">
                <span className={`text-4xl font-bold ${activeCount > 0 ? "text-rose-500" : "text-rose-500/80"}`}>{activeCount}</span>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold truncate" title={getKpiTitle("In Review")}>
                  {getKpiTitle("In Review")}
                </p>
              </div>
              <div className="flex items-end justify-between w-full">
                <span className={`text-4xl font-bold ${inReviewCount > 0 ? "text-amber-500" : "text-amber-500/80"}`}>{inReviewCount}</span>
              </div>
              <p className="text-[11px] text-white/40 mt-2 truncate">
                {escalatedCount} escalated · {awaitingUserCount} awaiting user
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold truncate" title={getKpiTitle(filterDays === "1" ? "Resolved Today" : filterDays === "All" ? "Resolved All Time" : `Resolved (Last ${filterDays} Days)`)}>
                  {getKpiTitle(filterDays === "1" ? "Resolved Today" : filterDays === "All" ? "Resolved All Time" : `Resolved (Last ${filterDays} Days)`)}
                </p>
              </div>
              <div className="flex items-end justify-between w-full">
                <span className={`text-4xl font-bold ${(filterDays === "1" ? resolvedTodayCount : resolvedCount) > 0 ? "text-emerald-500" : "text-emerald-500/80"}`}>
                  {filterDays === "1" ? resolvedTodayCount : resolvedCount}
                </span>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col justify-between">
              <p className="text-xs uppercase tracking-wider text-white/40 mb-2 font-semibold">Resolution Rate</p>
              <div className="flex items-end justify-between w-full">
                <span className="text-4xl font-bold">{resolutionRate}%</span>
                <div className="w-24 h-2 bg-white/10 rounded-full mb-2">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${resolutionRate}%` }} />
                </div>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col justify-between">
              <p className="text-xs uppercase tracking-wider text-sky-400 mb-2 font-semibold truncate" title={getKpiTitle("Avg Response Time")}>
                {getKpiTitle("Avg Response Time")}
              </p>
              <div className="flex items-end justify-between w-full">
                <span className={`text-4xl font-bold ${avgResponseMs !== null ? "text-sky-400" : "text-white/30"}`}>{formatDuration(avgResponseMs)}</span>
              </div>
              <p className="text-[11px] text-white/40 mt-2 truncate">
                {avgResponseMs !== null ? "first admin reply, tracked tickets" : "no tracked replies yet"}
              </p>
            </div>
          </div>

          {/* Charts */}
          <ErrorBoundary>
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col md:col-span-2 min-h-[250px]">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-base font-semibold text-white/90">Issue Volume ({filterDays === "All" ? "30 Days (Max)" : filterDays === "Custom" ? "Custom Range" : `${filterDays} Days`})</h3>
                  </div>
                  <div className="flex-1 w-full relative h-[200px]">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                      <LineChart data={volumeData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: "bold" }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(5, 7, 10, 0.8)", backdropFilter: "blur(12px)", color: "#fff" }} itemStyle={{ color: "#fff" }} />
                        <Line type="monotone" dataKey="tickets" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "#05070a", stroke: "#6366f1" }} activeDot={{ r: 6, fill: "#6366f1", stroke: "#fff" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col min-h-[250px]">
                  <h3 className="text-base font-semibold text-white/90 mb-4">Resolution Comparison</h3>
                  <div className="flex-1 flex flex-col items-center justify-center">
                    {filteredTickets.length === 0 ? (
                      <div className="text-white/40 text-sm">No data yet</div>
                    ) : (
                      <div className="flex flex-col w-full h-full items-center">
                        <div className="w-full h-[140px] mb-4">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <PieChart>
                              <Pie data={resolutionData} cx="50%" cy="50%" innerRadius={0} outerRadius={65} dataKey="value" stroke="rgba(0,0,0,0)">
                                <Cell fill="#10b981" />
                                <Cell fill="#6366f1" />
                              </Pie>
                              <Tooltip formatter={(value: number) => [`${value} tickets`, "Count"]} contentStyle={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(5, 7, 10, 0.8)", backdropFilter: "blur(12px)", color: "#fff", fontSize: "12px" }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="w-full flex justify-center space-x-6">
                          <div className="flex items-center"><span className="w-3 h-3 rounded-full shrink-0 bg-emerald-500 mr-2" /><span className="text-sm text-white/80 mr-2">Resolved</span><span className="text-sm font-bold text-white shrink-0">{resolutionData[0]?.value || 0}</span></div>
                          <div className="flex items-center"><span className="w-3 h-3 rounded-full shrink-0 bg-indigo-500 mr-2" /><span className="text-sm text-white/80 mr-2">Active</span><span className="text-sm font-bold text-white shrink-0">{resolutionData[1]?.value || 0}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl flex flex-col">
                <h3 className="text-base font-semibold text-white/90 mb-4">Category Breakdown</h3>
                <div className="flex-1 flex flex-col items-center justify-center">
                  {filteredTickets.length === 0 ? (
                    <div className="text-white/40 text-sm">No data yet</div>
                  ) : (
                    <div className="flex flex-col md:flex-row w-full h-full items-center">
                      <div className="w-full md:w-1/3 h-[180px] mb-4 md:mb-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                          <PieChart>
                            <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value" stroke="rgba(0,0,0,0)">
                              {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} onClick={() => handleCategoryClick(entry.name)} className="cursor-pointer hover:opacity-80 transition-opacity" />)}
                            </Pie>
                            <Tooltip formatter={(value: number) => [`${value} tickets`, "Count"]} contentStyle={{ borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", backgroundColor: "rgba(5, 7, 10, 0.8)", backdropFilter: "blur(12px)", color: "#fff", fontSize: "12px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-full md:w-2/3 grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 pl-4">
                        {categoryData.sort((a, b) => (Number(b.value) - Number(a.value))).map((entry, index) => (
                          <div key={entry.name} onClick={() => handleCategoryClick(entry.name)} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg border border-white/5 cursor-pointer hover:bg-white/10 transition-colors">
                            <div className="flex items-center space-x-2 truncate min-w-0">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              <span className="text-sm text-white/80 truncate" title={entry.name}>{entry.name}</span>
                            </div>
                            <span className="text-sm font-bold text-white shrink-0 ml-2">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ErrorBoundary>

          {/* Ticket Feed */}
          <div id="ticket-feed" className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl flex flex-col min-h-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-transparent">
              <h3 className="text-sm font-semibold text-white/80">Real-time Stream</h3>
              <div className="flex items-center gap-2">
                {/* Issues-Only toggle */}
                <button
                  id="toggle-issues-only"
                  onClick={() => { setShowIssuesOnly(v => !v); setCurrentPage(1); }}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                    showIssuesOnly
                      ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30"
                      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                  }`}
                  title={showIssuesOnly ? "Showing issues only - click to show ALL messages including general chat" : "Showing ALL messages - click to show issues only"}
                >
                  {showIssuesOnly ? (
                    <><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />Issues Only<span className="opacity-50 font-normal normal-case">({totalTickets})</span></>
                  ) : (
                    <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />All Messages<span className="opacity-50 font-normal normal-case">({totalTickets})</span></>
                  )}
                </button>
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 pulse-animation shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Listening
                </span>
              </div>
            </div>

            <ErrorBoundary>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 text-[10px] text-white/30 uppercase tracking-widest">
                      <th className="font-medium px-5 py-3">Status</th>
                      <th className="font-medium px-5 py-3">Urgency</th>
                      <th className="font-medium px-5 py-3">Summary</th>
                      <th className="font-medium px-5 py-3">Category</th>
                      <th className="font-medium px-5 py-3 text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {paginatedTickets.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">No tickets found.</td></tr>
                    ) : (
                      paginatedTickets.map(ticket => (
                        <React.Fragment key={ticket.id}>
                          <tr
                            className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition ${ticket.urgency === "Critical" ? "bg-rose-500/5" : ""}`}
                            onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                          >
                            <td className="px-5 py-4">
                              {ticket.status === "Classifying" ? (
                                <span className="text-[10px] uppercase font-bold tracking-widest rounded px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-flex items-center">
                                  <RefreshCcw className="w-3 h-3 mr-1 animate-spin" /> Classifying
                                </span>
                              ) : (
                                <select
                                  className={`text-[10px] uppercase font-bold tracking-widest rounded px-2 py-1 outline-none border border-white/10 appearance-none [&>option]:text-black ${
                                    ticket.status === "Open"          ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                                    ticket.status === "Escalated"     ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                    ticket.status === "Awaiting User" ? "bg-sky-500/10 text-sky-400 border-sky-500/20" :
                                    ticket.status === "Resolved"      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                    ticket.status === "Dismissed"     ? "bg-white/5 text-white/40 border-white/10" :
                                    "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  }`}
                                  value={ticket.status}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => handleUpdateStatus(ticket.id, e.target.value)}
                                >
                                  <option value="Open">Open</option>
                                  <option value="In Review">In Review</option>
                                  <option value="Escalated">Escalated</option>
                                  <option value="Awaiting User">Awaiting User</option>
                                  <option value="Resolved">Resolved</option>
                                  <option value="Dismissed">Dismissed</option>
                                </select>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-[10px] px-2 py-0.5 rounded text-white font-bold uppercase ${URGENCY_COLORS[ticket.urgency] || "bg-white/20"}`}>{ticket.urgency}</span>
                            </td>
                            <td className="px-5 py-4 font-medium text-white/90">
                              <div className="flex items-center gap-2">
                                <span>{ticket.summary}</span>
                                {(() => {
                                  let link = ticket.telegram_deep_link;
                                  if (!link && ticket.group_id && ticket.telegram_message_id && ticket.telegram_message_id !== "null") {
                                    link = `https://t.me/${ticket.group_id.replace("@", "")}/${ticket.telegram_message_id}`;
                                  }
                                  return link ? (
                                    <a
                                      href={link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      title="View original message in Telegram"
                                      style={{ color: "#2AABEE" }}
                                      className="flex-shrink-0 hover:opacity-70 transition ml-2"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  ) : null;
                                })()}
                                {expandedTicketId === ticket.id ? <ChevronUp className="w-4 h-4 ml-1 text-white/40" /> : <ChevronDown className="w-4 h-4 ml-1 text-white/40" />}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-white/60">{ticket.category}</td>
                            <td className="px-5 py-4 text-right text-white/40 whitespace-nowrap font-mono text-[10px]">{formatTicketDate(ticket.created_at)}</td>
                          </tr>

                          {/* Expanded Details */}
                          {expandedTicketId === ticket.id && (
                            <tr className="bg-black/20 border-b border-white/5">
                              <td colSpan={5} className="px-5 py-5">
                                <ErrorBoundary>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Left col: original message */}
                                    <div>
                                      {(() => {
                                        const raw = ticket.raw_text || "";
                                        
                                        // The original message ends when the first tag starts
                                        const firstTagIndex = raw.search(/\[(ADMIN_REPLY|USER_REPLY)/);
                                        const originalMsg = firstTagIndex !== -1 ? raw.substring(0, firstTagIndex).trim() : raw.trim();
                                        
                                        // Extract thread replies
                                        const replies = [];
                                        const matches = [...raw.matchAll(/\[(ADMIN_REPLY|USER_REPLY(?: [^\]]+)?)\]([\s\S]*?)\[\/(?:ADMIN_REPLY|USER_REPLY)\]/g)];
                                        matches.forEach(m => {
                                          const tag = m[1];
                                          const content = m[2].trim();
                                          if (tag.startsWith("USER_REPLY")) {
                                            const labelMatch = tag.match(/USER_REPLY \((.*?)\)/);
                                            replies.push({ type: 'user', content, label: labelMatch ? labelMatch[1] : 'User Reply' });
                                          } else {
                                            replies.push({ type: 'admin', content, label: 'Admin Reply' });
                                          }
                                        });

                                        return (
                                          <div className="space-y-4">
                                            <div>
                                              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center justify-between">
                                                {ticket.is_admin_message ? (
                                                  <span className="text-emerald-400">Admin Message</span>
                                                ) : (
                                                  <span className="text-white/30">Customer's Original Message</span>
                                                )}
                                              </div>
                                              <div className={`p-4 rounded-xl text-sm leading-relaxed whitespace-pre-wrap border font-mono ${ticket.is_admin_message ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' : 'bg-white/5 border-white/5 text-white/80'}`}>
                                                {originalMsg}
                                              </div>
                                              
                                              {(() => {
                                                let link = ticket.telegram_deep_link;
                                                if (!link && ticket.group_id && ticket.telegram_message_id && ticket.telegram_message_id !== "null") {
                                                  link = `https://t.me/${ticket.group_id.replace("@", "")}/${ticket.telegram_message_id}`;
                                                }
                                                return link ? (
                                                <a
                                                  href={link}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  style={{ color: "#2AABEE" }}
                                                  className="mt-3 inline-flex items-center gap-1.5 text-xs hover:opacity-80 transition font-medium"
                                                >
                                                  <ExternalLink className="w-3 h-3" />
                                                  View Original Message in Telegram
                                                </a>
                                              ) : null;
                                              })()}
                                            </div>

                                            {replies.length > 0 && (
                                              <div>
                                                <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2 flex items-center">
                                                  <CheckCircle className="w-3 h-3 mr-1" /> Conversation Thread
                                                </div>
                                                <div className="space-y-4 pt-2">
                                                  {replies.map((reply, idx) => (
                                                    <div key={idx} className={`flex w-full ${reply.type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                                      <div className={`max-w-[85%] p-3 rounded-2xl border text-sm whitespace-pre-wrap ${reply.type === 'admin' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100 rounded-tr-sm' : 'bg-blue-500/10 border-blue-500/20 text-blue-100 rounded-tl-sm'}`}>
                                                        <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 opacity-80 ${reply.type === 'admin' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                          {reply.label}
                                                        </div>
                                                        {reply.content}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Right col: actions */}
                                    <div className="space-y-4">
                                      <div>
                                        <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">AI Suggested Action</div>
                                        <div className="text-sm font-medium text-indigo-300 bg-indigo-500/10 py-2.5 px-4 rounded-xl inline-block border border-indigo-500/20">
                                          {ticket.suggested_action}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                          <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Product Area</div>
                                          <div className="text-sm text-white/90 font-medium">{ticket.product_area}</div>
                                        </div>
                                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                                          <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Customer Sentiment</div>
                                          <div className="text-sm text-white/90 font-medium">{ticket.sentiment}</div>
                                        </div>

                                        {/* Gemini suggested reply - only show when the AI generated one */}
                                        {ticket.suggested_reply && (
                                          <div className="col-span-2 mt-2">
                                            <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                                              AI Suggested Reply
                                            </div>
                                            <div className="relative group">
                                              <textarea
                                                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white/90 leading-relaxed outline-none focus:border-indigo-500/50 resize-none min-h-[100px]"
                                                defaultValue={ticket.suggested_reply}
                                              />
                                              <button
                                                className="absolute top-3 right-3 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] px-3 py-1.5 rounded uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={e => {
                                                  const ta = e.currentTarget.previousSibling as HTMLTextAreaElement;
                                                  navigator.clipboard.writeText(ta.value);
                                                  showNotification("Reply copied to clipboard!", "success");
                                                }}
                                              >
                                                Copy
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* Action buttons */}
                                        <div className="col-span-2 mt-2 space-y-2">
                                          <a
                                            href={encodeURI(`mailto:support@quidax.com?subject=Escalated [${ticket.urgency}] Support Ticket: ${ticket.category}`)}
                                            target="_blank" rel="noopener noreferrer"
                                            className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm transition"
                                          >
                                            <Send className="w-4 h-4 mr-2" /> Email Support
                                          </a>

                                          <div className="flex space-x-2">
                                            <button
                                              onClick={() => handleUpdateStatus(ticket.id, "Resolved")}
                                              className="flex-1 flex items-center justify-center py-2 px-4 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-medium text-sm transition border border-emerald-500/20"
                                            >
                                              <CheckCircle className="w-4 h-4 mr-2" /> Mark Resolved
                                            </button>

                                            {/* Feature 4: Jira button - only on Critical/High without existing Jira key */}
                                            {(ticket.urgency === "Critical" || ticket.urgency === "High") && !ticket.jira_issue_key && (
                                              <button
                                                id={`jira-btn-${ticket.id}`}
                                                onClick={() => handleCreateJiraTicket(ticket.id)}
                                                disabled={jiraLoading[ticket.id]}
                                                className="flex-1 flex items-center justify-center py-2 px-4 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-medium text-sm transition border border-blue-500/20 disabled:opacity-50"
                                              >
                                                {jiraLoading[ticket.id] ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                                                Create Jira Ticket
                                              </button>
                                            )}

                                            {ticket.jira_issue_key && ticket.jira_issue_url && (
                                              <a
                                                href={ticket.jira_issue_url}
                                                target="_blank" rel="noopener noreferrer"
                                                className="flex-1 flex items-center justify-center py-2 px-4 rounded-lg bg-blue-500/10 text-blue-400 font-medium text-sm border border-blue-500/20"
                                              >
                                                <ExternalLink className="w-4 h-4 mr-2" /> {ticket.jira_issue_key}
                                              </a>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </ErrorBoundary>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-5 py-4 flex items-center justify-between border-t border-white/5 pb-6">
                    <div className="text-[10px] uppercase font-bold text-white/40 tracking-widest">
                      Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalTickets)} of {totalTickets} messages
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">Rows per page:</span>
                        <select
                          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none [&>option]:text-black"
                          value={itemsPerPage}
                          onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={30}>30</option>
                          <option value={50}>50</option>
                        </select>
                      </div>
                      <div className="flex space-x-2">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                          className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-xs disabled:opacity-50 transition font-medium">Prev</button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                          className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-xs disabled:opacity-50 transition font-medium">Next</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ErrorBoundary>
          </div>
        </main>

        {/* -- Benchmark Panel -- */}
        {showBenchmark && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0d1117] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
              {/* Header */}
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">🎯 AI Classifier Accuracy Benchmark & Sandbox</h2>
                  <p className="text-xs text-white/40 mt-0.5">Test individual messages or evaluate 20 gold-standard labeled cases</p>
                </div>
                <button onClick={() => setShowBenchmark(false)} className="text-white/40 hover:text-white transition p-1 rounded-lg hover:bg-white/10">x</button>
              </div>

              <div className="overflow-y-auto flex-1 p-6">
                {/* Live Sandbox Section */}
                <div className="mb-8 bg-white/5 border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-white mb-2">Live Testing Sandbox</h3>
                  <p className="text-xs text-white/50 mb-4">Type any message to see how the AI categorizes it instantly.</p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50"
                      placeholder="e.g. I can't withdraw my crypto..."
                      value={testMessageText}
                      onChange={e => setTestMessageText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") runLiveTest() }}
                      disabled={testMessageLoading}
                    />
                    <button
                      onClick={runLiveTest}
                      disabled={testMessageLoading || !testMessageText.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm transition whitespace-nowrap"
                    >
                      {testMessageLoading ? "Testing..." : "Test Message"}
                    </button>
                  </div>
                  {testMessageError && (
                    <div className="mt-3 text-rose-400 text-xs">{testMessageError}</div>
                  )}
                  {testMessageResult && !testMessageError && (
                    <div className="mt-4 bg-black/30 rounded-lg p-4 border border-white/5 flex gap-6">
                      <div>
                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Predicted Category</div>
                        <div className="text-sm font-medium text-indigo-400">{testMessageResult.category}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Predicted Urgency</div>
                        <div className={`text-sm font-medium ${testMessageResult.urgency === 'Critical' ? 'text-rose-400' : testMessageResult.urgency === 'High' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {testMessageResult.urgency}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Sentiment</div>
                        <div className="text-sm font-medium text-white/70">{testMessageResult.sentiment}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <h3 className="text-sm font-bold text-white">Batch Evaluation</h3>
                  <div className="h-px bg-white/10 flex-1"></div>
                </div>
                {evalLoading && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-white/50 text-sm">Running 20 test messages through AI classifier...</p>
                    <p className="text-white/30 text-xs">This takes ~30 seconds</p>
                  </div>
                )}

                {evalResults?.error && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-rose-400 text-sm">{evalResults.error}</div>
                )}

                {evalResults && !evalResults.error && (
                  <>
                    {/* Score Cards */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      {[
                        { label: "Category Accuracy", value: evalResults.categoryAccuracy, color: evalResults.categoryAccuracy >= 80 ? "emerald" : evalResults.categoryAccuracy >= 60 ? "amber" : "rose" },
                        { label: "Urgency Accuracy",  value: evalResults.urgencyAccuracy,  color: evalResults.urgencyAccuracy  >= 80 ? "emerald" : evalResults.urgencyAccuracy  >= 60 ? "amber" : "rose" },
                        { label: "Overall (Both)",    value: evalResults.overallAccuracy,   color: evalResults.overallAccuracy   >= 70 ? "emerald" : evalResults.overallAccuracy   >= 50 ? "amber" : "rose" },
                      ].map(s => (
                        <div key={s.label} className={`bg-${s.color}-500/10 border border-${s.color}-500/20 rounded-xl p-5 text-center`}>
                          <div className={`text-4xl font-black text-${s.color}-400`}>{s.value}%</div>
                          <div className="text-xs text-white/50 mt-2 uppercase tracking-widest font-semibold">{s.label}</div>
                          <div className={`text-xs mt-1 text-${s.color}-400/70`}>
                            {s.value >= 80 ? "✅ Excellent" : s.value >= 60 ? "⚠️ Acceptable" : "❌ Needs tuning"}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Results Table */}
                    <div className="rounded-xl border border-white/10 overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5 text-[10px] text-white/30 uppercase tracking-widest">
                            <th className="px-4 py-3">Message</th>
                            <th className="px-4 py-3">Expected</th>
                            <th className="px-4 py-3">Predicted</th>
                            <th className="px-4 py-3 text-center">Cat v</th>
                            <th className="px-4 py-3 text-center">Urg v</th>
                          </tr>
                        </thead>
                        <tbody>
                          {evalResults.results?.map((r: any, i: number) => (
                            <tr key={i} className={`border-b border-white/5 ${r.correct ? "bg-emerald-500/3" : "bg-rose-500/3"}`}>
                              <td className="px-4 py-2.5 text-white/60 max-w-[220px] truncate">{r.text}</td>
                              <td className="px-4 py-2.5">
                                <div className="text-white/80 font-medium">{r.expectedCategory}</div>
                                <div className="text-white/30">{r.expectedUrgency}</div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className={r.categoryMatch ? "text-emerald-400" : "text-rose-400"}>{r.predictedCategory}</div>
                                <div className={r.urgencyMatch  ? "text-emerald-400/70" : "text-rose-400/70 text-[10px]"}>{r.predictedUrgency}</div>
                              </td>
                              <td className="px-4 py-2.5 text-center">{r.categoryMatch ? "✅" : "❌"}</td>
                              <td className="px-4 py-2.5 text-center">{r.urgencyMatch  ? "✅" : "❌"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {!evalLoading && !evalResults && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-white/40">
                    <p className="text-sm">Click "Run Benchmark" to evaluate the AI classifier against 20 known test cases.</p>
                  </div>
                )}

                {/* Training Loop Verification (Milestone 4) */}
                <div className="flex items-center gap-3 mb-4 mt-8">
                  <h3 className="text-sm font-bold text-white">Training Loop Verification</h3>
                  <div className="h-px bg-white/10 flex-1"></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <p className="text-xs text-white/50">
                      Re-runs the AI on messages a human already reviewed in /train — once with no training (baseline)
                      and once learning from past corrections. Each message's own correction is hidden from it, so it
                      cannot cheat. If the training loop works, the second score is higher.
                    </p>
                    <button
                      onClick={runVerify}
                      disabled={verifyStarting || verifyState?.running}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition whitespace-nowrap"
                    >
                      {verifyState?.running ? "Verifying..." : verifyStarting ? "Starting..." : "Run Verification"}
                    </button>
                  </div>

                  {verifyState?.error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-rose-400 text-xs mb-3">{verifyState.error}</div>
                  )}

                  {verifyState?.running && (
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-white/50 mb-1">
                        <span>Re-classifying reviewed messages ({verifyState.done}/{verifyState.total})</span>
                        <span>{verifyState.total ? Math.round((verifyState.done / verifyState.total) * 100) : 0}%</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${verifyState.total ? (verifyState.done / verifyState.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}

                  {verifyState?.summary && (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-4">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                          <div className="text-3xl font-black text-white/70">{verifyState.summary.baselineAccuracy}%</div>
                          <div className="text-[10px] text-white/50 mt-1 uppercase tracking-widest font-semibold">Baseline (no training)</div>
                        </div>
                        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 text-center">
                          <div className="text-3xl font-black text-indigo-400">{verifyState.summary.fewShotAccuracy}%</div>
                          <div className="text-[10px] text-white/50 mt-1 uppercase tracking-widest font-semibold">With training</div>
                        </div>
                        {verifyState.summary.improvementPoints >= 0 ? (
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                            <div className="text-3xl font-black text-emerald-400">+{verifyState.summary.improvementPoints}</div>
                            <div className="text-[10px] text-white/50 mt-1 uppercase tracking-widest font-semibold">Points gained</div>
                          </div>
                        ) : (
                          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
                            <div className="text-3xl font-black text-rose-400">{verifyState.summary.improvementPoints}</div>
                            <div className="text-[10px] text-white/50 mt-1 uppercase tracking-widest font-semibold">Points lost</div>
                          </div>
                        )}
                      </div>
                      {verifyState.summary.humanFixCases > 0 && (
                        <p className="text-xs text-white/40 mb-4">
                          On the {verifyState.summary.humanFixCases} message{verifyState.summary.humanFixCases === 1 ? "" : "s"} a human
                          had to fix, the untrained AI scores {verifyState.summary.baselineAccuracyOnFixes}% — with training it scores {verifyState.summary.fewShotAccuracyOnFixes}%.
                        </p>
                      )}
                      <div className="rounded-xl border border-white/10 overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-white/10 bg-white/5 text-[10px] text-white/30 uppercase tracking-widest">
                              <th className="px-4 py-3">Message</th>
                              <th className="px-4 py-3">Human verdict</th>
                              <th className="px-4 py-3">Baseline</th>
                              <th className="px-4 py-3">With training</th>
                            </tr>
                          </thead>
                          <tbody>
                            {verifyState.results?.map((r: any, i: number) => (
                              <tr key={i} className={`border-b border-white/5 ${r.fewShotMatch ? "bg-emerald-500/3" : "bg-rose-500/3"}`}>
                                <td className="px-4 py-2.5 text-white/60 max-w-[220px] truncate">{r.text}</td>
                                <td className="px-4 py-2.5 text-white/80 font-medium">{r.expected}</td>
                                <td className={`px-4 py-2.5 ${r.baselineMatch ? "text-emerald-400" : "text-rose-400"}`}>{r.baseline} {r.baselineMatch ? "✅" : "❌"}</td>
                                <td className={`px-4 py-2.5 ${r.fewShotMatch ? "text-emerald-400" : "text-rose-400"}`}>{r.fewShot} {r.fewShotMatch ? "✅" : "❌"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {!verifyState?.running && !verifyState?.summary && !verifyState?.error && (
                    <p className="text-xs text-white/30">No verification run yet. Review tickets in /train, then run this weekly to track accuracy improvement.</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/10 flex justify-between items-center">
                <p className="text-xs text-white/30">Tests {evalResults?.total || 20} messages - Uses llama-3.1-8b-instant model</p>
                <div className="flex space-x-3">
                  <label className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-4 py-2 rounded-lg transition cursor-pointer flex items-center">
                    Upload Custom JSON
                    <input type="file" accept=".json" onChange={handleBenchmarkUpload} className="hidden" disabled={evalLoading} />
                  </label>
                  <button
                    onClick={() => runBenchmark()}
                    disabled={evalLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                  >
                    {evalLoading ? "Running..." : "🔄 Run Built-in Benchmark"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        </React.Fragment>
      )}
      <style>{`
        .pulse-animation { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}

