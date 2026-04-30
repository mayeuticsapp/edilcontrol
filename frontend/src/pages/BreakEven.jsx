import React, { useState, useEffect } from "react";
import { api, formatEUR, formatPct } from "../lib/api";
import { Card, CardHeader, Button, Input } from "../components/UI";
import { Calculator, Info } from "lucide-react";

export default function BreakEven() {
  const [form, setForm] = useState({ costi_fissi_mensili: 13610, prezzo_medio_commessa: 50000, costo_variabile_medio: 35000 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [costiFissi, setCostiFissi] = useState([]);

  useEffect(() => {
    api.get("/costi-fissi").then(r => {
      setCostiFissi(r.data);
      const tot = r.data.filter(c => c.attivo).reduce((s, c) => s + c.importo_mensile, 0);
      if (tot > 0) setForm(f => ({ ...f, costi_fissi_mensili: tot }));
    }).catch(() => {});
  }, []);

  const calc = async () => {
    setError("");
    try {
      const r = await api.post("/calcoli/break-even", {
        costi_fissi_mensili: parseFloat(form.costi_fissi_mensili),
        prezzo_medio_commessa: parseFloat(form.prezzo_medio_commessa),
        costo_variabile_medio: parseFloat(form.costo_variabile_medio),
      });
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Errore nel calcolo");
      setResult(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl" data-testid="break-even-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Pianificazione</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Break Even Point</h1>
        <p className="text-sm text-zinc-500 mt-1">Quante commesse servono per non andare in perdita</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Parametri" subtitle="Inserisci i tuoi dati" />
          <div className="p-5 space-y-4">
            <Input
              label="Costi fissi mensili (€)"
              type="number" step="0.01"
              value={form.costi_fissi_mensili}
              onChange={(e) => setForm({ ...form, costi_fissi_mensili: e.target.value })}
              testid="be-costi-fissi"
            />
            <div className="text-xs text-zinc-500 -mt-2">
              {costiFissi.length > 0 && `Pre-compilato dai tuoi ${costiFissi.filter(c => c.attivo).length} costi fissi attivi`}
            </div>
            <Input
              label="Prezzo medio commessa (€)"
              type="number" step="0.01"
              value={form.prezzo_medio_commessa}
              onChange={(e) => setForm({ ...form, prezzo_medio_commessa: e.target.value })}
              testid="be-prezzo"
            />
            <Input
              label="Costo variabile medio per commessa (€)"
              type="number" step="0.01"
              value={form.costo_variabile_medio}
              onChange={(e) => setForm({ ...form, costo_variabile_medio: e.target.value })}
              testid="be-costo-var"
            />
            <div className="text-xs text-zinc-500 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Il costo variabile include materiali, manodopera diretta, subappalti — tutto ciò che varia con la singola commessa.</span>
            </div>
            <Button onClick={calc} className="w-full" data-testid="be-calc-btn">
              <Calculator className="w-4 h-4" /> Calcola Break Even
            </Button>
            {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm">{error}</div>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Risultato" subtitle="Punto di pareggio" />
          <div className="p-5">
            {!result ? (
              <div className="text-center py-12 text-zinc-400 text-sm">Inserisci i parametri e calcola</div>
            ) : (
              <div className="space-y-5" data-testid="be-result">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Commesse al pareggio</div>
                  <div className="font-mono-data text-4xl font-bold text-[#0F4C81] mt-1">{result.commesse_pareggio.toFixed(2)}</div>
                  <div className="text-xs text-zinc-500 mt-1">commesse al mese per non perdere soldi</div>
                </div>
                <div className="border-t border-zinc-200 pt-4 space-y-3">
                  <Row label="Fatturato mensile minimo" value={formatEUR(result.fatturato_pareggio)} />
                  <Row label="Margine unitario" value={formatEUR(result.margine_unitario)} />
                  <Row label="Margine percentuale" value={formatPct(result.margine_percentuale)} />
                </div>
                <div className="bg-zinc-50 border border-zinc-200 px-4 py-3 rounded-sm text-xs text-zinc-700">
                  <strong className="font-semibold">Formula:</strong> <span className="font-mono-data">Costi fissi ÷ (Prezzo − Costo variabile)</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {result && (
        <Card>
          <CardHeader title="Interpretazione" subtitle="Cosa significa per te" />
          <div className="p-5 text-sm text-zinc-700 space-y-3">
            <p>
              Per coprire i tuoi <strong className="font-mono-data">{formatEUR(form.costi_fissi_mensili)}</strong> di costi fissi mensili,
              devi chiudere almeno <strong className="font-mono-data">{result.commesse_pareggio.toFixed(2)} commesse al mese</strong> al
              prezzo medio di <strong className="font-mono-data">{formatEUR(form.prezzo_medio_commessa)}</strong>.
            </p>
            <p>
              Ogni commessa ti lascia <strong className="font-mono-data">{formatEUR(result.margine_unitario)}</strong> di margine
              ({formatPct(result.margine_percentuale)}). Tutto ciò che fatturi <strong>oltre</strong> il pareggio è utile netto operativo.
            </p>
            {result.margine_percentuale < 20 && (
              <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-sm text-amber-800">
                ⚠ Il tuo margine ({formatPct(result.margine_percentuale)}) è sotto il 20%. Nel settore edile è consigliabile alzare i prezzi o ridurre i costi variabili per avere un cuscinetto più ampio.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-zinc-600">{label}</span>
      <span className="font-mono-data font-semibold text-zinc-900">{value}</span>
    </div>
  );
}
