import { useEffect, useState } from "react";
import { BarChart3, Trophy, List, TrendingUp } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function Facturacion({ user }) {
  const [turnos, setTurnos] = useState([]);
  const [barberos, setBarberos] = useState([]);
  const [periodo, setPeriodo] = useState("dia");
  const [fechaFiltro, setFechaFiltro] = useState(
    new Date().toISOString().split("T")[0]
  );

  useEffect(() => {
    if (!user) return;
    traerTurnos();
  }, [user, fechaFiltro, periodo]);

  useEffect(() => {
    if (!user?.barberia_id) return;
    supabase
      .from("barberos")
      .select("nombre, es_duenio")
      .eq("barberia_id", user.barberia_id)
      .then(({ data }) => setBarberos(data || []));
  }, [user?.barberia_id]);

  async function traerTurnos() {
    let query = supabase
      .from("turnos").select("*")
      .eq("barberia_id", user.barberia_id)
      .eq("estado", "completado");

    if (periodo === "dia") {
      query = query.eq("fecha", fechaFiltro);
    } else if (periodo === "semana") {
      const inicio = getLunesDeEstaSemana(fechaFiltro);
      const fin    = getDomingoDeEstaSemana(fechaFiltro);
      query = query.gte("fecha", inicio).lte("fecha", fin);
    } else if (periodo === "mes") {
      const inicio = fechaFiltro.slice(0, 7) + "-01";
      const fin    = getUltimoDiaMes(fechaFiltro);
      query = query.gte("fecha", inicio).lte("fecha", fin);
    }

    const { data } = await query;
    setTurnos(data || []);
  }

  function getLunesDeEstaSemana(fecha) {
    const d   = new Date(fecha);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d.toISOString().split("T")[0];
  }

  function getDomingoDeEstaSemana(fecha) {
    const d = new Date(getLunesDeEstaSemana(fecha));
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  }

  function getUltimoDiaMes(fecha) {
    const d = new Date(fecha);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
  }

  const esDuenioMap = barberos.reduce((acc, b) => {
    acc[b.nombre] = b.es_duenio || false;
    return acc;
  }, {});

  const totalPeriodo      = turnos.reduce((acc, t) => acc + (t.precio || 0), 0);
  const promedioPorTurno  = turnos.length > 0 ? Math.round(totalPeriodo / turnos.length) : 0;
  const gananciaBarberia  = turnos.reduce((acc, t) => {
    const precio = t.precio || 0;
    return acc + (esDuenioMap[t.barbero] ? precio : Math.round(precio * 0.5));
  }, 0);

  const porBarbero = turnos.reduce((acc, t) => {
    if (!acc[t.barbero]) acc[t.barbero] = { turnos: 0, total: 0 };
    acc[t.barbero].turnos += 1;
    acc[t.barbero].total  += t.precio || 0;
    return acc;
  }, {});

  const barberosList = Object.entries(porBarbero)
    .map(([nombre, info]) => {
      const esDuenio = esDuenioMap[nombre] || false;
      return {
        nombre,
        ...info,
        esDuenio,
        paraBarbero:  esDuenio ? 0                        : Math.round(info.total * 0.5),
        paraBarberia: esDuenio ? info.total               : Math.round(info.total * 0.5),
      };
    })
    .sort((a, b) => b.total - a.total);

  const maxTotal    = barberosList.length > 0 ? barberosList[0].total : 1;
  const labelPeriodo = periodo === "dia" ? "del día" : periodo === "semana" ? "de la semana" : "del mes";

  /* ─── Shared styles ─── */
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
    flexWrap: "wrap",
    gap: 10,
  };

  const metricCard = (label, value, accent) => (
    <div className="card" style={{ margin: 0, textAlign: "center" }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.03em", color: accent || "#0F172A" }}>
        {value}
      </p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ─── TOPBAR ─── */}
      <div style={topbarStyle}>
        <div>
          <h1 style={{ fontSize: 15, fontWeight: 600, margin: 0, letterSpacing: "-0.02em", color: "#0F172A" }}>
            Facturación
          </h1>
          <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>
            Solo turnos completados
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Selector de período */}
          <div style={{
            display: "flex",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid #E2E8F0",
          }}>
            {["dia", "semana", "mes"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  border: "none",
                  borderRadius: 0,
                  background: periodo === p ? "#2563EB" : "#ffffff",
                  color:      periodo === p ? "#ffffff" : "#64748B",
                  cursor: "pointer",
                  fontWeight: periodo === p ? 600 : 400,
                  transition: "background 0.15s",
                }}
              >
                {p === "dia" ? "Día" : p === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => setFechaFiltro(e.target.value)}
            style={{ margin: 0 }}
          />
        </div>
      </div>

      {/* ─── CONTENIDO ─── */}
      <div style={{ padding: "24px", overflowY: "auto" }}>

        {/* MÉTRICAS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {metricCard(`Total ${labelPeriodo}`,        `$${totalPeriodo.toLocaleString("es-AR")}`,     "#16A34A")}
          {metricCard(`Ganancia barbería ${labelPeriodo}`, `$${gananciaBarberia.toLocaleString("es-AR")}`, "#2563EB")}
          {metricCard("Turnos completados",            turnos.length,                                  "#0F172A")}
          {metricCard("Promedio por turno",            `$${promedioPorTurno.toLocaleString("es-AR")}`, "#0F172A")}
        </div>

        {/* GRÁFICO POR BARBERO */}
        {barberosList.length > 0 && (
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 16 }}>
              <BarChart3 size={14} color="#475569" />
              <h2 style={{ margin: 0 }}>Facturación por barbero</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {barberosList.map((b) => (
                <div key={b.nombre}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{b.nombre}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>
                      ${b.total.toLocaleString("es-AR")} · {b.turnos} turno{b.turnos !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div style={{ background: "#E2E8F0", borderRadius: 999, height: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.round((b.total / maxTotal) * 100)}%`,
                      background: "linear-gradient(90deg, #2563EB, #3B82F6)",
                      height: "100%",
                      borderRadius: 999,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                    {totalPeriodo > 0 ? Math.round((b.total / totalPeriodo) * 100) : 0}% del total
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RANKING */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <Trophy size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Ranking {labelPeriodo}</h2>
          </div>
          {barberosList.length === 0 ? (
            <p style={{ color: "#94A3B8", textAlign: "center", padding: "28px 0", margin: 0, fontStyle: "italic" }}>
              No hay turnos completados para este período
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Barbero</th>
                    <th>Turnos</th>
                    <th>Total</th>
                    <th>Para el barbero</th>
                    <th>Para la barbería</th>
                    <th>Promedio</th>
                    <th>% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {barberosList.map((b, i) => (
                    <tr key={b.nombre}>
                      <td>
                        {i < 3 ? (
                          <Trophy
                            size={16}
                            color={i === 0 ? "#D97706" : i === 1 ? "#64748B" : "#B45309"}
                            aria-label={`Puesto ${i + 1}`}
                          />
                        ) : (
                          <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 700 }}>#{i + 1}</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{b.nombre}</span>
                        {b.esDuenio && (
                          <span style={{
                            fontSize: 10, color: "#7C3AED",
                            background: "#F3F0FF", border: "1px solid #DDD6FE",
                            marginLeft: 6, padding: "1px 6px",
                            borderRadius: 999, fontWeight: 600,
                            letterSpacing: "0.04em", textTransform: "uppercase",
                          }}>
                            Dueño
                          </span>
                        )}
                      </td>
                      <td style={{ color: "#475569" }}>{b.turnos}</td>
                      <td style={{ fontWeight: 600 }}>${b.total.toLocaleString("es-AR")}</td>
                      <td style={{ color: b.esDuenio ? "#94A3B8" : "#16A34A", fontWeight: 500 }}>
                        {b.esDuenio ? "—" : `$${b.paraBarbero.toLocaleString("es-AR")}`}
                      </td>
                      <td style={{ color: "#2563EB", fontWeight: 500 }}>
                        ${b.paraBarberia.toLocaleString("es-AR")}
                      </td>
                      <td style={{ color: "#475569" }}>
                        ${Math.round(b.total / b.turnos).toLocaleString("es-AR")}
                      </td>
                      <td style={{ color: "#475569" }}>
                        {totalPeriodo > 0 ? Math.round((b.total / totalPeriodo) * 100) : 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DETALLE DE TURNOS */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
            <List size={14} color="#475569" />
            <h2 style={{ margin: 0 }}>Detalle de turnos</h2>
          </div>
          {turnos.length === 0 ? (
            <p style={{ color: "#94A3B8", textAlign: "center", padding: "28px 0", margin: 0, fontStyle: "italic" }}>
              No hay turnos completados para este período
            </p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Barbero</th>
                    <th>Servicio</th>
                    <th>Fecha</th>
                    <th>Hora</th>
                    <th>Precio</th>
                    <th>Comisión barbero</th>
                  </tr>
                </thead>
                <tbody>
                  {turnos.map((t) => {
                    const esDuenio = esDuenioMap[t.barbero] || false;
                    const comision = esDuenio ? 0 : Math.round((t.precio || 0) * 0.5);
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.nombre}</td>
                        <td style={{ color: "#475569" }}>{t.barbero}</td>
                        <td style={{ color: "#475569" }}>{t.servicio}</td>
                        <td style={{ color: "#475569", whiteSpace: "nowrap" }}>{t.fecha}</td>
                        <td style={{ color: "#475569" }}>{t.hora}</td>
                        <td style={{ fontWeight: 600 }}>${(t.precio || 0).toLocaleString("es-AR")}</td>
                        <td style={{ color: esDuenio ? "#94A3B8" : "#16A34A", fontWeight: 500 }}>
                          {esDuenio ? "—" : `$${comision.toLocaleString("es-AR")}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
