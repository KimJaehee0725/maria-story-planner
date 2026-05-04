const fs = require("fs/promises");
const path = require("path");

const root = path.resolve(__dirname, "..");
const e2eStorageDir = path.join(root, ".tmp", "e2e-storage");
const projectDir = path.join(e2eStorageDir, "projects");
const sourceSeed = path.join(root, "src", "seed-project.json");
const targetProject = path.join(projectDir, "default.json");

async function main() {
  const seed = JSON.parse(await fs.readFile(sourceSeed, "utf8"));
  await fs.rm(e2eStorageDir, { recursive: true, force: true });
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(targetProject, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
