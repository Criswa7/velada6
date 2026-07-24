import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const participants = sqliteTable(
  "participants",
  {
    id: text("id").primaryKey(),
    alias: text("alias").notNull(),
    aliasKey: text("alias_key").notNull(),
    editTokenHash: text("edit_token_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("participants_alias_key_idx").on(table.aliasKey),
    uniqueIndex("participants_edit_token_hash_idx").on(table.editTokenHash),
  ],
);

export const predictions = sqliteTable(
  "predictions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    participantId: text("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    fightId: integer("fight_id").notNull(),
    winnerSlug: text("winner_slug").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("predictions_participant_fight_idx").on(
      table.participantId,
      table.fightId,
    ),
  ],
);

export const results = sqliteTable("results", {
  fightId: integer("fight_id").primaryKey(),
  winnerSlug: text("winner_slug").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const eventSettings = sqliteTable("event_settings", {
  id: integer("id").primaryKey(),
  lockAt: text("lock_at").notNull(),
  manualLocked: integer("manual_locked").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const outfitSettings = sqliteTable("outfit_settings", {
  id: integer("id").primaryKey(),
  status: text("status", { enum: ["draft", "open", "closed"] })
    .notNull()
    .default("draft"),
  openedAt: text("opened_at"),
  closedAt: text("closed_at"),
  updatedAt: text("updated_at").notNull(),
});

export const outfitPhotos = sqliteTable(
  "outfit_photos",
  {
    participantId: text("participant_id")
      .primaryKey()
      .references(() => participants.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("outfit_photos_storage_key_idx").on(table.storageKey),
  ],
);

export const outfitVotes = sqliteTable(
  "outfit_votes",
  {
    voterKey: text("voter_key").primaryKey(),
    candidateParticipantId: text("candidate_participant_id")
      .notNull()
      .references(() => outfitPhotos.participantId, { onDelete: "cascade" }),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("outfit_votes_candidate_idx").on(table.candidateParticipantId),
  ],
);
