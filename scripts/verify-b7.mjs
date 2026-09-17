import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createDatabase } from "../server/src/db/client.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const browser = process.argv.includes("--browser");
if (process.env.APP_ENV !== "test" || process.env.B7_ISOLATED_DB !== "1" || !process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error("B7 requires APP_ENV=test, B7_ISOLATED_DB=1, DATABASE_URL and JWT_SECRET; use an exclusive migrated/seeded TEST database");
}
let target;
try { target = new URL(process.env.DATABASE_URL); } catch { throw new Error("DATABASE_URL is not a valid PostgreSQL URL"); }
if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("DATABASE_URL must use the PostgreSQL protocol");
if (["", "/postgres", "/template0", "/template1"].includes(target.pathname)) throw new Error("Use a dedicated application TEST database, not a PostgreSQL maintenance database");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this verifier via npm run test:b7 or npm run test:b7-browser");
const report = { startedAt: new Date().toISOString(), browser, steps: [], passed: false };
const reportDir = join(root, ".artifacts", "b7");
const helpers = [];
let activeStep;
let interrupted = false;
const execute = (args, env = process.env) => new Promise((resolve, reject) => {
  if (interrupted) { reject(new Error("Verification interrupted")); return; }
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit", windowsHide: true }); activeStep = child;
  child.once("error", reject); child.once("exit", (code, signal) => {
    activeStep = undefined;
    if (code === 0) resolve(); else reject(new Error(`Verification step failed: code=${code}, signal=${signal || "none"}`));
  });
});
const step = async (name, action) => {
  const start = Date.now(); console.log(`\n[B7] ${name}`);
  try { await action(); report.steps.push({ name, passed: true, durationMs: Date.now() - start }); }
  catch (error) { report.steps.push({ name, passed: false, durationMs: Date.now() - start }); throw error; }
};
const npm = (script, env) => execute([npmCli, "run", script], env);
const stop = async (child) => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
};
const interrupt = () => { interrupted = true; activeStep?.kill(); for (const child of helpers) child.kill(); };
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close((error) => error ? reject(error) : resolve(port)); });
});
const startHelper = (args, env) => {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  child.on("error", () => { /* Readiness check reports a failed startup. */ }); helpers.push(child); return child;
};
const ready = async (url, child, api = false) => {
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    if (interrupted) throw new Error("Verification interrupted");
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Temporary verification service exited before readiness");
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (!api || (await response.json()).data?.environment === "test")) return;
    } catch { /* Allow a short startup delay; never continue after the deadline. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Temporary verification service did not become ready within 30 seconds");
};
try {
  await mkdir(reportDir, { recursive: true });
  await step("Isolated database preflight", async () => {
    const connection = createDatabase(process.env.DATABASE_URL, 1);
    try {
      const rows = await connection.sql`select application_deadline from requests where id = '30000000-0000-4000-8000-000000000001'`;
      if (!rows.length || new Date(rows[0].application_deadline) <= new Date()) throw new Error("Missing or elapsed seed request: migrate/seed a fresh isolated TEST database; do not bypass production deadlines");
    } finally { await connection.close(); }
  });
  for (const name of ["lint", "server:build", "typecheck:h5", "test:b7-unit", "test:b1-schema", "test:b3-schema", "test:server", "test:b5", "test:b6", "test:p0-requests", "test"]) {
    await step(name, () => npm(name));
  }
  if (browser) {
    const apiPort = await freePort(); const h5Port = await freePort();
    const apiUrl = `http://127.0.0.1:${apiPort}`; const h5Url = `http://127.0.0.1:${h5Port}`;
    const env = { ...process.env, PORT: String(apiPort), CORS_ORIGIN: h5Url, VITE_API_BASE_URL: apiUrl,
      B5_API_URL: apiUrl, B5_H5_URL: h5Url, B5_TEST_DB_ALLOW_WRITES: "1", B5_SCREENSHOT_DIR: join(reportDir, "screenshots") };
    await step("build:edgeone", () => npm("build:edgeone", env));
    await step("Temporary TEST API and H5 startup", async () => {
      const api = startHelper(["dist-server/index.js"], env);
      const h5 = startHelper(["node_modules/vite/bin/vite.js", "preview", "--config", "vite.edgeone.config.ts", "--host", "127.0.0.1", "--port", String(h5Port), "--strictPort"], env);
      await Promise.all([ready(`${apiUrl}/health`, api, true), ready(h5Url, h5)]);
    });
    await step("Multi-account browser/database end-to-end", () => npm("test:b6-browser", env));
  } else await step("build:edgeone", () => npm("build:edgeone"));
  report.passed = true;
} catch {
  // Detailed step output is already printed. Do not copy connection strings or
  // secret-bearing database exceptions into the persistent report.
  console.error("[B7] FAILED. See the failing step above; no later verification steps were run."); process.exitCode = 1;
} finally {
  await Promise.all(helpers.map(stop));
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  report.finishedAt = new Date().toISOString();
  const json = JSON.stringify(report, null, 2);
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, `${report.startedAt.replace(/[^0-9]/g, "")}.json`), json);
  await writeFile(join(reportDir, "latest.json"), json);
  console.log(`[B7] ${report.passed ? "PASS" : "FAIL"}; report: .artifacts/b7/latest.json`);
}
