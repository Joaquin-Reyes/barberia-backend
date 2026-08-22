const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "test-key";
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "test-service-role";
process.env.WHATSAPP_ENABLED = "false";

const { supabaseAdmin } = require("../config/supabase");
const authController = require("../contollers/auth.controller");
const adminController = require("../contollers/admin.controller");

const originalFrom = supabaseAdmin.from;
const originalGetUser = supabaseAdmin.auth.getUser;
const originalListUsers = supabaseAdmin.auth.admin.listUsers;
const originalInviteUserByEmail = supabaseAdmin.auth.admin.inviteUserByEmail;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMock(seed = {}, auth = {}) {
  const db = clone(seed);
  const calls = [];
  const invited = [];

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

      return Promise.resolve({ data: matched, error: null });
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
      eq(column, value) {
        state.filters.push({ type: "eq", column, value });
        return builder;
      },
      ilike(column, value) {
        state.filters.push({ type: "ilike", column, value });
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
  supabaseAdmin.auth.getUser = async () => ({ data: { user: auth.user }, error: auth.user ? null : { message: "invalid" } });
  supabaseAdmin.auth.admin.listUsers = async () => ({ data: { users: auth.users || [] }, error: null });
  supabaseAdmin.auth.admin.inviteUserByEmail = async (email, options) => {
    invited.push({ email, options });
    if (auth.inviteError) return { data: null, error: auth.inviteError };
    const invitedUser = auth.inviteUser || {
      id: `auth-${email}`,
      email,
      user_metadata: options?.data || {},
    };
    return { data: { user: invitedUser }, error: null };
  };

  return { db, calls, invited };
}

function res() {
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

function req(overrides = {}) {
  return {
    headers: { authorization: "Bearer token" },
    body: {},
    params: {},
    user: null,
    ...overrides,
  };
}

test.afterEach(() => {
  supabaseAdmin.from = originalFrom;
  supabaseAdmin.auth.getUser = originalGetUser;
  supabaseAdmin.auth.admin.listUsers = originalListUsers;
  supabaseAdmin.auth.admin.inviteUserByEmail = originalInviteUserByEmail;
});

test("barbero de Barberia A activa correctamente su cuenta y queda vinculado", async () => {
  const { db } = createMock(
    {
      usuarios: [],
      barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", usuario_id: null }],
    },
    {
      user: {
        id: "user-a",
        email: "juan@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-a", barbero_id: "barbero-a" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(db.usuarios[0].id, "user-a");
  assert.equal(db.usuarios[0].barberia_id, "barberia-a");
  assert.equal(db.usuarios[0].rol, "barbero");
  assert.equal(db.barberos[0].usuario_id, "user-a");
});

test("metadata con barbero de A y barberia B es rechazada", async () => {
  const { db } = createMock(
    {
      usuarios: [],
      barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", usuario_id: null }],
    },
    {
      user: {
        id: "user-x",
        email: "x@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-b", barbero_id: "barbero-a" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
  assert.equal(db.usuarios.length, 0);
  assert.equal(db.barberos[0].usuario_id, null);
});

test("usuario de Barberia A no termina vinculado a barbero de B", async () => {
  const { db } = createMock(
    {
      usuarios: [{ id: "user-a", email: "a@example.com", rol: "barbero", barberia_id: "barberia-a" }],
      barberos: [{ id: "barbero-b", barberia_id: "barberia-b", nombre: "Pedro", usuario_id: null }],
    },
    {
      user: {
        id: "user-a",
        email: "a@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-b", barbero_id: "barbero-b" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
  assert.equal(db.barberos[0].usuario_id, null);
});

test("update de barberos.usuario_id usa id y barberia_id", async () => {
  const { calls } = createMock(
    {
      usuarios: [],
      barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", usuario_id: null }],
    },
    {
      user: {
        id: "user-a",
        email: "juan@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-a", barbero_id: "barbero-a" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  const update = calls.find((call) => call.table === "barberos" && call.action === "update");
  assert.ok(update);
  assert.ok(update.filters.some((filter) => filter.column === "id" && filter.value === "barbero-a"));
  assert.ok(update.filters.some((filter) => filter.column === "barberia_id" && filter.value === "barberia-a"));
});

test("metadata incompleta no dispara busqueda global de barberos", async () => {
  const { calls } = createMock(
    {
      usuarios: [],
      barberos: [{ id: "barbero-libre", barberia_id: "barberia-z", nombre: "Libre", usuario_id: null }],
    },
    {
      user: {
        id: "user-x",
        email: "x@example.com",
        user_metadata: { rol: "barbero" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
  assert.equal(calls.some((call) => call.table === "barberos"), false);
});

test("si falta barbero_id la activacion falla controladamente", async () => {
  createMock({ usuarios: [], barberos: [] }, {
    user: {
      id: "user-x",
      email: "x@example.com",
      user_metadata: { rol: "barbero", barberia_id: "barberia-a" },
    },
  });

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
});

test("si falta barberia_id la activacion falla controladamente", async () => {
  createMock({ usuarios: [], barberos: [] }, {
    user: {
      id: "user-x",
      email: "x@example.com",
      user_metadata: { rol: "barbero", barbero_id: "barbero-a" },
    },
  });

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
});

test("usuario existente en Barberia A no puede ser reasignado a Barberia B", async () => {
  const { db } = createMock(
    {
      usuarios: [{ id: "user-a", email: "a@example.com", rol: "barbero", barberia_id: "barberia-a" }],
      barberos: [{ id: "barbero-b", barberia_id: "barberia-b", nombre: "Pedro", usuario_id: null }],
    },
    {
      user: {
        id: "user-a",
        email: "a@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-b", barbero_id: "barbero-b" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 400);
  assert.equal(db.usuarios[0].barberia_id, "barberia-a");
  assert.equal(db.barberos[0].usuario_id, null);
});

test("usuario existente correcto repite activacion idempotente sin duplicados", async () => {
  const { db } = createMock(
    {
      usuarios: [{ id: "user-a", email: "a@example.com", rol: "barbero", barberia_id: "barberia-a" }],
      barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", usuario_id: "user-a" }],
    },
    {
      user: {
        id: "user-a",
        email: "a@example.com",
        user_metadata: { rol: "barbero", barberia_id: "barberia-a", barbero_id: "barbero-a" },
      },
    }
  );

  const response = res();
  await authController.activarCuenta(req(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(db.usuarios.length, 1);
  assert.equal(db.barberos[0].usuario_id, "user-a");
});

test("email Auth existente de otro tenant no se reutiliza para nuevo barbero", async () => {
  const { db } = createMock(
    {
      usuarios: [{ id: "auth-existing", email: "pedro@example.com", rol: "barbero", barberia_id: "barberia-b" }],
      barberos: [{ id: "barbero-a", barberia_id: "barberia-a", nombre: "Juan", usuario_id: null }],
    },
    {
      users: [{ id: "auth-existing", email: "pedro@example.com", user_metadata: { rol: "barbero", barberia_id: "barberia-b", barbero_id: "barbero-b" } }],
      inviteError: { message: "User already registered" },
    }
  );

  const response = res();
  await adminController.reenviarInvitacion(
    req({
      user: { id: "admin-a", rol: "admin", barberia_id: "barberia-a" },
      params: { id: "barbero-a" },
      body: { email: "pedro@example.com" },
    }),
    response
  );

  assert.equal(response.statusCode, 500);
  assert.equal(db.barberos[0].usuario_id, null);
});

test("admin A no puede reenviar invitacion de barbero B", async () => {
  createMock({
    barberos: [{ id: "barbero-b", barberia_id: "barberia-b", nombre: "Pedro", usuario_id: null }],
  });

  const response = res();
  await adminController.reenviarInvitacion(
    req({
      user: { id: "admin-a", rol: "admin", barberia_id: "barberia-a" },
      params: { id: "barbero-b" },
      body: { email: "pedro@example.com" },
    }),
    response
  );

  assert.equal(response.statusCode, 404);
});

test("crearBarbero usa siempre barberia del usuario autenticado", async () => {
  const { db, invited } = createMock(
    {
      usuarios: [],
      barberos: [],
    },
    {
      inviteUser: { id: "auth-new", email: "juan@example.com", user_metadata: {} },
    }
  );

  const response = res();
  await adminController.crearBarbero(
    req({
      user: { id: "admin-a", rol: "admin", barberia_id: "barberia-a" },
      body: { nombre: "Juan", telefono: "111", email: "juan@example.com", barberia_id: "barberia-b" },
    }),
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(db.barberos[0].barberia_id, "barberia-a");
  assert.equal(invited[0].options.data.barberia_id, "barberia-a");
  assert.equal(invited[0].options.data.barbero_id, db.barberos[0].id);
});
