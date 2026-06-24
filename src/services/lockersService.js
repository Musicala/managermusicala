import {
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeKey, normalizeText } from '../utils/normalize';

export const LOCKER_COUNT = 16;

const lockerId = number => `locker-${number}`;

// Lista base de 16 candados, vacíos por defecto.
function defaultLockers() {
  return Array.from({ length: LOCKER_COUNT }, (_, index) => ({
    id: lockerId(index + 1),
    number: index + 1,
    name: '',
    updatedAt: null,
    updatedBy: ''
  }));
}

// Combina la base fija (16) con lo que haya en Firestore, para que la grilla
// siempre muestre los 16 aunque algún documento todavía no exista.
export function listenLockers(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'lockers'), snap => {
    const stored = new Map(snap.docs.map(d => [d.id, d.data()]));
    const rows = defaultLockers().map(base => {
      const data = stored.get(base.id);
      if (!data) return base;
      return {
        ...base,
        name: normalizeText(data.name || ''),
        updatedAt: data.updatedAt || null,
        updatedBy: normalizeText(data.updatedBy || '')
      };
    });
    callback(rows);
  });
}

// Asigna un nombre a un candado concreto. Usa transacción para revisar
// duplicados sobre el estado real (varios dispositivos a la vez).
export async function assignLocker(number, rawName, actorName = '') {
  if (!db) throw new Error('Firebase no está disponible.');
  const name = normalizeText(rawName);
  if (!name) throw new Error('Escribe un nombre.');
  if (number < 1 || number > LOCKER_COUNT) throw new Error('Candado inválido.');

  const target = normalizeKey(name);
  const refs = Array.from({ length: LOCKER_COUNT }, (_, i) => appDoc(db, 'lockers', lockerId(i + 1)));
  const targetRef = appDoc(db, 'lockers', lockerId(number));

  await runTransaction(db, async tx => {
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const duplicate = snaps.find((snap, i) => {
      return i + 1 !== number && normalizeKey(snap.data()?.name || '') === target;
    });
    if (duplicate) {
      throw new Error(`Ese nombre ya tiene candado: ${duplicate.id.replace('locker-', '')}.`);
    }
    tx.set(targetRef, {
      number,
      name,
      updatedAt: serverTimestamp(),
      updatedBy: normalizeText(actorName)
    }, { merge: true });
  });
}

export async function releaseLocker(number, actorName = '') {
  if (!db) throw new Error('Firebase no está disponible.');
  if (number < 1 || number > LOCKER_COUNT) throw new Error('Candado inválido.');
  await runTransaction(db, async tx => {
    const ref = appDoc(db, 'lockers', lockerId(number));
    tx.set(ref, {
      number,
      name: '',
      updatedAt: serverTimestamp(),
      updatedBy: normalizeText(actorName)
    }, { merge: true });
  });
}

// Asigna el primer candado libre, a prueba de concurrencia.
export async function assignNextFree(rawName, actorName = '') {
  if (!db) throw new Error('Firebase no está disponible.');
  const name = normalizeText(rawName);
  if (!name) throw new Error('Escribe un nombre.');

  const target = normalizeKey(name);
  const refs = Array.from({ length: LOCKER_COUNT }, (_, i) => appDoc(db, 'lockers', lockerId(i + 1)));

  return runTransaction(db, async tx => {
    const snaps = await Promise.all(refs.map(ref => tx.get(ref)));
    const duplicate = snaps.find(snap => normalizeKey(snap.data()?.name || '') === target);
    if (duplicate) {
      throw new Error(`Ese nombre ya tiene candado: ${duplicate.id.replace('locker-', '')}.`);
    }
    const freeIndex = snaps.findIndex(snap => !normalizeText(snap.data()?.name || ''));
    if (freeIndex === -1) throw new Error('No hay candados libres.');
    const number = freeIndex + 1;
    tx.set(refs[freeIndex], {
      number,
      name,
      updatedAt: serverTimestamp(),
      updatedBy: normalizeText(actorName)
    }, { merge: true });
    return number;
  });
}
