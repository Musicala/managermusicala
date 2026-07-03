import { buildAssistantIdentityKeys, normalizeDay, normalizeText, scheduleItemMatchesAssistant } from './normalize';
import { getTodayName, minutesToTime, nowMinutes, sortSchedule, timeToMinutes } from './time';

export const ACTIVE_BREAK_DURATION_MINUTES = 10;
export const MIN_MINUTES_BEFORE_LUNCH = 45;
export const MIN_MINUTES_AFTER_LUNCH = 30;
export const MIN_MINUTES_BEFORE_END_OF_DAY = 60;
export const MIN_MINUTES_AFTER_START_OF_DAY = 60;
export const MAX_ACTIVE_BREAKS_PER_DAY = 2;
// Bloques con esta duración o menos no se parten con una pausa.
export const MIN_SPLIT_BLOCK_MINUTES = 30;
// Distancia máxima para mover una pausa hacia un cambio de bloque cercano.
export const SNAP_WINDOW_MINUTES = 45;

export const BREAKS_CONFIG = {
  continuityToleranceMinutes: 5,
  lunchWords: ['almuerzo', 'hora de almuerzo', 'descanso almuerzo', 'lunch', 'break lunch']
};

// Combina los valores configurados en el panel admin con los valores por defecto.
export function resolveBreakRules(config = {}) {
  const pick = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback);
  return {
    breakDuration: pick(config.activeBreakDurationMinutes, ACTIVE_BREAK_DURATION_MINUTES),
    minBeforeLunch: pick(config.minMinutesBeforeLunch, MIN_MINUTES_BEFORE_LUNCH),
    minAfterLunch: pick(config.minMinutesAfterLunch, MIN_MINUTES_AFTER_LUNCH),
    minBeforeEndOfDay: pick(config.minMinutesBeforeEndOfDay, MIN_MINUTES_BEFORE_END_OF_DAY),
    minAfterStartOfDay: pick(config.minMinutesAfterStartOfDay, MIN_MINUTES_AFTER_START_OF_DAY),
    maxBreaksPerDay: pick(config.maxActiveBreaksPerDay, MAX_ACTIVE_BREAKS_PER_DAY),
    minSplitBlock: pick(config.minSplitBlockMinutes, MIN_SPLIT_BLOCK_MINUTES),
    snapWindow: pick(config.snapWindowMinutes, SNAP_WINDOW_MINUTES)
  };
}

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

// Devuelve hasta MAX_ACTIVE_BREAKS_PER_DAY minutos de inicio de pausa, ya validados
// contra almuerzo, cierre de jornada, bloques cortos y transiciones de bloque.
export function generateSmartActiveBreaks(scheduleBlocks, workdayStart, workdayEnd, lunchBlock, rules = resolveBreakRules()) {
  if (!scheduleBlocks?.length || !Number.isFinite(workdayStart) || !Number.isFinite(workdayEnd)) return [];

  const transitions = collectTransitions(scheduleBlocks);
  const latestByDayEnd = workdayEnd - rules.minBeforeEndOfDay;

  // Ventanas recomendadas: una en la mañana (antes del almuerzo) y una en la tarde.
  const windows = [];
  if (lunchBlock && Number.isFinite(lunchBlock.start) && Number.isFinite(lunchBlock.end)) {
    windows.push({
      from: workdayStart + rules.minAfterStartOfDay,
      to: Math.min(lunchBlock.start - rules.minBeforeLunch, latestByDayEnd)
    });
    windows.push({
      from: lunchBlock.end + rules.minAfterLunch,
      to: latestByDayEnd
    });
  } else {
    // Sin almuerzo registrado: repartir la jornada en dos ventanas si alcanza.
    const from = workdayStart + rules.minAfterStartOfDay;
    const to = latestByDayEnd;
    if (to - from >= 150) {
      const third = Math.round((to - from) / 3);
      windows.push({ from, to: from + third + 30, ideal: from + third });
      windows.push({ from: to - third - 30, to, ideal: to - third });
    } else {
      windows.push({ from, to });
    }
  }

  const breaks = [];
  windows.forEach(window => {
    if (breaks.length >= rules.maxBreaksPerDay) return;
    const minute = placeBreakInWindow(window, scheduleBlocks, transitions, rules);
    if (minute !== null && !breaks.includes(minute)) breaks.push(minute);
  });

  return breaks.sort((a, b) => a - b).slice(0, rules.maxBreaksPerDay);
}

function collectTransitions(blocks) {
  const set = new Set();
  blocks.forEach(block => {
    (block.tasks || []).forEach(task => {
      set.add(task.startMinutes);
      set.add(task.endMinutes);
    });
    set.add(block.start);
    set.add(block.end);
  });
  return [...set].sort((a, b) => a - b);
}

function placeBreakInWindow(window, blocks, transitions, rules) {
  const { from, to } = window;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;

  const ideal = clamp(window.ideal ?? Math.round((from + to) / 2), from, to);

  // Preferir un cambio de bloque cercano al punto ideal.
  const snapped = transitions
    .filter(minute => minute >= from && minute <= to && Math.abs(minute - ideal) <= rules.snapWindow)
    .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];

  const candidates = snapped !== undefined ? [snapped, ideal] : [ideal];

  for (const candidate of candidates) {
    if (isValidBreakMinute(candidate, from, to, blocks, rules)) return candidate;
  }

  // El ideal cae mal ubicado: probar cualquier transición dentro de la ventana, la más cercana primero.
  const fallback = transitions
    .filter(minute => minute >= from && minute <= to)
    .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))
    .find(minute => isValidBreakMinute(minute, from, to, blocks, rules));

  return fallback ?? null;
}

function isValidBreakMinute(minute, from, to, blocks, rules) {
  if (minute < from || minute > to) return false;
  const block = blocks.find(item => minute >= item.start && minute <= item.end);
  if (!block) return false;
  // No partir tareas cortas: si el minuto cae dentro (no en el borde) de una tarea corta, es inválido.
  const brokenShortTask = (block.tasks || []).some(task =>
    minute > task.startMinutes && minute < task.endMinutes &&
    task.endMinutes - task.startMinutes <= rules.minSplitBlock
  );
  return !brokenShortTask;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function calculateBreaks(scheduleItems, assistantIdentity, day = getTodayName(), config = {}) {
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
  if (!blocks.length) return [];

  const allMinutes = dayItems
    .flatMap(item => [Number(item.startMinutes ?? timeToMinutes(item.startTime)), Number(item.endMinutes ?? timeToMinutes(item.endTime))])
    .filter(Number.isFinite);
  const workdayStart = Math.min(...allMinutes);
  const workdayEnd = Math.max(...allMinutes);
  const lunchBlock = lunchRanges.find(range => Number.isFinite(range.start) && Number.isFinite(range.end)) || null;

  const rules = resolveBreakRules(config);
  const breakMinutes = generateSmartActiveBreaks(blocks, workdayStart, workdayEnd, lunchBlock, rules);

  return breakMinutes.map(minute => {
    const time = minutesToTime(minute);
    const blockIndex = blocks.findIndex(block => minute >= block.start && minute <= block.end);
    const block = blocks[blockIndex] || blocks[0];
    return {
      id: `AUTO-${dayNorm}-${target}-${time}`,
      type: 'break',
      day: dayNorm,
      startTime: time,
      endTime: '',
      assistantName,
      task: 'Pausa activa',
      description: `Tómate ${rules.breakDuration} minutos para moverte, respirar y estirarte.`,
      note: `Bloque ${block.startTime} - ${block.endTime} · pausa sugerida de ${rules.breakDuration} min`,
      color: 'verde',
      blockIndex
    };
  });
}

export function getNextBreak(scheduleItems, assistantIdentity, day = getTodayName(), currentMinute = nowMinutes(), config = {}) {
  return calculateBreaks(scheduleItems, assistantIdentity, day, config)
    .filter(item => timeToMinutes(item.startTime) >= currentMinute)
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0] || null;
}
