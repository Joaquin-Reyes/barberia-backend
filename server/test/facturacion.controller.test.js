const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "test-service-role";

const { supabaseAdmin } = require("../config/supabase");
const facturacionController = require("../contollers/facturacion.controller");

const originalFrom = supabaseAdmin.from;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSupabaseMock(seed) {
  const db = clone(seed);

  function applyFilters(rows, filters) {
    return rows.filter((row) => filters.every((filter) => {
      const value = row[filter.column];
      if (filter.type === "eq") return value === filter.value;
      if (filter.type === "is") return value === filter.value || (filter.value === null && value == null);
      if (filter.type === "gte") return String(value) >= String(filter.value);
      if (filter.type === "lte") return String(value) <= String(filter.value);
      if (filter.type === "lt") return String(value) < String(filter.value);
      if (filter.type === "in") return filter.values.includes(value);
      return true;
    }));
  }

  function createBuilder(table) {
    const state = {
      filters: [],
      orderColumn: null,
      ascending: true,
    };

    function execute() {
      const matched = applyFilters(db[table] || [], state.filters);
      const data = state.orderColumn
        ? [...matched].sort((a, b) => {
          const result = String(a[state.orderColumn]).localeCompare(String(b[state.orderColumn]));
          return state.ascending ? result : -result;
        })
        : matched;

      return Promise.resolve({ data, error: null });
    }

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        state.filters.push({ type: "eq", column, value });
        return builder;
      },
      is(column, value) {
        state.filters.push({ type: "is", column, value });
        return builder;
      },
      gte(column, value) {
        state.filters.push({ type: "gte", column, value });
        return builder;
      },
      lte(column, value) {
        state.filters.push({ type: "lte", column, value });
        return builder;
      },
      lt(column, value) {
        state.filters.push({ type: "lt", column, value });
        return builder;
      },
      in(column, values) {
        state.filters.push({ type: "in", column, values });
        return builder;
      },
      order(column, options = {}) {
        state.orderColumn = column;
        state.ascending = options.ascending !== false;
        return builder;
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  }

  supabaseAdmin.from = (table) => createBuilder(table);
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

test.afterEach(() => {
  supabaseAdmin.from = originalFrom;
});

test("facturacion mantiene pagos cargados otro dia dentro de la fecha del turno", async () => {
  createSupabaseMock({
    turnos: [
      { id: "turno-pago", barberia_id: "barberia-a", fecha: "2026-08-12", precio: 15000, estado: "completado", barbero: "Juan", servicio: "Corte" },
      { id: "turno-historico", barberia_id: "barberia-a", fecha: "2026-08-12", precio: 19000, estado: "completado", barbero: "Pedro", servicio: "Corte y barba" },
      { id: "turno-otro-dia", barberia_id: "barberia-a", fecha: "2026-08-13", precio: 25000, estado: "completado", barbero: "Juan", servicio: "Color" },
      { id: "turno-pendiente-pago", barberia_id: "barberia-a", fecha: "2026-08-12", precio: 10000, estado: "pendiente", barbero: "Juan", servicio: "Corte" },
      { id: "turno-pendiente-sin-pago", barberia_id: "barberia-a", fecha: "2026-08-12", precio: 15000, estado: "pendiente", barbero: "Juan", servicio: "Corte" },
    ],
    pagos: [
      { id: "pago-tarde", barberia_id: "barberia-a", turno_id: "turno-pago", monto: 15000, metodo: "efectivo", tipo: "pago_total", created_at: "2026-08-15T16:00:00.000Z", anulado_at: null },
      { id: "pago-pendiente", barberia_id: "barberia-a", turno_id: "turno-pendiente-pago", monto: 10000, metodo: "transferencia", tipo: "pago_total", created_at: "2026-08-12T16:00:00.000Z", anulado_at: null },
      { id: "pago-anulado", barberia_id: "barberia-a", turno_id: "turno-historico", monto: 19000, metodo: "efectivo", tipo: "pago_total", created_at: "2026-08-12T16:00:00.000Z", anulado_at: "2026-08-12T17:00:00.000Z" },
      { id: "pago-otro-dia", barberia_id: "barberia-a", turno_id: "turno-otro-dia", monto: 25000, metodo: "efectivo", tipo: "pago_total", created_at: "2026-08-13T16:00:00.000Z", anulado_at: null },
    ],
    turno_productos: [
      { id: "producto-pago", barberia_id: "barberia-a", turno_id: "turno-pago", producto_id: "producto-a", nombre: "Pomada", subtotal: 5000 },
      { id: "producto-historico", barberia_id: "barberia-a", turno_id: "turno-historico", producto_id: "producto-b", nombre: "Gel", subtotal: 3000 },
      { id: "producto-pendiente", barberia_id: "barberia-a", turno_id: "turno-pendiente-pago", producto_id: "producto-d", nombre: "Cera", subtotal: 2000 },
      { id: "producto-otro-dia", barberia_id: "barberia-a", turno_id: "turno-otro-dia", producto_id: "producto-c", nombre: "Shampoo", subtotal: 7000 },
      { id: "producto-pendiente-sin-pago", barberia_id: "barberia-a", turno_id: "turno-pendiente-sin-pago", producto_id: "producto-e", nombre: "Spray", subtotal: 4000 },
    ],
  });

  const res = createRes();
  await facturacionController.getResumenFacturacion({
    user: { id: "admin-a", rol: "admin", barberia_id: "barberia-a" },
    query: { desde: "2026-08-12", hasta: "2026-08-12" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.fuente, "pagos");
  assert.equal(res.body.total, 44000);
  assert.equal(res.body.pagos_count, 2);
  assert.equal(res.body.pagos_historicos_count, 1);
  assert.equal(res.body.turnos_completados, 2);
  assert.equal(res.body.total_productos, 10000);
  assert.deepEqual(res.body.por_dia, [{
    id: "2026-08-12",
    nombre: "2026-08-12",
    total: 44000,
    turnos: 3,
    pagos: 3,
    ticket_promedio: 14666.666666666666,
  }]);
});
