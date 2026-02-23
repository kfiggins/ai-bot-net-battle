/** How far from the viewport edge the arrow center is placed (pixels). */
const EDGE_MARGIN = 30;

/** Buffer zone: if the teammate's screen position is within this many pixels
 *  of the viewport, we consider them "on screen" and hide the arrow. */
const ON_SCREEN_BUFFER = 24;

export interface ArrowResult {
  /** False when the teammate is visible on screen — caller should hide the arrow. */
  visible: boolean;
  /** Arrow center X in screen (viewport) space. */
  screenX: number;
  /** Arrow center Y in screen (viewport) space. */
  screenY: number;
  /** Angle in radians pointing from the viewport center toward the teammate. */
  angle: number;
}

/**
 * Compute where to place a teammate direction arrow on the screen edge.
 *
 * Pure function — no Phaser dependency, easy to unit test.
 *
 * @param teammateWorldX  World X of the teammate
 * @param teammateWorldY  World Y of the teammate
 * @param cameraScrollX  Camera's current scrollX (world X at viewport left edge)
 * @param cameraScrollY  Camera's current scrollY (world Y at viewport top edge)
 * @param viewportWidth  Width of the game canvas / viewport
 * @param viewportHeight Height of the game canvas / viewport
 */
export function computeTeammateArrow(
  teammateWorldX: number,
  teammateWorldY: number,
  cameraScrollX: number,
  cameraScrollY: number,
  viewportWidth: number,
  viewportHeight: number
): ArrowResult {
  const screenX = teammateWorldX - cameraScrollX;
  const screenY = teammateWorldY - cameraScrollY;

  // Teammate is within (or very close to) the visible area — no arrow needed.
  if (
    screenX >= -ON_SCREEN_BUFFER &&
    screenX <= viewportWidth + ON_SCREEN_BUFFER &&
    screenY >= -ON_SCREEN_BUFFER &&
    screenY <= viewportHeight + ON_SCREEN_BUFFER
  ) {
    return { visible: false, screenX, screenY, angle: 0 };
  }

  // Direction from viewport center to teammate's screen position.
  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const dx = screenX - cx;
  const dy = screenY - cy;
  const angle = Math.atan2(dy, dx);

  // Scale the direction vector so the arrow sits EDGE_MARGIN pixels inside the
  // nearest viewport edge.
  const hw = cx - EDGE_MARGIN; // half-width available
  const hh = cy - EDGE_MARGIN; // half-height available
  const absDx = Math.abs(dx) || 0.001;
  const absDy = Math.abs(dy) || 0.001;
  const scale = Math.min(hw / absDx, hh / absDy);

  return {
    visible: true,
    screenX: cx + dx * scale,
    screenY: cy + dy * scale,
    angle,
  };
}
