import React, { useEffect, useState } from "react";
import { api, formatEUR, formatPct } from "../lib/api";
import { Card, CardHeader, Badge } from "../components/UI";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2 } from "lucide-react";

const STATUS_INFO = {
  ottimo: { label: "Ottimo", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle2,
    desc: "Margine EBITDA superiore al 20%. La tua impresa è in salute eccellente." },
  buono: { label: "Buono", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: TrendingUp,
    desc: "Margine EBITDA tra 15% e 20%. Soglia di sicurezza raggiunta per il settore edile." },
  attenzione: { label: "Attenzione", color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: AlertTriangle,
    desc: "Margine sotto il 15%. La tua impresa è esposta a stress finanziario. Agisci sui prezzi o sui costi." },
  critico: { label: "Critico", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: TrendingDown,
    desc: "Margine sotto il 5%. Situazione critica: rischio di non riuscire a coprire imposte e oneri finanziari." },
};

export default function EBITDA() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/dashboard/summary").then(r => setData(r.data)); }, []);

  if (!data) return <div className="p-8 text-zinc-500">Caricamento...</div>;
  const info = STATUS_INFO[data.ebitda_status];
  const Icon = info.icon;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl" data-testid="ebitda-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Profittabilità</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">EBITDA / Margine Operativo</h1>
        <p className="text-sm text-zinc-500 mt-1">Il vero indicatore della redditività operativa</p>
      </div>

      {/* Hero EBITDA */}
      <Card className={`${info.bg}`}>
        <div className="p-6 md:p-8 flex items-start gap-5">
          <div className={`w-12 h-12 ${info.bg} border ${info.color.replace("text", "border")} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-6 h-6 ${info.color}`} strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 font-semibold">EBITDA (MOL)</div>
              <Badge variant={data.ebitda_status === "ottimo" || data.ebitda_status === "buono" ? "success" : data.ebitda_status === "attenzione" ? "warning" : "danger"}>{info.label}</Badge>
            </div>
            <div className={`font-mono-data text-4xl md:text-5xl font-bold ${info.color}`} data-testid="ebitda-value">{formatEUR(data.ebitda)}</div>
            <div className={`font-mono-data text-lg ${info.color} mt-1`}>{formatPct(data.ebitda_percentuale)} sul fatturato</div>
            <p className={`text-sm ${info.color} mt-3 max-w-2xl`}>{info.desc}</p>
          </div>
        </div>
      </Card>

      {/* Composizione */}
      <Card>
        <CardHeader title="Composizione" subtitle="Dal fatturato all'EBITDA" />
        <div className="p-5 space-y-2 font-mono-data text-sm">
          <Line label="Fatturato totale" value={data.fatturato} bold />
          <Line label="− Costi del venduto (materiali, manodopera, subappalti)" value={-data.costi_venduto} />
          <Line label="= Margine primo" value={data.margine_primo} bold separator />
          <Line label="− Costi operativi (affitti, utenze, software, mezzi...)" value={-data.costi_operativi} />
          <Line label="− Costi del personale (stipendi, contributi, TFR)" value={-data.costi_personale} />
          <Line label="= EBITDA" value={data.ebitda} bold separator big />
        </div>
      </Card>

      {/* Soglie */}
      <Card>
        <CardHeader title="Soglie di riferimento" subtitle="Settore edile" />
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          <Threshold label="Critico" range="< 5%" status="critico" />
          <Threshold label="Attenzione" range="5% – 15%" status="attenzione" />
          <Threshold label="Buono" range="15% – 20%" status="buono" />
          <Threshold label="Ottimo" range="> 20%" status="ottimo" />
        </div>
        <div className="px-5 pb-5 text-xs text-zinc-600">
          <strong>Nota:</strong> Nel settore edile le soglie sono leggermente più basse rispetto ad altri settori (es. tech/SaaS) per via della
          marginalità tipicamente compressa da costi materiali e manodopera. La regola del 15% rimane il riferimento di sicurezza.
        </div>
      </Card>
    </div>
  );
}

function Line({ label, value, bold, separator, big }) {
  const valColor = value >= 0 ? "text-zinc-900" : "text-red-700";
  return (
    <div className={`flex items-center justify-between py-1.5 ${separator ? "border-t border-zinc-200 pt-3 mt-1" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-zinc-600"} ${big ? "text-base" : ""} font-sans`}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${big ? "text-2xl" : ""} ${valColor}`}>{formatEUR(value)}</span>
    </div>
  );
}

function Threshold({ label, range, status }) {
  const info = STATUS_INFO[status];
  return (
    <div className={`border rounded-sm p-3 ${info.bg}`}>
      <div className={`text-[10px] uppercase tracking-[0.15em] font-semibold ${info.color}`}>{label}</div>
      <div className={`font-mono-data text-lg font-bold ${info.color} mt-1`}>{range}</div>
    </div>
  );
}
