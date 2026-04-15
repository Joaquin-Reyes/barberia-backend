const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function adminLogin(req, res) {
  console.log("BODY:", req.body);
  const { password } = req.body;
  console.log("PASSWORD RECIBIDA:", password);

  if (password === ADMIN_PASSWORD) {
    req.session.auth = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ error: "Password incorrecta" });
}

function barberoLogin(req, res) {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: "Falta nombre" });
  req.session.barbero = nombre;
  res.json({ ok: true });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

module.exports = { adminLogin, barberoLogin, logout };
