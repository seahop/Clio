// frontend/src/components/UserMenu.jsx
// Top-right account menu: avatar trigger + click dropdown. Holds the user's
// identity, Settings, an admin-only "Admin & config" section (relocated from
// the nav bar to declutter it), an About dialog, and session actions.
import React, { useState, useRef, useEffect } from 'react';
import {
  Settings,
  LogOut,
  ChevronDown,
  ShieldOff,
  Info,
  HardDrive,
  Key,
  Book,
  Shield,
} from 'lucide-react';
import { APP_VERSION, REPO_URL } from '../version';

const initials = (name = '') => name.trim().slice(0, 2).toUpperCase() || '?';

// Admin-only items moved out of the main nav to reduce clutter. `view` matches
// the activeView switch in RedTeamLogger.
const ADMIN_ITEMS = [
  { view: 'logs-management', label: 'Log Management', icon: HardDrive },
  { view: 'api-keys', label: 'API Keys', icon: Key },
  { view: 'api-docs', label: 'API Docs', icon: Book },
  { view: 'certificates', label: 'Certificates', icon: Shield },
];

const MenuItem = ({ icon: Icon, label, onClick }) => (
  <button
    role="menuitem"
    onClick={onClick}
    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content hover:bg-surface-3 text-left transition-colors"
  >
    <Icon size={16} className="text-muted flex-shrink-0" />
    {label}
  </button>
);

const UserMenu = ({ user, isAdmin, onOpenSettings, onNavigate, onSignOutEverywhere, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAboutOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const go = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account menu"
      >
        <span className="w-7 h-7 rounded-full bg-accent/20 text-accent text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {initials(user?.username)}
        </span>
        <span className="text-sm text-content truncate max-w-[9rem] hidden md:inline">
          {user?.username}
        </span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 bg-surface border border-line rounded-card shadow-pop z-40 py-1 animate-fade-in max-h-[80vh] overflow-y-auto"
        >
          <div className="px-3 py-2 border-b border-line">
            <div className="text-sm font-medium text-content truncate">{user?.username}</div>
            <div className="mt-1">
              <span
                className={`text-2xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
                  isAdmin
                    ? 'bg-danger/15 text-danger border-danger/30'
                    : 'bg-surface-3 text-muted border-line'
                }`}
              >
                {isAdmin ? 'Admin' : 'User'}
              </span>
            </div>
          </div>

          <MenuItem icon={Settings} label="Settings" onClick={go(onOpenSettings)} />

          {isAdmin && (
            <>
              <div className="mt-1 pt-1 border-t border-line">
                <div className="px-3 py-1 text-2xs uppercase tracking-wider text-faint">
                  Admin &amp; config
                </div>
                {ADMIN_ITEMS.map((it) => (
                  <MenuItem
                    key={it.view}
                    icon={it.icon}
                    label={it.label}
                    onClick={go(() => onNavigate(it.view))}
                  />
                ))}
              </div>
            </>
          )}

          <div className="mt-1 pt-1 border-t border-line">
            <MenuItem icon={Info} label="About Clio" onClick={() => setAboutOpen(true)} />
            <MenuItem
              icon={ShieldOff}
              label="Sign out everywhere"
              onClick={go(onSignOutEverywhere)}
            />
            <MenuItem icon={LogOut} label="Logout" onClick={go(onLogout)} />
          </div>
        </div>
      )}

      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAboutOpen(false);
          }}
        >
          <div className="w-full max-w-sm bg-surface border border-line rounded-card shadow-pop p-5 animate-fade-in">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-content">Clio</h2>
              <span className="text-sm text-muted font-mono">v{APP_VERSION}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Red-team engagement logging &amp; relationship analysis platform.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-accent hover:underline"
            >
              Project on GitHub &rarr;
            </a>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setAboutOpen(false)}
                className="px-3 py-1.5 text-sm bg-surface-2 text-content border border-line rounded-md hover:bg-surface-3 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
