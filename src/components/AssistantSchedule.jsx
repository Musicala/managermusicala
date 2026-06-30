import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { DAYS, scheduleItemMatchesAssistant } from '../utils/normalize';
import { blockStyle, getTodayName, layoutOverlaps, minutesToTime, nowMinutes, TIMELINE_END, TIMELINE_START, SLOT_HEIGHT, sortSchedule, timeToMinutes } from '../utils/time';
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
  const layout = layoutOverlaps(items.filter(item => item.type !== 'break'));

  return (
    <div className="timeline-wrap single">
      <div className="time-axis" style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
        {hours.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
      </div>

      <div className="timeline-column" style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
        {hours.map(hour => <div key={hour} className="hour-line" style={{ top: `${(hour - TIMELINE_START) * SLOT_HEIGHT * 2}px` }} />)}
        <CurrentTimeLine day={day} items={items} />
        {items.map(item => {
          const cardLayout = layout.get(item.id);
          return (
            <TimelineCard
              key={item.id}
              item={item}
              layout={cardLayout}
              conflict={Boolean(cardLayout && cardLayout.lanes > 1)}
            />
          );
        })}
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

export function TimelineCard({ item, onClick, onMove, layout, conflict = false }) {
  const dragRef = useRef(null);
  const dragPreviewRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [dragPreview, setDragPreview] = useState(null);
  const isBreak = item.type === 'break';
  const shownStart = dragPreview?.startTime || item.startTime;
  const shownEnd = dragPreview?.endTime || item.endTime;
  const style = blockStyle(shownStart, shownEnd || shownStart);
  const minutes = item.endTime ? timeToMinutes(item.endTime) - timeToMinutes(item.startTime) : 15;
  let cardStyle = isBreak
    ? { ...style, height: '34px', minHeight: '34px' }
    : { ...style, minHeight: style.height };

  // Si la tarea se cruza con otra(s), se reparte el ancho en columnas para que
  // todas se vean lado a lado en vez de quedar una encima de la otra.
  if (!isBreak && layout && layout.lanes > 1) {
    const gap = 4;
    const width = `calc((100% - 24px - ${gap * (layout.lanes - 1)}px) / ${layout.lanes})`;
    cardStyle = {
      ...cardStyle,
      left: `calc(12px + (${width} + ${gap}px) * ${layout.lane})`,
      right: 'auto',
      width
    };
  }

  function handlePointerDown(event) {
    if (!onMove || isBreak || event.button !== 0) return;
    const start = timeToMinutes(item.startTime);
    const end = timeToMinutes(item.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    dragRef.current = { pointerId: event.pointerId, originY: event.clientY, start, end, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaPixels = event.clientY - drag.originY;
    if (!drag.moved && Math.abs(deltaPixels) < 5) return;
    drag.moved = true;
    const duration = drag.end - drag.start;
    const snappedDelta = Math.round((deltaPixels * 30 / SLOT_HEIGHT) / 15) * 15;
    const minStart = TIMELINE_START * 60;
    const maxStart = (TIMELINE_END + 1) * 60 - duration;
    const nextStart = Math.max(minStart, Math.min(maxStart, drag.start + snappedDelta));
    const preview = {
      startTime: minutesToTime(nextStart),
      endTime: minutesToTime(nextStart + duration)
    };
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  }

  async function finishDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const preview = dragPreviewRef.current;
    if (drag.moved && preview) {
      suppressClickRef.current = true;
      await onMove(item, preview.startTime, preview.endTime);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragPreviewRef.current = null;
    setDragPreview(null);
  }

  return (
    <button
      className={`timeline-card color-${item.color || (isBreak ? 'verde' : 'azul')} ${isBreak ? 'break-card' : ''} ${conflict ? 'conflict' : ''} ${onMove ? 'draggable' : ''} ${dragPreview ? 'dragging' : ''}`}
      style={cardStyle}
      onClick={event => {
        if (suppressClickRef.current) {
          event.preventDefault();
          return;
        }
        onClick?.();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      type="button"
    >
      <strong>{isBreak ? `${item.task} · ${item.startTime}` : item.task}</strong>
      {!isBreak && <span>{shownStart}{shownEnd ? ` - ${shownEnd}` : ''}</span>}
      {!isBreak && item.description && <small>{item.description}</small>}
      {minutes > 0 && !isBreak && <em>{minutes} min</em>}
    </button>
  );
}
