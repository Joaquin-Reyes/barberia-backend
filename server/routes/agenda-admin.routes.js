const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const {
  eliminarExcepcionBarbero,
  guardarExcepcionBarbero,
  guardarHorariosBarbero,
} = require("../contollers/agenda-admin.controller");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("admin", "superadmin"));

router.put("/barberos/:barbero_id/horarios", asyncHandler(guardarHorariosBarbero));
router.put("/barberos/:barbero_id/excepciones", asyncHandler(guardarExcepcionBarbero));
router.delete("/barberos/:barbero_id/excepciones/:id", asyncHandler(eliminarExcepcionBarbero));

module.exports = router;
