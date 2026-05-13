import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { format, subDays, startOfDay, isToday, parseISO } from "date-fns";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Activity, AlertTriangle, CheckCircle, RefreshCcw, Send, Settings, User, Clock, ChevronDown, ChevronUp } from "lucide-react";

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
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [selectedCommunity, setSelectedCommunity] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(false);
  
  // Simulator state
  const [simMessage, setSimMessage] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  useEffect(() => {
    // Check config
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      setConfigMissing(true);
      return;
    }

    fetchCommunities();
    fetchTickets();

    // Set up Supabase Realtime
    const subscription = supabase
      .channel('public:tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
         // Re-fetch to keep it simple, or update state optimistically
         fetchTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedCommunity]);

  const fetchCommunities = async () => {
    const { data } = await supabase.from('communities').select('*');
    if (data && data.length > 0) {
      setCommunities(data);
      if (!selectedCommunity) setSelectedCommunity(data[0].telegram_group_id);
    }
  };

  const fetchTickets = async () => {
    let query = supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(200);
    if (selectedCommunity) {
      // In MVP the group_id field holds the telegram_group_id string
      query = query.eq('group_id', selectedCommunity);
    }
    const { data, error } = await query;
    if (error) console.error("Error fetching tickets:", error);
    if (data) setTickets(data);
    setLoading(false);
  };

  const updateTicketStatus = async (id: string, newStatus: string) => {
    await supabase.from('tickets').update({ status: newStatus }).eq('id', id);
  };

  const simulateIngestion = async () => {
    if (!simMessage.trim()) return;
    setIsSimulating(true);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: simMessage, telegramId: Math.floor(Math.random() * 999999) })
      });
      const data = await res.json();
      if (data.success) {
        setSimMessage("");
      } else {
        alert("Error ingesting: " + data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to reach ingestion API. Make sure the backend server is running.");
    }
    setIsSimulating(false);
  };

  const handleBackfill = async () => {
    setIsBackfilling(true);
    try {
      const res = await fetch('/api/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Backfill complete: Processed ${data.processed} messages, skipped ${data.skipped}.`);
      } else {
        alert("Error during backfill: " + data.error);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to reach backfill API. Ensure backend is running and Telegram is connected.");
    }
    setIsBackfilling(false);
  };

  if (configMissing) {
    return (
      <div className="min-h-screen bg-[#05070a] flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] pointer-events-none"></div>
        <div className="bg-white/5 p-8 rounded-2xl backdrop-blur-xl border border-white/10 max-w-lg w-full relative z-10">
          <div className="flex items-center space-x-3 mb-6">
             <AlertTriangle className="text-amber-500 w-8 h-8" />
             <h1 className="text-2xl font-bold">Missing Configuration</h1>
          </div>
          <p className="mb-4 text-white/80">PulseDesk requires Supabase credentials to function.</p>
          <p className="mb-4 text-sm text-white/60">Please open the <strong>Settings &gt; Secrets</strong> panel in AI Studio and add the following variables:</p>
          <ul className="list-disc pl-5 mb-6 text-sm font-mono text-indigo-300 space-y-2">
            <li>SUPABASE_URL</li>
            <li>SUPABASE_ANON_KEY</li>
          </ul>
          <p className="text-sm text-white/80">After adding the keys, <strong className="text-emerald-400">restart the app</strong>.</p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const ticketsToday = tickets.filter(t => isToday(parseISO(t.created_at)));
  const openCount = tickets.filter(t => t.status === 'Open').length;
  const resolvedCount = tickets.filter(t => t.status === 'Resolved').length;
  const criticalHighCount = tickets.filter(t => ['Critical', 'High'].includes(t.urgency) && t.status !== 'Resolved' && t.status !== 'Dismissed').length;
  const resolutionRate = tickets.length ? Math.round((resolvedCount / tickets.length) * 100) : 0;

  // Chart Data: Volume over last 7 days
  const volumeData = Array.from({length: 7}).map((_, i) => {
    const d = subDays(new Date(), 6 - i);
    const dateStr = format(d, 'MMM dd');
    return {
      date: dateStr,
      tickets: tickets.filter(t => format(parseISO(t.created_at), 'MMM dd') === dateStr).length
    };
  });

  // Chart Data: Category Breakdown
  const categoryCount = tickets.reduce((acc, t) => {
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
             <div className="flex space-x-3">
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
                <p className="text-[10px] uppercase tracking-wider text-rose-400 font-semibold">Critical & High</p>
                <AlertTriangle className={`w-4 h-4 ${criticalHighCount > 0 ? 'text-rose-500' : 'text-rose-500/40'}`} />
              </div>
              <div className="flex items-end justify-between">
                 <span className={`text-2xl font-bold ${criticalHighCount > 0 ? 'text-rose-500' : 'text-rose-500/80'}`}>{criticalHighCount}</span>
                 {criticalHighCount > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded uppercase font-bold mb-1">Urgent</span>}
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl col-span-2 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-semibold text-white/80">Issue Volume (7 Days)</h3>
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
                {tickets.length === 0 ? (
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
                  {tickets.length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-white/40">No tickets found. Use the simulation box above to ingest some!</td></tr>
                  ) : (
                    tickets.map(ticket => (
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
                                    "{ticket.raw_text}"
                                  </div>
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
