import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
for (const name of [".env.local", ".env"]) {
  const file = path.join(projectRoot, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const generate = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "generate-rescene-catalog.mjs")], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (generate.error) throw generate.error;
if (generate.status !== 0) process.exit(generate.status ?? 1);

const children = [
  spawn(process.execPath, [path.join(projectRoot, "scripts", "local-catalog-server.mjs")], { cwd: projectRoot, stdio: "inherit", env: process.env }),
  spawn(process.execPath, [path.join(projectRoot, "scripts", "run-framework.mjs"), "dev", ...process.argv.slice(2)], { cwd: projectRoot, stdio: "inherit", env: process.env }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
for (const child of children) {
  child.on("exit", (code) => {
    if (!stopping) {
      stop();
      process.exitCode = code ?? 1;
    }
  });
}

