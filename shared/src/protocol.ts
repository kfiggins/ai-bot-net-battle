import { z } from "zod";

// --- Base schemas ---

export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

export const EntityKind = z.enum(["player_ship", "bullet", "minion_ship", "tower", "mothership"]);
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

export const WelcomeMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("welcome"),
  entityId: z.string(),
});
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;

export const PhaseInfoSchema = z.object({
  current: z.number().int(),
  objectives: z.array(z.string()),
  remaining: z.record(z.string(), z.number()),
  matchOver: z.boolean(),
  mothershipShielded: z.boolean(),
}).optional();
export type PhaseInfo = z.infer<typeof PhaseInfoSchema>;

export const SnapshotMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("snapshot"),
  tick: z.number().int(),
  entities: z.array(EntitySchema),
  phase: PhaseInfoSchema,
});
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;

// --- Agent → Server ---

export const SpawnShipCommandSchema = z.object({
  v: z.literal(1),
  type: z.literal("agent_command"),
  command: z.literal("spawn_ship"),
  params: z.object({
    kind: z.enum(["minion_ship"]),
    count: z.number().int().min(1).max(5),
    lane: z.enum(["top", "mid", "bottom"]).optional(),
  }),
});
export type SpawnShipCommand = z.infer<typeof SpawnShipCommandSchema>;

export const BuildTowerCommandSchema = z.object({
  v: z.literal(1),
  type: z.literal("agent_command"),
  command: z.literal("build_tower"),
  params: z.object({
    x: z.number(),
    y: z.number(),
  }),
});
export type BuildTowerCommand = z.infer<typeof BuildTowerCommandSchema>;

export const SetStrategyCommandSchema = z.object({
  v: z.literal(1),
  type: z.literal("agent_command"),
  command: z.literal("set_strategy"),
  params: z.object({
    mode: z.enum(["aggressive", "defensive", "balanced"]),
  }),
});
export type SetStrategyCommand = z.infer<typeof SetStrategyCommandSchema>;

export const AgentCommandSchema = z.discriminatedUnion("command", [
  SpawnShipCommandSchema,
  BuildTowerCommandSchema,
  SetStrategyCommandSchema,
]);
export type AgentCommand = z.infer<typeof AgentCommandSchema>;

// --- Union of all wire messages ---

export const ClientMessageSchema = PlayerInputMessageSchema;
export type ClientMessage = PlayerInputMessage;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeMessageSchema,
  SnapshotMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
