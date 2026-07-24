import {
  ensureSchema,
  getD1,
  getOutfitPhotosBucket,
  type OutfitPhotoRow,
} from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const participantId =
      new URL(request.url).searchParams.get("participantId")?.trim() ?? "";
    if (!participantId || participantId.length > 64) {
      return Response.json(
        { error: "La foto solicitada no es válida." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
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
        { error: "La foto no existe." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const object = await getOutfitPhotosBucket().get(photo.storage_key);
    if (!object?.body) {
      return Response.json(
        { error: "La foto no está disponible." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const headers = new Headers({
      "Content-Type": photo.content_type,
      "Cache-Control": "public, max-age=86400, immutable",
      ETag: object.httpEtag,
      "X-Content-Type-Options": "nosniff",
    });
    if (Number.isFinite(object.size)) {
      headers.set("Content-Length", String(object.size));
    }
    return new Response(object.body, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible cargar la foto.";
    return Response.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
