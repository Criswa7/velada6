import { FIGHTS } from "./event";
import {
  ensureSchema,
  getD1,
  getParticipantByToken,
  getSettings,
  isLocked,
  type ParticipantRow,
  type PredictionRow,
  type ResultRow,
} from "./db";
import { calculateStandings } from "./scoring";

async function readRows<T>(sql: string): Promise<T[]> {
  const response = await getD1().prepare(sql).all<T>();
  return response.results;
}

export async function readCoreData() {
  await ensureSchema();
  const [settings, participants, predictions, results] = await Promise.all([
    getSettings(),
    readRows<ParticipantRow>(
      "SELECT id, alias, alias_key, edit_token_hash, created_at FROM participants ORDER BY created_at ASC",
    ),
    readRows<PredictionRow>(
      "SELECT participant_id, fight_id, winner_slug, updated_at FROM predictions ORDER BY fight_id ASC",
    ),
    readRows<ResultRow>(
      "SELECT fight_id, winner_slug, updated_at FROM results ORDER BY fight_id ASC",
    ),
  ]);
  return { settings, participants, predictions, results };
}

export async function buildPublicState(editToken: string | null) {
  const [data, currentParticipant] = await Promise.all([
    readCoreData(),
    getParticipantByToken(editToken),
  ]);
  const locked = isLocked(data.settings);
  const ownPredictions = currentParticipant
    ? data.predictions.filter(
        (prediction) => prediction.participant_id === currentParticipant.id,
      )
    : [];

  return {
    event: {
      lockAt: data.settings.lock_at,
      locked,
      manualLocked: data.settings.manual_locked === 1,
      serverNow: new Date().toISOString(),
      completedResults: data.results.length,
    },
    fights: FIGHTS,
    participant: currentParticipant
      ? { id: currentParticipant.id, alias: currentParticipant.alias }
      : null,
    picks: Object.fromEntries(
      ownPredictions.map((prediction) => [
        String(prediction.fight_id),
        prediction.winner_slug,
      ]),
    ),
    results: Object.fromEntries(
      data.results.map((result) => [
        String(result.fight_id),
        result.winner_slug,
      ]),
    ),
    standings: calculateStandings(
      data.participants,
      data.predictions,
      data.results,
    ),
  };
}

export async function buildAdminState() {
  const data = await readCoreData();
  return {
    event: {
      lockAt: data.settings.lock_at,
      locked: isLocked(data.settings),
      manualLocked: data.settings.manual_locked === 1,
      serverNow: new Date().toISOString(),
    },
    fights: FIGHTS,
    results: Object.fromEntries(
      data.results.map((result) => [
        String(result.fight_id),
        result.winner_slug,
      ]),
    ),
    participants: calculateStandings(
      data.participants,
      data.predictions,
      data.results,
    ),
  };
}
