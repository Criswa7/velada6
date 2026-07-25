import { AppStateError, savePredictions } from "@/app/lib/db";
import { winnerIsValid } from "@/app/lib/event";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
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
    return Response.json(
      await savePredictions(request.headers.get("x-edit-token"), normalized),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PICK") {
      return Response.json(
        { error: "Hay una selección que no corresponde a la cartelera." },
        { status: 400 },
      );
    }
    if (error instanceof AppStateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "No fue posible guardar.";
    return Response.json({ error: message }, { status: 500 });
  }
}
