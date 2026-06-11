import { useEffect, useMemo, useState } from 'react';
import { Bell, Coffee, Timer } from 'lucide-react';
import { calculateBreaks, getNextBreak, isLunchItem } from '../utils/breaks';
import { getTodayName, nowMinutes, timeToMinutes, durationLabel } from '../utils/time';
import { scheduleItemMatchesAssistant } from '../utils/normalize';

export default function ScheduleWidget({ schedule, user, settings = {} }) {
  const [tick, setTick] = useState(Date.now());
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
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

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
    new Notification(message.title, {
      body: message.body,
      icon: '/logo.png'
    });
    if (settings.soundEnabled) playSoftPing();
  }, [data, settings, user?.role]);

  if (user?.role === 'admin') {
    return (
      <section className="widget-grid admin-note">
        <div className="widget-card compact">
          <Timer size={22} />
          <div>
            <strong>Modo administrador</strong>
            <span>Gestiona horarios, usuarios, importacion y herramientas.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
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

function playSoftPing() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 740;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // El sonido es opcional.
  }
}
