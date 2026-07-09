import { useMemo, useState } from 'react';
import { Briefcase, GraduationCap, Lock, LockOpen, Search, Sparkles, User, UserRound, X } from 'lucide-react';
import {
  assignLocker,
  assignNextFree,
  releaseLocker,
  LOCKER_ROLES
} from '../services/lockersService';
import { normalizeKey, normalizeText } from '../utils/normalize';

const ROLE_ICONS = {
  administrativo: Briefcase,
  docente: GraduationCap,
  estudiante: User,
  visitante: UserRound
};

function roleMeta(id) {
  const role = LOCKER_ROLES.find(r => r.id === id) || LOCKER_ROLES.find(r => r.id === 'estudiante');
  return { ...role, Icon: ROLE_ICONS[role.id] || User };
}

function RolePicker({ value, onChange, disabled }) {
  return (
    <div className="locker-role-picker">
      {LOCKER_ROLES.map(role => {
        const Icon = ROLE_ICONS[role.id] || User;
        return (
          <button
            key={role.id}
            type="button"
            className={`locker-role-option ${role.id} ${value === role.id ? 'active' : ''}`}
            onClick={() => onChange(role.id)}
            disabled={disabled}
          >
            <Icon size={14} />
            {role.label}
          </button>
        );
      })}
    </div>
  );
}

export default function LockersManager({ lockers, currentUserName, canManage }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState('estudiante');
  const [nextFreeOpen, setNextFreeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const query = normalizeKey(search);
  const occupied = useMemo(() => lockers.filter(l => normalizeText(l.name)), [lockers]);
  const roleCounts = useMemo(() => {
    const counts = {};
    occupied.forEach(l => { counts[l.role] = (counts[l.role] || 0) + 1; });
    return counts;
  }, [occupied]);
  const roleSummary = LOCKER_ROLES
    .filter(role => roleCounts[role.id])
    .map(role => `${roleCounts[role.id]} ${role.label.toLowerCase()}${roleCounts[role.id] === 1 ? '' : 's'}`)
    .join(' · ');

  function openLocker(locker) {
    setSelected(locker);
    setNameDraft(locker.name || '');
    setRoleDraft(roleMeta(locker.role).id);
    setMessage('');
  }

  function closeModal() {
    setSelected(null);
    setNextFreeOpen(false);
    setNameDraft('');
    setRoleDraft('estudiante');
    setMessage('');
  }

  function openNextFree() {
    setNextFreeOpen(true);
    setNameDraft('');
    setRoleDraft('estudiante');
    setMessage('');
  }

  async function handleAssign() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await assignLocker(selected.number, nameDraft, currentUserName, roleDraft);
      closeModal();
    } catch (error) {
      setMessage(error.message || 'No se pudo asignar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await releaseLocker(selected.number, currentUserName);
      closeModal();
    } catch (error) {
      setMessage(error.message || 'No se pudo liberar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignNext() {
    setBusy(true);
    setMessage('');
    try {
      const number = await assignNextFree(nameDraft, currentUserName, roleDraft);
      closeModal();
      window.alert(`Asignado al candado ${number}.`);
    } catch (error) {
      setMessage(error.message || 'No se pudo asignar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lockers-module">
      <div className="module-header">
        <Lock size={22} />
        <div>
          <h2>Candados</h2>
          <p className="muted">
            {occupied.length} de {lockers.length} ocupados{roleSummary ? ` · ${roleSummary}` : ''}
          </p>
        </div>
      </div>

      <div className="lockers-toolbar">
        <div className="field-wrap">
          <Search size={16} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar nombre..."
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} title="Limpiar">
              <X size={14} />
            </button>
          )}
        </div>
        {canManage && (
          <button className="btn primary" onClick={openNextFree} disabled={busy}>
            <Sparkles size={16} /> Asignar siguiente libre
          </button>
        )}
      </div>

      <div className="lockers-grid">
        {lockers.map(locker => {
          const isOccupied = Boolean(normalizeText(locker.name));
          const hit = query && normalizeKey(locker.name).includes(query);
          const role = roleMeta(locker.role);
          return (
            <button
              key={locker.id}
              className={`locker-card ${isOccupied ? `occupied role-${role.id}` : 'free'} ${hit ? 'hit' : ''}`}
              onClick={() => canManage && openLocker(locker)}
              disabled={!canManage}
            >
              <span className="locker-number">
                {isOccupied ? <Lock size={16} /> : <LockOpen size={16} />}
                Candado {locker.number}
              </span>
              <span className="locker-name">{isOccupied ? locker.name : 'Disponible'}</span>
              {isOccupied && (
                <span className={`locker-role-badge ${role.id}`}>
                  <role.Icon size={12} />
                  {role.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(selected || nextFreeOpen) && (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && closeModal()}>
          <div className="modal-card lockers-modal">
            <div className="modal-header">
              <Lock size={20} />
              <h2>{selected ? `Candado ${selected.number}` : 'Siguiente candado libre'}</h2>
            </div>
            <input
              autoFocus
              value={nameDraft}
              onChange={event => setNameDraft(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && (selected ? handleAssign() : handleAssignNext())}
              placeholder="Nombre"
            />
            <RolePicker value={roleDraft} onChange={setRoleDraft} disabled={busy} />
            {message && <p className="form-message">{message}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={closeModal} disabled={busy}>Cerrar</button>
              {selected && (
                <button
                  className="btn danger"
                  onClick={handleRelease}
                  disabled={busy || !normalizeText(selected.name)}
                >
                  Liberar
                </button>
              )}
              <button
                className="btn primary"
                onClick={selected ? handleAssign : handleAssignNext}
                disabled={busy}
              >
                Asignar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
