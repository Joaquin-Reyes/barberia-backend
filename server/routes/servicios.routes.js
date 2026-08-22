const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const {
  createServicio,
  deleteServicio,
  listServicios,
  updateServicio,
} = require("../contollers/servicios.controller");

const router = express.Router();

router.use(authMiddleware);
router.use(requireRoles("admin", "superadmin"));

router.get("/", asyncHandler(listServicios));
router.post("/", asyncHandler(createServicio));
router.put("/:id", asyncHandler(updateServicio));
router.delete("/:id", asyncHandler(deleteServicio));

module.exports = router;
