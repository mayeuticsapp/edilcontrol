import React, { useEffect, useState } from "react";
import { api, formatEUR, formatDate, formatPct } from "../lib/api";
import { Card, CardHeader, Button, Input, Select, Modal, Badge } from "../components/UI";
import { Plus, Trash2, HardHat } from "lucide-react";

const empty = {
  nome: "", cliente: "", indirizzo: "", data_inizio: new Date().toISOString().slice(0, 10),
  data_fine_prevista: "", stato: "in_corso", valore_commessa: 0,
  costi_materiali: 0, costi_manodopera: 0, costi_subappalti: 0, altri_costi: 0, note: "",
};

export default function Cantieri() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await api.get("/cantieri");
    setList(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      valore_commessa: parseFloat(form.valore_commessa) || 0,
      costi_materiali: parseFloat(form.costi_materiali) || 0,
      costi_manodopera: parseFloat(form.costi_manodopera) || 0,
      costi_subappalti: parseFloat(form.costi_subappalti) || 0,
      altri_costi: parseFloat(form.altri_costi) || 0,
      data_fine_prevista: form.data_fine_prevista || null,
    };
    if (editingId) {
      await api.put(`/cantieri/${editingId}`, payload);
    } else {
      await api.post("/cantieri", payload);
    }
    setOpen(false); setForm(empty); setEditingId(null);
    load();
  };

  const onEdit = (c) => {
    setForm({ ...c, data_fine_prevista: c.data_fine_prevista || "" });
    setEditingId(c.id);
    setOpen(true);
  };

  const onDelete = async (id) => {
    if (!window.confirm("Eliminare questo cantiere?")) return;
    await api.delete(`/cantieri/${id}`);
    load();
  };

  const calcMargine = (c) => {
    const costi = c.costi_materiali + c.costi_manodopera + c.costi_subappalti + (c.altri_costi || 0);
    const margine = c.valore_commessa - costi;
    const pct = c.valore_commessa > 0 ? (margine / c.valore_commessa) * 100 : 0;
    return { costi, margine, pct };
  };

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="cantieri-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Operatività</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Cantieri & Commesse</h1>
          <p className="text-sm text-zinc-500 mt-1">Gestione anagrafica e marginalità delle commesse</p>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} data-testid="cantiere-new-btn">
          <Plus className="w-4 h-4" /> Nuovo cantiere
        </Button>
      </div>

      <Card>
        <CardHeader title={`${list.length} Cantieri registrati`} subtitle="Anagrafica completa" />
        {loading ? (
          <div className="p-12 text-center text-zinc-500">Caricamento...</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <HardHat className="w-10 h-10 mx-auto mb-3 text-zinc-400" />
            Nessun cantiere ancora. Aggiungi il primo!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cantieri-table">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                  <th className="text-left px-5 py-3 font-semibold">Nome</th>
                  <th className="text-left px-5 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-5 py-3 font-semibold">Inizio</th>
                  <th className="text-left px-5 py-3 font-semibold">Stato</th>
                  <th className="text-right px-5 py-3 font-semibold">Valore</th>
                  <th className="text-right px-5 py-3 font-semibold">Costi tot.</th>
                  <th className="text-right px-5 py-3 font-semibold">Margine</th>
                  <th className="text-right px-5 py-3 font-semibold">%</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c, idx) => {
                  const { costi, margine, pct } = calcMargine(c);
                  return (
                    <tr key={c.id} className={`${idx % 2 ? "bg-zinc-50/40" : ""} hover:bg-zinc-50`}>
                      <td className="px-5 py-3 font-medium text-zinc-900">
                        <button onClick={() => onEdit(c)} className="hover:underline text-left" data-testid={`cantiere-row-${c.id}`}>{c.nome}</button>
                        <div className="text-xs text-zinc-500">{c.indirizzo}</div>
                      </td>
                      <td className="px-5 py-3 text-zinc-700">{c.cliente}</td>
                      <td className="px-5 py-3 font-mono-data text-zinc-600">{formatDate(c.data_inizio)}</td>
                      <td className="px-5 py-3"><Badge variant={c.stato === "in_corso" ? "info" : c.stato === "completato" ? "success" : "warning"}>{c.stato.replace("_", " ")}</Badge></td>
                      <td className="px-5 py-3 text-right font-mono-data">{formatEUR(c.valore_commessa)}</td>
                      <td className="px-5 py-3 text-right font-mono-data text-zinc-600">{formatEUR(costi)}</td>
                      <td className={`px-5 py-3 text-right font-mono-data font-semibold ${margine >= 0 ? "text-green-700" : "text-red-700"}`}>{formatEUR(margine)}</td>
                      <td className="px-5 py-3 text-right">
                        <Badge variant={pct >= 20 ? "success" : pct >= 10 ? "warning" : "danger"}>{formatPct(pct)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => onDelete(c.id)} className="text-zinc-400 hover:text-red-600" data-testid={`cantiere-delete-${c.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Modifica cantiere" : "Nuovo cantiere"} testid="cantiere-modal">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome cantiere *" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} testid="cantiere-input-nome" />
            <Input label="Cliente *" required value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} testid="cantiere-input-cliente" />
            <Input label="Indirizzo" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} className="md:col-span-2" />
            <Input label="Data inizio *" type="date" required value={form.data_inizio} onChange={(e) => setForm({ ...form, data_inizio: e.target.value })} />
            <Input label="Fine prevista" type="date" value={form.data_fine_prevista || ""} onChange={(e) => setForm({ ...form, data_fine_prevista: e.target.value })} />
            <Select label="Stato" value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value })}>
              <option value="in_corso">In corso</option>
              <option value="completato">Completato</option>
              <option value="sospeso">Sospeso</option>
            </Select>
            <Input label="Valore commessa (€)" type="number" step="0.01" value={form.valore_commessa} onChange={(e) => setForm({ ...form, valore_commessa: e.target.value })} testid="cantiere-input-valore" />
          </div>

          <div className="border-t border-zinc-200 pt-4">
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-3">Costi del cantiere</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Input label="Materiali" type="number" step="0.01" value={form.costi_materiali} onChange={(e) => setForm({ ...form, costi_materiali: e.target.value })} />
              <Input label="Manodopera" type="number" step="0.01" value={form.costi_manodopera} onChange={(e) => setForm({ ...form, costi_manodopera: e.target.value })} />
              <Input label="Subappalti" type="number" step="0.01" value={form.costi_subappalti} onChange={(e) => setForm({ ...form, costi_subappalti: e.target.value })} />
              <Input label="Altri costi" type="number" step="0.01" value={form.altri_costi} onChange={(e) => setForm({ ...form, altri_costi: e.target.value })} />
            </div>
          </div>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold block mb-1.5">Note</span>
            <textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-sm focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none" />
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="submit" data-testid="cantiere-submit-btn">{editingId ? "Salva modifiche" : "Crea cantiere"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
