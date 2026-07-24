import {
  ensureSchema,
  getD1,
  getParticipantByToken,
  getSettings,
  isLocked,
} from "@/app/lib/db";
import { winnerIsValid } from "@/app/lib/event";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    await ensureSchema();
    const participant = await getParticipantByToken(
      request.headers.get("x-edit-token"),
    );
    if (!participant) {
      return Response.json(
        { error: "Este dispositivo no tiene una sesión válida." },
        { status: 401 },
      );
    }
    if (isLocked(await getSettings())) {
      return Response.json(
        { error: "El tiempo terminó: tus predicciones están en solo lectura." },
        { status: 423 },
      );
    }

    const payload = (await request.json()) as {
      picks?: Record<string, string>;
    };
    const entries = Object.entries(payload.picks ?? {});
    if (entries.length === 0 || entries.length > 10) {
      return Response.json(
        { error: "Selecciona al menos un ganador válido." },
        { status: 400 },
      );
    }

    const normalized = entries.map(([fightIdValue, winnerSlug]) => {
      const fightId = Number(fightIdValue);
      if (
        !Number.isInteger(fightId) ||
        typeof winnerSlug !== "string" ||
        !winnerIsValid(fightId, winnerSlug)
      ) {
        throw new Error("INVALID_PICK");
      }
      return { fightId, winnerSlug };
    });

    const now = new Date().toISOString();
    await getD1().batch(
      normalized.map(({ fightId, winnerSlug }) =>
        getD1()
          .prepare(
            `INSERT INTO predictions (participant_id, fight_id, winner_slug, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(participant_id, fight_id)
             DO UPDATE SET winner_slug = excluded.winner_slug, updated_at = excluded.updated_at`,
          )
          .bind(participant.id, fightId, winnerSlug, now),
      ),
    );

    return Response.json({ savedCount: normalized.length, savedAt: now });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PICK") {
      return Response.json(
        { error: "Hay una selección que no corresponde a la cartelera." },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : "No fue posible guardar.";
    return Response.json({ error: message }, { status: 500 });
  }
}
