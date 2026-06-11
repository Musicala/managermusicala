import {
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { emailKey, normalizeButtonAccess, normalizeRole, normalizeText } from '../utils/normalize';

export function listenUsers(callback) {
  if (!db) return () => {};
  const state = { users: [], invites: [], legacy: [], assistantAccounts: [] };

  const emit = () => {
    const merged = new Map();

    state.assistantAccounts.forEach(account => {
      const accountKeys = [
        normalizeText(account.username).toLowerCase(),
        normalizeText(account.displayName).toLowerCase()
      ].filter(Boolean);
      const permissions = state.legacy.find(row => {
        const rowKeys = [
          normalizeText(row.username || row.legacyUsername).toLowerCase(),
          normalizeText(row.displayName).toLowerCase(),
          normalizeText(row.assistantName).toLowerCase()
        ].filter(Boolean);
        return rowKeys.some(key => accountKeys.includes(key));
      });

      merged.set(`assistantAccount:${account.id}`, {
        ...permissions,
        ...account,
        id: account.id,
        source: 'assistantAccount',
        hasAuthProfile: false,
        role: 'asistente',
        active: account.active !== false,
        email: 'musicalaasesor@gmail.com',
        displayName: account.displayName || account.username
      });
    });

    state.invites.forEach(item => merged.set(`invite:${item.id}`, item));
    state.legacy.forEach(item => {
      const alreadyCovered = state.assistantAccounts.some(account => {
        const accountKeys = [
          normalizeText(account.username).toLowerCase(),
          normalizeText(account.displayName).toLowerCase()
        ].filter(Boolean);
        const rowKeys = [
          normalizeText(item.username || item.legacyUsername).toLowerCase(),
          normalizeText(item.displayName).toLowerCase(),
          normalizeText(item.assistantName).toLowerCase()
        ].filter(Boolean);
        return rowKeys.some(key => accountKeys.includes(key));
      });
      if (!alreadyCovered) merged.set(`legacy:${item.id}`, item);
    });

    state.users.forEach(item => {
      const email = normalizeText(item.email).toLowerCase();
      const invite = email ? state.invites.find(row => normalizeText(row.email).toLowerCase() === email) : null;
      if (invite) merged.delete(`invite:${invite.id}`);
      merged.set(`user:${item.id}`, {
        ...invite,
        ...item,
        source: 'user',
        hasAuthProfile: true
      });
    });

    callback(
      Array.from(merged.values()).sort((a, b) =>
        String(a.displayName || a.email || '').localeCompare(String(b.displayName || b.email || ''), 'es')
      )
    );
  };

  const unsubUsers = onSnapshot(query(appCollection(db, 'users'), orderBy('displayName')), snap => {
    state.users = snap.docs.map(d => ({ id: d.id, source: 'user', hasAuthProfile: true, ...d.data() }));
    emit();
  });

  const unsubInvites = onSnapshot(appCollection(db, 'userInvites'), snap => {
    state.invites = snap.docs.map(d => ({ id: d.id, source: 'invite', hasAuthProfile: false, ...d.data() }));
    emit();
  });

  const unsubLegacy = onSnapshot(appCollection(db, 'legacyUsers'), snap => {
    state.legacy = snap.docs.map(d => ({ id: d.id, source: 'legacy', hasAuthProfile: false, ...d.data() }));
    emit();
  });

  const unsubAssistantAccounts = onSnapshot(appCollection(db, 'assistantAccounts'), snap => {
    state.assistantAccounts = snap.docs.map(d => ({ id: d.id, source: 'assistantAccount', hasAuthProfile: false, ...d.data() }));
    emit();
  });

  return () => {
    unsubUsers();
    unsubInvites();
    unsubLegacy();
    unsubAssistantAccounts();
  };
}

export async function updateUserProfile(userId, changes) {
  if (!db || !userId) throw new Error('Falta el usuario.');
  const payload = {
    updatedAt: serverTimestamp()
  };

  if (Object.prototype.hasOwnProperty.call(changes, 'displayName')) {
    payload.displayName = normalizeText(changes.displayName);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'role')) {
    payload.role = normalizeRole(changes.role);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'active')) {
    payload.active = Boolean(changes.active);
    payload.pending = !Boolean(changes.active);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'buttonAccess')) {
    payload.buttonAccess = Array.isArray(changes.buttonAccess)
      ? changes.buttonAccess
      : normalizeButtonAccess(changes.buttonAccess);
  }

  if (changes.source === 'invite') {
    const id = changes.email ? emailKey(changes.email) : userId;
    await setDoc(appDoc(db, 'userInvites', id), payload, { merge: true });
    return;
  }

  if (changes.source === 'legacy') {
    await setDoc(appDoc(db, 'legacyUsers', userId), payload, { merge: true });
    return;
  }

  if (changes.source === 'assistantAccount') {
    await setDoc(appDoc(db, 'legacyUsers', `assistant-${userId}`), {
      ...payload,
      displayName: normalizeText(changes.displayName),
      legacyUsername: normalizeText(changes.username || changes.displayName).toLowerCase(),
      role: 'asistente',
      email: 'musicalaasesor@gmail.com'
    }, { merge: true });
    return;
  }

  await updateDoc(appDoc(db, 'users', userId), payload);
}

export async function deleteUserProfile(user) {
  if (!db || !user?.id) throw new Error('Falta el usuario.');

  if (user.source === 'invite') {
    const id = user.email ? emailKey(user.email) : user.id;
    await deleteDoc(appDoc(db, 'userInvites', id));
    return;
  }

  if (user.source === 'legacy') {
    await deleteDoc(appDoc(db, 'legacyUsers', user.id));
    return;
  }

  if (user.source === 'assistantAccount') {
    await deleteDoc(appDoc(db, 'legacyUsers', `assistant-${user.id}`));
    return;
  }

  await deleteDoc(appDoc(db, 'users', user.id));
}

export async function upsertLegacyUserProfile(userId, data) {
  if (!db || !userId) throw new Error('Falta el usuario.');
  await setDoc(appDoc(db, 'users', userId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}
