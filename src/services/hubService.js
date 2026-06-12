// Conexión de solo lectura con Admin Hub (proyecto Firebase "musicala-admin-hub").
// El Hub guarda la jornada esperada de cada miembro en `adminMemberSettings`
// (horario semanal con claves monday..sunday) y excepciones por fecha en
// `adminScheduleOverrides` (id `${email}__${YYYY-MM-DD}`). Las reglas del Hub
// solo permiten leer todo a sus admins, por eso se pide un login Google aparte.
import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut
} from 'firebase/auth';
import { collection, getDocs, getFirestore, onSnapshot, query, where } from 'firebase/firestore';
import { normalizeKey } from '../utils/normalize';

const HUB_CONFIG = {
  apiKey: 'AIzaSyCsXw0N_GkdwYMkdfZ_H2XIBNeTpGFn_rg',
  authDomain: 'musicala-admin-hub.firebaseapp.com',
  projectId: 'musicala-admin-hub',
  storageBucket: 'musicala-admin-hub.firebasestorage.app',
  messagingSenderId: '468927778540',
  appId: '1:468927778540:web:619daeb67ff0287d92dfc9'
};

const HUB_APP_NAME = 'admin-hub';

const WEEKDAY_KEY_BY_DAY = {
  'Lunes': 'monday',
  'Martes': 'tuesday',
  'Miércoles': 'wednesday',
  'Jueves': 'thursday',
  'Viernes': 'friday',
  'Sábado': 'saturday',
  'Domingo': 'sunday'
};

function hubApp() {
  return getApps().find(app => app.name === HUB_APP_NAME) || initializeApp(HUB_CONFIG, HUB_APP_NAME);
}

function hubAuth() {
  return getAuth(hubApp());
}

function hubDb() {
  return getFirestore(hubApp());
}

export function listenHubUser(callback) {
  return onAuthStateChanged(hubAuth(), user => callback(user?.email?.toLowerCase() || ''));
}

export async function connectHub() {
  const auth = hubAuth();
  await setPersistence(auth, browserLocalPersistence);
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user?.email?.toLowerCase() || '';
}

export async function disconnectHub() {
  await signOut(hubAuth());
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Fecha (YYYY-MM-DD) de cada día de la semana en curso (semana lunes-domingo que contiene hoy).
export function currentWeekDates(today = new Date()) {
  const dayIdx = (today.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(today);
  monday.setDate(today.getDate() - dayIdx);
  const out = {};
  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  names.forEach((name, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    out[name] = formatLocalDate(date);
  });
  return out;
}

export async function fetchHubSchedules() {
  const db = hubDb();
  const membersSnap = await getDocs(collection(db, 'adminMemberSettings'));
  const members = membersSnap.docs
    .map(docSnap => docSnap.data())
    .filter(member => member?.email)
    .map(member => ({
      email: String(member.email).toLowerCase().trim(),
      name: member.name || '',
      active: member.active !== false,
      weeklySchedule: member.weeklySchedule || {}
    }));

  const weekDates = currentWeekDates();
  const overrides = {};
  try {
    const overridesSnap = await getDocs(query(
      collection(db, 'adminScheduleOverrides'),
      where('date', 'in', Object.values(weekDates))
    ));
    overridesSnap.forEach(docSnap => {
      const data = docSnap.data();
      const email = String(data?.email || '').toLowerCase().trim();
      if (email && data?.date) overrides[`${email}__${data.date}`] = data;
    });
  } catch (error) {
    // Sin permiso o sin índice: seguimos solo con el horario semanal.
    console.warn('No se pudieron leer excepciones del Hub', error);
  }

  return { members, overrides, weekDates };
}

export function listenHubSchedules(callback, onError) {
  const db = hubDb();
  const weekDates = currentWeekDates();
  const state = { members: null, overrides: null };

  const emit = () => {
    if (!state.members || !state.overrides) return;
    callback({
      members: state.members,
      overrides: state.overrides,
      weekDates
    });
  };

  const unsubMembers = onSnapshot(collection(db, 'adminMemberSettings'), snap => {
    state.members = snap.docs
      .map(docSnap => docSnap.data())
      .filter(member => member?.email)
      .map(member => ({
        email: String(member.email).toLowerCase().trim(),
        name: member.name || '',
        active: member.active !== false,
        weeklySchedule: member.weeklySchedule || {}
      }));
    emit();
  }, error => {
    if (onError) onError(error);
  });

  const unsubOverrides = onSnapshot(query(
    collection(db, 'adminScheduleOverrides'),
    where('date', 'in', Object.values(weekDates))
  ), snap => {
    const overrides = {};
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const email = String(data?.email || '').toLowerCase().trim();
      if (email && data?.date) overrides[`${email}__${data.date}`] = { id: docSnap.id, ...data };
    });
    state.overrides = overrides;
    emit();
  }, error => {
    if (onError) onError(error);
  });

  return () => {
    unsubMembers();
    unsubOverrides();
  };
}

// Jornada esperada de un miembro del Hub para un día de la semana actual.
// Prioridad (igual que el Hub): excepción por fecha -> horario semanal -> null.
export function hubScheduleForDay(member, dayName, overrides, weekDates) {
  if (!member || member.active === false) return null;
  const date = weekDates?.[dayName];
  const override = date ? overrides?.[`${member.email}__${date}`] : null;
  if (override) {
    if (override.enabled === false) return null;
    return {
      start: override.start || override.startTime,
      end: override.end || override.endTime,
      source: 'excepción',
      reason: override.reason || ''
    };
  }
  const day = member.weeklySchedule?.[WEEKDAY_KEY_BY_DAY[dayName]];
  if (!day || !day.enabled) return null;
  return { start: day.start, end: day.end, source: 'semanal', notes: day.notes || '' };
}

// Empareja una asistente del Manager con un miembro del Hub (email primero, luego nombre).
export function matchHubMember(assistant, members) {
  const emailKey = normalizeKey(assistant.email);
  const nameKey = normalizeKey(assistant.name);
  return members.find(member => emailKey && normalizeKey(member.email) === emailKey)
    || members.find(member => nameKey && normalizeKey(member.name) === nameKey)
    || null;
}
