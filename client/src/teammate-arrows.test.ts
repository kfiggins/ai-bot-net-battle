import { describe, it, expect } from "vitest";
import { computeTeammateArrow } from "./teammate-arrows.js";

const VW = 800;
const VH = 600;

// Camera scroll = 0 means world coords == screen coords
describe("computeTeammateArrow", () => {
  describe("on-screen detection", () => {
    it("returns visible=false when teammate is at viewport center", () => {
      const result = computeTeammateArrow(400, 300, 0, 0, VW, VH);
      expect(result.visible).toBe(false);
    });

    it("returns visible=false when teammate is near top-left corner", () => {
      const result = computeTeammateArrow(10, 10, 0, 0, VW, VH);
      expect(result.visible).toBe(false);
    });

    it("returns visible=false when teammate is near bottom-right corner", () => {
      const result = computeTeammateArrow(790, 590, 0, 0, VW, VH);
      expect(result.visible).toBe(false);
    });

    it("returns visible=true when teammate is off-screen to the right", () => {
      const result = computeTeammateArrow(1200, 300, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
    });

    it("returns visible=true when teammate is off-screen to the left", () => {
      const result = computeTeammateArrow(-200, 300, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
    });

    it("returns visible=true when teammate is off-screen above", () => {
      const result = computeTeammateArrow(400, -200, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
    });

    it("returns visible=true when teammate is off-screen below", () => {
      const result = computeTeammateArrow(400, 900, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
    });
  });

  describe("arrow angle", () => {
    it("points right (angle ≈ 0) when teammate is far to the right", () => {
      const result = computeTeammateArrow(5000, 300, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
      expect(result.angle).toBeCloseTo(0, 1);
    });

    it("points left (angle ≈ ±π) when teammate is far to the left", () => {
      const result = computeTeammateArrow(-5000, 300, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
      expect(Math.abs(result.angle)).toBeCloseTo(Math.PI, 1);
    });

    it("points up (angle ≈ -π/2) when teammate is far above", () => {
      const result = computeTeammateArrow(400, -5000, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
      expect(result.angle).toBeCloseTo(-Math.PI / 2, 1);
    });

    it("points down (angle ≈ π/2) when teammate is far below", () => {
      const result = computeTeammateArrow(400, 5000, 0, 0, VW, VH);
      expect(result.visible).toBe(true);
      expect(result.angle).toBeCloseTo(Math.PI / 2, 1);
    });
  });

  describe("arrow position stays within viewport", () => {
    const EDGE_MARGIN = 30;

    it("stays within margin on the right edge", () => {
      const result = computeTeammateArrow(5000, 300, 0, 0, VW, VH);
      expect(result.screenX).toBeLessThanOrEqual(VW - EDGE_MARGIN);
      expect(result.screenX).toBeGreaterThanOrEqual(EDGE_MARGIN);
    });

    it("stays within margin on the left edge", () => {
      const result = computeTeammateArrow(-5000, 300, 0, 0, VW, VH);
      expect(result.screenX).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(result.screenX).toBeLessThanOrEqual(VW - EDGE_MARGIN);
    });

    it("stays within margin on the top edge", () => {
      const result = computeTeammateArrow(400, -5000, 0, 0, VW, VH);
      expect(result.screenY).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(result.screenY).toBeLessThanOrEqual(VH - EDGE_MARGIN);
    });

    it("stays within margin on the bottom edge", () => {
      const result = computeTeammateArrow(400, 5000, 0, 0, VW, VH);
      expect(result.screenY).toBeLessThanOrEqual(VH - EDGE_MARGIN);
      expect(result.screenY).toBeGreaterThanOrEqual(EDGE_MARGIN);
    });
  });

  describe("camera scroll", () => {
    it("treats teammate as off-screen when camera has scrolled past them", () => {
      // Camera scrolled right 1000px: world (400, 300) is at screen (-600, 300)
      const result = computeTeammateArrow(400, 300, 1000, 0, VW, VH);
      expect(result.visible).toBe(true);
    });

    it("treats on-screen when camera scroll aligns teammate to viewport center", () => {
      // Camera center on (1400, 1300): scrollX = 1400 - 400 = 1000, scrollY = 1300 - 300 = 1000
      // Teammate at (1400, 1300) world -> screen (400, 300) = center
      const result = computeTeammateArrow(1400, 1300, 1000, 1000, VW, VH);
      expect(result.visible).toBe(false);
    });

    it("arrow points left when teammate is behind camera (scrolled past)", () => {
      // Camera scrolled far right; teammate world (400, 300) is off left edge
      const result = computeTeammateArrow(400, 300, 2000, 0, VW, VH);
      expect(result.visible).toBe(true);
      // angle should be roughly leftward (magnitude > π/2)
      expect(Math.abs(result.angle)).toBeGreaterThan(Math.PI / 2);
    });
  });
});
