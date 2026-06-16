import {
  doc,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import {
  emailKey,
  normalizeButtonAccess,
  normalizeButtonSection,
  normalizeRole,
  normalizeText,
  parseBoolean,
  pick,
  slugify
} from '../utils/normalize';
import { normalizeSchedulePayload } from './scheduleService';

const BATCH_LIMIT = 450;

async function commitInChunks(items, writer) {
  let committed = 0;
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = items.slice(i, i + BATCH_LIMIT);
    chunk.forEach(item => writer(batch, item));
    await batch.commit();
    committed += chunk.length;
  }
  return committed;
}

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.rows && Array.isArray(payload.rows)) return payload.rows;
  if (payload && typeof payload === 'object') return Object.values(payload).flat().filter(v => typeof v === 'object');
  return [];
}

export function normalizeImportedButton(row) {
  const name = normalizeText(pick(row, ['name', 'nombre', 'boton', 'botón', 'herramienta']));
  const id = normalizeText(pick(row, ['id', 'slug', 'codigo', 'código'])) || slugify(name);
  return {
    id,
    name,
    url: normalizeText(pick(row, ['url', 'link', 'enlace'])),
    type: normalizeText(pick(row, ['type', 'tipo'])) || 'externo',
    section: normalizeButtonSection(pick(row, ['section', 'seccion', 'sección', 'categoria', 'categoría'])),
    icon: normalizeText(pick(row, ['icon', 'icono', 'ícono'])) || '',
    order: Number(pick(row, ['order', 'orden']) || 999),
    active: parseBoolean(pick(row, ['active', 'activo', 'estado']), true),
    importedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

export function normalizeImportedUser(row) {
  const email = normalizeText(pick(row, ['email', 'correo', 'correo electronico', 'correo electrónico'])).toLowerCase();
  const displayName = normalizeText(pick(row, ['displayName', 'nombre', 'usuario', 'username', 'asistente'])) || email;
  return {
    email,
    displayName,
    legacyUsername: normalizeText(pick(row, ['usuario', 'username', 'nombre'])) || displayName,
    role: normalizeRole(pick(row, ['role', 'rol', 'cargo'])) || 'docente',
    active: parseBoolean(pick(row, ['active', 'activo', 'estado']), false),
    pending: true,
    buttonAccess: normalizeButtonAccess(pick(row, ['buttonAccess', 'botones', 'permisos', 'accesos']))
  };
}

export function normalizeImportedSchedule(row) {
  return normalizeSchedulePayload({
    id: pick(row, ['id', 'ID']),
    day: pick(row, ['day', 'dia', 'día']),
    startTime: pick(row, ['startTime', 'horaInicio', 'hora inicio', 'hora de inicio']),
    endTime: pick(row, ['endTime', 'horaFin', 'hora fin', 'hora final']),
    assistantName: pick(row, ['assistantName', 'asistente', 'nombre']),
    assistantEmail: pick(row, ['assistantEmail', 'correo', 'email']),
    task: pick(row, ['task', 'tarea', 'actividad']),
    description: pick(row, ['description', 'descripcion', 'descripción']),
    note: pick(row, ['note', 'nota', 'observacion', 'observación']),
    color: pick(row, ['color']),
    active: parseBoolean(pick(row, ['active', 'activo', 'estado']), true)
  });
}

export async function importButtons(rows) {
  if (!db) throw new Error('Firebase no está disponible.');
  const items = toArray(rows).map(normalizeImportedButton).filter(item => item.name && item.url);
  const committed = await commitInChunks(items, (batch, item) => {
    const ref = appDoc(db, 'buttons', item.id);
    batch.set(ref, item, { merge: true });
  });
  await logImport('buttons', committed);
  return { committed, skipped: toArray(rows).length - items.length };
}

export async function importUsers(rows) {
  if (!db) throw new Error('Firebase no está disponible.');
  const source = toArray(rows);
  const items = source.map(normalizeImportedUser).filter(item => item.displayName || item.email);
  const committed = await commitInChunks(items, (batch, item) => {
    const collectionName = item.email ? 'userInvites' : 'legacyUsers';
    const id = item.email ? emailKey(item.email) : slugify(item.legacyUsername || item.displayName);
    const ref = appDoc(db, collectionName, id);
    batch.set(ref, {
      ...item,
      importedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  await logImport('users', committed);
  return { committed, skipped: source.length - items.length };
}

export async function importSchedule(rows) {
  if (!db) throw new Error('Firebase no está disponible.');
  const source = toArray(rows);
  const items = [];
  const errors = [];

  source.forEach((row, index) => {
    try {
      const item = normalizeImportedSchedule(row);
      if (!item.task) throw new Error('Falta tarea.');
      if (!item.assistantName && !item.assistantEmail) throw new Error('Falta asistente.');
      items.push({ ...item, sourceIndex: index });
    } catch (error) {
      errors.push({ row: index + 2, error: error.message });
    }
  });

  const committed = await commitInChunks(items, (batch, item) => {
    const id = slugify(`${item.day}-${item.assistantEmail || item.assistantName}-${item.startTime}-${item.task}`);
    const ref = appDoc(db, 'schedule', id);
    batch.set(ref, {
      ...item,
      importedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
  await logImport('schedule', committed, { errors: errors.slice(0, 30) });
  return { committed, skipped: source.length - items.length, errors };
}

export async function importBundle(bundle) {
  const result = {};
  if (bundle?.usuarios || bundle?.users) result.users = await importUsers(bundle.usuarios || bundle.users);
  if (bundle?.botones || bundle?.buttons) result.buttons = await importButtons(bundle.botones || bundle.buttons);
  if (bundle?.horario || bundle?.schedule) result.schedule = await importSchedule(bundle.horario || bundle.schedule);
  return result;
}

async function logImport(type, count, extra = {}) {
  await setDoc(doc(appCollection(db, 'imports')), {
    type,
    count,
    ...extra,
    createdAt: serverTimestamp()
  });
}
