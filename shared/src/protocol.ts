import { z } from "zod";

// --- Base schemas ---

export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

export const EntityKind = z.enum(["player_ship", "bullet", "minion_ship", "tower"]);
export type EntityKind = z.infer<typeof EntityKind>;

export const EntitySchema = z.object({
  id: z.string(),
  kind: EntityKind,
  pos: Vec2Schema,
  vel: Vec2Schema,
  hp: z.number(),
  team: z.number(),
});
export type Entity = z.infer<typeof EntitySchema>;

// --- Client → Server ---

export const PlayerInputDataSchema = z.object({
  up: z.boolean(),
  down: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  fire: z.boolean(),
  aimAngle: z.number(),
});
export type PlayerInputData = z.infer<typeof PlayerInputDataSchema>;

export const PlayerInputMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("player_input"),
  input: PlayerInputDataSchema,
});
export type PlayerInputMessage = z.infer<typeof PlayerInputMessageSchema>;

// --- Server → Client ---

export const SnapshotMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("snapshot"),
  tick: z.number().int(),
  entities: z.array(EntitySchema),
});
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;

// --- Union of all wire messages ---

export const ClientMessageSchema = PlayerInputMessageSchema;
export type ClientMessage = PlayerInputMessage;

export const ServerMessageSchema = SnapshotMessageSchema;
export type ServerMessage = SnapshotMessage;
