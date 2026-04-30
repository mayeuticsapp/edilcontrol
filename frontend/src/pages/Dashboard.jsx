import React, { useEffect, useState } from "react";
import { api, formatEUR, formatPct, formatMonth } from "../lib/api";
import { StatCard, Card, CardHeader, Button, Badge } from "../components/UI";
import { Wallet, TrendingUp, Building2, AlertTriangle, BarChart3, Calculator, Sparkles } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { Link } from "react-router-dom";

const COLORS = ["#0F4C81", "#52525b", "#F59E0B", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#ea580c"];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [margini, setMargini] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      // Try seed first (idempotent)
      await api.post("/seed-demo").catch(() => {});
      const [s, m] = await Promise.all([
        api.get("/dashboard/summary"),
        api.get("/dashboard/cantieri-margini"),
      ]);
      setData(s.data);
      setMargini(m.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading || !data) {
    return <div className="p-8 text-zinc-500" data-testid="dashboard-loading">Caricamento dati...</div>;
  }

  const ebitdaStatus = data.ebitda_status;
  const cassaStatus = data.mesi_copertura_cassa >= 3 ? "ottimo" : data.mesi_copertura_cassa >= 1 ? "attenzione" : "critico";

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Pannello di controllo</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Salute Finanziaria</h1>
          <p className="text-sm text-zinc-500 mt-1">Monitoraggio in tempo reale dell'impresa edile</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={load} data-testid="dashboard-refresh">Aggiorna</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <StatCard
          label="Fatturato totale"
          value={formatEUR(data.fatturato)}
          icon={TrendingUp}
          sub={`${data.cantieri_attivi} cantieri attivi`}
          testid="kpi-fatturato"
        />
        <StatCard
          label="EBITDA"
          value={formatEUR(data.ebitda)}
          status={ebitdaStatus}
          sub={`${formatPct(data.ebitda_percentuale)} sul fatturato`}
          icon={BarChart3}
          testid="kpi-ebitda"
        />
        <StatCard
          label="Posizione di cassa"
          value={formatEUR(data.cash_position)}
          status={cassaStatus}
          sub={`${data.mesi_copertura_cassa.toFixed(1)} mesi di copertura`}
          icon={Wallet}
          testid="kpi-cassa"
        />
        <StatCard
          label="Portafoglio commesse"
          value={formatEUR(data.valore_portafoglio)}
          icon={Building2}
          sub={`${data.cantieri_totali} cantieri totali`}
          testid="kpi-portafoglio"
        />
      </div>

      {/* Alert se EBITDA critico */}
      {(ebitdaStatus === "critico" || ebitdaStatus === "attenzione") && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-5 py-4 flex items-start gap-3" data-testid="alert-ebitda">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="flex-1">
            <div className="text-sm font-semibold text-amber-900">Margine EBITDA sotto soglia</div>
            <div className="text-xs text-amber-700 mt-0.5">
              Il tuo EBITDA è al {formatPct(data.ebitda_percentuale)}. La soglia minima consigliata per un'impresa edile sana è 15%. Verifica i costi operativi e il pricing delle commesse.
            </div>
          </div>
        </div>
      )}

      {/* Cash Flow Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader title="Cash Flow mensile" subtitle="Entrate vs Uscite" testid="cashflow-header" />
          <div className="p-5">
            {data.cash_flow_mensile.length === 0 ? (
              <div className="text-sm text-zinc-500 py-12 text-center">Nessun dato disponibile</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.cash_flow_mensile.map(m => ({ ...m, mese: formatMonth(m.mese) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="mese" tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#71717a" />
                  <YAxis tick={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} stroke="#71717a" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12, borderRadius: 2, border: "1px solid #e4e4e7" }} />
                  <Legend wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} />
                  <Bar dataKey="entrate" fill="#0F4C81" name="Entrate" />
                  <Bar dataKey="uscite" fill="#dc2626" name="Uscite" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Ripartizione Costi" subtitle="Per categoria" testid="costi-pie-header" />
          <div className="p-5">
            {data.ripartizione_costi.length === 0 ? (
              <div className="text-sm text-zinc-500 py-12 text-center">Nessun costo registrato</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={data.ripartizione_costi} dataKey="importo" nameKey="categoria" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                    {data.ripartizione_costi.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12, borderRadius: 2 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Composizione EBITDA */}
      <Card>
        <CardHeader title="Conto economico semplificato" subtitle="Calcolo EBITDA" testid="ebitda-detail-header" />
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 font-mono-data text-sm">
            <Row label="Fatturato totale" value={data.fatturato} bold />
            <Row label="− Costi del venduto" value={-data.costi_venduto} />
            <Row label="= Margine primo" value={data.margine_primo} bold separator />
            <div></div>
            <Row label="− Costi operativi" value={-data.costi_operativi} />
            <Row label="− Costi del personale" value={-data.costi_personale} />
            <Row label="= EBITDA (MOL)" value={data.ebitda} bold accent={ebitdaStatus === "ottimo" || ebitdaStatus === "buono" ? "green" : "red"} separator />
            <Row label="Margine EBITDA %" value={`${formatPct(data.ebitda_percentuale)}`} isText bold />
          </div>
        </div>
      </Card>

      {/* Margine per cantiere */}
      <Card>
        <CardHeader title="Margini per Cantiere" subtitle="Redditività commesse" testid="margini-cantieri-header"
          action={<Link to="/cantieri"><Button variant="ghost">Tutti i cantieri</Button></Link>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="margini-cantieri-table">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <th className="text-left px-5 py-3 font-semibold">Cantiere</th>
                <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                <th className="text-left px-5 py-3 font-semibold">Stato</th>
                <th className="text-right px-5 py-3 font-semibold">Valore</th>
                <th className="text-right px-5 py-3 font-semibold">Costi</th>
                <th className="text-right px-5 py-3 font-semibold">Margine</th>
                <th className="text-right px-5 py-3 font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {margini.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-500">Nessun cantiere</td></tr>
              )}
              {margini.map((c, idx) => (
                <tr key={c.id} className={idx % 2 ? "bg-zinc-50/40" : ""}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{c.nome}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.cliente}</td>
                  <td className="px-5 py-3"><Badge variant={c.stato === "in_corso" ? "info" : c.stato === "completato" ? "success" : "warning"}>{c.stato.replace("_", " ")}</Badge></td>
                  <td className="px-5 py-3 text-right font-mono-data">{formatEUR(c.valore_commessa)}</td>
                  <td className="px-5 py-3 text-right font-mono-data text-zinc-600">{formatEUR(c.costi_totali)}</td>
                  <td className={`px-5 py-3 text-right font-mono-data font-semibold ${c.margine >= 0 ? "text-green-700" : "text-red-700"}`}>{formatEUR(c.margine)}</td>
                  <td className="px-5 py-3 text-right font-mono-data">
                    <Badge variant={c.margine_percentuale >= 20 ? "success" : c.margine_percentuale >= 10 ? "warning" : "danger"}>{formatPct(c.margine_percentuale)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* AI Advisor placeholder */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px ai-shimmer-border"></div>
        <div className="p-6 flex items-start gap-4">
          <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-amber-400" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display text-lg font-bold tracking-tight">Consulente AI</h3>
              <Badge variant="info">In arrivo</Badge>
            </div>
            <p className="text-sm text-zinc-600">
              Un agente AI specializzato in finanza per imprese edili che analizzerà i tuoi numeri e suggerirà azioni concrete: rinegoziare fornitori, ottimizzare il pricing delle commesse, prevedere tensioni di cassa.
            </p>
          </div>
          <Link to="/ai-advisor"><Button variant="ghost" data-testid="dashboard-ai-cta">Scopri</Button></Link>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, bold, separator, accent, isText }) {
  const colorClass = accent === "green" ? "text-green-700" : accent === "red" ? "text-red-700" : "text-zinc-900";
  return (
    <div className={`flex items-center justify-between py-1.5 ${separator ? "border-t border-zinc-200 pt-2 mt-1" : ""}`}>
      <span className={`${bold ? "font-semibold" : "text-zinc-600"}`}>{label}</span>
      <span className={`${bold ? "font-semibold" : ""} ${colorClass}`}>{isText ? value : formatEUR(value)}</span>
    </div>
  );
}
