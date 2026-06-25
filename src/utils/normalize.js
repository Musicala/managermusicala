export const ROLES = {
  ADMIN: 'admin',
  ASISTENTE: 'asistente',
  DOCENTE: 'docente'
};

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const ROLE_LABELS = {
  admin: 'Dirección',
  asistente: 'Asistente',
  docente: 'Docente'
};

// Areas de las asistentes. Funcionalmente todas son rol "asistente";
// el area solo cambia la etiqueta/titulo que se muestra.
export const AREAS = {
  ADMIN: 'admin',
  COMERCIAL: 'comercial'
};

export const AREA_LABELS = {
  admin: 'Asistente administrativa',
  comercial: 'Asistente comercial'
};

export function normalizeArea(value) {
  const key = normalizeKey(value);
  if (key.includes('comercial') || key.includes('venta')) return AREAS.COMERCIAL;
  if (key.includes('admin')) return AREAS.ADMIN;
  return key === AREAS.COMERCIAL ? AREAS.COMERCIAL : AREAS.ADMIN;
}

export const BUTTON_SECTION_OPTIONS = [
  'Académico',
  'Operación',
  'Admin',
  'Comercial',
  'Finanzas',
  'Comunicación',
  'Recursos',
  'Otros'
];

export function normalizeText(value) {
  return String(value ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function buildAssistantIdentityKeys(value) {
  if (!value) return [];
  if (typeof value === 'string') return [normalizeKey(value)].filter(Boolean);

  const fields = [
    value.email,
    value.displayName,
    value.name,
    value.assistantName,
    value.assistantUsername,
    value.username,
    value.legacyUsername
  ];

  return [...new Set(fields.map(normalizeKey).filter(Boolean))];
}

export function scheduleItemMatchesAssistant(item, assistantIdentity) {
  const assistantKeys = buildAssistantIdentityKeys(assistantIdentity);
  if (!assistantKeys.length) return false;

  const itemKeys = [
    item?.assistantEmail,
    item?.assistantName,
    item?.email,
    item?.name,
    item?.username,
    item?.assistantUsername,
    item?.asistente,
    item?.correo
  ].map(normalizeKey).filter(Boolean);

  return itemKeys.some(key => assistantKeys.includes(key));
}

export function slugify(value) {
  const base = normalizeKey(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `item-${Date.now()}`;
}

export function normalizeRole(value) {
  const key = normalizeKey(value);
  if (key.includes('admin')) return ROLES.ADMIN;
  if (key.includes('asistente')) return ROLES.ASISTENTE;
  if (key.includes('docente')) return ROLES.DOCENTE;
  return key || ROLES.DOCENTE;
}

export function normalizeButtonSection(value, options = BUTTON_SECTION_OPTIONS) {
  const key = normalizeKey(value);
  if (!key) return 'Otros';
  const sectionOptions = Array.isArray(options) && options.length ? options : BUTTON_SECTION_OPTIONS;

  const aliases = {
    academico: 'Académico',
    academia: 'Académico',
    clases: 'Académico',
    operacion: 'Operación',
    operativo: 'Operación',
    operaciones: 'Operación',
    admin: 'Admin',
    administrativo: 'Admin',
    administracion: 'Admin',
    comercial: 'Comercial',
    ventas: 'Comercial',
    finanzas: 'Finanzas',
    pagos: 'Finanzas',
    contabilidad: 'Finanzas',
    comunicacion: 'Comunicación',
    comunicaciones: 'Comunicación',
    recursos: 'Recursos',
    material: 'Recursos',
    materiales: 'Recursos',
    otros: 'Otros',
    general: 'Otros'
  };

  if (aliases[key]) return aliases[key];
  return sectionOptions.find(section => normalizeKey(section) === key)
    || BUTTON_SECTION_OPTIONS.find(section => normalizeKey(section) === key)
    || 'Otros';
}

export function normalizeButtonSections(value) {
  const source = Array.isArray(value) ? value : BUTTON_SECTION_OPTIONS;
  const sections = source
    .map(normalizeText)
    .filter(Boolean);
  const unique = [];
  sections.forEach(section => {
    if (!unique.some(item => normalizeKey(item) === normalizeKey(section))) unique.push(section);
  });
  if (!unique.some(section => normalizeKey(section) === 'otros')) unique.push('Otros');
  return unique.length ? unique : BUTTON_SECTION_OPTIONS;
}

export function normalizeDay(value) {
  const key = normalizeKey(value);
  const map = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
    domingo: 'Domingo'
  };
  return map[key] || normalizeText(value);
}

export function normalizeButtonAccess(value) {
  const text = normalizeText(value);
  if (!text) return [];
  if (text === '*') return ['*'];
  return text
    .split(/[,;\n]+/)
    .map(normalizeText)
    .filter(Boolean);
}

export function parseBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const key = normalizeKey(value);
  if (!key) return fallback;
  if (['si', 'sí', 'true', 'activo', 'active', '1', 'yes'].includes(key)) return true;
  if (['no', 'false', 'inactivo', 'inactive', '0'].includes(key)) return false;
  return fallback;
}

export function emailKey(email) {
  return normalizeText(email).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function getInitials(nameOrEmail) {
  const clean = normalizeText(nameOrEmail);
  if (!clean) return 'MM';
  const parts = clean.split(/[\s@.]+/).filter(Boolean).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase()).join('') || 'MM';
}

export function pick(row, names) {
  const index = Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [normalizeKey(k), v]));
  for (const name of names) {
    const key = normalizeKey(name);
    if (Object.prototype.hasOwnProperty.call(index, key)) return index[key];
  }
  return '';
}
