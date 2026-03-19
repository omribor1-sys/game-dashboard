import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import UploadGame from './pages/UploadGame';
import GameDetail from './pages/GameDetail';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import AddInventory from './pages/AddInventory';
import BulkImport from './pages/BulkImport';

function Sidebar({ open, onClose }) {
  const [inventoryGames, setInventoryGames] = useState([]);
  const location = useLocation();

  useEffect(() => {
    fetch('/api/inventory/games')
      .then(r => r.json())
      .then(data => setInventoryGames(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className={`overlay ${open ? 'show' : ''}`} onClick={onClose} />
      <nav className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>⚽ Game Profitability</h1>
          <span>Dashboard</span>
        </div>
        <div className="sidebar-nav">
          {/* ── Analytics ─────────────────────────────── */}
          <div className="sidebar-section-label">Analytics</div>

          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            Dashboard
          </NavLink>

          <NavLink to="/upload" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Add Game
          </NavLink>

          {/* ── Inventory ─────────────────────────────── */}
          <div className="sidebar-section-label" style={{ marginTop: 8 }}>Inventory</div>

          <NavLink to="/inventory" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
              <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
            </svg>
            All Inventory
          </NavLink>


          <NavLink to="/orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/>
            </svg>
            Orders
          </NavLink>
        </div>
      </nav>
    </>
  );
}

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="layout">
        <button className="menu-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<UploadGame />} />
            <Route path="/game/:id" element={<GameDetail />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/add" element={<AddInventory />} />
            <Route path="/inventory/bulk-import" element={<BulkImport />} />
            <Route path="/orders" element={<Orders />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
