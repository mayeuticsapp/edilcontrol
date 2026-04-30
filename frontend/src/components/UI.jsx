import React from "react";

export function Card({ children, className = "", ...rest }) {
  return (
    <div className={`bg-white border border-zinc-200 rounded-sm ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, testid }) {
  return (
    <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-200" data-testid={testid}>
      <div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">{subtitle}</div>
        <h3 className="font-display text-lg font-bold tracking-tight text-zinc-900 mt-0.5">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, status, icon: Icon, testid }) {
  const statusColors = {
    ottimo: "bg-green-50 text-green-700 border-green-200",
    buono: "bg-emerald-50 text-emerald-700 border-emerald-200",
    attenzione: "bg-amber-50 text-amber-700 border-amber-200",
    critico: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <div className="bg-white border border-zinc-200 rounded-sm p-5 card-hover" data-testid={testid}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-zinc-400" strokeWidth={1.75} />}
      </div>
      <div className="font-mono-data text-2xl font-semibold text-zinc-900 tracking-tight">{value}</div>
      {(sub || status) && (
        <div className="flex items-center gap-2 mt-2">
          {status && (
            <span className={`text-[9px] uppercase tracking-wider font-semibold border px-1.5 py-0.5 ${statusColors[status] || statusColors.attenzione}`}>
              {status}
            </span>
          )}
          {sub && <div className="text-xs text-zinc-500">{sub}</div>}
        </div>
      )}
    </div>
  );
}

export function Button({ children, variant = "primary", className = "", ...rest }) {
  const variants = {
    primary: "bg-[#0F4C81] hover:bg-[#0C3D66] text-white",
    ghost: "bg-transparent hover:bg-zinc-100 text-zinc-700 border border-zinc-200",
    danger: "bg-red-600 hover:bg-red-700 text-white",
  };
  return (
    <button
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm transition-colors focus:ring-2 focus:ring-[#0F4C81] focus:ring-offset-2 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ label, testid, className = "", ...rest }) {
  return (
    <label className="block">
      {label && <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold block mb-1.5">{label}</span>}
      <input
        data-testid={testid}
        className={`w-full px-3 py-2 text-sm border border-zinc-300 rounded-sm bg-white focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none font-mono-data ${className}`}
        {...rest}
      />
    </label>
  );
}

export function Select({ label, testid, children, className = "", ...rest }) {
  return (
    <label className="block">
      {label && <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold block mb-1.5">{label}</span>}
      <select
        data-testid={testid}
        className={`w-full px-3 py-2 text-sm border border-zinc-300 rounded-sm bg-white focus:border-[#0F4C81] focus:ring-1 focus:ring-[#0F4C81] focus:outline-none ${className}`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Modal({ open, onClose, title, children, testid }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60" onClick={onClose} data-testid={testid}>
      <div className="bg-white border border-zinc-200 rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200">
          <h3 className="font-display text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-900 text-xl leading-none" data-testid="modal-close">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, variant = "default" }) {
  const variants = {
    default: "bg-zinc-100 text-zinc-700 border-zinc-200",
    success: "bg-green-50 text-green-700 border-green-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`text-[9px] uppercase tracking-wider font-semibold border px-1.5 py-0.5 font-mono ${variants[variant]}`}>
      {children}
    </span>
  );
}
