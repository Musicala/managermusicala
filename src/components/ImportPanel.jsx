import { useMemo, useState } from 'react';
import { FileJson, UploadCloud } from 'lucide-react';
import { parseFile } from '../utils/csv';
import { importBundle, importButtons, importSchedule, importUsers } from '../services/importService';

const TYPES = {
  bundle: 'Paquete JSON completo',
  users: 'Usuarios antiguos',
  buttons: 'Botones',
  schedule: 'Horario'
};

export default function ImportPanel() {
  const [type, setType] = useState('buttons');
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const previewRows = useMemo(() => {
    if (!rows) return [];
    if (Array.isArray(rows)) return rows.slice(0, 5);
    if (typeof rows === 'object') return Object.entries(rows).slice(0, 5).map(([key, value]) => ({ key, preview: Array.isArray(value) ? `${value.length} registros` : typeof value }));
    return [];
  }, [rows]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      setFileName(file.name);
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo.');
    }
  }

  async function runImport() {
    if (!rows) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      let response;
      if (type === 'bundle') response = await importBundle(rows);
      if (type === 'users') response = await importUsers(rows);
      if (type === 'buttons') response = await importButtons(rows);
      if (type === 'schedule') response = await importSchedule(rows);
      setResult(response);
    } catch (err) {
      setError(err.message || 'No se pudo importar la información.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="module-card wide">
      <div className="module-header">
        <div>
          <p className="eyebrow">Migración</p>
          <h2>Importar datos del sistema anterior</h2>
        </div>
        <FileJson size={28} />
      </div>

      <div className="info-banner">
        Este importador es temporal. Sube CSV o JSON exportado desde las hojas antiguas. Los usuarios importados quedan como invitaciones/perfiles heredados; las cuentas reales se activan cuando cada persona se registra con correo en Firebase Auth.
      </div>

      <div className="import-box">
        <label>
          <span>Tipo de importación</span>
          <select value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(TYPES).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select>
        </label>

        <label className="drop-zone">
          <UploadCloud size={34} />
          <strong>{fileName || 'Seleccionar archivo CSV o JSON'}</strong>
          <span>Se detecta coma, punto y coma o tabulador.</span>
          <input type="file" accept=".csv,.tsv,.json,text/csv,application/json" onChange={handleFile} />
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      {previewRows.length > 0 && (
        <div className="preview-panel">
          <h3>Vista previa</h3>
          <pre>{JSON.stringify(previewRows, null, 2)}</pre>
          <button className="btn primary" onClick={runImport} disabled={loading}>
            {loading ? 'Importando...' : 'Importar a Firebase'}
          </button>
        </div>
      )}

      {result && (
        <div className="success-panel">
          <h3>Resultado</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}
