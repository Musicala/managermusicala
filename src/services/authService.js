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
import { normalizeText, ROLES } from '../utils/normalize';

export const OFFICIAL_ADMIN_EMAILS = [
  'alekcaballeromusic@gmail.com',
  'catalina.medina.leal@gmail.com'
];

export const SHARED_ASSISTANT_EMAIL = 'musicalaasesor@gmail.com';

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
  const isSharedAssistant = email === SHARED_ASSISTANT_EMAIL;

  if (snap.exists()) {
    const changes = {
      lastLoginAt: serverTimestamp(),
      ...(isOfficialAdmin ? { role: ROLES.ADMIN, active: true, pending: false, buttonAccess: ['*'] } : {}),
      ...(isSharedAssistant ? { role: ROLES.ASISTENTE, active: false, pending: true, sharedAssistantLogin: true } : {})
    };
    await updateDoc(ref, changes);
    return { id: snap.id, ...snap.data(), ...changes };
  }

  const profile = {
    uid: user.uid,
    email,
    displayName: normalizeText(user.displayName) || email,
    role: isOfficialAdmin ? ROLES.ADMIN : isSharedAssistant ? ROLES.ASISTENTE : ROLES.DOCENTE,
    active: isOfficialAdmin,
    pending: !isOfficialAdmin,
    sharedAssistantLogin: isSharedAssistant,
    buttonAccess: isOfficialAdmin ? ['*'] : [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  };

  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}
