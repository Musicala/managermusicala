import { useState } from 'react';
import { Globe } from 'lucide-react';
import { loginWithGoogle } from '../services/authService';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(readAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-layout">
      <section className="login-hero">
        <div className="hero-badge">
          <img src="/logo.png" alt="Musicala" />
          <span>Musicala</span>
        </div>
        <h1>Musicala Manager</h1>
        <p>
          Panel interno para herramientas, horarios, accesos y gestion operativa.
        </p>
      </section>

      <section className="login-card">
        <div className="card-header">
          <img className="brand-logo-img large" src="/logo.png" alt="Musicala" />
          <div>
            <h2>Ingresar</h2>
            <p>Usa tu cuenta de Google autorizada por Musicala.</p>
          </div>
        </div>

        <div className="login-form">
          {error && <div className="form-error">{error}</div>}

          <button className="btn primary full" onClick={handleGoogleLogin} disabled={loading}>
            <Globe size={18} />
            {loading ? 'Abriendo Google...' : 'Continuar con Google'}
          </button>
        </div>

        <p className="login-note">
          Si es tu primer ingreso, tu perfil quedara pendiente hasta que un administrador lo active.
        </p>
      </section>
    </div>
  );
}

function readAuthError(error) {
  const code = String(error?.code || '');
  if (code.includes('auth/popup-closed-by-user')) return 'Se cerro la ventana de Google antes de completar el ingreso.';
  if (code.includes('auth/popup-blocked')) return 'El navegador bloqueo la ventana de Google. Permite ventanas emergentes e intenta de nuevo.';
  if (code.includes('auth/cancelled-popup-request')) return 'Ya hay una ventana de Google abierta para iniciar sesion.';
  if (code.includes('auth/account-exists-with-different-credential')) return 'Ese correo ya existe con otro metodo de acceso.';
  return error?.message || 'No se pudo completar el acceso.';
}
