"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FIGHTS, getFight } from "./lib/event";

const STORAGE_KEY = "velada-vi-edit-token";

type Standing = {
  rank: number;
  participantId: string;
  alias: string;
  points: number;
  correct: number;
  savedCount: number;
};

type PublicState = {
  event: {
    lockAt: string;
    locked: boolean;
    manualLocked: boolean;
    serverNow: string;
    completedResults: number;
  };
  participant: { id: string; alias: string } | null;
  picks: Record<string, string>;
  results: Record<string, string>;
  standings: Standing[];
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Algo salió mal. Inténtalo de nuevo.");
  }
  return payload;
}

function formatCountdown(lockAt: string, now: number): string {
  const remaining = Math.max(0, Date.parse(lockAt) - now);
  if (remaining === 0) return "00:00:00";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatLockMoment(lockAt: string): { date: string; time: string } {
  const date = new Date(lockAt);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "—" };
  return {
    date: new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      timeZone: "America/Bogota",
    })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
    time: new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    }).format(date),
  };
}

export function PredictionsApp() {
  const [state, setState] = useState<PublicState | null>(null);
  const [editToken, setEditToken] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem(STORAGE_KEY) ?? ""),
  );
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [alias, setAlias] = useState("");
  const [activeView, setActiveView] = useState<"picks" | "standings">("picks");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [serverClockOffset, setServerClockOffset] = useState(0);

  const loadState = useCallback(
    async (token: string, preserveLocalPicks = false) => {
      const response = await fetch("/api/state", {
        cache: "no-store",
        headers: token ? { "x-edit-token": token } : {},
      });
      const payload = await responseJson<PublicState>(response);
      setState(payload);
      setServerClockOffset(Date.parse(payload.event.serverNow) - Date.now());
      if (!preserveLocalPicks) setPicks(payload.picks);
      return payload;
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadState(editToken)
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : "No fue posible cargar.");
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editToken, loadState]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const effectiveNow = now + serverClockOffset;
  const effectiveLocked = Boolean(
    state &&
      (state.event.locked || effectiveNow >= Date.parse(state.event.lockAt)),
  );

  useEffect(() => {
    if (activeView !== "standings") return;
    const refresh = () => {
      void loadState(editToken, dirty).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [activeView, dirty, editToken, loadState]);

  useEffect(() => {
    if (!effectiveLocked || !dirty || !editToken) return;
    const timer = window.setTimeout(() => {
      void loadState(editToken)
        .then(() => {
          setDirty(false);
          setMessage("");
          setError(
            "El tiempo terminó. Se muestran únicamente las predicciones que alcanzaste a guardar.",
          );
        })
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirty, editToken, effectiveLocked, loadState]);

  const selectedCount = FIGHTS.filter((fight) => {
    const winner = picks[String(fight.id)];
    return winner === fight.fighterA.slug || winner === fight.fighterB.slug;
  }).length;
  const countdown = state
    ? formatCountdown(state.event.lockAt, effectiveNow)
    : "--:--:--";
  const lockMoment = state
    ? formatLockMoment(state.event.lockAt)
    : { date: "25 JUL", time: "12:45 p. m." };
  const currentStanding = state?.standings.find(
    (standing) => standing.participantId === state.participant?.id,
  );

  const completedMessage = useMemo(() => {
    if (selectedCount === FIGHTS.length) return "Cartelera completa";
    const pending = FIGHTS.length - selectedCount;
    return `${pending} ${pending === 1 ? "combate pendiente" : "combates pendientes"}`;
  }, [selectedCount]);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setJoining(true);
    try {
      const response = await fetch("/api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias }),
      });
      const payload = await responseJson<{
        participant: { id: string; alias: string };
        editToken: string;
      }>(response);
      window.localStorage.setItem(STORAGE_KEY, payload.editToken);
      setEditToken(payload.editToken);
      setAlias("");
      await loadState(payload.editToken);
      setMessage(`Listo, ${payload.participant.alias}. Ya puedes elegir.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible entrar.");
    } finally {
      setJoining(false);
    }
  }

  function choose(fightId: number, winnerSlug: string) {
    if (!state?.participant || effectiveLocked) return;
    setPicks((current) => ({
      ...current,
      [String(fightId)]: winnerSlug,
    }));
    setDirty(true);
    setMessage("");
    setError("");
  }

  async function savePicks() {
    if (!editToken || selectedCount === 0 || effectiveLocked) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/predictions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-edit-token": editToken,
        },
        body: JSON.stringify({ picks }),
      });
      await responseJson(response);
      setDirty(false);
      setMessage(
        selectedCount === FIGHTS.length
          ? "Predicciones guardadas. Estás listo."
          : "Progreso guardado. Puedes completar lo que falta.",
      );
      await loadState(editToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible guardar.");
      if (caught instanceof Error && caught.message.includes("solo lectura")) {
        await loadState(editToken);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-mark">VI</div>
        <p>Preparando la cartelera…</p>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-glow" />
        <p className="eyebrow">CASA DE CETI · APTO 119</p>
        <Image
          className="event-logo"
          src="/velada-logo.png"
          alt="La Velada del Año VI"
          width={1400}
          height={1400}
          priority
        />
        <h1>Predicciones de la Velada VI</h1>
        <p className="hero-copy">
          Diez combates. Diez decisiones. El estelar vale doble.
        </p>
        <div className={`status-card ${effectiveLocked ? "is-locked" : ""}`}>
          <div>
            <span className="status-kicker">
              {effectiveLocked ? "Predicciones cerradas" : "Cierre de elecciones"}
            </span>
            <strong className="countdown">{effectiveLocked ? "BLOQUEADO" : countdown}</strong>
          </div>
          <div className="status-date">
            <span>{lockMoment.date}</span>
            <b>{lockMoment.time}</b>
            <small>hora Colombia</small>
          </div>
        </div>
      </header>

      <main className="content">
        {message ? (
          <div className="notice success" role="status">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}

        {activeView === "picks" ? (
          <>
            {!state?.participant && !effectiveLocked ? (
              <section className="join-card">
                <span className="section-number">01</span>
                <div>
                  <p className="section-label">TU ESQUINA</p>
                  <h2>¿Cómo apareces en la tabla?</h2>
                  <p>
                    Usa tu nombre o un apodo. Este celular guardará tu acceso
                    privado para que solo tú puedas editar.
                  </p>
                </div>
                <form onSubmit={join} className="join-form">
                  <label htmlFor="alias">Nombre o apodo</label>
                  <div className="input-row">
                    <input
                      id="alias"
                      value={alias}
                      onChange={(event) => setAlias(event.target.value)}
                      placeholder="Ej. El Zurdo"
                      maxLength={24}
                      autoComplete="nickname"
                      required
                    />
                    <button className="primary-button" disabled={joining}>
                      {joining ? "Entrando…" : "Entrar"}
                    </button>
                  </div>
                </form>
              </section>
            ) : null}

            {state?.participant ? (
              <section className="player-strip">
                <div className="avatar">{state.participant.alias.slice(0, 1).toUpperCase()}</div>
                <div>
                  <span>Participando como</span>
                  <strong>{state.participant.alias}</strong>
                </div>
                <div className="player-score">
                  <span>Posición</span>
                  <strong>
                    {state.event.completedResults > 0 && currentStanding
                      ? `#${currentStanding.rank}`
                      : "—"}
                  </strong>
                </div>
              </section>
            ) : null}

            {effectiveLocked ? (
              <section className="locked-banner">
                <span aria-hidden="true">◈</span>
                <div>
                  <h2>Elecciones bloqueadas</h2>
                  <p>
                    Ya no se pueden modificar. Puedes revisar las tuyas y seguir
                    la clasificación.
                  </p>
                </div>
              </section>
            ) : null}

            <section className="rules-row" aria-label="Reglas">
              <div>
                <b>+1</b>
                <span>por ganador acertado</span>
              </div>
              <div>
                <b>×2</b>
                <span>en el combate estelar</span>
              </div>
              <div>
                <b>10</b>
                <span>combates en total</span>
              </div>
            </section>

            <section className="fight-list">
              <div className="section-heading">
                <div>
                  <p className="section-label">CARTELERA OFICIAL</p>
                  <h2>Elige un ganador</h2>
                </div>
                <div
                  className="progress-ring"
                  role="progressbar"
                  aria-label="Predicciones elegidas"
                  aria-valuemin={0}
                  aria-valuemax={FIGHTS.length}
                  aria-valuenow={selectedCount}
                >
                  <strong>{selectedCount}</strong>
                  <span>/10</span>
                </div>
              </div>

              {FIGHTS.map((fight) => {
                const chosen = picks[String(fight.id)];
                const result = state?.results[String(fight.id)];
                const resultFight = result ? getFight(fight.id) : undefined;
                const resultName =
                  result && resultFight
                    ? resultFight.fighterA.slug === result
                      ? resultFight.fighterA.name
                      : resultFight.fighterB.name
                    : undefined;
                const disabled = !state?.participant || effectiveLocked;
                return (
                  <article
                    className={`fight-card ${fight.weight === 2 ? "main-event" : ""}`}
                    key={fight.id}
                  >
                    <div className="fight-meta">
                      <span>{fight.label}</span>
                      {fight.weight === 2 ? <b>VALOR DOBLE</b> : null}
                    </div>
                    <div
                      className="fight-choices"
                      role="group"
                      aria-label={`${fight.label}: ${fight.fighterA.name} contra ${fight.fighterB.name}`}
                    >
                      {[fight.fighterA, fight.fighterB].map((fighter) => {
                        const selected = chosen === fighter.slug;
                        return (
                          <button
                            type="button"
                            className={`fighter-choice ${selected ? "selected" : ""}`}
                            key={fighter.slug}
                            onClick={() => choose(fight.id, fighter.slug)}
                            aria-pressed={selected}
                            disabled={disabled}
                          >
                            <span className="fighter-flag" aria-hidden="true">
                              {fighter.flag}
                            </span>
                            <strong>{fighter.name}</strong>
                            <small>{fighter.country}</small>
                            <span className="choice-indicator" aria-hidden="true">
                              {selected ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                      <span className="versus">VS</span>
                    </div>
                    {resultName ? (
                      <div className="result-line">Resultado: ganó {resultName}</div>
                    ) : null}
                  </article>
                );
              })}
            </section>

            <p className="privacy-note">
              Tus elecciones no se muestran a los demás antes del cierre.
            </p>
          </>
        ) : (
          <Leaderboard
            standings={state?.standings ?? []}
            currentParticipantId={state?.participant?.id}
            completedResults={state?.event.completedResults ?? 0}
          />
        )}
      </main>

      {activeView === "picks" &&
      state?.participant &&
      !effectiveLocked ? (
        <div className="save-dock">
          <div>
            <span id="selection-summary">{completedMessage}</span>
            <div
              className="mini-progress"
              role="progressbar"
              aria-label="Progreso de predicciones"
              aria-valuemin={0}
              aria-valuemax={FIGHTS.length}
              aria-valuenow={selectedCount}
            >
              <span aria-hidden="true" style={{ width: `${selectedCount * 10}%` }} />
            </div>
          </div>
          <button
            className="save-button"
            type="button"
            onClick={savePicks}
            disabled={saving || selectedCount === 0 || !dirty}
            aria-describedby="selection-summary"
          >
            {saving ? "Guardando…" : dirty ? "Guardar" : "Guardado ✓"}
          </button>
        </div>
      ) : null}

      <nav className="bottom-nav" aria-label="Navegación principal">
        <button
          type="button"
          className={activeView === "picks" ? "active" : ""}
          onClick={() => setActiveView("picks")}
          aria-current={activeView === "picks" ? "page" : undefined}
        >
          <span aria-hidden="true">◫</span>
          Predicciones
        </button>
        <button
          type="button"
          className={activeView === "standings" ? "active" : ""}
          onClick={() => setActiveView("standings")}
          aria-current={activeView === "standings" ? "page" : undefined}
        >
          <span aria-hidden="true">♛</span>
          Posiciones
        </button>
      </nav>

      <footer>
        <span>PREDICCIONES DE LA VELADA VI</span>
        <Link href="/admin">Administrar</Link>
      </footer>
    </div>
  );
}

function Leaderboard({
  standings,
  currentParticipantId,
  completedResults,
}: {
  standings: Standing[];
  currentParticipantId?: string;
  completedResults: number;
}) {
  const topThree = standings.slice(0, 3);
  return (
    <section className="leaderboard">
      <div className="leaderboard-hero">
        <p className="section-label">CLASIFICACIÓN</p>
        <h2>Tabla de posiciones</h2>
        <p>
          {completedResults === 0
            ? "La tabla cobrará vida cuando se cargue el primer resultado."
            : `${completedResults} de 10 resultados cargados.`}
        </p>
      </div>

      {standings.length === 0 ? (
        <div className="empty-state">
          <span>♛</span>
          <h3>Aún no hay participantes</h3>
          <p>Cuando alguien entre, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          {completedResults > 0 ? (
            <div className="podium">
              {topThree.map((standing) => (
                <article
                  key={standing.participantId}
                  className={`podium-card rank-${standing.rank}`}
                >
                  <span className="medal">
                    {standing.rank === 1 ? "♛" : `#${standing.rank}`}
                  </span>
                  <strong>{standing.alias}</strong>
                  <b>{standing.points} puntos</b>
                  <small>{standing.savedCount}/10 predicciones guardadas</small>
                </article>
              ))}
            </div>
          ) : null}
          <div className="ranking-table" role="table" aria-label="Tabla de posiciones">
            <div className="ranking-head" role="row">
              <span role="columnheader">Pos.</span>
              <span role="columnheader">Participante</span>
              <span role="columnheader">Puntos</span>
            </div>
            {standings.map((standing) => (
              <div
                className={`ranking-row ${
                  standing.participantId === currentParticipantId ? "is-you" : ""
                }`}
                key={standing.participantId}
                role="row"
              >
                <b role="cell">
                  {completedResults > 0 ? `#${standing.rank}` : "—"}
                </b>
                <div role="cell">
                  <strong>{standing.alias}</strong>
                  <span>
                    {completedResults
                      ? `${standing.correct} aciertos`
                      : `${standing.savedCount}/10 guardadas`}
                  </span>
                </div>
                <strong role="cell">{standing.points}</strong>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="leaderboard-note">
        En caso de empate, las personas comparten posición.
      </p>
    </section>
  );
}
