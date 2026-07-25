import { AppStateError, getOutfitPhoto } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const participantId =
      new URL(request.url).searchParams.get("participantId")?.trim() ?? "";
    if (!participantId || participantId.length > 64) {
      return Response.json(
        { error: "La foto solicitada no es válida." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const photo = await getOutfitPhoto(participantId);
    const headers = new Headers({
      "Content-Type": photo.row.content_type,
      "Cache-Control": "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    if (photo.etag) headers.set("ETag", photo.etag);
    if (
      typeof photo.row.byte_size === "number" &&
      Number.isFinite(photo.row.byte_size)
    ) {
      headers.set("Content-Length", String(photo.row.byte_size));
    }
    return new Response(photo.body, { headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible cargar la foto.";
    const status = error instanceof AppStateError ? error.status : 500;
    return Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
