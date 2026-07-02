const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const { getResumenFacturacion } = require("../contollers/facturacion.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/resumen", requireRoles("admin", "superadmin"), asyncHandler(getResumenFacturacion));

module.exports = router;
