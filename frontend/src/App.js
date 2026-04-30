import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Cantieri from "./pages/Cantieri";
import Movimenti from "./pages/Movimenti";
import BreakEven from "./pages/BreakEven";
import EBITDA from "./pages/EBITDA";
import CostiFissi from "./pages/CostiFissi";
import AIAdvisor from "./pages/AIAdvisor";

function App() {
  return (
    <div className="App flex bg-zinc-50 min-h-screen">
      <BrowserRouter>
        <Sidebar />
        <main className="flex-1 overflow-x-hidden" data-testid="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cantieri" element={<Cantieri />} />
            <Route path="/movimenti" element={<Movimenti />} />
            <Route path="/break-even" element={<BreakEven />} />
            <Route path="/ebitda" element={<EBITDA />} />
            <Route path="/costi-fissi" element={<CostiFissi />} />
            <Route path="/ai-advisor" element={<AIAdvisor />} />
          </Routes>
        </main>
      </BrowserRouter>
    </div>
  );
}

export default App;
