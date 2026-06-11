import { ExternalLink, SearchX } from 'lucide-react';
import { normalizeKey } from '../utils/normalize';

export default function ButtonGrid({ buttons, search }) {
  const query = normalizeKey(search);
  const filtered = buttons.filter(button => {
    if (!query) return true;
    return [button.name, button.section, button.type, button.url].some(value => normalizeKey(value).includes(query));
  });

  const sections = filtered.reduce((acc, button) => {
    const section = button.section || 'Otros';
    if (!acc[section]) acc[section] = [];
    acc[section].push(button);
    return acc;
  }, {});

  if (!filtered.length) {
    return (
      <div className="empty-card">
        <SearchX size={34} />
        <h2>No apareció nada</h2>
        <p>Revisa el nombre o los permisos de botones. Las herramientas no se invocan solas, tristemente.</p>
      </div>
    );
  }

  return (
    <div className="sections-stack">
      {Object.entries(sections).map(([section, items]) => (
        <section className="module-card" key={section}>
          <div className="module-header">
            <div>
              <p className="eyebrow">Sección</p>
              <h2>{section}</h2>
            </div>
            <span className="pill">{items.length}</span>
          </div>

          <div className="button-grid">
            {items.map(button => (
              <button key={button.id} className="app-button" onClick={() => openButton(button)}>
                <span className="button-icon">{button.icon || getEmoji(button.name)}</span>
                <span>
                  <strong>{button.name}</strong>
                  <small>{button.type || 'externo'}</small>
                </span>
                <ExternalLink size={17} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function openButton(button) {
  if (!button?.url) return;
  if (button.type === 'interno') {
    window.location.href = button.url;
  } else {
    window.open(button.url, '_blank', 'noopener,noreferrer');
  }
}

function getEmoji(name) {
  const key = normalizeKey(name);
  if (key.includes('clase')) return '🎵';
  if (key.includes('calendario') || key.includes('horario')) return '📅';
  if (key.includes('asistencia')) return '✅';
  if (key.includes('novedad')) return '📝';
  if (key.includes('documento')) return '📁';
  if (key.includes('informe')) return '📊';
  return '✨';
}
