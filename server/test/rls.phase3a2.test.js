const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(__dirname, "..", "..", "database", "security_rls_phase3a2.sql");
const sql = fs.readFileSync(migrationPath, "utf8");

const protectedTables = [
  "usuarios",
  "barberias",
  "turnos",
  "barberos",
  "servicios",
  "horarios_barbero",
  "excepciones_barbero",
];

const selectPolicies = [
  ["usuarios_select_own", "usuarios"],
  ["barberias_select_same_tenant", "barberias"],
  ["turnos_select_same_tenant", "turnos"],
  ["barberos_select_same_tenant", "barberos"],
  ["servicios_select_same_tenant", "servicios"],
  ["horarios_barbero_select_same_tenant", "horarios_barbero"],
  ["excepciones_barbero_select_same_tenant", "excepciones_barbero"],
];

const legacyPoliciesToDrop = [
  ['"Usuario ve su propio registro"', "usuarios"],
  ['"Usuario ve su barbería"', "barberias"],
  ['"Panel lee turnos"', "turnos"],
  ['"Panel escribe turnos"', "turnos"],
  ['"Panel lee barberos"', "barberos"],
  ['"Panel escribe barberos"', "barberos"],
  ['"Panel lee servicios"', "servicios"],
  ['"Panel escribe servicios"', "servicios"],
  ['"Panel lee horarios"', "horarios_barbero"],
  ['"Panel escribe horarios"', "horarios_barbero"],
  ['"Panel lee excepciones"', "excepciones_barbero"],
  ['"Panel escribe excepciones"', "excepciones_barbero"],
];

function policyBlock(policyName) {
  const match = sql.match(new RegExp(`create policy ${policyName}[\\s\\S]*?;`, "i"));
  assert.ok(match, `No se encontro policy ${policyName}`);
  return match[0];
}

test("migration habilita RLS en todas las tablas prioritarias", () => {
  for (const table of protectedTables) {
    assert.match(sql, new RegExp(`alter table ${table} enable row level security;`, "i"));
  }
});

test("migration crea solo policies SELECT frontend para tablas prioritarias", () => {
  for (const [policyName, table] of selectPolicies) {
    const block = policyBlock(policyName);
    assert.match(block, new RegExp(`on ${table}`, "i"));
    assert.match(block, /for select/i);
    assert.match(block, /to authenticated/i);
  }

  const createdPolicies = [...sql.matchAll(/create policy ([a-z0-9_]+)/gi)].map((match) => match[1]).sort();
  assert.deepEqual(createdPolicies, selectPolicies.map(([name]) => name).sort());
});

test("migration elimina explicitamente policies legacy encontradas en produccion", () => {
  for (const [policyName, table] of legacyPoliciesToDrop) {
    assert.match(
      sql,
      new RegExp(`drop policy if exists ${policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} on ${table};`, "i"),
      `Falta drop explicito de ${policyName} en ${table}`
    );
  }
});

test("migration no elimina policies Solo backend de service_role", () => {
  assert.doesNotMatch(sql, /drop policy if exists "Solo backend"/i);
});

test("usuarios solo permite leer el registro propio", () => {
  const block = policyBlock("usuarios_select_own");
  assert.match(block, /using\s*\(\s*id\s*=\s*auth\.uid\(\)\s*\)/i);
  assert.doesNotMatch(sql, /create policy usuarios_.*for update/i);
  assert.doesNotMatch(sql, /create policy usuarios_.*for insert/i);
  assert.doesNotMatch(sql, /create policy usuarios_.*for delete/i);
});

test("policies tenant usan usuarios.id = auth.uid y barberia_id correspondiente", () => {
  for (const [policyName, table] of selectPolicies.filter(([, table]) => table !== "usuarios")) {
    const block = policyBlock(policyName);
    assert.match(block, /from usuarios u/i);
    assert.match(block, /u\.id\s*=\s*auth\.uid\(\)/i);
    const targetColumn = table === "barberias" ? "barberias.id" : `${table}.barberia_id`;
    assert.match(block, new RegExp(`u\\.barberia_id\\s*=\\s*${targetColumn.replace(".", "\\.")}`, "i"));
  }
});

test("horarios y excepciones verifican coherencia con barbero del mismo tenant", () => {
  assert.match(policyBlock("horarios_barbero_select_same_tenant"), /join barberos b[\s\S]*b\.id\s*=\s*horarios_barbero\.barbero_id[\s\S]*b\.barberia_id\s*=\s*horarios_barbero\.barberia_id/i);
  assert.match(policyBlock("excepciones_barbero_select_same_tenant"), /join barberos b[\s\S]*b\.id\s*=\s*excepciones_barbero\.barbero_id[\s\S]*b\.barberia_id\s*=\s*excepciones_barbero\.barberia_id/i);
});

test("frontend no conserva mutaciones directas a tablas protegidas de la fase", () => {
  const frontendDir = path.join(__dirname, "..", "..", "frontend", "src");
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      if (entry.isFile() && /\.(jsx|js)$/.test(entry.name)) files.push(fullPath);
    }
  }

  walk(frontendDir);
  const targetTables = protectedTables.map((table) => table.replace("_", "\\_")).join("|");
  const directMutation = new RegExp(`\\.from\\((["'])(${targetTables})\\1\\)[\\s\\S]{0,200}\\.(insert|update|upsert|delete)\\(`, "i");

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(content, directMutation, `Mutacion directa detectada en ${file}`);
  }
});
