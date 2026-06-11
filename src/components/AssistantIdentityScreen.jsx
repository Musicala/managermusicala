import { useEffect, useMemo, useState } from 'react';
import { LogOut, UserCheck } from 'lucide-react';
import { listenAssistantAccounts, resolveAssistantProfile } from '../services/assistantAccountsService';
import { logout } from '../services/authService';

export default function AssistantIdentityScreen({ authUser, onSelect }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => listenAssistantAccounts(setAccounts), []);

  const activeAccounts = useMemo(() => accounts.filter(account => account.active !== false), [accounts]);
  const selected = activeAccounts.find(account => account.id === accountId);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!selected) {
      setError('Elige tu usuario.');
      return;
    }
    if (String(selected.password || '') !== password) {
      setError('Contraseña incorrecta.');
      return;
    }
    const profile = await resolveAssistantProfile(selected, authUser);
    window.sessionStorage.setItem('managerAssistantAccountId', selected.id);
    onSelect(profile);
  }

  return (
    <div className="center-shell">
      <section className="login-card identity-card">
        <div className="card-header">
          <img className="brand-logo-img large" src="/logo.png" alt="Musicala" />
          <div>
            <h2>Elegir usuario</h2>
            <p>Entraste con el correo compartido. Ahora selecciona quien esta trabajando.</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>Usuario</span>
            <select value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {activeAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.displayName || account.username}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Contraseña interna</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {error && <div className="form-error">{error}</div>}
          {!activeAccounts.length && (
            <div className="info-banner">Un admin debe crear los usuarios de asistentes en Configuracion.</div>
          )}
          <button className="btn primary full" disabled={!activeAccounts.length}>
            <UserCheck size={18} /> Entrar como asistente
          </button>
          <button className="btn ghost full" type="button" onClick={logout}>
            <LogOut size={18} /> Cambiar cuenta Google
          </button>
        </form>
      </section>
    </div>
  );
}
