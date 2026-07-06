import {
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeText } from '../utils/normalize';

export const MOTO_COUNT = 4;
export const BIKE_COUNT = 2;

const spotId = (type, number) => `${type}-${number}`;

// Base fija de espacios: 4 para motos y 2 para ciclas, vacíos por defecto.
function defaultSpots() {
  const motos = Array.from({ length: MOTO_COUNT }, (_, i) => ({
    id: spotId('moto', i + 1),
    type: 'moto',
    number: i + 1,
    name: '',
    plate: '',
    motoType: '',
    updatedAt: null,
    updatedBy: ''
  }));
  const bikes = Array.from({ length: BIKE_COUNT }, (_, i) => ({
    id: spotId('cicla', i + 1),
    type: 'cicla',
    number: i + 1,
    name: '',
    plate: '',
    motoType: '',
    updatedAt: null,
    updatedBy: ''
  }));
  return [...motos, ...bikes];
}

// Combina la base fija con lo que haya en Firestore, para que la grilla
// siempre muestre todos los espacios aunque algún documento no exista.
export function listenParking(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'parking'), snap => {
    const stored = new Map(snap.docs.map(d => [d.id, d.data()]));
    const rows = defaultSpots().map(base => {
      const data = stored.get(base.id);
      if (!data) return base;
      return {
        ...base,
        name: normalizeText(data.name || ''),
        plate: normalizeText(data.plate || ''),
        motoType: normalizeText(data.motoType || ''),
        updatedAt: data.updatedAt || null,
        updatedBy: normalizeText(data.updatedBy || '')
      };
    });
    callback(rows);
  });
}

function validate(type, number) {
  if (type === 'moto' && (number < 1 || number > MOTO_COUNT)) {
    throw new Error('Espacio de moto inválido.');
  }
  if (type === 'cicla' && (number < 1 || number > BIKE_COUNT)) {
    throw new Error('Espacio de cicla inválido.');
  }
  if (type !== 'moto' && type !== 'cicla') {
    throw new Error('Tipo de espacio inválido.');
  }
}

// Asigna un espacio de parqueadero. Para ciclas solo se guarda el nombre.
export async function assignSpot(type, number, data = {}, actorName = '') {
  if (!db) throw new Error('Firebase no está disponible.');
  validate(type, number);
  const name = normalizeText(data.name);
  if (!name) throw new Error('Escribe un nombre.');

  const ref = appDoc(db, 'parking', spotId(type, number));
  await runTransaction(db, async tx => {
    tx.set(ref, {
      type,
      number,
      name,
      plate: type === 'moto' ? normalizeText(data.plate) : '',
      motoType: type === 'moto' ? normalizeText(data.motoType) : '',
      updatedAt: serverTimestamp(),
      updatedBy: normalizeText(actorName)
    }, { merge: true });
  });
}

export async function releaseSpot(type, number, actorName = '') {
  if (!db) throw new Error('Firebase no está disponible.');
  validate(type, number);
  const ref = appDoc(db, 'parking', spotId(type, number));
  await runTransaction(db, async tx => {
    tx.set(ref, {
      type,
      number,
      name: '',
      plate: '',
      motoType: '',
      updatedAt: serverTimestamp(),
      updatedBy: normalizeText(actorName)
    }, { merge: true });
  });
}
