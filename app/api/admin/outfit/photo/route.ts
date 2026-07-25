import {
  AppStateError,
  adminPinIsValid,
  deleteOutfitPhoto,
  putOutfitPhoto,
} from "@/app/lib/db";
import { buildAdminState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const EXTENSION_BY_TYPE = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function isRecognizedImage(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (contentType === "image/avif") {
    const brand = String.fromCharCode(...bytes.slice(4, 12));
    return brand === "ftypavif" || brand === "ftypavis";
  }
  return false;
}

function checkAdmin(request: Request): Response | null {
  if (adminPinIsValid(request.headers.get("x-admin-pin"))) return null;
  return Response.json({ error: "Código incorrecto." }, { status: 401 });
}

function storageError(error: unknown, fallback: string): Response {
  if (error instanceof AppStateError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const participantIdValue = formData.get("participantId");
    const fileValue = formData.get("photo");
    const participantId =
      typeof participantIdValue === "string" ? participantIdValue.trim() : "";
    if (!participantId || participantId.length > 64) {
      return Response.json(
        { error: "Selecciona un participante válido." },
        { status: 400 },
      );
    }
    if (!(fileValue instanceof File) || fileValue.size === 0) {
      return Response.json(
        { error: "Selecciona una foto." },
        { status: 400 },
      );
    }
    if (fileValue.size > MAX_PHOTO_BYTES) {
      return Response.json(
        { error: "La foto procesada debe pesar máximo 4 MB." },
        { status: 413 },
      );
    }

    const contentType = fileValue.type.toLowerCase();
    const extension = EXTENSION_BY_TYPE.get(contentType);
    if (!extension) {
      return Response.json(
        { error: "Usa una foto JPG, PNG, WebP o AVIF." },
        { status: 415 },
      );
    }
    const photoBuffer = await fileValue.arrayBuffer();
    if (!isRecognizedImage(new Uint8Array(photoBuffer), contentType)) {
      return Response.json(
        { error: "El archivo no corresponde a una imagen válida." },
        { status: 415 },
      );
    }

    await putOutfitPhoto(
      participantId,
      photoBuffer,
      contentType,
      extension,
    );
    return Response.json(await buildAdminState());
  } catch (error) {
    return storageError(error, "No fue posible guardar la foto.");
  }
}

export async function DELETE(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    const queryParticipantId = new URL(request.url).searchParams.get(
      "participantId",
    );
    let bodyParticipantId = "";
    if (!queryParticipantId) {
      const payload = (await request.json().catch(() => ({}))) as {
        participantId?: string;
      };
      bodyParticipantId = payload.participantId ?? "";
    }
    const participantId = (queryParticipantId ?? bodyParticipantId).trim();
    if (!participantId || participantId.length > 64) {
      return Response.json(
        { error: "Selecciona un participante válido." },
        { status: 400 },
      );
    }

    await deleteOutfitPhoto(participantId);
    return Response.json(await buildAdminState());
  } catch (error) {
    return storageError(error, "No fue posible eliminar la foto.");
  }
}
