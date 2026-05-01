import React, { useEffect, useRef, useState } from "react";
import { api, formatEUR } from "../lib/api";
import { Card, Button, Badge } from "../components/UI";
import { Sparkles, Send, Trash2, Loader2, Paperclip, X, FileText, Image as ImageIcon, CheckCircle2, AlertTriangle, Zap } from "lucide-react";

const SUGGESTIONS = [
  "Apri un cantiere Villa Rossi per cliente Mario Rossi, valore 80000",
  "Registra una uscita di 2500€ oggi per materiali",
  "Aggiungi costo fisso di 800€ per assicurazione",
  "Quali cantieri sono meno redditizi?",
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
  const [pendingFiles, setPendingFiles] = useState([]); // [{file_id, filename, content_type, size}]
  const [confirmingId, setConfirmingId] = useState(null);
  const sessionId = useRef(getSessionId());
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get("/ai-advisor/status").then(r => setStatus(r.data));
    api.get(`/ai-advisor/history/${sessionId.current}`).then(r => setMessages(r.data));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const newSession = async () => {
    if (messages.length > 0 && !window.confirm("Inizia una nuova conversazione? La chat attuale verrà archiviata.")) return;
    const newId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("edilcontrol_chat_session", newId);
    sessionId.current = newId;
    setMessages([]);
    setPendingFiles([]);
  };

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await api.post(`/ai-advisor/upload?session_id=${sessionId.current}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setPendingFiles(prev => [...prev, r.data]);
      } catch (err) {
        alert(err.response?.data?.detail || "Errore caricamento file");
      }
    }
  };

  const removePendingFile = (id) => setPendingFiles(prev => prev.filter(f => f.file_id !== id));

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if ((!msg && pendingFiles.length === 0) || loading) return;
    setInput("");
    const fileIds = pendingFiles.map(f => f.file_id);
    const userAttachments = pendingFiles.map(f => ({ file_id: f.file_id, filename: f.filename, content_type: f.content_type }));
    setPendingFiles([]);

    setMessages(m => [...m, {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: msg || "(documento allegato)",
      msg_type: userAttachments.length && !msg ? "file" : "text",
      attachments: userAttachments.length ? userAttachments : null,
    }]);
    setLoading(true);
    try {
      const r = await api.post("/ai-advisor/chat", {
        session_id: sessionId.current,
        message: msg,
        file_ids: fileIds.length ? fileIds : undefined,
      });
      const data = r.data;
      if (data.reply_type === "proposed_actions") {
        setMessages(m => [...m, {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.content,
          msg_type: "proposed_actions",
          payload: { explanation: data.content, actions: data.actions, status: "pending" },
        }]);
      } else {
        setMessages(m => [...m, {
          id: `a-${Date.now()}`, role: "assistant",
          content: data.content, msg_type: "text",
        }]);
      }
    } catch (e) {
      setMessages(m => [...m, {
        id: `e-${Date.now()}`, role: "assistant",
        content: `⚠ Errore: ${e.response?.data?.detail || e.message}`, msg_type: "text",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmActions = async (msgId, actions) => {
    setConfirmingId(msgId);
    try {
      const r = await api.post("/ai-advisor/confirm-action", {
        session_id: sessionId.current,
        action_ids: actions.map(a => a.action_id),
      });
      // aggiorna lo stato del messaggio proposed_actions a executed
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, payload: { ...m.payload, status: "executed", results: r.data.results } } : m
      ));
      // aggiunge messaggio risultato
      setMessages(prev => [...prev, {
        id: `r-${Date.now()}`, role: "assistant",
        content: r.data.summary, msg_type: "action_result",
        payload: { results: r.data.results },
      }]);
    } catch (e) {
      alert(e.response?.data?.detail || "Errore esecuzione");
    } finally {
      setConfirmingId(null);
    }
  };

  const cancelActions = async (msgId) => {
    if (!window.confirm("Annullare le azioni proposte?")) return;
    try {
      await api.post("/ai-advisor/cancel-action", {
        session_id: sessionId.current,
        action_ids: [],
      });
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, payload: { ...m.payload, status: "cancelled" } } : m
      ));
    } catch (e) {
      alert(e.response?.data?.detail || "Errore");
    }
  };

  const clearChat = async () => {
    if (!window.confirm("Cancellare tutta la conversazione e gli allegati?")) return;
    await api.delete(`/ai-advisor/history/${sessionId.current}`);
    setMessages([]);
    setPendingFiles([]);
  };

  return (
    <div className="p-6 md:p-8 space-y-4 max-w-5xl" data-testid="ai-advisor-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Intelligence</div>
            <Badge variant="info"><Zap className="w-2.5 h-2.5 inline mr-0.5" /> Agentico</Badge>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Consulente AI</h1>
          <p className="text-sm text-zinc-500 mt-1">Analizza, propone e <strong>esegue azioni</strong> con la tua conferma · Carica fatture, F24, DURC e documenti</p>
        </div>
        <div className="flex items-center gap-2">
          {status?.abilitato && <Badge variant="success">● Attivo</Badge>}
          <Button variant="ghost" onClick={newSession} data-testid="ai-new-chat-btn">Nuova chat</Button>
          {messages.length > 0 && (
            <Button variant="ghost" onClick={clearChat} data-testid="ai-clear-btn"><Trash2 className="w-4 h-4" /> Pulisci</Button>
          )}
        </div>
      </div>

      <Card className="relative overflow-hidden flex flex-col" style={{ height: "calc(100vh - 230px)", minHeight: 500 }}>
        <div className="absolute inset-x-0 top-0 h-px ai-shimmer-border"></div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4" data-testid="ai-messages">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-14 h-14 bg-zinc-950 flex items-center justify-center mb-4">
                <Sparkles className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold tracking-tight">Sono il tuo agente AI.</h3>
              <p className="text-sm text-zinc-600 mt-2 max-w-md">
                Posso <strong>creare cantieri</strong>, <strong>registrare movimenti</strong>, <strong>gestire costi fissi</strong>, e
                leggere documenti come fatture, F24, DURC.
                Ogni azione richiederà la tua conferma prima di essere eseguita.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-2xl">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="text-xs border border-zinc-300 hover:border-[#0F4C81] hover:bg-[#0F4C81]/5 rounded-sm px-3 py-1.5 transition-colors"
                    data-testid="ai-suggestion-btn">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => <MessageBubble key={m.id} m={m} confirming={confirmingId === m.id}
            onConfirm={confirmActions} onCancel={cancelActions} />)}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" strokeWidth={1.75} />
              </div>
              <div className="bg-zinc-50 border border-zinc-200 px-4 py-3 rounded-sm text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Elaboro...
              </div>
            </div>
          )}
        </div>

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2 flex gap-2 flex-wrap">
            {pendingFiles.map(f => (
              <div key={f.file_id} className="bg-white border border-zinc-300 rounded-sm px-2 py-1 flex items-center gap-2 text-xs">
                {f.content_type === "application/pdf" ? <FileText className="w-3.5 h-3.5 text-red-600" /> : <ImageIcon className="w-3.5 h-3.5 text-blue-600" />}
                <span className="font-medium truncate max-w-[160px]">{f.filename}</span>
                <span className="text-zinc-500">{(f.size / 1024).toFixed(0)}KB</span>
                <button onClick={() => removePendingFile(f.file_id)} className="text-zinc-400 hover:text-red-600">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <form onSubmit={(e) => { e.preventDefault(); send(); }}
          className="border-t border-zinc-200 p-3 flex gap-2 bg-white items-end">
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
            onChange={onUpload} className="hidden" data-testid="ai-file-input" />
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="p-2 text-zinc-500 hover:text-[#0F4C81] hover:bg-zinc-100 rounded-sm transition-colors"
            title="Allega documento (PDF, foto)" data-testid="ai-attach-btn">
            <Paperclip className="w-5 h-5" />
          </button>
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder={status?.abilitato ? "Chiedi qualcosa o dai un comando..." : "AI non attivo"}
            disabled={!status?.abilitato || loading}
            className="flex-1 px-4 py-2.5 text-sm border border-zinc-300 rounded-sm focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none disabled:bg-zinc-50"
            data-testid="ai-input" />
          <Button type="submit" disabled={(!input.trim() && pendingFiles.length === 0) || loading || !status?.abilitato} data-testid="ai-send-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia
          </Button>
        </form>
      </Card>

      <div className="text-xs text-zinc-500 leading-relaxed">
        🤖 <strong>Agente AI</strong> — può creare/modificare/eliminare cantieri, movimenti e costi fissi <strong>solo dopo la tua conferma</strong>.
        Powered by <span className="font-mono">Claude Sonnet 4.5</span> · Vision attiva (PDF/foto fino 8MB).
      </div>
    </div>
  );
}

function MessageBubble({ m, confirming, onConfirm, onCancel }) {
  const isUser = m.role === "user";

  if (m.msg_type === "proposed_actions") {
    const status = m.payload?.status || "pending";
    const actions = m.payload?.actions || [];
    return (
      <div className="flex gap-3" data-testid="ai-msg-proposed">
        <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
        </div>
        <div className="max-w-[85%] flex-1">
          <div className="bg-amber-50 border border-amber-300 rounded-sm p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-700" />
              <span className="text-xs uppercase tracking-wider font-semibold text-amber-900">Azioni proposte</span>
              {status === "executed" && <Badge variant="success">Eseguite</Badge>}
              {status === "cancelled" && <Badge variant="default">Annullate</Badge>}
              {status === "pending" && <Badge variant="warning">In attesa di conferma</Badge>}
            </div>
            <div className="text-sm text-zinc-800">{m.content}</div>
            <div className="space-y-2">
              {actions.map((a) => (
                <div key={a.action_id} className="bg-white border border-amber-200 rounded-sm px-3 py-2 text-sm">
                  <div className="font-mono text-[11px] text-amber-700 uppercase tracking-wider">{a.tool}</div>
                  <div className="text-zinc-900 mt-0.5">{a.summary}</div>
                  {a.params && Object.keys(a.params).length > 0 && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-zinc-500 cursor-pointer hover:text-zinc-700">Dettagli parametri</summary>
                      <pre className="text-[11px] bg-zinc-50 border border-zinc-200 p-2 mt-1 overflow-x-auto rounded-sm">{JSON.stringify(a.params, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
            {status === "pending" && (
              <div className="flex gap-2 pt-2 border-t border-amber-200">
                <Button onClick={() => onConfirm(m.id, actions)} disabled={confirming} data-testid="ai-confirm-btn">
                  {confirming ? <><Loader2 className="w-4 h-4 animate-spin" /> Eseguo...</> : <><CheckCircle2 className="w-4 h-4" /> Conferma ed esegui</>}
                </Button>
                <Button variant="ghost" onClick={() => onCancel(m.id)} disabled={confirming} data-testid="ai-cancel-btn">
                  Annulla
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (m.msg_type === "action_result") {
    const results = m.payload?.results || [];
    return (
      <div className="flex gap-3" data-testid="ai-msg-result">
        <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
        </div>
        <div className="max-w-[85%] flex-1">
          <div className="bg-green-50 border border-green-300 rounded-sm p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider font-semibold text-green-900">Risultato esecuzione</div>
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                {r.ok ? <CheckCircle2 className="w-4 h-4 text-green-700 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />}
                <div>
                  <div className="font-medium text-zinc-900">{r.summary}</div>
                  <div className={`text-xs ${r.ok ? "text-green-700" : "text-red-700"}`}>{r.message}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default: text bubble (user or assistant)
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 bg-zinc-950 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-amber-400" strokeWidth={1.75} />
        </div>
      )}
      <div className={`max-w-[80%] px-4 py-3 rounded-sm text-sm whitespace-pre-wrap ${
        isUser ? "bg-[#0F4C81] text-white" : "bg-zinc-50 border border-zinc-200 text-zinc-900"
      }`} data-testid={`ai-msg-${m.role}`}>
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-white/20">
            {m.attachments.map((a, i) => (
              <div key={i} className="flex items-center gap-1 text-xs bg-white/10 px-2 py-0.5 rounded-sm">
                {a.content_type === "application/pdf" ? <FileText className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                {a.filename}
              </div>
            ))}
          </div>
        )}
        {m.content}
      </div>
    </div>
  );
}
