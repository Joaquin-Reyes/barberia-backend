const express = require("express");
const router = express.Router();
const { adminLogin, logout, activarCuenta } = require("../contollers/auth.controller");

router.post("/admin/login", adminLogin);
router.post("/logout", logout);
router.post("/activar", activarCuenta);

module.exports = router;
