import { FIGHTS } from "./event";
import {
  createOutfitVoterKey,
  ensureSchema,
  getD1,
  getOutfitSettings,
  getParticipantByToken,
  getSettings,
  isLocked,
  type OutfitSettingsRow,
  type ParticipantRow,
  type PredictionRow,
  type ResultRow,
} from "./db";
import { calculateStandings } from "./scoring";

type OutfitEntryRow = {
  participant_id: string;
  alias: string;
  updated_at: string;
  vote_count: number;
};

async function readRows<T>(sql: string): Promise<T[]> {
  const response = await getD1().prepare(sql).all<T>();
  return response.results;
}

function photoUrl(participantId: string, updatedAt: string): string {
  const query = new URLSearchParams({
    participantId,
    v: updatedAt,
  });
  return `/api/outfit/photo?${query.toString()}`;
}

function rankOutfitResults(entries: OutfitEntryRow[]) {
  const rankedEntries = [...entries].sort(
    (left, right) =>
      Number(right.vote_count) - Number(left.vote_count) ||
      left.alias.localeCompare(right.alias, "es") ||
      left.participant_id.localeCompare(right.participant_id),
  );
  let previousVotes: number | null = null;
  let previousRank = 0;
  return rankedEntries.map((entry, index) => {
    const votes = Number(entry.vote_count);
    const rank = votes === previousVotes ? previousRank : index + 1;
    previousVotes = votes;
    previousRank = rank;
    return {
      rank,
      participantId: entry.participant_id,
      alias: entry.alias,
      photoUrl: photoUrl(entry.participant_id, entry.updated_at),
      votes,
    };
  });
}

async function readOutfitData(): Promise<{
  settings: OutfitSettingsRow;
  entries: OutfitEntryRow[];
}> {
  await ensureSchema();
  const [settings, entries] = await Promise.all([
    getOutfitSettings(),
    readRows<OutfitEntryRow>(`
      SELECT
        photos.participant_id,
        participants.alias,
        photos.updated_at,
        COUNT(votes.voter_key) AS vote_count
      FROM outfit_photos AS photos
      INNER JOIN participants
        ON participants.id = photos.participant_id
      LEFT JOIN outfit_votes AS votes
        ON votes.candidate_participant_id = photos.participant_id
      GROUP BY
        photos.participant_id,
        participants.alias,
        photos.updated_at
      ORDER BY
        participants.alias COLLATE NOCASE ASC,
        photos.participant_id ASC
    `),
  ]);
  return { settings, entries };
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
  const [data, currentParticipant, outfitData] = await Promise.all([
    readCoreData(),
    getParticipantByToken(editToken),
    readOutfitData(),
  ]);
  const locked = isLocked(data.settings);
  const ownPredictions = currentParticipant
    ? data.predictions.filter(
        (prediction) => prediction.participant_id === currentParticipant.id,
      )
    : [];
  const totalOutfitVotes = outfitData.entries.reduce(
    (total, entry) => total + Number(entry.vote_count),
    0,
  );
  const publicOutfitEntries = [...outfitData.entries].sort((left, right) =>
    left.alias.localeCompare(right.alias, "es"),
  );
  let myOutfitVote: string | null = null;
  if (currentParticipant && outfitData.settings.status !== "draft") {
    const voterKey = await createOutfitVoterKey(currentParticipant.id);
    const vote = await getD1()
      .prepare(
        "SELECT candidate_participant_id FROM outfit_votes WHERE voter_key = ?",
      )
      .bind(voterKey)
      .first<{ candidate_participant_id: string }>();
    myOutfitVote = vote?.candidate_participant_id ?? null;
  }

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
    outfit: {
      status: outfitData.settings.status,
      entries: publicOutfitEntries.map((entry) => ({
        participantId: entry.participant_id,
        alias: entry.alias,
        photoUrl: photoUrl(entry.participant_id, entry.updated_at),
        updatedAt: entry.updated_at,
      })),
      myVote: myOutfitVote,
      totalVotes: totalOutfitVotes,
      results:
        outfitData.settings.status === "closed"
          ? rankOutfitResults(outfitData.entries)
          : [],
    },
  };
}

export async function buildAdminState() {
  const [data, outfitData] = await Promise.all([
    readCoreData(),
    readOutfitData(),
  ]);
  const totalOutfitVotes = outfitData.entries.reduce(
    (total, entry) => total + Number(entry.vote_count),
    0,
  );
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
    outfit: {
      status: outfitData.settings.status,
      openedAt: outfitData.settings.opened_at,
      closedAt: outfitData.settings.closed_at,
      entries: outfitData.entries.map((entry) => ({
        participantId: entry.participant_id,
        alias: entry.alias,
        photoUrl: photoUrl(entry.participant_id, entry.updated_at),
        updatedAt: entry.updated_at,
      })),
      myVote: null,
      voteCount: totalOutfitVotes,
      totalVotes: totalOutfitVotes,
      results:
        outfitData.settings.status === "closed"
          ? rankOutfitResults(outfitData.entries)
          : [],
    },
  };
}
