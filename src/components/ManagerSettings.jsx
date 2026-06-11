import { useEffect, useState } from 'react';
import { Bell, Plus, Save, Trash2, UserPlus, Volume2 } from 'lucide-react';
import { deleteAssistantAccount, listenAssistantAccounts, saveAssistantAccount } from '../services/assistantAccountsService';
import {
  DEFAULT_MANAGER_SETTINGS,
  listenManagerSettings,
  deleteTaskTemplate,
  listenTaskTemplates,
  mergeDefaultNotificationMessages,
  saveManagerSettings,
  saveTaskTemplate
} from '../services/managerConfigService';

const EMPTY_TEMPLATE = {
  id: '',
  name: '',
  category: 'General',
  description: '',
  frequency: 'Diario',
  durationMinutes: 30,
  priority: 'Media',
  suggestedOwner: '',
  repeatable: false,
  active: true
};

const EMPTY_ASSISTANT = {
  username: '',
  displayName: '',
  password: '',
  active: true
};

const MESSAGE_TYPE_LABELS = {
  taskStart: 'Antes de iniciar tarea',
  taskChange: 'Antes de cambio de tarea',
  break: 'Pausa activa',
  dayStart: 'Inicio de jornada',
  lunch: 'Almuerzo',
  dayEnd: 'Final de jornada'
};

export default function ManagerSettings() {
  const [settings, setSettings] = useState(DEFAULT_MANAGER_SETTINGS);
  const [templates, setTemplates] = useState([]);
  const [assistantAccounts, setAssistantAccounts] = useState([]);
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [assistantDraft, setAssistantDraft] = useState(EMPTY_ASSISTANT);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubSettings = listenManagerSettings(setSettings);
    const unsubTemplates = listenTaskTemplates(setTemplates);
    const unsubAssistants = listenAssistantAccounts(setAssistantAccounts);
    return () => {
      unsubSettings();
      unsubTemplates();
      unsubAssistants();
    };
  }, []);

  function setField(field, value) {
    setSettings(current => ({ ...current, [field]: value }));
  }

  function updateMessage(index, field, value) {
    setSettings(current => {
      const messages = [...mergeDefaultNotificationMessages(current.notificationMessages)];
      messages[index] = { ...messages[index], [field]: value };
      return { ...current, notificationMessages: messages };
    });
  }

  function addNotificationMessage() {
    setSettings(current => ({
      ...current,
      notificationMessages: [
        ...mergeDefaultNotificationMessages(current.notificationMessages),
        {
          id: `mensaje-${Date.now()}`,
          type: 'taskStart',
          title: 'Nuevo recordatorio',
          body: '{hora} · {tarea}',
          active: true
        }
      ]
    }));
  }

  function removeNotificationMessage(index) {
    setSettings(current => ({
      ...current,
      notificationMessages: mergeDefaultNotificationMessages(current.notificationMessages)
        .filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function saveSettings() {
    setSaving(true);
    setMessage('');
    try {
      await saveManagerSettings(settings);
      setMessage('Configuracion guardada.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la configuracion.');
    } finally {
      setSaving(false);
    }
  }

  async function addTemplate(event) {
    event.preventDefault();
    if (!template.name.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const editing = Boolean(template.id);
      await saveTaskTemplate(template);
      setTemplate(EMPTY_TEMPLATE);
      setMessage(editing ? 'Tarea de la bolsa actualizada.' : 'Tarea agregada a la bolsa.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la tarea.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleTemplateRepeatable(item) {
    setMessage('');
    try {
      await saveTaskTemplate({ ...item, repeatable: !item.repeatable });
    } catch (error) {
      setMessage(error.message || 'No se pudo actualizar la tarea.');
    }
  }

  async function removeTemplate(item) {
    const ok = window.confirm(`¿Eliminar "${item.name}" de la bolsa? Las tareas ya asignadas en horarios no se tocan.`);
    if (!ok) return;
    setMessage('');
    try {
      await deleteTaskTemplate(item.id);
      if (template.id === item.id) setTemplate(EMPTY_TEMPLATE);
      setMessage('Tarea eliminada de la bolsa.');
    } catch (error) {
      setMessage(error.message || 'No se pudo eliminar la tarea.');
    }
  }

  async function saveAssistant(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await saveAssistantAccount(assistantDraft);
      setAssistantDraft(EMPTY_ASSISTANT);
      setMessage('Usuario de asistente guardado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la asistente.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssistant(account) {
    const ok = window.confirm(`Eliminar el usuario interno "${account.displayName || account.username}"?`);
    if (!ok) return;
    setSaving(true);
    setMessage('');
    try {
      await deleteAssistantAccount(account.id);
      setMessage('Usuario interno eliminado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-grid">
      <section className="module-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Notificaciones</p>
            <h2>Recordatorios y pausas activas</h2>
          </div>
          <Bell size={22} />
        </div>
        <div className="settings-body">
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              if (typeof Notification !== 'undefined') Notification.requestPermission();
            }}
          >
            Activar permisos del navegador
          </button>
          <label className="switch-label">
            <input type="checkbox" checked={settings.notificationsEnabled} onChange={e => setField('notificationsEnabled', e.target.checked)} />
            <span>Enviar notificaciones en la app</span>
          </label>
          <label className="switch-label">
            <input type="checkbox" checked={settings.soundEnabled} onChange={e => setField('soundEnabled', e.target.checked)} />
            <span><Volume2 size={15} /> Usar sonido</span>
          </label>
          <div className="form-grid two">
            <label>
              <span>Antes de iniciar tarea</span>
              <input type="number" min="0" value={settings.taskStartMinutesBefore} onChange={e => setField('taskStartMinutesBefore', Number(e.target.value))} />
            </label>
            <label>
              <span>Antes de cambio de tarea</span>
              <input type="number" min="0" value={settings.taskChangeMinutesBefore} onChange={e => setField('taskChangeMinutesBefore', Number(e.target.value))} />
            </label>
            <label>
              <span>Pausa cada minutos</span>
              <input type="number" min="30" step="5" value={settings.breakIntervalMinutes} onChange={e => setField('breakIntervalMinutes', Number(e.target.value))} />
            </label>
            <label>
              <span>Duracion pausa</span>
              <input type="number" min="1" step="1" value={settings.breakDurationMinutes} onChange={e => setField('breakDurationMinutes', Number(e.target.value))} />
            </label>
          </div>
          <div className="subsection-head">
            <div>
              <p className="eyebrow">Textos</p>
              <h3>Mensajes que aparecen</h3>
            </div>
            <button className="btn ghost" type="button" onClick={addNotificationMessage}>
              <Plus size={16} /> Agregar mensaje
            </button>
          </div>
          <div className="notification-message-list">
            {mergeDefaultNotificationMessages(settings.notificationMessages).map((item, index) => (
              <div className="notification-message-row" key={item.id || index}>
                <div className="form-grid message-fields">
                  <label>
                    <span>Tipo</span>
                    <select value={item.type || 'taskStart'} onChange={e => updateMessage(index, 'type', e.target.value)}>
                      {Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Titulo</span>
                    <input value={item.title || ''} onChange={e => updateMessage(index, 'title', e.target.value)} placeholder="Proxima tarea" />
                  </label>
                  <label className="message-body-field">
                    <span>Texto</span>
                    <input value={item.body || ''} onChange={e => updateMessage(index, 'body', e.target.value)} placeholder="{hora} · {tarea}" />
                  </label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={item.active !== false} onChange={e => updateMessage(index, 'active', e.target.checked)} />
                    <span>Activo</span>
                  </label>
                </div>
                <div className="right-actions">
                  <button className="btn danger" type="button" onClick={() => removeNotificationMessage(index)}>
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          {message && <div className="info-banner">{message}</div>}
          <div className="right-actions">
            <button className="btn primary" onClick={saveSettings} disabled={saving}>
              <Save size={17} /> {saving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        </div>
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Asistentes</p>
            <h2>Usuarios internos del correo compartido</h2>
          </div>
          <span className="pill">{assistantAccounts.length}</span>
        </div>
        <form className="settings-body" onSubmit={saveAssistant}>
          <div className="form-grid assistant-account-fields">
            <label>
              <span>Usuario</span>
              <input value={assistantDraft.username} onChange={e => setAssistantDraft(current => ({ ...current, username: e.target.value }))} placeholder="angie" />
            </label>
            <label>
              <span>Nombre visible</span>
              <input value={assistantDraft.displayName} onChange={e => setAssistantDraft(current => ({ ...current, displayName: e.target.value }))} placeholder="Angie Nitola" />
            </label>
            <label>
              <span>Contraseña</span>
              <input value={assistantDraft.password} onChange={e => setAssistantDraft(current => ({ ...current, password: e.target.value }))} placeholder="Clave interna" />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={assistantDraft.active} onChange={e => setAssistantDraft(current => ({ ...current, active: e.target.checked }))} />
              <span>Activo</span>
            </label>
          </div>
          <div className="right-actions">
            <button className="btn primary" disabled={saving}><UserPlus size={17} /> Guardar asistente</button>
          </div>
        </form>
        <div className="task-template-list">
          {assistantAccounts.map(account => (
            <div className="task-template assistant-account-row" key={account.id}>
              <div>
                <strong>{account.displayName || account.username}</strong>
                <span>{account.username} · {account.active === false ? 'Inactivo' : 'Activo'}</span>
              </div>
              <div className="right-actions">
                <button className="btn ghost" onClick={() => setAssistantDraft({
                  id: account.id,
                  username: account.username || '',
                  displayName: account.displayName || '',
                  password: account.password || '',
                  active: account.active !== false
                })}>Editar</button>
                <button className="btn danger" onClick={() => removeAssistant(account)}><Trash2 size={16} /> Eliminar</button>
              </div>
            </div>
          ))}
          {!assistantAccounts.length && <p className="muted padded">Todavia no hay usuarios internos de asistentes.</p>}
        </div>
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Bolsa de tareas</p>
            <h2>Tareas base para armar horarios</h2>
          </div>
          <span className="pill">{templates.length}</span>
        </div>
        <form className="settings-body" onSubmit={addTemplate}>
          <div className="form-grid template-fields">
            <label>
              <span>Nombre</span>
              <input value={template.name} onChange={e => setTemplate(current => ({ ...current, name: e.target.value }))} placeholder="Llamar interesados nuevos" />
            </label>
            <label>
              <span>Categoria</span>
              <input value={template.category} onChange={e => setTemplate(current => ({ ...current, category: e.target.value }))} placeholder="Comercial" />
            </label>
            <label>
              <span>Frecuencia</span>
              <select value={template.frequency} onChange={e => setTemplate(current => ({ ...current, frequency: e.target.value }))}>
                <option>Diario</option>
                <option>Semanal</option>
                <option>Mensual</option>
                <option>Eventual</option>
              </select>
            </label>
            <label>
              <span>Duracion</span>
              <input type="number" min="5" step="5" value={template.durationMinutes} onChange={e => setTemplate(current => ({ ...current, durationMinutes: Number(e.target.value) }))} />
            </label>
          </div>
          <label>
            <span>Descripcion</span>
            <textarea value={template.description} onChange={e => setTemplate(current => ({ ...current, description: e.target.value }))} placeholder="Instrucciones o criterio de exito" />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={template.repeatable === true}
              onChange={e => setTemplate(current => ({ ...current, repeatable: e.target.checked }))}
            />
            <span>Repetible: puede asignarse varias veces el mismo día (tarea de relleno)</span>
          </label>
          <div className="right-actions">
            {template.id && (
              <>
                <span className="status-chip">Editando: {template.name}</span>
                <button type="button" className="btn ghost" onClick={() => setTemplate(EMPTY_TEMPLATE)}>Cancelar</button>
              </>
            )}
            <button className="btn primary" disabled={saving}>
              {template.id ? 'Guardar cambios' : 'Agregar a bolsa'}
            </button>
          </div>
        </form>
        <div className="task-template-list">
          {templates.map(item => (
            <div className={`task-template ${template.id === item.id ? 'editing' : ''}`} key={item.id}>
              <div className="task-template-info">
                <strong>{item.name}</strong>
                <span>
                  {item.category} · {item.frequency} · {item.durationMinutes || 30} min
                  {item.repeatable ? ' · 🔁 repetible' : ''}
                </span>
                {item.description && <span className="task-template-desc">{item.description}</span>}
              </div>
              <div className="task-template-actions">
                <button type="button" className="btn ghost small" onClick={() => setTemplate({ ...EMPTY_TEMPLATE, ...item })}>
                  Editar
                </button>
                <button type="button" className="btn ghost small" onClick={() => toggleTemplateRepeatable(item)}>
                  {item.repeatable ? 'Quitar repetible' : 'Marcar repetible'}
                </button>
                <button type="button" className="btn danger small" onClick={() => removeTemplate(item)}>
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {!templates.length && <p className="muted padded">Todavia no hay tareas base.</p>}
        </div>
      </section>
    </div>
  );
}
