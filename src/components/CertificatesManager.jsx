import { useMemo, useState } from 'react';
import { Eye, FileCheck2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import {
  CERTIFICATE_STATUSES,
  CERTIFICATE_TYPES,
  deleteCertificate,
  saveCertificate,
  updateCertificateStatus
} from '../services/certificatesService';
import { normalizeKey, normalizeText } from '../utils/normalize';

const EMPTY_CERTIFICATE = {
  requesterName: '',
  requesterEmail: '',
  certificateType: 'academico',
  otherCertificateType: '',
  description: '',
  assignedTo: '',
  observations: '',
  status: 'pendiente'
};

const STATUS_CLASS = {
  pendiente: 'pending',
  en_proceso: 'process',
  realizado: 'done',
  entregado: 'delivered'
};

export default function CertificatesManager({ certificates, currentUserName, canManage }) {
  const [draft, setDraft] = useState(EMPTY_CERTIFICATE);
  const [filters, setFilters] = useState({ search: '', type: '', status: '' });
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const summary = useMemo(() => {
    return certificates.reduce((acc, item) => {
      acc.total += 1;
      acc[item.status || 'pendiente'] = (acc[item.status || 'pendiente'] || 0) + 1;
      return acc;
    }, { pendiente: 0, en_proceso: 0, realizado: 0, entregado: 0, total: 0 });
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    const query = normalizeKey(filters.search);
    return certificates.filter(item => {
      const haystack = normalizeKey(`${item.requesterName} ${typeLabel(item)} ${item.description} ${item.assignedTo}`);
      const matchesSearch = !query || haystack.includes(query);
      const matchesType = !filters.type || item.certificateType === filters.type;
      const matchesStatus = !filters.status || item.status === filters.status;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [certificates, filters]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setMessage('');
    try {
      await saveCertificate(draft, currentUserName);
      setDraft(EMPTY_CERTIFICATE);
      setMessage('Solicitud guardada.');
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la solicitud.');
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
      await saveCertificate(editing, currentUserName);
      setSelected(editing);
      setEditing(null);
      setMessage('Solicitud actualizada.');
    } catch (error) {
      setMessage(error.message || 'No se pudo actualizar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(certificate, status) {
    if (!canManage || certificate.status === status) return;
    setSaving(true);
    setMessage('');
    try {
      await updateCertificateStatus(certificate, status, currentUserName);
      setMessage('Estado actualizado.');
    } catch (error) {
      setMessage(error.message || 'No se pudo cambiar el estado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(certificate) {
    if (!canManage) return;
    const ok = window.confirm(`Eliminar la solicitud de "${certificate.requesterName}"?`);
    if (!ok) return;
    setSaving(true);
    setMessage('');
    try {
      await deleteCertificate(certificate.id);
      if (selected?.id === certificate.id) setSelected(null);
      setMessage('Solicitud eliminada.');
    } catch (error) {
      setMessage(error.message || 'No se pudo eliminar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="widget-grid certificate-summary">
        <SummaryCard label="Pendientes" value={summary.pendiente} tone="pending" />
        <SummaryCard label="En proceso" value={summary.en_proceso} tone="process" />
        <SummaryCard label="Realizados" value={summary.realizado} tone="done" />
        <SummaryCard label="Entregados" value={summary.entregado} tone="delivered" />
        <SummaryCard label="Total" value={summary.total} tone="total" />
      </section>

      <section className="module-card wide">
        <div className="module-header">
          <div>
            <p className="eyebrow">Certificados</p>
            <h2>Solicitudes y seguimiento</h2>
          </div>
          <span className="pill">{filteredCertificates.length} visibles</span>
        </div>

        {message && <div className="info-banner">{message}</div>}
        {!canManage && <div className="info-banner">Vista de solo lectura.</div>}

        <div className="certificate-filters">
          <label>
            <span>Buscar</span>
            <div className="field-wrap">
              <Search size={17} />
              <input value={filters.search} onChange={e => setFilters(current => ({ ...current, search: e.target.value }))} placeholder="Nombre, tipo o responsable..." />
            </div>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filters.type} onChange={e => setFilters(current => ({ ...current, type: e.target.value }))}>
              <option value="">Todos</option>
              {CERTIFICATE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select value={filters.status} onChange={e => setFilters(current => ({ ...current, status: e.target.value }))}>
              <option value="">Todos</option>
              {CERTIFICATE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
        </div>

        {canManage && (
          <form className="certificate-form" onSubmit={handleCreate}>
            <div className="form-grid certificate-fields">
              <CertificateFields value={draft} onChange={(field, value) => setDraft(current => ({ ...current, [field]: value }))} compact />
            </div>
            <div className="right-actions">
              <button className="btn primary" disabled={saving}>
                <Plus size={17} /> {saving ? 'Guardando...' : 'Guardar solicitud'}
              </button>
            </div>
          </form>
        )}

        <div className="certificate-table-wrap">
          <table className="certificate-table">
            <thead>
              <tr>
                <th>Fecha solicitud</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Responsable</th>
                <th>Ultima actualizacion</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCertificates.map(certificate => (
                <tr key={certificate.id} className={isStalePending(certificate) ? 'stale-row' : ''}>
                  <td>
                    {formatDate(certificate.requestedAt)}
                    {isStalePending(certificate) && <span className="stale-flag">+5 dias pendiente</span>}
                  </td>
                  <td>{certificate.requesterName}</td>
                  <td>{typeLabel(certificate)}</td>
                  <td>
                    <select
                      className={`status-select ${STATUS_CLASS[certificate.status || 'pendiente']}`}
                      value={certificate.status || 'pendiente'}
                      disabled={!canManage || saving}
                      onChange={e => handleStatus(certificate, e.target.value)}
                    >
                      {CERTIFICATE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </td>
                  <td>{certificate.assignedTo || 'Sin asignar'}</td>
                  <td>{formatDate(certificate.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="icon-btn" title="Ver detalle" onClick={() => { setSelected(certificate); setEditing(null); }}>
                        <Eye size={16} />
                      </button>
                      {canManage && (
                        <button className="icon-btn danger-icon" title="Eliminar" onClick={() => handleDelete(certificate)} disabled={saving}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredCertificates.length && (
                <tr>
                  <td colSpan="7" className="empty-table">No hay solicitudes con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <CertificateModal
          certificate={selected}
          editing={editing}
          setEditing={setEditing}
          onClose={() => { setSelected(null); setEditing(null); }}
          onSave={handleSaveEdit}
          onEditChange={(field, value) => setEditing(current => ({ ...current, [field]: value }))}
          canManage={canManage}
          saving={saving}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <article className={`widget-card certificate-card ${tone}`}>
      <FileCheck2 size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function CertificateFields({ value, onChange, compact = false }) {
  return (
    <>
      <label>
        <span>Nombre de quien solicita</span>
        <input value={value.requesterName || ''} onChange={e => onChange('requesterName', e.target.value)} placeholder="Nombre completo" required />
      </label>
      <label>
        <span>Correo</span>
        <input value={value.requesterEmail || ''} onChange={e => onChange('requesterEmail', e.target.value)} placeholder="correo@ejemplo.com" type="email" />
      </label>
      <label>
        <span>Tipo de certificado</span>
        <select value={value.certificateType || 'academico'} onChange={e => onChange('certificateType', e.target.value)}>
          {CERTIFICATE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      {value.certificateType === 'otro' && (
        <label>
          <span>Especificar tipo</span>
          <input value={value.otherCertificateType || ''} onChange={e => onChange('otherCertificateType', e.target.value)} placeholder="Tipo de certificado" required />
        </label>
      )}
      <label className={compact ? 'span-2' : ''}>
        <span>Descripcion</span>
        <textarea value={value.description || ''} onChange={e => onChange('description', e.target.value)} placeholder="Detalle de la solicitud" required />
      </label>
      <label>
        <span>Responsable</span>
        <input value={value.assignedTo || ''} onChange={e => onChange('assignedTo', e.target.value)} placeholder="Opcional" />
      </label>
      {!compact && (
        <label>
          <span>Observaciones</span>
          <textarea value={value.observations || ''} onChange={e => onChange('observations', e.target.value)} placeholder="Observaciones internas" />
        </label>
      )}
    </>
  );
}

function CertificateModal({ certificate, editing, setEditing, onClose, onSave, onEditChange, canManage, saving }) {
  const value = editing || certificate;
  const history = Array.isArray(certificate.history) ? certificate.history : [];

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <FileCheck2 size={24} />
          <div>
            <p className="eyebrow">Detalle de solicitud</p>
            <h2>{certificate.requesterName}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title="Cerrar"><X size={17} /></button>
        </div>

        {editing ? (
          <form className="form-grid" onSubmit={onSave}>
            <div className="form-grid two">
              <CertificateFields value={value} onChange={onEditChange} />
            </div>
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn primary" disabled={saving}><Save size={17} /> Guardar cambios</button>
            </div>
          </form>
        ) : (
          <>
            <div className="certificate-detail-grid">
              <Detail label="Correo" value={certificate.requesterEmail || 'No registrado'} />
              <Detail label="Tipo" value={typeLabel(certificate)} />
              <Detail label="Estado" value={statusLabel(certificate.status)} />
              <Detail label="Responsable" value={certificate.assignedTo || 'Sin asignar'} />
              <Detail label="Solicitado" value={formatDate(certificate.requestedAt)} />
              <Detail label="Realizado" value={formatDate(certificate.completedAt)} />
              <Detail label="Entregado" value={formatDate(certificate.deliveredAt)} />
              <Detail label="Actualizado" value={formatDate(certificate.updatedAt)} />
              <Detail label="Creado por" value={certificate.createdBy || 'Sin registrar'} />
            </div>
            <Detail label="Descripcion" value={certificate.description || 'Sin descripcion'} block />
            <Detail label="Observaciones" value={certificate.observations || 'Sin observaciones'} block />
            <div className="subsection-head">
              <h3>Historial de cambios</h3>
              {canManage && <button className="btn ghost" onClick={() => setEditing({ ...certificate })}>Editar</button>}
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

function typeLabel(certificate) {
  if (certificate.certificateType === 'otro') return normalizeText(certificate.otherCertificateType || 'Otro');
  return CERTIFICATE_TYPES.find(item => item.value === certificate.certificateType)?.label || 'Academico';
}

function statusLabel(status = 'pendiente') {
  return CERTIFICATE_STATUSES.find(item => item.value === status)?.label || status;
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

function isStalePending(certificate) {
  if ((certificate.status || 'pendiente') !== 'pendiente') return false;
  const value = certificate.requestedAt;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > 5 * 24 * 60 * 60 * 1000;
}
