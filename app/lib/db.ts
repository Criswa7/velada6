import { env } from "cloudflare:workers";
import { EVENT_LOCK_AT } from "./event";

type Bindings = {
  ADMIN_PIN?: string;
  DB?: D1Database;
  OUTFIT_PHOTOS?: R2Bucket;
  OUTFIT_VOTE_SECRET?: string;
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

export type OutfitStatus = "draft" | "open" | "closed";

export type OutfitSettingsRow = {
  id: number;
  status: OutfitStatus;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

export type OutfitPhotoRow = {
  participant_id: string;
  storage_key: string;
  content_type: string;
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
    db.prepare(`
      CREATE TABLE IF NOT EXISTS outfit_settings (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK(status IN ('draft', 'open', 'closed')),
        opened_at TEXT,
        closed_at TEXT,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS outfit_photos (
        participant_id TEXT PRIMARY KEY,
        storage_key TEXT NOT NULL UNIQUE,
        content_type TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS outfit_votes (
        voter_key TEXT PRIMARY KEY,
        candidate_participant_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(candidate_participant_id)
          REFERENCES outfit_photos(participant_id) ON DELETE CASCADE
      )
    `),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS predictions_participant_idx ON predictions(participant_id)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS outfit_votes_candidate_idx ON outfit_votes(candidate_participant_id)",
    ),
  ]);
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO event_settings (id, lock_at, manual_locked, updated_at) VALUES (?, ?, 0, ?)",
      )
      .bind(1, EVENT_LOCK_AT, now),
    db
      .prepare(
        "INSERT OR IGNORE INTO outfit_settings (id, status, opened_at, closed_at, updated_at) VALUES (1, 'draft', NULL, NULL, ?)",
      )
      .bind(now),
  ]);
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

export async function getOutfitSettings(): Promise<OutfitSettingsRow> {
  await ensureSchema();
  const row = await getD1()
    .prepare(
      "SELECT id, status, opened_at, closed_at, updated_at FROM outfit_settings WHERE id = 1",
    )
    .first<OutfitSettingsRow>();
  if (!row) {
    throw new Error("No fue posible cargar la configuración de Mejor Outfit.");
  }
  return row;
}

export function getOutfitPhotosBucket(): R2Bucket {
  const bucket = (env as unknown as Bindings).OUTFIT_PHOTOS;
  if (!bucket) {
    throw new Error("El almacenamiento de fotos todavía no está disponible.");
  }
  return bucket;
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

function getOutfitVoteSecret(): string {
  const bindingValue = (env as unknown as Bindings).OUTFIT_VOTE_SECRET;
  const value =
    bindingValue ||
    (typeof process !== "undefined"
      ? process.env.OUTFIT_VOTE_SECRET ?? ""
      : "");
  if (value.length < 24) {
    throw new Error(
      "La clave privada de votación de Mejor Outfit no está configurada.",
    );
  }
  return value;
}

export async function createOutfitVoterKey(
  participantId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getOutfitVoteSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`outfit-vote:v1:${participantId}`),
  );
  return [...new Uint8Array(signature)]
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
