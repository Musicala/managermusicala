import { useEffect, useMemo, useState } from 'react';
import { Bell, Coffee, Timer } from 'lucide-react';
import { calculateBreaks, getNextBreak, isLunchItem } from '../utils/breaks';
import { getTodayName, nowMinutes, timeToMinutes, durationLabel } from '../utils/time';
import { scheduleItemMatchesAssistant } from '../utils/normalize';
import { assetUrl } from '../utils/assets';

export default function ScheduleWidget({ schedule, user, settings = {} }) {
  const [tick, setTick] = useState(Date.now());
  const [inAppNotifications, setInAppNotifications] = useState(() => readStoredNotifications(user));
  const [notificationPermission, setNotificationPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function requestNotificationPermission() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  useEffect(() => {
    setInAppNotifications(readStoredNotifications(user));
  }, [user?.id, user?.uid, user?.email]);

  const data = useMemo(() => {
    const day = getTodayName(new Date(tick));
    const currentMinute = nowMinutes(new Date(tick));
    const today = schedule
      .filter(item => item.active !== false)
      .filter(item => item.day === day)
      .filter(item => {
        if (user?.role === 'admin') return false;
        return scheduleItemMatchesAssistant(item, user);
      });

    const current = today.find(item => timeToMinutes(item.startTime) <= currentMinute && timeToMinutes(item.endTime) > currentMinute);
    const nextTask = today
      .filter(item => timeToMinutes(item.startTime) > currentMinute)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0];
    const sortedToday = [...today].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const firstTask = sortedToday[0] || null;
    const lunch = sortedToday.find(isLunchItem) || null;
    const lastTask = [...sortedToday].sort((a, b) => timeToMinutes(b.endTime) - timeToMinutes(a.endTime))[0] || null;
    const nextBreak = getNextBreak(schedule, user, day, currentMinute, settings);
    const breaks = calculateBreaks(schedule, user, day, settings);

    return { day, currentMinute, current, nextTask, firstTask, lunch, lastTask, nextBreak, breaks };
  }, [schedule, user, tick, settings]);

  useEffect(() => {
    if (user?.role === 'admin' || !settings.notificationsEnabled) return;

    const startLead = Number(settings.taskStartMinutesBefore || 5);
    const changeLead = Number(settings.taskChangeMinutesBefore || 3);
    const nextTaskMinute = data.nextTask ? timeToMinutes(data.nextTask.startTime) : null;
    const currentEndMinute = data.current ? timeToMinutes(data.current.endTime) : null;
    const dayStartMinute = data.firstTask ? timeToMinutes(data.firstTask.startTime) : null;
    const lunchMinute = data.lunch ? timeToMinutes(data.lunch.startTime) : null;
    const dayEndMinute = data.lastTask ? timeToMinutes(data.lastTask.endTime) : null;
    const notifyDayStart = data.firstTask && dayStartMinute === data.currentMinute;
    const notifyLunch = data.lunch && lunchMinute === data.currentMinute;
    const notifyDayEnd = data.lastTask && dayEndMinute === data.currentMinute;
    const notifyTask = data.nextTask && nextTaskMinute - data.currentMinute === startLead;
    const notifyChange = data.current && data.nextTask && currentEndMinute - data.currentMinute === changeLead;
    const notifyBreak = data.nextBreak && timeToMinutes(data.nextBreak.startTime) - data.currentMinute === 0;
    const type = notifyLunch
      ? 'lunch'
      : notifyDayEnd
        ? 'dayEnd'
        : notifyDayStart
          ? 'dayStart'
          : notifyBreak
            ? 'break'
            : notifyChange
              ? 'taskChange'
              : notifyTask
                ? 'taskStart'
                : '';
    const target = notifyLunch
      ? data.lunch
      : notifyDayEnd
        ? { ...data.lastTask, startTime: data.lastTask.endTime, task: data.lastTask.task || 'Jornada' }
        : notifyDayStart
          ? data.firstTask
          : notifyBreak
            ? data.nextBreak
            : notifyChange || notifyTask
              ? data.nextTask
              : null;
    if (!target) return;

    const key = `${type}-${target.id || target.task}-${target.startTime}-${data.day}`;
    if (window.__managerLastNotification === key) return;
    window.__managerLastNotification = key;
    const message = buildNotificationMessage(settings, type, target, data, type === 'taskChange' ? changeLead : startLead);
    deliverNotification({
      key,
      message,
      type,
      target,
      settings,
      user,
      addInAppNotification: notification => {
        setInAppNotifications(current => storeNotifications(user, [notification, ...current]));
      }
    });
  }, [data, settings, user]);

  function dismissNotification(id) {
    setInAppNotifications(current => storeNotifications(user, current.filter(item => item.id !== id)));
  }

  function testNotification() {
    const target = data.nextTask || data.current || data.nextBreak || data.firstTask || { task: 'Prueba de aviso', startTime: '--:--' };
    const type = data.nextBreak && !data.nextTask ? 'break' : 'taskStart';
    const message = buildNotificationMessage(settings, type, target, data, Number(settings.taskStartMinutesBefore || 5));
    deliverNotification({
      key: `test-${Date.now()}`,
      message,
      type,
      target,
      settings,
      user,
      forceSound: true,
      addInAppNotification: notification => {
        setInAppNotifications(current => storeNotifications(user, [notification, ...current]));
      }
    });
  }

  if (user?.role === 'admin') {
    return (
      <>
        <section className="widget-grid admin-note">
          <div className="widget-card compact">
            <Timer size={22} />
            <div>
              <strong>Modo administrador</strong>
              <span>Gestiona horarios, usuarios, importacion y herramientas.</span>
            </div>
          </div>
        </section>
        <NotificationStack notifications={inAppNotifications} onDismiss={dismissNotification} />
      </>
    );
  }

  return (
    <>
      <section className="widget-grid">
        {settings.notificationsEnabled && notificationPermission !== 'granted' && (
          <div className="widget-card compact">
            <Bell size={24} />
            <div>
              <span>Notificaciones</span>
              <strong>{notificationPermission === 'denied' ? 'Permiso bloqueado' : 'Activar avisos'}</strong>
              <small>
                {notificationPermission === 'denied'
                  ? 'Habilitalas desde el navegador para recibir recordatorios.'
                  : 'Acepta el permiso para recibir inicio, almuerzo, pausas y final de jornada.'}
              </small>
            </div>
            {notificationPermission !== 'denied' && (
              <button className="btn ghost small" type="button" onClick={requestNotificationPermission}>
                Activar
              </button>
            )}
          </div>
        )}

        {user?.previewing && (
          <div className="widget-card compact">
            <Bell size={24} />
            <div>
              <span>Vista asistente</span>
              <strong>Probar aviso</strong>
              <small>Reproduce el sonido y deja el mensaje en pantalla.</small>
            </div>
            <button className="btn ghost small" type="button" onClick={testNotification}>
              Probar
            </button>
          </div>
        )}

        <div className="widget-card">
          <Timer size={24} />
          <div>
            <span>Ahora</span>
            <strong>{data.current ? data.current.task : 'Sin tarea activa'}</strong>
            <small>{data.current ? `${data.current.startTime} - ${data.current.endTime}` : data.day}</small>
          </div>
        </div>

        <div className="widget-card">
          <Bell size={24} />
          <div>
            <span>Proxima tarea</span>
            <strong>{data.nextTask ? data.nextTask.task : 'Nada pendiente'}</strong>
            <small>{data.nextTask ? `${data.nextTask.startTime} - falta ${durationLabel(timeToMinutes(data.nextTask.startTime) - data.currentMinute)}` : 'Respira, raro pero posible'}</small>
          </div>
        </div>

        <div className="widget-card">
          <Coffee size={24} />
          <div>
            <span>Pausa activa</span>
            <strong>{data.nextBreak ? data.nextBreak.startTime : 'Sin pausa cercana'}</strong>
            <small>{data.breaks.length ? `${data.breaks.length} calculada(s) hoy` : 'No hay bloque continuo largo'}</small>
          </div>
        </div>
      </section>
      <NotificationStack notifications={inAppNotifications} onDismiss={dismissNotification} />
    </>
  );
}

function buildNotificationMessage(settings, type, target, data, minutes) {
  const defaults = {
    taskStart: { title: 'Proxima tarea', body: '{hora} - {tarea}' },
    taskChange: { title: 'Cambio de tarea', body: 'En {minutos} min cambia a: {tarea}' },
    break: { title: 'Pausa activa', body: '{hora} - {tarea}' },
    dayStart: { title: 'Inicio de jornada', body: 'Buenos dias. Tu jornada inicia a las {hora} con: {tarea}' },
    lunch: { title: 'Almuerzo', body: 'Es hora de almorzar: {hora}' },
    dayEnd: { title: 'Final de jornada', body: 'Jornada finalizada. Buen descanso.' }
  };
  const messages = Array.isArray(settings.notificationMessages) ? settings.notificationMessages : [];
  const candidates = messages.filter(item => item.active !== false && item.type === type);
  const template = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : defaults[type] || defaults.taskStart;
  const replacements = {
    hora: target.startTime || '',
    tarea: target.task || '',
    descripcion: target.description || '',
    dia: data.day || '',
    minutos: String(minutes ?? '')
  };
  const apply = value => String(value || '').replace(/\{(hora|tarea|descripcion|dia|minutos)\}/g, (_, key) => replacements[key] || '');
  return {
    title: apply(template.title || defaults[type]?.title || 'Recordatorio'),
    body: apply(template.body || defaults[type]?.body || '{hora} - {tarea}')
  };
}

function deliverNotification({ key, message, type, target, settings, user, addInAppNotification, forceSound = false }) {
  const notification = {
    id: `${key}-${Date.now()}`,
    key,
    type,
    title: message.title,
    body: message.body,
    task: target?.task || '',
    time: target?.startTime || '',
    createdAt: Date.now()
  };
  addInAppNotification(notification);

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(message.title, {
      body: message.body,
      icon: assetUrl('logo.png')
    });
  }
  const canPlaySound = (settings.soundEnabled || forceSound) && user?.role !== 'admin';
  if (canPlaySound) {
    playNotificationSound(settings.soundProfile, type);
    scheduleFollowUpSound({ notification, message, settings, user, forceSound });
  }
}

function NotificationStack({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div className="notification-stack" aria-live="polite">
      {notifications.map(notification => (
        <article className={`notification-toast type-${notification.type || 'default'}`} key={notification.id}>
          <div>
            <span>{formatNotificationTime(notification.createdAt)}</span>
            <strong>{notification.title}</strong>
            <p>{notification.body}</p>
          </div>
          <button type="button" onClick={() => onDismiss(notification.id)}>
            Entendido
          </button>
        </article>
      ))}
    </div>
  );
}

function readStoredNotifications(user) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(notificationStorageKey(user));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function storeNotifications(user, notifications) {
  const next = notifications.slice(0, 12);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(notificationStorageKey(user), JSON.stringify(next));
    } catch {
      // La pila visual sigue funcionando aunque localStorage no esté disponible.
    }
  }
  return next;
}

function notificationStorageKey(user) {
  return `managerNotifications:${user?.id || user?.uid || user?.email || 'anon'}`;
}

function formatNotificationTime(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function scheduleFollowUpSound({ notification, message, settings, user, forceSound }) {
  const repeatSeconds = Number(settings.notificationRepeatSeconds ?? 25);
  if (forceSound || !repeatSeconds || repeatSeconds < 1) return;
  window.setTimeout(() => {
    const stillVisible = readStoredNotifications(user).some(item => item.id === notification.id);
    if (!stillVisible) return;
    playNotificationSound(settings.soundProfile, 'followUp');
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(message.title, {
        body: message.body,
        icon: assetUrl('logo.png')
      });
    }
  }, repeatSeconds * 1000);
}

function playNotificationSound(profile = 'clear', type = 'taskStart') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const patterns = {
      soft: [
        { at: 0, freq: 720, duration: 0.16, volume: 0.045 },
        { at: 0.26, freq: 920, duration: 0.18, volume: 0.04 }
      ],
      clear: [
        { at: 0, freq: 784, duration: 0.18, volume: 0.07 },
        { at: 0.32, freq: 988, duration: 0.2, volume: 0.075 },
        { at: 0.68, freq: 1175, duration: 0.24, volume: 0.08 }
      ],
      assertive: [
        { at: 0, freq: 660, duration: 0.2, volume: 0.085 },
        { at: 0.28, freq: 880, duration: 0.22, volume: 0.09 },
        { at: 0.58, freq: 1046, duration: 0.24, volume: 0.095 },
        { at: 0.94, freq: 1320, duration: 0.28, volume: 0.1 }
      ]
    };
    const selectedProfile = type === 'taskChange' && profile === 'soft' ? 'clear' : profile;
    const notes = patterns[selectedProfile] || patterns.clear;
    notes.forEach(note => playTone(ctx, note));
    window.setTimeout(() => ctx.close?.(), 1800);
  } catch {
    // El sonido es opcional.
  }
}

function playTone(ctx, note) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.at);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + note.at);
  gain.gain.exponentialRampToValueAtTime(note.volume, ctx.currentTime + note.at + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note.at + note.duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + note.at);
  osc.stop(ctx.currentTime + note.at + note.duration + 0.04);
}
