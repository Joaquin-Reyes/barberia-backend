const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const {
  anularCierreCaja,
  anularPago,
  createCierreCaja,
  createPago,
  getPagosTurno,
  getResumenCaja,
  listCierresCaja,
  listTurnosParaCobrar,
} = require("../contollers/pagos.controller");

const router = express.Router();

router.use(authMiddleware);

router.get("/turnos", requireRoles("admin", "superadmin"), asyncHandler(listTurnosParaCobrar));
router.get("/turno/:turno_id", requireRoles("admin", "superadmin"), asyncHandler(getPagosTurno));
router.post("/", requireRoles("admin", "superadmin"), asyncHandler(createPago));
router.post("/:id/anular", requireRoles("admin", "superadmin"), asyncHandler(anularPago));
router.get("/caja/resumen", requireRoles("admin", "superadmin"), asyncHandler(getResumenCaja));
router.get("/caja/cierres", requireRoles("admin", "superadmin"), asyncHandler(listCierresCaja));
router.post("/caja/cierres", requireRoles("admin", "superadmin"), asyncHandler(createCierreCaja));
router.post("/caja/cierres/:id/anular", requireRoles("admin", "superadmin"), asyncHandler(anularCierreCaja));

module.exports = router;
