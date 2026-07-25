import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_DATABASE_NAME = "predicciones-velada-vi";
const DEFAULT_BUCKET_NAME = "predicciones-velada-vi-outfit-photos";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const R2_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

function printUsage() {
  console.error(
    [
      "Uso:",
      "  npm run cf:config -- --database-id <UUID_REAL_DE_D1>",
      "    [--database-name <nombre>] [--bucket-name <nombre>] [--force]",
    ].join("\n"),
  );
}

function parseArguments(argv) {
  const values = new Map();
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (
      argument !== "--database-id" &&
      argument !== "--database-name" &&
      argument !== "--bucket-name"
    ) {
      throw new Error(`Argumento desconocido: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Falta el valor de ${argument}`);
    }
    values.set(argument, value);
    index += 1;
  }

  return { force, values };
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function main() {
  const { force, values } = parseArguments(process.argv.slice(2));
  const databaseId = values.get("--database-id") ?? "";
  const databaseName =
    values.get("--database-name") ?? DEFAULT_DATABASE_NAME;
  const bucketName = values.get("--bucket-name") ?? DEFAULT_BUCKET_NAME;

  if (!UUID_PATTERN.test(databaseId)) {
    throw new Error(
      "--database-id debe ser el UUID real devuelto por `wrangler d1 create`.",
    );
  }
  if (!databaseName.trim() || databaseName.includes("__")) {
    throw new Error("--database-name no es válido.");
  }
  if (!R2_NAME_PATTERN.test(bucketName)) {
    throw new Error(
      "--bucket-name debe tener entre 3 y 63 caracteres en minúscula, números o guiones.",
    );
  }

  const templateUrl = new URL("../wrangler.jsonc.example", import.meta.url);
  const outputUrl = new URL("../wrangler.jsonc", import.meta.url);
  const outputPath = fileURLToPath(outputUrl);
  if (!force && (await exists(outputPath))) {
    throw new Error(
      "wrangler.jsonc ya existe. Usa --force únicamente si quieres regenerarlo.",
    );
  }

  const template = await readFile(templateUrl, "utf8");
  const config = template
    .replaceAll("__D1_DATABASE_NAME__", databaseName)
    .replaceAll("__D1_DATABASE_ID__", databaseId)
    .replaceAll("__R2_BUCKET_NAME__", bucketName);

  if (config.includes("__D1_") || config.includes("__R2_")) {
    throw new Error("La plantilla conserva valores pendientes de sustituir.");
  }

  await writeFile(outputUrl, config, "utf8");
  console.log(`Configuración creada en ${outputPath}`);
  console.log(`D1: ${databaseName} (${databaseId})`);
  console.log(`R2: ${bucketName}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  printUsage();
  process.exitCode = 1;
});
