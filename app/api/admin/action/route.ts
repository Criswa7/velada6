import {
  AppStateError,
  adminPinIsValid,
  clearOutfitVotes,
  clearResult,
  setLockAt,
  setManualLock,
  setOutfitStatus,
  setResult,
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
    const payload = (await request.json()) as AdminAction;
    if (payload.action === "setManualLock") {
      if (typeof payload.locked !== "boolean") {
        return Response.json(
          { error: "El estado de cierre no es válido." },
          { status: 400 },
        );
      }
      await setManualLock(payload.locked);
    } else if (payload.action === "setLockAt") {
      const parsed = Date.parse(payload.lockAt ?? "");
      if (!Number.isFinite(parsed)) {
        return Response.json(
          { error: "La hora de cierre no es válida." },
          { status: 400 },
        );
      }
      await setLockAt(new Date(parsed).toISOString());
    } else if (payload.action === "setResult") {
      const fightId = Number(payload.fightId);
      const winnerSlug = payload.winnerSlug ?? "";
      if (!winnerIsValid(fightId, winnerSlug)) {
        return Response.json(
          { error: "Ese resultado no corresponde al combate." },
          { status: 400 },
        );
      }
      await setResult(fightId, winnerSlug);
    } else if (payload.action === "clearResult") {
      const fightId = Number(payload.fightId);
      if (!Number.isInteger(fightId) || !getFight(fightId)) {
        return Response.json(
          { error: "Ese combate no existe." },
          { status: 400 },
        );
      }
      await clearResult(fightId);
    } else if (payload.action === "setOutfitStatus") {
      const status = payload.status;
      if (!status || !["draft", "open", "closed"].includes(status)) {
        return Response.json(
          { error: "El estado de Mejor Outfit no es válido." },
          { status: 400 },
        );
      }
      await setOutfitStatus(status);
    } else if (payload.action === "clearOutfitVotes") {
      await clearOutfitVotes();
    } else {
      return Response.json(
        { error: "Acción no reconocida." },
        { status: 400 },
      );
    }
    return Response.json(await buildAdminState());
  } catch (error) {
    if (error instanceof AppStateError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : "No fue posible aplicar el cambio.";
    return Response.json({ error: message }, { status: 500 });
  }
}
