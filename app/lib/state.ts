import { FIGHTS } from "./event";
import {
  createOutfitVoterKey,
  getParticipantByToken,
  isLocked,
  readAppState,
  type AppState,
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

function photoUrl(participantId: string, updatedAt: string): string {
  const query = new URLSearchParams({ participantId, v: updatedAt });
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

function readCoreData(state: AppState): {
  settings: AppState["settings"];
  participants: ParticipantRow[];
  predictions: PredictionRow[];
  results: ResultRow[];
} {
  return {
    settings: state.settings,
    participants: [...state.participants].sort(
      (left, right) =>
        left.created_at.localeCompare(right.created_at) ||
        left.id.localeCompare(right.id),
    ),
    predictions: [...state.predictions].sort(
      (left, right) =>
        left.fight_id - right.fight_id ||
        left.participant_id.localeCompare(right.participant_id),
    ),
    results: [...state.results].sort(
      (left, right) => left.fight_id - right.fight_id,
    ),
  };
}

function readOutfitData(state: AppState): {
  settings: OutfitSettingsRow;
  entries: OutfitEntryRow[];
} {
  const participantsById = new Map(
    state.participants.map((participant) => [participant.id, participant]),
  );
  const voteCountByCandidate = new Map<string, number>();
  for (const vote of state.outfitVotes) {
    voteCountByCandidate.set(
      vote.candidate_participant_id,
      (voteCountByCandidate.get(vote.candidate_participant_id) ?? 0) + 1,
    );
  }
  const entries = state.outfitPhotos
    .map((photo) => {
      const participant = participantsById.get(photo.participant_id);
      if (!participant) return null;
      return {
        participant_id: photo.participant_id,
        alias: participant.alias,
        updated_at: photo.updated_at,
        vote_count: voteCountByCandidate.get(photo.participant_id) ?? 0,
      };
    })
    .filter((entry): entry is OutfitEntryRow => entry !== null)
    .sort(
      (left, right) =>
        left.alias.localeCompare(right.alias, "es") ||
        left.participant_id.localeCompare(right.participant_id),
    );
  return { settings: state.outfitSettings, entries };
}

export async function buildPublicState(editToken: string | null) {
  const state = await readAppState();
  const data = readCoreData(state);
  const outfitData = readOutfitData(state);
  const currentParticipant = await getParticipantByToken(editToken, state);
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
  let myOutfitVote: string | null = null;
  if (currentParticipant && outfitData.settings.status !== "draft") {
    const voterKey = await createOutfitVoterKey(currentParticipant.id);
    myOutfitVote =
      state.outfitVotes.find((vote) => vote.voter_key === voterKey)
        ?.candidate_participant_id ?? null;
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
      entries: outfitData.entries.map((entry) => ({
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
  const state = await readAppState();
  const data = readCoreData(state);
  const outfitData = readOutfitData(state);
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
