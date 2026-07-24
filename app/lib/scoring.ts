import { FIGHTS } from "./event";
import type { ParticipantRow, PredictionRow, ResultRow } from "./db";

export type Standing = {
  rank: number;
  participantId: string;
  alias: string;
  points: number;
  correct: number;
  savedCount: number;
};

export function calculateStandings(
  participants: ParticipantRow[],
  predictions: PredictionRow[],
  results: ResultRow[],
): Standing[] {
  const resultByFight = new Map(
    results.map((result) => [result.fight_id, result.winner_slug]),
  );
  const fightById = new Map(FIGHTS.map((fight) => [fight.id, fight]));
  const picksByParticipant = new Map<string, PredictionRow[]>();

  for (const prediction of predictions) {
    const picks = picksByParticipant.get(prediction.participant_id) ?? [];
    picks.push(prediction);
    picksByParticipant.set(prediction.participant_id, picks);
  }

  const sorted = participants
    .map((participant) => {
      const picks = picksByParticipant.get(participant.id) ?? [];
      let points = 0;
      let correct = 0;
      for (const pick of picks) {
        if (resultByFight.get(pick.fight_id) !== pick.winner_slug) continue;
        correct += 1;
        points += fightById.get(pick.fight_id)?.weight ?? 1;
      }
      return {
        rank: 0,
        participantId: participant.id,
        alias: participant.alias,
        points,
        correct,
        savedCount: picks.length,
      };
    })
    .sort(
      (left, right) =>
        right.points - left.points ||
        left.alias.localeCompare(right.alias, "es"),
    );

  let previousPoints: number | null = null;
  let previousRank = 0;
  return sorted.map((standing, index) => {
    const tied = standing.points === previousPoints;
    const rank = tied ? previousRank : index + 1;
    previousPoints = standing.points;
    previousRank = rank;
    return { ...standing, rank };
  });
}
