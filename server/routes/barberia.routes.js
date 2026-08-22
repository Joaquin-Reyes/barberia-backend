const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const { actualizarConfiguracion } = require("../contollers/barberia.controller");

const router = express.Router();

router.use(authMiddleware);

router.patch("/configuracion", requireRoles("admin", "superadmin"), asyncHandler(actualizarConfiguracion));

module.exports = router;
