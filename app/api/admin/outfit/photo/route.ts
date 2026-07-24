import {
  adminPinIsValid,
  ensureSchema,
  getD1,
  getOutfitPhotosBucket,
  getOutfitSettings,
  type OutfitPhotoRow,
} from "@/app/lib/db";
import { buildAdminState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
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

export async function POST(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  let newStorageKey: string | null = null;
  try {
    await ensureSchema();
    if ((await getOutfitSettings()).status !== "draft") {
      return Response.json(
        { error: "Las fotos solo se pueden cambiar antes de abrir la votación." },
        { status: 409 },
      );
    }

    const formData = await request.formData();
    const participantIdValue = formData.get("participantId");
    const fileValue = formData.get("photo");
    const participantId =
      typeof participantIdValue === "string"
        ? participantIdValue.trim()
        : "";
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
        { error: "La foto debe pesar máximo 12 MB." },
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

    const participant = await getD1()
      .prepare("SELECT id FROM participants WHERE id = ?")
      .bind(participantId)
      .first<{ id: string }>();
    if (!participant) {
      return Response.json(
        { error: "Ese participante no existe." },
        { status: 404 },
      );
    }
    const previousPhoto = await getD1()
      .prepare(
        "SELECT participant_id, storage_key, content_type, updated_at FROM outfit_photos WHERE participant_id = ?",
      )
      .bind(participantId)
      .first<OutfitPhotoRow>();

    const now = new Date().toISOString();
    newStorageKey = `outfit/${participantId}/${crypto.randomUUID()}.${extension}`;
    const bucket = getOutfitPhotosBucket();
    await bucket.put(newStorageKey, photoBuffer, {
      httpMetadata: { contentType },
    });

    const result = await getD1()
      .prepare(
        `INSERT INTO outfit_photos
          (participant_id, storage_key, content_type, updated_at)
         SELECT ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM outfit_settings WHERE id = 1 AND status = 'draft'
         )
         ON CONFLICT(participant_id) DO UPDATE SET
           storage_key = excluded.storage_key,
           content_type = excluded.content_type,
           updated_at = excluded.updated_at`,
      )
      .bind(participantId, newStorageKey, contentType, now)
      .run();
    if (Number(result.meta.changes ?? 0) === 0) {
      await bucket.delete(newStorageKey);
      newStorageKey = null;
      return Response.json(
        { error: "La votación acaba de abrir; la foto no fue cambiada." },
        { status: 409 },
      );
    }

    if (
      previousPhoto?.storage_key &&
      previousPhoto.storage_key !== newStorageKey
    ) {
      await bucket.delete(previousPhoto.storage_key).catch(() => undefined);
    }
    newStorageKey = null;
    return Response.json(await buildAdminState());
  } catch (error) {
    if (newStorageKey) {
      try {
        await getOutfitPhotosBucket().delete(newStorageKey);
      } catch {
        // The metadata was not committed, so an unavailable bucket is safe here.
      }
    }
    const message =
      error instanceof Error ? error.message : "No fue posible guardar la foto.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const unauthorized = checkAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await ensureSchema();
    if ((await getOutfitSettings()).status !== "draft") {
      return Response.json(
        { error: "Las fotos solo se pueden eliminar antes de abrir la votación." },
        { status: 409 },
      );
    }
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

    const photo = await getD1()
      .prepare(
        "SELECT participant_id, storage_key, content_type, updated_at FROM outfit_photos WHERE participant_id = ?",
      )
      .bind(participantId)
      .first<OutfitPhotoRow>();
    if (!photo) {
      return Response.json(
        { error: "Ese participante no tiene una foto." },
        { status: 404 },
      );
    }

    const result = await getD1()
      .prepare(
        `DELETE FROM outfit_photos
         WHERE participant_id = ?
           AND EXISTS (
             SELECT 1 FROM outfit_settings WHERE id = 1 AND status = 'draft'
           )`,
      )
      .bind(participantId)
      .run();
    if (Number(result.meta.changes ?? 0) === 0) {
      return Response.json(
        { error: "La votación acaba de abrir; la foto no fue eliminada." },
        { status: 409 },
      );
    }
    await getOutfitPhotosBucket()
      .delete(photo.storage_key)
      .catch(() => undefined);
    return Response.json(await buildAdminState());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible eliminar la foto.";
    return Response.json({ error: message }, { status: 500 });
  }
}
