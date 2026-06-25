import { useMemo, useState } from 'react';
import { Check, CheckCheck, FlipHorizontal2, Save, Search, Star, Trash2, X } from 'lucide-react';
import { deleteUserProfile, updateUserProfile } from '../services/usersService';
import { ROLES, normalizeButtonSection, normalizeText } from '../utils/normalize';

export default function UsersAdmin({ users, buttons }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');
  const [message, setMessage] = useState('');
  const [buttonSearch, setButtonSearch] = useState('');

  const activeButtons = useMemo(() => buttons.filter(button => button.active !== false), [buttons]);

  const buttonOptions = useMemo(() => {
    const query = normalizeText(buttonSearch).toLowerCase();
    return activeButtons
      .filter(button => !query || normalizeText(`${button.name} ${button.section}`).toLowerCase().includes(query));
  }, [activeButtons, buttonSearch]);

  // Agrupa los botones visibles por seccion para asignarlos de forma ordenada.
  const groupedOptions = useMemo(() => {
    const groups = new Map();
    buttonOptions.forEach(button => {
      const section = normalizeButtonSection(button.section);
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(button);
    });
    return Array.from(groups.entries())
      .map(([section, items]) => ({ section, items }))
      .sort((a, b) => a.section.localeCompare(b.section, 'es'));
  }, [buttonOptions]);

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

  function accessTokens(draft) {
    return draft.buttonAccess.split(/[,;\n]+/).map(normalizeText).filter(Boolean);
  }

  function isAllAccess(draft) {
    return draft.buttonAccess.trim() === '*';
  }

  function isButtonSelected(draft, button) {
    if (isAllAccess(draft)) return true;
    const tokens = accessTokens(draft);
    return tokens.includes(button.id) || tokens.includes(button.name);
  }

  // Pasa de modo "★ todos + futuros" a una lista explicita con todos los
  // botones actuales, para poder ir quitando algunos.
  function explicitTokens(draft) {
    if (isAllAccess(draft)) return activeButtons.map(button => button.id);
    return accessTokens(draft);
  }

  function setAccess(user, list) {
    const unique = [...new Set(list.filter(Boolean))];
    setDraft(user.id, 'buttonAccess', unique.join(', '));
  }

  function toggleAllFuture(user) {
    const draft = getDraft(user);
    setDraft(user.id, 'buttonAccess', isAllAccess(draft) ? '' : '*');
  }

  function selectAll(user) {
    setAccess(user, activeButtons.map(button => button.id));
  }

  function clearAll(user) {
    setAccess(user, []);
  }

  function invertAll(user) {
    const draft = getDraft(user);
    const next = activeButtons
      .filter(button => !isButtonSelected(draft, button))
      .map(button => button.id);
    setAccess(user, next);
  }

  function toggleButton(user, button) {
    const draft = getDraft(user);
    const tokens = explicitTokens(draft);
    const exists = tokens.includes(button.id) || tokens.includes(button.name);
    const next = exists
      ? tokens.filter(value => value !== button.id && value !== button.name)
      : [...tokens, button.id];
    setAccess(user, next);
  }

  function toggleSection(user, items, allSelected) {
    const draft = getDraft(user);
    const tokens = explicitTokens(draft);
    const ids = items.map(button => button.id);
    const names = items.map(button => button.name);
    if (allSelected) {
      setAccess(user, tokens.filter(value => !ids.includes(value) && !names.includes(value)));
    } else {
      setAccess(user, [...tokens, ...ids]);
    }
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
          const allAccess = isAllAccess(draft);
          const selectedCount = allAccess
            ? activeButtons.length
            : activeButtons.filter(button => isButtonSelected(draft, button)).length;
          return (
            <article className="user-card" key={user.id}>
              <div className="user-main">
                <div>
                  <input className="inline-title" value={draft.displayName} onChange={e => setDraft(user.id, 'displayName', e.target.value)} />
                  <p>{user.email}</p>
                  <span className={`status-chip ${user.hasAuthProfile ? 'ok-chip' : ''}`}>
                    {user.hasAuthProfile ? 'Cuenta Google conectada' : user.source === 'assistantInvite' ? 'Acceso por correo (sin entrar aún)' : user.source === 'invite' ? 'Invitacion pendiente' : 'Usuario importado'}
                  </span>
                </div>
                <div className="right-actions">
                  <label className="switch-label">
                    <input type="checkbox" checked={draft.active} onChange={e => setDraft(user.id, 'active', e.target.checked)} />
                    <span>{draft.active ? 'Activo' : 'Pendiente'}</span>
                  </label>
                </div>
              </div>

              <div className="access-summary">
                <span className="access-count">
                  {allAccess
                    ? <><Star size={14} /> Acceso total · {activeButtons.length} botones (incluye futuros)</>
                    : <>{selectedCount} de {activeButtons.length} botones</>}
                </span>
                <div className="access-actions">
                  <button type="button" className={`chip-action ${allAccess ? 'selected' : ''}`} onClick={() => toggleAllFuture(user)}>
                    <Star size={14} /> Todos + futuros
                  </button>
                  <button type="button" className="chip-action" onClick={() => selectAll(user)} disabled={allAccess}>
                    <CheckCheck size={14} /> Marcar todos
                  </button>
                  <button type="button" className="chip-action" onClick={() => clearAll(user)} disabled={selectedCount === 0}>
                    <X size={14} /> Quitar todos
                  </button>
                  <button type="button" className="chip-action" onClick={() => invertAll(user)} disabled={allAccess}>
                    <FlipHorizontal2 size={14} /> Invertir
                  </button>
                </div>
              </div>

              {allAccess ? (
                <p className="muted access-hint">Tiene acceso a todos los botones actuales y a los que crees después. Usa “Marcar todos” si quieres elegir uno por uno.</p>
              ) : (
                <div className="access-groups">
                  {groupedOptions.map(({ section, items }) => {
                    const selectedInSection = items.filter(button => isButtonSelected(draft, button)).length;
                    const allSelected = selectedInSection === items.length;
                    return (
                      <div className="access-group" key={section}>
                        <div className="access-group-head">
                          <button
                            type="button"
                            className={`section-toggle ${allSelected ? 'selected' : ''}`}
                            onClick={() => toggleSection(user, items, allSelected)}
                          >
                            {allSelected ? <Check size={13} /> : null}
                            {section}
                            <span className="section-count">{selectedInSection}/{items.length}</span>
                          </button>
                        </div>
                        <div className="access-tools">
                          {items.map(button => {
                            const selected = isButtonSelected(draft, button);
                            return (
                              <button
                                key={button.id}
                                className={`chip-action ${selected ? 'selected' : 'off'}`}
                                onClick={() => toggleButton(user, button)}
                                type="button"
                              >
                                {selected ? <Check size={14} /> : null}
                                {button.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {!groupedOptions.length && <p className="muted">Ningún botón coincide con el filtro.</p>}
                </div>
              )}

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
