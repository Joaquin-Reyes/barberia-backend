const express = require("express");
const authMiddleware = require("../middleware/auth");
const { asyncHandler, requireRoles } = require("../middleware/roles");
const {
  createProducto,
  deleteProducto,
  listProductos,
  updateProducto,
} = require("../contollers/productos.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/", requireRoles("admin", "superadmin"), asyncHandler(listProductos));
router.post("/", requireRoles("admin", "superadmin"), asyncHandler(createProducto));
router.put("/:id", requireRoles("admin", "superadmin"), asyncHandler(updateProducto));
router.delete("/:id", requireRoles("admin", "superadmin"), asyncHandler(deleteProducto));

module.exports = router;
