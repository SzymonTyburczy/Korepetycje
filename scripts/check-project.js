const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const files = fs.readdirSync(root, { withFileTypes: true });
const htmlFiles = files.filter((entry) => entry.isFile() && entry.name.endsWith(".html")).map((entry) => entry.name);
const jsFiles = files.filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name);
const errors = [];

function fail(message) {
  errors.push(message);
}

for (const file of jsFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  try {
    new vm.Script(source, { filename: file });
  } catch (error) {
    fail(`${file}: błąd składni JavaScript: ${error.message}`);
  }
}

const expectedSupabase = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js";
const expectedIntegrity = "sha384-BmlQlKlDvXvKoxkn5OQuUo/aJQCTXeB+Kls6EccBmG4Kf8AXvp89RtO9MtPxP/r5";

for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ids = [...source.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  for (const id of new Set(ids)) {
    if (ids.filter((value) => value === id).length > 1) fail(`${file}: powielone id="${id}"`);
  }

  for (const [index, match] of [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
    const type = match[1].match(/\btype=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
    try {
      new vm.Script(match[2], { filename: `${file}:inline-script-${index + 1}` });
    } catch (error) {
      fail(`${file}: błąd składni skryptu inline: ${error.message}`);
    }
  }

  const supabaseTag = source.match(/<script[^>]+src=["']([^"']*supabase-js[^"']*)["'][^>]*>/i)?.[0];
  if (supabaseTag) {
    if (!supabaseTag.includes(expectedSupabase)) fail(`${file}: nieoczekiwana wersja supabase-js`);
    if (!supabaseTag.includes(`integrity="${expectedIntegrity}"`)) fail(`${file}: brak poprawnego SRI dla supabase-js`);
    if (!supabaseTag.includes('crossorigin="anonymous"')) fail(`${file}: brak crossorigin dla SRI`);
  }

  for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const ref = match[1].split(/[?#]/)[0];
    if (!ref || /^(?:https?:|mailto:|tel:|data:)/i.test(ref)) continue;
    if (ref.startsWith("/") && !path.extname(ref)) continue;
    const localRef = ref.startsWith("/") ? ref.slice(1) : ref;
    if (!fs.existsSync(path.resolve(root, localRef))) fail(`${file}: brak lokalnego zasobu ${ref}`);
  }
}

const migrationPath = path.join(root, "supabase", "migrations", "20260716_security_hardening.sql");
if (!fs.existsSync(migrationPath)) {
  fail("Brak migracji bezpieczeństwa Supabase.");
} else {
  const migration = fs.readFileSync(migrationPath, "utf8");
  for (const required of [
    "CREATE OR REPLACE FUNCTION public.request_lesson",
    "'oczekuje', p_notes, NULL, FALSE, NULL",
    "lessons_confirmed_price_required",
    "DROP FUNCTION IF EXISTS public.public_profile_exists",
    "CREATE POLICY lessons_insert",
    "REVOKE ALL PRIVILEGES ON TABLE",
    "trg_prevent_lesson_overlap",
  ]) {
    if (!migration.includes(required)) fail(`Migracja nie zawiera: ${required}`);
  }
  if (/calculated_price|WHEN\s+60\s+THEN\s+100/i.test(migration)) {
    fail("Migracja ponownie zawiera hardcoded stawki lekcji.");
  }
}

const dashboard = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
if (!dashboard.includes('.update({ status: "zaplanowana", price })')) {
  fail("Panel nie zapisuje stawki podczas zatwierdzania lekcji.");
}
if (/const\s+price\s*=\s*dur\s*===/i.test(dashboard)) {
  fail("Panel ponownie zawiera hardcoded stawki zależne od czasu lekcji.");
}

const edgeFunction = path.join(root, "supabase", "functions", "delete-user", "index.ts");
if (!fs.existsSync(edgeFunction)) {
  fail("Brak Edge Function delete-user.");
} else {
  const check = spawnSync(process.execPath, ["--experimental-strip-types", "--check", edgeFunction], {
    encoding: "utf8",
  });
  if (check.status !== 0) fail(`delete-user/index.ts: błąd składni: ${check.stderr.trim()}`);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Kontrola zakończona: ${htmlFiles.length} plików HTML i ${jsFiles.length} plików JS bez wykrytych błędów.`);
