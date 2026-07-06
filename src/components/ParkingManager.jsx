import { useMemo, useState } from 'react';
import { Bike, ParkingSquare } from 'lucide-react';
import {
  assignSpot,
  releaseSpot
} from '../services/parkingService';
import { normalizeText } from '../utils/normalize';

export default function ParkingManager({ spots, currentUserName, canManage }) {
  const [selected, setSelected] = useState(null);
  const [nameDraft, setNameDraft] = useState('');
  const [plateDraft, setPlateDraft] = useState('');
  const [motoTypeDraft, setMotoTypeDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const motos = useMemo(() => spots.filter(s => s.type === 'moto'), [spots]);
  const bikes = useMemo(() => spots.filter(s => s.type === 'cicla'), [spots]);
  const occupiedCount = useMemo(
    () => spots.filter(s => normalizeText(s.name)).length,
    [spots]
  );

  function openSpot(spot) {
    setSelected(spot);
    setNameDraft(spot.name || '');
    setPlateDraft(spot.plate || '');
    setMotoTypeDraft(spot.motoType || '');
    setMessage('');
  }

  function closeModal() {
    setSelected(null);
    setNameDraft('');
    setPlateDraft('');
    setMotoTypeDraft('');
  }

  async function handleAssign() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await assignSpot(
        selected.type,
        selected.number,
        { name: nameDraft, plate: plateDraft, motoType: motoTypeDraft },
        currentUserName
      );
      closeModal();
    } catch (error) {
      setMessage(error.message || 'No se pudo asignar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      await releaseSpot(selected.type, selected.number, currentUserName);
      closeModal();
    } catch (error) {
      setMessage(error.message || 'No se pudo liberar.');
    } finally {
      setBusy(false);
    }
  }

  function renderCards(list, Icon, label) {
    return (
      <div className="lockers-grid">
        {list.map(spot => {
          const occupied = Boolean(normalizeText(spot.name));
          return (
            <button
              key={spot.id}
              className={`locker-card ${occupied ? 'occupied' : 'free'}`}
              onClick={() => canManage && openSpot(spot)}
              disabled={!canManage}
            >
              <span className="locker-number">
                <Icon size={16} />
                {label} {spot.number}
              </span>
              <span className="locker-name">{occupied ? spot.name : 'Disponible'}</span>
              {occupied && spot.type === 'moto' && (spot.plate || spot.motoType) && (
                <span className="parking-meta">
                  {[spot.plate, spot.motoType].filter(Boolean).join(' · ')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const isMoto = selected?.type === 'moto';

  return (
    <div className="lockers-module">
      <div className="module-header">
        <ParkingSquare size={22} />
        <div>
          <h2>Parqueadero</h2>
          <p className="muted">{occupiedCount} de {spots.length} ocupados</p>
        </div>
      </div>

      <div className="parking-section">
        <h3 className="parking-title"><ParkingSquare size={16} /> Motos</h3>
        {renderCards(motos, ParkingSquare, 'Moto')}
      </div>

      <div className="parking-section">
        <h3 className="parking-title"><Bike size={16} /> Ciclas</h3>
        {renderCards(bikes, Bike, 'Cicla')}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && closeModal()}>
          <div className="modal-card lockers-modal">
            <div className="modal-header">
              {isMoto ? <ParkingSquare size={20} /> : <Bike size={20} />}
              <h2>{isMoto ? 'Moto' : 'Cicla'} {selected.number}</h2>
            </div>
            <input
              autoFocus
              value={nameDraft}
              onChange={event => setNameDraft(event.target.value)}
              onKeyDown={event => event.key === 'Enter' && !isMoto && handleAssign()}
              placeholder="Nombre"
            />
            {isMoto && (
              <>
                <input
                  value={plateDraft}
                  onChange={event => setPlateDraft(event.target.value)}
                  placeholder="Placa"
                />
                <input
                  value={motoTypeDraft}
                  onChange={event => setMotoTypeDraft(event.target.value)}
                  placeholder="Tipo de moto (marca / modelo)"
                />
              </>
            )}
            {message && <p className="form-message">{message}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={closeModal} disabled={busy}>Cerrar</button>
              <button
                className="btn danger"
                onClick={handleRelease}
                disabled={busy || !normalizeText(selected.name)}
              >
                Liberar
              </button>
              <button className="btn primary" onClick={handleAssign} disabled={busy}>Asignar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
