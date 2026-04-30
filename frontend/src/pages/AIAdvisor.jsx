import React from "react";
import { Card, Badge, Button } from "../components/UI";
import { Sparkles, Brain, MessageSquare, TrendingUp, AlertTriangle } from "lucide-react";

export default function AIAdvisor() {
  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl" data-testid="ai-advisor-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Intelligence</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Consulente AI</h1>
        <p className="text-sm text-zinc-500 mt-1">Un esperto di finanza per imprese edili, sempre disponibile</p>
      </div>

      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px ai-shimmer-border"></div>
        <div className="p-8 md:p-10">
          <div className="flex items-start gap-5 mb-6">
            <div className="w-14 h-14 bg-zinc-950 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="info">In arrivo</Badge>
                <Badge>Pre-configurato</Badge>
              </div>
              <h2 className="font-display text-2xl font-bold tracking-tight">Modulo AI predisposto</h2>
              <p className="text-zinc-600 mt-2">
                L'integrazione del consulente AI è già predisposta nell'architettura. Quando vorrai attivarlo, l'assistente sarà in grado di:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <Feature icon={Brain} title="Analisi contestuale" desc="Legge i tuoi dati (cantieri, movimenti, costi) e identifica anomalie e opportunità." />
            <Feature icon={MessageSquare} title="Chat in italiano" desc="Conversazione naturale: 'Perché il margine del cantiere Bianchi è basso?'" />
            <Feature icon={TrendingUp} title="Previsioni di cassa" desc="Stima la posizione di cassa nei prossimi 3-6 mesi basandosi su trend storici." />
            <Feature icon={AlertTriangle} title="Allerta proattive" desc="Ti avvisa quando un KPI entra in zona critica prima che diventi un problema." />
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-200">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-2">Modelli AI compatibili</div>
            <div className="flex flex-wrap gap-2">
              <Badge>GPT-5.2</Badge>
              <Badge>Claude Sonnet 4.5</Badge>
              <Badge>Gemini 3 Pro</Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-3">
              L'agente userà la chiave universale Emergent — nessuna API key da configurare manualmente.
              L'attivazione richiede solo la conferma per abilitare l'endpoint <code className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded-sm">/api/ai-advisor/chat</code>.
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <Button data-testid="ai-activate-btn" disabled>Attiva (richiede configurazione)</Button>
            <Button variant="ghost">Documentazione</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-3">Esempio di interazione futura</div>
          <div className="space-y-3">
            <div className="bg-zinc-50 border border-zinc-200 rounded-sm p-4">
              <div className="text-xs text-zinc-500 mb-1">Tu</div>
              <div className="text-sm">Come sta andando l'impresa questo trimestre?</div>
            </div>
            <div className="bg-[#0F4C81]/5 border border-[#0F4C81]/20 rounded-sm p-4">
              <div className="text-xs text-[#0F4C81] mb-1 flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Consulente AI</div>
              <div className="text-sm text-zinc-800">
                Il fatturato Q4 è solido, ma il margine sul cantiere "Villa Bianchi" è solo al 13%, sotto la media.
                Verifica i costi materiali: sono cresciuti del 18% rispetto al budget iniziale.
                Ti consiglio di rinegoziare con il fornitore principale o aggiornare il preventivo del cliente.
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="border border-zinc-200 rounded-sm p-4 flex gap-3">
      <div className="w-9 h-9 bg-zinc-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-[#0F4C81]" strokeWidth={1.75} />
      </div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-zinc-600 mt-1">{desc}</div>
      </div>
    </div>
  );
}
