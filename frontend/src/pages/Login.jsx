import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Building2, Lock, User, Loader2 } from "lucide-react";

export default function Login() {
  const { login, user, loading } = useAuth();
  const [username, setUsername] = useState("Albertoadminapp");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">Caricamento...</div>;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Errore di accesso");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-50" data-testid="login-page">
      {/* Left: branding panel */}
      <div className="hidden lg:flex flex-col w-1/2 p-12 border-r border-zinc-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#0F4C81] flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-display font-bold text-2xl tracking-tight">EdilControl</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-0.5">Finance OS · Settore Edile</div>
          </div>
        </div>

        <div className="relative z-10 mt-auto">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Pannello di controllo finanziario</div>
          <h1 className="font-display text-4xl xl:text-5xl font-bold tracking-tight mt-3 leading-[1.05]">
            Numeri sotto controllo.<br />
            <span className="text-zinc-400">Decisioni più solide.</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-5 max-w-md">
            EBITDA, cash flow, margini per cantiere, break even point e un consulente AI dedicato — tutto in un'unica vista pulita.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-6 max-w-md">
            <Stat n="100%" l="Privato" />
            <Stat n="24/7" l="Disponibile" />
            <Stat n="AI" l="Integrata" />
          </div>
        </div>

        <div className="relative z-10 text-[10px] uppercase tracking-[0.15em] text-zinc-600 mt-12">
          v1.1 · Accesso protetto
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-white text-zinc-900">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-8 h-8 bg-[#0F4C81] flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" strokeWidth={2.25} />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none tracking-tight">EdilControl</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-1">Finance OS</div>
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">Accesso riservato</div>
          <h2 className="font-display text-3xl font-bold tracking-tight mt-1">Bentornato</h2>
          <p className="text-sm text-zinc-500 mt-2">Inserisci le tue credenziali per accedere al pannello.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="login-form">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold block mb-1.5">Username</span>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" strokeWidth={1.75} />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-sm border border-zinc-300 rounded-sm bg-white focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none"
                  data-testid="login-username"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold block mb-1.5">Password</span>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" strokeWidth={1.75} />
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 text-sm border border-zinc-300 rounded-sm bg-white focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none"
                  data-testid="login-password"
                />
              </div>
            </label>

            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-sm" data-testid="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0F4C81] hover:bg-[#0C3D66] text-white text-sm font-medium py-2.5 rounded-sm transition-colors focus:ring-2 focus:ring-[#0F4C81] focus:ring-offset-2 focus:outline-none disabled:opacity-60 inline-flex items-center justify-center gap-2"
              data-testid="login-submit"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifica in corso...</> : "Accedi"}
            </button>
          </form>

          <div className="mt-10 text-xs text-zinc-500 border-t border-zinc-200 pt-5">
            🔒 Sessione cifrata · JWT 24h · Dati riservati al titolare dell'impresa.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold text-zinc-100">{n}</div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-1">{l}</div>
    </div>
  );
}
