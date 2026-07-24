"use client";

import Image from "next/image";
import { type ChangeEvent, useState } from "react";
import type {
  OutfitEntry,
  OutfitResult,
  OutfitStatus,
} from "../OutfitVoting";

export type AdminOutfitState = {
  status: OutfitStatus;
  entries: OutfitEntry[];
  totalVotes: number;
  results: OutfitResult[];
};

type AdminParticipant = {
  participantId: string;
  alias: string;
};

type OutfitAdminProps = {
  outfit: AdminOutfitState;
  participants: AdminParticipant[];
  pin: string;
  onRefresh: () => Promise<void>;
  onAction: (
    payload: Record<string, unknown>,
    success: string,
  ) => Promise<void>;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "No fue posible guardar la foto.");
  }
  return payload;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No fue posible leer esa imagen."));
    };
    image.src = url;
  });
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("No fue posible preparar la foto.")),
      type,
      quality,
    );
  });
}

async function prepareOutfitPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Elige una foto válida.");
  }
  if (file.size > 18 * 1024 * 1024) {
    throw new Error("La foto es demasiado pesada. El límite es 18 MB.");
  }

  const image = await loadImage(file);
  const targetRatio = 4 / 5;
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (sourceRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  const outputWidth = Math.min(1200, Math.round(sourceWidth));
  const outputHeight = Math.round(outputWidth / targetRatio);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Este dispositivo no pudo preparar la foto.");
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  const blob = await canvasBlob(canvas, "image/jpeg", 0.86);
  return new File([blob], "outfit.jpg", { type: "image/jpeg" });
}

export function OutfitAdmin({
  outfit,
  participants,
  pin,
  onRefresh,
  onAction,
  onMessage,
  onError,
}: OutfitAdminProps) {
  const [uploadingId, setUploadingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const entryByParticipant = new Map(
    outfit.entries.map((entry) => [entry.participantId, entry]),
  );

  async function upload(
    participantId: string,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file || outfit.status !== "draft") return;

    setUploadingId(participantId);
    onError("");
    onMessage("");
    try {
      const prepared = await prepareOutfitPhoto(file);
      const form = new FormData();
      form.set("participantId", participantId);
      form.set("photo", prepared);
      const response = await fetch("/api/admin/outfit/photo", {
        method: "POST",
        headers: { "x-admin-pin": pin },
        body: form,
      });
      await responseJson(response);
      await onRefresh();
      onMessage("Foto preparada y vinculada al perfil.");
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar la foto.",
      );
    } finally {
      setUploadingId("");
    }
  }

  async function removePhoto(participantId: string, alias: string) {
    if (
      outfit.status !== "draft" ||
      !window.confirm(`¿Quitar la foto de ${alias}?`)
    ) {
      return;
    }
    setDeletingId(participantId);
    onError("");
    onMessage("");
    try {
      const response = await fetch("/api/admin/outfit/photo", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": pin,
        },
        body: JSON.stringify({ participantId }),
      });
      await responseJson(response);
      await onRefresh();
      onMessage(`Foto de ${alias} retirada.`);
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "No fue posible retirar la foto.",
      );
    } finally {
      setDeletingId("");
    }
  }

  const statusLabel = {
    draft: "PREPARANDO FOTOS",
    open: "VOTACIÓN ABIERTA",
    closed: "RESULTADO PUBLICADO",
  }[outfit.status];
  const canOpen = outfit.entries.length >= 2;

  return (
    <section className="admin-section outfit-admin">
      <div className="admin-section-heading outfit-admin-heading">
        <div>
          <p className="section-label">PASARELA DE LA CASA</p>
          <h2>Mejor Outfit</h2>
        </div>
        <span className={`admin-outfit-status is-${outfit.status}`}>
          {statusLabel}
        </span>
      </div>

      <div className="outfit-admin-summary">
        <article>
          <span>Fotos listas</span>
          <strong>{outfit.entries.length}</strong>
          <small>de {participants.length} perfiles</small>
        </article>
        <article>
          <span>Votos recibidos</span>
          <strong>{outfit.totalVotes}</strong>
          <small>sin revelar identidades</small>
        </article>
      </div>

      <div className="outfit-admin-actions">
        {outfit.status === "draft" ? (
          <>
            <p>
              Pide a cada invitado abrir la app y crear su nombre. Luego toma o
              sube una foto aquí. Abre la votación cuando ya estén todos los
              looks.
            </p>
            <button
              type="button"
              className="primary-button"
              disabled={!canOpen}
              onClick={() =>
                void onAction(
                  { action: "setOutfitStatus", status: "open" },
                  "Votación de Mejor Outfit abierta.",
                )
              }
            >
              {canOpen ? "Abrir votación" : "Faltan al menos 2 fotos"}
            </button>
          </>
        ) : null}

        {outfit.status === "open" ? (
          <>
            <p>
              La galería está congelada. Los invitados ya pueden votar desde la
              tercera pestaña de la app.
            </p>
            <button
              type="button"
              className="danger-button"
              onClick={() =>
                void onAction(
                  { action: "setOutfitStatus", status: "closed" },
                  "Votación cerrada y resultado publicado.",
                )
              }
            >
              Cerrar y publicar resultado
            </button>
          </>
        ) : null}

        {outfit.status === "closed" ? (
          <>
            <p>
              El resultado ya es visible. Si necesitas repetir la votación,
              reiníciala y vuelve a abrirla cuando la galería esté lista.
            </p>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                if (
                  window.confirm(
                    "¿Borrar todos los votos de Mejor Outfit? Esta acción no se puede deshacer.",
                  )
                ) {
                  void onAction(
                    { action: "clearOutfitVotes" },
                    "Votos eliminados. Ya puedes volver a preparar la galería.",
                  );
                }
              }}
            >
              Reiniciar votación
            </button>
          </>
        ) : null}
      </div>

      {outfit.status === "closed" && outfit.results.length > 0 ? (
        <div className="admin-outfit-results">
          {outfit.results.slice(0, 3).map((result) => (
            <div key={result.participantId}>
              <b>#{result.rank}</b>
              <strong>{result.alias}</strong>
              <span>{result.votes} {result.votes === 1 ? "voto" : "votos"}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="outfit-photo-list">
        {participants.map((participant) => {
          const entry = entryByParticipant.get(participant.participantId);
          const busy =
            uploadingId === participant.participantId ||
            deletingId === participant.participantId;
          return (
            <article key={participant.participantId}>
              <div className="outfit-photo-preview">
                {entry ? (
                  <Image
                    src={entry.photoUrl}
                    alt={`Outfit de ${participant.alias}`}
                    width={160}
                    height={200}
                    unoptimized
                  />
                ) : (
                  <span>{participant.alias.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{participant.alias}</strong>
                <small>{entry ? "Foto lista" : "Pendiente de foto"}</small>
              </div>
              {outfit.status === "draft" ? (
                <div className="outfit-photo-controls">
                  <label className="secondary-button">
                    {uploadingId === participant.participantId
                      ? "Preparando…"
                      : entry
                        ? "Cambiar"
                        : "Tomar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={busy}
                      onChange={(event) =>
                        void upload(participant.participantId, event)
                      }
                    />
                  </label>
                  {entry ? (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      aria-label={`Quitar foto de ${participant.alias}`}
                      onClick={() =>
                        void removePhoto(
                          participant.participantId,
                          participant.alias,
                        )
                      }
                    >
                      Quitar
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="outfit-photo-locked">FOTO BLOQUEADA</span>
              )}
            </article>
          );
        })}
        {participants.length === 0 ? (
          <div className="outfit-admin-empty">
            Aún no hay perfiles. Pide a los invitados abrir la app y escribir
            su nombre.
          </div>
        ) : null}
      </div>
    </section>
  );
}
