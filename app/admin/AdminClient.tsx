"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { Fight } from "../lib/event";
import {
  OutfitAdmin,
  type AdminOutfitState,
} from "./OutfitAdmin";

const ADMIN_STORAGE_KEY = "velada-vi-admin-pin";

type AdminState = {
  event: {
    lockAt: string;
    locked: boolean;
    manualLocked: boolean;
    serverNow: string;
  };
  fights: Fight[];
  results: Record<string, string>;
  participants: Array<{
    rank: number;
    participantId: string;
    alias: string;
    points: number;
    correct: number;
    savedCount: number;
  }>;
  outfit: AdminOutfitState;
};

function localInputValue(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function adminJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "No fue posible continuar.");
  return payload;
}

export function AdminClient() {
  const [pin, setPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [data, setData] = useState<AdminState | null>(null);
  const [lockAtInput, setLockAtInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (adminPin: string) => {
    const response = await fetch("/api/admin/state", {
      cache: "no-store",
      headers: { "x-admin-pin": adminPin },
    });
    const payload = await adminJson<AdminState>(response);
    setData(payload);
    setLockAtInput(localInputValue(payload.event.lockAt));
    return payload;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const stored = window.sessionStorage.getItem(ADMIN_STORAGE_KEY) ?? "";
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }
      setPin(stored);
      load(stored)
        .catch(() => {
          window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
          if (!cancelled) setPin("");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await load(pinInput);
      window.sessionStorage.setItem(ADMIN_STORAGE_KEY, pinInput);
      setPin(pinInput);
      setPinInput("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Código incorrecto.");
    } finally {
      setLoading(false);
    }
  }

  async function act(payload: Record<string, unknown>, success: string) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-pin": pin,
        },
        body: JSON.stringify(payload),
      });
      const next = await adminJson<AdminState>(response);
      setData(next);
      setLockAtInput(localInputValue(next.event.lockAt));
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No fue posible aplicar el cambio.");
    } finally {
      setWorking(false);
    }
  }

  function updateLockAt() {
    const parsed = new Date(lockAtInput);
    if (Number.isNaN(parsed.getTime())) {
      setMessage("");
      setError("Elige una fecha y hora de cierre válidas.");
      return;
    }
    void act(
      {
        action: "setLockAt",
        lockAt: parsed.toISOString(),
      },
      "Hora de cierre actualizada.",
    );
  }

  if (loading) {
    return (
      <main className="loading-screen" aria-live="polite" aria-busy="true">
        <div className="loading-mark">VI</div>
        <p>Abriendo el panel…</p>
      </main>
    );
  }

  if (!pin || !data) {
    return (
      <main className="admin-login">
        <Link href="/" className="back-link">
          ← Volver a la app
        </Link>
        <section>
          <Image
            src="/velada-logo.png"
            alt=""
            width={1400}
            height={1400}
            priority
          />
          <p className="section-label">ACCESO PRIVADO</p>
          <h1>Panel de resultados</h1>
          <p>Introduce el código de administración entregado al anfitrión.</p>
          {error ? (
            <div className="notice error" role="alert">
              {error}
            </div>
          ) : null}
          <form onSubmit={signIn}>
            <label htmlFor="admin-pin">Código</label>
            <input
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pinInput}
              onChange={(event) => setPinInput(event.target.value)}
              required
            />
            <button className="primary-button">Entrar al panel</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Link href="/" className="back-link">
            ← Ver app
          </Link>
          <p className="section-label">CONTROL DE LA NOCHE</p>
          <h1>Panel de resultados</h1>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
            setPin("");
            setData(null);
          }}
        >
          Salir
        </button>
      </header>

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

      <section className="admin-status-grid">
        <article>
          <span>Estado</span>
          <strong>{data.event.locked ? "CERRADO" : "ABIERTO"}</strong>
          <button
            type="button"
            className={data.event.manualLocked ? "secondary-button" : "danger-button"}
            disabled={
              working ||
              (data.event.manualLocked &&
                Object.keys(data.results).length > 0)
            }
            onClick={() =>
              act(
                {
                  action: "setManualLock",
                  locked: !data.event.manualLocked,
                },
                data.event.manualLocked
                  ? "Cierre manual retirado."
                  : "Predicciones cerradas manualmente.",
              )
            }
          >
            {data.event.manualLocked ? "Quitar cierre manual" : "Cerrar ahora"}
          </button>
          {data.event.manualLocked &&
          Object.keys(data.results).length > 0 ? (
            <small>Para reabrir, borra primero todos los resultados.</small>
          ) : null}
        </article>
        <article>
          <span>Participantes</span>
          <strong>{data.participants.length}</strong>
          <small>
            {data.participants.filter((item) => item.savedCount === 10).length} con
            cartelera completa
          </small>
        </article>
      </section>

      <OutfitAdmin
        outfit={data.outfit}
        participants={data.participants}
        pin={pin}
        onRefresh={async () => {
          await load(pin);
        }}
        onAction={act}
        onMessage={setMessage}
        onError={setError}
      />

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <p className="section-label">CIERRE</p>
            <h2>Hora automática</h2>
          </div>
        </div>
        <div className="admin-inline-form">
          <label htmlFor="lock-at">Hora del dispositivo</label>
          <input
            id="lock-at"
            type="datetime-local"
            value={lockAtInput}
            onChange={(event) => setLockAtInput(event.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={working}
            onClick={updateLockAt}
          >
            Actualizar hora
          </button>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <p className="section-label">EN VIVO</p>
            <h2>Cargar ganadores</h2>
          </div>
          <span>{Object.keys(data.results).length}/10</span>
        </div>
        <div className="admin-fights">
          {data.fights.map((fight) => {
            const result = data.results[String(fight.id)];
            return (
              <article key={fight.id}>
                <div>
                  <span>{fight.label}</span>
                  <strong>
                    {fight.fighterA.name} vs. {fight.fighterB.name}
                  </strong>
                </div>
                <div
                  className="admin-result-buttons"
                  role="group"
                  aria-label={`Ganador de ${fight.fighterA.name} contra ${fight.fighterB.name}`}
                >
                  {[fight.fighterA, fight.fighterB].map((fighter) => (
                    <button
                      type="button"
                      key={fighter.slug}
                      className={result === fighter.slug ? "selected" : ""}
                      aria-pressed={result === fighter.slug}
                      disabled={working}
                      onClick={() =>
                        act(
                          {
                            action: "setResult",
                            fightId: fight.id,
                            winnerSlug: fighter.slug,
                          },
                          `Resultado del combate ${fight.id} actualizado.`,
                        )
                      }
                    >
                      {fighter.flag} {fighter.name}
                    </button>
                  ))}
                  {result ? (
                    <button
                      type="button"
                      className="clear-result"
                      disabled={working}
                      onClick={() =>
                        act(
                          { action: "clearResult", fightId: fight.id },
                          `Resultado del combate ${fight.id} retirado.`,
                        )
                      }
                    >
                      Borrar
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading">
          <div>
            <p className="section-label">CLASIFICACIÓN</p>
            <h2>Estado de participantes</h2>
          </div>
        </div>
        <div className="admin-participants">
          {data.participants.map((participant) => (
            <div key={participant.participantId}>
              <b>#{participant.rank}</b>
              <strong>{participant.alias}</strong>
              <span>{participant.savedCount}/10</span>
              <span>{participant.points} pts</span>
            </div>
          ))}
          {data.participants.length === 0 ? (
            <p>Aún no hay participantes.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
