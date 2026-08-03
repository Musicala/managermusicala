import {
  arrayUnion,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeText, slugify } from '../utils/normalize';

export const ESCALATION_TYPES = [
  { value: 'queja', label: 'Queja o reclamo' },
  { value: 'comportamiento', label: 'Comportamiento en clase' },
  { value: 'cobro', label: 'Cartera o pago atrasado' },
  { value: 'reposicion', label: 'Reposicion o inasistencia' },
  { value: 'academico', label: 'Tema academico' },
  { value: 'dano', label: 'Dano o perdida material' },
  { value: 'otro', label: 'Otro' }
];

export const ESCALATION_STATUSES = [
  { value: 'abierto', label: 'Abierto' },
  { value: 'en_gestion', label: 'En gestion' },
  { value: 'esperando', label: 'Esperando respuesta' },
  { value: 'resuelto', label: 'Resuelto' },
  { value: 'cerrado', label: 'Cerrado sin resolver' }
];

export const ESCALATION_PRIORITIES = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' }
];

export const ESCALATION_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'llamada', label: 'Llamada' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'correo', label: 'Correo' },
  { value: 'otro', label: 'Otro' }
];

export const ESCALATION_PERSON_ROLES = [
  { value: 'acudiente', label: 'Acudiente' },
  { value: 'estudiante', label: 'Estudiante' },
  { value: 'docente', label: 'Docente' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'externo', label: 'Externo' }
];

export const OPEN_ESCALATION_STATUSES = ['abierto', 'en_gestion', 'esperando'];

export function listenEscalations(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'escalations'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => timestampMillis(b.reportedAt) - timestampMillis(a.reportedAt));
    callback(rows);
  });
}

export async function saveEscalation(escalation, userName = '') {
  if (!db) throw new Error('Firebase no esta disponible.');
  const now = serverTimestamp();
  const isNew = !escalation.id;
  const type = normalizeText(escalation.caseType || 'queja');
  const otherType = type === 'otro' ? normalizeText(escalation.otherCaseType) : '';
  const id = escalation.id || slugify(`${escalation.title}-${Date.now()}`);
  const payload = {
    id,
    title: normalizeText(escalation.title),
    personName: normalizeText(escalation.personName),
    personRole: normalizeText(escalation.personRole || 'acudiente'),
    personContact: normalizeText(escalation.personContact),
    studentName: normalizeText(escalation.studentName),
    caseType: type,
    otherCaseType: otherType,
    channel: normalizeText(escalation.channel || 'whatsapp'),
    priority: normalizeText(escalation.priority || 'media'),
    status: normalizeText(escalation.status || 'abierto'),
    description: normalizeText(escalation.description),
    resolution: normalizeText(escalation.resolution),
    assignedTo: normalizeText(escalation.assignedTo),
    dueDate: normalizeText(escalation.dueDate),
    reportedAt: escalation.reportedAt || now,
    resolvedAt: escalation.resolvedAt || null,
    createdBy: normalizeText(escalation.createdBy || userName),
    updatedAt: now
  };

  if (!payload.title) throw new Error('El caso necesita un asunto.');
  if (!payload.personName) throw new Error('Registra quien reporta el caso.');
  if (!payload.description) throw new Error('El caso necesita descripcion.');
  if (type === 'otro' && !otherType) throw new Error('Especifica el tipo de caso.');

  if (isNew) {
    payload.followUps = [];
    payload.history = [
      {
        action: 'Caso creado',
        user: normalizeText(userName),
        date: Timestamp.now()
      }
    ];
  } else {
    payload.history = arrayUnion({
      action: 'Caso editado',
      user: normalizeText(userName),
      date: Timestamp.now()
    });
  }

  await setDoc(appDoc(db, 'escalations', id), payload, { merge: true });
  return id;
}

export async function updateEscalationStatus(escalation, status, userName = '') {
  if (!db || !escalation?.id) throw new Error('Falta el caso.');
  const nextStatus = normalizeText(status || 'abierto');
  const payload = {
    status: nextStatus,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      action: `Estado cambiado a ${statusLabel(nextStatus)}`,
      user: normalizeText(userName),
      date: Timestamp.now()
    })
  };
  if (nextStatus === 'resuelto' && !escalation.resolvedAt) payload.resolvedAt = serverTimestamp();
  if (nextStatus !== 'resuelto' && nextStatus !== 'cerrado') payload.resolvedAt = null;
  await updateDoc(appDoc(db, 'escalations', escalation.id), payload);
}

export async function updateEscalationPriority(escalation, priority, userName = '') {
  if (!db || !escalation?.id) throw new Error('Falta el caso.');
  const nextPriority = normalizeText(priority || 'media');
  await updateDoc(appDoc(db, 'escalations', escalation.id), {
    priority: nextPriority,
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      action: `Prioridad cambiada a ${priorityLabel(nextPriority)}`,
      user: normalizeText(userName),
      date: Timestamp.now()
    })
  });
}

export async function addEscalationFollowUp(escalationId, text, userName = '') {
  if (!db || !escalationId) throw new Error('Falta el caso.');
  const note = normalizeText(text);
  if (!note) throw new Error('Escribe el seguimiento.');
  const entry = {
    text: note,
    user: normalizeText(userName),
    date: Timestamp.now()
  };
  await updateDoc(appDoc(db, 'escalations', escalationId), {
    updatedAt: serverTimestamp(),
    followUps: arrayUnion(entry),
    history: arrayUnion({
      action: 'Seguimiento registrado',
      user: normalizeText(userName),
      date: Timestamp.now()
    })
  });
}

export async function deleteEscalation(escalationId) {
  if (!db || !escalationId) throw new Error('Falta el caso.');
  await deleteDoc(appDoc(db, 'escalations', escalationId));
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function statusLabel(status) {
  return ESCALATION_STATUSES.find(item => item.value === status)?.label || status;
}

function priorityLabel(priority) {
  return ESCALATION_PRIORITIES.find(item => item.value === priority)?.label || priority;
}
