const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "..",
  "..",
  "database",
  "security_rpc_asignar_siguiente_cliente.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

test("migration restringe EXECUTE de asignar_siguiente_cliente a service_role", () => {
  assert.match(
    sql,
    /revoke execute on function public\.asignar_siguiente_cliente\(uuid\) from public;/i
  );
  assert.match(
    sql,
    /revoke execute on function public\.asignar_siguiente_cliente\(uuid\) from anon;/i
  );
  assert.match(
    sql,
    /revoke execute on function public\.asignar_siguiente_cliente\(uuid\) from authenticated;/i
  );
  assert.match(
    sql,
    /grant execute on function public\.asignar_siguiente_cliente\(uuid\) to service_role;/i
  );
});

test("migration no modifica implementacion ni seguridad de la funcion", () => {
  assert.doesNotMatch(sql, /\bcreate\s+(or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(sql, /\balter\s+function\b/i);
  assert.doesNotMatch(sql, /\bsecurity\s+definer\b/i);
  assert.doesNotMatch(sql, /\bsecurity\s+invoker\b/i);
});
