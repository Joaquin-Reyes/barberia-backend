const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { getTurnosBarbero, registrarAtencionCola } = require("../contollers/barbero.controller");

router.get("/turnos", authMiddleware, getTurnosBarbero);
router.post("/registrar-atencion", authMiddleware, registrarAtencionCola);

module.exports = router;
