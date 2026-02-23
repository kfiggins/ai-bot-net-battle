import { describe, it, expect } from "vitest";
import { FakeAI } from "./fake-ai.js";
import { Simulation } from "./sim.js";
import { Economy } from "./economy.js";
import { AgentAPI } from "./agent.js";

describe("FakeAI", () => {
  it("queues actions over time", () => {
    const fakeAI = new FakeAI();
    const sim = new Simulation();
    const economy = new Economy();
    const agent = new AgentAPI();

    // give enough funds and multiple decision windows
    economy.balance = 1000;
    const mothershipPos = { x: 2000, y: 2000 };

    for (let i = 0; i < 200; i++) {
      sim.tick = i;
      agent.update(sim);
      fakeAI.update(sim, economy, agent, mothershipPos);
    }

    expect(economy.buildQueue.length).toBeGreaterThan(0);
  });

  it("forces balanced strategy", () => {
    const fakeAI = new FakeAI();
    const sim = new Simulation();
    const economy = new Economy();
    const agent = new AgentAPI();

    agent.strategy = "aggressive";
    sim.tick = 100;
    fakeAI.update(sim, economy, agent, { x: 2000, y: 2000 });

    expect(agent.strategy).toBe("balanced");
  });
});
