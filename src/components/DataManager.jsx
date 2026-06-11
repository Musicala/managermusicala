import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { deleteButton, saveButton } from '../services/buttonsService';

const EMPTY_BUTTON = {
  name: '',
  url: '',
  type: 'externo',
  section: 'Otros',
  icon: '',
  order: 999,
  active: true
};

const ICON_OPTIONS = ['🎵', '📅', '✅', '📝', '📁', '📊', '🎓', '💬', '📌', '💰', '🧾', '🕒', '👥', '⭐', '🔗'];

export default function DataManager({ buttons }) {
  const [drafts, setDrafts] = useState({});
  const [creating, setCreating] = useState(false);
  const [newButton, setNewButton] = useState(EMPTY_BUTTON);
  const [message, setMessage] = useState('');
  const [savingId, setSavingId] = useState('');

  function getDraft(button) {
    return drafts[button.id] || { ...button };
  }

  function setDraft(id, field, value) {
    setDrafts(current => ({
      ...current,
      [id]: {
        ...(current[id] || buttons.find(button => button.id === id) || {}),
        [field]: value
      }
    }));
  }

  async function saveExisting(button) {
    const draft = getDraft(button);
    setSavingId(button.id);
    setMessage('');
    try {
      await saveButton({ ...draft, id: button.id });
      setMessage('Botón guardado. El caos retrocede un centímetro.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar el botón.');
    } finally {
      setSavingId('');
    }
  }

  async function saveNew(event) {
    event.preventDefault();
    setSavingId('new');
    setMessage('');
    try {
      await saveButton(newButton);
      setNewButton(EMPTY_BUTTON);
      setCreating(false);
      setMessage('Botón creado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el botón.');
    } finally {
      setSavingId('');
    }
  }

  async function remove(button) {
    const ok = window.confirm(`¿Eliminar el botón "${button.name}"?`);
    if (!ok) return;
    await deleteButton(button.id);
  }

  return (
    <section className="module-card wide">
      <div className="module-header">
        <div>
          <p className="eyebrow">Herramientas</p>
          <h2>Botones del panel</h2>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={18} /> Nuevo botón</button>
      </div>

      {message && <div className="info-banner">{message}</div>}

      {creating && (
        <form className="button-editor new" onSubmit={saveNew}>
          <ButtonFields value={newButton} onChange={(field, value) => setNewButton(current => ({ ...current, [field]: value }))} />
          <div className="right-actions">
            <button className="btn ghost" type="button" onClick={() => setCreating(false)}>Cancelar</button>
            <button className="btn primary" disabled={savingId === 'new'}>Guardar</button>
          </div>
        </form>
      )}

      <div className="button-edit-list">
        {buttons.map(button => {
          const draft = getDraft(button);
          return (
            <article className="button-editor" key={button.id}>
              <ButtonFields value={draft} onChange={(field, value) => setDraft(button.id, field, value)} />
              <div className="right-actions">
                <button className="btn danger" onClick={() => remove(button)}><Trash2 size={17} /> Eliminar</button>
                <button className="btn primary" onClick={() => saveExisting(button)} disabled={savingId === button.id}>
                  <Save size={17} /> {savingId === button.id ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ButtonFields({ value, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div className="form-grid button-fields">
        <label>
          <span>Nombre</span>
          <input value={value.name || ''} onChange={e => onChange('name', e.target.value)} placeholder="Registrar Clase" />
        </label>
        <label>
          <span>URL</span>
          <input value={value.url || ''} onChange={e => onChange('url', e.target.value)} placeholder="https://..." />
        </label>
        <label>
          <span>Tipo</span>
          <select value={value.type || 'externo'} onChange={e => onChange('type', e.target.value)}>
            <option value="externo">Externo</option>
            <option value="interno">Interno</option>
          </select>
        </label>
        <label>
          <span>Sección</span>
          <input value={value.section || ''} onChange={e => onChange('section', e.target.value)} placeholder="Académico" />
        </label>
        <label>
          <span>Icono</span>
          <button
            type="button"
            className={`icon-current ${pickerOpen ? 'open' : ''}`}
            onClick={() => setPickerOpen(open => !open)}
            title="Cambiar icono"
          >
            {value.icon || '＋'}
          </button>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={value.active !== false} onChange={e => onChange('active', e.target.checked)} />
          <span>Activo</span>
        </label>
      </div>
      {pickerOpen && (
        <div className="emoji-picker">
          {ICON_OPTIONS.map(icon => (
            <button
              type="button"
              key={icon}
              className={value.icon === icon ? 'selected' : ''}
              onClick={() => { onChange('icon', icon); setPickerOpen(false); }}
              title={icon}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
