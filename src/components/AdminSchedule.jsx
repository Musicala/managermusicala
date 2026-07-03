import { useEffect, useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, Circle, Clock, Copy, Link2, Plus, Wand2 } from 'lucide-react';
import { createScheduleDateOverride, deleteScheduleDateOverride, deleteScheduleTask, deleteScheduleTasks, duplicateScheduleDay, saveScheduleTask, shiftScheduleTasks, weekDateForDay } from '../services/scheduleService';
import { DEFAULT_MANAGER_SETTINGS, listenTaskTemplates, saveManagerSettings } from '../services/managerConfigService';
import { connectHub, hubScheduleForDay, listenHubSchedules, listenHubUser, matchHubMember } from '../services/hubService';
import { isLunchItem } from '../utils/breaks';
import { DAYS, normalizeKey, scheduleItemMatchesAssistant } from '../utils/normalize';
import { TIMELINE_END, TIMELINE_START, SLOT_HEIGHT, durationLabel, findOverlaps, layoutOverlaps, minutesToTime, sortSchedule, timeToMinutes } from '../utils/time';
import { CurrentTimeLine, DayTabs, TimelineCard } from './AssistantSchedule';
import TaskModal from './TaskModal';

export default function AdminSchedule({ schedule, allSchedule, users, settings }) {
  const [day, setDay] = useState(() => DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1] || 'Lunes');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [error, setError] = useState('');
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateDays, setDuplicateDays] = useState([]);
  const [duplicateScenario, setDuplicateScenario] = useState(settings?.activeScenario || 'normal');
  const [duplicateAssistant, setDuplicateAssistant] = useState('');
  const [duplicateReplace, setDuplicateReplace] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [shiftDays, setShiftDays] = useState([]);
  const [shiftAssistant, setShiftAssistant] = useState('');
  const [shiftPreset, setShiftPreset] = useState('-60');
  const [shiftCustomMinutes, setShiftCustomMinutes] = useState(30);
  const [shiftCustomDirection, setShiftCustomDirection] = useState('antes');
  const [shifting, setShifting] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [clearingSchedule, setClearingSchedule] = useState(false);
  const [autoFillAssistant, setAutoFillAssistant] = useState('');
  const [savingDateMode, setSavingDateMode] = useState(false);
  const [notice, setNotice] = useState('');
  const [hubUser, setHubUser] = useState('');
  const [hubData, setHubData] = useState(null);
  const [hubError, setHubError] = useState('');
  const [hubLoading, setHubLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = listenTaskTemplates(rows => {
      setTaskTemplates(rows.filter(item => item.active !== false));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return listenHubUser(email => setHubUser(email));
  }, []);

  useEffect(() => {
    if (!hubUser) {
      setHubData(null);
      return;
    }
    setHubLoading(true);
    setHubError('');
    const unsubscribe = listenHubSchedules(data => {
      setHubData(data);
      setHubLoading(false);
    }, err => {
        setHubData(null);
        setHubLoading(false);
        setHubError(err?.code === 'permission-denied'
          ? `La cuenta ${hubUser} no es administradora del Admin Hub.`
          : 'No se pudieron leer los horarios del Admin Hub.');
    });
    return unsubscribe;
  }, [hubUser]);

  async function handleConnectHub() {
    setHubError('');
    try {
      await connectHub();
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setHubError('No se pudo conectar con Admin Hub.');
      }
    }
  }

  const assistants = useMemo(() => {
    return users
      .filter(user => user.active !== false)
      .filter(user => user.role === 'asistente')
      .map(user => ({
        name: user.displayName || user.username || user.email,
        email: user.email || '',
        username: user.username || user.legacyUsername || '',
        source: user.source,
        lunchStart: user.lunchStart || '',
        lunchMinutes: Number(user.lunchMinutes) || 60
      }))
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'es'));
  }, [users]);

  const activeScenario = settings?.activeScenario || 'normal';
  const scenarios = settings?.scenarios || DEFAULT_MANAGER_SETTINGS.scenarios;
  const selectedDate = weekDateForDay(day);
  const dateOverrideTasks = (allSchedule || []).filter(item =>
    item.active !== false &&
    item.day === day &&
    item.scheduleDate === selectedDate &&
    normalizeKey(item.scenario || 'normal') === normalizeKey(activeScenario)
  );
  const isDateOverride = dateOverrideTasks.length > 0;

  const hours = [];
  for (let h = TIMELINE_START; h <= TIMELINE_END; h += 1) hours.push(h);

  function assistantKey(assistant) {
    return normalizeKey(assistant?.email || assistant?.name || assistant?.username);
  }

  function assistantAliases(assistant) {
    const email = normalizeKey(assistant?.email);
    return [assistant?.name, assistant?.username, assistant?.email, email.split('@')[0]]
      .map(normalizeKey)
      .filter(Boolean);
  }

  function templateAppliesToAssistant(template, assistant) {
    const owner = normalizeKey(template?.suggestedOwner);
    if (!owner) return true;
    return assistantAliases(assistant).some(alias =>
      alias === owner || alias.includes(owner) || owner.includes(alias)
    );
  }

  function templateAppliesToDay(template, dayName = day) {
    return !Array.isArray(template?.allowedDays) ||
      template.allowedDays.length === 0 ||
      template.allowedDays.includes(dayName);
  }

  // Ventana de almuerzo "fantasma" del asistente: solo si tiene hora configurada
  // y todavía no hay una tarea de almuerzo ese día (si ya existe, se respeta esa).
  function lunchWindowFor(assistant, dayItems) {
    if (dayItems.some(isLunchItem)) return null;
    const start = timeToMinutes(assistant?.lunchStart);
    if (!Number.isFinite(start)) return null;
    return { start, end: start + (Number(assistant?.lunchMinutes) || 60) };
  }

  // Quita la franja del almuerzo de una lista de huecos, partiéndolos si hace falta.
  function clipGapsAroundLunch(gaps, lunch) {
    if (!lunch) return gaps;
    const out = [];
    for (const [s, e] of gaps) {
      if (lunch.end <= s || lunch.start >= e) { out.push([s, e]); continue; }
      if (lunch.start > s) out.push([s, lunch.start]);
      if (lunch.end < e) out.push([lunch.end, e]);
    }
    return out.filter(([s, e]) => e - s >= 5);
  }

  // Cobertura: qué tareas de la bolsa ya están asignadas en el día seleccionado (escenario activo).
  const coverage = useMemo(() => {
    const dayItems = schedule.filter(item => item.active !== false && item.day === day);
    return assistants.flatMap(assistant => taskTemplates
      .filter(template => templateAppliesToAssistant(template, assistant) && templateAppliesToDay(template))
      .map(template => ({
        assistant,
        template,
        matches: dayItems
          .filter(item => normalizeKey(item.task) === normalizeKey(template.name))
          .filter(item => scheduleItemMatchesAssistant(item, assistant))
          .sort(sortSchedule)
      })));
  }, [schedule, taskTemplates, assistants, day]);
  const pendingTemplates = coverage.filter(entry => entry.matches.length === 0);

  function assignFromTemplate(template, assistant = null) {
    const duration = Number(template.durationMinutes || 30);
    const startTime = '09:00';
    setEditing({
      day,
      scenario: settings?.activeScenario || 'normal',
      assistantName: assistant?.name || '',
      assistantEmail: assistant?.email || '',
      task: template.name || '',
      description: template.description || '',
      category: template.category || '',
      startTime,
      endTime: minutesToTime(timeToMinutes(startTime) + duration) || '10:00'
    });
  }

  // Vínculo manual asistente -> correo del Hub (las asistentes entran al Manager
  // con usuario interno, así que el email no coincide y el nombre puede variar).
  const hubLinks = settings?.hubLinks || {};

  function resolveHubMember(assistant) {
    if (!hubData) return null;
    const key = normalizeKey(assistant.email || assistant.name);
    const linkedEmail = hubLinks[key];
    if (linkedEmail === 'none') return null;
    if (linkedEmail) return hubData.members.find(member => member.email === linkedEmail) || null;
    return matchHubMember(assistant, hubData.members);
  }

  // undefined = sin datos del Hub; null = no trabaja ese día; objeto = jornada.
  function getJornadaFor(assistant, dayName) {
    const member = resolveHubMember(assistant);
    if (!member) return undefined;
    return hubScheduleForDay(member, dayName, hubData.overrides, hubData.weekDates);
  }

  const unresolvedAssistants = hubData
    ? assistants.filter(assistant => {
        const key = normalizeKey(assistant.email || assistant.name);
        return !resolveHubMember(assistant) && hubLinks[key] !== 'none';
      })
    : [];

  async function handleLinkChange(assistantKey, value) {
    const nextLinks = { ...hubLinks };
    if (value === 'auto') delete nextLinks[assistantKey];
    else nextLinks[assistantKey] = value;
    try {
      await saveManagerSettings({ ...settings, hubLinks: nextLinks });
    } catch (err) {
      setError(err.message || 'No se pudo guardar el vínculo.');
    }
  }

  // Jornada real (Admin Hub) de cada asistente para el día seleccionado, con conteo de tareas fuera de jornada.
  const hubInfoByAssistant = useMemo(() => {
    if (!hubData) return {};
    const out = {};
    for (const assistant of assistants) {
      const jornada = getJornadaFor(assistant, day);
      if (jornada === undefined) continue;
      let outside = 0;
      const gaps = [];
      let lunch = null;
      if (jornada) {
        const start = timeToMinutes(jornada.start);
        const end = timeToMinutes(jornada.end);
        const items = schedule
          .filter(item => item.active !== false && item.day === day)
          .filter(item => scheduleItemMatchesAssistant(item, assistant));
        lunch = lunchWindowFor(assistant, items);
        outside = items
          .filter(item => timeToMinutes(item.startTime) < start || timeToMinutes(item.endTime) > end)
          .length;

        // Huecos: tramos de la jornada sin ninguna tarea asignada (ignora huecos de menos de 5 min).
        const intervals = items
          .map(item => [timeToMinutes(item.startTime), timeToMinutes(item.endTime)])
          .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e))
          .sort((a, b) => a[0] - b[0]);
        let cursor = start;
        for (const [s, e] of intervals) {
          if (s - cursor >= 5) gaps.push([cursor, Math.min(s, end)]);
          cursor = Math.max(cursor, e);
          if (cursor >= end) break;
        }
        if (end - cursor >= 5) gaps.push([cursor, end]);
      }
      // El almuerzo no cuenta como hueco "sin tareas" ni se rellena automáticamente.
      const clippedGaps = clipGapsAroundLunch(gaps, lunch);
      const gapMinutes = clippedGaps.reduce((sum, [s, e]) => sum + (e - s), 0);
      out[normalizeKey(assistant.email || assistant.name)] = { jornada, outside, gaps: clippedGaps, gapMinutes, lunch };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistants, hubData, schedule, day, settings]);

  // Reglas de ubicación por tarea (p. ej. "cierre comercial" en los últimos 30 min).
  const ruleByTask = useMemo(() => {
    const map = {};
    for (const template of taskTemplates) {
      const rule = template.placementRule;
      if (['inicio', 'fin', 'hora', 'manana', 'tarde'].includes(rule)) {
        map[normalizeKey(template.name)] = {
          rule,
          minutes: Number(template.placementMinutes) || 30,
          fixedTime: template.fixedTime || ''
        };
      }
    }
    return map;
  }, [taskTemplates]);

  // Análisis del día por asistente: columnas para cruces, pares cruzados y
  // tareas que incumplen su regla de ubicación.
  const analysisByAssistant = useMemo(() => {
    const out = {};
    for (const assistant of assistants) {
      const key = normalizeKey(assistant.email || assistant.name);
      const items = schedule
        .filter(item => item.active !== false && item.day === day)
        .filter(item => scheduleItemMatchesAssistant(item, assistant))
        .sort(sortSchedule);

      const layout = layoutOverlaps(items);
      const overlaps = findOverlaps(items);
      const conflictIds = new Set(overlaps.flatMap(([a, b]) => [a.id, b.id]));

      // Límites del día: jornada del Hub si existe, si no el rango de las tareas.
      const jornada = hubInfoByAssistant[key]?.jornada;
      const starts = items.map(item => timeToMinutes(item.startTime)).filter(Number.isFinite);
      const ends = items.map(item => timeToMinutes(item.endTime)).filter(Number.isFinite);
      const dayStart = jornada ? timeToMinutes(jornada.start) : (starts.length ? Math.min(...starts) : null);
      const dayEnd = jornada ? timeToMinutes(jornada.end) : (ends.length ? Math.max(...ends) : null);

      const ruleWarnings = [];
      for (const item of items) {
        const rule = ruleByTask[normalizeKey(item.task)];
        if (!rule || dayStart == null || dayEnd == null) continue;
        const start = timeToMinutes(item.startTime);
        const end = timeToMinutes(item.endTime);
        if (rule.rule === 'fin' && (end < dayEnd || start < dayEnd - rule.minutes)) {
          ruleWarnings.push({
            id: item.id,
            message: `"${item.task}" debería ir en los últimos ${rule.minutes} min del día (cierre ${minutesToTime(dayEnd)}), no en ${item.startTime}–${item.endTime}.`
          });
        }
        if (rule.rule === 'inicio' && (start > dayStart || end > dayStart + rule.minutes)) {
          ruleWarnings.push({
            id: item.id,
            message: `"${item.task}" debería ir en los primeros ${rule.minutes} min del día (apertura ${minutesToTime(dayStart)}), no en ${item.startTime}–${item.endTime}.`
          });
        }
        if (rule.rule === 'hora' && Number.isFinite(timeToMinutes(rule.fixedTime)) && start !== timeToMinutes(rule.fixedTime)) {
          ruleWarnings.push({
            id: item.id,
            message: `"${item.task}" debe iniciar siempre a las ${rule.fixedTime}, no a las ${item.startTime}.`
          });
        }
        const lunch = hubInfoByAssistant[key]?.lunch;
        if (rule.rule === 'manana' && lunch && end > lunch.start) {
          ruleWarnings.push({
            id: item.id,
            message: `"${item.task}" debe quedar antes del almuerzo (${minutesToTime(lunch.start)}).`
          });
        }
        if (rule.rule === 'tarde' && lunch && start < lunch.end) {
          ruleWarnings.push({
            id: item.id,
            message: `"${item.task}" debe quedar después del almuerzo (${minutesToTime(lunch.end)}).`
          });
        }
      }
      const ruleIds = new Set(ruleWarnings.map(warning => warning.id));
      out[key] = { items, layout, overlaps, conflictIds, ruleWarnings, ruleIds };
    }
    return out;
  }, [assistants, schedule, day, ruleByTask, hubInfoByAssistant]);

  // Corre todas las tareas del día de una asistente para que entren en su jornada del Hub.
  async function handleFitToJornada(assistant, jornada) {
    const items = schedule
      .filter(item => item.active !== false && item.day === day)
      .filter(item => scheduleItemMatchesAssistant(item, assistant));
    if (!items.length) return;

    const startJ = timeToMinutes(jornada.start);
    const endJ = timeToMinutes(jornada.end);
    const minStart = Math.min(...items.map(item => timeToMinutes(item.startTime)));
    const maxEnd = Math.max(...items.map(item => timeToMinutes(item.endTime)));

    if (maxEnd - minStart > endJ - startJ) {
      setError(`Las tareas de ${assistant.name} (${minutesToTime(minStart)}-${minutesToTime(maxEnd)}) ocupan más tiempo que su jornada (${jornada.start}-${jornada.end}). Hay que reducir o quitar tareas.`);
      return;
    }
    let offset = 0;
    if (minStart < startJ) offset = startJ - minStart;
    else if (maxEnd > endJ) offset = endJ - maxEnd;
    if (!offset) return;

    const direction = offset < 0 ? `${durationLabel(Math.abs(offset))} antes` : `${durationLabel(offset)} después`;
    const ok = window.confirm(`¿Correr las ${items.length} tarea(s) de ${assistant.name} del ${day} ${direction} para ajustarlas a su jornada (${jornada.start}-${jornada.end})?`);
    if (!ok) return;

    setError('');
    setNotice('');
    try {
      await shiftScheduleTasks(items, offset);
      setNotice(`Tareas de ${assistant.name} ajustadas a su jornada del ${day} (${jornada.start}-${jornada.end}).`);
    } catch (err) {
      setError(err.message || 'No se pudo ajustar el horario.');
    }
  }

  // Rellena los huecos de jornada (según Admin Hub) con tareas de la bolsa:
  // primero las pendientes del día (una sola vez, por prioridad), luego las
  // repetibles en rotación hasta cubrir el tiempo libre.
  async function handleAutoFill() {
    if (!hubData) {
      setError('Conecta Admin Hub para rellenar según las jornadas reales.');
      return;
    }
    const assignedKeys = new Set(
      schedule
        .filter(item => item.active !== false && item.day === day)
        .map(item => `${normalizeKey(item.task)}::${normalizeKey(item.assistantEmail || item.assistantName || item.assistantUsername || item.username)}`)
    );
    const isAssignedToAssistant = (template, assistant) => {
      const taskKey = normalizeKey(template.name);
      const keys = [
        normalizeKey(assistant.email),
        normalizeKey(assistant.name),
        normalizeKey(assistant.username)
      ].filter(Boolean);
      return keys.some(key => assignedKeys.has(`${taskKey}::${key}`));
    };
    const prioRank = { Alta: 0, Media: 1, Baja: 2 };
    const repeatables = taskTemplates.filter(template =>
      template.repeatable === true && templateAppliesToDay(template)
    );

    const placements = [];
    let repeatIndex = 0;
    let adjustedCount = 0;
    const autoFillAssistants = autoFillAssistant
      ? assistants.filter(assistant => assistantKey(assistant) === autoFillAssistant)
      : assistants;

    const ruleOf = name => ruleByTask[normalizeKey(name)];
    for (const assistant of autoFillAssistants) {
      const info = hubInfoByAssistant[normalizeKey(assistant.email || assistant.name)];
      if (!info?.jornada || !info.gaps.length) continue;

      // Segmentos libres mutables: se van consumiendo a medida que ubicamos tareas.
      let segments = info.gaps.map(([s, e]) => ({ start: s, end: e }));
      const dropTiny = () => { segments = segments.filter(seg => seg.end - seg.start >= 15); };

      const place = (template, startMinutes, durationMinutes) => {
        placements.push({ assistant, startMinutes, endMinutes: startMinutes + durationMinutes, template });
        assignedKeys.add(`${normalizeKey(template.name)}::${assistantKey(assistant)}`);
      };

      const consumeSegment = (template, seg, startMinutes, durationMinutes) => {
        place(template, startMinutes, durationMinutes);
        const originalEnd = seg.end;
        seg.end = startMinutes;
        if (startMinutes + durationMinutes < originalEnd) {
          segments.push({ start: startMinutes + durationMinutes, end: originalEnd });
        }
        dropTiny();
      };

      // Tarea de apertura: lo más temprano posible (primer segmento que la admita).
      const placeFront = template => {
        const duration = Number(template.durationMinutes || 30);
        const jornadaStart = timeToMinutes(info.jornada.start);
        const seg = segments.find(s => s.start === jornadaStart && s.end - s.start >= duration);
        if (!seg) return;
        place(template, seg.start, duration);
        seg.start += duration;
        dropTiny();
      };

      // Tarea de cierre: lo más tarde posible (último segmento que la admita).
      const placeBack = template => {
        const duration = Number(template.durationMinutes || 30);
        const jornadaEnd = timeToMinutes(info.jornada.end);
        const seg = segments.find(s => s.end === jornadaEnd && s.end - s.start >= duration);
        if (!seg) return;
        place(template, seg.end - duration, duration);
        seg.end -= duration;
        dropTiny();
      };

      const placeFixed = template => {
        const duration = Number(template.durationMinutes || 30);
        const fixedStart = timeToMinutes(ruleOf(template.name)?.fixedTime);
        if (!Number.isFinite(fixedStart)) return;
        const seg = segments.find(s => s.start <= fixedStart && s.end >= fixedStart + duration);
        if (seg) consumeSegment(template, seg, fixedStart, duration);
      };

      const placeInPeriod = (template, period) => {
        const duration = Number(template.durationMinutes || 30);
        const lunchStart = info.lunch?.start;
        const lunchEnd = info.lunch?.end;
        const eligible = [...segments]
          .sort((a, b) => a.start - b.start)
          .filter(seg => period === 'manana'
            ? (!Number.isFinite(lunchStart) || seg.start < lunchStart)
            : (!Number.isFinite(lunchEnd) || seg.end > lunchEnd));
        const seg = eligible.find(candidate => {
          const start = period === 'manana' ? candidate.start : Math.max(candidate.start, lunchEnd || candidate.start);
          const endLimit = period === 'manana' ? Math.min(candidate.end, lunchStart || candidate.end) : candidate.end;
          return endLimit - start >= duration;
        });
        if (!seg) return;
        const start = period === 'manana' ? seg.start : Math.max(seg.start, lunchEnd || seg.start);
        consumeSegment(template, seg, start, duration);
      };

      const pending = taskTemplates
        .filter(template => templateAppliesToAssistant(template, assistant) && templateAppliesToDay(template))
        .filter(template => !isAssignedToAssistant(template, assistant))
        .sort((a, b) => (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1));

      // 1) Apertura primero (temprano), 2) cierre (tarde), antes de rellenar el resto.
      pending.filter(t => ruleOf(t.name)?.rule === 'hora').forEach(placeFixed);
      pending.filter(t => ruleOf(t.name)?.rule === 'inicio').forEach(placeFront);
      pending.filter(t => ruleOf(t.name)?.rule === 'fin').forEach(placeBack);
      pending.filter(t => ruleOf(t.name)?.rule === 'manana').forEach(t => placeInPeriod(t, 'manana'));
      pending.filter(t => ruleOf(t.name)?.rule === 'tarde').forEach(t => placeInPeriod(t, 'tarde'));

      // 3) Resto de tareas (sin regla) por prioridad, luego repetibles, en lo que quede libre.
      const pendingQueue = pending.filter(t => {
        const rule = ruleOf(t.name)?.rule;
        return !['inicio', 'fin', 'hora', 'manana', 'tarde'].includes(rule);
      });
      const assistantRepeatables = repeatables.filter(template =>
        templateAppliesToAssistant(template, assistant) && !ruleOf(template.name)
      );
      for (const seg of [...segments].sort((a, b) => a.start - b.start)) {
        let cursor = seg.start;
        const gapEnd = seg.end;
        while (gapEnd - cursor >= 15) {
          const remaining = gapEnd - cursor;
          let chosen = null;
          const pendingIdx = pendingQueue.findIndex(template =>
            Number(template.durationMinutes || 30) <= remaining &&
            templateAppliesToAssistant(template, assistant)
          );
          if (pendingIdx !== -1) {
            chosen = pendingQueue.splice(pendingIdx, 1)[0];
          } else if (assistantRepeatables.length) {
            for (let n = 0; n < assistantRepeatables.length; n += 1) {
              const candidate = assistantRepeatables[(repeatIndex + n) % assistantRepeatables.length];
              if (Number(candidate.durationMinutes || 30) <= remaining) {
                chosen = candidate;
                repeatIndex = (repeatIndex + n + 1) % assistantRepeatables.length;
                break;
              }
            }
          }

          // Si ninguna tarea cabe completa pero todavía queda tiempo útil,
          // toma una tarea más larga (p. ej. de 1 hora) y la recorta al tiempo
          // restante (mínimo 30 min) solo para ese hueco.
          let placedDuration = chosen ? Number(chosen.durationMinutes || 30) : null;
          if (!chosen && remaining >= 30) {
            const pendingLargerIdx = pendingQueue.findIndex(template =>
              Number(template.durationMinutes || 30) > remaining &&
              templateAppliesToAssistant(template, assistant)
            );
            if (pendingLargerIdx !== -1) {
              chosen = pendingQueue.splice(pendingLargerIdx, 1)[0];
            } else if (assistantRepeatables.length) {
              for (let n = 0; n < assistantRepeatables.length; n += 1) {
                const candidate = assistantRepeatables[(repeatIndex + n) % assistantRepeatables.length];
                if (Number(candidate.durationMinutes || 30) > remaining) {
                  chosen = candidate;
                  repeatIndex = (repeatIndex + n + 1) % assistantRepeatables.length;
                  break;
                }
              }
            }
            if (chosen) {
              placedDuration = remaining;
              adjustedCount += 1;
            }
          }

          if (!chosen) break;
          place(chosen, cursor, placedDuration);
          cursor += placedDuration;
        }
      }
    }

    // Almuerzos: crea la tarea fija de almuerzo si el asistente tiene hora común
    // configurada y aún no hay una ese día. Queda como tarea editable/movible.
    const lunchPlacements = [];
    for (const assistant of autoFillAssistants) {
      const info = hubInfoByAssistant[normalizeKey(assistant.email || assistant.name)];
      if (info?.lunch) {
        lunchPlacements.push({ assistant, startMinutes: info.lunch.start, endMinutes: info.lunch.end });
      }
    }

    if (!placements.length && !lunchPlacements.length) {
      setError('No hay huecos por rellenar (ni almuerzos por crear), o ninguna tarea de la bolsa cabe en los huecos. Marca tareas como repetibles para usarlas de relleno.');
      return;
    }
    const summaryParts = [];
    if (placements.length) summaryParts.push(`${placements.length} tarea(s) en los huecos`);
    if (lunchPlacements.length) summaryParts.push(`${lunchPlacements.length} almuerzo(s)`);
    const ok = window.confirm(`¿Asignar automáticamente ${summaryParts.join(' y ')} del ${day}? Después puedes moverlas, editarlas o eliminarlas manualmente.`);
    if (!ok) return;

    setAutoFilling(true);
    setError('');
    setNotice('');
    try {
      for (const placement of placements) {
        await saveScheduleTask({
          day,
          startTime: minutesToTime(placement.startMinutes),
          endTime: minutesToTime(placement.endMinutes),
          assistantName: placement.assistant.name,
          assistantEmail: placement.assistant.email,
          task: placement.template.name,
          description: placement.template.description || '',
          category: placement.template.category || '',
          color: 'azul',
          scenario: settings?.activeScenario || 'normal',
          scheduleDate: isDateOverride ? selectedDate : ''
        });
      }
      for (const lunch of lunchPlacements) {
        await saveScheduleTask({
          day,
          startTime: minutesToTime(lunch.startMinutes),
          endTime: minutesToTime(lunch.endMinutes),
          assistantName: lunch.assistant.name,
          assistantEmail: lunch.assistant.email,
          task: 'Almuerzo',
          description: '',
          category: 'Descanso',
          color: 'naranja',
          scenario: settings?.activeScenario || 'normal',
          scheduleDate: isDateOverride ? selectedDate : ''
        });
      }
      const adjustedNote = adjustedCount
        ? ` Había tareas de mayor duración (p. ej. de 1 hora), así que ${adjustedCount} se ajustaron al tiempo restante (p. ej. 30 min) para completar el horario.`
        : '';
      const lunchNote = lunchPlacements.length ? ` Se agregó el almuerzo de ${lunchPlacements.length} asistente(s).` : '';
      setNotice(`Se asignaron ${placements.length} tarea(s) automáticamente en los huecos del ${day}.${adjustedNote}${lunchNote}`);
    } catch (err) {
      setError(err.message || 'No se pudo rellenar el horario.');
    } finally {
      setAutoFilling(false);
    }
  }

  function toggleShiftDay(name) {
    setShiftDays(current => current.includes(name)
      ? current.filter(item => item !== name)
      : [...current, name]);
  }

  function toggleDuplicateDay(name) {
    setDuplicateDays(current => current.includes(name)
      ? current.filter(item => item !== name)
      : [...current, name]);
  }

  function openShiftPanel() {
    setShiftOpen(open => !open);
    setCoverageOpen(false);
    setDuplicateOpen(false);
    setShiftDays(current => (current.length ? current : [day]));
  }

  function openDuplicatePanel() {
    setDuplicateOpen(open => !open);
    setCoverageOpen(false);
    setShiftOpen(false);
    setDuplicateScenario(activeScenario);
    setDuplicateAssistant('');
    setDuplicateDays(current => current.filter(name => name !== day));
  }

  async function handleDuplicateDay() {
    // Solo cuando el escenario destino es el activo no tiene sentido duplicar el
    // día sobre sí mismo; entre escenarios distintos sí se permite el mismo día.
    const sameScenario = normalizeKey(duplicateScenario) === normalizeKey(activeScenario);
    const targets = sameScenario ? duplicateDays.filter(name => name !== day) : duplicateDays;
    if (!targets.length) {
      setError(sameScenario
        ? 'Selecciona al menos un día destino distinto al día actual.'
        : 'Selecciona al menos un día destino.');
      return;
    }
    const selectedAssistant = assistants.find(item => normalizeKey(item.email || item.name) === duplicateAssistant);
    const sourceItems = schedule
      .filter(item => item.active !== false)
      .filter(item => item.day === day)
      .filter(item => (selectedAssistant ? scheduleItemMatchesAssistant(item, selectedAssistant) : true));
    if (!sourceItems.length) {
      setError(selectedAssistant
        ? `No hay tareas activas de ${selectedAssistant.name} para duplicar del ${day}.`
        : `No hay tareas activas para duplicar del ${day}.`);
      return;
    }
    const scenarioName = scenarios.find(item => normalizeKey(item.id) === normalizeKey(duplicateScenario))?.name || duplicateScenario;
    const scenarioText = sameScenario ? '' : ` al escenario "${scenarioName}"`;
    const whoText = selectedAssistant ? ` de ${selectedAssistant.name}` : '';
    const replaceText = duplicateReplace
      ? (selectedAssistant
        ? ` Se reemplazarán las tareas de ${selectedAssistant.name} que ya existan en esos días.`
        : ' Se reemplazará el horario que ya exista en esos días.')
      : '';
    const ok = window.confirm(`¿Duplicar ${sourceItems.length} tarea(s)${whoText} del ${day} a ${targets.join(', ')}${scenarioText}?${replaceText}`);
    if (!ok) return;

    setDuplicating(true);
    setError('');
    setNotice('');
    try {
      const existingForReplace = (allSchedule || schedule)
        .filter(item => (selectedAssistant ? scheduleItemMatchesAssistant(item, selectedAssistant) : true));
      const count = await duplicateScheduleDay(sourceItems, targets, {
        replaceExisting: duplicateReplace,
        existingSchedule: existingForReplace,
        targetScenario: duplicateScenario
      });
      setNotice(`Se duplicaron ${count} tarea(s)${whoText} del ${day} a ${targets.join(', ')}${scenarioText}.`);
      setDuplicateOpen(false);
      setDuplicateDays([]);
    } catch (err) {
      setError(err.message || 'No se pudo duplicar el horario.');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleShift() {
    const offset = shiftPreset === 'custom'
      ? (shiftCustomDirection === 'antes' ? -1 : 1) * Math.abs(Number(shiftCustomMinutes) || 0)
      : Number(shiftPreset);
    if (!offset) {
      setError('Indica cuántos minutos correr el horario.');
      return;
    }
    if (!shiftDays.length) {
      setError('Selecciona al menos un día.');
      return;
    }
    const selectedAssistant = assistants.find(item => normalizeKey(item.email || item.name) === shiftAssistant);
    const targets = schedule
      .filter(item => item.active !== false)
      .filter(item => shiftDays.includes(item.day))
      .filter(item => (selectedAssistant ? scheduleItemMatchesAssistant(item, selectedAssistant) : true));

    if (!targets.length) {
      setError('No hay tareas que coincidan con ese filtro.');
      return;
    }
    const direction = offset < 0 ? `${durationLabel(Math.abs(offset))} antes` : `${durationLabel(offset)} después`;
    const scopeLabel = shiftDays.length === 1 ? shiftDays[0] : shiftDays.join(', ');
    const who = selectedAssistant ? selectedAssistant.name : 'todas las asistentes';
    const ok = window.confirm(`¿Correr ${targets.length} tarea(s) de ${who} (${scopeLabel}) ${direction}?`);
    if (!ok) return;

    setShifting(true);
    setError('');
    setNotice('');
    try {
      const count = await shiftScheduleTasks(targets, offset);
      setNotice(`Se corrieron ${count} tarea(s) ${direction}.`);
      setShiftOpen(false);
    } catch (err) {
      setError(err.message || 'No se pudo correr el horario.');
    } finally {
      setShifting(false);
    }
  }

  async function handleSave(payload) {
    setSaving(true);
    setError('');
    try {
      await saveScheduleTask({
        ...payload,
        scheduleDate: payload.scheduleDate || (isDateOverride ? selectedDate : '')
      });
      setEditing(null);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la tarea.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(task) {
    if (!task?.id) return;
    const ok = window.confirm(`¿Eliminar la tarea "${task.task}"?`);
    if (!ok) return;
    await deleteScheduleTask(task.id);
    setEditing(null);
  }

  async function handleMoveTask(task, startTime, endTime) {
    if (task.startTime === startTime && task.endTime === endTime) return;
    setError('');
    try {
      await saveScheduleTask({ ...task, startTime, endTime });
      setNotice(`"${task.task}" se movió a ${startTime}-${endTime}.`);
    } catch (err) {
      setError(err.message || 'No se pudo mover la tarea.');
    }
  }

  async function handleScenarioChange(activeScenario) {
    setSavingScenario(true);
    setError('');
    try {
      await saveManagerSettings({ ...settings, activeScenario });
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el escenario.');
    } finally {
      setSavingScenario(false);
    }
  }

  async function handleCreateDateOverride() {
    const baseTasks = (allSchedule || []).filter(item =>
      item.active !== false && item.day === day && !item.scheduleDate &&
      normalizeKey(item.scenario || 'normal') === normalizeKey(activeScenario)
    );
    setSavingDateMode(true);
    setError('');
    try {
      const count = await createScheduleDateOverride(baseTasks, selectedDate);
      setNotice(`Se creó una copia de ${count} tarea(s) solo para ${selectedDate}. Los cambios ya no alteran el horario base.`);
    } catch (err) {
      setError(err.message || 'No se pudo crear la excepción del día.');
    } finally {
      setSavingDateMode(false);
    }
  }

  async function handleClearSchedule() {
    const selectedAssistant = autoFillAssistant
      ? assistants.find(assistant => assistantKey(assistant) === autoFillAssistant)
      : null;
    const targets = schedule
      .filter(item => item.active !== false && item.day === day)
      .filter(item => selectedAssistant ? scheduleItemMatchesAssistant(item, selectedAssistant) : true);
    if (!targets.length) {
      setError(`No hay tareas para limpiar el ${day}${selectedAssistant ? ` de ${selectedAssistant.name}` : ''}.`);
      return;
    }
    const who = selectedAssistant ? selectedAssistant.name : 'todas las asistentes';
    const layer = isDateOverride ? `solo del ${selectedDate}` : `del horario base de los ${day}`;
    if (!window.confirm(`¿Eliminar ${targets.length} tarea(s) de ${who} ${layer}? Esta acción no se puede deshacer.`)) return;
    setClearingSchedule(true);
    setError('');
    setNotice('');
    try {
      const count = await deleteScheduleTasks(targets);
      setNotice(`Se limpiaron ${count} tarea(s) de ${who} ${layer}.`);
    } catch (err) {
      setError(err.message || 'No se pudo limpiar el horario.');
    } finally {
      setClearingSchedule(false);
    }
  }

  async function handleRestoreBaseDay() {
    if (!window.confirm(`¿Descartar los cambios de ${selectedDate} y volver al horario base de los ${day}?`)) return;
    setSavingDateMode(true);
    try {
      await deleteScheduleDateOverride(dateOverrideTasks);
      setNotice(`${selectedDate} volvió al horario normal/base.`);
    } catch (err) {
      setError(err.message || 'No se pudo restaurar el horario base.');
    } finally {
      setSavingDateMode(false);
    }
  }

  return (
    <>
    <section className="module-card wide">
      <div className="module-header">
        <div>
          <p className="eyebrow">Administrador</p>
          <h2>Horario semanal</h2>
        </div>
        <div className="schedule-header-actions">
          <label className="scenario-picker">
            <span>Escenario activo</span>
            <select
              value={settings?.activeScenario || 'normal'}
              onChange={event => handleScenarioChange(event.target.value)}
              disabled={savingScenario}
            >
              {(settings?.scenarios || DEFAULT_MANAGER_SETTINGS.scenarios).map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <button className="btn ghost" onClick={() => { setCoverageOpen(open => !open); setShiftOpen(false); }}>
            <Briefcase size={18} /> Bolsa {pendingTemplates.length > 0 ? `(${pendingTemplates.length} sin asignar)` : '(al día)'}
          </button>
          <button className="btn ghost" onClick={openShiftPanel}>
            <Clock size={18} /> Correr horario
          </button>
          <button className="btn ghost" onClick={openDuplicatePanel}>
            <Copy size={18} /> Duplicar día
          </button>
          {hubData && (
            <div className="auto-fill-controls">
              <select
                value={autoFillAssistant}
                onChange={event => setAutoFillAssistant(event.target.value)}
                aria-label="Asistente para rellenar automáticamente"
                disabled={autoFilling}
              >
                <option value="">Todas las asistentes</option>
                {assistants.map(assistant => (
                  <option key={assistantKey(assistant)} value={assistantKey(assistant)}>
                    {assistant.name || assistant.email}
                  </option>
                ))}
              </select>
              <button className="btn ghost" onClick={handleAutoFill} disabled={autoFilling}>
                <Wand2 size={18} /> {autoFilling ? 'Rellenando...' : 'Rellenar auto'}
              </button>
              <button className="btn danger" onClick={handleClearSchedule} disabled={clearingSchedule || autoFilling}>
                {clearingSchedule ? 'Limpiando...' : 'Limpiar horario'}
              </button>
            </div>
          )}
          {!hubUser ? (
            <button className="btn ghost" onClick={handleConnectHub}>
              <Link2 size={18} /> Conectar Admin Hub
            </button>
          ) : (
            <span className="hub-chip ok" title={`Conectado como ${hubUser}`}>Hub ✓</span>
          )}
          <button className="btn primary" onClick={() => setEditing({ day, scenario: settings?.activeScenario || 'normal', scheduleDate: isDateOverride ? selectedDate : '' })}><Plus size={18} /> Nueva tarea</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {hubError && <div className="form-error">{hubError}</div>}
      {notice && <div className="form-notice">{notice}</div>}
      {hubLoading && <div className="form-notice">Leyendo horarios del Admin Hub...</div>}

      <div className={`form-notice schedule-mode-notice ${isDateOverride ? 'date-override' : ''}`}>
        <div>
          <strong>{isDateOverride ? `Cambio solo para ${selectedDate}` : `Horario base de los ${day}`}</strong>
          <span>{isDateOverride
            ? ' Puedes mover, agregar o borrar tareas sin cambiar los demás días.'
            : ' Este horario se repite cada semana.'}</span>
        </div>
        {isDateOverride ? (
          <button className="btn ghost small" onClick={handleRestoreBaseDay} disabled={savingDateMode}>
            Marcar como día normal
          </button>
        ) : (
          <button className="btn ghost small" onClick={handleCreateDateOverride} disabled={savingDateMode}>
            Hacer cambios solo este día
          </button>
        )}
      </div>

      {hubData && unresolvedAssistants.length > 0 && (
        <div className="coverage-panel">
          <h3>Vincular asistentes con Admin Hub</h3>
          <p className="muted">
            Estas asistentes entran al Manager con usuario interno, así que hay que indicar manualmente
            quién es cada una en el Hub. El vínculo se guarda y no hay que repetirlo.
          </p>
          <div className="shift-controls">
            {unresolvedAssistants.map(assistant => {
              const key = normalizeKey(assistant.email || assistant.name);
              return (
                <label key={key}>
                  <span>{assistant.name || assistant.email}</span>
                  <select value={hubLinks[key] || 'auto'} onChange={e => handleLinkChange(key, e.target.value)}>
                    <option value="auto">Seleccionar...</option>
                    {hubData.members.map(member => (
                      <option key={member.email} value={member.email}>
                        {member.name || member.email} ({member.email})
                      </option>
                    ))}
                    <option value="none">No vincular</option>
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <DayTabs active={day} onChange={setDay} />

      {coverageOpen && (
        <div className="coverage-panel">
          <h3>Bolsa de tareas · cobertura del {day}</h3>
          {coverage.length === 0 && <p className="muted">No hay tareas base en la bolsa. Créalas en Configuración.</p>}
          <div className="coverage-list">
            {coverage.map(({ assistant, template, matches }) => (
              <div className={`coverage-item ${matches.length ? 'done' : 'pending'}`} key={`${assistantKey(assistant)}-${template.id}`}>
                <span className="coverage-status">
                  {matches.length ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </span>
                <span className="coverage-name">
                  <strong>{template.name}</strong>
                  <span className="muted"> · {assistant.name || assistant.email}</span>
                  <span className="muted"> · {template.category || 'General'} · {durationLabel(template.durationMinutes || 30)}</span>
                </span>
                <span className="coverage-detail muted">
                  {matches.length
                    ? matches.map(item => `${item.assistantName || item.assistantEmail} ${item.startTime}-${item.endTime}`).join(' · ')
                    : 'Sin asignar'}
                </span>
                {!matches.length && (
                  <button className="btn ghost small" onClick={() => assignFromTemplate(template, assistant)}>Asignar</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {duplicateOpen && (
        <div className="coverage-panel">
          <h3>Duplicar horario del {day}</h3>
          <div className="shift-controls">
            <label>
              <span>Asistente</span>
              <select value={duplicateAssistant} onChange={e => setDuplicateAssistant(e.target.value)}>
                <option value="">Todas</option>
                {assistants.map(item => (
                  <option key={item.email || item.name} value={normalizeKey(item.email || item.name)}>
                    {item.name || item.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Escenario destino</span>
              <select value={duplicateScenario} onChange={e => setDuplicateScenario(e.target.value)}>
                {scenarios.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name}{normalizeKey(item.id) === normalizeKey(activeScenario) ? ' (activo)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="shift-days">
            <span className="muted">Copiar a:</span>
            {DAYS.slice(0, 6)
              .filter(name => normalizeKey(duplicateScenario) !== normalizeKey(activeScenario) || name !== day)
              .map(name => (
                <label key={name} className="day-check">
                  <input
                    type="checkbox"
                    checked={duplicateDays.includes(name)}
                    onChange={() => toggleDuplicateDay(name)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setDuplicateDays(DAYS.slice(0, 6)
                .filter(name => normalizeKey(duplicateScenario) !== normalizeKey(activeScenario) || name !== day))}
            >
              Todos
            </button>
          </div>
          <label className="day-check replace-check">
            <input
              type="checkbox"
              checked={duplicateReplace}
              onChange={e => setDuplicateReplace(e.target.checked)}
            />
            <span>Reemplazar lo que ya exista en los días destino</span>
          </label>
          <div className="shift-controls">
            <button className="btn primary" onClick={handleDuplicateDay} disabled={duplicating}>
              {duplicating ? 'Duplicando...' : 'Duplicar horario'}
            </button>
          </div>
          <p className="muted">Copia las mismas tareas, asistentes y horas del día seleccionado al escenario destino. Puedes duplicar a otro escenario (incluso el mismo día) para armarlo a partir del actual.</p>
        </div>
      )}

      {shiftOpen && (
        <div className="coverage-panel">
          <h3>Correr horario (escenario activo)</h3>
          <div className="shift-days">
            <span className="muted">Días:</span>
            {DAYS.slice(0, 6).map(name => (
              <label key={name} className="day-check">
                <input
                  type="checkbox"
                  checked={shiftDays.includes(name)}
                  onChange={() => toggleShiftDay(name)}
                />
                <span>{name}</span>
              </label>
            ))}
            <button type="button" className="btn ghost small" onClick={() => setShiftDays(DAYS.slice(0, 6))}>Todos</button>
          </div>
          <div className="shift-controls">
            <label>
              <span>Asistente</span>
              <select value={shiftAssistant} onChange={e => setShiftAssistant(e.target.value)}>
                <option value="">Todas</option>
                {assistants.map(item => (
                  <option key={item.email || item.name} value={normalizeKey(item.email || item.name)}>
                    {item.name || item.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Mover</span>
              <select value={shiftPreset} onChange={e => setShiftPreset(e.target.value)}>
                <option value="-120">2 horas antes</option>
                <option value="-60">1 hora antes</option>
                <option value="-30">30 min antes</option>
                <option value="-15">15 min antes</option>
                <option value="15">15 min después</option>
                <option value="30">30 min después</option>
                <option value="60">1 hora después</option>
                <option value="120">2 horas después</option>
                <option value="custom">Personalizado...</option>
              </select>
            </label>
            {shiftPreset === 'custom' && (
              <>
                <label>
                  <span>Minutos</span>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={shiftCustomMinutes}
                    onChange={e => setShiftCustomMinutes(e.target.value)}
                    style={{ width: 90 }}
                  />
                </label>
                <label>
                  <span>Dirección</span>
                  <select value={shiftCustomDirection} onChange={e => setShiftCustomDirection(e.target.value)}>
                    <option value="antes">Antes</option>
                    <option value="despues">Después</option>
                  </select>
                </label>
              </>
            )}
            <button className="btn primary" onClick={handleShift} disabled={shifting}>
              {shifting ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
          <p className="muted">Mueve la hora de inicio y fin de todas las tareas que coincidan con el filtro. Te pedirá confirmación antes de aplicar.</p>
        </div>
      )}

      <div className="admin-timeline-scroll">
        <div className="admin-timeline-grid" style={{ gridTemplateColumns: `86px repeat(${Math.max(assistants.length, 1)}, minmax(220px, 1fr))` }}>
          <div className="assistant-head muted">Hora</div>
          {assistants.map(assistant => {
            const hubInfo = hubInfoByAssistant[normalizeKey(assistant.email || assistant.name)];
            const analysis = analysisByAssistant[normalizeKey(assistant.email || assistant.name)];
            const subtitle = assistant.email || assistant.username || '';
            const subtitleRedundant = !subtitle || normalizeKey(subtitle) === normalizeKey(assistant.name);
            return (
              <div className="assistant-head" key={assistant.username || assistant.email || assistant.name}>
                <strong>{assistant.name || assistant.email}</strong>
                {!subtitleRedundant && <span>{subtitle}</span>}
                {analysis?.overlaps.length > 0 && (
                  <span className="hub-chip warn" title={analysis.overlaps.map(([a, b]) => `${a.task} (${a.startTime}-${a.endTime}) ✕ ${b.task} (${b.startTime}-${b.endTime})`).join('\n')}>
                    ⚠ {analysis.overlaps.length} cruce(s): {analysis.overlaps.map(([a, b]) => `${a.startTime}-${a.endTime} ✕ ${b.startTime}-${b.endTime}`).join(' · ')}
                  </span>
                )}
                {analysis?.ruleWarnings.map(warning => (
                  <span className="hub-chip warn" key={warning.id} title={warning.message}>
                    ⚠ {warning.message}
                  </span>
                ))}
                {hubInfo && (
                  hubInfo.jornada ? (
                    <>
                      <span className={`hub-chip ${hubInfo.outside ? 'warn' : 'ok'}`}>
                        Hub: {hubInfo.jornada.start}–{hubInfo.jornada.end}
                        {hubInfo.jornada.source === 'excepción' ? ' (excepción)' : ''}
                        {hubInfo.outside ? ` · ⚠ ${hubInfo.outside} fuera de jornada` : ''}
                      </span>
                      {hubInfo.gaps.length > 0 && (
                        <span className="hub-chip warn">
                          ⚠ {durationLabel(hubInfo.gapMinutes)} sin tareas: {hubInfo.gaps.map(([s, e]) => `${minutesToTime(s)}–${minutesToTime(e)}`).join(' · ')}
                        </span>
                      )}
                      {hubInfo.outside > 0 && (
                        <button
                          type="button"
                          className="btn ghost small fit-btn"
                          onClick={() => handleFitToJornada(assistant, hubInfo.jornada)}
                        >
                          Ajustar a jornada
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="hub-chip off">Hub: no trabaja este día</span>
                  )
                )}
              </div>
            );
          })}

          <div className="time-axis admin-axis" style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
            {hours.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
          </div>

          {assistants.map(assistant => {
            const keys = [
              normalizeKey(assistant.email),
              normalizeKey(assistant.name),
              normalizeKey(assistant.username)
            ].filter(Boolean);
            const analysis = analysisByAssistant[normalizeKey(assistant.email || assistant.name)];
            const items = analysis?.items || [];
            return (
              <div className="timeline-column admin-col" key={keys[0]} style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
                {hours.map(hour => <div key={hour} className="hour-line" style={{ top: `${(hour - TIMELINE_START) * SLOT_HEIGHT * 2}px` }} />)}
                <CurrentTimeLine day={day} items={items} />
                <button className="quick-add" onClick={() => setEditing({ day, assistantName: assistant.name, assistantEmail: assistant.email, scenario: settings?.activeScenario || 'normal' })}>+ agregar</button>
                {items.map(item => (
                  <TimelineCard
                    key={item.id}
                    item={item}
                    layout={analysis?.layout.get(item.id)}
                    conflict={Boolean(analysis?.conflictIds.has(item.id) || analysis?.ruleIds.has(item.id))}
                    onClick={() => setEditing(item)}
                    onMove={handleMoveTask}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <TaskModal
          task={editing}
          assistants={assistants}
          templates={taskTemplates}
          getJornada={hubData ? getJornadaFor : null}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing.id ? handleDelete : null}
          saving={saving}
        />
      )}
    </section>

    </>
  );
}
