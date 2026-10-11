import type { ComponentType } from 'react';
import { STATIONS, type StationId } from '../../../data/content';
import { LANDMARK_ANCHORS, type LandmarkAnchor } from '../../../lib/world';
import { HeroGate } from './HeroGate';
import { SkillConstellation } from './SkillConstellation';
import { TowerCluster } from './TowerCluster';
import { Workshop } from './Workshop';
import { ResearchDome } from './ResearchDome';
import { Podium } from './Podium';
import { FinishGate } from './FinishGate';
import { StationSign } from './StationSign';

/**
 * The landmark for each station, keyed by station id, plus the roadside sign
 * that names the station as the rider approaches it.
 */
export const LANDMARK_COMPONENTS: Record<StationId, ComponentType<{ anchor: LandmarkAnchor }>> = {
  hero: HeroGate,
  about: SkillConstellation,
  experience: TowerCluster,
  freelance: Workshop,
  research: ResearchDome,
  achievements: Podium,
  contact: FinishGate,
};

/** Anchor lookup by station id: `landmarkAnchors[stationId] = { position, rotationY }`. */
export const LANDMARK_ANCHORS_BY_ID: Record<StationId, LandmarkAnchor> = Object.fromEntries(
  STATIONS.map((station, i) => [station.id, LANDMARK_ANCHORS[i]!]),
) as Record<StationId, LandmarkAnchor>;

/** Renders all seven landmarks at their anchors, each with its station sign. */
export function Landmarks() {
  return (
    <group>
      {STATIONS.map((station, i) => {
        const anchor = LANDMARK_ANCHORS[i];
        const Component = LANDMARK_COMPONENTS[station.id];
        if (!anchor || !Component) return null;
        return (
          <group key={station.id}>
            <Component anchor={anchor} />
            <StationSign station={station.id} anchor={anchor} />
          </group>
        );
      })}
    </group>
  );
}
