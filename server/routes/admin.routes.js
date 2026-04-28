const express = require("express");
const path = require("path");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  crearTurno,
  listarTurnos,
  actualizarEstadoTurno,
  eliminarTurno,
  crearBarbero,
  listarBarberos,
  reenviarInvitacion,
  getWhatsappQR
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
router.post("/barberos/:id/reenviar-invitacion", authMiddleware, reenviarInvitacion);
router.get("/whatsapp/qr", authMiddleware, getWhatsappQR);

// 🔐 Proteger panel HTML (deja pasar las APIs)
router.use("/", (req, res, next) => {
  if (req.path.startsWith("/barberos")) return next();
  if (req.path.startsWith("/crear-turno")) return next();
  if (req.path.startsWith("/turnos")) return next();
  if (req.path === "/barbero.html") return next();
  if (req.session.auth) return next();
  return res.sendFile(path.join(__dirname, "../admin/login.html"));
});

// Archivos estáticos del panel
router.use(express.static(path.join(__dirname, "../admin")));

// API routes de turnos
router.get("/turnos", listarTurnos);
router.put("/turnos/:id", actualizarEstadoTurno);
router.delete("/turnos/:id", eliminarTurno);

module.exports = router;
