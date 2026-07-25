import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("builds the finished predictions experience", async () => {
  const [layoutSource, appSource] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PredictionsApp.tsx", import.meta.url), "utf8"),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
  ]);

  assert.match(layoutSource, /Predicciones de la Velada VI/i);
  assert.match(layoutSource, /og-outfit\.png/i);
  assert.match(appSource, /Preparando la cartelera/i);
  assert.doesNotMatch(
    `${layoutSource}\n${appSource}`,
    /codex-preview|starter|react-loading-skeleton/i,
  );
});

test("ships the official ten-fight experience", async () => {
  const [eventSource, profileSource, appSource, portraits] = await Promise.all([
    readFile(new URL("../app/lib/event.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/lib/fighterProfiles.ts", import.meta.url),
      "utf8",
    ),
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
  assert.match(appSource, /<details className="fight-insight">/);
  assert.match(appSource, /Edad, altura, pesaje y quiénes son/);
  assert.match(appSource, /formatWeighIn/);
  const profileEntries = profileSource.match(
    /^\s{2}(?:"[a-z0-9-]+"|[a-z][a-z0-9-]*): \{$/gm,
  );
  assert.equal(profileEntries?.length, 20);
  assert.equal(profileSource.match(/weighInKg: null/g)?.length, 2);
  assert.match(profileSource, /WEIGH_IN_SOURCE_URL/);
  const portraitFiles = portraits.filter((name) => name.endsWith(".webp"));
  assert.equal(portraitFiles.length, 20);
  await Promise.all(
    portraitFiles.map(async (name) => {
      const bytes = await readFile(
        new URL(`../public/fighters/${name}`, import.meta.url),
      );
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
      assert.ok(bytes.length > 1_000);
    }),
  );
});

test("includes the secret Mejor Outfit voting flow", async () => {
  const [appSource, outfitSource, adminSource, schemaSource, voteRoute, css] =
    await Promise.all([
      readFile(new URL("../app/PredictionsApp.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/OutfitVoting.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/admin/OutfitAdmin.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/outfit/vote/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);

  assert.match(appSource, /Mejor Outfit/);
  assert.match(appSource, /activeView === "outfit"/);
  assert.match(outfitSource, /TU OUTFIT · NO ELEGIBLE/);
  assert.match(outfitSource, /candidateParticipantId/);
  assert.match(adminSource, /Abrir votación/);
  assert.match(adminSource, /capture="environment"/);
  assert.match(schemaSource, /outfit/i);
  assert.match(voteRoute, /candidateParticipantId/);
  assert.match(voteRoute, /participant/i);
  assert.match(css, /\.event-logo\s*\{[^}]*height:\s*auto/s);
  assert.doesNotMatch(css, /\.event-logo\s*\{[^}]*object-fit:\s*fill/s);
});
