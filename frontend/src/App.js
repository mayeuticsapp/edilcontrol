import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "./lib/auth";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cantieri from "./pages/Cantieri";
import Movimenti from "./pages/Movimenti";
import BreakEven from "./pages/BreakEven";
import EBITDA from "./pages/EBITDA";
import CostiFissi from "./pages/CostiFissi";
import AIAdvisor from "./pages/AIAdvisor";

function ProtectedLayout({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 text-zinc-500" data-testid="auth-loading">Verifica accesso...</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <div className="flex bg-zinc-50 min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
            <Route path="/cantieri" element={<ProtectedLayout><Cantieri /></ProtectedLayout>} />
            <Route path="/movimenti" element={<ProtectedLayout><Movimenti /></ProtectedLayout>} />
            <Route path="/break-even" element={<ProtectedLayout><BreakEven /></ProtectedLayout>} />
            <Route path="/ebitda" element={<ProtectedLayout><EBITDA /></ProtectedLayout>} />
            <Route path="/costi-fissi" element={<ProtectedLayout><CostiFissi /></ProtectedLayout>} />
            <Route path="/ai-advisor" element={<ProtectedLayout><AIAdvisor /></ProtectedLayout>} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
