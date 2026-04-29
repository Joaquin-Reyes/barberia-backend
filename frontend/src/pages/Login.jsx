import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Scissors } from "lucide-react";

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState("login"); // "login" | "forgot"
  const [emailReset, setEmailReset] = useState("");
  const [resetEnviado, setResetEnviado] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: usuario,
      password: password,
    });

    if (error) {
      console.error(error);
      setError("Credenciales incorrectas");
      setLoading(false);
      return;
    }

    const token = data.session.access_token;
    localStorage.setItem("token", token);

    const { data: usuarioDB } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!usuarioDB) {
      // El usuario existe en Auth pero no en la tabla usuarios → intentar activar
      try {
        const activarRes = await fetch("https://barberia-backend-production-7dae.up.railway.app/auth/activar", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (activarRes.ok) {
          const { data: usuarioDBRetry } = await supabase
            .from("usuarios")
            .select("*")
            .eq("id", data.user.id)
            .maybeSingle();
          if (usuarioDBRetry) {
            onLogin(usuarioDBRetry);
            return;
          }
        }
      } catch {}
      setError("Tu cuenta no está activada. Pedile al admin que reenvíe la invitación.");
      setLoading(false);
      return;
    }

    if (usuarioDB.rol !== "superadmin") {
      const { data: barberia, error: errorBarberia } = await supabase
        .from("barberias")
        .select("*")
        .eq("id", usuarioDB.barberia_id)
        .single();

      if (errorBarberia) {
        console.error(errorBarberia);
        setError("Error verificando barbería");
        setLoading(false);
        return;
      }

      if (!barberia.activo) {
        setError("Esta barbería está deshabilitada");
        setLoading(false);
        return;
      }
    }

    // Asegurar que barberos.usuario_id esté vinculado (idempotente)
    if (usuarioDB.rol === "barbero") {
      try {
        await fetch("https://barberia-backend-production-7dae.up.railway.app/auth/activar", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    onLogin(usuarioDB);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  const handleForgotPassword = async () => {
    setError(null);
    if (!emailReset) { setError("Ingresá tu email"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailReset, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (error) {
      setError("No se pudo enviar el email. Verificá la dirección.");
    } else {
      setResetEnviado(true);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0F172A' }}
    >
      {/* Card */}
      <div
        style={{
          width: 360,
          background: '#1E293B',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          padding: '32px 28px',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center rounded-xl mb-3"
            style={{ width: 44, height: 44, background: '#2563EB' }}
          >
            <Scissors size={22} color="#ffffff" />
          </div>
          <h1 style={{ color: '#F1F5F9', fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.025em' }}>
            BarberApp
          </h1>
          <p style={{ color: '#475569', fontSize: 13, margin: '4px 0 0' }}>
            Ingresá a tu cuenta
          </p>
        </div>

        {/* Form */}
        {modo === "login" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#94A3B8', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                placeholder="nombre@barberia.com"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  margin: 0,
                  background: '#0F172A',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F1F5F9',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 14,
                  fontFamily: 'Inter, sans-serif',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#2563EB';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.2)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#94A3B8' }}>
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => { setModo("forgot"); setError(null); setEmailReset(usuario); }}
                  style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Inter, sans-serif' }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: '100%',
                  margin: 0,
                  background: '#0F172A',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F1F5F9',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 14,
                  fontFamily: 'Inter, sans-serif',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.target.style.borderColor = '#2563EB';
                  e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.2)';
                }}
                onBlur={e => {
                  e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#F87171', margin: 0, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.2)' }}>
                {error}
              </p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              style={{
                width: '100%',
                margin: '4px 0 0',
                padding: '10px 16px',
                background: loading ? '#1D4ED8' : '#2563EB',
                color: '#ffffff',
                borderRadius: 8,
                border: 'none',
                fontSize: 14,
                fontWeight: 500,
                fontFamily: 'Inter, sans-serif',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.75 : 1,
                transition: 'background 0.15s, opacity 0.15s',
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {resetEnviado ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ fontSize: 14, color: '#34D399', margin: '0 0 8px', fontWeight: 500 }}>
                  Email enviado
                </p>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                  Revisá tu bandeja de entrada y seguí el link para restablecer tu contraseña.
                </p>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 4px' }}>
                  Ingresá tu email y te enviamos un link para restablecer tu contraseña.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#94A3B8', marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="nombre@barberia.com"
                    value={emailReset}
                    onChange={(e) => setEmailReset(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleForgotPassword()}
                    autoFocus
                    style={{
                      width: '100%',
                      margin: 0,
                      background: '#0F172A',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#F1F5F9',
                      borderRadius: 8,
                      padding: '9px 12px',
                      fontSize: 14,
                      fontFamily: 'Inter, sans-serif',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => {
                      e.target.style.borderColor = '#2563EB';
                      e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.2)';
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {error && (
                  <p style={{ fontSize: 13, color: '#F87171', margin: 0, padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 7, border: '1px solid rgba(248,113,113,0.2)' }}>
                    {error}
                  </p>
                )}

                <button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  style={{
                    width: '100%',
                    margin: '4px 0 0',
                    padding: '10px 16px',
                    background: loading ? '#1D4ED8' : '#2563EB',
                    color: '#ffffff',
                    borderRadius: 8,
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 500,
                    fontFamily: 'Inter, sans-serif',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.75 : 1,
                  }}
                >
                  {loading ? 'Enviando...' : 'Enviar link'}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => { setModo("login"); setError(null); setResetEnviado(false); }}
              style={{ fontSize: 13, color: '#475569', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'Inter, sans-serif', textAlign: 'center' }}
            >
              Volver al login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
