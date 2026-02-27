import { z } from "zod";

// --- Base schemas ---

export const Vec2Schema = z.object({
  x: z.number(),
  y: z.number(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

export const EntityKind = z.enum(["player_ship", "bullet", "missile", "minion_ship", "tower", "missile_tower", "mothership", "energy_orb", "nemesis", "phantom_ship"]);
export type EntityKind = z.infer<typeof EntityKind>;

export const UpgradesSchema = z.object({
  damage: z.number().int(),
  speed: z.number().int(),
  health: z.number().int(),
  fire_rate: z.number().int(),
});
export type Upgrades = z.infer<typeof UpgradesSchema>;

export const EntitySchema = z.object({
  id: z.string(),
  kind: EntityKind,
  pos: Vec2Schema,
  vel: Vec2Schema,
  hp: z.number(),
  team: z.number(),
  label: z.string().optional(),
  playerIndex: z.number().int().optional(),
  // XP & leveling (player_ship only)
  level: z.number().int().optional(),
  xp: z.number().optional(),
  xpToNext: z.number().optional(),
  // Upgrades (player_ship only)
  upgrades: UpgradesSchema.optional(),
  cannons: z.number().int().optional(),
  pendingUpgrades: z.number().int().optional(),
  aimAngle: z.number().optional(),
  ownerKind: z.string().optional(),
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

export const JoinRoomMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("join_room"),
  roomId: z.string().min(1).max(32),
  displayName: z.string().min(1).max(20).optional(),
  reconnectToken: z.string().optional(),
});
export type JoinRoomMessage = z.infer<typeof JoinRoomMessageSchema>;

// --- Server → Client ---

export const AgentControlModeSchema = z.enum(["external_agent", "builtin_fake_ai"]);
export type AgentControlMode = z.infer<typeof AgentControlModeSchema>;

export const LobbyStateSchema = z.object({
  state: z.enum(["waiting", "in_progress", "finished"]),
  players: z.number().int(),
  maxPlayers: z.number().int(),
  mode: AgentControlModeSchema,
});
export type LobbyState = z.infer<typeof LobbyStateSchema>;

export const WelcomeMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("welcome"),
  roomId: z.string(),
  entityId: z.string(),
  playerIndex: z.number().int(),
  reconnectToken: z.string(),
  lobby: LobbyStateSchema,
});
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;

export const RoomErrorMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("room_error"),
  error: z.string(),
  detail: z.string().optional(),
});
export type RoomErrorMessage = z.infer<typeof RoomErrorMessageSchema>;

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
  botResources: z.number().int().optional(),
});
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;

// --- Agent → Server ---

export const SpawnShipCommandSchema = z.object({
  v: z.literal(1),
  type: z.literal("agent_command"),
  command: z.literal("spawn_ship"),
  params: z.object({
    kind: z.enum(["minion_ship", "phantom_ship"]),
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

// --- Client → Server: player_upgrade ---

export const PlayerUpgradeMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("player_upgrade"),
  stat: z.enum(["damage", "speed", "health", "fire_rate"]),
});
export type PlayerUpgradeMessage = z.infer<typeof PlayerUpgradeMessageSchema>;

// --- Client → Server: start_game ---

export const StartGameMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("start_game"),
  mode: AgentControlModeSchema.optional(),
});
export type StartGameMessage = z.infer<typeof StartGameMessageSchema>;

// --- Client → Server: leave_room ---

export const LeaveRoomMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("leave_room"),
});
export type LeaveRoomMessage = z.infer<typeof LeaveRoomMessageSchema>;

// --- Server → Client: lobby_update ---

export const LobbyPlayerSchema = z.object({
  name: z.string(),
  playerIndex: z.number().int(),
});
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;

export const LobbyUpdateMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("lobby_update"),
  players: z.array(LobbyPlayerSchema),
  mode: AgentControlModeSchema,
});
export type LobbyUpdateMessage = z.infer<typeof LobbyUpdateMessageSchema>;

// --- Server → Client: match_start ---

export const MatchStartMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("match_start"),
});
export type MatchStartMessage = z.infer<typeof MatchStartMessageSchema>;

// --- Server → Client: match_end ---

export const MatchEndMessageSchema = z.object({
  v: z.literal(1),
  type: z.literal("match_end"),
});
export type MatchEndMessage = z.infer<typeof MatchEndMessageSchema>;

// --- Union of all wire messages ---

export const ClientMessageSchema = z.discriminatedUnion("type", [
  PlayerInputMessageSchema,
  JoinRoomMessageSchema,
  StartGameMessageSchema,
  LeaveRoomMessageSchema,
  PlayerUpgradeMessageSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
  WelcomeMessageSchema,
  RoomErrorMessageSchema,
  SnapshotMessageSchema,
  LobbyUpdateMessageSchema,
  MatchStartMessageSchema,
  MatchEndMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
