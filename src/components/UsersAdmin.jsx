import { useMemo, useState } from 'react';
import { Check, Save, Search, Trash2 } from 'lucide-react';
import { deleteUserProfile, updateUserProfile } from '../services/usersService';
import { ROLES, normalizeText } from '../utils/normalize';

export default function UsersAdmin({ users, buttons }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');
  const [message, setMessage] = useState('');
  const [buttonSearch, setButtonSearch] = useState('');

  const buttonOptions = useMemo(() => {
    const query = normalizeText(buttonSearch).toLowerCase();
    return buttons
      .filter(button => button.active !== false)
      .filter(button => !query || normalizeText(`${button.name} ${button.section}`).toLowerCase().includes(query));
  }, [buttons, buttonSearch]);

  const assistantUsers = useMemo(() => {
    return users
      .filter(user => user.active !== false)
      .filter(user => user.role === ROLES.ASISTENTE)
      .sort((a, b) => String(a.displayName || a.username || '').localeCompare(String(b.displayName || b.username || ''), 'es'));
  }, [users]);

  function getDraft(user) {
    const base = {
      displayName: user.displayName || '',
      role: user.role || ROLES.DOCENTE,
      active: user.active === true,
      buttonAccess: Array.isArray(user.buttonAccess) ? user.buttonAccess.join(', ') : '',
      source: user.source || 'user',
      email: user.email || '',
      username: user.username || user.legacyUsername || ''
    };
    return {
      ...base,
      ...(drafts[user.id] || {})
    };
  }

  function setDraft(userId, field, value) {
    setDrafts(current => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        [field]: value
      }
    }));
  }

  async function save(user) {
    const draft = getDraft(user);
    setSavingId(user.id);
    setMessage('');
    try {
      await updateUserProfile(user.id, draft);
      setMessage('Usuario actualizado. Increíble, un permiso que no vive en una hoja perdida.');
    } catch (error) {
      setMessage(error.message || 'No se pudo actualizar el usuario.');
    } finally {
      setSavingId('');
    }
  }

  async function remove(user) {
    const label = user.displayName || user.email || user.id;
    const ok = window.confirm(`Eliminar el acceso de "${label}" en Manager Musicala? Esto no borra su cuenta Google, solo el perfil/invitacion dentro de esta app.`);
    if (!ok) return;
    setSavingId(user.id);
    setMessage('');
    try {
      await deleteUserProfile(user);
      setMessage('Usuario eliminado del Manager.');
    } catch (error) {
      setMessage(error.message || 'No se pudo eliminar el usuario.');
    } finally {
      setSavingId('');
    }
  }

  function toggleAll(user) {
    const draft = getDraft(user);
    setDraft(user.id, 'buttonAccess', draft.buttonAccess.trim() === '*' ? '' : '*');
  }

  function toggleButton(user, button) {
    const draft = getDraft(user);
    if (draft.buttonAccess.trim() === '*') return;
    const current = draft.buttonAccess.split(/[,;\n]+/).map(normalizeText).filter(Boolean);
    const exists = current.includes(button.id) || current.includes(button.name);
    const next = exists ? current.filter(value => value !== button.id && value !== button.name) : [...current, button.id];
    setDraft(user.id, 'buttonAccess', next.join(', '));
  }

  return (
    <section className="module-card wide">
      <div className="module-header">
        <div>
          <p className="eyebrow">Accesos</p>
          <h2>Asistentes</h2>
        </div>
        <span className="pill">{assistantUsers.length}</span>
      </div>

      {message && <div className="info-banner">{message}</div>}

      <div className="access-toolbar">
        <Search size={18} />
        <input value={buttonSearch} onChange={e => setButtonSearch(e.target.value)} placeholder="Filtrar botones para asignar..." />
      </div>

      <div className="users-list">
        {assistantUsers.map(user => {
          const draft = getDraft(user);
          const access = draft.buttonAccess.trim();
          return (
            <article className="user-card" key={user.id}>
              <div className="user-main">
                <div>
                  <input className="inline-title" value={draft.displayName} onChange={e => setDraft(user.id, 'displayName', e.target.value)} />
                  <p>{user.email}</p>
                  <span className={`status-chip ${user.hasAuthProfile ? 'ok-chip' : ''}`}>
                    {user.hasAuthProfile ? 'Cuenta Google conectada' : user.source === 'assistantAccount' ? 'Usuario interno asistente' : user.source === 'invite' ? 'Invitacion pendiente' : 'Usuario importado'}
                  </span>
                </div>
                <div className="right-actions">
                  <label className="switch-label">
                    <input type="checkbox" checked={draft.active} onChange={e => setDraft(user.id, 'active', e.target.checked)} />
                    <span>{draft.active ? 'Activo' : 'Pendiente'}</span>
                  </label>
                </div>
              </div>

              <div className="access-tools">
                <button className={`chip-action ${access === '*' ? 'selected' : ''}`} onClick={() => toggleAll(user)} type="button">
                  <Check size={15} /> Todos los botones
                </button>
                {buttonOptions.map(button => {
                  const selected = access === '*' || access.split(/[,;\n]+/).map(normalizeText).includes(button.id) || access.split(/[,;\n]+/).map(normalizeText).includes(button.name);
                  return (
                    <button key={button.id} className={`chip-action ${selected ? 'selected' : ''}`} onClick={() => toggleButton(user, button)} type="button">
                      {button.name}
                    </button>
                  );
                })}
              </div>

              <div className="right-actions">
                <button className="btn danger" onClick={() => remove(user)} disabled={savingId === user.id}>
                  <Trash2 size={17} /> Eliminar
                </button>
                <button className="btn primary" onClick={() => save(user)} disabled={savingId === user.id}>
                  <Save size={17} /> {savingId === user.id ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
