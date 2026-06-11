import { collection, doc } from 'firebase/firestore';
import { firestoreAppRoot } from './config';

const [rootCollection, rootDoc] = firestoreAppRoot.split('/').filter(Boolean);

if (!rootCollection || !rootDoc) {
  throw new Error('VITE_FIRESTORE_APP_ROOT debe tener formato coleccion/documento.');
}

export function appCollection(db, collectionName) {
  return collection(db, rootCollection, rootDoc, collectionName);
}

export function appDoc(db, collectionName, docId) {
  return doc(db, rootCollection, rootDoc, collectionName, docId);
}
