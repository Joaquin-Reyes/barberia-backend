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
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const superadminRoutes = require("./routes/superadmin.routes");
const whatsappRoutes = require("./routes/whatsapp.routes");
const colaRoutes = require("./routes/cola.routes");
const barberoRoutes = require("./routes/barbero.routes");
const facturacionRoutes = require("./routes/facturacion.routes");
const pagosRoutes = require("./routes/pagos.routes");
const productosRoutes = require("./routes/productos.routes");
const barberiaRoutes = require("./routes/barberia.routes");
const serviciosRoutes = require("./routes/servicios.routes");
const agendaAdminRoutes = require("./routes/agenda-admin.routes");
const { initializeAllClients } = require("./services/wwebjs.manager");

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

app.use((req, res, next) => {
  if (
    req.path === "/" ||
    req.path === "/index.html" ||
    req.path === "/sw.js" ||
    req.path.startsWith("/workbox-") ||
    req.path === "/manifest.webmanifest"
  ) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  }
  next();
});

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
app.use("/api/facturacion", facturacionRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/barberia", barberiaRoutes);
app.use("/api/servicios", serviciosRoutes);
app.use("/api/agenda", agendaAdminRoutes);

app.use((err, req, res, next) => {
  console.error("API ERROR:", err);
  res.status(500).json({ error: err.message || "Error interno" });
});

// Catch-all: serve React app for any non-API route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// ==============================
// START
// ==============================

app.listen(PORT, "0.0.0.0", () => {
  initializeAllClients();
  console.log(`🔥 Servidor corriendo en puerto ${PORT}`);

});

