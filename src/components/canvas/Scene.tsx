import { useRideDriver } from './useRideDriver';
import type { QualitySettings } from '../../config/quality';
import { Bike } from './Bike';
import { BikeWorldEffects } from './BikeEffects';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { RenderStatsProbe } from './RenderStatsProbe';
import { RideInvalidator } from './RideInvalidator';
import { Track } from './Track';
import { Atmosphere } from './World/Atmosphere';
import { Environment } from './World/Environment';
import { Props } from './World/Props';
import { Terrain } from './World/Terrain';
import { Landmarks } from './Landmarks';

/**
 * Everything inside the Canvas. The Canvas element itself lives in App.tsx.
 *
 * `quality` is passed down rather than read from a hook here on purpose. This
 * component would otherwise need the device profile and the reduced-motion
 * query, and resolving the level in two places is how two systems drift apart.
 * App resolves it once and hands the result in, so the DOM layer and the 3D layer
 * are provably on the same level at every moment.
 */
export function Scene({ quality }: { quality: QualitySettings }) {
  const { render, world } = quality;

  // Drives the ride from scroll; mounted once so it runs before anything samples
  // the state. Mounting order matters: hooks run in tree order within a frame.
  useRideDriver();

  return (
    <>
      {/* Pumps demand-loop frames while the ride target moves. */}
      <RideInvalidator />
      <Atmosphere shadows={render.shadows} />
      <Terrain segments={render.terrainSegments} octaves={world.terrainOctaves} />
      <Environment stars={world.stars} haze={world.haze} />
      <Props complexity={world} />
      <Landmarks />
      <Track />
      <Bike />
      {/*
        A sibling of the bike, not a child: the trail and dust geometry is built
        from world-space coordinates, so mounting it inside the bike's transformed
        group would apply that transform twice. See `BikeWorldEffects`.
      */}
      <BikeWorldEffects />
      <CameraRig />
      {/* Last in the tree: the post chain must see everything it is filtering. */}
      <Effects bloom={quality.bloom} />
      <RenderStatsProbe />
    </>
  );
}
