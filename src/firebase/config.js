export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firestoreAppRoot = String(
  import.meta.env.VITE_FIRESTORE_APP_ROOT || 'apps/manager-musicala'
).trim();

export const bootstrapAdminEmail = String(
  import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL || 'alekcaballeromusic@gmail.com'
).trim().toLowerCase();

export function hasFirebaseEnv() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}
