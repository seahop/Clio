// frontend/src/components/RedTeamLogger.jsx - Updated with Operations tab
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ScrollText, Network, File, Database, Users, Key, Book, HardDrive, Settings, Shield, Briefcase, UserPlus, Tags, LayoutDashboard, Clock, Crosshair, ChevronDown } from 'lucide-react';
import LoggerCardView from './LoggerCardView';
import RelationViewer from './RelationViewer';
import FileStatusTracker from './FileStatusTracker';
import ExportDatabasePanel from './export/ExportDatabasePanel';
import SessionManagement from './SessionManagement';
import ApiKeyManager from './api-keys/ApiKeyManager';
import ApiDocumentation from './ApiDocumentation';
import LogManagement from './LogManagement';
import UserSettings from './UserSettings';
import CertificateManager from './CertificateManager';
import UserManagement from './UserManagement';
import { OperationsManagement } from './Operations';
import UntaggedTriage from './UntaggedTriage';
import AuditLogViewer from './AuditLogViewer';
import Dashboard from './Dashboard';
import Timeline from './Timeline';
import DeconflictionExport from './DeconflictionExport';
import MitreCoverage from './MitreCoverage';
import useLoggerOperations from '../hooks/useLoggerOperations';

// Everyone sees the first group; the second is admin-only.
const NAV_ITEMS = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'logs', label: 'Logs', icon: ScrollText },
  { view: 'relations', label: 'Relations', icon: Network },
  { view: 'timeline', label: 'Timeline', icon: Clock },
  { view: 'attack', label: 'ATT&CK', icon: Crosshair },
  { view: 'files', label: 'File Status', icon: File },
  { view: 'settings', label: 'Settings', icon: Settings },
  { view: 'export', label: 'Export', icon: Database },
];

const ADMIN_NAV_ITEMS = [
  { view: 'operations', label: 'Operations', icon: Briefcase },
  { view: 'untagged', label: 'Untagged', icon: Tags },
  { view: 'audit', label: 'Audit Log', icon: ScrollText },
  { view: 'logs-management', label: 'Log Management', icon: HardDrive },
  { view: 'sessions', label: 'Sessions', icon: Users },
  { view: 'users', label: 'Users', icon: UserPlus },
  { view: 'api-keys', label: 'API Keys', icon: Key },
  { view: 'api-docs', label: 'API Docs', icon: Book },
  { view: 'certificates', label: 'Certificates', icon: Shield },
];

const NavTab = ({ item, active, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 -mb-px flex items-center gap-1.5 text-sm whitespace-nowrap flex-shrink-0 border-b-2 transition-colors duration-150 ${
        active
          ? 'border-accent text-content'
          : 'border-transparent text-muted hover:text-content hover:border-line-strong'
      }`}
    >
      <Icon size={15} />
      <span>{item.label}</span>
    </button>
  );
};

// Nav that keeps tabs on one line and collapses whatever doesn't fit into a
// "More ▾" dropdown, remeasuring on resize. A hidden row is measured so we
// always know each tab's width even when it's currently in the overflow menu.
const ResponsiveNav = ({ items, activeView, onSelect }) => {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const moreRef = useRef(null);
  const widthsRef = useRef([]);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [moreOpen, setMoreOpen] = useState(false);

  useLayoutEffect(() => {
    const compute = () => {
      const el = containerRef.current;
      if (!el) return;
      if (measureRef.current) {
        widthsRef.current = Array.from(measureRef.current.children).map(c => Math.ceil(c.getBoundingClientRect().width));
      }
      const widths = widthsRef.current;
      const avail = el.clientWidth;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= avail) { setVisibleCount(items.length); return; }
      const MORE = 88; // reserve for the "More" button
      let used = 0, count = 0;
      for (let i = 0; i < widths.length; i++) {
        if (used + widths[i] <= avail - MORE) { used += widths[i]; count++; } else break;
      }
      setVisibleCount(Math.max(1, count));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [items]);

  useEffect(() => {
    const onClick = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);
  const activeInOverflow = overflow.some(i => i.view === activeView);

  return (
    <div ref={containerRef} className="relative flex items-stretch border-b border-line">
      {/* hidden measurement row — mirrors the real tabs so widths are accurate */}
      <div ref={measureRef} className="absolute -top-96 left-0 flex invisible pointer-events-none" aria-hidden>
        {items.map(it => <NavTab key={it.view} item={it} active={false} onClick={() => {}} />)}
      </div>

      {visible.map(it => (
        <NavTab key={it.view} item={it} active={activeView === it.view} onClick={() => onSelect(it.view)} />
      ))}

      {overflow.length > 0 && (
        <div ref={moreRef} className="relative flex items-stretch">
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`px-3 py-2.5 -mb-px flex items-center gap-1 text-sm whitespace-nowrap border-b-2 transition-colors ${
              activeInOverflow ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content hover:border-line-strong'
            }`}
          >
            More <ChevronDown size={14} className={moreOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-surface border border-line rounded-card shadow-pop z-30 py-1 animate-fade-in">
              {overflow.map(it => {
                const Icon = it.icon;
                return (
                  <button key={it.view}
                    onClick={() => { onSelect(it.view); setMoreOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                      activeView === it.view ? 'text-accent bg-surface-3' : 'text-muted hover:text-content hover:bg-surface-3'
                    }`}>
                    <Icon size={15} /> {it.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Simple card wrapper shared by every non-log view
const Panel = ({ children }) => (
  <div className="w-full animate-fade-in">
    <div className="bg-surface border border-line rounded-card shadow-card p-4">
      {children}
    </div>
  </div>
);

const RedTeamLogger = ({ currentUser, csrfToken }) => {
  const [activeView, setActiveView] = useState('dashboard');

  const {
    logs,
    loading,
    error,
    isAdmin,
    tableState,
    handlers
  } = useLoggerOperations(currentUser, csrfToken);

  if (loading) return <div className="p-4 text-white">Loading...</div>;

  const navItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  return (
    <div className="w-full px-2 sm:px-4">
      {error && (
        <div className="mb-4 p-3 bg-red-900 text-red-200 rounded-md">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* View tabs — collapse overflow into a "More" dropdown at narrow widths */}
        <ResponsiveNav items={navItems} activeView={activeView} onSelect={setActiveView} />

        {activeView === 'dashboard' && (
          <div className="w-full animate-fade-in">
            <Dashboard currentUser={currentUser} />
          </div>
        )}

        {activeView === 'logs' && (
          <LoggerCardView
            logs={logs}
            isAdmin={isAdmin}
            currentUser={currentUser.username}
            tableState={tableState}
            handlers={handlers}
            csrfToken={csrfToken}
          />
        )}

        {activeView === 'relations' && (
          <div className="w-full">
            <RelationViewer csrfToken={csrfToken} />
          </div>
        )}

        {activeView === 'timeline' && (
          <div className="w-full animate-fade-in">
            <Timeline csrfToken={csrfToken} />
          </div>
        )}

        {activeView === 'attack' && (
          <div className="w-full animate-fade-in">
            <MitreCoverage />
          </div>
        )}

        {activeView === 'files' && (
          <div className="w-full">
            <FileStatusTracker csrfToken={csrfToken} />
          </div>
        )}

        {/* User Settings View - Available to all users */}
        {activeView === 'settings' && (
          <Panel>
            <UserSettings currentUser={currentUser} csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'export' && (
          <div className="w-full space-y-4 animate-fade-in">
            <Panel>
              <ExportDatabasePanel csrfToken={csrfToken} isAdmin={isAdmin} />
            </Panel>
            <DeconflictionExport />
          </div>
        )}

        {/* Admin Views */}
        {activeView === 'operations' && isAdmin && (
          <Panel>
            <OperationsManagement csrfToken={csrfToken} currentUser={currentUser} />
          </Panel>
        )}

        {activeView === 'untagged' && isAdmin && (
          <div className="w-full animate-fade-in">
            <UntaggedTriage csrfToken={csrfToken} />
          </div>
        )}

        {activeView === 'audit' && isAdmin && (
          <div className="w-full animate-fade-in">
            <AuditLogViewer />
          </div>
        )}

        {activeView === 'logs-management' && isAdmin && (
          <Panel>
            <LogManagement csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'sessions' && isAdmin && (
          <Panel>
            <SessionManagement csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'users' && isAdmin && (
          <Panel>
            <UserManagement csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'api-keys' && isAdmin && (
          <Panel>
            <ApiKeyManager csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'api-docs' && isAdmin && (
          <Panel>
            <ApiDocumentation csrfToken={csrfToken} />
          </Panel>
        )}

        {activeView === 'certificates' && isAdmin && (
          <Panel>
            <CertificateManager csrfToken={csrfToken} />
          </Panel>
        )}
      </div>
    </div>
  );
};

export default RedTeamLogger;
