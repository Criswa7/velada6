#!/usr/bin/env python3
"""Aplica el fix urgente de Mejor Outfit directamente sobre el checkout de velada6.

Ejecutar desde la raiz del repositorio:
    python3 aplicar-fix-velada6.py
"""

from pathlib import Path
import sys

ROOT = Path.cwd()


def read_source(relative: str) -> str:
    path = ROOT / relative
    if not path.is_file():
        raise RuntimeError(f"No existe {relative}. Ejecuta el script desde la raiz de velada6.")
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


def replace_once(relative: str, text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(
            f"{relative}: esperaba encontrar exactamente 1 bloque, pero encontre {count}. "
            "No se escribio ningun archivo."
        )
    return text.replace(old, new, 1)


try:
    updates: dict[str, str] = {}

    # 1) Evita servir fotos mutables con cache de 24 horas.
    route_rel = "app/api/outfit/photo/route.ts"
    route = read_source(route_rel)
    if "const PHOTO_RESPONSE_HEADERS" not in route:
        route = replace_once(
            route_rel,
            route,
            '''export const dynamic = "force-dynamic";\n\nexport async function GET''',
            '''export const dynamic = "force-dynamic";\n\nconst PHOTO_RESPONSE_HEADERS = {\n  "Cache-Control": "no-store, max-age=0",\n  "CDN-Cache-Control": "no-store",\n  "Netlify-CDN-Cache-Control": "no-store",\n};\n\nexport async function GET''',
        )

    if '{ status: 400, headers: { "Cache-Control": "no-store" } },' in route:
        route = replace_once(
            route_rel,
            route,
            '{ status: 400, headers: { "Cache-Control": "no-store" } },',
            '{ status: 400, headers: PHOTO_RESPONSE_HEADERS },',
        )

    old_success_headers = '''    const headers = new Headers({\n      "Content-Type": photo.row.content_type,\n      "Cache-Control": "public, max-age=86400, immutable",\n      "X-Content-Type-Options": "nosniff",\n    });'''
    new_success_headers = '''    const headers = new Headers({\n      ...PHOTO_RESPONSE_HEADERS,\n      "Content-Type": photo.row.content_type,\n      "X-Outfit-Participant": participantId,\n      "X-Content-Type-Options": "nosniff",\n    });'''
    if old_success_headers in route:
        route = replace_once(
            route_rel,
            route,
            old_success_headers,
            new_success_headers,
        )

    if '{ status, headers: { "Cache-Control": "no-store" } },' in route:
        route = replace_once(
            route_rel,
            route,
            '{ status, headers: { "Cache-Control": "no-store" } },',
            '{ status, headers: PHOTO_RESPONSE_HEADERS },',
        )

    required_route_tokens = (
        '"Cache-Control": "no-store, max-age=0"',
        '"Netlify-CDN-Cache-Control": "no-store"',
        '"X-Outfit-Participant": participantId',
    )
    if not all(token in route for token in required_route_tokens):
        raise RuntimeError(
            f"{route_rel}: el resultado no contiene todas las protecciones de cache esperadas."
        )
    if '"Cache-Control": "public, max-age=86400, immutable"' in route:
        raise RuntimeError(f"{route_rel}: todavia contiene la cache publica de 24 horas.")
    updates[route_rel] = route

    # 2) Cambia la URL para descartar cualquier respuesta antigua guardada en celulares/CDN.
    state_rel = "app/lib/state.ts"
    state = read_source(state_rel)
    if "OUTFIT_PHOTO_CACHE_VERSION" not in state:
        old_state_block = '''type OutfitEntryRow = {\n  participant_id: string;\n  alias: string;\n  updated_at: string;\n  vote_count: number;\n};\nfunction photoUrl(participantId: string, updatedAt: string): string {\n  const query = new URLSearchParams({ participantId, v: updatedAt });\n  return `/api/outfit/photo?${query.toString()}`;\n}'''
        new_state_block = '''type OutfitEntryRow = {\n  participant_id: string;\n  alias: string;\n  updated_at: string;\n  vote_count: number;\n};\nconst OUTFIT_PHOTO_CACHE_VERSION = "20260725-1";\n\nfunction photoUrl(participantId: string, updatedAt: string): string {\n  const query = new URLSearchParams({\n    participantId,\n    v: updatedAt,\n    cacheVersion: OUTFIT_PHOTO_CACHE_VERSION,\n  });\n  return `/api/outfit/photo?${query.toString()}`;\n}'''
        state = replace_once(state_rel, state, old_state_block, new_state_block)

    if "cacheVersion: OUTFIT_PHOTO_CACHE_VERSION" not in state:
        raise RuntimeError(f"{state_rel}: no quedo agregado cacheVersion.")
    updates[state_rel] = state

    # 3) Permite volver de VOTACION ABIERTA a PREPARANDO FOTOS cuando no hay votos.
    admin_rel = "app/admin/OutfitAdmin.tsx"
    admin = read_source(admin_rel)
    if "Volver a preparar fotos" not in admin:
        old_admin_block = '''            <button\n              type="button"\n              className="danger-button"\n              onClick={() =>\n                void onAction(\n                  { action: "setOutfitStatus", status: "closed" },\n                  "Votación cerrada y resultado publicado.",\n                )\n              }\n            >\n              Cerrar y publicar resultado\n            </button>'''
        new_admin_block = '''            <div>\n              <button\n                type="button"\n                className="secondary-button"\n                onClick={() => {\n                  if (\n                    window.confirm(\n                      "¿Volver al modo de preparación para cambiar las fotos?",\n                    )\n                  ) {\n                    void onAction(\n                      { action: "setOutfitStatus", status: "draft" },\n                      "Galería reabierta para subir o cambiar fotos.",\n                    );\n                  }\n                }}\n              >\n                Volver a preparar fotos\n              </button>\n              <button\n                type="button"\n                className="danger-button"\n                onClick={() =>\n                  void onAction(\n                    { action: "setOutfitStatus", status: "closed" },\n                    "Votación cerrada y resultado publicado.",\n                  )\n                }\n              >\n                Cerrar y publicar resultado\n              </button>\n            </div>'''
        admin = replace_once(admin_rel, admin, old_admin_block, new_admin_block)

    if 'status: "draft"' not in admin or "Volver a preparar fotos" not in admin:
        raise RuntimeError(f"{admin_rel}: no quedo agregado el boton para volver a draft.")
    updates[admin_rel] = admin

except RuntimeError as error:
    print(f"\nERROR: {error}\n", file=sys.stderr)
    sys.exit(1)

# Solo se escribe despues de validar los tres archivos completos.
for relative, content in updates.items():
    (ROOT / relative).write_text(content, encoding="utf-8", newline="\n")

print("\nOK: fix aplicado directamente a estos archivos:")
for relative in updates:
    print(f"  - {relative}")
print("\nAhora ejecuta: git diff --check && npm run check")
