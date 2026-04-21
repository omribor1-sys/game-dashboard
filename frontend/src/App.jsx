import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import UploadGame from './pages/UploadGame';
import GameDetail from './pages/GameDetail';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';
import AddInventory from './pages/AddInventory';
import BulkImport from './pages/BulkImport';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

// ── Protected route wrapper ──────────────────────────────────────────────────

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (user === undefined) {
    // Still loading — show blank (avoids flash)
    return <div style={{ minHeight: '100vh', background: '#0f1117' }} />;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ open, onClose }) {
  const location = useLocation();
  const { user, logout } = useAuth();

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

        {/* ── User / Logout ─────────────────────────── */}
        {user && (
          <div style={{
            marginTop: 'auto',
            padding: '16px',
            borderTop: '1px solid #2a2d3a',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              Signed in as <strong style={{ color: '#94a3b8' }}>{user.username}</strong>
            </div>
            <button
              onClick={() => { logout(); onClose(); }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid #2a2d3a',
                borderRadius: 6,
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        )}
      </nav>
    </>
  );
}

// ── App shell (inside AuthProvider) ──────────────────────────────────────────

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes */}
      <Route path="/*" element={
        <ProtectedRoute>
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
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
