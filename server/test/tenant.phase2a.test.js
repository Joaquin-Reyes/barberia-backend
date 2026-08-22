const test = require("node:test");
const assert = require("node:assert/strict");

process.env.WHATSAPP_ENABLED = "false";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "test-service-role";

const { supabaseAdmin } = require("../config/supabase");
const colaController = require("../contollers/cola.controller");
const colaService = require("../services/cola.service");
const agendaService = require("../services/agenda.service");

const originalFrom = supabaseAdmin.from;
const originalRpc = supabaseAdmin.rpc;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSupabaseMock(seed, options = {}) {
  const db = clone(seed);
  const calls = [];
  const rpcCalls = [];

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
        const inserted = items.map((item) => ({ id: item.id || `${table}-${rows.length + 1}`, ...item }));
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
  supabaseAdmin.rpc = (name, params) => {
    rpcCalls.push({ name, params });
    return Promise.resolve(options.rpcResult || { data: { tipo: "sin_clientes" }, error: null });
  };

  return { db, calls, rpcCalls };
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
  supabaseAdmin.rpc = originalRpc;
});

test("usuario de Barberia A no consulta cola de Barberia B cambiando la URL", async () => {
  createSupabaseMock({ barberos: [], cola_espera: [] });
  const res = createRes();

  await colaController.obtenerCola(
    req({ id: "user-a", rol: "admin", barberia_id: "barberia-a" }, { params: { barberia_id: "barberia-b" } }),
    res
  );

  assert.equal(res.statusCode, 404);
});

test("usuario de Barberia A consulta su propia cola", async () => {
  createSupabaseMock({
    barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan" }],
    cola_espera: [{ id: "cola-a", barberia_id: "barberia-a", nombre_cliente: "Ana", estado: "esperando", hora_llegada: "2026-08-22T10:00:00Z" }],
  });
  const res = createRes();

  await colaController.obtenerCola(
    req({ id: "user-a", rol: "admin", barberia_id: "barberia-a" }, { params: { barberia_id: "barberia-a" } }),
    res
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.barberos.map((barbero) => barbero.id), ["barbero-a"]);
  assert.deepEqual(res.body.cola_espera.map((item) => item.id), ["cola-a"]);
});

test("POST /cola/agregar rechaza barberia inexistente", async () => {
  createSupabaseMock({ barberias: [], cola_espera: [] });
  const res = createRes();

  await colaController.agregarClienteCola(
    req(null, { body: { barberia_id: "barberia-inexistente", nombre_cliente: "Ana" } }),
    res
  );

  assert.equal(res.statusCode, 404);
});

test("POST /cola/agregar rechaza datos invalidos de cliente", async () => {
  createSupabaseMock({ barberias: [{ id: "barberia-a", activo: true }], cola_espera: [] });
  const res = createRes();

  await colaController.agregarClienteCola(
    req(null, { body: { barberia_id: "barberia-a", nombre_cliente: "A", barbero_id: "barbero-a" } }),
    res
  );

  assert.equal(res.statusCode, 400);
});

test("POST /cola/agregar conserva el flujo publico legitimo", async () => {
  const { db } = createSupabaseMock({ barberias: [{ id: "barberia-a", activo: true }], cola_espera: [] });
  const res = createRes();

  await colaController.agregarClienteCola(
    req(null, { body: { barberia_id: "barberia-a", nombre_cliente: "Ana Gomez" } }),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(db.cola_espera.length, 1);
  assert.equal(db.cola_espera[0].barberia_id, "barberia-a");
  assert.equal(db.cola_espera[0].nombre_cliente, "Ana Gomez");
  assert.equal(db.cola_espera[0].barbero_id, undefined);
});

test("barbero no opera sobre barbero de otra barberia en cola terminar", async () => {
  createSupabaseMock({
    barberos: [{ id: "barbero-b", usuario_id: "user-b", barberia_id: "barberia-b", nombre: "Pedro" }],
  });
  const res = createRes();

  await colaController.terminarAtencion(
    req({ id: "user-a", rol: "barbero", barberia_id: "barberia-a" }, { params: { barbero_id: "barbero-b" } }),
    res
  );

  assert.equal(res.statusCode, 404);
});

test("turnoDisponible distingue barberias con mismo barbero, fecha y hora", async () => {
  createSupabaseMock({
    turnos: [{ id: "turno-b", barberia_id: "barberia-b", barbero: "Juan", fecha: "2026-08-22", hora: "10:00" }],
  });

  const disponibleA = await agendaService.turnoDisponible("2026-08-22", "10:00", "Juan", "barberia-a");
  const disponibleB = await agendaService.turnoDisponible("2026-08-22", "10:00", "Juan", "barberia-b");

  assert.equal(disponibleA, true);
  assert.equal(disponibleB, false);
});

test("eliminarTurno no elimina turno de otro tenant", async () => {
  const { db } = createSupabaseMock({
    turnos: [{ id: "turno-b", barberia_id: "barberia-b", nombre: "Cliente B" }],
  });

  const ok = await agendaService.eliminarTurno("turno-b", "barberia-a");

  assert.equal(ok, true);
  assert.equal(db.turnos.length, 1);
});

test("horarios y excepciones no se mezclan entre barberias", async () => {
  const fecha = "2026-08-24";
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  createSupabaseMock({
    barberos: [{ id: "barbero-compartido", barberia_id: "barberia-a", nombre: "Juan" }],
    excepciones_barbero: [
      { id: "ex-b", barberia_id: "barberia-b", barbero_id: "barbero-compartido", fecha, trabaja: false },
    ],
    horarios_barbero: [
      { id: "horario-a", barberia_id: "barberia-a", barbero_id: "barbero-compartido", dia_semana: diaSemana, hora_inicio: "09:00", hora_fin: "10:00" },
    ],
    turnos: [],
  });

  const horarios = await agendaService.obtenerHorariosDisponibles("Juan", "barberia-a", fecha);

  assert.deepEqual(horarios, ["09:00", "09:30"]);
});

test("recordatorios actualizan turno por id y barberia_id", async () => {
  const fechaTurno = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fechaTurno);
  const hora = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fechaTurno);

  const { db } = createSupabaseMock({
    barberias: [
      { id: "barberia-a", whatsapp_mode: "cloud_api", phone_number_id: "phone-a" },
      { id: "barberia-b", whatsapp_mode: "cloud_api", phone_number_id: "phone-b" },
    ],
    turnos: [
      { id: "turno-duplicado", barberia_id: "barberia-a", fecha, hora, telefono: "111", barbero: "Juan", recordatorio_24h: false, recordatorio_3h: true },
      { id: "turno-duplicado", barberia_id: "barberia-b", fecha: "2099-01-01", hora: "10:00", telefono: "222", barbero: "Juan", recordatorio_24h: false, recordatorio_3h: true },
    ],
  });

  await agendaService.enviarRecordatorios();

  assert.equal(db.turnos[0].recordatorio_24h, true);
  assert.equal(db.turnos[1].recordatorio_24h, false);
});

test("terminarYAsignarSiguiente sigue invocando la RPC con barbero_id validado por controller", async () => {
  const { rpcCalls } = createSupabaseMock({}, { rpcResult: { data: { tipo: "sin_clientes" }, error: null } });

  const result = await colaService.terminarYAsignarSiguiente("barbero-a");

  assert.equal(result.ok, true);
  assert.deepEqual(rpcCalls, [{ name: "asignar_siguiente_cliente", params: { p_barbero_id: "barbero-a" } }]);
});
