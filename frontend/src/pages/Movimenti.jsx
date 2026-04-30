import React, { useEffect, useState, useMemo } from "react";
import { api, formatEUR, formatDate } from "../lib/api";
import { Card, CardHeader, Button, Input, Select, Modal, Badge } from "../components/UI";
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

const CATEGORIE_ENTRATA = ["Acconto cliente", "SAL", "Saldo finale", "Rimborso", "Altro"];
const CATEGORIE_USCITA = ["Materiali", "Manodopera", "Subappalti", "Mezzi", "Carburante", "Noli", "Stipendi", "Contributi", "TFR", "Affitto", "Tasse", "Utenze", "Software", "Assicurazioni", "Consulenze", "Altro"];

export default function Movimenti() {
  const [list, setList] = useState([]);
  const [cantieri, setCantieri] = useState([]);
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("tutti");
  const [form, setForm] = useState({
    data: new Date().toISOString().slice(0, 10),
    tipo: "uscita",
    categoria: "Materiali",
    descrizione: "",
    importo: 0,
    cantiere_id: "",
    metodo_pagamento: "bonifico",
  });

  const load = async () => {
    const [m, c] = await Promise.all([api.get("/movimenti"), api.get("/cantieri")]);
    setList(m.data);
    setCantieri(c.data);
  };

  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    await api.post("/movimenti", {
      ...form,
      importo: parseFloat(form.importo) || 0,
      cantiere_id: form.cantiere_id || null,
    });
    setOpen(false);
    setForm({ ...form, descrizione: "", importo: 0 });
    load();
  };

  const onDelete = async (id) => {
    if (!window.confirm("Eliminare questo movimento?")) return;
    await api.delete(`/movimenti/${id}`);
    load();
  };

  const filtered = useMemo(() => {
    if (filtro === "tutti") return list;
    return list.filter(m => m.tipo === filtro);
  }, [list, filtro]);

  const totals = useMemo(() => {
    const entrate = list.filter(m => m.tipo === "entrata").reduce((s, m) => s + m.importo, 0);
    const uscite = list.filter(m => m.tipo === "uscita").reduce((s, m) => s + m.importo, 0);
    return { entrate, uscite, saldo: entrate - uscite };
  }, [list]);

  const cantiereName = (id) => cantieri.find(c => c.id === id)?.nome || "—";

  const categorieList = form.tipo === "entrata" ? CATEGORIE_ENTRATA : CATEGORIE_USCITA;

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="movimenti-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Tesoreria</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mt-1">Cash Flow</h1>
          <p className="text-sm text-zinc-500 mt-1">Entrate e uscite reali — la regola d'oro: 3 mesi di copertura</p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="movimento-new-btn"><Plus className="w-4 h-4" /> Nuovo movimento</Button>
      </div>

      <div className="grid grid-cols-3 gap-4 md:gap-6">
        <div className="bg-white border border-zinc-200 rounded-sm p-5 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownCircle className="w-4 h-4 text-green-600" />
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Entrate</div>
          </div>
          <div className="font-mono-data text-2xl font-semibold text-green-700">{formatEUR(totals.entrate)}</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-sm p-5 card-hover">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpCircle className="w-4 h-4 text-red-600" />
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Uscite</div>
          </div>
          <div className="font-mono-data text-2xl font-semibold text-red-700">{formatEUR(totals.uscite)}</div>
        </div>
        <div className="bg-white border border-zinc-200 rounded-sm p-5 card-hover">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold mb-2">Saldo netto</div>
          <div className={`font-mono-data text-2xl font-semibold ${totals.saldo >= 0 ? "text-zinc-900" : "text-red-700"}`} data-testid="movimenti-saldo">{formatEUR(totals.saldo)}</div>
        </div>
      </div>

      <Card>
        <CardHeader
          title={`${filtered.length} movimenti`}
          subtitle="Registro cassa"
          action={
            <Select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="tutti">Tutti</option>
              <option value="entrata">Solo entrate</option>
              <option value="uscita">Solo uscite</option>
            </Select>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="movimenti-table">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                <th className="text-left px-5 py-3 font-semibold">Data</th>
                <th className="text-left px-5 py-3 font-semibold">Tipo</th>
                <th className="text-left px-5 py-3 font-semibold">Categoria</th>
                <th className="text-left px-5 py-3 font-semibold">Descrizione</th>
                <th className="text-left px-5 py-3 font-semibold">Cantiere</th>
                <th className="text-right px-5 py-3 font-semibold">Importo</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-12 text-zinc-500">Nessun movimento</td></tr>}
              {filtered.map((m, idx) => (
                <tr key={m.id} className={idx % 2 ? "bg-zinc-50/40" : ""}>
                  <td className="px-5 py-3 font-mono-data text-zinc-600">{formatDate(m.data)}</td>
                  <td className="px-5 py-3"><Badge variant={m.tipo === "entrata" ? "success" : "danger"}>{m.tipo}</Badge></td>
                  <td className="px-5 py-3 text-zinc-700">{m.categoria}</td>
                  <td className="px-5 py-3 text-zinc-900">{m.descrizione}</td>
                  <td className="px-5 py-3 text-zinc-500 text-xs">{m.cantiere_id ? cantiereName(m.cantiere_id) : "—"}</td>
                  <td className={`px-5 py-3 text-right font-mono-data font-semibold ${m.tipo === "entrata" ? "text-green-700" : "text-red-700"}`}>
                    {m.tipo === "entrata" ? "+" : "−"}{formatEUR(m.importo)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => onDelete(m.id)} className="text-zinc-400 hover:text-red-600" data-testid={`movimento-delete-${m.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo movimento" testid="movimento-modal">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Data *" type="date" required value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            <Select label="Tipo *" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, categoria: e.target.value === "entrata" ? CATEGORIE_ENTRATA[0] : CATEGORIE_USCITA[0] })}>
              <option value="entrata">Entrata</option>
              <option value="uscita">Uscita</option>
            </Select>
            <Select label="Categoria *" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {categorieList.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Importo (€) *" type="number" step="0.01" required value={form.importo} onChange={(e) => setForm({ ...form, importo: e.target.value })} testid="movimento-input-importo" />
            <Input label="Descrizione *" required value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} className="md:col-span-2" testid="movimento-input-descrizione" />
            <Select label="Cantiere collegato" value={form.cantiere_id} onChange={(e) => setForm({ ...form, cantiere_id: e.target.value })}>
              <option value="">Nessuno</option>
              {cantieri.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Metodo pagamento" value={form.metodo_pagamento} onChange={(e) => setForm({ ...form, metodo_pagamento: e.target.value })}>
              <option value="bonifico">Bonifico</option>
              <option value="contanti">Contanti</option>
              <option value="assegno">Assegno</option>
              <option value="carta">Carta</option>
              <option value="POS">POS</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="submit" data-testid="movimento-submit-btn">Registra movimento</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
