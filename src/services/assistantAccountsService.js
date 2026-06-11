import { deleteDoc, getDocs, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { normalizeText, slugify } from '../utils/normalize';

export function listenAssistantAccounts(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'assistantAccounts'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.displayName || a.username || '').localeCompare(String(b.displayName || b.username || ''), 'es'));
    callback(rows);
  });
}

export async function saveAssistantAccount(account) {
  if (!db) throw new Error('Firebase no esta disponible.');
  const username = normalizeText(account.username).toLowerCase();
  const id = account.id || slugify(username || account.displayName);
  if (!username) throw new Error('El usuario necesita nombre de usuario.');
  if (!normalizeText(account.password)) throw new Error('El usuario necesita contraseña.');
  await setDoc(appDoc(db, 'assistantAccounts', id), {
    username,
    displayName: normalizeText(account.displayName) || username,
    password: normalizeText(account.password),
    role: 'asistente',
    active: account.active !== false,
    updatedAt: serverTimestamp(),
    createdAt: account.createdAt || serverTimestamp()
  }, { merge: true });
  return id;
}

export async function deleteAssistantAccount(accountId) {
  if (!db || !accountId) throw new Error('Falta el usuario.');
  await deleteDoc(appDoc(db, 'assistantAccounts', accountId));
}

export function buildAssistantProfile(account, authUser) {
  return {
    id: `assistant:${account.id}`,
    uid: `${authUser.uid}:${account.id}`,
    email: authUser.email,
    displayName: account.displayName || account.username,
    assistantName: account.displayName || account.username,
    assistantUsername: account.username,
    role: 'asistente',
    active: true,
    pending: false,
    buttonAccess: Array.isArray(account.buttonAccess) ? account.buttonAccess : []
  };
}

export async function resolveAssistantProfile(account, authUser) {
  const profile = buildAssistantProfile(account, authUser);
  if (!db) return profile;

  const sources = [
    await getDocs(appCollection(db, 'userInvites')),
    await getDocs(appCollection(db, 'legacyUsers')),
    await getDocs(appCollection(db, 'users'))
  ];

  const accountKeys = [
    normalizeText(account.username).toLowerCase(),
    normalizeText(account.displayName).toLowerCase()
  ].filter(Boolean);

  for (const snap of sources) {
    const match = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .find(row => {
        const rowKeys = [
          normalizeText(row.username || row.legacyUsername).toLowerCase(),
          normalizeText(row.displayName).toLowerCase(),
          normalizeText(row.assistantName).toLowerCase()
        ].filter(Boolean);
        return rowKeys.some(key => accountKeys.includes(key));
      });

    if (match) {
      return {
        ...profile,
        buttonAccess: Array.isArray(match.buttonAccess) ? match.buttonAccess : profile.buttonAccess
      };
    }
  }

  return profile;
}
