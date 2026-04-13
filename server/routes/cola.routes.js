const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  agregarClienteCola,
  terminarAtencion,
  obtenerCola,
} = require("../contollers/cola.controller");

// POST /cola/agregar — público, el cliente se agrega al llegar
router.post("/agregar", agregarClienteCola);

// POST /cola/terminar/:barbero_id — requiere auth
router.post("/terminar/:barbero_id", authMiddleware, terminarAtencion);

// GET /cola/:barberia_id — requiere auth
router.get("/:barberia_id", authMiddleware, obtenerCola);

module.exports = router;
