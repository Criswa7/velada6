import { getStore } from "@netlify/blobs";
import { EVENT_LOCK_AT, getFight, winnerIsValid } from "./event";

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
  byte_size?: number;
};

export type OutfitVoteRow = {
  voter_key: string;
  candidate_participant_id: string;
  updated_at: string;
};

export type AppState = {
  schemaVersion: 1;
  revision: number;
  settings: SettingsRow;
  outfitSettings: OutfitSettingsRow;
  participants: ParticipantRow[];
  predictions: PredictionRow[];
  results: ResultRow[];
  outfitPhotos: OutfitPhotoRow[];
  outfitVotes: OutfitVoteRow[];
};

export type AppStateErrorCode =
  | "STATE_UNAVAILABLE"
  | "STATE_CORRUPT"
  | "STATE_CONFLICT"
  | "ALIAS_INVALID"
  | "ALIAS_TAKEN"
  | "INVALID_SESSION"
  | "INVALID_PICKS"
  | "PREDICTIONS_LOCKED"
  | "INVALID_LOCK_AT"
  | "RESULTS_PREVENT_UNLOCK"
  | "INVALID_RESULT"
  | "FIGHT_NOT_FOUND"
  | "INVALID_OUTFIT_STATUS"
  | "OUTFIT_VOTES_PREVENT_DRAFT"
  | "OUTFIT_CONFLICT"
  | "OUTFIT_NEEDS_PHOTOS"
  | "OUTFIT_NOT_DRAFT"
  | "PARTICIPANT_NOT_FOUND"
  | "OUTFIT_PHOTO_NOT_FOUND"
  | "OUTFIT_PHOTO_UNAVAILABLE"
  | "OUTFIT_NOT_OPEN"
  | "OUTFIT_LATE_PARTICIPANT"
  | "OUTFIT_SELF_VOTE"
  | "OUTFIT_CANDIDATE_NOT_FOUND"
  | "OUTFIT_RESET_REQUIRES_CLOSED"
  | "INVALID_PHOTO";

export class AppStateError extends Error {
  constructor(
    public readonly code: AppStateErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppStateError";
  }
}

type Snapshot = { state: AppState; etag: string };
type MutationResult<T> = { state: AppState; result: T };
type PredictionInput = { fightId: number; winnerSlug: string };

const STATE_KEY = "app-state-v1";
const MAX_CAS_ATTEMPTS = 16;

function contextName(): string {
  const raw = process.env.APP_DATA_CONTEXT ?? process.env.CONTEXT ?? "dev";
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28) || "dev"
  );
}

function stateStore() {
  return getStore({
    name: `velada-vi-state-${contextName()}`,
    consistency: "strong",
  });
}

function photoStore() {
  return getStore({
    name: `velada-vi-photos-${contextName()}`,
    consistency: "strong",
  });
}

function unavailable(message: string): AppStateError {
  return new AppStateError("STATE_UNAVAILABLE", 503, message);
}

function initialState(): AppState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    revision: 0,
    settings: {
      id: 1,
      lock_at: EVENT_LOCK_AT,
      manual_locked: 0,
      updated_at: now,
    },
    outfitSettings: {
      id: 1,
      status: "draft",
      opened_at: null,
      closed_at: null,
      updated_at: now,
    },
    participants: [],
    predictions: [],
    results: [],
    outfitPhotos: [],
    outfitVotes: [],
  };
}

function assertState(value: unknown): AppState {
  if (!value || typeof value !== "object") {
    throw new AppStateError(
      "STATE_CORRUPT",
      500,
      "El estado guardado no es válido.",
    );
  }
  const state = value as Partial<AppState>;
  if (
    state.schemaVersion !== 1 ||
    typeof state.revision !== "number" ||
    !Number.isInteger(state.revision) ||
    !state.settings ||
    !state.outfitSettings ||
    !Array.isArray(state.participants) ||
    !Array.isArray(state.predictions) ||
    !Array.isArray(state.results) ||
    !Array.isArray(state.outfitPhotos) ||
    !Array.isArray(state.outfitVotes)
  ) {
    throw new AppStateError(
      "STATE_CORRUPT",
      500,
      "El estado guardado no es compatible con esta versión.",
    );
  }
  return state as AppState;
}

async function readSnapshot(): Promise<Snapshot> {
  const store = stateStore();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let entry;
    try {
      entry = await store.getWithMetadata(STATE_KEY, {
        type: "json",
        consistency: "strong",
      });
    } catch {
      throw unavailable("El almacenamiento de la app no está disponible.");
    }
    if (entry) {
      if (!entry.etag || entry.data === null) {
        throw new AppStateError(
          "STATE_CORRUPT",
          500,
          "El estado guardado no tiene una versión válida.",
        );
      }
      return { state: assertState(entry.data), etag: entry.etag };
    }

    const fresh = initialState();
    let created;
    try {
      created = await store.setJSON(STATE_KEY, fresh, { onlyIfNew: true });
    } catch {
      throw unavailable("No fue posible inicializar el almacenamiento de la app.");
    }
    if (created.modified && created.etag) {
      return { state: fresh, etag: created.etag };
    }
  }
  throw new AppStateError(
    "STATE_CONFLICT",
    409,
    "La app recibió varios cambios a la vez. Inténtalo otra vez.",
  );
}

export async function readAppState(): Promise<AppState> {
  return (await readSnapshot()).state;
}

export async function ensureSchema(): Promise<void> {
  await readAppState();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function mutateAppState<T>(
  mutator: (draft: AppState) => T | Promise<T>,
): Promise<MutationResult<T>> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const snapshot = await readSnapshot();
    const draft = structuredClone(snapshot.state);
    const result = await mutator(draft);
    draft.revision = snapshot.state.revision + 1;

    let write;
    try {
      write = await stateStore().setJSON(STATE_KEY, draft, {
        onlyIfMatch: snapshot.etag,
      });
    } catch {
      throw unavailable("No fue posible guardar el cambio.");
    }
    if (write.modified) return { state: draft, result };

    await delay(
      Math.min(80, 4 * 2 ** attempt) + Math.floor(Math.random() * 8),
    );
  }
  throw new AppStateError(
    "STATE_CONFLICT",
    409,
    "La app recibió varios cambios a la vez. Inténtalo otra vez.",
  );
}

export async function readCoreData() {
  const state = await readAppState();
  return {
    settings: state.settings,
    participants: state.participants,
    predictions: state.predictions,
    results: state.results,
  };
}

export async function readOutfitData() {
  const state = await readAppState();
  return {
    settings: state.outfitSettings,
    photos: state.outfitPhotos,
    votes: state.outfitVotes,
  };
}

export async function getSettings(): Promise<SettingsRow> {
  return (await readAppState()).settings;
}

export function isLocked(settings: SettingsRow, now = Date.now()): boolean {
  return settings.manual_locked === 1 || now >= Date.parse(settings.lock_at);
}

export async function getOutfitSettings(): Promise<OutfitSettingsRow> {
  return (await readAppState()).outfitSettings;
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function outfitVoteSecret(): string {
  const value = process.env.OUTFIT_VOTE_SECRET ?? "";
  if (value.length < 24) {
    throw new AppStateError(
      "STATE_UNAVAILABLE",
      503,
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
    new TextEncoder().encode(outfitVoteSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `outfit-vote:v1:${participantId}`,
    ),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function getParticipantByToken(
  editToken: string | null,
  state?: AppState,
): Promise<ParticipantRow | null> {
  if (!editToken) return null;
  const tokenHash = await hashSecret(editToken);
  return (
    (state ?? (await readAppState())).participants.find(
      (row) => row.edit_token_hash === tokenHash,
    ) ?? null
  );
}

export function getAdminPin(): string {
  return process.env.ADMIN_PIN ?? "";
}

export function adminPinIsValid(candidate: string | null): boolean {
  const expected = getAdminPin();
  if (!candidate || !expected || candidate.length !== expected.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= candidate.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function createParticipant(aliasValue: string) {
  const alias = cleanAlias(aliasValue);
  if (alias.length < 2 || alias.length > 24) {
    throw new AppStateError(
      "ALIAS_INVALID",
      400,
      "El apodo debe tener entre 2 y 24 caracteres.",
    );
  }
  const aliasKey = normalizeAlias(alias);
  const editToken = createEditToken();
  const tokenHash = await hashSecret(editToken);
  const participantId = crypto.randomUUID();

  await mutateAppState((draft) => {
    if (draft.participants.some((row) => row.alias_key === aliasKey)) {
      throw new AppStateError(
        "ALIAS_TAKEN",
        409,
        "Ese apodo ya está en uso. Prueba con otro.",
      );
    }
    if (
      draft.participants.some((row) => row.edit_token_hash === tokenHash)
    ) {
      throw new AppStateError(
        "STATE_CONFLICT",
        409,
        "No fue posible crear una sesión única. Inténtalo otra vez.",
      );
    }
    draft.participants.push({
      id: participantId,
      alias,
      alias_key: aliasKey,
      edit_token_hash: tokenHash,
      created_at: new Date().toISOString(),
    });
  });

  return {
    participant: { id: participantId, alias },
    editToken,
  };
}

export async function savePredictions(
  editToken: string | null,
  picks: PredictionInput[],
) {
  if (picks.length === 0 || picks.length > 10) {
    throw new AppStateError(
      "INVALID_PICKS",
      400,
      "Selecciona al menos un ganador válido.",
    );
  }
  const normalized = picks.map(({ fightId, winnerSlug }) => {
    if (
      !Number.isInteger(fightId) ||
      typeof winnerSlug !== "string" ||
      !winnerIsValid(fightId, winnerSlug)
    ) {
      throw new AppStateError(
        "INVALID_PICKS",
        400,
        "Hay una selección que no corresponde a la cartelera.",
      );
    }
    return { fightId, winnerSlug };
  });
  if (!editToken) {
    throw new AppStateError(
      "INVALID_SESSION",
      401,
      "Este dispositivo no tiene una sesión válida.",
    );
  }
  const tokenHash = await hashSecret(editToken);
  const savedAt = new Date().toISOString();

  await mutateAppState((draft) => {
    const participant = draft.participants.find(
      (row) => row.edit_token_hash === tokenHash,
    );
    if (!participant) {
      throw new AppStateError(
        "INVALID_SESSION",
        401,
        "Este dispositivo no tiene una sesión válida.",
      );
    }
    if (isLocked(draft.settings)) {
      throw new AppStateError(
        "PREDICTIONS_LOCKED",
        423,
        "El tiempo terminó: tus predicciones están en solo lectura.",
      );
    }
    for (const pick of normalized) {
      const index = draft.predictions.findIndex(
        (row) =>
          row.participant_id === participant.id &&
          row.fight_id === pick.fightId,
      );
      const row: PredictionRow = {
        participant_id: participant.id,
        fight_id: pick.fightId,
        winner_slug: pick.winnerSlug,
        updated_at: savedAt,
      };
      if (index === -1) draft.predictions.push(row);
      else draft.predictions[index] = row;
    }
  });

  return { savedCount: normalized.length, savedAt };
}

export async function setManualLock(locked: boolean): Promise<AppState> {
  return (
    await mutateAppState((draft) => {
      if (!locked && draft.results.length > 0) {
        throw new AppStateError(
          "RESULTS_PREVENT_UNLOCK",
          409,
          "No se puede reabrir mientras haya resultados cargados. Bórralos primero.",
        );
      }
      draft.settings.manual_locked = locked ? 1 : 0;
      draft.settings.updated_at = new Date().toISOString();
    })
  ).state;
}

export async function setLockAt(lockAt: string): Promise<AppState> {
  const parsed = Date.parse(lockAt);
  if (!Number.isFinite(parsed)) {
    throw new AppStateError(
      "INVALID_LOCK_AT",
      400,
      "La hora de cierre no es válida.",
    );
  }
  const canonical = new Date(parsed).toISOString();
  return (
    await mutateAppState((draft) => {
      draft.settings.lock_at = canonical;
      draft.settings.updated_at = new Date().toISOString();
    })
  ).state;
}

export async function setResult(
  fightId: number,
  winnerSlug: string,
): Promise<AppState> {
  if (!winnerIsValid(fightId, winnerSlug)) {
    throw new AppStateError(
      "INVALID_RESULT",
      400,
      "Ese resultado no corresponde al combate.",
    );
  }
  return (
    await mutateAppState((draft) => {
      const now = new Date().toISOString();
      draft.settings.manual_locked = 1;
      draft.settings.updated_at = now;
      const row: ResultRow = {
        fight_id: fightId,
        winner_slug: winnerSlug,
        updated_at: now,
      };
      const index = draft.results.findIndex(
        (item) => item.fight_id === fightId,
      );
      if (index === -1) draft.results.push(row);
      else draft.results[index] = row;
    })
  ).state;
}

export async function clearResult(fightId: number): Promise<AppState> {
  if (!Number.isInteger(fightId) || !getFight(fightId)) {
    throw new AppStateError(
      "FIGHT_NOT_FOUND",
      400,
      "Ese combate no existe.",
    );
  }
  return (
    await mutateAppState((draft) => {
      draft.results = draft.results.filter(
        (row) => row.fight_id !== fightId,
      );
    })
  ).state;
}

export async function setOutfitStatus(
  status: OutfitStatus,
): Promise<AppState> {
  if (!["draft", "open", "closed"].includes(status)) {
    throw new AppStateError(
      "INVALID_OUTFIT_STATUS",
      400,
      "El estado de Mejor Outfit no es válido.",
    );
  }
  return (
    await mutateAppState((draft) => {
      const current = draft.outfitSettings;
      if (status === current.status) return;
      const now = new Date().toISOString();

      if (status === "draft") {
        if (draft.outfitVotes.length > 0) {
          throw new AppStateError(
            "OUTFIT_VOTES_PREVENT_DRAFT",
            409,
            "Borra primero los votos para volver a preparar la galería.",
          );
        }
        draft.outfitSettings = {
          ...current,
          status: "draft",
          opened_at: null,
          closed_at: null,
          updated_at: now,
        };
      } else if (status === "open") {
        if (current.status === "closed") {
          throw new AppStateError(
            "OUTFIT_CONFLICT",
            409,
            "Una votación cerrada no se puede reabrir. Borra los votos para iniciar una nueva.",
          );
        }
        if (draft.outfitPhotos.length < 2) {
          throw new AppStateError(
            "OUTFIT_NEEDS_PHOTOS",
            409,
            "Sube al menos dos fotos antes de abrir la votación.",
          );
        }
        draft.outfitSettings = {
          ...current,
          status: "open",
          opened_at: now,
          closed_at: null,
          updated_at: now,
        };
      } else {
        if (current.status !== "open") {
          throw new AppStateError(
            "OUTFIT_CONFLICT",
            409,
            "La votación debe estar abierta antes de cerrarla.",
          );
        }
        draft.outfitSettings = {
          ...current,
          status: "closed",
          closed_at: now,
          updated_at: now,
        };
      }
    })
  ).state;
}

export async function clearOutfitVotes(): Promise<AppState> {
  return (
    await mutateAppState((draft) => {
      if (draft.outfitSettings.status !== "closed") {
        throw new AppStateError(
          "OUTFIT_RESET_REQUIRES_CLOSED",
          409,
          "Solo puedes reiniciar una votación después de cerrarla.",
        );
      }
      const now = new Date().toISOString();
      draft.outfitVotes = [];
      draft.outfitSettings = {
        ...draft.outfitSettings,
        status: "draft",
        opened_at: null,
        closed_at: null,
        updated_at: now,
      };
    })
  ).state;
}

export async function saveOutfitVote(
  editToken: string | null,
  candidateValue: string,
) {
  const candidateParticipantId = candidateValue.trim();
  if (!candidateParticipantId || candidateParticipantId.length > 64) {
    throw new AppStateError(
      "OUTFIT_CANDIDATE_NOT_FOUND",
      400,
      "Selecciona una persona válida.",
    );
  }
  if (!editToken) {
    throw new AppStateError(
      "INVALID_SESSION",
      401,
      "Este dispositivo no tiene una sesión válida.",
    );
  }
  const tokenHash = await hashSecret(editToken);
  const savedAt = new Date().toISOString();

  await mutateAppState(async (draft) => {
    const participant = draft.participants.find(
      (row) => row.edit_token_hash === tokenHash,
    );
    if (!participant) {
      throw new AppStateError(
        "INVALID_SESSION",
        401,
        "Este dispositivo no tiene una sesión válida.",
      );
    }
    const settings = draft.outfitSettings;
    if (
      settings.status !== "open" ||
      !settings.opened_at ||
      !Number.isFinite(Date.parse(settings.opened_at))
    ) {
      throw new AppStateError(
        "OUTFIT_NOT_OPEN",
        423,
        "La votación de Mejor Outfit no está abierta.",
      );
    }
    if (Date.parse(participant.created_at) > Date.parse(settings.opened_at)) {
      throw new AppStateError(
        "OUTFIT_LATE_PARTICIPANT",
        403,
        "Solo los perfiles creados antes de abrir la votación pueden votar.",
      );
    }
    if (candidateParticipantId === participant.id) {
      throw new AppStateError(
        "OUTFIT_SELF_VOTE",
        409,
        "No puedes votar por tu propio outfit.",
      );
    }
    if (
      !draft.outfitPhotos.some(
        (row) => row.participant_id === candidateParticipantId,
      )
    ) {
      throw new AppStateError(
        "OUTFIT_CANDIDATE_NOT_FOUND",
        404,
        "Esa persona no está en la votación.",
      );
    }

    const voterKey = await createOutfitVoterKey(participant.id);
    const vote: OutfitVoteRow = {
      voter_key: voterKey,
      candidate_participant_id: candidateParticipantId,
      updated_at: savedAt,
    };
    const index = draft.outfitVotes.findIndex(
      (row) => row.voter_key === voterKey,
    );
    if (index === -1) draft.outfitVotes.push(vote);
    else draft.outfitVotes[index] = vote;
  });

  return { myVote: candidateParticipantId, savedAt };
}

const PHOTO_EXTENSION = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function validatePhoto(contentType: string, extension: string) {
  if (PHOTO_EXTENSION.get(contentType) !== extension) {
    throw new AppStateError(
      "INVALID_PHOTO",
      415,
      "Usa una foto JPG, PNG, WebP o AVIF.",
    );
  }
}

function byteSize(data: ArrayBuffer | Blob): number {
  return data instanceof Blob ? data.size : data.byteLength;
}

export async function putOutfitPhoto(
  participantIdValue: string,
  data: ArrayBuffer | Blob,
  contentTypeValue: string,
  extensionValue: string,
): Promise<AppState> {
  const participantId = participantIdValue.trim();
  const contentType = contentTypeValue.toLowerCase();
  const extension = extensionValue.toLowerCase();
  validatePhoto(contentType, extension);
  if (!participantId || participantId.length > 64) {
    throw new AppStateError(
      "PARTICIPANT_NOT_FOUND",
      400,
      "Selecciona un participante válido.",
    );
  }

  const preflight = await readAppState();
  if (preflight.outfitSettings.status !== "draft") {
    throw new AppStateError(
      "OUTFIT_NOT_DRAFT",
      409,
      "Las fotos solo se pueden cambiar antes de abrir la votación.",
    );
  }
  if (!preflight.participants.some((row) => row.id === participantId)) {
    throw new AppStateError(
      "PARTICIPANT_NOT_FOUND",
      404,
      "Ese participante no existe.",
    );
  }

  const store = photoStore();
  let storageKey = "";
  for (let attempt = 0; attempt < 3 && !storageKey; attempt += 1) {
    const candidate = `outfit/${participantId}/${crypto.randomUUID()}.${extension}`;
    let result;
    try {
      result = await store.set(candidate, data, {
        onlyIfNew: true,
        metadata: { participantId, contentType },
      });
    } catch {
      throw unavailable("No fue posible guardar la foto.");
    }
    if (result.modified) storageKey = candidate;
  }
  if (!storageKey) {
    throw new AppStateError(
      "STATE_CONFLICT",
      409,
      "No fue posible reservar un nombre para la foto.",
    );
  }

  try {
    const mutation = await mutateAppState((draft) => {
      if (draft.outfitSettings.status !== "draft") {
        throw new AppStateError(
          "OUTFIT_NOT_DRAFT",
          409,
          "La votación acaba de abrir; la foto no fue cambiada.",
        );
      }
      if (!draft.participants.some((row) => row.id === participantId)) {
        throw new AppStateError(
          "PARTICIPANT_NOT_FOUND",
          404,
          "Ese participante no existe.",
        );
      }
      const index = draft.outfitPhotos.findIndex(
        (row) => row.participant_id === participantId,
      );
      const previousStorageKey =
        index === -1 ? null : draft.outfitPhotos[index].storage_key;
      const row: OutfitPhotoRow = {
        participant_id: participantId,
        storage_key: storageKey,
        content_type: contentType,
        updated_at: new Date().toISOString(),
        byte_size: byteSize(data),
      };
      if (index === -1) draft.outfitPhotos.push(row);
      else draft.outfitPhotos[index] = row;
      return previousStorageKey;
    });
    if (mutation.result && mutation.result !== storageKey) {
      await store.delete(mutation.result).catch(() => undefined);
    }
    return mutation.state;
  } catch (error) {
    await store.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteOutfitPhoto(
  participantIdValue: string,
): Promise<AppState> {
  const participantId = participantIdValue.trim();
  if (!participantId || participantId.length > 64) {
    throw new AppStateError(
      "PARTICIPANT_NOT_FOUND",
      400,
      "Selecciona un participante válido.",
    );
  }
  const mutation = await mutateAppState((draft) => {
    if (draft.outfitSettings.status !== "draft") {
      throw new AppStateError(
        "OUTFIT_NOT_DRAFT",
        409,
        "Las fotos solo se pueden eliminar antes de abrir la votación.",
      );
    }
    const index = draft.outfitPhotos.findIndex(
      (row) => row.participant_id === participantId,
    );
    if (index === -1) {
      throw new AppStateError(
        "OUTFIT_PHOTO_NOT_FOUND",
        404,
        "Ese participante no tiene una foto.",
      );
    }
    const [removed] = draft.outfitPhotos.splice(index, 1);
    draft.outfitVotes = draft.outfitVotes.filter(
      (vote) => vote.candidate_participant_id !== participantId,
    );
    return removed.storage_key;
  });
  await photoStore().delete(mutation.result).catch(() => undefined);
  return mutation.state;
}

export async function getOutfitPhoto(
  participantIdValue: string,
): Promise<{
  row: OutfitPhotoRow;
  body: ReadableStream;
  etag?: string;
}> {
  const participantId = participantIdValue.trim();
  if (!participantId || participantId.length > 64) {
    throw new AppStateError(
      "OUTFIT_PHOTO_NOT_FOUND",
      400,
      "La foto solicitada no es válida.",
    );
  }
  const state = await readAppState();
  const row = state.outfitPhotos.find(
    (item) => item.participant_id === participantId,
  );
  if (!row) {
    throw new AppStateError(
      "OUTFIT_PHOTO_NOT_FOUND",
      404,
      "La foto no existe.",
    );
  }

  let entry;
  try {
    entry = await photoStore().getWithMetadata(row.storage_key, {
      type: "stream",
      consistency: "strong",
    });
  } catch {
    throw unavailable("No fue posible cargar la foto.");
  }
  if (!entry?.data) {
    throw new AppStateError(
      "OUTFIT_PHOTO_UNAVAILABLE",
      404,
      "La foto no está disponible.",
    );
  }
  return { row, body: entry.data, etag: entry.etag };
}
