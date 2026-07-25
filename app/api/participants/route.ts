import { AppStateError, cleanAlias, createParticipant } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { alias?: string };
    const alias = cleanAlias(payload.alias ?? "");
    if (alias.length < 2 || alias.length > 24) {
      return Response.json(
        { error: "El apodo debe tener entre 2 y 24 caracteres." },
        { status: 400 },
      );
    }
    const { participant, editToken } = await createParticipant(alias);
    return Response.json(
      { participant: { id: participant.id, alias: participant.alias }, editToken },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AppStateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "No fue posible crear tu perfil. Inténtalo otra vez." },
      { status: 500 },
    );
  }
}
