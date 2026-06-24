import { useMemo, useState } from 'react';
import { Lock, LockOpen, Search, Sparkles, X } from 'lucide-react';
import {
  assignLocker,
  assignNextFree,
  releaseLocker
} from '../services/lockersService';
import { normalizeKey, normalizeText } from '../utils/normalize';

export default function LockersManager({ lockers, currentUserName, canManage }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const query = normalizeKey(search);
  const occupiedCount = useMemo(
    () => lockers.filter(l => normalizeText(l.name)).length,
    [lockers]
  );

  function openLocker(locker) {
    setSelected(locker);
    setNameDraft(locker.name || '');
    setMessage('');
  }

  function closeModal() {
    setSelected(null);
    setNameDraft('');
  }

  async function handleAssign() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await assignLocker(selected.number, nameDraft, currentUserName);
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
    const raw = window.prompt('Nombre para el siguiente candado libre:');
    if (raw === null) return;
    setBusy(true);
    try {
      const number = await assignNextFree(raw, currentUserName);
      window.alert(`Asignado al candado ${number}.`);
    } catch (error) {
      window.alert(error.message || 'No se pudo asignar.');
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
          <p className="muted">{occupiedCount} de {lockers.length} ocupados</p>
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
          <button className="btn primary" onClick={handleAssignNext} disabled={busy}>
            <Sparkles size={16} /> Asignar siguiente libre
          </button>
        )}
      </div>

      <div className="lockers-grid">
        {lockers.map(locker => {
          const occupied = Boolean(normalizeText(locker.name));
          const hit = query && normalizeKey(locker.name).includes(query);
          return (
            <button
              key={locker.id}
              className={`locker-card ${occupied ? 'occupied' : 'free'} ${hit ? 'hit' : ''}`}
              onClick={() => canManage && openLocker(locker)}
              disabled={!canManage}
            >
              <span className="locker-number">
                {occupied ? <Lock size={16} /> : <LockOpen size={16} />}
                Candado {locker.number}
              </span>
              <span className="locker-name">{occupied ? locker.name : 'Disponible'}</span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && closeModal()}>
          <div className="modal-card lockers-modal">
            <div className="modal-header">
              <Lock size={20} />
              <h2>Candado {selected.number}</h2>
            </div>
            <input
              autoFocus
              value={nameDraft}
              onChange={event => setNameDraft(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && handleAssign()}
              placeholder="Nombre"
            />
            {message && <p className="form-message">{message}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={closeModal} disabled={busy}>Cerrar</button>
              <button
                className="btn danger"
                onClick={handleRelease}
                disabled={busy || !normalizeText(selected.name)}
              >
                Liberar
              </button>
              <button className="btn primary" onClick={handleAssign} disabled={busy}>Asignar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
