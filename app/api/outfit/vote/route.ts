import { AppStateError, saveOutfitVote } from "@/app/lib/db";

export const dynamic = "force-dynamic";

type VotePayload = {
  participantId?: string;
  candidateParticipantId?: string;
};

export async function PUT(request: Request) {
  try {
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
    return Response.json(
      await saveOutfitVote(
        request.headers.get("x-edit-token"),
        candidateParticipantId,
      ),
    );
  } catch (error) {
    if (error instanceof AppStateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "No fue posible guardar el voto.";
    return Response.json({ error: message }, { status: 500 });
  }
}
