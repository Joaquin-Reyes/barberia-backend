const express = require("express");
const router = express.Router();
const { crearBarberia } = require("../contollers/superadmin.controller");

router.post(
  "/crear-barberia",
  (req, res, next) => {
    const secret = req.headers['x-superadmin-secret'];
    if (!secret || secret !== process.env.SUPERADMIN_SECRET) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  },
  crearBarberia
);

module.exports = router;
