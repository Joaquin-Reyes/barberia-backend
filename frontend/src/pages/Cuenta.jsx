import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "-";
  }
}

function roleLabel(role) {
  const labels = {
    admin: "Administrador",
    barbero: "Barbero",
    superadmin: "Superadmin",
  };
  return labels[role] || role || "-";
}

function InfoRow({ label, value }) {
  return (
    <div className="account-info-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function Cuenta({ user, onLogout }) {
  const [usuario, setUsuario] = useState(user || null);
  const [authUser, setAuthUser] = useState(null);
  const [barberia, setBarberia] = useState(null);
  const [barbero, setBarbero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sendingReset, setSendingReset] = useState(false);
  const [toast, setToast] = useState(null);

  const displayUser = usuario || user;
  const initial = useMemo(() => {
    const source = displayUser?.nombre || displayUser?.email || "U";
    return source.trim().charAt(0).toUpperCase();
  }, [displayUser]);

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const cargarCuenta = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [{ data: sessionData }, { data: usuarioData }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.from("usuarios").select("*").eq("id", user.id).maybeSingle(),
    ]);

    const nextUsuario = usuarioData || user;
    setUsuario(nextUsuario);
    setAuthUser(sessionData?.session?.user || null);

    if (nextUsuario?.barberia_id) {
      const { data: barberiaData } = await supabase
        .from("barberias")
        .select("id, nombre, telefono_admin, whatsapp_number, activo")
        .eq("id", nextUsuario.barberia_id)
        .maybeSingle();
      setBarberia(barberiaData || null);
    } else {
      setBarberia(null);
    }

    if (nextUsuario?.rol === "barbero") {
      const { data: barberoData } = await supabase
        .from("barberos")
        .select("id, nombre, activo")
        .eq("usuario_id", nextUsuario.id)
        .maybeSingle();
      setBarbero(barberoData || null);
    } else {
      setBarbero(null);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    cargarCuenta();
  }, [cargarCuenta]);

  async function enviarCambioPassword() {
    const email = displayUser?.email;
    if (!email) {
      mostrarToast("No encontramos un email para esta cuenta", "error");
      return;
    }

    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setSendingReset(false);

    if (error) {
      mostrarToast("No se pudo enviar el email de recuperacion", "error");
      return;
    }
    mostrarToast("Te enviamos un email para cambiar la contrasena");
  }

  return (
    <div className="account-page">
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      <div className="topbar account-topbar">
        <div>
          <h1>Mi cuenta</h1>
          <p>Datos de acceso, permisos y acciones de seguridad.</p>
        </div>
        <button
          type="button"
          className="account-secondary-button"
          onClick={cargarCuenta}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Actualizar
        </button>
      </div>

      <div className="page-content account-content">
        <section className="account-profile">
          <div className="account-avatar" aria-hidden="true">{initial}</div>
          <div className="account-profile-main">
            <span>{roleLabel(displayUser?.rol)}</span>
            <h2>{displayUser?.nombre || barbero?.nombre || displayUser?.email || "Usuario"}</h2>
            <p>{displayUser?.email || "Sin email registrado"}</p>
          </div>
          <span className={`estado ${barberia?.activo === false ? "cancelado" : "completado"}`}>
            {barberia?.activo === false ? "Barberia inactiva" : "Cuenta activa"}
          </span>
        </section>

        <div className="account-grid">
          <section className="account-panel">
            <div className="account-panel-title">
              <UserCircle size={17} />
              <h2>Perfil</h2>
            </div>
            {loading ? (
              <p className="account-muted">Cargando datos...</p>
            ) : (
              <div className="account-info-list">
                <InfoRow label="Nombre visible" value={displayUser?.nombre || barbero?.nombre} />
                <InfoRow label="Email" value={displayUser?.email} />
                <InfoRow label="Rol" value={roleLabel(displayUser?.rol)} />
                <InfoRow label="ID de usuario" value={displayUser?.id} />
              </div>
            )}
          </section>

          <section className="account-panel">
            <div className="account-panel-title">
              <Building2 size={17} />
              <h2>Negocio asociado</h2>
            </div>
            {loading ? (
              <p className="account-muted">Cargando negocio...</p>
            ) : (
              <div className="account-info-list">
                <InfoRow label="Barberia" value={barberia?.nombre} />
                <InfoRow label="Telefono admin" value={barberia?.telefono_admin} />
                <InfoRow label="WhatsApp" value={barberia?.whatsapp_number} />
                <InfoRow label="Estado" value={barberia?.activo === false ? "Inactiva" : "Activa"} />
              </div>
            )}
          </section>

          <section className="account-panel">
            <div className="account-panel-title">
              <ShieldCheck size={17} />
              <h2>Acceso y permisos</h2>
            </div>
            <div className="account-permissions">
              <div>
                <CheckCircle2 size={15} />
                <span>Puede ingresar al panel</span>
              </div>
              {displayUser?.rol !== "barbero" && (
                <div>
                  <CheckCircle2 size={15} />
                  <span>Puede administrar turnos y configuracion</span>
                </div>
              )}
              {displayUser?.rol === "barbero" && (
                <div>
                  <CheckCircle2 size={15} />
                  <span>Acceso al panel operativo de barbero</span>
                </div>
              )}
            </div>
            <div className="account-info-list compact">
              <InfoRow label="Sesion iniciada como" value={authUser?.email || displayUser?.email} />
              <InfoRow label="Cuenta creada" value={formatDate(authUser?.created_at)} />
            </div>
          </section>

          <section className="account-panel">
            <div className="account-panel-title">
              <KeyRound size={17} />
              <h2>Seguridad</h2>
            </div>
            <p className="account-muted">
              El cambio de contrasena se confirma por email para mantener segura la cuenta.
            </p>
            <div className="account-actions">
              <button type="button" onClick={enviarCambioPassword} disabled={sendingReset}>
                <Mail size={15} />
                {sendingReset ? "Enviando..." : "Enviar link de cambio"}
              </button>
              <button type="button" className="account-danger-button" onClick={onLogout}>
                <LogOut size={15} />
                Cerrar sesion
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
