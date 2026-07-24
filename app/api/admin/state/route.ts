import { adminPinIsValid } from "@/app/lib/db";
import { buildAdminState } from "@/app/lib/state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!adminPinIsValid(request.headers.get("x-admin-pin"))) {
    return Response.json({ error: "Código incorrecto." }, { status: 401 });
  }
  try {
    return Response.json(await buildAdminState(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No fue posible cargar el panel.";
    return Response.json({ error: message }, { status: 500 });
  }
}
