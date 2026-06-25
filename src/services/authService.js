import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { auth, db, firebaseReady } from '../firebase/firebase';
import { bootstrapAdminEmail } from '../firebase/config';
import { appDoc } from '../firebase/dbPaths';
import { getAssistantInvite } from './assistantAccountsService';
import { normalizeArea, normalizeText, ROLES } from '../utils/normalize';

export const OFFICIAL_ADMIN_EMAILS = [
  'alekcaballeromusic@gmail.com',
  'catalina.medina.leal@gmail.com'
];

export function listenAuth(callback) {
  if (!firebaseReady || !auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  if (!firebaseReady) throw new Error('Firebase no está configurado. Revisa el archivo .env.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function logout() {
  if (!auth) return;
  await signOut(auth);
}

export async function getUserProfile(uid) {
  if (!db || !uid) return null;
  const snap = await getDoc(appDoc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function ensureCurrentUserProfile(user) {
  if (!db || !user) return null;
  const ref = appDoc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const email = normalizeText(user.email).toLowerCase();
  const isOfficialAdmin = OFFICIAL_ADMIN_EMAILS.includes(email) || email === bootstrapAdminEmail;

  // Asistentes con correo propio: si su correo esta en el directorio
  // (assistantInvites) y esta activo, entran directo como asistentes.
  let invite = null;
  if (!isOfficialAdmin) {
    try {
      invite = await getAssistantInvite(email);
    } catch (error) {
      if (error?.code !== 'permission-denied') throw error;
    }
  }
  const isInvitedAssistant = Boolean(invite && invite.active !== false);

  if (snap.exists()) {
    const data = snap.data();
    const changes = { lastLoginAt: serverTimestamp() };

    if (isOfficialAdmin) {
      Object.assign(changes, { role: ROLES.ADMIN, active: true, pending: false, buttonAccess: ['*'] });
    } else if (isInvitedAssistant) {
      changes.role = ROLES.ASISTENTE;
      changes.active = true;
      changes.pending = false;
      changes.area = normalizeArea(invite.area);
      changes.displayName = normalizeText(invite.displayName) || data.displayName || email;
      changes.lunchStart = invite.lunchStart || '';
      changes.lunchMinutes = Number(invite.lunchMinutes) || 60;
      // Los permisos de botones se siembran desde la invitacion solo si el
      // perfil aun no tiene ninguno; luego se editan desde Usuarios.
      if (!Array.isArray(data.buttonAccess) || data.buttonAccess.length === 0) {
        changes.buttonAccess = Array.isArray(invite.buttonAccess) ? invite.buttonAccess : [];
      }
    }

    await updateDoc(ref, changes);
    return { id: snap.id, ...data, ...changes };
  }

  const profile = {
    uid: user.uid,
    email,
    displayName: isInvitedAssistant
      ? (normalizeText(invite.displayName) || email)
      : (normalizeText(user.displayName) || email),
    role: isOfficialAdmin ? ROLES.ADMIN : isInvitedAssistant ? ROLES.ASISTENTE : ROLES.DOCENTE,
    active: isOfficialAdmin || isInvitedAssistant,
    pending: !(isOfficialAdmin || isInvitedAssistant),
    buttonAccess: isOfficialAdmin ? ['*'] : isInvitedAssistant && Array.isArray(invite.buttonAccess) ? invite.buttonAccess : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  if (isInvitedAssistant) {
    profile.area = normalizeArea(invite.area);
    profile.lunchStart = invite.lunchStart || '';
    profile.lunchMinutes = Number(invite.lunchMinutes) || 60;
  }

  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}
