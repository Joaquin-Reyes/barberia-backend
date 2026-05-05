import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, MessageCircle, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function WhatsApp({ user }) {
  const [barberia, setBarberia] = useState(null);
  const [wpStatus, setWpStatus] = useState(null);
  const [wpQR, setWpQR] = useState(null);
  const [wpError, setWpError] = useState(null);
  const [toast, setToast] = useState(null);
  const wpPollRef = useRef(null);
  const barberiaId = user?.barberia_id;

  const mostrarToast = useCallback((mensaje, tipo = "success") => {
    setToast({ mensaje, tipo });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const detenerPolling = useCallback(() => {
    if (wpPollRef.current) {
      clearInterval(wpPollRef.current);
      wpPollRef.current = null;
    }
  }, []);

  const traerBarberia = useCallback(async () => {
    const { data } = await supabase
      .from("barberias")
      .select("*")
      .eq("id", barberiaId)
      .single();

    setBarberia(data || null);
    if (data?.whatsapp_mode === "wwebjs") {
      setWpStatus("disabled");
      detenerPolling();
    }
  }, [barberiaId, detenerPolling]);

  function conectarWhatsapp() {
    detenerPolling();
    setWpStatus("disabled");
    setWpQR(null);
    setWpError("WhatsApp Web esta deshabilitado temporalmente");
    mostrarToast("WhatsApp Web esta deshabilitado temporalmente", "error");
  }

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    traerBarberia();
  }, [traerBarberia, user]);

  useEffect(() => detenerPolling, [detenerPolling]);

  const topbarStyle = {
    padding: "14px 24px",
    background: "#ffffff",
    borderBottom: "1px solid #E2E8F0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 10,
  };

  const statusLabel = {
    authenticated: "Conectado",
    qr_pending: "Esperando escaneo",
    loading: "Iniciando",
    initializing: "Inicializando",
    disconnected: "Reconectando",
    auth_failure: "Error de autenticacion",
    disabled: "Deshabilitado",
    error: "Error",
  }[wpStatus] || "Sin conectar";

  const isConnected = wpStatus === "authenticated";
  const isCloudApi = barberia && barberia.whatsapp_mode !== "wwebjs";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && <div className={`toast ${toast.tipo}`}>{toast.mensaje}</div>}

      <div style={topbarStyle}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            WhatsApp
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Conexion del canal de mensajes
          </p>
        </div>
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        <div className="card" style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={17} color="#16A34A" />
              </div>
              <div>
                <h2 style={{ margin: 0 }}>Conexion WhatsApp Web</h2>
                <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748B" }}>
                  {barberia?.whatsapp_number ? `Numero: ${barberia.whatsapp_number}` : "Numero sin configurar"}
                </p>
              </div>
            </div>
            <span
              className={`estado ${isConnected ? "completado" : wpStatus === "error" || wpStatus === "auth_failure" ? "cancelado" : "pendiente"}`}
              style={{ cursor: "default", whiteSpace: "nowrap" }}
            >
              {statusLabel}
            </span>
          </div>

          {isCloudApi && (
            <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8 }}>
              <AlertTriangle size={17} color="#2563EB" />
              <div>
                <p style={{ margin: 0, color: "#1E40AF", fontSize: 13, fontWeight: 600 }}>Esta barberia usa Cloud API</p>
                <p style={{ margin: "3px 0 0", color: "#2563EB", fontSize: 13 }}>
                  No necesita QR. El modo y las credenciales se administran desde SuperAdmin.
                </p>
              </div>
            </div>
          )}

          {!isCloudApi && wpStatus === null && (
            <button
              onClick={conectarWhatsapp}
              style={{ background: "#16A34A", display: "flex", alignItems: "center", gap: 6 }}
            >
              <MessageCircle size={13} />
              Conectar WhatsApp
            </button>
          )}

          {!isCloudApi && wpStatus === "loading" && (
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>Iniciando conexion...</p>
          )}

          {!isCloudApi && wpStatus === "initializing" && (
            <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
              Iniciando cliente WhatsApp, el QR aparecera automaticamente...
            </p>
          )}

          {!isCloudApi && wpStatus === "disabled" && (
            <div style={{ padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: "#92400E", display: "block", fontWeight: 500 }}>WhatsApp Web esta deshabilitado temporalmente</span>
              <span style={{ fontSize: 12, color: "#92400E", display: "block", marginTop: 4 }}>No se generaran codigos QR ni se iniciara Chromium.</span>
            </div>
          )}

          {!isCloudApi && wpStatus === "qr_pending" && wpQR && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              <p style={{ fontSize: 13, color: "#64748B", margin: 0 }}>
                Escanea el QR con WhatsApp en tu telefono.
              </p>
              <img
                src={wpQR}
                alt="QR para conectar WhatsApp Web"
                style={{ width: 220, height: 220, borderRadius: 8, border: "1px solid #E2E8F0" }}
              />
              <button
                onClick={conectarWhatsapp}
                style={{ background: "transparent", color: "#2563EB", border: "1px solid #BFDBFE", padding: "7px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}
              >
                <RefreshCw size={13} />
                Actualizar QR
              </button>
            </div>
          )}

          {!isCloudApi && wpStatus === "authenticated" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
              <CheckCircle2 size={16} color="#16A34A" />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#15803D" }}>WhatsApp conectado</span>
            </div>
          )}

          {!isCloudApi && wpStatus === "disconnected" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "#92400E" }}>Reconectando WhatsApp automaticamente...</span>
              </div>
              <button onClick={conectarWhatsapp} style={{ background: "#16A34A", display: "flex", alignItems: "center", gap: 6 }}>
                <MessageCircle size={13} />
                Reconectar ahora
              </button>
            </div>
          )}

          {!isCloudApi && (wpStatus === "error" || wpStatus === "auth_failure") && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "#991B1B", display: "block", fontWeight: 500 }}>No se pudo conectar WhatsApp</span>
                {wpError && <span style={{ fontSize: 12, color: "#B91C1C", display: "block", marginTop: 4 }}>{wpError}</span>}
                <span style={{ fontSize: 12, color: "#B91C1C", display: "block", marginTop: 4 }}>Reintentando automaticamente...</span>
              </div>
              <button onClick={conectarWhatsapp} style={{ background: "#16A34A", display: "flex", alignItems: "center", gap: 6 }}>
                <MessageCircle size={13} />
                Reintentar ahora
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
