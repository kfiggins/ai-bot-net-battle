import { describe, it, expect, beforeEach } from "vitest";
import { BossManager } from "./boss.js";
import { Simulation } from "./sim.js";
import { AIManager } from "./ai.js";
import { MOTHERSHIP_HP, NEMESIS_HP, NEMESIS_RADIUS, ENEMY_TEAM, WORLD_WIDTH, WORLD_HEIGHT, SUB_BASE_HP, SUB_BASE_POP_MINIONS, SUB_BASE_POP_PHANTOMS } from "shared";

describe("BossManager", () => {
  let boss: BossManager;
  let sim: Simulation;

  beforeEach(() => {
    boss = new BossManager();
    sim = new Simulation();
  });

  describe("spawnMothership", () => {
    it("creates a mothership entity", () => {
      const entity = boss.spawnMothership(sim);
      expect(entity.kind).toBe("mothership");
      expect(entity.hp).toBe(MOTHERSHIP_HP);
      expect(entity.team).toBe(ENEMY_TEAM);
      expect(sim.entities.has(entity.id)).toBe(true);
      expect(boss.mothershipId).toBe(entity.id);
    });

    it("places mothership at center of the map", () => {
      const entity = boss.spawnMothership(sim);
      expect(entity.pos.x).toBe(WORLD_WIDTH / 2);
      expect(entity.pos.y).toBe(WORLD_HEIGHT / 2);
    });
  });

  describe("shield mechanics", () => {
    it("mothership is shielded while towers exist (phase 1)", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);

      expect(boss.isShielded(sim)).toBe(true);
    });

    it("mothership becomes unshielded when all towers destroyed (transitions to phase 2)", () => {
      boss.spawnMothership(sim);
      const tower = sim.spawnEnemy("tower", 500, 300);

      boss.update(sim);
      expect(boss.phaseState.current).toBe(1);

      // Destroy tower
      sim.entities.delete(tower.id);
      boss.update(sim);

      expect(boss.phaseState.current).toBe(2);
    });

    it("in phase 2, shielded while minions exist", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("minion_ship", 500, 300);

      // Force to phase 2 (no towers)
      boss.phaseState.current = 2;

      expect(boss.isShielded(sim)).toBe(true);
    });

    it("in phase 3, mothership is vulnerable", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      expect(boss.isShielded(sim)).toBe(false);
    });

    it("shield prevents damage to mothership", () => {
      const mothership = boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);

      // Manually damage mothership
      mothership.hp -= 50;

      boss.update(sim);

      // Shield should restore HP
      expect(mothership.hp).toBe(MOTHERSHIP_HP);
    });
  });

  describe("phase transitions", () => {
    it("starts at phase 1", () => {
      expect(boss.phaseState.current).toBe(1);
    });

    it("transitions from phase 1 to 2 when towers cleared", () => {
      boss.spawnMothership(sim);
      const tower = sim.spawnEnemy("tower", 500, 300);

      boss.update(sim);
      expect(boss.phaseState.current).toBe(1);

      sim.entities.delete(tower.id);
      boss.update(sim);
      expect(boss.phaseState.current).toBe(2);
    });

    it("transitions from phase 2 to 3 when minions cleared", () => {
      boss.spawnMothership(sim);
      const minion = sim.spawnEnemy("minion_ship", 500, 300);

      boss.phaseState.current = 2;

      boss.update(sim);
      expect(boss.phaseState.current).toBe(2);

      sim.entities.delete(minion.id);
      boss.update(sim);
      expect(boss.phaseState.current).toBe(3);
    });

    it("does not skip phases", () => {
      boss.spawnMothership(sim);
      // No towers or minions
      boss.update(sim);

      // Should go 1 → 2 (towers cleared)
      expect(boss.phaseState.current).toBe(2);

      boss.update(sim);
      // Should go 2 → 3 (minions cleared)
      expect(boss.phaseState.current).toBe(3);
    });
  });

  describe("win condition", () => {
    it("mothership death starts death sequence — entity removed immediately, phase still 3", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      boss.update(sim);

      // Entity is removed right away
      expect(sim.entities.has(mothership.id)).toBe(false);
      // But Nemesis hasn't spawned yet — still in death sequence
      expect(boss.phaseState.current).toBe(3);
      expect(boss.nemesisId).toBeNull();
    });

    it("mothership death spawns Nemesis and transitions to phase 4 after death sequence", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      // Run through the 60-tick death sequence
      for (let i = 0; i < 62; i++) {
        boss.update(sim);
      }

      expect(boss.phaseState.current).toBe(4);
      expect(boss.phaseState.matchOver).toBe(false);
      expect(boss.nemesisId).not.toBeNull();
      const nemesis = sim.entities.get(boss.nemesisId!);
      expect(nemesis?.kind).toBe("nemesis");
      expect(nemesis?.hp).toBe(NEMESIS_HP);
    });

    it("mothership entity is removed on death", () => {
      const mothership = boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      mothership.hp = 0;
      boss.update(sim);

      expect(sim.entities.has(mothership.id)).toBe(false);
    });

    it("match ends when Nemesis HP reaches 0", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;
      const nemesis = boss.spawnNemesis(sim, { x: 2000, y: 2000 });
      boss.phaseState.current = 4;

      nemesis.hp = 0;
      boss.update(sim);

      expect(boss.phaseState.matchOver).toBe(true);
      expect(boss.phaseState.winner).toBe("players");
    });

    it("does not process further updates after match over", () => {
      boss.spawnMothership(sim);
      boss.phaseState.matchOver = true;

      // Should be a no-op
      boss.update(sim);
      expect(boss.phaseState.matchOver).toBe(true);
    });
  });

  describe("getPhaseInfo", () => {
    it("returns correct phase 1 info", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("tower", 500, 300);
      sim.spawnEnemy("tower", 600, 300);

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(1);
      expect(info.objectives).toContain("Destroy all towers and sub-bases");
      expect(info.remaining.tower).toBe(2);
      expect(info.mothershipShielded).toBe(true);
    });

    it("returns correct phase 2 info", () => {
      boss.spawnMothership(sim);
      sim.spawnEnemy("minion_ship", 500, 300);
      boss.phaseState.current = 2;

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(2);
      expect(info.objectives).toContain("Destroy all minions");
      expect(info.remaining.minion_ship).toBe(1);
    });

    it("returns correct phase 3 info", () => {
      boss.spawnMothership(sim);
      boss.phaseState.current = 3;

      const info = boss.getPhaseInfo(sim);
      expect(info.current).toBe(3);
      expect(info.objectives).toContain("Destroy the mothership");
      expect(info.remaining.mothership).toBe(MOTHERSHIP_HP);
      expect(info.mothershipShielded).toBe(false);
    });

    it("returns matchOver status", () => {
      boss.spawnMothership(sim);
      boss.phaseState.matchOver = true;

      const info = boss.getPhaseInfo(sim);
      expect(info.matchOver).toBe(true);
    });
  });

  describe("nemesis teleport", () => {
    let nemesis: ReturnType<typeof boss.spawnNemesis>;

    beforeEach(() => {
      nemesis = boss.spawnNemesis(sim, { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
      boss.phaseState.current = 4;
      // No players in sim → movement AI is a no-op, isolating teleport behaviour
    });

    it("teleports into valid world bounds when HP crosses the 80% threshold", () => {
      nemesis.hp = Math.floor(NEMESIS_HP * 0.8) - 1;
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
      expect(nemesis.pos.y).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT - NEMESIS_RADIUS);
    });

    it("zeroes velocity on teleport", () => {
      nemesis.vel.x = 200;
      nemesis.vel.y = -150;
      nemesis.hp = Math.floor(NEMESIS_HP * 0.8) - 1;
      boss.update(sim);
      expect(nemesis.vel.x).toBe(0);
      expect(nemesis.vel.y).toBe(0);
    });

    it("does not teleport when HP is above all thresholds", () => {
      const startX = nemesis.pos.x;
      const startY = nemesis.pos.y;
      nemesis.hp = NEMESIS_HP; // full HP — above all thresholds
      boss.update(sim);
      expect(nemesis.pos.x).toBe(startX);
      expect(nemesis.pos.y).toBe(startY);
    });

    it("does not teleport when HP reaches 0 — Nemesis dies instead", () => {
      nemesis.hp = 0;
      boss.update(sim);
      expect(boss.phaseState.matchOver).toBe(true);
      expect(boss.phaseState.winner).toBe("players");
    });

    it("teleports at each 20% boundary — 4 times before death", () => {
      for (const fraction of [0.79, 0.59, 0.39, 0.19]) {
        nemesis.hp = Math.floor(NEMESIS_HP * fraction);
        boss.update(sim);
        expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
        expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
        expect(nemesis.pos.y).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
        expect(nemesis.pos.y).toBeLessThanOrEqual(WORLD_HEIGHT - NEMESIS_RADIUS);
        expect(nemesis.vel.x).toBe(0);
        expect(nemesis.vel.y).toBe(0);
      }
    });

    it("does not teleport again after all 4 thresholds are exhausted", () => {
      for (const fraction of [0.79, 0.59, 0.39, 0.19]) {
        nemesis.hp = Math.floor(NEMESIS_HP * fraction);
        boss.update(sim);
      }
      // All thresholds consumed — pin to a known in-bounds position and verify no further teleport
      nemesis.pos.x = 1234;
      nemesis.pos.y = 2345;
      nemesis.hp = 1; // barely alive
      boss.update(sim);
      expect(nemesis.pos.x).toBe(1234);
      expect(nemesis.pos.y).toBe(2345);
      expect(boss.phaseState.matchOver).toBe(false);
    });

    it("large single-tick damage spanning multiple thresholds still only teleports once", () => {
      // Drop from full to 50% — crosses both the 80% (960) and 60% (720) thresholds
      nemesis.hp = Math.floor(NEMESIS_HP * 0.5);
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);

      // Next threshold should now be at 40% (480) — verify a further drop triggers it
      nemesis.hp = Math.floor(NEMESIS_HP * 0.39);
      boss.update(sim);
      expect(nemesis.pos.x).toBeGreaterThanOrEqual(NEMESIS_RADIUS);
      expect(nemesis.pos.x).toBeLessThanOrEqual(WORLD_WIDTH - NEMESIS_RADIUS);
    });
  });
});

describe("combat integration with boss", () => {
  it("players can damage mothership in phase 3", () => {
    const sim = new Simulation();
    const boss = new BossManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = WORLD_HEIGHT / 2;

    const mothership = boss.spawnMothership(sim);
    mothership.pos.x = 140; // close to player
    boss.phaseState.current = 3; // vulnerable

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });

    for (let i = 0; i < 30; i++) {
      sim.update();
      boss.update(sim);
    }

    expect(mothership.hp).toBeLessThan(MOTHERSHIP_HP);
  });

  it("players cannot damage mothership in phase 1 with towers alive", () => {
    const sim = new Simulation();
    const boss = new BossManager();

    const player = sim.addPlayer("p1");
    player.pos.x = 100;
    player.pos.y = WORLD_HEIGHT / 2;

    const mothership = boss.spawnMothership(sim);
    mothership.pos.x = 140; // close to player
    sim.spawnEnemy("tower", 800, 300); // tower keeps shield up

    sim.setInput("p1", {
      up: false, down: false, left: false, right: false,
      fire: true, fireMissile: false, aimAngle: 0,
    });

    for (let i = 0; i < 30; i++) {
      sim.update();
      boss.update(sim);
    }

    // Shield should have restored HP each tick
    expect(mothership.hp).toBe(MOTHERSHIP_HP);
  });
});

describe("Sub-bases", () => {
  let boss: BossManager;
  let sim: Simulation;
  let ai: AIManager;

  beforeEach(() => {
    boss = new BossManager();
    sim = new Simulation();
    ai = new AIManager();
    boss.spawnMothership(sim);
  });

  describe("spawnSubBases", () => {
    it("spawns 4 sub-bases", () => {
      boss.spawnSubBases(sim, ai);
      const subBases = sim.getEntitiesByKind("sub_base");
      expect(subBases).toHaveLength(4);
    });

    it("spawns 2 towers per sub-base (8 total)", () => {
      boss.spawnSubBases(sim, ai);
      expect(boss.subBases.size).toBe(4);
      for (const [, sb] of boss.subBases) {
        expect(sb.towerIds.size).toBe(2);
      }
    });

    it("sub-bases are team 2 enemy entities", () => {
      boss.spawnSubBases(sim, ai);
      const subBases = sim.getEntitiesByKind("sub_base");
      for (const sb of subBases) {
        expect(sb.team).toBe(ENEMY_TEAM);
        expect(sb.hp).toBe(SUB_BASE_HP);
      }
    });

    it("spawns 1 regular tower and 1 missile tower per sub-base", () => {
      boss.spawnSubBases(sim, ai);
      for (const [, sb] of boss.subBases) {
        const kinds = new Set<string>();
        for (const towerId of sb.towerIds) {
          const tower = sim.entities.get(towerId);
          expect(tower).toBeDefined();
          kinds.add(tower!.kind);
        }
        expect(kinds.has("tower")).toBe(true);
        expect(kinds.has("missile_tower")).toBe(true);
      }
    });
  });

  describe("shield mechanic", () => {
    it("sub-base is shielded while its towers are alive", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      expect(boss.isSubBaseShielded(firstSbId, sim)).toBe(true);
    });

    it("sub-base shield restores HP each tick", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sbEntity = sim.entities.get(firstSbId)!;

      sbEntity.hp -= 100;
      boss.update(sim);

      expect(sbEntity.hp).toBe(SUB_BASE_HP);
    });

    it("sub-base becomes vulnerable when both towers are destroyed", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;

      // Destroy both towers
      for (const towerId of sb.towerIds) {
        sim.entities.delete(towerId);
      }

      boss.update(sim);
      expect(boss.isSubBaseShielded(firstSbId, sim)).toBe(false);
    });

    it("sub-base takes damage when unshielded", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;
      const sbEntity = sim.entities.get(firstSbId)!;

      // Destroy both towers
      for (const towerId of sb.towerIds) {
        sim.entities.delete(towerId);
      }
      boss.update(sim); // cleans up dead tower refs

      sbEntity.hp -= 100;
      boss.update(sim);

      // Should NOT be restored since no towers
      expect(sbEntity.hp).toBe(SUB_BASE_HP - 100);
    });

    it("sub-base is still shielded with one tower alive", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;

      // Destroy only the first tower
      const firstTowerId = Array.from(sb.towerIds)[0];
      sim.entities.delete(firstTowerId);

      boss.update(sim);
      expect(boss.isSubBaseShielded(firstSbId, sim)).toBe(true);
    });
  });

  describe("destruction and cleanup", () => {
    it("destroyed sub-base is removed from tracking", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];

      sim.entities.delete(firstSbId);
      boss.update(sim);

      expect(boss.subBases.has(firstSbId)).toBe(false);
    });

    it("orphaned towers from dead sub-base still block phase 1", () => {
      boss.spawnSubBases(sim, ai);
      // Remove all mothership-area towers (only keep sub-base towers)
      // Sub-base towers are regular "tower" and "missile_tower" entities
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;
      const towerIds = Array.from(sb.towerIds);

      // Kill the sub-base but leave its towers alive
      sim.entities.delete(firstSbId);
      boss.update(sim);

      // Towers should still exist
      for (const tid of towerIds) {
        expect(sim.entities.has(tid)).toBe(true);
      }

      // Phase should still be 1 (towers block it)
      expect(boss.phaseState.current).toBe(1);
    });
  });

  describe("population cap bonuses", () => {
    it("returns correct bonus with all 4 sub-bases alive", () => {
      boss.spawnSubBases(sim, ai);
      expect(boss.getMinionCapBonus(sim)).toBe(4 * SUB_BASE_POP_MINIONS);
      expect(boss.getPhantomCapBonus(sim)).toBe(4 * SUB_BASE_POP_PHANTOMS);
    });

    it("bonus decreases when sub-bases are destroyed", () => {
      boss.spawnSubBases(sim, ai);

      // Destroy one sub-base
      const firstSbId = Array.from(boss.subBases.keys())[0];
      sim.entities.delete(firstSbId);
      boss.update(sim);

      expect(boss.getMinionCapBonus(sim)).toBe(3 * SUB_BASE_POP_MINIONS);
      expect(boss.getPhantomCapBonus(sim)).toBe(3 * SUB_BASE_POP_PHANTOMS);
    });

    it("bonus is 0 when all sub-bases are destroyed", () => {
      boss.spawnSubBases(sim, ai);

      for (const sbId of Array.from(boss.subBases.keys())) {
        sim.entities.delete(sbId);
      }
      boss.update(sim);

      expect(boss.getMinionCapBonus(sim)).toBe(0);
      expect(boss.getPhantomCapBonus(sim)).toBe(0);
    });
  });

  describe("tower association", () => {
    it("getSubBasesNeedingTowers returns sub-bases with fewer than 2 towers", () => {
      boss.spawnSubBases(sim, ai);

      // All sub-bases start with 2 towers — none should need towers
      expect(boss.getSubBasesNeedingTowers(sim)).toHaveLength(0);

      // Destroy one tower from first sub-base
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;
      const firstTowerId = Array.from(sb.towerIds)[0];
      sim.entities.delete(firstTowerId);
      boss.update(sim);

      const needing = boss.getSubBasesNeedingTowers(sim);
      expect(needing).toHaveLength(1);
      expect(needing[0].entityId).toBe(firstSbId);
    });

    it("tryRegisterTowerToNearestSubBase registers a tower to a nearby sub-base", () => {
      boss.spawnSubBases(sim, ai);

      // Destroy one tower from first sub-base to make room
      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;
      const firstTowerId = Array.from(sb.towerIds)[0];
      sim.entities.delete(firstTowerId);
      boss.update(sim);

      // Build a new tower near the sub-base
      const newTower = sim.spawnEnemy("tower", sb.pos.x + 50, sb.pos.y + 50);
      const registered = boss.tryRegisterTowerToNearestSubBase(newTower.id, newTower.pos.x, newTower.pos.y, sim);

      expect(registered).toBe(true);
      expect(sb.towerIds.has(newTower.id)).toBe(true);
    });

    it("dead sub-bases cannot accept new towers", () => {
      boss.spawnSubBases(sim, ai);

      const firstSbId = Array.from(boss.subBases.keys())[0];
      const sb = boss.subBases.get(firstSbId)!;
      const pos = { ...sb.pos };

      // Kill the sub-base
      sim.entities.delete(firstSbId);
      boss.update(sim);

      // Try to register a tower near the dead sub-base's position
      const newTower = sim.spawnEnemy("tower", pos.x + 50, pos.y + 50);
      const registered = boss.tryRegisterTowerToNearestSubBase(newTower.id, newTower.pos.x, newTower.pos.y, sim);

      expect(registered).toBe(false);
    });
  });

  describe("phase info", () => {
    it("includes sub-base count in phase 1 remaining", () => {
      boss.spawnSubBases(sim, ai);
      const info = boss.getPhaseInfo(sim);
      expect(info.remaining.sub_base).toBe(4);
    });

    it("sub-base count updates when sub-bases are destroyed", () => {
      boss.spawnSubBases(sim, ai);
      const firstSbId = Array.from(boss.subBases.keys())[0];
      sim.entities.delete(firstSbId);
      boss.update(sim);

      const info = boss.getPhaseInfo(sim);
      expect(info.remaining.sub_base).toBe(3);
    });
  });
});
