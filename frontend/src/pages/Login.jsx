import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setError(null);

    // 🔐 LOGIN SUPABASE
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usuario,
      password: password,
    });

    if (error) {
      console.error(error);
      setError("Credenciales incorrectas");
      return;
    }

    // 🔥 GUARDAR TOKEN (CLAVE PARA EL BACKEND)
    const token = data.session.access_token;
    localStorage.setItem("token", token);

    // 🔥 TRAER USUARIO DE TU DB
    const { data: usuarioDB, error: errorDB } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (errorDB) {
      console.error(errorDB);
      setError("Error obteniendo usuario");
      return;
    }

    // 👑 SI ES SUPERADMIN → NO VALIDAR BARBERÍA
    if (usuarioDB.rol !== "superadmin") {
      const { data: barberia, error: errorBarberia } = await supabase
        .from("barberias")
        .select("*")
        .eq("id", usuarioDB.barberia_id)
        .single();

      if (errorBarberia) {
        console.error(errorBarberia);
        setError("Error verificando barbería");
        return;
      }

      if (!barberia.activo) {
        setError("Esta barbería está deshabilitada ❌");
        return;
      }
    }

    // ✅ LOGIN OK
    onLogin(usuarioDB);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 text-white">
      <div className="bg-neutral-900 p-6 rounded-2xl w-80">
        <h2 className="text-xl mb-4 font-bold text-center">🔐 Login</h2>

        <input
          placeholder="Email"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="w-full mb-3 bg-white p-2 rounded-xl text-gray-900 placeholder-gray-400"
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 bg-white p-2 rounded-xl text-gray-900 placeholder-gray-400"
        />

        {error && (
          <p className="text-red-400 text-sm mb-2">{error}</p>
        )}

        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 py-2 rounded-xl"
        >
          Ingresar
        </button>
      </div>
    </div>
  );
}