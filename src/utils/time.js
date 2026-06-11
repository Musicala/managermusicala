import { DAYS, normalizeDay, normalizeText } from './normalize';

export const TIMELINE_START = 7;
export const TIMELINE_END = 21;
export const SLOT_HEIGHT = 42;

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function normalizeTime(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return '';

  const ampm = text.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (ampm) {
    let hh = Number(ampm[1]);
    const mm = Number(ampm[2] || 0);
    const suffix = ampm[3].replace(/\./g, '');
    if (suffix === 'pm' && hh < 12) hh += 12;
    if (suffix === 'am' && hh === 12) hh = 0;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  const plain = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!plain) return '';
  const hh = Number(plain[1]);
  const mm = Number(plain[2] || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${pad2(hh)}:${pad2(mm)}`;
}

export function timeToMinutes(time) {
  const normalized = normalizeTime(time);
  const match = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '';
  return `${pad2(Math.floor(value / 60))}:${pad2(value % 60)}`;
}

export function sortSchedule(a, b) {
  const dayA = DAYS.indexOf(normalizeDay(a.day));
  const dayB = DAYS.indexOf(normalizeDay(b.day));
  if (dayA !== dayB) return (dayA === -1 ? 999 : dayA) - (dayB === -1 ? 999 : dayB);
  return Number(a.startMinutes ?? timeToMinutes(a.startTime)) - Number(b.startMinutes ?? timeToMinutes(b.startTime));
}

export function getTodayName(date = new Date()) {
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][date.getDay()];
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function durationLabel(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return '0 min';
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

export function blockStyle(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const top = ((start - TIMELINE_START * 60) / 30) * SLOT_HEIGHT;
  const height = Math.max(((end - start) / 30) * SLOT_HEIGHT, 46);
  return {
    top: `${Math.max(top, 0)}px`,
    height: `${height}px`
  };
}
