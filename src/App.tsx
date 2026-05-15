import React, { useEffect, useState, useRef } from "react";
import { format, subDays, startOfDay, isToday, parseISO } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Activity, AlertTriangle, CheckCircle, RefreshCcw, Send, Settings, User, Clock, ChevronDown, ChevronUp, Lock } from "lucide-react";

// Types
type Ticket = {
  id: string;
  summary: string;
  category: string;
  urgency: 'Critical' | 'High' | 'Medium' | 'Low';
  product_area: string;
  sentiment: string;
  is_complaint: boolean;
  suggested_action: string;
  status: 'Open' | 'In Review' | 'Resolved' | 'Dismissed';
  raw_text: string;
  created_at: string;
};

type Community = {
  id: string;
  telegram_group_id: string;
  display_name: string;
};

// Colors for charts
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];
const URGENCY_COLORS = { Critical: 'bg-rose-500', High: 'bg-amber-500', Medium: 'bg-indigo-500', Low: 'bg-blue-500' };

export default function App() {
  const [adminKey, setAdminKey] = useState<string>(localStorage.getItem('PULSEDESK_ADMIN_KEY') || "");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('PULSEDESK_ADMIN_KEY'));
  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>("");
  const [loading, setLoading] = useState(true);
  
  // Simulator state
  const [simMessage, setSimMessage] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<{message: string, isError: boolean} | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  // Filters state
  const [filterCategory, setFilterCategory] = useState<string>("All");
  const [filterUrgency, setFilterUrgency] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterDays, setFilterDays] = useState<string>("7");

  // Custom api abstraction to handle headers easily
  const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
        ...(options.headers || {})
      }
    });
    if (res.status === 401) {
      setIsAuthenticated(false);
      localStorage.removeItem('PULSEDESK_ADMIN_KEY');
      throw new Error("Unauthorized");
    }
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`API Error: Expected JSON but got ${contentType} on ${endpoint}: ${text.substring(0, 50)}`);
    }
    return res;
  };

  const verifyLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminKey.trim()) return;
    setAuthLoading(true);
    setAuthError("");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const res = await fetch('/api/auth/verify', { 
        headers: { 'x-admin-key': adminKey },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        setIsAuthenticated(true);
        localStorage.setItem('PULSEDESK_ADMIN_KEY', adminKey);
      } else {
        setAuthError("Invalid access key or Insufficient Permissions");
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        setAuthError("Request timed out. Please check your connection.");
      } else {
        setAuthError("Network error. Make sure the backend is running.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchCommunities();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchTickets();
    // Poll for new tickets since we moved away from client-side supabase realtime
    const interval = setInterval(fetchTickets, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated, selectedCommunity]);

  const fetchCommunities = async () => {
    try {
      const res = await apiFetch('/api/communities');
      const data = await res.json();
      if (data && data.length > 0) {
        setCommunities(data);
        if (!selectedCommunity) setSelectedCommunity(data[0].telegram_group_id);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
    }
  };

  const fetchTickets = async () => {
    try {
      const url = selectedCommunity ? `/api/tickets?group_id=${encodeURIComponent(selectedCommunity)}` : '/api/tickets';
      const res = await apiFetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setTickets(data);
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const updateTicketStatus = async (id: string, newStatus: string) => {
    try {
      await apiFetch(`/api/tickets/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
      // Optimistic update
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
      alert("Failed to update status");
    }
  };

  // Derivative calculations
  const filteredTickets = tickets.filter(t => {
    if (filterCategory !== "All" && t.category?.trim().toLowerCase() !== filterCategory.toLowerCase()) return false;
    if (filterUrgency !== "All" && t.urgency?.trim().toLowerCase() !== filterUrgency.toLowerCase()) return false;
    if (filterStatus !== "All" && t.status?.trim().toLowerCase() !== filterStatus.toLowerCase()) return false;
    
    if (filterDays !== "All") {
      const days = parseInt(filterDays);
      const thresholdDate = subDays(startOfDay(new Date()), days - 1);
      if (t.created_at && parseISO(t.created_at) < thresholdDate) return false;
    }
    return true;
  });

  const simulateIngestion = async () => {
    if (!simMessage.trim()) return;
    setIsSimulating(true);
    try {
      const res = await apiFetch('/api/ingest', {
        method: 'POST',
        body: JSON.stringify({ text: simMessage, telegramId: Math.floor(Math.random() * 999999) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSimMessage("");
        fetchTickets(); // fetch latest
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
    try {
      const res = await apiFetch('/api/backfill', {
        method: 'POST',
        body: JSON.stringify({ limit: 20 })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackfillStatus({ message: `Backfill complete: Processed ${data.processed} messages, skipped ${data.skipped}.`, isError: false });
        fetchTickets(); // fetch latest
      } else {
        setBackfillStatus({ message: "Error during backfill: " + data.error, isError: true });
      }
    } catch (e: any) {
      if (e?.message !== "Failed to fetch") console.error(e);
      setBackfillStatus({ message: "Failed to reach backfill API. Ensure backend is running and Telegram is connected.", isError: true });
    }
    setIsBackfilling(false);
  };

  // Render Auth Screen Instead of Config Missing Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#05070a] flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none"></div>
        <form onSubmit={verifyLogin} className="bg-white/5 p-8 rounded-2xl backdrop-blur-xl border border-white/10 max-w-sm w-full relative z-10 flex flex-col items-center">
          <div className="mb-6 flex justify-center w-full">
             <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
               <Lock className="w-8 h-8 text-white" />
             </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-6 text-center w-full">Secure Access Required</h1>
          
          <div className="w-full space-y-4">
             <input 
               type="password"
               value={adminKey}
               onChange={e => setAdminKey(e.target.value)}
               placeholder="Access Key"
               className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center tracking-widest font-mono"
             />
             {authError && <div className="text-rose-400 text-xs text-center">{authError}</div>}
             <button type="submit" disabled={authLoading || !adminKey.trim()} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded-lg px-4 py-3 text-sm transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50">
               {authLoading ? "Verifying..." : "Unlock Dashboard"}
             </button>
          </div>
        </form>
      </div>
    );
  }

  // Calculate stats
  const ticketsToday = filteredTickets.filter(t => isToday(parseISO(t.created_at)));
  const openCount = filteredTickets.filter(t => t.status === 'Open').length;
  const resolvedCount = filteredTickets.filter(t => t.status === 'Resolved').length;
  
  // Dynamic urgency count for the 4th stat box
  const urgencyCardLabel = filterUrgency === 'All' ? 'Critical Issues' : `${filterUrgency} Issues`;
  const urgencyCount = filteredTickets.filter(t => {
    const targetUrgencies = filterUrgency === 'All' ? ['Critical'] : [filterUrgency];
    return targetUrgencies.includes(t.urgency) && t.status !== 'Resolved' && t.status !== 'Dismissed';
  }).length;
  
  const resolutionRate = filteredTickets.length ? Math.round((resolvedCount / filteredTickets.length) * 100) : 0;

  // Chart Data: Volume over time
  const maxDays = filterDays === "All" ? 30 : parseInt(filterDays);
  const volumeData = Array.from({length: maxDays}).map((_, i) => {
    const d = subDays(new Date(), (maxDays - 1) - i);
    const dateStr = format(d, 'MMM dd');
    return {
      date: dateStr,
      tickets: filteredTickets.filter(t => t.created_at && format(parseISO(t.created_at), 'MMM dd') === dateStr).length
    };
  });

  // Chart Data: Category Breakdown
  const categoryCount = filteredTickets.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryData = Object.entries(categoryCount).map(([name, value]) => ({ name, value }));

  return (
    <div className="min-h-screen bg-[#05070a] text-white font-sans overflow-auto flex flex-col relative pb-12">
      <div className="fixed top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none"></div>

      {/* Top Nav */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
             <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">PULSEDESK</h1>
            <p className="text-[10px] text-indigo-300 font-mono tracking-widest uppercase">Community Intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <select 
              className="bg-transparent text-sm cursor-pointer outline-none text-white appearance-none font-medium [&>option]:text-black"
              value={selectedCommunity}
              onChange={(e) => setSelectedCommunity(e.target.value)}
            >
              {communities.length === 0 && <option value="">Loading communities...</option>}
              {communities.map(c => <option key={c.telegram_group_id} value={c.telegram_group_id}>{c.display_name}</option>)}
            </select>
            <ChevronDown className="w-4 h-4 text-white/40 pointer-events-none" />
          </div>
          <div className="bg-white/5 border border-white/10 p-2 rounded-full backdrop-blur-md">
            <User className="w-5 h-5 text-white/60" />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="p-12 flex justify-center relative z-10"><div className="animate-spin text-indigo-500"><RefreshCcw /></div></div>
      ) : (
        <main className="max-w-7xl mx-auto px-6 space-y-6 w-full relative z-10">
          
          {/* Top Panel: Simulator / Actions */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-5 mb-6">
             <div className="flex justify-between items-center mb-2">
               <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Test Integration (Simulation)</h2>
               <button 
                 onClick={handleBackfill}
                 disabled={isBackfilling}
                 className="px-3 py-1 bg-white/10 hover:bg-white/20 transition rounded text-[10px] font-bold uppercase disabled:opacity-50 flex items-center"
               >
                 {isBackfilling ? <RefreshCcw className="w-3 h-3 animate-spin mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                 Fetch Last 20 Messages
               </button>
             </div>
             <div className="flex space-x-3 mb-3">
               <input 
                 type="text" 
                 value={simMessage}
                 onChange={e => setSimMessage(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && simulateIngestion()}
                 placeholder="Simulate a message from Telegram (e.g. 'My withdrawal is stuck for 3 hours!')"
                 className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 backdrop-blur-md transition-all"
               />
               <button 
                 onClick={simulateIngestion}
                 disabled={isSimulating || !simMessage.trim()}
                 className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg px-6 py-2 text-sm font-medium flex items-center transition shadow-lg shadow-indigo-500/20 border border-indigo-400/20"
               >
                 {isSimulating ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Classify</>}
               </button>
             </div>
             {backfillStatus && (
               <div className={`p-3 mt-4 rounded-lg text-sm flex items-center ${backfillStatus.isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                 {backfillStatus.isError ? <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> : <RefreshCcw className="w-4 h-4 mr-2 flex-shrink-0" />}
                 {backfillStatus.message}
               </div>
             )}
          </div>

          {/* Filters Row */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-4 flex flex-wrap gap-4 items-center mb-6">
            <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mr-2">Filters</h2>
            
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterDays} onChange={e => setFilterDays(e.target.value)}>
                <option value="All">All Time</option>
                <option value="1">Last 24h</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
              </select>
            </div>

            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Review">In Review</option>
                <option value="Resolved">Resolved</option>
                <option value="Dismissed">Dismissed</option>
              </select>
            </div>

            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <select className="bg-transparent text-sm text-white/80 outline-none appearance-none px-3 cursor-pointer [&>option]:text-black" value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)}>
                <option value="All">All Urgency</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
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
            
            {(filterDays !== "7" || filterStatus !== "All" || filterUrgency !== "All" || filterCategory !== "All") && (
              <button 
                onClick={() => { setFilterDays("7"); setFilterStatus("All"); setFilterUrgency("All"); setFilterCategory("All"); }}
                className="text-xs text-indigo-400 hover:text-indigo-300 ml-auto transition"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1 font-semibold">Tickets Today</p>
              <div className="text-2xl font-bold">{ticketsToday.length}</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1 font-semibold">Open Tickets</p>
              <div className="text-2xl font-bold text-indigo-400">{openCount}</div>
            </div>
            <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1 font-semibold">Resolution Rate</p>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">{resolutionRate}%</span>
                <div className="w-16 h-1.5 bg-white/10 rounded-full mb-1.5">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${resolutionRate}%` }}></div>
                </div>
              </div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">{urgencyCardLabel}</p>
                <AlertTriangle className={`w-4 h-4 ${urgencyCount > 0 ? 'text-rose-500' : 'text-rose-500/40'}`} />
              </div>
              <div className="flex items-end justify-between">
                 <span className={`text-2xl font-bold ${urgencyCount > 0 ? 'text-rose-500' : 'text-rose-500/80'}`}>{urgencyCount}</span>
                 {urgencyCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold mb-1">Urgent</span>}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl col-span-2 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold text-white/80">Issue Volume ({filterDays === "All" ? "30 Days (Max)" : `${filterDays} Days`})</h3>
              </div>
              <div className="h-64 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={volumeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: 'rgba(255,255,255,0.4)', fontSize: 10}} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(5, 7, 10, 0.8)', backdropFilter: 'blur(12px)', color: '#fff' }} itemStyle={{ color: '#fff' }} />
                    <Line type="monotone" dataKey="tickets" stroke="#6366f1" strokeWidth={3} dot={{r: 4, strokeWidth: 2, fill: '#05070a', stroke: '#6366f1'}} activeDot={{r: 6, fill: '#6366f1', stroke: '#fff'}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl flex flex-col">
              <h3 className="text-sm font-semibold text-white/80 mb-2">Category Breakdown</h3>
              <div className="flex-1 flex items-center justify-center">
                {filteredTickets.length === 0 ? (
                  <div className="text-white/40 text-sm">No data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="rgba(0,0,0,0)"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value} tickets`, 'Count']} contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(5, 7, 10, 0.8)', backdropFilter: 'blur(12px)', color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Ticket Feed */}
          <div className="bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl flex flex-col min-h-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-transparent">
               <h3 className="text-sm font-semibold text-white/80">Real-time Stream</h3>
               <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center uppercase tracking-widest">
                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 pulse-animation shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span> Listening
               </span>
            </div>
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
                  {filteredTickets.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">No tickets found matching current filters.</td></tr>
                  ) : (
                    filteredTickets.map(ticket => (
                      <React.Fragment key={ticket.id}>
                        <tr 
                          className={`border-b border-white/5 hover:bg-white/5 cursor-pointer transition ${ticket.urgency === 'Critical' ? 'bg-rose-500/5' : ''}`}
                          onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                        >
                          <td className="px-5 py-4">
                            <select 
                              className={`text-[10px] uppercase font-bold tracking-widest rounded px-2 py-1 outline-none border border-white/10 appearance-none [&>option]:text-black ${
                                ticket.status === 'Open' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                ticket.status === 'Resolved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                ticket.status === 'Dismissed' ? 'bg-white/5 text-white/40 border-white/10' :
                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}
                              value={ticket.status}
                              onClick={e => e.stopPropagation()}
                              onChange={e => updateTicketStatus(ticket.id, e.target.value)}
                            >
                              <option value="Open">Open</option>
                              <option value="In Review">In Review</option>
                              <option value="Resolved">Resolved</option>
                              <option value="Dismissed">Dismissed</option>
                            </select>
                          </td>
                          <td className="px-5 py-4">
                             <div className="flex items-center">
                               <span className={`text-[10px] px-2 py-0.5 rounded text-white font-bold uppercase ${URGENCY_COLORS[ticket.urgency] || 'bg-white/20'}`}>{ticket.urgency}</span>
                             </div>
                          </td>
                          <td className="px-5 py-4 font-medium text-white/90 flex items-center">
                            {ticket.summary}
                            {expandedTicketId === ticket.id ? <ChevronUp className="w-4 h-4 ml-2 text-white/40" /> : <ChevronDown className="w-4 h-4 ml-2 text-white/40" />}
                          </td>
                          <td className="px-5 py-4 text-white/60">{ticket.category}</td>
                          <td className="px-5 py-4 text-right text-white/40 whitespace-nowrap font-mono text-[10px]">
                            {format(parseISO(ticket.created_at), 'HH:mm')}
                          </td>
                        </tr>
                        {/* Expanded details */}
                        {expandedTicketId === ticket.id && (
                          <tr className="bg-black/20 border-b border-white/5">
                            <td colSpan={5} className="px-5 py-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">Original Telegram Message</div>
                                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-white/80 text-sm whitespace-pre-wrap leading-relaxed">
                                    "{ticket.raw_text.split('[ADMIN_REPLY]')[0].trim()}"
                                  </div>
                                  
                                  {ticket.raw_text.includes('[ADMIN_REPLY]') && (
                                    <div className="mt-4">
                                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center">
                                        <CheckCircle className="w-3 h-3 mr-1" /> Admin / Team Responses
                                      </div>
                                      <div className="space-y-2">
                                        {ticket.raw_text.split('[ADMIN_REPLY]').slice(1).map((replyBlock, idx) => (
                                          <div key={idx} className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-emerald-100 text-sm whitespace-pre-wrap">
                                            {replyBlock.replace('[/ADMIN_REPLY]', '').trim()}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
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
                                      <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">User Sentiment</div>
                                      <div className="text-sm text-white/90 font-medium">{ticket.sentiment}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}
      <style>{`
        .pulse-animation { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}
