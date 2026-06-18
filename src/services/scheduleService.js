import {
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { DAYS, normalizeDay, normalizeText, slugify } from '../utils/normalize';
import { minutesToTime, normalizeTime, sortSchedule, timeToMinutes } from '../utils/time';

export function listenSchedule(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'schedule'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort(sortSchedule);
    callback(rows);
  });
}

export function normalizeSchedulePayload(input) {
  const day = normalizeDay(input.day || input.dia);
  const startTime = normalizeTime(input.startTime || input.horaInicio);
  const endTime = normalizeTime(input.endTime || input.horaFin);
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (!day || !DAYS.includes(day)) throw new Error('Selecciona un día válido.');
  if (!startTime || !endTime) throw new Error('Las horas deben tener formato válido.');
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    throw new Error('La hora final debe ser mayor a la hora inicial.');
  }

  return {
    day,
    dayIndex: DAYS.indexOf(day),
    startTime,
    endTime,
    startMinutes,
    endMinutes,
    assistantName: normalizeText(input.assistantName || input.asistente),
    assistantEmail: normalizeText(input.assistantEmail || input.correo || input.email).toLowerCase(),
    task: normalizeText(input.task || input.tarea),
    description: normalizeText(input.description || input.descripcion),
    note: normalizeText(input.note || input.nota),
    category: normalizeText(input.category || input.categoria || ''),
    color: normalizeText(input.color || 'azul'),
    scenario: normalizeText(input.scenario || input.modo || 'normal').toLowerCase(),
    active: input.active !== false
  };
}

// Id del documento de horario. Incluye el escenario para que la "misma" tarea
// pueda existir en varios escenarios (p. ej. normal y vacacional) sin pisarse.
function scheduleDocId(payload) {
  const scenario = payload.scenario || 'normal';
  return slugify(`${scenario}-${payload.day}-${payload.assistantName || payload.assistantEmail}-${payload.startTime}-${payload.task}`);
}

export async function saveScheduleTask(input) {
  if (!db) throw new Error('Firebase no está disponible.');
  const payload = normalizeSchedulePayload(input);
  if (!payload.assistantName && !payload.assistantEmail) throw new Error('La tarea necesita asistente.');
  if (!payload.task) throw new Error('La tarea necesita nombre.');

  const id = normalizeText(input.id) || scheduleDocId(payload);
  await setDoc(appDoc(db, 'schedule', id), {
    ...payload,
    createdAt: input.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

export async function shiftScheduleTasks(tasks, offsetMinutes) {
  if (!db) throw new Error('Firebase no está disponible.');
  const offset = Number(offsetMinutes);
  if (!Number.isFinite(offset) || offset === 0) throw new Error('Indica cuántos minutos correr el horario.');

  const updates = [];
  for (const item of tasks) {
    if (!item?.id) continue;
    const start = timeToMinutes(item.startTime) + offset;
    const end = timeToMinutes(item.endTime) + offset;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start < 0 || end > 24 * 60) {
      throw new Error(`La tarea "${item.task}" quedaría fuera del día (${item.startTime}-${item.endTime}).`);
    }
    updates.push({
      id: item.id,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      startMinutes: start,
      endMinutes: end
    });
  }
  if (!updates.length) throw new Error('No hay tareas para correr con ese filtro.');

  // Firestore limita los batch a 500 operaciones.
  for (let i = 0; i < updates.length; i += 450) {
    const batch = writeBatch(db);
    for (const update of updates.slice(i, i + 450)) {
      const { id, ...fields } = update;
      batch.set(appDoc(db, 'schedule', id), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }
  return updates.length;
}

export async function duplicateScheduleDay(sourceTasks, targetDays, options = {}) {
  if (!db) throw new Error('Firebase no está disponible.');
  const cleanTargets = [...new Set((targetDays || []).map(normalizeDay).filter(day => DAYS.includes(day)))];
  if (!cleanTargets.length) throw new Error('Selecciona al menos un día destino.');

  const activeSource = (sourceTasks || [])
    .filter(item => item?.active !== false)
    .filter(item => item?.day && item?.startTime && item?.endTime && item?.task);
  if (!activeSource.length) throw new Error('No hay tareas activas para duplicar en este día.');

  // Escenario destino: si se indica, las copias se mueven a ese escenario; si no,
  // se conserva el escenario de cada tarea de origen (comportamiento anterior).
  const targetScenario = options.targetScenario
    ? normalizeText(options.targetScenario).toLowerCase()
    : null;

  const existingTargets = options.replaceExisting
    ? (options.existingSchedule || [])
      .filter(item => item?.id && item.active !== false)
      .filter(item => cleanTargets.includes(item.day))
      .filter(item => !targetScenario
        || normalizeText(item.scenario || 'normal').toLowerCase() === targetScenario)
    : [];

  let copied = 0;
  const writes = [];

  for (const day of cleanTargets) {
    for (const item of activeSource) {
      const payload = normalizeSchedulePayload({ ...item, day, scenario: targetScenario || item.scenario });
      const id = scheduleDocId(payload);
      writes.push({ id, payload, source: item });
      copied += 1;
    }
  }

  const operations = [
    ...existingTargets.map(item => ({ type: 'delete', id: item.id })),
    ...writes.map(write => ({ type: 'set', ...write }))
  ];

  for (let i = 0; i < operations.length; i += 450) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(i, i + 450)) {
      if (operation.type === 'delete') {
        batch.delete(appDoc(db, 'schedule', operation.id));
      } else {
        batch.set(appDoc(db, 'schedule', operation.id), {
          ...operation.payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          duplicatedFrom: operation.source.id || null
        }, { merge: true });
      }
    }
    await batch.commit();
  }

  return copied;
}

export async function deleteScheduleTask(taskId) {
  if (!db || !taskId) throw new Error('Falta la tarea.');
  await deleteDoc(appDoc(db, 'schedule', taskId));
}
