import { deleteDoc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeArea, normalizeText } from '../utils/normalize';
import { normalizeTime } from '../utils/time';

// Directorio de asistentes por correo. El id del documento es el correo
// (en minusculas), para que cada persona pueda leer su propia invitacion
// al iniciar sesion y entrar directo, sin la segunda ventana.

export function inviteEmailKey(email) {
  return normalizeText(email).toLowerCase();
}

export function listenAssistantInvites(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'assistantInvites'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, email: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''), 'es'));
    callback(rows);
  });
}

export async function getAssistantInvite(email) {
  if (!db) return null;
  const key = inviteEmailKey(email);
  if (!key) return null;
  const snap = await getDoc(appDoc(db, 'assistantInvites', key));
  return snap.exists() ? { id: snap.id, email: snap.id, ...snap.data() } : null;
}

export async function saveAssistantInvite(invite) {
  if (!db) throw new Error('Firebase no esta disponible.');
  const email = inviteEmailKey(invite.email);
  if (!email) throw new Error('El asistente necesita un correo.');
  await setDoc(appDoc(db, 'assistantInvites', email), {
    displayName: normalizeText(invite.displayName) || email,
    area: normalizeArea(invite.area),
    buttonAccess: Array.isArray(invite.buttonAccess) ? invite.buttonAccess : [],
    lunchStart: normalizeTime(invite.lunchStart) || '',
    lunchMinutes: Number(invite.lunchMinutes) || 60,
    active: invite.active !== false,
    updatedAt: serverTimestamp(),
    createdAt: invite.createdAt || serverTimestamp()
  }, { merge: true });
  return email;
}

export async function deleteAssistantInvite(email) {
  if (!db) throw new Error('Firebase no esta disponible.');
  const key = inviteEmailKey(email);
  if (!key) throw new Error('Falta el correo.');
  await deleteDoc(appDoc(db, 'assistantInvites', key));
}
