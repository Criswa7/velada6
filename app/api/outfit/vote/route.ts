import {
  createOutfitVoterKey,
  ensureSchema,
  getD1,
  getOutfitSettings,
  getParticipantByToken,
} from "@/app/lib/db";

export const dynamic = "force-dynamic";

type VotePayload = {
  participantId?: string;
  candidateParticipantId?: string;
};

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

    const settings = await getOutfitSettings();
    if (settings.status !== "open" || !settings.opened_at) {
      return Response.json(
        { error: "La votación de Mejor Outfit no está abierta." },
        { status: 423 },
      );
    }
    if (
      !Number.isFinite(Date.parse(settings.opened_at)) ||
      Date.parse(participant.created_at) > Date.parse(settings.opened_at)
    ) {
      return Response.json(
        {
          error:
            "Solo los perfiles creados antes de abrir la votación pueden votar.",
        },
        { status: 403 },
      );
    }

    const payload = (await request.json()) as VotePayload;
    const candidateParticipantId = (
      payload.participantId ??
      payload.candidateParticipantId ??
      ""
    ).trim();
    if (!candidateParticipantId || candidateParticipantId.length > 64) {
      return Response.json(
        { error: "Selecciona una persona válida." },
        { status: 400 },
      );
    }
    if (candidateParticipantId === participant.id) {
      return Response.json(
        { error: "No puedes votar por tu propio outfit." },
        { status: 409 },
      );
    }

    const candidate = await getD1()
      .prepare(
        "SELECT participant_id FROM outfit_photos WHERE participant_id = ?",
      )
      .bind(candidateParticipantId)
      .first<{ participant_id: string }>();
    if (!candidate) {
      return Response.json(
        { error: "Esa persona no está en la votación." },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const voterKey = await createOutfitVoterKey(participant.id);
    const result = await getD1()
      .prepare(
        `INSERT OR REPLACE INTO outfit_votes
          (voter_key, candidate_participant_id, updated_at)
         SELECT ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM outfit_settings WHERE id = 1 AND status = 'open'
         )`,
      )
      .bind(voterKey, candidateParticipantId, now)
      .run();
    if (Number(result.meta.changes ?? 0) === 0) {
      return Response.json(
        { error: "La votación de Mejor Outfit acaba de cerrar." },
        { status: 423 },
      );
    }

    return Response.json({
      myVote: candidateParticipantId,
      savedAt: now,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible guardar el voto.";
    return Response.json({ error: message }, { status: 500 });
  }
}
