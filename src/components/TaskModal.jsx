import { useMemo, useState } from 'react';
import { Briefcase, Trash2, X } from 'lucide-react';
import { DAYS, normalizeText } from '../utils/normalize';
import { minutesToTime, timeToMinutes } from '../utils/time';

const COLORS = ['azul', 'verde', 'morado', 'naranja', 'rosado', 'gris'];

function addMinutesToTime(time, minutes) {
  const start = timeToMinutes(time);
  if (!Number.isFinite(start)) return '';
  return minutesToTime((start + Number(minutes || 0)) % (24 * 60));
}

export default function TaskModal({ task, assistants, templates = [], getJornada, onClose, onSave, onDelete, saving }) {
  const [form, setForm] = useState({
    id: task?.id || '',
    day: task?.day || 'Lunes',
    startTime: task?.startTime || '09:00',
    endTime: task?.endTime || '10:00',
    assistantName: task?.assistantName || '',
    assistantEmail: task?.assistantEmail || '',
    task: task?.task || '',
    description: task?.description || '',
    note: task?.note || '',
    category: task?.category || '',
    color: task?.color || 'azul',
    scenario: task?.scenario || 'normal',
    active: task?.active !== false
  });
  const [bagOpen, setBagOpen] = useState(Boolean(task?.openBag));
  const [bagSearch, setBagSearch] = useState('');
  const [bagCategory, setBagCategory] = useState('todas');

  const bagCategories = useMemo(() => {
    const set = new Set(templates.map(item => String(item.category || 'General')));
    return ['todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = normalizeText(bagSearch).toLowerCase();
    return templates.filter(item => {
      if (bagCategory !== 'todas' && String(item.category || 'General') !== bagCategory) return false;
      if (!query) return true;
      const haystack = normalizeText(`${item.name || ''} ${item.description || ''} ${item.category || ''}`).toLowerCase();
      return haystack.includes(query);
    });
  }, [templates, bagSearch, bagCategory]);

  function applyTemplate(template) {
    setForm(current => {
      const duration = Number(template.durationMinutes || 0);
      const endTime = current.startTime && duration > 0
        ? addMinutesToTime(current.startTime, duration)
        : current.endTime;
      return {
        ...current,
        task: template.name || '',
        description: template.description || '',
        category: template.category || '',
        endTime: endTime || current.endTime
      };
    });
    setBagOpen(false);
  }

  const assistantValue = useMemo(() => {
    return normalizeText(form.assistantEmail || form.assistantName).toLowerCase();
  }, [form.assistantEmail, form.assistantName]);

  // Aviso según la jornada real (Admin Hub) de la asistente seleccionada para el día elegido.
  const jornadaWarning = useMemo(() => {
    if (!getJornada) return '';
    const selected = assistants.find(item => normalizeText(item.email || item.name).toLowerCase() === assistantValue);
    if (!selected) return '';
    const jornada = getJornada(selected, form.day);
    if (jornada === undefined) return '';
    if (jornada === null) return `Según Admin Hub, ${selected.name || 'esta asistente'} no trabaja el ${form.day}.`;
    const start = timeToMinutes(form.startTime);
    const end = timeToMinutes(form.endTime);
    const jStart = timeToMinutes(jornada.start);
    const jEnd = timeToMinutes(jornada.end);
    if (Number.isFinite(start) && Number.isFinite(end) && (start < jStart || end > jEnd)) {
      return `Esta tarea queda fuera de la jornada del Hub (${jornada.start}–${jornada.end}).`;
    }
    return '';
  }, [getJornada, assistants, assistantValue, form.day, form.startTime, form.endTime]);

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function handleAssistantChange(value) {
    const selected = assistants.find(item => normalizeText(item.email || item.name).toLowerCase() === value);
    setForm(current => ({
      ...current,
      assistantName: selected?.name || '',
      assistantEmail: selected?.email || ''
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(form);
  }

  return (
    <div className="modal-backdrop">
      <form className="modal-card" onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Horario</p>
            <h2>{form.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="form-grid two">
          <label>
            <span>Día</span>
            <select value={form.day} onChange={e => setField('day', e.target.value)}>
              {DAYS.slice(0, 6).map(day => <option key={day}>{day}</option>)}
            </select>
          </label>
          <label>
            <span>Asistente</span>
            <select value={assistantValue} onChange={e => handleAssistantChange(e.target.value)}>
              <option value="">Seleccionar...</option>
              {assistants.map(item => (
                <option key={item.email || item.name} value={normalizeText(item.email || item.name).toLowerCase()}>
                  {item.name || item.email}{getJornada && getJornada(item, form.day) === null ? ' · no trabaja este día' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Hora inicio</span>
            <input type="time" value={form.startTime} onChange={e => setField('startTime', e.target.value)} required />
          </label>
          <label>
            <span>Hora fin</span>
            <input type="time" value={form.endTime} onChange={e => setField('endTime', e.target.value)} required />
          </label>
        </div>

        {jornadaWarning && <div className="jornada-warning">⚠ {jornadaWarning}</div>}

        {templates.length > 0 && (
          <div className="bag-picker">
            <button type="button" className="btn ghost" onClick={() => setBagOpen(open => !open)}>
              <Briefcase size={16} /> {bagOpen ? 'Ocultar bolsa de tareas' : 'Agregar desde bolsa'}
            </button>
            {bagOpen && (
              <div className="bag-panel">
                <div className="form-grid two">
                  <label>
                    <span>Buscar</span>
                    <input value={bagSearch} onChange={e => setBagSearch(e.target.value)} placeholder="Buscar tarea base..." />
                  </label>
                  <label>
                    <span>Categoría</span>
                    <select value={bagCategory} onChange={e => setBagCategory(e.target.value)}>
                      {bagCategories.map(cat => <option key={cat} value={cat}>{cat === 'todas' ? 'Todas' : cat}</option>)}
                    </select>
                  </label>
                </div>
                <div className="bag-list" style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
                  {filteredTemplates.length === 0 && <p className="muted">No hay tareas que coincidan.</p>}
                  {filteredTemplates.map(template => (
                    <button
                      type="button"
                      key={template.id}
                      className="bag-item"
                      onClick={() => applyTemplate(template)}
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                    >
                      <span><strong>{template.name}</strong>{template.description ? ` — ${template.description}` : ''}</span>
                      <span className="muted" style={{ whiteSpace: 'nowrap' }}>{template.category || 'General'} · {template.durationMinutes || 30} min</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <label>
          <span>Tarea</span>
          <input value={form.task} onChange={e => setField('task', e.target.value)} placeholder="Nombre de la tarea" required />
        </label>

        <label>
          <span>Descripción</span>
          <textarea value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Detalle de la tarea" />
        </label>

        <label>
          <span>Nota</span>
          <textarea value={form.note} onChange={e => setField('note', e.target.value)} placeholder="Observaciones internas" />
        </label>

        <div className="form-grid two">
          <label>
            <span>Color</span>
            <select value={form.color} onChange={e => setField('color', e.target.value)}>
              {COLORS.map(color => <option key={color}>{color}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.active} onChange={e => setField('active', e.target.checked)} />
            <span>Tarea activa</span>
          </label>
        </div>

        <div className="modal-actions">
          {onDelete && <button type="button" className="btn danger" onClick={() => onDelete(task)}><Trash2 size={17} /> Eliminar</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}
