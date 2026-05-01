import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, HardHat, Wallet, Calculator, LineChart, Settings, Sparkles, Building2, LogOut, User } from "lucide-react";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/cantieri", label: "Cantieri", icon: HardHat, testid: "nav-cantieri" },
  { to: "/movimenti", label: "Cash Flow", icon: Wallet, testid: "nav-movimenti" },
  { to: "/break-even", label: "Break Even", icon: Calculator, testid: "nav-break-even" },
  { to: "/ebitda", label: "EBITDA", icon: LineChart, testid: "nav-ebitda" },
  { to: "/costi-fissi", label: "Costi Fissi", icon: Settings, testid: "nav-costi-fissi" },
  { to: "/ai-advisor", label: "Consulente AI", icon: Sparkles, testid: "nav-ai-advisor" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 bg-zinc-950 text-zinc-50 flex flex-col h-screen sticky top-0 border-r border-zinc-900" data-testid="sidebar">
      <div className="px-5 py-6 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#0F4C81] flex items-center justify-center">
            <Building2 className="w-4 h-4 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <div className="font-display font-bold text-lg leading-none tracking-tight">EdilControl</div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mt-1">Finance OS</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-600 px-3 py-2">Pannello</div>
        {navItems.map(({ to, label, icon: Icon, testid }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={testid}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[#0F4C81] text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`
            }
          >
            <Icon className="w-4 h-4" strokeWidth={1.75} />
            <span className="flex-1">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-800">
        {user && (
          <div className="px-4 py-3 flex items-center gap-2.5 border-b border-zinc-900" data-testid="sidebar-user">
            <div className="w-7 h-7 bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user.username}</div>
              <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{user.role}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full px-4 py-3 flex items-center gap-3 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-red-400 transition-colors"
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.75} />
          <span>Esci</span>
        </button>
        <div className="px-4 py-2 text-[10px] uppercase tracking-[0.15em] text-zinc-700 border-t border-zinc-900">
          v1.1 · Gen 2026
        </div>
      </div>
    </aside>
  );
}
