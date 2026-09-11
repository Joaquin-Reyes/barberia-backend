const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_KEY ||= "test-key";
process.env.SUPABASE_SERVICE_ROLE ||= "test-service-role";
const { supabaseAdmin } = require("../config/supabase");
const { listTurnosParaCobrar } = require("../contollers/pagos.controller");

test("cobros lee pagos y productos en paralelo y conserva importes y tenant", async () => {
  const original = supabaseAdmin.from;
  const started = new Set();
  const pending = [];
  const rows = {
    turnos: [{ id: "t", precio: 100, estado: "completado" }],
    pagos: [{ turno_id: "t", monto: 80 }],
    turno_productos: [{ turno_id: "t", subtotal: 30 }],
  };
  supabaseAdmin.from = (table) => {
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push([column, value]); return builder; },
      gte() { return builder; }, lte() { return builder; },
      order() { return builder; }, in() { return builder; }, is() { return builder; },
      then(resolve, reject) {
        assert(filters.some(([column, value]) => column === "barberia_id" && value === "local"));
        if (table === "turnos") return Promise.resolve({ data: rows[table] }).then(resolve, reject);
        started.add(table);
        const result = new Promise((done) => pending.push(() => done({ data: rows[table] })));
        if (started.size === 2) pending.splice(0).forEach((done) => done());
        return result.then(resolve, reject);
      },
    };
    return builder;
  };
  try {
    const res = { json(body) { this.body = body; } };
    await listTurnosParaCobrar({ user: { barberia_id: "local" }, query: {} }, res);
    assert.equal(started.size, 2);
    assert.equal(res.body[0].total_cobrable, 130);
    assert.equal(res.body[0].total_pagado, 80);
    assert.equal(res.body[0].saldo, 50);
  } finally {
    supabaseAdmin.from = original;
  }
});
