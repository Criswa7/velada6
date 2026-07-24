import { env } from "cloudflare:workers";
import { EVENT_LOCK_AT } from "./event";

type Bindings = {
  ADMIN_PIN?: string;
  DB?: D1Database;
};

export type SettingsRow = {
  id: number;
  lock_at: string;
  manual_locked: number;
  updated_at: string;
};

export type ParticipantRow = {
  id: string;
  alias: string;
  alias_key: string;
  edit_token_hash: string;
  created_at: string;
};

export type PredictionRow = {
  participant_id: string;
  fight_id: number;
  winner_slug: string;
  updated_at: string;
};

export type ResultRow = {
  fight_id: number;
  winner_slug: string;
  updated_at: string;
};

let schemaReady = false;

export function getD1(): D1Database {
  const db = (env as unknown as Bindings).DB;
  if (!db) {
    throw new Error("La base de datos de la app todavía no está disponible.");
  }
  return db;
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const db = getD1();
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL,
        alias_key TEXT NOT NULL UNIQUE,
        edit_token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        participant_id TEXT NOT NULL,
        fight_id INTEGER NOT NULL,
        winner_slug TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(participant_id, fight_id),
        FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS results (
        fight_id INTEGER PRIMARY KEY,
        winner_slug TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS event_settings (
        id INTEGER PRIMARY KEY,
        lock_at TEXT NOT NULL,
        manual_locked INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS predictions_participant_idx ON predictions(participant_id)",
    ),
  ]);
  await db
    .prepare(
      "INSERT OR IGNORE INTO event_settings (id, lock_at, manual_locked, updated_at) VALUES (?, ?, 0, ?)",
    )
    .bind(1, EVENT_LOCK_AT, new Date().toISOString())
    .run();
  schemaReady = true;
}

export async function getSettings(): Promise<SettingsRow> {
  await ensureSchema();
  const row = await getD1()
    .prepare(
      "SELECT id, lock_at, manual_locked, updated_at FROM event_settings WHERE id = 1",
    )
    .first<SettingsRow>();
  if (!row) throw new Error("No fue posible cargar la configuración del evento.");
  return row;
}

export function isLocked(settings: SettingsRow, now = Date.now()): boolean {
  return settings.manual_locked === 1 || now >= Date.parse(settings.lock_at);
}

export function normalizeAlias(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

export function cleanAlias(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function createEditToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function hashSecret(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getParticipantByToken(
  editToken: string | null,
): Promise<ParticipantRow | null> {
  if (!editToken) return null;
  await ensureSchema();
  const tokenHash = await hashSecret(editToken);
  return (
    (await getD1()
      .prepare(
        "SELECT id, alias, alias_key, edit_token_hash, created_at FROM participants WHERE edit_token_hash = ?",
      )
      .bind(tokenHash)
      .first<ParticipantRow>()) ?? null
  );
}

export function getAdminPin(): string {
  const bindingValue = (env as unknown as Bindings).ADMIN_PIN;
  if (bindingValue) return bindingValue;
  return typeof process !== "undefined" ? process.env.ADMIN_PIN ?? "" : "";
}

export function adminPinIsValid(candidate: string | null): boolean {
  const expected = getAdminPin();
  if (!candidate || !expected || candidate.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}
