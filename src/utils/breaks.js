import { buildAssistantIdentityKeys, normalizeDay, normalizeText, scheduleItemMatchesAssistant } from './normalize';
import { getTodayName, minutesToTime, nowMinutes, sortSchedule, timeToMinutes } from './time';

export const BREAKS_CONFIG = {
  intervalMinutes: 135,
  continuityToleranceMinutes: 5,
  lunchWords: ['almuerzo', 'hora de almuerzo', 'descanso almuerzo', 'lunch', 'break lunch']
};

export function isLunchItem(item) {
  const text = [item?.task, item?.description, item?.note]
    .map(normalizeText)
    .join(' ')
    .toLowerCase();
  return BREAKS_CONFIG.lunchWords.some(word => text.includes(word));
}

export function buildWorkBlocks(items) {
  const valid = (items || [])
    .filter(item => item?.startTime && item?.endTime && !isLunchItem(item))
    .map(item => ({
      ...item,
      startMinutes: Number(item.startMinutes ?? timeToMinutes(item.startTime)),
      endMinutes: Number(item.endMinutes ?? timeToMinutes(item.endTime))
    }))
    .filter(item => Number.isFinite(item.startMinutes) && Number.isFinite(item.endMinutes) && item.endMinutes > item.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);

  if (!valid.length) return [];

  const blocks = [];
  let current = {
    start: valid[0].startMinutes,
    end: valid[0].endMinutes,
    tasks: [valid[0]]
  };

  for (let i = 1; i < valid.length; i += 1) {
    const item = valid[i];
    const gap = item.startMinutes - current.end;
    if (gap <= BREAKS_CONFIG.continuityToleranceMinutes) {
      current.end = Math.max(current.end, item.endMinutes);
      current.tasks.push(item);
    } else {
      blocks.push(finalizeBlock(current));
      current = { start: item.startMinutes, end: item.endMinutes, tasks: [item] };
    }
  }

  blocks.push(finalizeBlock(current));
  return blocks;
}

function finalizeBlock(block) {
  return {
    start: block.start,
    end: block.end,
    startTime: minutesToTime(block.start),
    endTime: minutesToTime(block.end),
    durationMinutes: block.end - block.start,
    tasks: block.tasks
  };
}

export function calculateBreaks(scheduleItems, assistantIdentity, day = getTodayName(), config = {}) {
  const intervalMinutes = Number(config.breakIntervalMinutes || BREAKS_CONFIG.intervalMinutes);
  const identityKeys = buildAssistantIdentityKeys(assistantIdentity);
  const target = identityKeys[0] || 'asistente';
  const assistantName = typeof assistantIdentity === 'string'
    ? assistantIdentity
    : assistantIdentity?.displayName || assistantIdentity?.assistantName || assistantIdentity?.username || assistantIdentity?.email || 'Asistente';
  const dayNorm = normalizeDay(day);
  const dayItems = (scheduleItems || [])
    .filter(item => item.active !== false)
    .filter(item => normalizeDay(item.day) === dayNorm)
    .filter(item => scheduleItemMatchesAssistant(item, assistantIdentity))
    .sort(sortSchedule);

  const lunchRanges = dayItems
    .filter(isLunchItem)
    .map(item => ({
      start: Number(item.startMinutes ?? timeToMinutes(item.startTime)),
      end: Number(item.endMinutes ?? timeToMinutes(item.endTime))
    }));

  const blocks = buildWorkBlocks(dayItems);
  const breaks = [];

  blocks.forEach((block, blockIndex) => {
    let breakMinute = block.start + intervalMinutes;
    let count = 1;
    while (breakMinute <= block.end) {
      const insideLunch = lunchRanges.some(range => breakMinute >= range.start && breakMinute < range.end);
      if (!insideLunch) {
        const time = minutesToTime(breakMinute);
        breaks.push({
          id: `AUTO-${dayNorm}-${target}-${time}`,
          type: 'break',
          day: dayNorm,
          startTime: time,
          endTime: '',
          assistantName,
          task: 'Pausa activa',
          description: 'Llevas más de 2 horas continuas de trabajo. Tómate unos minutos para moverte, respirar y estirarte.',
          note: `Bloque ${block.startTime} - ${block.endTime} · ${count * BREAKS_CONFIG.intervalMinutes} min continuos`,
          color: 'verde',
          blockIndex
        });
      }
      breakMinute += intervalMinutes;
      count += 1;
    }
  });

  return breaks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
}

export function getNextBreak(scheduleItems, assistantIdentity, day = getTodayName(), currentMinute = nowMinutes(), config = {}) {
  return calculateBreaks(scheduleItems, assistantIdentity, day, config)
    .filter(item => timeToMinutes(item.startTime) >= currentMinute)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0] || null;
}
