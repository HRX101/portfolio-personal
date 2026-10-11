import { useEffect } from 'react';
import { AUDIO } from '../config/effects';
import { clamp } from './easing';
import { getRide } from '../hooks/useScrollProgress';
import { onStationFrame } from '../hooks/useActiveStationStore';

/**
 * ============================================================================
 * OPTIONAL WEBAUDIO AMBIENCE
 * ============================================================================
 *
 * Off by default, and no `AudioContext` exists until the reader asks for one. That
 * ordering is not politeness about autoplay: a context created before a user
 * gesture starts `suspended` in every browser, so building the graph eagerly
 * would mean holding a suspended context alive for the whole session — a live
 * node graph, an audio thread, and a policy warning in the console — in exchange
 * for ambience the reader never asked to hear.
 *
 * The graph is a drone plus wind:
 *
 *   osc A ─┐
 *          ├─ drone gain ─ drone filter ─┐
 *   osc B ─┘                            ├─ master ─ destination
 *   noise ─ noise filter ─ wind gain ──┘
 *
 * Two oscillators rather than one because a single sine at 58Hz is close to
 * inaudible on laptop speakers; a 7-cent detune beats against itself slowly and
 * fills in the bottom of the spectrum without adding a pitch the reader can name.
 * The wind is filtered white noise, gain and cutoff both driven by the same
 * normalised speed the trail and the FOV kick use, so it rises with the ride
 * rather than ramping on a timer of its own.
 *
 * Nothing here allocates after `build()`: the tick writes existing `AudioParam`
 * values, and the noise buffer is generated once.
 */

interface AudioGraph {
  context: AudioContext;
  master: GainNode;
  droneGain: GainNode;
  droneFilter: BiquadFilterNode;
  windGain: GainNode;
  windFilter: BiquadFilterNode;
  oscs: [OscillatorNode, OscillatorNode];
  noise: AudioBufferSourceNode;
}

let graph: AudioGraph | null = null;
let enabled = false;
/** Latest smoothed parameter targets, written by `tick` and read on every change. */
const params = { speed: 0, station: 0 };

const STORAGE_KEY = 'portfolio:sound';

export function soundAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) ===
      'function'
  );
}

/**
 * Reads the saved preference. Guarded for the same reason the intro's is: storage
 * access throws outright in a sandboxed iframe, and an exception thrown while
 * reading a cosmetic preference must not take the page down with it.
 */
export function soundPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function savePreference(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(STORAGE_KEY, 'on');
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Preference simply will not persist. */
  }
}

/**
 * Seconds of white noise, at the context sample rate.
 *
 * Two seconds rather than one: a one-second buffer loop repeats audibly on a
 * steady wind bed, because the discontinuity between the end of one pass and the
 * start of the next lands at a fixed period. At two seconds the repeat is long
 * enough to sit under the ear.
 */
function buildNoise(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function build(): AudioGraph | null {
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();

  const master = context.createGain();
  // Starts at zero so enabling is a fade in rather than a jump to full level.
  master.gain.value = 0;
  master.connect(context.destination);

  const droneFilter = context.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = AUDIO.droneCutoffRest;
  droneFilter.Q.value = 0.7;
  droneFilter.connect(master);

  const droneGain = context.createGain();
  droneGain.gain.value = 1;
  droneGain.connect(droneFilter);

  const oscs: [OscillatorNode, OscillatorNode] = [context.createOscillator(), context.createOscillator()];
  oscs[0].type = 'sine';
  oscs[1].type = 'sine';
  oscs[0].frequency.value = AUDIO.droneHz;
  oscs[1].frequency.value = AUDIO.droneHz;
  // Detune, not a second frequency: the two stay locked to a ratio of 1:1, so the
  // beating between them is a fixed 7 cents however the base pitch shifts.
  oscs[1].detune.value = AUDIO.droneDetune;
  for (const osc of oscs) {
    osc.connect(droneGain);
    osc.start();
  }

  const windFilter = context.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = AUDIO.windCutoffRest;
  windFilter.Q.value = 0.6;
  windFilter.connect(master);

  const windGain = context.createGain();
  windGain.gain.value = AUDIO.windGainRest;
  windGain.connect(windFilter);

  const noise = context.createBufferSource();
  noise.buffer = buildNoise(context);
  noise.loop = true;
  noise.connect(windGain);
  noise.start();

  return { context, master, droneGain, droneFilter, windGain, windFilter, oscs, noise };
}

function applyTargets(): void {
  const g = graph;
  if (!g) return;
  const now = g.context.currentTime;
  const speed = params.speed;

  g.windGain.gain.setTargetAtTime(
    AUDIO.windGainRest + (AUDIO.windGainFast - AUDIO.windGainRest) * speed,
    now,
    0.08,
  );
  g.windFilter.frequency.setTargetAtTime(
    AUDIO.windCutoffRest + (AUDIO.windCutoffFast - AUDIO.windCutoffRest) * speed,
    now,
    0.08,
  );
  g.droneFilter.frequency.setTargetAtTime(
    AUDIO.droneCutoffRest + (AUDIO.droneCutoffFast - AUDIO.droneCutoffRest) * speed,
    now,
    0.12,
  );

  // A semitone per station. `setTargetAtTime` rather than a jump, so arriving at a
  // station slides rather than steps.
  const cents = params.station * AUDIO.semitonesPerStation * 100;
  g.oscs[0].detune.setTargetAtTime(cents, now, 0.4);
  g.oscs[1].detune.setTargetAtTime(cents + AUDIO.droneDetune, now, 0.4);
}

/** True while the graph exists and is audible. Read by the toggle's label. */
export function isSoundOn(): boolean {
  return enabled && graph !== null;
}

/**
 * Turns the ambience on or off.
 *
 * Must be called from a user gesture — the context is constructed here, inside
 * the call stack of a click, because that is the only moment browsers allow it to
 * start running.
 */
export function setSoundEnabled(next: boolean): void {
  if (next === enabled) return;

  if (next && !graph) {
    graph = build();
    if (!graph) return;
  }
  const g = graph;
  if (!g) return;

  // `resume` resolves asynchronously; the ramp starts from wherever the context
  // actually is, so the fade is not lost to a rejected autoplay attempt.
  void g.context.resume().catch(() => {
    /* The context stays suspended and the toggle reports off on the next read. */
  });

  enabled = next;
  savePreference(next);

  const now = g.context.currentTime;
  // Cancel any ramp still in flight before starting the next one. Without this,
  // switching quickly leaves two `setTargetAtTime` curves fighting over one param.
  g.master.gain.cancelScheduledValues(now);
  g.master.gain.setValueAtTime(g.master.gain.value, now);
  g.master.gain.setTargetAtTime(next ? AUDIO.masterGain : 0, now, AUDIO.fadeMs / 3);

  applyTargets();
}

/**
 * Subscribes to the per-frame station tick, mounted by the toggle.
 *
 * Subscribes to the existing frame bus rather than opening its own rAF: the ride
 * state is already written every frame, so a second loop here would be a second
 * copy of a value that already exists.
 */
export function useSoundRide(): void {
  useEffect(
    () =>
      onStationFrame(() => {
        if (!enabled || !graph) return;
        const ride = getRide();
        const speed = clamp(ride.speedFactor);
        const station = ride.station;
        // `applyTargets` is the only thing that touches the AudioParams, so
        // skipping it when nothing has moved is what keeps an idle page from
        // scheduling curve updates sixty times a second for no audible difference.
        if (Math.abs(speed - params.speed) > 0.004 || station !== params.station) {
          params.speed = speed;
          params.station = station;
          applyTargets();
        }
      }),
    [],
  );
}

/**
 * Releases the audio hardware.
 *
 * Called on unmount only when the reader never enabled it; once they have, the
 * graph outlives the toggle so that toggling back on is instant rather than
 * rebuilding eight nodes. Disposing a graph the reader explicitly asked for would
 * also be a lie about what the toggle means.
 */
export function disposeSound(): void {
  if (enabled) return;
  graph?.context.close().catch(() => undefined);
  graph = null;
}
