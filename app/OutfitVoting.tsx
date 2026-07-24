"use client";

import Image from "next/image";
import { type ReactNode, useMemo, useState } from "react";

export type OutfitStatus = "draft" | "open" | "closed";

export type OutfitEntry = {
  participantId: string;
  alias: string;
  photoUrl: string;
  updatedAt: string;
};

export type OutfitResult = Omit<OutfitEntry, "updatedAt"> & {
  rank: number;
  votes: number;
};

export type PublicOutfitState = {
  status: OutfitStatus;
  entries: OutfitEntry[];
  myVote: string | null;
  totalVotes: number;
  results: OutfitResult[];
};

type Participant = {
  id: string;
  alias: string;
};

type OutfitVotingProps = {
  outfit: PublicOutfitState;
  participant: Participant | null;
  editToken: string;
  joinCard: ReactNode;
  onRefresh: () => Promise<void>;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "No fue posible guardar tu voto.");
  }
  return payload;
}

export function OutfitVoting({
  outfit,
  participant,
  editToken,
  joinCard,
  onRefresh,
  onMessage,
  onError,
}: OutfitVotingProps) {
  const [choice, setChoice] = useState(outfit.myVote ?? "");
  const [saving, setSaving] = useState(false);

  const selectedName = useMemo(
    () =>
      outfit.entries.find((entry) => entry.participantId === choice)?.alias ??
      "",
    [choice, outfit.entries],
  );

  async function saveVote() {
    if (!choice || !editToken || outfit.status !== "open") return;
    setSaving(true);
    onError("");
    onMessage("");
    try {
      const response = await fetch("/api/outfit/vote", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-edit-token": editToken,
        },
        body: JSON.stringify({ candidateParticipantId: choice }),
      });
      await responseJson(response);
      await onRefresh();
      onMessage(
        `Voto secreto guardado por ${selectedName}. Puedes cambiarlo mientras la votación siga abierta.`,
      );
    } catch (caught) {
      onError(
        caught instanceof Error
          ? caught.message
          : "No fue posible guardar tu voto.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (outfit.status === "draft") {
    return (
      <section className="outfit-view">
        <div className="outfit-intro">
          <span className="outfit-stage">FOTOS EN PREPARACIÓN</span>
          <p className="section-label">LA PASARELA DE LA CASA</p>
          <h2>Mejor Outfit</h2>
          <p>
            Cuando estén todas las fotos, el anfitrión abrirá aquí una votación
            secreta. Nadie podrá elegirse a sí mismo.
          </p>
          <div className="outfit-prep-count">
            <strong>{outfit.entries.length}</strong>
            <span>
              {outfit.entries.length === 1
                ? "look preparado"
                : "looks preparados"}
            </span>
          </div>
        </div>
        {!participant ? joinCard : (
          <div className="outfit-ready-note">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>{participant.alias}, ya estás dentro.</strong>
              <p>Vuelve cuando el anfitrión anuncie que la votación está abierta.</p>
            </div>
          </div>
        )}
      </section>
    );
  }

  if (outfit.status === "closed") {
    const winner = outfit.totalVotes > 0 ? outfit.results[0] : undefined;
    const tiedWinners = outfit.results.filter(
      (result) => winner && result.votes === winner.votes,
    );
    return (
      <section className="outfit-view">
        <div className="outfit-intro">
          <span className="outfit-stage is-closed">VOTACIÓN CERRADA</span>
          <p className="section-label">RESULTADO FINAL</p>
          <h2>
            {tiedWinners.length > 1 ? "Tenemos empate" : "El look de la noche"}
          </h2>
          <p>
            {outfit.totalVotes}{" "}
            {outfit.totalVotes === 1 ? "voto secreto" : "votos secretos"} en
            total.
          </p>
        </div>

        {winner ? (
          <>
            <div className="outfit-winner">
              <Image
                src={winner.photoUrl}
                alt={`Outfit de ${winner.alias}`}
                width={960}
                height={1200}
                sizes="(max-width: 619px) calc(100vw - 2.5rem), 560px"
                unoptimized
              />
              <div>
                <span>{tiedWinners.length > 1 ? "EMPATE EN PRIMER LUGAR" : "MEJOR OUTFIT"}</span>
                <strong>{winner.alias}</strong>
                <small>{winner.votes} {winner.votes === 1 ? "voto" : "votos"}</small>
              </div>
            </div>

            <div className="outfit-results" aria-label="Resultados de Mejor Outfit">
              {outfit.results.map((result) => (
                <article key={result.participantId}>
                  <div className="outfit-result-rank">#{result.rank}</div>
                  <Image
                    src={result.photoUrl}
                    alt=""
                    width={120}
                    height={150}
                    unoptimized
                  />
                  <strong>{result.alias}</strong>
                  <span>{result.votes} {result.votes === 1 ? "voto" : "votos"}</span>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <span>◇</span>
            <h3>La votación terminó sin votos</h3>
            <p>Los looks quedan como recuerdo de la noche.</p>
          </div>
        )}

        <p className="outfit-privacy">
          Solo se publica el total. La elección de cada persona permanece
          secreta.
        </p>
      </section>
    );
  }

  return (
    <section className="outfit-view">
      <div className="outfit-intro">
        <span className="outfit-stage is-open">VOTACIÓN ABIERTA</span>
        <p className="section-label">MEJOR OUTFIT</p>
        <h2>Elige la mejor pinta</h2>
        <p>
          Mira todos los looks, elige uno y confirma. Tu voto es secreto y
          puedes cambiarlo hasta que el anfitrión cierre la votación.
        </p>
      </div>

      {!participant ? joinCard : null}

      <div className="outfit-grid" aria-label="Participantes de Mejor Outfit">
        {outfit.entries.map((entry) => {
          const isSelf = entry.participantId === participant?.id;
          const selected = entry.participantId === choice;
          return (
            <button
              type="button"
              key={entry.participantId}
              className={`outfit-card ${selected ? "selected" : ""} ${isSelf ? "is-self" : ""}`}
              disabled={!participant || isSelf}
              aria-pressed={selected}
              onClick={() => {
                setChoice(entry.participantId);
                onMessage("");
                onError("");
              }}
            >
              <Image
                src={entry.photoUrl}
                alt={`Outfit de ${entry.alias}`}
                width={720}
                height={900}
                sizes="(max-width: 619px) calc((100vw - 2.25rem) / 2), 330px"
                unoptimized
              />
              <span className="outfit-card-shade" aria-hidden="true" />
              <span className="outfit-card-copy">
                {isSelf ? <small>TU OUTFIT · NO ELEGIBLE</small> : null}
                <strong>{entry.alias}</strong>
              </span>
              <span className="outfit-check" aria-hidden="true">
                {selected ? "✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {participant ? (
        <div className="outfit-vote-dock">
          <div>
            <span>
              {selectedName
                ? `Tu elección: ${selectedName}`
                : "Elige el mejor look"}
            </span>
            <small>Voto secreto · nunca se muestra quién eligió a quién</small>
          </div>
          <button
            type="button"
            className="save-button"
            disabled={
              saving ||
              !choice ||
              choice === participant.id ||
              choice === outfit.myVote
            }
            onClick={saveVote}
          >
            {saving
              ? "Guardando…"
              : choice === outfit.myVote && choice
                ? "Voto guardado ✓"
                : "Confirmar voto"}
          </button>
        </div>
      ) : (
        <p className="outfit-privacy">
          Crea tu perfil arriba para votar. No necesitas iniciar sesión.
        </p>
      )}
    </section>
  );
}
