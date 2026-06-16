import {
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeButtonSection, normalizeText, slugify } from '../utils/normalize';

export function listenButtons(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'buttons'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => {
      const sec = String(a.section || '').localeCompare(String(b.section || ''), 'es', { sensitivity: 'base' });
      if (sec !== 0) return sec;
      const order = Number(a.order || 999) - Number(b.order || 999);
      if (order !== 0) return order;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    });
    callback(rows);
  });
}

export async function saveButton(button) {
  if (!db) throw new Error('Firebase no está disponible.');
  const id = normalizeText(button.id) || slugify(button.name);
  const payload = {
    name: normalizeText(button.name),
    url: normalizeText(button.url),
    type: normalizeText(button.type || 'externo').toLowerCase(),
    section: normalizeButtonSection(button.section, button.sectionOptions),
    icon: normalizeText(button.icon || ''),
    order: Number(button.order || 999),
    active: button.active !== false,
    updatedAt: serverTimestamp()
  };
  if (!payload.name || !payload.url) throw new Error('Cada botón necesita nombre y URL.');
  await setDoc(appDoc(db, 'buttons', id), payload, { merge: true });
  return id;
}

export async function createButton(button) {
  if (!db) throw new Error('Firebase no está disponible.');
  const payload = {
    name: normalizeText(button.name),
    url: normalizeText(button.url),
    type: normalizeText(button.type || 'externo').toLowerCase(),
    section: normalizeButtonSection(button.section, button.sectionOptions),
    icon: normalizeText(button.icon || ''),
    order: Number(button.order || 999),
    active: button.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(appCollection(db, 'buttons'), payload);
  return ref.id;
}

export async function updateButton(buttonId, changes) {
  if (!db || !buttonId) throw new Error('Falta el botón.');
  await updateDoc(appDoc(db, 'buttons', buttonId), {
    ...changes,
    updatedAt: serverTimestamp()
  });
}

export async function deleteButton(buttonId) {
  if (!db || !buttonId) throw new Error('Falta el botón.');
  await deleteDoc(appDoc(db, 'buttons', buttonId));
}
