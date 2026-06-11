import { normalizeText } from './normalize';

export function detectDelimiter(line) {
  const candidates = ['\t', ';', ','];
  let best = ',';
  let bestCount = -1;
  for (const delimiter of candidates) {
    const count = (line.match(new RegExp(delimiter === '\t' ? '\\t' : `\\${delimiter}`, 'g')) || []).length;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function parseCSV(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) return [];
  const delimiter = detectDelimiter(raw.split(/\r?\n/)[0] || '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => normalizeText(value))) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some(value => normalizeText(value))) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeText);
  return rows.slice(1).map(values => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header || `col_${index + 1}`] = normalizeText(values[index]);
    });
    return obj;
  });
}

export async function parseFile(file) {
  const text = await file.text();
  const name = file.name.toLowerCase();
  if (name.endsWith('.json')) {
    return JSON.parse(text);
  }
  return parseCSV(text);
}
