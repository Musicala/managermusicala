import { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { DAYS, scheduleItemMatchesAssistant } from '../utils/normalize';
import { blockStyle, getTodayName, minutesToTime, nowMinutes, TIMELINE_END, TIMELINE_START, SLOT_HEIGHT, sortSchedule, timeToMinutes } from '../utils/time';
import { calculateBreaks } from '../utils/breaks';

export default function AssistantSchedule({ schedule, user, settings }) {
  const [day, setDay] = useState(DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] || 'Lunes');

  const items = useMemo(() => {
    const own = schedule
      .filter(item => item.active !== false)
      .filter(item => item.day === day)
      .filter(item => scheduleItemMatchesAssistant(item, user))
      .sort(sortSchedule);
    const breaks = calculateBreaks(schedule, user, day, settings);
    return [...own, ...breaks].sort(sortSchedule);
  }, [schedule, user, day, settings]);

  return (
    <section className="module-card">
      <div className="module-header">
        <div>
          <p className="eyebrow">Semana</p>
          <h2>Horario personal</h2>
        </div>
      </div>

      <DayTabs active={day} onChange={setDay} />
      <Timeline day={day} items={items} emptyTitle="No tienes tareas este día" />
    </section>
  );
}

export function DayTabs({ active, onChange }) {
  return (
    <div className="day-tabs">
      {DAYS.slice(0, 6).map(day => (
        <button key={day} className={active === day ? 'active' : ''} onClick={() => onChange(day)}>
          {day}
        </button>
      ))}
    </div>
  );
}

export function Timeline({ day, items, emptyTitle = 'Sin tareas' }) {
  const hours = [];
  for (let h = TIMELINE_START; h <= TIMELINE_END; h += 1) hours.push(h);

  return (
    <div className="timeline-wrap single">
      <div className="time-axis" style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
        {hours.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
      </div>

      <div className="timeline-column" style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
        {hours.map(hour => <div key={hour} className="hour-line" style={{ top: `${(hour - TIMELINE_START) * SLOT_HEIGHT * 2}px` }} />)}
        <CurrentTimeLine day={day} items={items} />
        {items.map(item => <TimelineCard key={item.id} item={item} />)}
        {!items.length && (
          <div className="timeline-empty">
            <CalendarClock size={34} />
            <strong>{emptyTitle}</strong>
            <span>Un hueco libre. La civilización aún tiene esperanza.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function CurrentTimeLine({ day, items = [] }) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const date = new Date(tick);
  const currentMinute = nowMinutes(date);
  const visibleStart = TIMELINE_START * 60;
  const visibleEnd = (TIMELINE_END + 1) * 60;
  if (day !== getTodayName(date) || currentMinute < visibleStart || currentMinute > visibleEnd) return null;

  const activeItem = items.find(item => {
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime || item.startTime);
    return Number.isFinite(start) && Number.isFinite(end) && start <= currentMinute && end > currentMinute;
  });
  const top = ((currentMinute - visibleStart) / 30) * SLOT_HEIGHT;
  const label = activeItem?.task
    ? `Ahora ${minutesToTime(currentMinute)} · ${activeItem.task}`
    : `Ahora ${minutesToTime(currentMinute)}`;

  return (
    <div className="current-time-line" style={{ top: `${top}px` }} aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

export function TimelineCard({ item, onClick }) {
  const isBreak = item.type === 'break';
  const style = blockStyle(item.startTime, item.endTime || item.startTime);
  const minutes = item.endTime ? timeToMinutes(item.endTime) - timeToMinutes(item.startTime) : 15;
  const cardStyle = isBreak
    ? { ...style, height: '34px', minHeight: '34px' }
    : { ...style, minHeight: style.height };

  return (
    <button
      className={`timeline-card color-${item.color || (isBreak ? 'verde' : 'azul')} ${isBreak ? 'break-card' : ''}`}
      style={cardStyle}
      onClick={onClick}
      type="button"
    >
      <strong>{isBreak ? `${item.task} · ${item.startTime}` : item.task}</strong>
      {!isBreak && <span>{item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}</span>}
      {!isBreak && item.description && <small>{item.description}</small>}
      {minutes > 0 && !isBreak && <em>{minutes} min</em>}
    </button>
  );
}
