import { createClient } from '@supabase/supabase-js'

// 🔥 CONFIG SUPABASE (usar ANON PUBLIC KEY)
const supabaseUrl = 'https://uqqhiwnfjpfqikcfykfr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxcWhpd25manBmcWlrY2Z5a2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjQyNjksImV4cCI6MjA4OTkwMDI2OX0.e44LZF1eMzcqtwLmfVSRP5w2ak2ufK6r6Tr42BzQT8I' // 👈 CAMBIAR ESTO

export const supabase = createClient(supabaseUrl, supabaseKey)


// ==============================
// 🔐 AUTH
// ==============================

// 👉 LOGIN REAL CON SUPABASE
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Error login:", error.message);
    return null;
  }

  localStorage.setItem("token", data.session.access_token);

  return data;
}

// Devuelve siempre un access_token válido.
// Intenta primero la sesión activa del cliente Supabase (que puede haberse
// auto-refrescado); si no hay sesión cae al token guardado manualmente en
// localStorage para no romper sesiones donde Supabase perdió su estado.
export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? localStorage.getItem("token") ?? null;
}


// ==============================
// 📅 TURNOS
// ==============================

// 👉 GUARDAR TURNO
export async function guardarTurno(turno) {
  const { error } = await supabase
    .from('turnos')
    .insert([turno])

  if (error) {
    console.log("Error guardando:", error)
    return false
  }

  return true
}

// 👉 VALIDAR DISPONIBILIDAD
export async function turnoDisponible(fecha, hora, barbero) {
  const { data, error } = await supabase
    .from("turnos")
    .select("*")
    .eq("hora", hora)
    .eq("barbero", barbero)
    .eq("fecha", fecha);

  if (error) {
    console.error("Error verificando turno:", error);
    return false;
  }

  return (data || []).length === 0;
}