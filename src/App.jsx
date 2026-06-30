import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, Download, Eye, FileCheck2, Grid3X3, Lock, LogOut, Search, Settings, Users, X } from 'lucide-react';
import { firebaseReady } from './firebase/firebase';
import { ensureCurrentUserProfile, listenAuth, logout } from './services/authService';
import { listenButtons } from './services/buttonsService';
import { listenSchedule, resolveScheduleForCurrentWeek } from './services/scheduleService';
import { listenUsers } from './services/usersService';
import { listenCertificates } from './services/certificatesService';
import { listenLockers } from './services/lockersService';
import { DEFAULT_MANAGER_SETTINGS, listenManagerSettings } from './services/managerConfigService';
import { ROLES, getInitials, normalizeKey, normalizeText } from './utils/normalize';
import { assetUrl } from './utils/assets';
import LoginScreen from './components/LoginScreen';
import ButtonGrid from './components/ButtonGrid';
import ScheduleWidget from './components/ScheduleWidget';
import AssistantSchedule from './components/AssistantSchedule';
import AdminSchedule from './components/AdminSchedule';
import UsersAdmin from './components/UsersAdmin';
import DataManager from './components/DataManager';
import ManagerSettings from './components/ManagerSettings';
import CertificatesManager from './components/CertificatesManager';
import LockersManager from './components/LockersManager';
import WorkNotes from './components/WorkNotes';

const NAV_ITEMS = [
  { id: 'tools', label: 'Herramientas', icon: Grid3X3, roles: ['*'] },
  { id: 'my-schedule', label: 'Mi horario', icon: CalendarDays, roles: ['asistente'] },
  { id: 'admin-schedule', label: 'Gestionar horario', icon: CalendarDays, roles: ['admin'] },
  { id: 'certificates', label: 'Certificados', icon: FileCheck2, roles: ['admin', 'asistente'] },
  { id: 'lockers', label: 'MusiLockers', icon: Lock, roles: ['admin', 'asistente'] },
  { id: 'data', label: 'Botones', icon: Download, roles: ['admin'] },
  { id: 'users', label: 'Usuarios', icon: Users, roles: ['admin'] },
  { id: 'settings', label: 'Configuracion', icon: Settings, roles: ['admin'] }
];

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [baseProfile, setBaseProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [buttons, setButtons] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [users, setUsers] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [activeView, setActiveView] = useState('tools');
  const [search, setSearch] = useState('');
  const [managerSettings, setManagerSettings] = useState(DEFAULT_MANAGER_SETTINGS);
  const [previewUserId, setPreviewUserId] = useState('');

  useEffect(() => {
    if (!firebaseReady) {
      setAuthLoading(false);
      return undefined;
    }

    return listenAuth(async user => {
      setAuthLoading(true);
      setProfileError('');
      try {
        setAuthUser(user);
        if (user) {
          const ensured = await ensureCurrentUserProfile(user);
          setBaseProfile(ensured);
          setProfile(ensured);
        } else {
          setProfile(null);
          setBaseProfile(null);
        }
      } catch (error) {
        setProfileError(error.message || 'No se pudo cargar el perfil.');
      } finally {
        setAuthLoading(false);
      }
    });
  }, []);

  const isAdmin = profile?.role === ROLES.ADMIN;
  const isActive = Boolean(profile?.active || isAdmin);

  useEffect(() => {
    if (!isActive) return undefined;
    const unsubButtons = listenButtons(setButtons);
    const unsubSchedule = listenSchedule(setSchedule);
    const unsubUsers = isAdmin ? listenUsers(setUsers) : () => {};
    const unsubCertificates = listenCertificates(setCertificates);
    const unsubLockers = listenLockers(setLockers);
    const unsubSettings = listenManagerSettings(setManagerSettings);
    return () => {
      unsubButtons();
      unsubSchedule();
      unsubUsers();
      unsubCertificates();
      unsubLockers();
      unsubSettings();
    };
  }, [isActive, isAdmin]);

  const previewUsers = useMemo(() => {
    return users
      .filter(user => user.active !== false)
      .filter(user => user.role === ROLES.ASISTENTE)
      .map(user => ({
        ...user,
        id: user.id,
        displayName: user.displayName || user.username || user.email,
        assistantName: user.displayName || user.username || user.email,
        assistantUsername: user.username || user.legacyUsername || '',
        role: ROLES.ASISTENTE
      }))
      .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'es'));
  }, [users]);

  const previewProfile = useMemo(() => {
    if (!isAdmin || !previewUserId) return null;
    const selected = previewUsers.find(user => user.id === previewUserId);
    if (!selected) return null;
    return {
      ...selected,
      id: `preview:${selected.id}`,
      previewing: true,
      email: selected.email || '',
      active: true,
      pending: false,
      buttonAccess: Array.isArray(selected.buttonAccess) ? selected.buttonAccess : []
    };
  }, [isAdmin, previewUserId, previewUsers]);

  const effectiveProfile = previewProfile || profile;
  const effectiveIsAdmin = !previewProfile && isAdmin;

  useEffect(() => {
    if (previewProfile && !NAV_ITEMS.find(item => item.id === activeView)?.roles.includes(ROLES.ASISTENTE) && activeView !== 'tools') {
      setActiveView('tools');
    }
  }, [previewProfile, activeView]);

  const visibleNav = useMemo(() => {
    if (!effectiveProfile) return [];
    return NAV_ITEMS.filter(item => item.roles.includes('*') || item.roles.includes(effectiveProfile.role));
  }, [effectiveProfile]);

  const visibleButtons = useMemo(() => {
    const activeButtons = buttons.filter(button => button.active !== false);
    if (effectiveIsAdmin) return activeButtons;
    const access = Array.isArray(effectiveProfile?.buttonAccess) ? effectiveProfile.buttonAccess : [];
    if (access.includes('*')) return activeButtons;
    const normalizedAccess = new Set(access.map(value => normalizeKey(value)));
    return activeButtons.filter(button => {
      return normalizedAccess.has(normalizeKey(button.id)) || normalizedAccess.has(normalizeKey(button.name));
    });
  }, [buttons, effectiveIsAdmin, effectiveProfile?.buttonAccess]);

  const currentUserName = normalizeText(effectiveProfile?.displayName || authUser?.displayName || authUser?.email);
  const scenarioSchedule = useMemo(() => {
    const activeScenario = normalizeText(managerSettings.activeScenario || 'normal').toLowerCase();
    const scenarioRows = schedule.filter(item => normalizeText(item.scenario || 'normal').toLowerCase() === activeScenario);
    return resolveScheduleForCurrentWeek(scenarioRows);
  }, [schedule, managerSettings.activeScenario]);
  const canManageCertificates = effectiveProfile?.role === ROLES.ADMIN || effectiveProfile?.role === ROLES.ASISTENTE;
  const pendingCertificatesCount = useMemo(() => {
    return certificates.filter(item => (item.status || 'pendiente') === 'pendiente').length;
  }, [certificates]);

  if (!firebaseReady) return <ConfigMissing />;
  if (authLoading) return <LoadingScreen text="Cargando Musicala Manager..." />;
  if (!authUser) return <LoginScreen />;

  if (profileError) {
    return (
      <div className="center-shell">
        <div className="empty-card danger">
          <AlertTriangle size={32} />
          <h1>No se pudo cargar tu perfil</h1>
          <p>{profileError}</p>
          <button className="btn primary" onClick={logout}>Cerrar sesion</button>
        </div>
      </div>
    );
  }

  if (!isActive) return <PendingScreen user={authUser} profile={profile} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <img className="brand-logo-img" src={assetUrl('logo.png')} alt="Musicala" />
          <div>
            <strong>Musicala Manager</strong>
            <span>Firebase</span>
          </div>
        </div>

        {activeView === 'tools' && (
          <div className="search-wrap">
            <Search className="search-icon" size={20} />
            <input
              className="search-input"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar herramienta..."
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')} title="Limpiar busqueda">
                <X size={14} />
              </button>
            )}
          </div>
        )}

        <div className="topbar-right">
          <span className="topbar-name">{currentUserName}</span>
          <div className="avatar">{getInitials(currentUserName)}</div>
          <button className="icon-btn" onClick={logout} title="Cerrar sesion">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="accent-strip" />

      <main className="main-content">
        <div className="page-shell">
          <nav className="nav-list">
            {visibleNav.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                  onClick={() => setActiveView(item.id)}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {item.id === 'certificates' && pendingCertificatesCount > 0 && (
                    <span className="nav-badge">{pendingCertificatesCount}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="page-label">
            <span>{getViewTitle(activeView)}</span>
          </div>

          {isAdmin && !previewProfile && (
            <div className="preview-toolbar">
              <Eye size={18} />
              <span>Ver aplicativo como</span>
              <select value={previewUserId} onChange={event => setPreviewUserId(event.target.value)}>
                <option value="">Administrador</option>
                {previewUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {previewProfile && (
            <div className="preview-toolbar active">
              <Eye size={18} />
              <span>Estas viendo el aplicativo como {previewProfile.displayName}</span>
              <button className="btn ghost" onClick={() => setPreviewUserId('')}>Volver a admin</button>
            </div>
          )}

          {(effectiveProfile.role === ROLES.ADMIN || effectiveProfile.role === ROLES.ASISTENTE) && (
            <ScheduleWidget schedule={scenarioSchedule} user={effectiveProfile} settings={managerSettings} />
          )}

          {activeView === 'tools' && (
            <ButtonGrid buttons={visibleButtons} search={search} onOpenWorkNotes={() => setActiveView('work-notes')} />
          )}
          {activeView === 'work-notes' && canManageCertificates && (
            <WorkNotes authUser={authUser} userName={currentUserName} isAdmin={effectiveIsAdmin} />
          )}
          {activeView === 'my-schedule' && <AssistantSchedule schedule={scenarioSchedule} user={effectiveProfile} settings={managerSettings} />}
          {activeView === 'admin-schedule' && effectiveIsAdmin && <AdminSchedule schedule={scenarioSchedule} allSchedule={schedule} users={users} settings={managerSettings} />}
          {activeView === 'certificates' && canManageCertificates && (
            <CertificatesManager certificates={certificates} currentUserName={currentUserName} canManage={canManageCertificates} />
          )}
          {activeView === 'lockers' && canManageCertificates && (
            <LockersManager lockers={lockers} currentUserName={currentUserName} canManage={canManageCertificates} />
          )}
          {activeView === 'data' && effectiveIsAdmin && <DataManager buttons={buttons} settings={managerSettings} />}
          {activeView === 'users' && effectiveIsAdmin && <UsersAdmin users={users} buttons={buttons} />}
          {activeView === 'settings' && effectiveIsAdmin && <ManagerSettings users={users} />}
        </div>
      </main>
    </div>
  );
}

function getViewTitle(view) {
  const map = {
    tools: 'Herramientas',
    'work-notes': 'Notas de trabajo',
    'my-schedule': 'Mi horario',
    'admin-schedule': 'Gestion de horario',
    certificates: 'Certificados',
    lockers: 'MusiLockers',
    data: 'Gestion de botones',
    users: 'Usuarios y accesos',
    settings: 'Configuracion'
  };
  return map[view] || 'Musicala Manager';
}

function LoadingScreen({ text }) {
  return (
    <div className="center-shell">
      <div className="loader-card">
        <img className="loading-logo" src={assetUrl('logo.png')} alt="Musicala" />
        <div className="loader" />
        <p>{text}</p>
      </div>
    </div>
  );
}

function ConfigMissing() {
  return (
    <div className="center-shell">
      <div className="empty-card danger">
        <AlertTriangle size={36} />
        <h1>Falta configurar Firebase</h1>
        <p>
          Copia <code>.env.example</code> como <code>.env</code> y pega las credenciales de tu proyecto Firebase.
        </p>
      </div>
    </div>
  );
}

function PendingScreen({ user, profile }) {
  return (
    <div className="center-shell">
      <div className="empty-card">
        <div className="avatar big">{getInitials(profile?.displayName || user.email)}</div>
        <h1>Tu acceso quedo pendiente</h1>
        <p>
          Ya existe tu cuenta, pero un administrador debe activar el perfil y asignar permisos.
        </p>
        <p className="muted">Correo: {user.email}</p>
        <button className="btn primary" onClick={logout}>Cerrar sesion</button>
      </div>
    </div>
  );
}
