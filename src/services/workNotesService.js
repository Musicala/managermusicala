import { addDoc, arrayUnion, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeText } from '../utils/normalize';

export function listenWorkNotes(ownerUid, isAdmin, callback, onError) {
  if (!db || !ownerUid) return () => {};
  const notesQuery = isAdmin
    ? appCollection(db, 'workNotes')
    : query(appCollection(db, 'workNotes'), where('ownerUid', '==', ownerUid));
  return onSnapshot(notesQuery, snapshot => {
    const notes = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    notes.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    callback(notes);
  }, onError);
}

export async function saveWorkNote(note, owner) {
  if (!db || !owner?.uid) throw new Error('No se encontró el usuario autenticado.');
  const payload = {
    ownerUid: owner.uid,
    ownerEmail: normalizeText(owner.email).toLowerCase(),
    ownerName: normalizeText(owner.name || owner.email),
    title: normalizeText(note.title) || 'Sin título',
    content: normalizeText(note.content),
    type: ['quick', 'pending', 'idea', 'log'].includes(note.type) ? note.type : 'quick',
    priority: ['alta', 'media', 'baja'].includes(note.priority) ? note.priority : 'media',
    category: normalizeText(note.category),
    tags: Array.isArray(note.tags) ? note.tags.map(normalizeText).filter(Boolean) : [],
    checklist: Array.isArray(note.checklist) ? note.checklist.map(normalizeText).filter(Boolean) : [],
    dueDate: normalizeText(note.dueDate),
    reminderAt: normalizeText(note.reminderAt),
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    deleted: Boolean(note.deleted),
    updatedAt: serverTimestamp(),
    updatedByUid: owner.actorUid || owner.uid,
    updatedByName: normalizeText(owner.actorName || owner.name || owner.email)
  };
  if (!payload.content) throw new Error('Escribe el contenido de la nota.');
  const event = {
    action: note.id ? 'updated' : 'created',
    actorUid: owner.actorUid || owner.uid,
    actorName: normalizeText(owner.actorName || owner.name || owner.email),
    at: Timestamp.now()
  };
  if (note.id) {
    delete payload.ownerUid;
    delete payload.ownerEmail;
    delete payload.ownerName;
    return updateDoc(appDoc(db, 'workNotes', note.id), { ...payload, history: arrayUnion(event) });
  }
  return addDoc(appCollection(db, 'workNotes'), { ...payload, createdAt: serverTimestamp(), history: [event] });
}

export function softDeleteWorkNote(noteId, actor) {
  return updateDoc(appDoc(db, 'workNotes', noteId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedByUid: actor.uid,
    deletedByName: normalizeText(actor.name || actor.email),
    updatedAt: serverTimestamp(),
    history: arrayUnion({
      action: 'deleted',
      actorUid: actor.uid,
      actorName: normalizeText(actor.name || actor.email),
      at: Timestamp.now()
    })
  });
}

export function listenWorkNotePreferences(userUid, callback) {
  if (!db || !userUid) return () => {};
  return onSnapshot(appDoc(db, 'workNotePreferences', userUid), snapshot => {
    callback(snapshot.exists() ? snapshot.data() : { theme: 'violeta' });
  });
}

export function saveWorkNotePreferences(userUid, preferences) {
  return setDoc(appDoc(db, 'workNotePreferences', userUid), {
    ownerUid: userUid,
    theme: ['violeta', 'azul', 'magenta', 'verde'].includes(preferences.theme) ? preferences.theme : 'violeta',
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function toMillis(value) {
  if (value?.toMillis) return value.toMillis();
  return Number(value) || 0;
}
