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
import { emailKey, normalizeArea, normalizeButtonAccess, normalizeRole, normalizeText } from '../utils/normalize';

export function listenUsers(callback) {
  if (!db) return () => {};
  const state = { users: [], invites: [], legacy: [], assistantInvites: [] };

  const emit = () => {
    const merged = new Map();

    // Directorio de asistentes por correo (aun sin cuenta Google creada).
    state.assistantInvites.forEach(invite => {
      const email = normalizeText(invite.email || invite.id).toLowerCase();
      merged.set(`assistantInvite:${email}`, {
        ...invite,
        id: invite.id,
        email,
        source: 'assistantInvite',
        hasAuthProfile: false,
        role: 'asistente',
        area: normalizeArea(invite.area),
        active: invite.active !== false,
        buttonAccess: Array.isArray(invite.buttonAccess) ? invite.buttonAccess : [],
        displayName: invite.displayName || email
      });
    });

    state.invites.forEach(item => merged.set(`invite:${item.id}`, item));
    state.legacy.forEach(item => merged.set(`legacy:${item.id}`, item));

    state.users.forEach(item => {
      const email = normalizeText(item.email).toLowerCase();
      const invite = email ? state.invites.find(row => normalizeText(row.email).toLowerCase() === email) : null;
      if (invite) merged.delete(`invite:${invite.id}`);
      // Si ya existe la cuenta Google, reemplaza la invitacion del directorio
      // pero conserva el almuerzo/area configurados ahi.
      const assistantInvite = email ? state.assistantInvites.find(row => normalizeText(row.email || row.id).toLowerCase() === email) : null;
      if (assistantInvite) merged.delete(`assistantInvite:${email}`);
      merged.set(`user:${item.id}`, {
        ...invite,
        ...item,
        ...(assistantInvite ? {
          area: normalizeArea(item.area || assistantInvite.area),
          lunchStart: item.lunchStart || assistantInvite.lunchStart || '',
          lunchMinutes: Number(item.lunchMinutes) || Number(assistantInvite.lunchMinutes) || 60
        } : {}),
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

  const unsubAssistantInvites = onSnapshot(appCollection(db, 'assistantInvites'), snap => {
    state.assistantInvites = snap.docs.map(d => ({ id: d.id, email: d.id, source: 'assistantInvite', hasAuthProfile: false, ...d.data() }));
    emit();
  });

  return () => {
    unsubUsers();
    unsubInvites();
    unsubLegacy();
    unsubAssistantInvites();
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

  if (changes.source === 'assistantInvite') {
    const id = normalizeText(changes.email || userId).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(changes, 'area')) {
      payload.area = normalizeArea(changes.area);
    }
    await setDoc(appDoc(db, 'assistantInvites', id), payload, { merge: true });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'area')) {
    payload.area = normalizeArea(changes.area);
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

  if (user.source === 'assistantInvite') {
    const id = normalizeText(user.email || user.id).toLowerCase();
    await deleteDoc(appDoc(db, 'assistantInvites', id));
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
