const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env");

function stripInlineComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const prev = value[index - 1];
    if ((char === "\"" || char === "'") && prev !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "#" && !quote && /\s/.test(prev || "")) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const body = fs.readFileSync(filePath, "utf8");
  body.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const assignment = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
    const equalsAt = assignment.indexOf("=");
    if (equalsAt <= 0) return;

    const key = assignment.slice(0, equalsAt).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return;
    if (process.env[key] !== undefined) return;

    process.env[key] = unquote(stripInlineComment(assignment.slice(equalsAt + 1)));
  });
}

loadEnvFile(ENV_FILE);
require(path.join(ROOT, "server.js"));
