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

export const CERTIFICATE_TYPES = [
  { value: 'academico', label: 'Academico' },
  { value: 'laboral', label: 'Laboral' },
  { value: 'financiero', label: 'Financiero' },
  { value: 'otro', label: 'Otro' }
];

export const CERTIFICATE_STATUSES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'realizado', label: 'Realizado' },
  { value: 'entregado', label: 'Entregado' }
];

export function listenCertificates(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'certificates'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => timestampMillis(b.requestedAt) - timestampMillis(a.requestedAt));
    callback(rows);
  });
}

export async function saveCertificate(certificate, userName = '') {
  if (!db) throw new Error('Firebase no esta disponible.');
  const now = serverTimestamp();
  const isNew = !certificate.id;
  const type = normalizeText(certificate.certificateType || 'academico');
  const otherType = type === 'otro' ? normalizeText(certificate.otherCertificateType) : '';
  const id = certificate.id || slugify(`${certificate.requesterName}-${Date.now()}`);
  const payload = {
    id,
    requesterName: normalizeText(certificate.requesterName),
    requesterEmail: normalizeText(certificate.requesterEmail),
    certificateType: type,
    otherCertificateType: otherType,
    description: normalizeText(certificate.description),
    status: normalizeText(certificate.status || 'pendiente'),
    requestedAt: certificate.requestedAt || now,
    completedAt: certificate.completedAt || null,
    deliveredAt: certificate.deliveredAt || null,
    assignedTo: normalizeText(certificate.assignedTo),
    observations: normalizeText(certificate.observations),
    createdBy: normalizeText(certificate.createdBy || userName),
    updatedAt: now
  };

  if (!payload.requesterName) throw new Error('La solicitud necesita nombre.');
  if (!payload.description) throw new Error('La solicitud necesita descripcion.');
  if (type === 'otro' && !otherType) throw new Error('Especifica el tipo de certificado.');

  if (isNew) {
    payload.history = [
      {
        action: 'Solicitud creada',
        user: normalizeText(userName),
        date: Timestamp.now()
      }
    ];
  } else {
    payload.history = arrayUnion({
      action: 'Solicitud editada',
      user: normalizeText(userName),
      date: Timestamp.now()
    });
  }

  await setDoc(appDoc(db, 'certificates', id), payload, { merge: true });
  return id;
}

export async function updateCertificateStatus(certificate, status, userName = '') {
  if (!db || !certificate?.id) throw new Error('Falta la solicitud.');
  const nextStatus = normalizeText(status || 'pendiente');
  const historyEntries = [{
    action: `Estado cambiado a ${statusLabel(nextStatus)}`,
    user: normalizeText(userName),
    date: Timestamp.now()
  }];
  const payload = {
    status: nextStatus,
    updatedAt: serverTimestamp(),
    history: arrayUnion(...historyEntries)
  };
  if (nextStatus === 'realizado' && !certificate.completedAt) payload.completedAt = serverTimestamp();
  if (nextStatus === 'entregado' && !certificate.deliveredAt) {
    payload.deliveredAt = serverTimestamp();
    if (!certificate.completedAt) payload.completedAt = serverTimestamp();
    historyEntries.push({
      action: 'Certificado entregado',
      user: normalizeText(userName),
      date: Timestamp.now()
    });
    payload.history = arrayUnion(...historyEntries);
  }
  await updateDoc(appDoc(db, 'certificates', certificate.id), payload);
}

export async function deleteCertificate(certificateId) {
  if (!db || !certificateId) throw new Error('Falta la solicitud.');
  await deleteDoc(appDoc(db, 'certificates', certificateId));
}

export async function addCertificateHistory(certificateId, action, userName = '') {
  if (!db || !certificateId) throw new Error('Falta la solicitud.');
  await updateDoc(appDoc(db, 'certificates', certificateId), {
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      action: normalizeText(action),
      user: normalizeText(userName),
      date: Timestamp.now()
    })
  });
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function statusLabel(status) {
  return CERTIFICATE_STATUSES.find(item => item.value === status)?.label || status;
}
