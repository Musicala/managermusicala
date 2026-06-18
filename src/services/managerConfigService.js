import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { appCollection, appDoc } from '../firebase/dbPaths';
import { BUTTON_SECTION_OPTIONS, normalizeButtonSections } from '../utils/normalize';

export const DEFAULT_MANAGER_SETTINGS = {
  notificationsEnabled: true,
  soundEnabled: true,
  soundProfile: 'clear',
  notificationRepeatSeconds: 25,
  taskStartMinutesBefore: 5,
  taskChangeMinutesBefore: 3,
  breakIntervalMinutes: 135,
  breakDurationMinutes: 5,
  activeScenario: 'normal',
  scenarios: [
    { id: 'normal', name: 'Horario normal' },
    { id: 'redistribuido', name: 'Horario redistribuido' },
    { id: 'vacacional', name: 'Horario vacacional' }
  ],
  buttonSections: BUTTON_SECTION_OPTIONS,
  notificationMessages: [
    {
      id: 'task-start',
      type: 'taskStart',
      title: 'Proxima tarea',
      body: '{hora} - {tarea}',
      active: true
    },
    {
      id: 'task-change',
      type: 'taskChange',
      title: 'Cambio de tarea',
      body: 'En {minutos} min cambia a: {tarea}',
      active: true
    },
    {
      id: 'active-break',
      type: 'break',
      title: 'Pausa activa',
      body: '{hora} - {tarea}',
      active: true
    },
    {
      id: 'day-start',
      type: 'dayStart',
      title: 'Inicio de jornada',
      body: 'Buenos dias. Tu jornada inicia a las {hora} con: {tarea}',
      active: true
    },
    {
      id: 'lunch',
      type: 'lunch',
      title: 'Almuerzo',
      body: 'Es hora de almorzar: {hora}',
      active: true
    },
    {
      id: 'day-end',
      type: 'dayEnd',
      title: 'Final de jornada',
      body: 'Jornada finalizada. Buen descanso.',
      active: true
    }
  ]
};

export function mergeDefaultNotificationMessages(messages = []) {
  const savedMessages = Array.isArray(messages) ? messages : [];
  const savedTypes = new Set(savedMessages.map(item => item?.type).filter(Boolean));
  const missingDefaults = DEFAULT_MANAGER_SETTINGS.notificationMessages
    .filter(item => !savedTypes.has(item.type));
  return [...savedMessages, ...missingDefaults];
}

export function listenManagerSettings(callback) {
  if (!db) return () => {};
  return onSnapshot(appDoc(db, 'managerSettings', 'general'), snap => {
    const data = snap.exists() ? snap.data() : {};
    callback({
      ...DEFAULT_MANAGER_SETTINGS,
      ...data,
      buttonSections: normalizeButtonSections(data.buttonSections),
      notificationMessages: mergeDefaultNotificationMessages(data.notificationMessages)
    });
  });
}

export async function saveManagerSettings(settings) {
  if (!db) throw new Error('Firebase no esta disponible.');
  await setDoc(appDoc(db, 'managerSettings', 'general'), {
    ...settings,
    buttonSections: normalizeButtonSections(settings.buttonSections),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function listenTaskTemplates(callback) {
  if (!db) return () => {};
  return onSnapshot(appCollection(db, 'taskTemplates'), snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' }));
    callback(rows);
  });
}

export async function saveTaskTemplate(template) {
  if (!db) throw new Error('Firebase no esta disponible.');
  const id = template.id || String(template.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `tarea-${Date.now()}`;
  await setDoc(appDoc(db, 'taskTemplates', id), {
    name: String(template.name || '').trim(),
    category: String(template.category || 'General').trim(),
    description: String(template.description || '').trim(),
    frequency: String(template.frequency || 'Diario').trim(),
    durationMinutes: Number(template.durationMinutes || 30),
    priority: String(template.priority || 'Media').trim(),
    repeatable: template.repeatable === true,
    suggestedOwner: String(template.suggestedOwner || '').trim(),
    placementRule: ['inicio', 'fin'].includes(template.placementRule) ? template.placementRule : '',
    placementMinutes: Number(template.placementMinutes) || 30,
    active: template.active !== false,
    updatedAt: serverTimestamp(),
    createdAt: template.createdAt || serverTimestamp()
  }, { merge: true });
  return id;
}

export async function deleteTaskTemplate(templateId) {
  if (!db || !templateId) throw new Error('Falta la tarea.');
  await deleteDoc(appDoc(db, 'taskTemplates', templateId));
}
