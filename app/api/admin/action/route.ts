import {
  adminPinIsValid,
  ensureSchema,
  getD1,
} from "@/app/lib/db";
import { getFight, winnerIsValid } from "@/app/lib/event";
import { buildAdminState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

type AdminAction =
  | { action: "setManualLock"; locked?: boolean }
  | { action: "setLockAt"; lockAt?: string }
  | { action: "setResult"; fightId?: number; winnerSlug?: string }
  | { action: "clearResult"; fightId?: number };

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
