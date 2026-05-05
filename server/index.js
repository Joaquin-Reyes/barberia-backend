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
const path = require("path");

const authMiddleware = require("./middleware/auth");
const { enviarRecordatorios } = require("./services/agenda.service");
const { initializeAllClients } = require("./services/wwebjs.manager");


const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const colaRoutes = require("./routes/cola.routes");
const barberoRoutes = require("./routes/barbero.routes");

const app = express();
const PORT = process.env.PORT || 3000;

// ==============================
// MIDDLEWARES
// ==============================

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : [];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

// ==============================
// STATIC FRONTEND
// ==============================

app.use(express.static(path.join(__dirname, "../frontend/dist")));

// ==============================
// ROUTES
// ==============================

app.get("/test", authMiddleware, (req, res) => {
  console.log("USER:", req.user);
  res.json({ ok: true, user: req.user });
});

app.use("/", authRoutes);
app.use("/admin", adminRoutes);

app.use("/superadmin", superadminRoutes);
app.use("/webhook", whatsappRoutes);
app.use("/cola", colaRoutes);
app.use("/barbero", barberoRoutes);

// Catch-all: serve React app for any non-API route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// ==============================
// START
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);

  initializeAllClients().catch((err) =>
    console.error("[wwebjs] Error inicializando clientes:", err.message)
  );
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
