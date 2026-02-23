import { describe, it, expect, vi, beforeEach } from "vitest";
import { config } from "./config.js";
import { log, setLogLevel } from "./logger.js";
import { Room } from "./room.js";

// Minimal mock WebSocket
function mockWs(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } as any;
}

describe("config", () => {
  it("has sensible defaults", () => {
    expect(config.host).toBe("0.0.0.0");
    expect(config.wsPort).toBe(3000);
    expect(config.httpPort).toBe(3001);
    expect(config.wsRateLimitPerSec).toBe(60);
    expect(config.joinRateLimitPerMin).toBe(5);
    expect(config.httpCommandRateLimitPerMin).toBe(30);
  });

  it("reads NODE_ENV from environment", () => {
    // vitest sets NODE_ENV=test, so config picks that up
    expect(config.nodeEnv).toBe("test");
    expect(config.isDev).toBe(false);
  });
});

describe("logger", () => {
  it("logs at info level by default", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("test message", { roomId: "room-1" });
    expect(spy).toHaveBeenCalledTimes(1);
    const output = spy.mock.calls[0][0];
    expect(output).toContain("INFO");
    expect(output).toContain("test message");
    expect(output).toContain("roomId=room-1");
    spy.mockRestore();
  });

  it("filters debug messages at info level", () => {
    setLogLevel("info");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.debug("should not appear");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("shows debug messages when level is debug", () => {
    setLogLevel("debug");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.debug("should appear");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    setLogLevel("info"); // restore
  });

  it("logs warn to console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    log.warn("warning message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("WARN");
    spy.mockRestore();
  });

  it("logs error to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    log.error("error message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("ERROR");
    spy.mockRestore();
  });

  it("formats context with multiple fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log.info("multi", { roomId: "r1", playerId: "p1" });
    const output = spy.mock.calls[0][0];
    expect(output).toContain("roomId=r1");
    expect(output).toContain("playerId=p1");
    spy.mockRestore();
  });
});

describe("Room tick metrics", () => {
  let room: Room;

  beforeEach(() => {
    room = new Room("metrics-test");
  });

  it("initializes with zero metrics", () => {
    const metrics = room.tickMetrics;
    expect(metrics.observedTickRate).toBe(0);
    expect(metrics.maxTickMs).toBe(0);
    expect(metrics.totalTicks).toBe(0);
  });

  it("returns a copy of metrics (not a reference)", () => {
    const m1 = room.tickMetrics;
    const m2 = room.tickMetrics;
    expect(m1).not.toBe(m2);
    expect(m1).toEqual(m2);
  });

  it("tracks createdAt timestamp", () => {
    const now = Date.now();
    expect(room.createdAt).toBeGreaterThanOrEqual(now - 100);
    expect(room.createdAt).toBeLessThanOrEqual(now + 100);
  });

  it("tracks totalTicks after match starts", async () => {
    // Suppress log output during test
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    room.addPlayer(mockWs(), "P1");
    room.startMatch();

    // Wait for a few ticks to execute
    await new Promise((resolve) => setTimeout(resolve, 150));

    const metrics = room.tickMetrics;
    expect(metrics.totalTicks).toBeGreaterThan(0);

    room.destroy();
    logSpy.mockRestore();
  });
});
