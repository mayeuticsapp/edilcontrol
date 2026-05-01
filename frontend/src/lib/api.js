import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("edilcontrol_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (resp) => resp,
  (err) => {
    if (err.response?.status === 401) {
      const onLogin = window.location.pathname === "/login";
      localStorage.removeItem("edilcontrol_token");
      localStorage.removeItem("edilcontrol_user");
      if (!onLogin) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const formatEUR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
};

export const formatEURPrecise = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

export const formatPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
};

export const formatDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; }
};

export const formatMonth = (yyyymm) => {
  if (!yyyymm) return "—";
  const [y, m] = yyyymm.split("-");
  const months = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};
