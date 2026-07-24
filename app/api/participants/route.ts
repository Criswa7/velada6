import {
  cleanAlias,
  createEditToken,
  ensureSchema,
  getD1,
  hashSecret,
  normalizeAlias,
} from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const payload = (await request.json()) as { alias?: string };
    const alias = cleanAlias(payload.alias ?? "");
    if (alias.length < 2 || alias.length > 24) {
      return Response.json(
        { error: "El apodo debe tener entre 2 y 24 caracteres." },
        { status: 400 },
      );
    }

    const editToken = createEditToken();
    const participantId = crypto.randomUUID();
    const now = new Date().toISOString();
    await getD1()
      .prepare(
        "INSERT INTO participants (id, alias, alias_key, edit_token_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        participantId,
        alias,
        normalizeAlias(alias),
        await hashSecret(editToken),
        now,
      )
      .run();

    return Response.json(
      {
        participant: { id: participantId, alias },
        editToken,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return Response.json(
        { error: "Ese apodo ya está en uso. Prueba con otro." },
        { status: 409 },
      );
    }
    return Response.json(
      { error: "No fue posible crear tu perfil. Inténtalo otra vez." },
      { status: 500 },
    );
  }
}
