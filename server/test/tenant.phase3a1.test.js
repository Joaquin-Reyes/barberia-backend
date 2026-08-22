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
const barberiaController = require("../contollers/barberia.controller");
const serviciosController = require("../contollers/servicios.controller");
const agendaAdminController = require("../contollers/agenda-admin.controller");

const originalFrom = supabaseAdmin.from;
const originalGetUser = supabaseAdmin.auth.getUser;

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
        const inserted = items.map((item, index) => ({ id: item.id || `${table}-${rows.length + index + 1}`, ...item }));
        rows.push(...inserted);
        db[table] = rows;
        return Promise.resolve({ data: inserted, error: null });
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
        return execute().then((result) => ({ data: result.data?.[0] || null, error: null }));
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
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function req(user, overrides = {}) {
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
  supabaseAdmin.auth.getUser = originalGetUser;
});

test("Admin A edita turno A con whitelist y tenant propio", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-a", barberia_id: "barberia-a", nombre: "Ana", fecha: "2026-08-22", hora: "10:00", barbero: "Juan", estado: "pendiente" }],
    barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Pedro" }],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { id: "turno-a" },
      body: { nombre: "Ana Gomez", precio: 1200, barbero: "Pedro", fecha: "2026-08-23", hora: "11:00", estado: "confirmado" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].nombre, "Ana Gomez");
  assert.equal(db.turnos[0].barberia_id, "barberia-a");
  assert.equal(db.turnos[0].recordatorio_24h, false);
});

test("Admin A no edita turno B aunque conozca el ID", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-b", barberia_id: "barberia-b", nombre: "Cliente B", fecha: "2026-08-22", hora: "10:00", barbero: "Juan", estado: "pendiente" }],
  });

  const res = createRes();
  await adminController.actualizarEstadoTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { id: "turno-b" },
      body: { nombre: "Hack", estado: "completado" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos[0].nombre, "Cliente B");
  assert.equal(db.turnos[0].estado, "pendiente");
});

test("Admin A elimina turno A", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-a", barberia_id: "barberia-a", nombre: "Ana" }],
  });

  const res = createRes();
  await adminController.eliminarTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, { params: { id: "turno-a" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos.length, 0);
});

test("Admin A no elimina turno B", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-b", barberia_id: "barberia-b", nombre: "Cliente B" }],
  });

  const res = createRes();
  await adminController.eliminarTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, { params: { id: "turno-b" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.turnos.length, 1);
});

test("Turnos rechaza barberia_id malicioso en body", async () => {
  createSupabaseMock({ turnos: [] });
  const res = createRes();

  await adminController.actualizarEstadoTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { id: "turno-a" },
      body: { estado: "confirmado", barberia_id: "barberia-b" },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
});

test("Turnos rechaza hora invalida en edicion administrativa", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-a", barberia_id: "barberia-a", nombre: "Ana", fecha: "2026-08-22", hora: "10:00", barbero: "Juan" }],
  });
  const res = createRes();

  await adminController.actualizarEstadoTurno(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { id: "turno-a" },
      body: { hora: "" },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(db.turnos[0].hora, "10:00");
});

test("Admin A modifica solo configuracion de Barberia A", async () => {
  const { db } = createSupabaseMock({
    barberias: [
      { id: "barberia-a", nombre: "A", activo: true },
      { id: "barberia-b", nombre: "B", activo: true },
    ],
  });

  const res = createRes();
  await barberiaController.actualizarConfiguracion(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      body: { nombre: "A nueva", telefono_admin: "111", whatsapp_number: "222" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.barberias[0].nombre, "A nueva");
  assert.equal(db.barberias[1].nombre, "B");
});

test("Configuracion rechaza barberia_id y campos administrativos", async () => {
  const { db } = createSupabaseMock({
    barberias: [{ id: "barberia-a", nombre: "A", activo: true }],
  });

  const res = createRes();
  await barberiaController.actualizarConfiguracion(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      body: { nombre: "Hack", barberia_id: "barberia-b", activo: false },
    }),
    res
  );

  assert.equal(res.statusCode, 400);
  assert.equal(db.barberias[0].nombre, "A");
  assert.equal(db.barberias[0].activo, true);
});

test("Admin A crea servicio y backend fuerza barberia_id A", async () => {
  const { db } = createSupabaseMock({ servicios: [] });
  const res = createRes();

  await serviciosController.createServicio(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      body: { nombre: "Corte", precio: 1000, barberia_id: "barberia-b" },
    }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(db.servicios[0].barberia_id, "barberia-a");
});

test("Admin A no actualiza servicio B", async () => {
  const { db } = createSupabaseMock({
    servicios: [{ id: "servicio-b", barberia_id: "barberia-b", nombre: "Color", precio: 5000 }],
  });
  const res = createRes();

  await serviciosController.updateServicio(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { id: "servicio-b" },
      body: { nombre: "Hack", precio: 1 },
    }),
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(db.servicios[0].nombre, "Color");
});

test("Admin A no elimina servicio B", async () => {
  const { db } = createSupabaseMock({
    servicios: [{ id: "servicio-b", barberia_id: "barberia-b", nombre: "Color" }],
  });
  const res = createRes();

  await serviciosController.deleteServicio(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, { params: { id: "servicio-b" } }),
    res
  );

  assert.equal(res.statusCode, 204);
  assert.equal(db.servicios.length, 1);
});

test("Barbero no puede CRUD servicios por rutas protegidas", async () => {
  createSupabaseMock({
    usuarios: [{ id: "barbero-a", rol: "barbero", barberia_id: "barberia-a" }],
    servicios: [],
  });
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: "barbero-a" } }, error: null });

  const serviciosRoutes = require("../routes/servicios.routes");
  const app = express();
  app.use(express.json());
  app.use("/api/servicios", serviciosRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({ nombre: "Corte", precio: 1000 }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Barbero no puede administrar horarios ni excepciones por rutas protegidas", async () => {
  createSupabaseMock({
    usuarios: [{ id: "barbero-a", rol: "barbero", barberia_id: "barberia-a" }],
    barberos: [{ id: "barbero-a", barberia_id: "barberia-a" }],
    horarios_barbero: [],
    excepciones_barbero: [],
  });
  supabaseAdmin.auth.getUser = async () => ({ data: { user: { id: "barbero-a" } }, error: null });

  const agendaRoutes = require("../routes/agenda-admin.routes");
  const app = express();
  app.use(express.json());
  app.use("/api/agenda", agendaRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agenda/barberos/barbero-a/horarios`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token" },
      body: JSON.stringify({ horarios: [{ dia_semana: 1, hora_inicio: "09:00", hora_fin: "17:00" }] }),
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Admin A modifica horarios de barbero A", async () => {
  const { db } = createSupabaseMock({
    barberos: [{ id: "barbero-a", barberia_id: "barberia-a" }],
    horarios_barbero: [{ id: "old", barbero_id: "barbero-a", barberia_id: "barberia-a", dia_semana: 1 }],
  });
  const res = createRes();

  await agendaAdminController.guardarHorariosBarbero(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { barbero_id: "barbero-a" },
      body: { horarios: [{ dia_semana: 2, hora_inicio: "09:00", hora_fin: "17:00", barberia_id: "barberia-b" }] },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.horarios_barbero.length, 1);
  assert.equal(db.horarios_barbero[0].barberia_id, "barberia-a");
  assert.equal(db.horarios_barbero[0].dia_semana, 2);
});

test("Admin A no modifica horarios de barbero B", async () => {
  const { db } = createSupabaseMock({
    barberos: [{ id: "barbero-b", barberia_id: "barberia-b" }],
    horarios_barbero: [{ id: "old", barbero_id: "barbero-b", barberia_id: "barberia-b", dia_semana: 1 }],
  });
  const res = createRes();

  await agendaAdminController.guardarHorariosBarbero(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { barbero_id: "barbero-b" },
      body: { horarios: [{ dia_semana: 2, hora_inicio: "09:00", hora_fin: "17:00" }] },
    }),
    res
  );

  assert.equal(res.statusCode, 404);
  assert.equal(db.horarios_barbero[0].dia_semana, 1);
});

test("Admin A crea excepcion de barbero A", async () => {
  const { db } = createSupabaseMock({
    barberos: [{ id: "barbero-a", barberia_id: "barberia-a" }],
    excepciones_barbero: [],
  });
  const res = createRes();

  await agendaAdminController.guardarExcepcionBarbero(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { barbero_id: "barbero-a" },
      body: { fecha: "2026-08-22", trabaja: false, motivo: "Feriado", barberia_id: "barberia-b" },
    }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(db.excepciones_barbero[0].barberia_id, "barberia-a");
});

test("Admin A no crea/modifica/elimina excepcion de barbero B", async () => {
  const { db } = createSupabaseMock({
    barberos: [{ id: "barbero-b", barberia_id: "barberia-b" }],
    excepciones_barbero: [{ id: "ex-b", barbero_id: "barbero-b", barberia_id: "barberia-b", fecha: "2026-08-22", motivo: "Original" }],
  });

  const createResDenied = createRes();
  await agendaAdminController.guardarExcepcionBarbero(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { barbero_id: "barbero-b" },
      body: { fecha: "2026-08-22", trabaja: false, motivo: "Hack" },
    }),
    createResDenied
  );

  const deleteResDenied = createRes();
  await agendaAdminController.eliminarExcepcionBarbero(
    req({ id: "admin-a", rol: "admin", barberia_id: "barberia-a" }, {
      params: { barbero_id: "barbero-b", id: "ex-b" },
    }),
    deleteResDenied
  );

  assert.equal(createResDenied.statusCode, 404);
  assert.equal(deleteResDenied.statusCode, 404);
  assert.equal(db.excepciones_barbero.length, 1);
  assert.equal(db.excepciones_barbero[0].motivo, "Original");
});
