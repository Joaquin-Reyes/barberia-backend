process.on("uncaughtException", (err) => {
  console.error("ERROR GLOBAL:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("PROMISE ERROR:", err);
});

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

const authMiddleware = require("./middleware/auth");
const { enviarRecordatorios } = require("./services/agenda.service");
const { updateTurnoEstado } = require("./contollers/admin.controller");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const colaRoutes = require("./routes/cola.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// MIDDLEWARES
// ==============================

app.use(cors());
app.use(express.json());
app.use(session({
  secret: "clave_super_secreta",
  resave: false,
  saveUninitialized: true,
}));

// ==============================
// ROUTES
// ==============================

app.get("/test", authMiddleware, (req, res) => {
  console.log("USER:", req.user);
  res.json({ ok: true, user: req.user });
});

app.use("/", authRoutes);
app.use("/admin", adminRoutes);
app.put("/turnos/:id/estado", updateTurnoEstado);
app.use("/superadmin", superadminRoutes);
app.use("/webhook", whatsappRoutes);
app.use("/cola", colaRoutes);

app.get("/", (req, res) => {
  res.send("🚀 Servidor funcionando");
});

// ==============================
// START
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);
});

// ==============================
// CRON RECORDATORIOS (1 HORA)
// ==============================

setInterval(async () => {
  try {
    console.log("⏳ Revisando recordatorios...");
    await enviarRecordatorios();
  } catch (error) {
    console.error("❌ Error en recordatorios:", error);
  }
}, 60 * 60 * 1000);
