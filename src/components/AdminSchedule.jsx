import { useEffect, useMemo, useState } from 'react';
import { Briefcase, CheckCircle2, Circle, Clock, Link2, Plus, Wand2 } from 'lucide-react';
import { saveScheduleTask, deleteScheduleTask, shiftScheduleTasks } from '../services/scheduleService';
import { DEFAULT_MANAGER_SETTINGS, listenTaskTemplates, saveManagerSettings } from '../services/managerConfigService';
import { connectHub, hubScheduleForDay, listenHubSchedules, listenHubUser, matchHubMember } from '../services/hubService';
import { DAYS, normalizeKey, scheduleItemMatchesAssistant } from '../utils/normalize';
import { TIMELINE_END, TIMELINE_START, SLOT_HEIGHT, durationLabel, minutesToTime, sortSchedule, timeToMinutes } from '../utils/time';
import { DayTabs, TimelineCard } from './AssistantSchedule';
import TaskModal from './TaskModal';

export default function AdminSchedule({ schedule, users, settings }) {
  const [day, setDay] = useState('Lunes');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [error, setError] = useState('');
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftDays, setShiftDays] = useState([]);
  const [shiftAssistant, setShiftAssistant] = useState('');
  const [shiftPreset, setShiftPreset] = useState('-60');
  const [shiftCustomMinutes, setShiftCustomMinutes] = useState(30);
  const [shiftCustomDirection, setShiftCustomDirection] = useState('antes');
  const [shifting, setShifting] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
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
        email: user.source === 'assistantAccount' ? '' : user.email,
        username: user.username || user.legacyUsername || '',
        source: user.source
      }))
      .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email), 'es'));
  }, [users]);

  const hours = [];
  for (let h = TIMELINE_START; h <= TIMELINE_END; h += 1) hours.push(h);

  // Cobertura: qué tareas de la bolsa ya están asignadas en el día seleccionado (escenario activo).
  const coverage = useMemo(() => {
    const dayItems = schedule.filter(item => item.active !== false && item.day === day);
    return taskTemplates.map(template => ({
      template,
      matches: dayItems
        .filter(item => normalizeKey(item.task) === normalizeKey(template.name))
        .sort(sortSchedule)
    }));
  }, [schedule, taskTemplates, day]);
  const pendingTemplates = coverage.filter(entry => entry.matches.length === 0);

  function assignFromTemplate(template) {
    const duration = Number(template.durationMinutes || 30);
    const startTime = '09:00';
    setEditing({
      day,
      scenario: settings?.activeScenario || 'normal',
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
      if (jornada) {
        const start = timeToMinutes(jornada.start);
        const end = timeToMinutes(jornada.end);
        const items = schedule
          .filter(item => item.active !== false && item.day === day)
          .filter(item => scheduleItemMatchesAssistant(item, assistant));
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
      const gapMinutes = gaps.reduce((sum, [s, e]) => sum + (e - s), 0);
      out[normalizeKey(assistant.email || assistant.name)] = { jornada, outside, gaps, gapMinutes };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistants, hubData, schedule, day, settings]);

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
        .map(item => normalizeKey(item.task))
    );
    const prioRank = { Alta: 0, Media: 1, Baja: 2 };
    const pendingQueue = taskTemplates
      .filter(template => !assignedKeys.has(normalizeKey(template.name)))
      .sort((a, b) => (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1));
    const repeatables = taskTemplates.filter(template => template.repeatable === true);

    const placements = [];
    let repeatIndex = 0;

    for (const assistant of assistants) {
      const info = hubInfoByAssistant[normalizeKey(assistant.email || assistant.name)];
      if (!info?.jornada || !info.gaps.length) continue;
      for (const [gapStart, gapEnd] of info.gaps) {
        let cursor = gapStart;
        while (gapEnd - cursor >= 15) {
          const remaining = gapEnd - cursor;
          let chosen = null;
          const pendingIdx = pendingQueue.findIndex(template =>
            Number(template.durationMinutes || 30) <= remaining &&
            (!template.suggestedOwner || normalizeKey(template.suggestedOwner) === normalizeKey(assistant.name))
          );
          if (pendingIdx !== -1) {
            chosen = pendingQueue.splice(pendingIdx, 1)[0];
          } else if (repeatables.length) {
            for (let n = 0; n < repeatables.length; n += 1) {
              const candidate = repeatables[(repeatIndex + n) % repeatables.length];
              if (Number(candidate.durationMinutes || 30) <= remaining) {
                chosen = candidate;
                repeatIndex = (repeatIndex + n + 1) % repeatables.length;
                break;
              }
            }
          }
          if (!chosen) break;
          const duration = Number(chosen.durationMinutes || 30);
          placements.push({ assistant, startMinutes: cursor, endMinutes: cursor + duration, template: chosen });
          cursor += duration;
        }
      }
    }

    if (!placements.length) {
      setError('No hay huecos por rellenar, o ninguna tarea de la bolsa cabe en ellos. Marca tareas como repetibles para usarlas de relleno.');
      return;
    }
    const ok = window.confirm(`¿Asignar automáticamente ${placements.length} tarea(s) en los huecos del ${day}? Después puedes moverlas, editarlas o eliminarlas manualmente.`);
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
          scenario: settings?.activeScenario || 'normal'
        });
      }
      setNotice(`Se asignaron ${placements.length} tarea(s) automáticamente en los huecos del ${day}.`);
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

  function openShiftPanel() {
    setShiftOpen(open => !open);
    setCoverageOpen(false);
    setShiftDays(current => (current.length ? current : [day]));
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
      await saveScheduleTask(payload);
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
          {hubData && (
            <button className="btn ghost" onClick={handleAutoFill} disabled={autoFilling}>
              <Wand2 size={18} /> {autoFilling ? 'Rellenando...' : 'Rellenar auto'}
            </button>
          )}
          {!hubUser ? (
            <button className="btn ghost" onClick={handleConnectHub}>
              <Link2 size={18} /> Conectar Admin Hub
            </button>
          ) : (
            <span className="hub-chip ok" title={`Conectado como ${hubUser}`}>Hub ✓</span>
          )}
          <button className="btn primary" onClick={() => setEditing({ day, scenario: settings?.activeScenario || 'normal' })}><Plus size={18} /> Nueva tarea</button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {hubError && <div className="form-error">{hubError}</div>}
      {notice && <div className="form-notice">{notice}</div>}
      {hubLoading && <div className="form-notice">Leyendo horarios del Admin Hub...</div>}

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
            {coverage.map(({ template, matches }) => (
              <div className={`coverage-item ${matches.length ? 'done' : 'pending'}`} key={template.id}>
                <span className="coverage-status">
                  {matches.length ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </span>
                <span className="coverage-name">
                  <strong>{template.name}</strong>
                  <span className="muted"> · {template.category || 'General'} · {durationLabel(template.durationMinutes || 30)}</span>
                </span>
                <span className="coverage-detail muted">
                  {matches.length
                    ? matches.map(item => `${item.assistantName || item.assistantEmail} ${item.startTime}-${item.endTime}`).join(' · ')
                    : 'Sin asignar'}
                </span>
                {!matches.length && (
                  <button className="btn ghost small" onClick={() => assignFromTemplate(template)}>Asignar</button>
                )}
              </div>
            ))}
          </div>
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
            const subtitle = assistant.email || assistant.username || '';
            const subtitleRedundant = !subtitle || normalizeKey(subtitle) === normalizeKey(assistant.name);
            return (
              <div className="assistant-head" key={assistant.username || assistant.email || assistant.name}>
                <strong>{assistant.name || assistant.email}</strong>
                {!subtitleRedundant && <span>{subtitle}</span>}
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
            const items = schedule
              .filter(item => item.active !== false)
              .filter(item => item.day === day)
              .filter(item => scheduleItemMatchesAssistant(item, assistant))
              .sort(sortSchedule);
            return (
              <div className="timeline-column admin-col" key={keys[0]} style={{ height: `${(TIMELINE_END - TIMELINE_START + 1) * SLOT_HEIGHT * 2}px` }}>
                {hours.map(hour => <div key={hour} className="hour-line" style={{ top: `${(hour - TIMELINE_START) * SLOT_HEIGHT * 2}px` }} />)}
                <button className="quick-add" onClick={() => setEditing({ day, assistantName: assistant.name, assistantEmail: assistant.email, scenario: settings?.activeScenario || 'normal' })}>+ agregar</button>
                {items.map(item => <TimelineCard key={item.id} item={item} onClick={() => setEditing(item)} />)}
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
