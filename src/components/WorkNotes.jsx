import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, Copy, Download, LayoutGrid, Lightbulb, ListTodo, PanelLeftClose, PanelLeftOpen, Plus, Search, SlidersHorizontal, StickyNote, Upload, X } from 'lucide-react';
import { listenWorkNotePreferences, listenWorkNotes, saveWorkNote, saveWorkNotePreferences, softDeleteWorkNote } from '../services/workNotesService';

const EMPTY = { title: '', content: '', type: 'quick', priority: 'media', category: '', tags: [], checklist: [], dueDate: '', reminderAt: '', pinned: false, archived: false };
const VIEWS = [
  ['all', 'Todas', StickyNote],
  ['today', 'Hoy', Check],
  ['pending', 'Pendientes', ListTodo],
  ['ideas', 'Ideas', Lightbulb],
  ['archived', 'Archivo', Archive]
];

export default function WorkNotes({ authUser, userName, isAdmin }) {
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [priority, setPriority] = useState('all');
  const [draft, setDraft] = useState(null);
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [showDeleted, setShowDeleted] = useState(false);
  const [sort, setSort] = useState('updated-desc');
  const [tag, setTag] = useState('');
  const [theme, setTheme] = useState('violeta');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [density, setDensity] = useState('cozy');
  const [corkboard, setCorkboard] = useState(false);
  const prefsLoaded = useRef(false);
  const importRef = useRef(null);

  useEffect(() => listenWorkNotes(authUser.uid, isAdmin, setNotes, err => setError(err.message)), [authUser.uid, isAdmin]);
  useEffect(() => listenWorkNotePreferences(authUser.uid, data => {
    setTheme(data.theme || 'violeta');
    setDensity(data.density === 'compact' ? 'compact' : 'cozy');
    setCorkboard(Boolean(data.corkboard));
    if (data.sidebarOpen !== undefined) setSidebarOpen(Boolean(data.sidebarOpen));
    if (data.filtersOpen !== undefined) setFiltersOpen(Boolean(data.filtersOpen));
    prefsLoaded.current = true;
  }), [authUser.uid]);

  function updatePref(patch) {
    if (patch.density !== undefined) setDensity(patch.density);
    if (patch.corkboard !== undefined) setCorkboard(patch.corkboard);
    if (patch.sidebarOpen !== undefined) setSidebarOpen(patch.sidebarOpen);
    if (patch.filtersOpen !== undefined) setFiltersOpen(patch.filtersOpen);
    if (prefsLoaded.current) saveWorkNotePreferences(authUser.uid, patch).catch(() => {});
  }

  const visible = useMemo(() => notes.filter(note => {
    if (Boolean(note.deleted) !== showDeleted) return false;
    if (isAdmin && ownerFilter !== 'all' && note.ownerUid !== ownerFilter) return false;
    if (view === 'archived' ? !note.archived : note.archived) return false;
    if (view === 'today' && !isToday(note.createdAt || note.updatedAt)) return false;
    if (view === 'pending' && note.type !== 'pending') return false;
    if (view === 'ideas' && note.type !== 'idea') return false;
    if (type !== 'all' && note.type !== type) return false;
    if (priority !== 'all' && note.priority !== priority) return false;
    if (tag && !(note.tags || []).includes(tag)) return false;
    const haystack = [note.title, note.content, note.category, ...(note.tags || []), ...(note.checklist || [])].join(' ').toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  }).sort((a, b) => {
    const pinned = Number(b.pinned) - Number(a.pinned);
    if (pinned) return pinned;
    if (sort === 'priority-desc') return priorityWeight(b.priority) - priorityWeight(a.priority);
    if (sort === 'due-asc') return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
    if (sort === 'title-asc') return a.title.localeCompare(b.title, 'es');
    const delta = noteMillis(b) - noteMillis(a);
    return sort === 'updated-asc' ? -delta : delta;
  }), [notes, view, search, type, priority, tag, sort, showDeleted, isAdmin, ownerFilter]);

  const owners = useMemo(() => [...new Map(notes.map(note => [note.ownerUid, { uid: note.ownerUid, name: note.ownerName || note.ownerEmail }])).values()]
    .filter(item => item.uid).sort((a, b) => a.name.localeCompare(b.name, 'es')), [notes]);

  const counts = {
    all: notes.filter(n => !n.deleted && !n.archived).length,
    today: notes.filter(n => !n.deleted && !n.archived && isToday(n.createdAt || n.updatedAt)).length,
    pending: notes.filter(n => !n.deleted && !n.archived && n.type === 'pending').length,
    ideas: notes.filter(n => !n.deleted && !n.archived && n.type === 'idea').length,
    archived: notes.filter(n => !n.deleted && n.archived).length
  };

  async function persist(note) {
    setBusy(true); setError('');
    try { await saveWorkNote(note, { uid: note.ownerUid || authUser.uid, email: note.ownerEmail || authUser.email, name: note.ownerName || userName, actorUid: authUser.uid, actorName: userName }); setDraft(null); setQuick(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(note) {
    if (!window.confirm(`¿Eliminar "${note.title}"?`)) return;
    await softDeleteWorkNote(note.id, { uid: authUser.uid, email: authUser.email, name: userName });
    setDraft(null);
  }

  function exportNotes() {
    const blob = new Blob([JSON.stringify({ notes, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob); link.download = `notas-musicala-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importNotes(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : data.notes;
      if (!Array.isArray(rows)) throw new Error('El respaldo no contiene notas.');
      for (const row of rows) await saveWorkNote({ ...row, id: undefined }, authUser);
    } catch (err) { setError(err.message); }
    event.target.value = '';
  }

  return (
    <div className={`work-notes notes-theme-${theme} density-${density} ${sidebarOpen ? '' : 'sidebar-collapsed'} ${corkboard ? 'corkboard' : ''}`}>
      <aside className="notes-sidebar">
        <div className="notes-brand"><StickyNote size={28} /><div><small>Musicala</small><strong>Notas al vuelo</strong></div></div>
        <button className="notes-primary" onClick={() => setDraft({ ...EMPTY })}><Plus size={18} /> Post-it nuevo</button>
        <nav>{VIEWS.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={17} /><span>{label}</span><b>{counts[id]}</b></button>)}</nav>
        <section className="notes-tags"><small>Etiquetas sugeridas</small><div>{['urgente','reunión','docentes','pagos','marketing','idea'].map(item => <button key={item} className={tag === item ? 'active' : ''} onClick={() => setTag(tag === item ? '' : item)}>{item}</button>)}</div></section>
        <div className="notes-profile"><div className="notes-avatar">{initials(userName)}</div><div><small>Mi bitácora</small><strong>{userName}</strong></div><button onClick={() => setSettingsOpen(true)}>Ajustes</button></div>
      </aside>

      <section className="notes-main">
        <header className="notes-heading"><div className="notes-heading-left"><button className="notes-icon-btn" title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'} onClick={() => updatePref({ sidebarOpen: !sidebarOpen })}>{sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button><div><h1>Hola, {firstName(userName)}</h1><p>Ideas, pendientes y recordatorios sincronizados en Firestore.</p></div></div><div className="notes-heading-actions"><button className={`notes-icon-btn ${density === 'compact' ? 'active' : ''}`} title="Alternar densidad de post-its" onClick={() => updatePref({ density: density === 'compact' ? 'cozy' : 'compact' })}><LayoutGrid size={18} /> {density === 'compact' ? 'Cómodo' : 'Compacto'}</button><button className={`notes-icon-btn ${filtersOpen ? 'active' : ''}`} title="Filtros y opciones" onClick={() => updatePref({ filtersOpen: !filtersOpen })}><SlidersHorizontal size={18} /> Filtros</button><button className="notes-primary" onClick={() => setDraft({ ...EMPTY })}><Plus size={18} /> Post-it</button></div></header>
        <div className="quick-note"><textarea value={quick} onChange={e => setQuick(e.target.value)} placeholder="Escribe una nota rápida..." /><button disabled={!quick.trim() || busy} onClick={() => persist({ ...EMPTY, title: quick.slice(0, 55), content: quick })}>Guardar</button></div>
        {filtersOpen && <div className="notes-filters-panel">
        <div className="notes-toolbar"><label><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título, contenido o etiqueta..." /></label><select value={type} onChange={e => setType(e.target.value)}><option value="all">Todos los tipos</option><option value="quick">Nota rápida</option><option value="pending">Pendiente</option><option value="idea">Idea</option><option value="log">Bitácora</option></select><select value={priority} onChange={e => setPriority(e.target.value)}><option value="all">Todas las prioridades</option><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select><select value={sort} onChange={e => setSort(e.target.value)}><option value="updated-desc">Más recientes</option><option value="updated-asc">Más antiguas</option><option value="priority-desc">Prioridad alta</option><option value="due-asc">Fecha límite</option><option value="title-asc">Título A-Z</option></select>{isAdmin && <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="all">Todo el equipo</option>{owners.map(owner => <option key={owner.uid} value={owner.uid}>{owner.name}</option>)}</select>}{isAdmin && <label className="deleted-toggle"><input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Ver eliminadas</label>}</div>
        <div className="notes-summary"><article><small>Total notas</small><strong>{notes.length}</strong></article><article><small>Pendientes</small><strong>{counts.pending}</strong></article><article><small>Ideas</small><strong>{counts.ideas}</strong></article><article><small>Archivadas</small><strong>{counts.archived}</strong></article></div>
        <div className="notes-utility"><label className="deleted-toggle"><input type="checkbox" checked={corkboard} onChange={e => updatePref({ corkboard: e.target.checked })} /> Fondo de corcho</label><button onClick={exportNotes}><Download size={16} /> Exportar respaldo</button><button onClick={() => importRef.current?.click()}><Upload size={16} /> Importar respaldo</button><input ref={importRef} hidden type="file" accept=".json,application/json" onChange={importNotes} /></div>
        </div>}
        {error && <p className="notes-error">{error}</p>}
        <div className="notes-section-head"><div><small>Tablero</small><h2>{VIEWS.find(item => item[0] === view)?.[1]}</h2></div></div>
        {visible.length ? <div className="postit-grid">{visible.map(note => <article key={note.id} className={`postit ${note.type} priority-${note.priority} ${note.deleted ? 'deleted' : ''}`} onClick={() => !note.deleted && setDraft({ ...EMPTY, ...note })}><div className="postit-top"><span>{typeLabel(note.type)}</span>{note.pinned && <b>Fijada</b>}</div>{isAdmin && <div className="postit-owner">{note.ownerName || note.ownerEmail}</div>}<h3>{note.title}</h3>{note.category && <small>{note.category}</small>}<p>{note.content}</p>{note.checklist?.length > 0 && <em>{note.checklist.length} tareas en checklist</em>}<div className="postit-tags">{note.tags?.map(tag => <span key={tag}>#{tag}</span>)}</div>{note.deleted && <strong>Eliminada por {note.deletedByName || 'usuario'}</strong>}<footer><span>{note.dueDate || 'Sin fecha límite'}</span>{!note.deleted && <div><button title="Archivar" onClick={e => { e.stopPropagation(); persist({ ...note, archived: !note.archived }); }}><Archive size={15} /></button><button title="Duplicar" onClick={e => { e.stopPropagation(); persist({ ...note, id: undefined, ownerUid: undefined, ownerEmail: undefined, ownerName: undefined, title: `${note.title} (copia)`, pinned: false }); }}><Copy size={15} /></button></div>}</footer></article>)}</div> : <div className="notes-empty"><StickyNote size={42} /><h3>No hay notas aquí</h3><p>Crea un post-it para empezar tu bitácora.</p><button className="notes-primary" onClick={() => setDraft({ ...EMPTY })}>Crear primera nota</button></div>}
      </section>
      {draft && <NoteModal note={draft} busy={busy} onClose={() => setDraft(null)} onSave={persist} onDelete={draft.id ? () => remove(draft) : null} />}
      {settingsOpen && <div className="notes-modal"><div className="notes-modal-backdrop" onClick={() => setSettingsOpen(false)} /><form className="notes-modal-panel notes-settings" onSubmit={async e => { e.preventDefault(); await saveWorkNotePreferences(authUser.uid, { theme }); setSettingsOpen(false); }}><header><div><small>Configuración</small><h2>Tu perfil de notas</h2></div><button type="button" onClick={() => setSettingsOpen(false)}><X /></button></header><label>Nombre<input value={userName} disabled /></label><label>Tema visual<select value={theme} onChange={e => setTheme(e.target.value)}><option value="violeta">Violeta Musicala</option><option value="azul">Azul Musicala</option><option value="magenta">Magenta Musicala</option><option value="verde">Verde suave</option></select></label><footer><span /><div><button type="button" onClick={() => setSettingsOpen(false)}>Cancelar</button><button className="notes-primary">Guardar cambios</button></div></footer></form></div>}
    </div>
  );
}

function NoteModal({ note, busy, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(note);
  const field = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <div className="notes-modal"><div className="notes-modal-backdrop" onClick={onClose} /><form className="notes-modal-panel" onSubmit={e => { e.preventDefault(); onSave(form); }}><header><div><small>Editor de nota</small><h2>{form.id ? 'Editar post-it' : 'Nueva nota'}</h2></div><button type="button" onClick={onClose}><X /></button></header><label>Título<input required maxLength="120" value={form.title} onChange={e => field('title', e.target.value)} /></label><div className="notes-form-grid"><label>Tipo<select value={form.type} onChange={e => field('type', e.target.value)}><option value="quick">Nota rápida</option><option value="pending">Pendiente</option><option value="idea">Idea</option><option value="log">Bitácora</option></select></label><label>Prioridad<select value={form.priority} onChange={e => field('priority', e.target.value)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label></div><label>Categoría<input value={form.category} onChange={e => field('category', e.target.value)} /></label><label>Etiquetas<input value={(form.tags || []).join(', ')} onChange={e => field('tags', e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="urgente, reunión, docentes" /></label><div className="notes-form-grid"><label>Fecha límite<input type="date" value={form.dueDate} onChange={e => field('dueDate', e.target.value)} /></label><label>Recordatorio<input type="datetime-local" value={form.reminderAt} onChange={e => field('reminderAt', e.target.value)} /></label></div><label>Contenido<textarea required rows="7" value={form.content} onChange={e => field('content', e.target.value)} /></label><label>Checklist<textarea rows="4" value={(form.checklist || []).join('\n')} onChange={e => field('checklist', e.target.value.split('\n').map(x => x.trim()).filter(Boolean))} placeholder="Una tarea por línea" /></label><div className="notes-toggles"><label><input type="checkbox" checked={form.pinned} onChange={e => field('pinned', e.target.checked)} /> Fijar esta nota</label><label><input type="checkbox" checked={form.archived} onChange={e => field('archived', e.target.checked)} /> Guardar como archivada</label></div><footer>{onDelete ? <button type="button" className="notes-danger" onClick={onDelete}>Eliminar</button> : <span />}<div><button type="button" onClick={onClose}>Cancelar</button><button className="notes-primary" disabled={busy}>Guardar nota</button></div></footer></form></div>;
}

function isToday(value) { const date = value?.toDate ? value.toDate() : new Date(value); const now = new Date(); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate(); }
function initials(name = '') { return name.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'U'; }
function firstName(name = '') { return name.split(/\s+/)[0] || 'Usuario'; }
function typeLabel(type) { return ({ quick: 'Nota rápida', pending: 'Pendiente', idea: 'Idea', log: 'Bitácora' })[type] || 'Nota'; }
function priorityWeight(value) { return ({ alta: 3, media: 2, baja: 1 })[value] || 0; }
function noteMillis(note) { const value = note.updatedAt || note.createdAt; return value?.toMillis ? value.toMillis() : new Date(value || 0).getTime(); }
