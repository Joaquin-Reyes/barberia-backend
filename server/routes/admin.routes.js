const express = require("express");
const path = require("path");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { requireRoles } = require("../middleware/roles");
const {
  crearTurno,
  listarTurnos,
  actualizarEstadoTurno,
  eliminarTurno,
  crearBarbero,
  listarBarberos,
  eliminarBarbero,
  reenviarInvitacion,
  getWhatsappQR,
  getWhatsappStatus,
  getWhatsappChats,
  listarSolicitudesWhatsapp,
  actualizarSolicitudWhatsapp,
  crearTurnoDesdeSolicitudWhatsapp
} = require("../contollers/admin.controller");

// 🔐 Proteger panel barbero (antes de la protección general)
router.use("/barbero.html", (req, res, next) => {
  if (req.session.barbero) return next();
  return res.sendFile(path.join(__dirname, "../admin/login-barbero.html"));
});

// API routes con su propio auth (antes de la protección HTML general)
router.post("/crear-turno", authMiddleware, crearTurno);
router.post("/barberos", authMiddleware, crearBarbero);
router.get("/barberos", authMiddleware, listarBarberos);
router.delete("/barberos/:id", authMiddleware, eliminarBarbero);
router.post("/barberos/:id/reenviar-invitacion", authMiddleware, reenviarInvitacion);
router.get("/whatsapp/status", authMiddleware, getWhatsappStatus);
router.get("/whatsapp/chats", authMiddleware, getWhatsappChats);
router.get("/whatsapp/qr", authMiddleware, getWhatsappQR);
router.get("/solicitudes-whatsapp", authMiddleware, listarSolicitudesWhatsapp);
router.post("/solicitudes-whatsapp/:id/crear-turno", authMiddleware, crearTurnoDesdeSolicitudWhatsapp);
router.put("/solicitudes-whatsapp/:id", authMiddleware, actualizarSolicitudWhatsapp);

// 🔐 Proteger panel HTML (deja pasar las APIs)
router.use("/", (req, res, next) => {
  if (req.path.startsWith("/barberos")) return next();
  if (req.path.startsWith("/crear-turno")) return next();
  if (req.path.startsWith("/turnos")) return next();
  if (req.path.startsWith("/solicitudes-whatsapp")) return next();
  if (req.path === "/barbero.html") return next();
  if (req.session.auth) return next();
  return res.sendFile(path.join(__dirname, "../admin/login.html"));
});

// Archivos estáticos del panel
router.use(express.static(path.join(__dirname, "../admin")));

// API routes de turnos
router.get("/turnos", authMiddleware, requireRoles("admin", "superadmin"), listarTurnos);
router.put("/turnos/:id", authMiddleware, requireRoles("admin", "superadmin", "barbero"), actualizarEstadoTurno);
router.delete("/turnos/:id", authMiddleware, requireRoles("admin", "superadmin"), eliminarTurno);

module.exports = router;
