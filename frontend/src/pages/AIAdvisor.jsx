import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Card, Button, Badge } from "../components/UI";
import { Sparkles, Send, Trash2, Loader2 } from "lucide-react";

const SUGGESTIONS = [
  "Come sta andando l'impresa?",
  "Quali sono i cantieri meno redditizi?",
  "Il mio EBITDA è sano?",
  "Quanto durano le mie riserve di cassa?",
  "Dove posso ridurre i costi?",
];

function getSessionId() {
  let id = localStorage.getItem("edilcontrol_chat_session");
  if (!id) {
    id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("edilcontrol_chat_session", id);
  }
  return id;
}

export default function AIAdvisor() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const sessionId = useRef(getSessionId());
  const scrollRef = useRef(null);

  useEffect(() => {
    api.get("/ai-advisor/status").then(r => setStatus(r.data));
    api.get(`/ai-advisor/history/${sessionId.current}`).then(r => setMessages(r.data));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(m => [...m, { id: `tmp-${Date.now()}`, role: "user", content: msg }]);
    setLoading(true);
    try {
      const r = await api.post("/ai-advisor/chat", { session_id: sessionId.current, message: msg });
      setMessages(m => [...m, { id: `a-${Date.now()}`, role: "assistant", content: r.data.reply }]);
    } catch (e) {
      setMessages(m => [...m, { id: `e-${Date.now()}`, role: "assistant", content: `⚠ Errore: ${e.response?.data?.detail || e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    if (!window.confirm("Cancellare tutta la conversazione?")) return;
    await api.delete(`/ai-advisor/history/${sessionId.current}`);
    setMessages([]);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl" data-testid="ai-advisor-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Intelligence</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Consulente AI</h1>
          <p className="text-sm text-zinc-500 mt-1">Chiedi qualsiasi cosa sui tuoi numeri — l'AI legge i tuoi dati reali</p>
        </div>
        <div className="flex items-center gap-2">
          {status?.abilitato && <Badge variant="success">● Attivo</Badge>}
          {status && <Badge variant="info">{status.modello}</Badge>}
          {messages.length > 0 && (
            <Button variant="ghost" onClick={clearChat} data-testid="ai-clear-btn"><Trash2 className="w-4 h-4" /> Pulisci</Button>
          )}
        </div>
      </div>

      <Card className="relative overflow-hidden flex flex-col" style={{ height: "calc(100vh - 220px)", minHeight: 500 }}>
        <div className="absolute inset-x-0 top-0 h-px ai-shimmer-border"></div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4" data-testid="ai-messages">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-14 h-14 bg-zinc-950 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold tracking-tight">Ciao! Sono il tuo consulente finanziario.</h3>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Conosco già tutti i tuoi numeri (cantieri, EBITDA, cash flow). Chiedi quello che vuoi —
                ti rispondo con dati concreti e azioni pratiche.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-2xl">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs border border-zinc-300 hover:border-[#0F4C81] hover:bg-[#0F4C81]/5 rounded-sm px-3 py-1.5 transition-colors"
                    data-testid="ai-suggestion-btn"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
                </div>
              )}
              <div className={`max-w-[80%] px-4 py-3 rounded-sm text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#0F4C81] text-white"
                  : "bg-zinc-50 border border-zinc-200 text-zinc-900"
              }`} data-testid={`ai-msg-${m.role}`}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" strokeWidth={1.75} />
              </div>
              <div className="bg-zinc-50 border border-zinc-200 px-4 py-3 rounded-sm text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Sto analizzando i tuoi dati...
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="border-t border-zinc-200 p-4 flex gap-2 bg-white"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={status?.abilitato ? "Scrivi la tua domanda..." : "AI non attivo"}
            disabled={!status?.abilitato || loading}
            className="flex-1 px-4 py-2.5 text-sm border border-zinc-300 rounded-sm focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none disabled:bg-zinc-50"
            data-testid="ai-input"
          />
          <Button type="submit" disabled={!input.trim() || loading || !status?.abilitato} data-testid="ai-send-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia
          </Button>
        </form>
      </Card>

      <div className="text-xs text-zinc-500">
        Il consulente legge in tempo reale i tuoi dati: cantieri, movimenti, EBITDA, cassa. Ogni risposta è basata sui numeri attuali.
        Powered by <strong className="font-mono">Claude Sonnet 4.5</strong> · Emergent Universal Key.
      </div>
    </div>
  );
}
