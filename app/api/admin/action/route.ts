import {
  adminPinIsValid,
  ensureSchema,
  getD1,
  getOutfitSettings,
  type OutfitStatus,
} from "@/app/lib/db";
import { getFight, winnerIsValid } from "@/app/lib/event";
import { buildAdminState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

type AdminAction =
  | { action: "setManualLock"; locked?: boolean }
  | { action: "setLockAt"; lockAt?: string }
  | { action: "setResult"; fightId?: number; winnerSlug?: string }
  | { action: "clearResult"; fightId?: number }
  | { action: "setOutfitStatus"; status?: OutfitStatus }
  | { action: "clearOutfitVotes" };

export async function POST(request: Request) {
  if (!adminPinIsValid(request.headers.get("x-admin-pin"))) {
    return Response.json({ error: "Código incorrecto." }, { status: 401 });
  }

  try {
    await ensureSchema();
    const payload = (await request.json()) as AdminAction;
    const now = new Date().toISOString();

    if (payload.action === "setManualLock") {
      if (typeof payload.locked !== "boolean") {
        return Response.json(
          { error: "El estado de cierre no es válido." },
          { status: 400 },
        );
      }
      if (!payload.locked) {
        const resultCount = await getD1()
          .prepare("SELECT COUNT(*) AS count FROM results")
          .first<{ count: number }>();
        if (Number(resultCount?.count ?? 0) > 0) {
          return Response.json(
            {
              error:
                "No se puede reabrir mientras haya resultados cargados. Bórralos primero.",
            },
            { status: 409 },
          );
        }
      }
      await getD1()
        .prepare(
          "UPDATE event_settings SET manual_locked = ?, updated_at = ? WHERE id = 1",
        )
        .bind(payload.locked ? 1 : 0, now)
        .run();
    } else if (payload.action === "setLockAt") {
      const parsed = Date.parse(payload.lockAt ?? "");
      if (!Number.isFinite(parsed)) {
        return Response.json(
          { error: "La hora de cierre no es válida." },
          { status: 400 },
        );
      }
      await getD1()
        .prepare(
          "UPDATE event_settings SET lock_at = ?, updated_at = ? WHERE id = 1",
        )
        .bind(new Date(parsed).toISOString(), now)
        .run();
    } else if (payload.action === "setResult") {
      const fightId = Number(payload.fightId);
      const winnerSlug = payload.winnerSlug ?? "";
      if (!winnerIsValid(fightId, winnerSlug)) {
        return Response.json(
          { error: "Ese resultado no corresponde al combate." },
          { status: 400 },
        );
      }
      const db = getD1();
      await db.batch([
        db
          .prepare(
            "UPDATE event_settings SET manual_locked = 1, updated_at = ? WHERE id = 1",
          )
          .bind(now),
        db
          .prepare(
            `INSERT INTO results (fight_id, winner_slug, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(fight_id)
             DO UPDATE SET winner_slug = excluded.winner_slug, updated_at = excluded.updated_at`,
          )
          .bind(fightId, winnerSlug, now),
      ]);
    } else if (payload.action === "clearResult") {
      const fightId = Number(payload.fightId);
      if (!Number.isInteger(fightId) || !getFight(fightId)) {
        return Response.json(
          { error: "Ese combate no existe." },
          { status: 400 },
        );
      }
      await getD1()
        .prepare("DELETE FROM results WHERE fight_id = ?")
        .bind(fightId)
        .run();
    } else if (payload.action === "setOutfitStatus") {
      const status = payload.status;
      if (!status || !["draft", "open", "closed"].includes(status)) {
        return Response.json(
          { error: "El estado de Mejor Outfit no es válido." },
          { status: 400 },
        );
      }
      const current = await getOutfitSettings();
      if (status === current.status) {
        return Response.json(await buildAdminState());
      }

      if (status === "draft") {
        const voteCount = await getD1()
          .prepare("SELECT COUNT(*) AS count FROM outfit_votes")
          .first<{ count: number }>();
        if (Number(voteCount?.count ?? 0) > 0) {
          return Response.json(
            {
              error:
                "Borra primero los votos para volver a preparar la galería.",
            },
            { status: 409 },
          );
        }
        await getD1()
          .prepare(
            "UPDATE outfit_settings SET status = 'draft', opened_at = NULL, closed_at = NULL, updated_at = ? WHERE id = 1",
          )
          .bind(now)
          .run();
      } else if (status === "open") {
        if (current.status === "closed") {
          return Response.json(
            {
              error:
                "Una votación cerrada no se puede reabrir. Borra los votos para iniciar una nueva.",
            },
            { status: 409 },
          );
        }
        const photoCount = await getD1()
          .prepare("SELECT COUNT(*) AS count FROM outfit_photos")
          .first<{ count: number }>();
        if (Number(photoCount?.count ?? 0) < 2) {
          return Response.json(
            { error: "Sube al menos dos fotos antes de abrir la votación." },
            { status: 409 },
          );
        }
        await getD1()
          .prepare(
            "UPDATE outfit_settings SET status = 'open', opened_at = ?, closed_at = NULL, updated_at = ? WHERE id = 1 AND status = 'draft'",
          )
          .bind(now, now)
          .run();
      } else {
        if (current.status !== "open") {
          return Response.json(
            { error: "La votación debe estar abierta antes de cerrarla." },
            { status: 409 },
          );
        }
        await getD1()
          .prepare(
            "UPDATE outfit_settings SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = 1 AND status = 'open'",
          )
          .bind(now, now)
          .run();
      }
    } else if (payload.action === "clearOutfitVotes") {
      const current = await getOutfitSettings();
      if (current.status !== "closed") {
        return Response.json(
          { error: "Solo puedes reiniciar una votación después de cerrarla." },
          { status: 409 },
        );
      }
      const db = getD1();
      await db.batch([
        db.prepare("DELETE FROM outfit_votes"),
        db
          .prepare(
            "UPDATE outfit_settings SET status = 'draft', opened_at = NULL, closed_at = NULL, updated_at = ? WHERE id = 1",
          )
          .bind(now),
      ]);
    } else {
      return Response.json({ error: "Acción no reconocida." }, { status: 400 });
    }

    return Response.json(await buildAdminState());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible aplicar el cambio.";
    return Response.json({ error: message }, { status: 500 });
  }
}
