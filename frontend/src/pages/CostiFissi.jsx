import React, { useEffect, useState } from "react";
import { api, formatEUR } from "../lib/api";
import { Card, CardHeader, Button, Input, Select, Modal, Badge } from "../components/UI";
import { Plus, Trash2 } from "lucide-react";

const CATEGORIE = ["Affitto", "Leasing mezzi", "Stipendi fissi", "Software", "Utenze", "Assicurazioni", "Consulenze", "Altro"];

export default function CostiFissi() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ descrizione: "", categoria: "Affitto", importo_mensile: 0, attivo: true });

  const load = async () => {
    const r = await api.get("/costi-fissi");
    setList(r.data);
  };
  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    await api.post("/costi-fissi", { ...form, importo_mensile: parseFloat(form.importo_mensile) || 0 });
    setOpen(false);
    setForm({ descrizione: "", categoria: "Affitto", importo_mensile: 0, attivo: true });
    load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("Eliminare questo costo fisso?")) return;
    await api.delete(`/costi-fissi/${id}`);
    load();
  };

  const totale = list.filter(c => c.attivo).reduce((s, c) => s + c.importo_mensile, 0);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl" data-testid="costi-fissi-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Configurazione</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Costi Fissi Mensili</h1>
          <p className="text-sm text-zinc-500 mt-1">La base per il calcolo del Break Even Point</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="costo-new-btn"><Plus className="w-4 h-4" /> Nuovo costo fisso</Button>
      </div>

      <div className="bg-zinc-950 text-white rounded-sm p-6">
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Totale costi fissi mensili</div>
        <div className="font-mono-data text-4xl font-bold mt-1" data-testid="costi-fissi-totale">{formatEUR(totale)}</div>
        <div className="text-xs text-zinc-400 mt-2">{list.filter(c => c.attivo).length} voci attive · {formatEUR(totale * 12)} all'anno</div>
      </div>

      <Card>
        <CardHeader title="Voci di costo" subtitle="Tutte le spese ricorrenti" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="costi-fissi-table">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <th className="text-left px-5 py-3 font-semibold">Descrizione</th>
                <th className="text-left px-5 py-3 font-semibold">Categoria</th>
                <th className="text-left px-5 py-3 font-semibold">Stato</th>
                <th className="text-right px-5 py-3 font-semibold">Importo mensile</th>
                <th className="text-right px-5 py-3 font-semibold">Annuale</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-zinc-500">Nessun costo fisso configurato</td></tr>}
              {list.map((c, idx) => (
                <tr key={c.id} className={idx % 2 ? "bg-zinc-50/40" : ""}>
                  <td className="px-5 py-3 font-medium">{c.descrizione}</td>
                  <td className="px-5 py-3 text-zinc-600">{c.categoria}</td>
                  <td className="px-5 py-3"><Badge variant={c.attivo ? "success" : "default"}>{c.attivo ? "attivo" : "inattivo"}</Badge></td>
                  <td className="px-5 py-3 text-right font-mono-data">{formatEUR(c.importo_mensile)}</td>
                  <td className="px-5 py-3 text-right font-mono-data text-zinc-500">{formatEUR(c.importo_mensile * 12)}</td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => onDelete(c.id)} className="text-zinc-400 hover:text-red-600" data-testid={`costo-delete-${c.id}`}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo costo fisso" testid="costo-modal">
        <form onSubmit={onSubmit} className="space-y-4">
          <Input label="Descrizione *" required value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} testid="costo-input-desc" />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIE.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Importo mensile (€) *" type="number" step="0.01" required value={form.importo_mensile} onChange={(e) => setForm({ ...form, importo_mensile: e.target.value })} testid="costo-input-importo" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.attivo} onChange={(e) => setForm({ ...form, attivo: e.target.checked })} />
            <span className="text-sm">Attivo</span>
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="submit" data-testid="costo-submit-btn">Aggiungi</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
