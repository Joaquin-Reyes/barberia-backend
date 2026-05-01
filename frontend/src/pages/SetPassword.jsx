import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);
  const [tokenValido, setTokenValido] = useState(null); // null = verificando

  // Capturar los params del hash en el primer render sincrónico, antes de que
  // Supabase (detectSessionInUrl) los procese y limpie el URL hash.
  const [initialHash] = useState(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
      accessToken: params.get("access_token"),
      refreshToken: params.get("refresh_token") || "",
      type: params.get("type"),
    };
  });

  const [esRecovery] = useState(() => initialHash.type === "recovery");

  const [inviteToken] = useState(
    () => (initialHash.type === "invite" ? initialHash.accessToken : null)
  );

  useEffect(() => {
    const { accessToken, refreshToken, type } = initialHash;

    if (!accessToken || (type !== "invite" && type !== "recovery")) {
      // Sin params de invitación — verificar si hay sesión existente
      supabase.auth.getSession().then(({ data: { session } }) => {
        setTokenValido(!!session);
      });
      return;
    }

    // Siempre llamar setSession explícitamente con el token capturado.
    // Supabase puede haber procesado el hash automáticamente (detectSessionInUrl)
    // pero esa sesión implícita no siempre tiene el estado correcto para updateUser.
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        setTokenValido(!error);
      });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    const { data: updateData, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }

    // Siempre intentar activar la cuenta — activarCuenta es idempotente:
    // si el usuario ya existe en 'usuarios', devuelve ok sin hacer nada.
    // Esto cubre tanto el flujo invite como recovery (Supabase puede enviar
    // recovery en lugar de invite si el usuario ya confirmó su cuenta antes).
    {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const token = updateData?.session?.access_token
        || currentSession?.access_token
        || inviteToken;

      if (token) {
        const activarRes = await fetch("https://barberia-backend-production-7dae.up.railway.app/auth/activar", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!activarRes.ok) {
          const body = await activarRes.json().catch(() => ({}));
          console.error("activar failed:", body);
          // Solo bloquear si NO es un reset de contraseña para un usuario ya activo
          if (!esRecovery) {
            setError("No se pudo activar la cuenta. Pedile al admin que reenvíe la invitación.");
            return;
          }
        }
      }
    }

    setExito(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 3000);
  }

  if (tokenValido === null) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <p className="text-neutral-400">Verificando invitación...</p>
      </div>
    );
  }

  if (!tokenValido) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="bg-neutral-900 p-8 rounded-xl text-center max-w-sm w-full">
          <AlertTriangle size={28} className="mx-auto mb-3 text-yellow-400" />
          <p className="font-semibold mb-1">Link inválido o expirado</p>
          <p className="text-sm text-neutral-400">Pedile al administrador que reenvíe la invitación.</p>
        </div>
      </div>
    );
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="bg-neutral-900 p-8 rounded-xl text-center max-w-sm w-full">
          <CheckCircle size={28} className="mx-auto mb-3 text-green-400" />
          <p className="font-semibold mb-1">
            {esRecovery ? "Contraseña actualizada" : "Contraseña establecida"}
          </p>
          <p className="text-sm text-neutral-400">Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
      <div className="bg-neutral-900 p-8 rounded-xl w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">
          {esRecovery ? "Nueva contraseña" : "Establecé tu contraseña"}
        </h1>
        <p className="text-sm text-neutral-400 mb-6">
          {esRecovery ? "Ingresá tu nueva contraseña." : "Ingresá una contraseña para activar tu cuenta."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            className="input"
            required
          />

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button type="submit" className="bg-blue-600 hover:bg-blue-700 py-2 rounded font-medium mt-1">
            Activar cuenta
          </button>
        </form>
      </div>
    </div>
  );
}
