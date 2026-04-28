import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(false);
  const [tokenValido, setTokenValido] = useState(null); // null = verificando

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token") || "";
    const type = params.get("type");

    if (!accessToken || type !== "invite") {
      setTokenValido(false);
      return;
    }

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

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      return;
    }

    // Crear el registro en usuarios si es un barbero invitado
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await fetch("https://barberia-backend-production-7dae.up.railway.app/auth/activar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
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
          <p className="text-2xl mb-2">⚠️</p>
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
          <p className="text-2xl mb-2">✅</p>
          <p className="font-semibold mb-1">Contraseña establecida</p>
          <p className="text-sm text-neutral-400">Redirigiendo al login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
      <div className="bg-neutral-900 p-8 rounded-xl w-full max-w-sm">
        <h1 className="text-xl font-bold mb-1">Establecé tu contraseña</h1>
        <p className="text-sm text-neutral-400 mb-6">Ingresá una contraseña para activar tu cuenta.</p>

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
