import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, MessageSquarePlus, Plus, Save, Search, Trash2, X } from 'lucide-react';
import {
  ESCALATION_CHANNELS,
  ESCALATION_PERSON_ROLES,
  ESCALATION_PRIORITIES,
  ESCALATION_STATUSES,
  ESCALATION_TYPES,
  OPEN_ESCALATION_STATUSES,
  addEscalationFollowUp,
  deleteEscalation,
  saveEscalation,
  updateEscalationPriority,
  updateEscalationStatus
} from '../services/escalationsService';
import { normalizeKey, normalizeText } from '../utils/normalize';

const EMPTY_ESCALATION = {
  title: '',
  personName: '',
  personRole: 'acudiente',
  personContact: '',
  studentName: '',
  caseType: 'queja',
  otherCaseType: '',
  channel: 'whatsapp',
  priority: 'media',
  status: 'abierto',
  description: '',
  resolution: '',
  assignedTo: '',
  dueDate: ''
};

const STATUS_CLASS = {
  abierto: 'pending',
  en_gestion: 'process',
  esperando: 'waiting',
  resuelto: 'done',
  cerrado: 'delivered'
};

const PRIORITY_CLASS = {
  alta: 'high',
  media: 'mid',
  baja: 'low'
};

export default function EscalationsManager({ escalations, currentUserName, canManage }) {
  const [draft, setDraft] = useState(EMPTY_ESCALATION);
  const [filters, setFilters] = useState({ search: '', type: '', status: '', priority: '' });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedCase = useMemo(() => {
    if (!selected) return null;
    return escalations.find(item => item.id === selected.id) || selected;
  }, [escalations, selected]);

  const summary = useMemo(() => {
    return escalations.reduce((acc, item) => {
      acc.total += 1;
      const status = item.status || 'abierto';
      acc[status] = (acc[status] || 0) + 1;
      if (isOverdue(item)) acc.vencidos += 1;
      return acc;
    }, { abierto: 0, en_gestion: 0, esperando: 0, resuelto: 0, cerrado: 0, vencidos: 0, total: 0 });
  }, [escalations]);

  const filteredEscalations = useMemo(() => {
    const query = normalizeKey(filters.search);
    return escalations.filter(item => {
      const haystack = normalizeKey(
        `${item.title} ${item.personName} ${item.studentName} ${typeLabel(item)} ${item.description} ${item.assignedTo}`
      );
      const matchesSearch = !query || haystack.includes(query);
      const matchesType = !filters.type || item.caseType === filters.type;
      const matchesStatus = filters.status === 'pendientes'
        ? OPEN_ESCALATION_STATUSES.includes(item.status || 'abierto')
        : !filters.status || item.status === filters.status;
      const matchesPriority = !filters.priority || item.priority === filters.priority;
      return matchesSearch && matchesType && matchesStatus && matchesPriority;
    });
  }, [escalations, filters]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setMessage('');
    try {
      await saveEscalation(draft, currentUserName);
      setDraft(EMPTY_ESCALATION);
      setMessage('Caso registrado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar el caso.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!canManage || !editing) return;
    setSaving(true);
    setMessage('');
    try {
      await saveEscalation(editing, currentUserName);
      setSelected(editing);
      setEditing(null);
      setMessage('Caso actualizado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo actualizar el caso.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(escalation, status) {
    if (!canManage || escalation.status === status) return;
    setSaving(true);
    setMessage('');
    try {
      await updateEscalationStatus(escalation, status, currentUserName);
      setMessage('Estado actualizado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePriority(escalation, priority) {
    if (!canManage || escalation.priority === priority) return;
    setSaving(true);
    setMessage('');
    try {
      await updateEscalationPriority(escalation, priority, currentUserName);
      setMessage('Prioridad actualizada.');
    } catch (error) {
      setMessage(error.message || 'No se pudo cambiar la prioridad.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFollowUp(escalationId, text) {
    if (!canManage) return;
    setSaving(true);
    setMessage('');
    try {
      await addEscalationFollowUp(escalationId, text, currentUserName);
      setMessage('Seguimiento registrado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo registrar el seguimiento.');
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(escalation) {
    if (!canManage) return;
    const ok = window.confirm(`Eliminar el caso "${escalation.title}"?`);
    if (!ok) return;
    setSaving(true);
    setMessage('');
    try {
      await deleteEscalation(escalation.id);
      if (selected?.id === escalation.id) setSelected(null);
      setMessage('Caso eliminado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo eliminar el caso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="widget-grid certificate-summary">
        <SummaryCard label="Abiertos" value={summary.abierto} tone="pending" />
        <SummaryCard label="En gestion" value={summary.en_gestion} tone="process" />
        <SummaryCard label="Esperando" value={summary.esperando} tone="waiting" />
        <SummaryCard label="Resueltos" value={summary.resuelto} tone="done" />
        <SummaryCard label="Vencidos" value={summary.vencidos} tone="overdue" />
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Escalamientos</p>
            <h2>Casos por resolver y seguimiento</h2>
          </div>
          <span className="pill">{filteredEscalations.length} visibles</span>
        </div>

        {message && <div className="info-banner">{message}</div>}
        {!canManage && <div className="info-banner">Vista de solo lectura.</div>}

        <div className="escalation-filters">
          <label>
            <span>Buscar</span>
            <div className="field-wrap">
              <Search size={17} />
              <input
                value={filters.search}
                onChange={e => setFilters(current => ({ ...current, search: e.target.value }))}
                placeholder="Asunto, persona, estudiante o responsable..."
              />
            </div>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filters.type} onChange={e => setFilters(current => ({ ...current, type: e.target.value }))}>
              <option value="">Todos</option>
              {ESCALATION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={filters.status} onChange={e => setFilters(current => ({ ...current, status: e.target.value }))}>
              <option value="">Todos</option>
              <option value="pendientes">Solo sin resolver</option>
              {ESCALATION_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label>
            <span>Prioridad</span>
            <select value={filters.priority} onChange={e => setFilters(current => ({ ...current, priority: e.target.value }))}>
              <option value="">Todas</option>
              {ESCALATION_PRIORITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>

        {canManage && (
          <form className="certificate-form" onSubmit={handleCreate}>
            <div className="form-grid escalation-fields">
              <EscalationFields
                value={draft}
                onChange={(field, value) => setDraft(current => ({ ...current, [field]: value }))}
                compact
              />
            </div>
            <div className="right-actions">
              <button className="btn primary" disabled={saving}>
                <Plus size={17} /> {saving ? 'Guardando...' : 'Registrar caso'}
              </button>
            </div>
          </form>
        )}

        <div className="certificate-table-wrap">
          <table className="certificate-table escalation-table">
            <thead>
              <tr>
                <th>Reportado</th>
                <th>Asunto</th>
                <th>Persona</th>
                <th>Tipo</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Responsable</th>
                <th>Compromiso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredEscalations.map(escalation => (
                <tr key={escalation.id} className={isOverdue(escalation) ? 'stale-row' : ''}>
                  <td>{formatDate(escalation.reportedAt)}</td>
                  <td>
                    <strong>{escalation.title}</strong>
                    {escalation.studentName && <span className="row-sub">Estudiante: {escalation.studentName}</span>}
                  </td>
                  <td>
                    {escalation.personName}
                    <span className="row-sub">{personRoleLabel(escalation.personRole)}</span>
                  </td>
                  <td>{typeLabel(escalation)}</td>
                  <td>
                    <select
                      className={`status-select priority-select ${PRIORITY_CLASS[escalation.priority || 'media']}`}
                      value={escalation.priority || 'media'}
                      disabled={!canManage || saving}
                      onChange={e => handlePriority(escalation, e.target.value)}
                    >
                      {ESCALATION_PRIORITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      className={`status-select ${STATUS_CLASS[escalation.status || 'abierto']}`}
                      value={escalation.status || 'abierto'}
                      disabled={!canManage || saving}
                      onChange={e => handleStatus(escalation, e.target.value)}
                    >
                      {ESCALATION_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </td>
                  <td>{escalation.assignedTo || 'Sin asignar'}</td>
                  <td>
                    {formatDueDate(escalation.dueDate)}
                    {isOverdue(escalation) && <span className="stale-flag">Vencido</span>}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="icon-btn" title="Ver detalle y seguimientos" onClick={() => { setSelected(escalation); setEditing(null); }}>
                        <Eye size={16} />
                      </button>
                      {canManage && (
                        <button className="icon-btn danger-icon" title="Eliminar" onClick={() => handleDelete(escalation)} disabled={saving}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredEscalations.length && (
                <tr>
                  <td colSpan="9" className="empty-table">No hay casos con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCase && (
        <EscalationModal
          escalation={selectedCase}
          editing={editing}
          setEditing={setEditing}
          onClose={() => { setSelected(null); setEditing(null); }}
          onSave={handleSaveEdit}
          onEditChange={(field, value) => setEditing(current => ({ ...current, [field]: value }))}
          onFollowUp={handleFollowUp}
          canManage={canManage}
          saving={saving}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <article className={`widget-card certificate-card escalation-card ${tone}`}>
      <AlertTriangle size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function EscalationFields({ value, onChange, compact = false }) {
  return (
    <>
      <label className={compact ? 'span-2' : ''}>
        <span>Asunto del caso</span>
        <input
          value={value.title || ''}
          onChange={e => onChange('title', e.target.value)}
          placeholder="Ej: Mamita pide explicacion por lenguaje en clase"
          required
        />
      </label>
      <label>
        <span>Quien reporta</span>
        <input value={value.personName || ''} onChange={e => onChange('personName', e.target.value)} placeholder="Nombre completo" required />
      </label>
      <label>
        <span>Rol</span>
        <select value={value.personRole || 'acudiente'} onChange={e => onChange('personRole', e.target.value)}>
          {ESCALATION_PERSON_ROLES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>
        <span>Contacto</span>
        <input value={value.personContact || ''} onChange={e => onChange('personContact', e.target.value)} placeholder="Telefono o correo" />
      </label>
      <label>
        <span>Estudiante relacionado</span>
        <input value={value.studentName || ''} onChange={e => onChange('studentName', e.target.value)} placeholder="Opcional" />
      </label>
      <label>
        <span>Tipo de caso</span>
        <select value={value.caseType || 'queja'} onChange={e => onChange('caseType', e.target.value)}>
          {ESCALATION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      {value.caseType === 'otro' && (
        <label>
          <span>Especificar tipo</span>
          <input value={value.otherCaseType || ''} onChange={e => onChange('otherCaseType', e.target.value)} placeholder="Tipo de caso" required />
        </label>
      )}
      <label>
        <span>Canal</span>
        <select value={value.channel || 'whatsapp'} onChange={e => onChange('channel', e.target.value)}>
          {ESCALATION_CHANNELS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>
        <span>Prioridad</span>
        <select value={value.priority || 'media'} onChange={e => onChange('priority', e.target.value)}>
          {ESCALATION_PRIORITIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>
        <span>Responsable</span>
        <input value={value.assignedTo || ''} onChange={e => onChange('assignedTo', e.target.value)} placeholder="Quien lo resuelve" />
      </label>
      <label>
        <span>Fecha compromiso</span>
        <input type="date" value={value.dueDate || ''} onChange={e => onChange('dueDate', e.target.value)} />
      </label>
      <label className={compact ? 'span-3' : ''}>
        <span>Que paso</span>
        <textarea
          value={value.description || ''}
          onChange={e => onChange('description', e.target.value)}
          placeholder="Detalle del caso, contexto y lo que pide la persona"
          required
        />
      </label>
      {!compact && (
        <>
          <label>
            <span>Estado</span>
            <select value={value.status || 'abierto'} onChange={e => onChange('status', e.target.value)}>
              {ESCALATION_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label className="span-2">
            <span>Resolucion</span>
            <textarea
              value={value.resolution || ''}
              onChange={e => onChange('resolution', e.target.value)}
              placeholder="Como se cerro el caso y que se le respondio"
            />
          </label>
        </>
      )}
    </>
  );
}

function EscalationModal({ escalation, editing, setEditing, onClose, onSave, onEditChange, onFollowUp, canManage, saving }) {
  const value = editing || escalation;
  const history = Array.isArray(escalation.history) ? escalation.history : [];
  const followUps = useMemo(() => {
    const items = Array.isArray(escalation.followUps) ? [...escalation.followUps] : [];
    return items.sort((a, b) => dateMillis(b.date) - dateMillis(a.date));
  }, [escalation.followUps]);
  const [note, setNote] = useState('');

  async function submitFollowUp(event) {
    event.preventDefault();
    try {
      await onFollowUp(escalation.id, note);
      setNote('');
    } catch {
      // el mensaje de error ya se muestra en el modulo
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <AlertTriangle size={24} />
          <div>
            <p className="eyebrow">Detalle del caso</p>
            <h2>{escalation.title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title="Cerrar"><X size={17} /></button>
        </div>

        {editing ? (
          <form className="form-grid" onSubmit={onSave}>
            <div className="form-grid two">
              <EscalationFields value={value} onChange={onEditChange} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={saving}><Save size={17} /> Guardar cambios</button>
            </div>
          </form>
        ) : (
          <>
            <div className="certificate-detail-grid">
              <Detail label="Quien reporta" value={`${escalation.personName} (${personRoleLabel(escalation.personRole)})`} />
              <Detail label="Contacto" value={escalation.personContact || 'No registrado'} />
              <Detail label="Estudiante" value={escalation.studentName || 'No aplica'} />
              <Detail label="Tipo" value={typeLabel(escalation)} />
              <Detail label="Canal" value={channelLabel(escalation.channel)} />
              <Detail label="Prioridad" value={priorityLabel(escalation.priority)} />
              <Detail label="Estado" value={statusLabel(escalation.status)} />
              <Detail label="Responsable" value={escalation.assignedTo || 'Sin asignar'} />
              <Detail label="Compromiso" value={formatDueDate(escalation.dueDate)} />
              <Detail label="Reportado" value={formatDate(escalation.reportedAt)} />
              <Detail label="Resuelto" value={formatDate(escalation.resolvedAt)} />
              <Detail label="Creado por" value={escalation.createdBy || 'Sin registrar'} />
            </div>
            <Detail label="Que paso" value={escalation.description || 'Sin descripcion'} block />
            <Detail label="Resolucion" value={escalation.resolution || 'Sin resolucion registrada'} block />

            <div className="subsection-head">
              <h3>Seguimientos</h3>
              {canManage && <button className="btn ghost" onClick={() => setEditing({ ...escalation })}>Editar caso</button>}
            </div>

            {canManage && (
              <form className="followup-form" onSubmit={submitFollowUp}>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Que se hizo hoy: llamada, respuesta enviada, acuerdo, pendiente..."
                />
                <button className="btn primary" disabled={saving || !note.trim()}>
                  <MessageSquarePlus size={17} /> Agregar seguimiento
                </button>
              </form>
            )}

            <div className="history-list">
              {followUps.map((item, index) => (
                <div className="history-item followup-item" key={`${item.date?.seconds || index}-${index}`}>
                  <strong>{item.text}</strong>
                  <span>{item.user || 'Sistema'} - {formatDate(item.date)}</span>
                </div>
              ))}
              {!followUps.length && <p className="muted">Aun no hay seguimientos registrados.</p>}
            </div>

            <div className="subsection-head">
              <h3>Historial de cambios</h3>
            </div>
            <div className="history-list">
              {history.map((item, index) => (
                <div className="history-item" key={`${item.action}-${index}`}>
                  <strong>{item.action}</strong>
                  <span>{item.user || 'Sistema'} - {formatDate(item.date)}</span>
                </div>
              ))}
              {!history.length && <p className="muted">Sin historial registrado.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, block = false }) {
  return (
    <div className={`detail-item ${block ? 'block' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function typeLabel(escalation) {
  if (escalation.caseType === 'otro') return normalizeText(escalation.otherCaseType || 'Otro');
  return ESCALATION_TYPES.find(item => item.value === escalation.caseType)?.label || 'Queja o reclamo';
}

function statusLabel(status = 'abierto') {
  return ESCALATION_STATUSES.find(item => item.value === status)?.label || status;
}

function priorityLabel(priority = 'media') {
  return ESCALATION_PRIORITIES.find(item => item.value === priority)?.label || priority;
}

function channelLabel(channel = 'whatsapp') {
  return ESCALATION_CHANNELS.find(item => item.value === channel)?.label || channel;
}

function personRoleLabel(role = 'acudiente') {
  return ESCALATION_PERSON_ROLES.find(item => item.value === role)?.label || role;
}

function dateMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function formatDate(value) {
  if (!value) return 'Pendiente';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pendiente';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatDueDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(date);
}

function isOverdue(escalation) {
  if (!OPEN_ESCALATION_STATUSES.includes(escalation.status || 'abierto')) return false;
  if (!escalation.dueDate) return false;
  const date = new Date(`${escalation.dueDate}T23:59:59`);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() > date.getTime();
}
