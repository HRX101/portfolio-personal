/**
 * Live renderer statistics, written by a probe inside the Canvas and read by
 * the DOM debug overlay. A plain mutable object keeps the two sides decoupled
 * without a React context crossing the Canvas boundary.
 */
export const renderStats = {
  calls: 0,
  triangles: 0,
  fps: 0,
  /** Live GPU buffers (`gl.info.memory`). Survives `info.reset()`. */
  geometries: 0,
  /** Live GPU textures (`gl.info.memory`). Survives `info.reset()`. */
  textures: 0,
};
