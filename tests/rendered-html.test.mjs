import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the finished predictions experience", async () => {
  const [layoutSource, appSource] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PredictionsApp.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);

  assert.match(layoutSource, /Predicciones de la Velada VI/i);
  assert.match(layoutSource, /og\.png/i);
  assert.match(appSource, /Preparando la cartelera/i);
  assert.doesNotMatch(
    `${layoutSource}\n${appSource}`,
    /codex-preview|starter|react-loading-skeleton/i,
  );
});

test("ships the official ten-fight experience", async () => {
  const [eventSource, appSource, portraits] = await Promise.all([
    readFile(new URL("../app/lib/event.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/PredictionsApp.tsx", import.meta.url), "utf8"),
    readdir(new URL("../public/fighters/", import.meta.url)),
  ]);

  assert.match(eventSource, /La Parce/);
  assert.match(eventSource, /TheGrefg/);
  assert.match(eventSource, /id:\s*10/);
  assert.match(eventSource, /weight:\s*2/);
  assert.match(appSource, /Elige un ganador/);
  assert.match(appSource, /Tabla de posiciones/);
  assert.match(appSource, /\/fighters\/\$\{fighter\.slug\}\.webp/);
  assert.equal(portraits.filter((name) => name.endsWith(".webp")).length, 20);
});
