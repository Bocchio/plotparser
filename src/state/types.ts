// ---- Core domain types (the parts that get serialized into a project file) ----

export type Scale = 'linear' | 'log';

/**
 * Calibration for one axis: maps a 1-D pixel position (image space) to a data
 * value via two reference points. For the X axis `p` is image-x; for Y it is
 * image-y. `log` interpolates in log10 space.
 */
/**
 * How tick marks/gridlines are generated for an axis.
 *  - 'auto' : decade (log) or nice-step (linear) ticks chosen automatically
 *  - 'step' : majors every `majorStep` data units, each split into `minorDivs`
 *  - 'list' : explicit comma-separated major/minor value lists
 */
export interface TickConfig {
  mode: 'auto' | 'step' | 'list';
  majorStep?: number;
  minorDivs?: number;
  majors?: string;
  minors?: string;
}

export interface AxisCal {
  p1: number;
  v1: number;
  p2: number;
  v2: number;
  scale: Scale;
  ticks?: TickConfig;
}

export interface Calibration {
  x: AxisCal;
  y: AxisCal;
  xLabel: string;
  yLabel: string;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Node behaviour, à la a vector pen tool:
 *  - 'auto'   : handles are derived from neighbours (Catmull-Rom) and kept in sync
 *  - 'smooth' : handles stay colinear & mirrored (C1 smooth) but user-controlled
 *  - 'corner' : the two handles move independently (a cusp)
 */
export type NodeMode = 'auto' | 'smooth' | 'corner';

export interface BezierAnchor {
  /** anchor position in image pixel space */
  x: number;
  y: number;
  /** control handle offsets (image space, relative to the anchor) */
  hIn?: Vec2;
  hOut?: Vec2;
  mode: NodeMode;
}

export interface BezierTrace {
  type: 'bezier';
  anchors: BezierAnchor[];
}

export type Trace = BezierTrace;

export interface Series {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  /** drawn stroke width in screen pixels (so it reads the same at any zoom) */
  width: number;
  trace: Trace;
}

/** A draggable probe pin: reads the data (x,y) at its image position; can ride a curve. */
export interface ProbePoint {
  id: string;
  x: number; // image pixel
  y: number; // image pixel
  /** if set, the probe snaps to the nearest point on this series */
  snapSeriesId: string | null;
}

export interface ImageInfo {
  /** base64 data URL, or null for a lightweight (image-less) config */
  dataUrl: string | null;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface OverlaySettings {
  gridlines: boolean;
  /** draw the minor (sub-tick) gridlines, not just majors */
  minorGrid: boolean;
  /** clip gridlines to the calibrated plot area instead of the whole image */
  gridClip: boolean;
  reconstruction: boolean;
  /** scatter the currently-configured export sample points on the plot */
  exportPoints: boolean;
  opacity: number; // 0..1, applies to the computed overlays
  /** opacity of the source image itself (0..1); fades to the backdrop colour */
  imageOpacity: number;
  /** thickness multiplier for the computed gridline overlay (default 1) */
  gridWidth: number;
  /** thickness multiplier for the calibration reference lines (default 1) */
  refWidth: number;
  /** colours (hex) */
  gridColor: string;
  xAxisColor: string;
  yAxisColor: string;
  /** solid colour drawn behind the image (so image-opacity fades cleanly) */
  backdrop: string;
}

export interface ViewState {
  scale: number;
  tx: number;
  ty: number;
}

export interface Project {
  version: number;
  image: ImageInfo;
  calibration: Calibration;
  series: Series[];
  probes: ProbePoint[];
  view?: ViewState;
  overlay: OverlaySettings;
}

// ---- Transient UI state (not serialized) ----

export type Tool = 'pan' | 'trace';

export type Selection =
  | { kind: 'anchor'; seriesId: string; index: number }
  | { kind: 'handle'; seriesId: string; index: number; side: 'in' | 'out' }
  | { kind: 'calib'; axis: 'x' | 'y'; which: 1 | 2 }
  | { kind: 'probe'; id: string }
  | null;

export interface UiState {
  tool: Tool;
  activeSeriesId: string | null;
  selection: Selection;
}
