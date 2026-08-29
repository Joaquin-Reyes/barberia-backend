const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

process.env.WHATSAPP_ENABLED = "false";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "test-service-role";

const { supabaseAdmin } = require("../config/supabase");
const adminController = require("../contollers/admin.controller");

const originalFrom = supabaseAdmin.from;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSupabaseMock(seed) {
  const db = clone(seed);
  const calls = [];

  function applyFilters(rows, filters) {
    return rows.filter((row) => filters.every((filter) => {
      const value = row[filter.column];
      if (filter.type === "eq") return value === filter.value;
      if (filter.type === "ilike") return String(value || "").toLowerCase() === String(filter.value || "").toLowerCase();
      return true;
    }));
  }

  function createBuilder(table) {
    const state = {
      table,
      action: "select",
      filters: [],
      changes: null,
      insertPayload: null,
      orderColumn: null,
    };

    function execute() {
      calls.push(clone(state));
      const rows = db[table] || [];

      if (state.action === "insert") {
        const items = Array.isArray(state.insertPayload) ? state.insertPayload : [state.insertPayload];
        for (const item of items) {
          rows.push({ id: item.id || `${table}-${rows.length + 1}`, ...item });
        }
        db[table] = rows;
        return Promise.resolve({ data: items, error: null });
      }

      const matched = applyFilters(rows, state.filters);

      if (state.action === "update") {
        for (const row of matched) Object.assign(row, state.changes);
        return Promise.resolve({ data: matched, error: null });
      }

      if (state.action === "delete") {
        db[table] = rows.filter((row) => !matched.includes(row));
        return Promise.resolve({ data: null, error: null });
      }

      const data = state.orderColumn
        ? [...matched].sort((a, b) => String(a[state.orderColumn]).localeCompare(String(b[state.orderColumn])))
        : matched;
      return Promise.resolve({ data, error: null });
    }

    const builder = {
      select() {
        state.action = state.action === "insert" ? "insert" : state.action;
        return builder;
      },
      insert(payload) {
        state.action = "insert";
        state.insertPayload = payload;
        return builder;
      },
      update(changes) {
        state.action = "update";
        state.changes = changes;
        return builder;
      },
      delete() {
        state.action = "delete";
        return builder;
      },
      eq(column, value) {
        state.filters.push({ type: "eq", column, value });
        return builder;
      },
      ilike(column, value) {
        state.filters.push({ type: "ilike", column, value });
        return builder;
      },
      order(column) {
        state.orderColumn = column;
        return builder;
      },
      maybeSingle() {
        return execute().then((result) => ({
          data: result.data?.[0] || null,
          error: null,
        }));
      },
      single() {
        return execute().then((result) => ({
          data: result.data?.[0] || null,
          error: result.data?.[0] ? null : { message: "not found" },
        }));
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  }

  supabaseAdmin.from = (table) => createBuilder(table);
  return { db, calls };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function authReq(user, overrides = {}) {
  return {
    user,
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}

test.afterEach(() => {
  supabaseAdmin.from = originalFrom;
});

test("usuario de Barberia A lista solo sus turnos", async () => {
  createSupabaseMock({
    turnos: [
      { id: "turno-a", barberia_id: "barberia-a", fecha: "2026-08-22", hora: "10:00", nombre: "A" },
      { id: "turno-b", barberia_id: "barberia-b", fecha: "2026-08-22", hora: "10:00", nombre: "B" },
    ],
  });

  const res = createRes();
  await adminController.listarTurnos(authReq({ id: "user-a", rol: "admin", barberia_id: "barberia-a" }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.map((turno) => turno.id), ["turno-a"]);
});

test("usuario de Barberia A no lista turnos de Barberia B al filtrar por fecha", async () => {
  createSupabaseMock({
    turnos: [
      { id: "turno-a", barberia_id: "barberia-a", fecha: "2026-08-22", hora: "09:00", nombre: "A" },
      { id: "turno-b", barberia_id: "barberia-b", fecha: "2026-08-22", hora: "10:00", nombre: "B" },
    ],
  });

  const res = createRes();
  await adminController.listarTurnos(
    authReq({ id: "user-a", rol: "admin", barberia_id: "barberia-a" }, { query: { fecha: "2026-08-22" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.map((turno) => turno.id), ["turno-a"]);
});

test("usuario de Barberia A no actualiza turno de Barberia B aunque conozca el ID", async () => {
  const { db } = createSupabaseMock({
    turnos: [
      { id: "turno-b", barberia_id: "barberia-b", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-a", rol: "admin", barberia_id: "barberia-a" },
      { params: { id: "turno-b" }, body: { estado: "completado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "pendiente");
});

test("barbero no modifica turno de otro barbero de la misma barberia", async () => {
  const { db } = createSupabaseMock({
    barberos: [
      { id: "barbero-juan", usuario_id: "user-juan", barberia_id: "barberia-a", nombre: "Juan" },
      { id: "barbero-pedro", usuario_id: "user-pedro", barberia_id: "barberia-a", nombre: "Pedro" },
    ],
    turnos: [
      { id: "turno-pedro", barberia_id: "barberia-a", barbero: "Pedro", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-juan", rol: "barbero", barberia_id: "barberia-a" },
      { params: { id: "turno-pedro" }, body: { estado: "completado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "pendiente");
});

test("barbero puede completar su propio turno", async () => {
  const { db } = createSupabaseMock({
    barberos: [
      { id: "barbero-juan", usuario_id: "user-juan", barberia_id: "barberia-a", nombre: "Juan" },
    ],
    turnos: [
      { id: "turno-juan", barberia_id: "barberia-a", barbero: "Juan", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-juan", rol: "barbero", barberia_id: "barberia-a" },
      { params: { id: "turno-juan" }, body: { estado: "completado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "completado");
});

test("barbero puede completar su propio turno cargando servicio y precio", async () => {
  const { db } = createSupabaseMock({
    barberos: [
      { id: "barbero-juan", usuario_id: "user-juan", barberia_id: "barberia-a", nombre: "Juan" },
    ],
    turnos: [
      { id: "turno-juan", barberia_id: "barberia-a", barbero: "Juan", estado: "pendiente", servicio: "", precio: 0 },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-juan", rol: "barbero", barberia_id: "barberia-a" },
      { params: { id: "turno-juan" }, body: { estado: "completado", servicio: "Corte", precio: 15000 } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "completado");
  assert.equal(db.turnos[0].servicio, "Corte");
  assert.equal(db.turnos[0].precio, 15000);
});

test("barbero de Barberia A no modifica turno de Barberia B", async () => {
  const { db } = createSupabaseMock({
    barberos: [
      { id: "barbero-juan", usuario_id: "user-juan", barberia_id: "barberia-a", nombre: "Juan" },
    ],
    turnos: [
      { id: "turno-b", barberia_id: "barberia-b", barbero: "Juan", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-juan", rol: "barbero", barberia_id: "barberia-a" },
      { params: { id: "turno-b" }, body: { estado: "completado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "pendiente");
});

test("admin de Barberia A modifica turnos de cualquier barbero de Barberia A", async () => {
  const { db } = createSupabaseMock({
    turnos: [
      { id: "turno-pedro", barberia_id: "barberia-a", barbero: "Pedro", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "admin-a", rol: "admin", barberia_id: "barberia-a" },
      { params: { id: "turno-pedro" }, body: { estado: "confirmado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].estado, "confirmado");
});

test("barbero solo puede establecer estado completado", async () => {
  const { db } = createSupabaseMock({
    barberos: [
      { id: "barbero-juan", usuario_id: "user-juan", barberia_id: "barberia-a", nombre: "Juan" },
    ],
    turnos: [
      { id: "turno-juan", barberia_id: "barberia-a", barbero: "Juan", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    authReq(
      { id: "user-juan", rol: "barbero", barberia_id: "barberia-a" },
      { params: { id: "turno-juan" }, body: { estado: "cancelado" } }
    ),
    res
  );

  assert.equal(res.statusCode, 403);
  assert.equal(db.turnos[0].estado, "pendiente");
});

test("usuario de Barberia A no elimina turno de Barberia B aunque conozca el ID", async () => {
  const { db } = createSupabaseMock({
    turnos: [
      { id: "turno-b", barberia_id: "barberia-b", estado: "pendiente" },
    ],
  });

  const res = createRes();
  await adminController.eliminarTurno(
    authReq({ id: "user-a", rol: "admin", barberia_id: "barberia-a" }, { params: { id: "turno-b" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos.length, 1);
});

test("dos barberias pueden usar mismo barbero, fecha y hora sin falso ocupado", async () => {
  const { db } = createSupabaseMock({
    turnos: [
      {
        id: "turno-b",
        barberia_id: "barberia-b",
        fecha: "2026-08-22",
        hora: "10:00",
        barbero: "Juan",
      },
    ],
    barberos: [
      { id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", telefono: "5491111111111" },
      { id: "barbero-b", barberia_id: "barberia-b", nombre: "Juan", telefono: "5492222222222" },
    ],
  });

  const res = createRes();
  await adminController.crearTurno(
    authReq(
      { id: "user-a", rol: "admin", barberia_id: "barberia-a" },
      {
        body: {
          nombre: "Cliente A",
          telefono: "5493333333333",
          servicio: "Corte",
          precio: 1000,
          barbero: "Juan",
          fecha: "2026-08-22",
          hora: "10:00",
        },
      }
    ),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(db.turnos.length, 2);
  assert.ok(db.turnos.some((turno) => turno.barberia_id === "barberia-a" && turno.barbero === "Juan"));
});

test("requests sin autenticacion a /admin/turnos son rechazados", async () => {
  const adminRoutes = require("../routes/admin.routes");
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  async function request(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.status;
  }

  try {
    assert.equal(await request("GET", "/admin/turnos"), 401);
    assert.equal(await request("PUT", "/admin/turnos/turno-a", { estado: "completado" }), 401);
    assert.equal(await request("DELETE", "/admin/turnos/turno-a"), 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
