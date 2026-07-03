import { useEffect, useMemo, useState } from 'react';
import { Bell, Plus, Save, Trash2, UserPlus, Volume2 } from 'lucide-react';
import { deleteAssistantInvite, listenAssistantInvites, saveAssistantInvite } from '../services/assistantAccountsService';
import { AREA_LABELS, AREAS, BUTTON_SECTION_OPTIONS, DAYS, normalizeButtonSections } from '../utils/normalize';
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
  placementRule: '',
  placementMinutes: 30,
  fixedTime: '',
  allowedDays: [],
  repeatable: false,
  active: true
};

const EMPTY_ASSISTANT = {
  email: '',
  displayName: '',
  area: AREAS.ADMIN,
  lunchStart: '',
  lunchMinutes: 60,
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

const SOUND_PROFILE_LABELS = {
  soft: 'Suave',
  clear: 'Claro',
  assertive: 'Insistente'
};

export default function ManagerSettings({ users = [] }) {
  const [settings, setSettings] = useState(DEFAULT_MANAGER_SETTINGS);
  const [templates, setTemplates] = useState([]);
  const [assistantInvites, setAssistantInvites] = useState([]);
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [assistantDraft, setAssistantDraft] = useState(EMPTY_ASSISTANT);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubSettings = listenManagerSettings(setSettings);
    const unsubTemplates = listenTaskTemplates(setTemplates);
    const unsubAssistants = listenAssistantInvites(setAssistantInvites);
    return () => {
      unsubSettings();
      unsubTemplates();
      unsubAssistants();
    };
  }, []);

  // Nombres de asistentes activas, igual que en el horario del administrador,
  // para elegir la asistente sugerida desde una lista y evitar errores de tipeo.
  const assistantOptions = useMemo(() => {
    const names = users
      .filter(user => user.active !== false)
      .filter(user => user.role === 'asistente')
      .map(user => user.displayName || user.username || user.email)
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b), 'es'));
  }, [users]);

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

  function updateButtonSection(index, value) {
    setSettings(current => {
      const sections = Array.isArray(current.buttonSections)
        ? [...current.buttonSections]
        : normalizeButtonSections(current.buttonSections);
      sections[index] = value;
      return { ...current, buttonSections: sections };
    });
  }

  function addButtonSection() {
    setSettings(current => ({
      ...current,
      buttonSections: [
        ...(Array.isArray(current.buttonSections)
          ? current.buttonSections
          : normalizeButtonSections(current.buttonSections)),
        'Nueva sección'
      ]
    }));
  }

  function removeButtonSection(index) {
    setSettings(current => {
      const source = Array.isArray(current.buttonSections)
        ? current.buttonSections
        : normalizeButtonSections(current.buttonSections);
      const sections = source.filter((_, itemIndex) => itemIndex !== index);
      return { ...current, buttonSections: sections };
    });
  }

  function resetButtonSections() {
    setSettings(current => ({ ...current, buttonSections: BUTTON_SECTION_OPTIONS }));
  }

  function scenarioList(current) {
    const list = Array.isArray(current.scenarios) && current.scenarios.length
      ? current.scenarios
      : DEFAULT_MANAGER_SETTINGS.scenarios;
    return list;
  }

  function updateScenarioName(index, value) {
    setSettings(current => {
      const scenarios = [...scenarioList(current)];
      scenarios[index] = { ...scenarios[index], name: value };
      return { ...current, scenarios };
    });
  }

  function addScenario() {
    setSettings(current => ({
      ...current,
      scenarios: [
        ...scenarioList(current),
        { id: `escenario-${Date.now()}`, name: 'Nuevo escenario' }
      ]
    }));
  }

  function removeScenario(index) {
    const current = settings;
    const scenarios = scenarioList(current);
    if (scenarios.length <= 1) return;
    const removed = scenarios[index];
    const ok = window.confirm(`¿Eliminar el escenario "${removed.name}"? Las tareas guardadas en ese escenario dejarán de mostrarse, pero no se borran.`);
    if (!ok) return;
    setSettings(prev => {
      const list = scenarioList(prev).filter((_, itemIndex) => itemIndex !== index);
      const activeScenario = prev.activeScenario === removed.id ? list[0].id : prev.activeScenario;
      return { ...prev, scenarios: list, activeScenario };
    });
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
      await saveAssistantInvite(assistantDraft);
      setAssistantDraft(EMPTY_ASSISTANT);
      setMessage('Asistente guardada. Cuando entre con ese correo, accede directo.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la asistente.');
    } finally {
      setSaving(false);
    }
  }

  async function removeAssistant(account) {
    const ok = window.confirm(`Eliminar el acceso de "${account.displayName || account.email}"?`);
    if (!ok) return;
    setSaving(true);
    setMessage('');
    try {
      await deleteAssistantInvite(account.email || account.id);
      setMessage('Acceso de asistente eliminado.');
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
              <span>Tipo de sonido</span>
              <select value={settings.soundProfile || 'clear'} onChange={e => setField('soundProfile', e.target.value)}>
                {Object.entries(SOUND_PROFILE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Repetir si no se cierra (segundos)</span>
              <input
                type="number"
                min="0"
                step="5"
                value={settings.notificationRepeatSeconds ?? 25}
                onChange={e => setField('notificationRepeatSeconds', Number(e.target.value))}
              />
            </label>
          </div>
          <div className="form-grid two">
            <label>
              <span>Antes de iniciar tarea</span>
              <input type="number" min="0" value={settings.taskStartMinutesBefore} onChange={e => setField('taskStartMinutesBefore', Number(e.target.value))} />
            </label>
            <label>
              <span>Antes de cambio de tarea</span>
              <input type="number" min="0" value={settings.taskChangeMinutesBefore} onChange={e => setField('taskChangeMinutesBefore', Number(e.target.value))} />
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
            <p className="eyebrow">Herramientas</p>
            <h2>Secciones de botones</h2>
          </div>
          <button className="btn ghost" type="button" onClick={addButtonSection}>
            <Plus size={16} /> Agregar sección
          </button>
        </div>
        <div className="settings-body">
          <div className="notification-message-list">
            {(Array.isArray(settings.buttonSections)
              ? settings.buttonSections
              : normalizeButtonSections(settings.buttonSections)
            ).map((section, index) => (
              <div className="notification-message-row button-section-row" key={index}>
                <label>
                  <span>Nombre de sección</span>
                  <input
                    value={section}
                    onChange={e => updateButtonSection(index, e.target.value)}
                    placeholder="Académico"
                  />
                </label>
                <div className="right-actions">
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => removeButtonSection(index)}
                    disabled={(Array.isArray(settings.buttonSections)
                      ? settings.buttonSections
                      : normalizeButtonSections(settings.buttonSections)
                    ).length <= 1}
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="right-actions">
            <button className="btn ghost" type="button" onClick={resetButtonSections}>
              Restaurar lista base
            </button>
            <button className="btn primary" onClick={saveSettings} disabled={saving}>
              <Save size={17} /> {saving ? 'Guardando...' : 'Guardar secciones'}
            </button>
          </div>
        </div>
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Horarios</p>
            <h2>Escenarios de horario</h2>
          </div>
          <button className="btn ghost" type="button" onClick={addScenario}>
            <Plus size={16} /> Agregar escenario
          </button>
        </div>
        <div className="settings-body">
          <p className="muted">
            Los escenarios son versiones del horario semanal (por ejemplo normal, redistribuido o vacacional).
            El escenario activo se elige desde el horario del administrador.
          </p>
          <div className="notification-message-list">
            {scenarioList(settings).map((scenario, index) => (
              <div className="notification-message-row button-section-row" key={scenario.id || index}>
                <label>
                  <span>Nombre del escenario{scenario.id === settings.activeScenario ? ' · activo' : ''}</span>
                  <input
                    value={scenario.name || ''}
                    onChange={e => updateScenarioName(index, e.target.value)}
                    placeholder="Horario vacacional"
                  />
                </label>
                <div className="right-actions">
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => removeScenario(index)}
                    disabled={scenarioList(settings).length <= 1}
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="right-actions">
            <button className="btn primary" onClick={saveSettings} disabled={saving}>
              <Save size={17} /> {saving ? 'Guardando...' : 'Guardar escenarios'}
            </button>
          </div>
        </div>
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Asistentes</p>
            <h2>Accesos por correo</h2>
          </div>
          <span className="pill">{assistantInvites.length}</span>
        </div>
        <form className="settings-body" onSubmit={saveAssistant}>
          <p className="muted">
            Registra el correo de cada asistente. Cuando inicie sesión con ese correo,
            entra directo con su rol; no necesita la segunda ventana.
          </p>
          <div className="form-grid assistant-account-fields">
            <label>
              <span>Correo</span>
              <input type="email" value={assistantDraft.email} onChange={e => setAssistantDraft(current => ({ ...current, email: e.target.value }))} placeholder="asistente@gmail.com" />
            </label>
            <label>
              <span>Nombre visible</span>
              <input value={assistantDraft.displayName} onChange={e => setAssistantDraft(current => ({ ...current, displayName: e.target.value }))} placeholder="Camila Rodríguez" />
            </label>
            <label>
              <span>Área / rol</span>
              <select value={assistantDraft.area || AREAS.ADMIN} onChange={e => setAssistantDraft(current => ({ ...current, area: e.target.value }))}>
                {Object.entries(AREA_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Hora de almuerzo</span>
              <input type="time" value={assistantDraft.lunchStart || ''} onChange={e => setAssistantDraft(current => ({ ...current, lunchStart: e.target.value }))} />
            </label>
            <label>
              <span>Duración almuerzo (min)</span>
              <input type="number" min="15" step="15" value={assistantDraft.lunchMinutes ?? 60} onChange={e => setAssistantDraft(current => ({ ...current, lunchMinutes: Number(e.target.value) }))} />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={assistantDraft.active} onChange={e => setAssistantDraft(current => ({ ...current, active: e.target.checked }))} />
              <span>Activo</span>
            </label>
          </div>
          <div className="right-actions">
            {assistantDraft.id && (
              <button type="button" className="btn ghost" onClick={() => setAssistantDraft(EMPTY_ASSISTANT)}>Cancelar</button>
            )}
            <button className="btn primary" disabled={saving}><UserPlus size={17} /> Guardar asistente</button>
          </div>
        </form>
        <div className="task-template-list">
          {assistantInvites.map(account => (
            <div className="task-template assistant-account-row" key={account.id}>
              <div>
                <strong>{account.displayName || account.email}</strong>
                <span>
                  {account.email} · {AREA_LABELS[account.area] || 'Asistente'} · {account.active === false ? 'Inactivo' : 'Activo'}
                  {account.lunchStart ? ` · 🍽 almuerzo ${account.lunchStart} (${account.lunchMinutes || 60} min)` : ''}
                </span>
              </div>
              <div className="right-actions">
                <button className="btn ghost" onClick={() => setAssistantDraft({
                  id: account.id,
                  email: account.email || account.id || '',
                  displayName: account.displayName || '',
                  area: account.area || AREAS.ADMIN,
                  lunchStart: account.lunchStart || '',
                  lunchMinutes: account.lunchMinutes ?? 60,
                  active: account.active !== false
                })}>Editar</button>
                <button className="btn danger" onClick={() => removeAssistant(account)}><Trash2 size={16} /> Eliminar</button>
              </div>
            </div>
          ))}
          {!assistantInvites.length && <p className="muted padded">Todavía no hay asistentes registradas por correo.</p>}
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
            <label>
              <span>Asistente sugerida</span>
              <select
                value={template.suggestedOwner || ''}
                onChange={e => setTemplate(current => ({ ...current, suggestedOwner: e.target.value }))}
              >
                <option value="">Cualquiera (sin asignar)</option>
                {assistantOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
                {template.suggestedOwner && !assistantOptions.includes(template.suggestedOwner) && (
                  <option value={template.suggestedOwner}>{template.suggestedOwner} (anterior)</option>
                )}
              </select>
            </label>
          </div>
          <label>
            <span>Descripcion</span>
            <textarea value={template.description} onChange={e => setTemplate(current => ({ ...current, description: e.target.value }))} placeholder="Instrucciones o criterio de exito" />
          </label>
          <div className="form-grid two">
            <label>
              <span>Regla de ubicación</span>
              <select value={template.placementRule || ''} onChange={e => setTemplate(current => ({ ...current, placementRule: e.target.value }))}>
                <option value="">Sin regla (cualquier hora)</option>
                <option value="inicio">Al inicio del día (apertura)</option>
                <option value="fin">Al final del día (cierre)</option>
                <option value="hora">Siempre a una hora específica</option>
                <option value="manana">En la mañana (antes del almuerzo)</option>
                <option value="tarde">En la tarde (después del almuerzo)</option>
              </select>
            </label>
            {['inicio', 'fin'].includes(template.placementRule) && (
              <label>
                <span>Ventana en minutos</span>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={template.placementMinutes}
                  onChange={e => setTemplate(current => ({ ...current, placementMinutes: Number(e.target.value) }))}
                />
              </label>
            )}
            {template.placementRule === 'hora' && (
              <label>
                <span>Hora fija de inicio</span>
                <input
                  type="time"
                  step="900"
                  value={template.fixedTime || ''}
                  onChange={e => setTemplate(current => ({ ...current, fixedTime: e.target.value }))}
                  required
                />
              </label>
            )}
          </div>
          <fieldset className="template-days">
            <legend>Días permitidos</legend>
            <p className="muted">Sin marcar significa que puede usarse cualquier día.</p>
            <div className="shift-days">
              {DAYS.slice(0, 6).map(dayName => (
                <label className="day-check" key={dayName}>
                  <input
                    type="checkbox"
                    checked={(template.allowedDays || []).includes(dayName)}
                    onChange={e => setTemplate(current => ({
                      ...current,
                      allowedDays: e.target.checked
                        ? [...(current.allowedDays || []), dayName]
                        : (current.allowedDays || []).filter(item => item !== dayName)
                    }))}
                  />
                  <span>{dayName}</span>
                </label>
              ))}
            </div>
          </fieldset>
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
                  {item.placementRule === 'fin' ? ` · 🔒 cierre (últimos ${item.placementMinutes || 30} min)` : ''}
                  {item.placementRule === 'inicio' ? ` · 🔓 apertura (primeros ${item.placementMinutes || 30} min)` : ''}
                  {item.placementRule === 'hora' ? ` · 🕐 siempre a las ${item.fixedTime || '—'}` : ''}
                  {item.placementRule === 'manana' ? ' · ☀️ antes del almuerzo' : ''}
                  {item.placementRule === 'tarde' ? ' · 🌙 después del almuerzo' : ''}
                  {item.allowedDays?.length ? ` · 📅 ${item.allowedDays.join(', ')}` : ''}
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
