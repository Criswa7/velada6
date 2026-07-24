import { buildPublicState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = await buildPublicState(request.headers.get("x-edit-token"));
    return Response.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible cargar la app.";
    return Response.json({ error: message }, { status: 500 });
  }
}
