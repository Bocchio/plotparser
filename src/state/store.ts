import type {
  Calibration,
  OverlaySettings,
  ProbePoint,
  Project,
  Series,
  UiState,
} from './types';
import { History } from './history';

type Listener = () => void;

let idCounter = 0;
export function uid(prefix = 's'): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function defaultCalibration(): Calibration {
  // Values start unset (NaN) so the plot is not considered "calibrated" until
  // the user enters real tick values. Pixel positions are placed on image load.
  return {
    x: { p1: 0, v1: NaN, p2: 100, v2: NaN, scale: 'linear' },
    y: { p1: 100, v1: NaN, p2: 0, v2: NaN, scale: 'linear' },
    xLabel: 'x',
    yLabel: 'y',
  };
}

export function defaultOverlay(): OverlaySettings {
  return {
    gridlines: false,
    minorGrid: true,
    gridClip: false,
    reconstruction: false,
    exportPoints: false,
    opacity: 0.6,
    imageOpacity: 1,
    gridWidth: 1,
    refWidth: 1,
    gridColor: '#00e5ff',
    xAxisColor: '#f5a623',
    yAxisColor: '#4c9aff',
    backdrop: '#0e141b',
  };
}

export function emptyProject(): Project {
  return {
    version: 1,
    image: { dataUrl: null, name: '', naturalWidth: 0, naturalHeight: 0 },
    calibration: defaultCalibration(),
    series: [],
    probes: [],
    overlay: defaultOverlay(),
  };
}

const SERIES_COLORS = [
  '#e5484d', '#4c9aff', '#46a758', '#f5a623',
  '#a855f7', '#06b6d4', '#ec4899', '#84cc16',
];

/**
 * Central store. Two notification channels:
 *  - render:    cheap visual changes (geometry, view, overlay) — stage redraws.
 *  - structure: list/identity changes (series added, image loaded) — panels rebuild.
 * Structure notifications imply a render too.
 */
export class Store {
  state: Project;
  ui: UiState;
  history: History;

  /** Transient (non-serialized) cache of export sample points in image-pixel
   * space, drawn as a scatter overlay when overlay.exportPoints is on. */
  exportMarks: { x: number; y: number; color: string }[] = [];

  private renderListeners = new Set<Listener>();
  private structureListeners = new Set<Listener>();

  constructor(initial: Project = emptyProject()) {
    this.state = initial;
    this.ui = {
      tool: 'pan',
      activeSeriesId: initial.series[0]?.id ?? null,
      selection: null,
    };
    this.history = new History(this);
  }

  onRender(fn: Listener): () => void {
    this.renderListeners.add(fn);
    return () => this.renderListeners.delete(fn);
  }
  onStructure(fn: Listener): () => void {
    this.structureListeners.add(fn);
    return () => this.structureListeners.delete(fn);
  }

  emitRender(): void {
    for (const fn of this.renderListeners) fn();
  }
  emitStructure(): void {
    for (const fn of this.structureListeners) fn();
    this.emitRender();
  }

  // ---- selectors ----
  activeSeries(): Series | null {
    return this.state.series.find((s) => s.id === this.ui.activeSeriesId) ?? null;
  }
  seriesById(id: string | null): Series | null {
    if (!id) return null;
    return this.state.series.find((s) => s.id === id) ?? null;
  }
  hasImage(): boolean {
    return this.state.image.naturalWidth > 0;
  }

  // ---- mutations ----
  addSeries(name?: string): Series {
    const idx = this.state.series.length;
    const s: Series = {
      id: uid('ser'),
      name: name ?? `Series ${idx + 1}`,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
      visible: true,
      width: 2,
      trace: { type: 'bezier', anchors: [] },
    };
    this.history.run(() => this.state.series.push(s));
    this.ui.activeSeriesId = s.id;
    this.emitStructure();
    return s;
  }

  removeSeries(id: string): void {
    this.history.begin();
    this.state.series = this.state.series.filter((s) => s.id !== id);
    if (this.ui.activeSeriesId === id) {
      this.ui.activeSeriesId = this.state.series[0]?.id ?? null;
    }
    if (this.ui.selection && 'seriesId' in this.ui.selection && this.ui.selection.seriesId === id) {
      this.ui.selection = null;
    }
    this.history.commit();
    this.emitStructure();
  }

  /** Ensure there's an active series to draw into; create one if needed. */
  ensureActiveSeries(): Series {
    const active = this.activeSeries();
    if (active) return active;
    return this.addSeries();
  }

  // ---- probes ----
  addProbe(at: { x: number; y: number }): ProbePoint {
    const p: ProbePoint = { id: uid('pr'), x: at.x, y: at.y, snapSeriesId: null };
    this.history.run(() => this.state.probes.push(p));
    this.ui.selection = { kind: 'probe', id: p.id };
    this.emitStructure();
    return p;
  }
  removeProbe(id: string): void {
    this.history.begin();
    this.state.probes = this.state.probes.filter((p) => p.id !== id);
    if (this.ui.selection?.kind === 'probe' && this.ui.selection.id === id) this.ui.selection = null;
    this.history.commit();
    this.emitStructure();
  }
  probeById(id: string): ProbePoint | null {
    return this.state.probes.find((p) => p.id === id) ?? null;
  }
}
