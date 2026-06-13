import type { Calibration, ProbePoint, Series } from './types';

/** The slice of state that undo/redo restores (data, not image/view/overlay). */
interface Snapshot {
  calibration: Calibration;
  series: Series[];
  probes: ProbePoint[];
}

interface Host {
  state: { calibration: Calibration; series: Series[]; probes: ProbePoint[] };
  ui: { activeSeriesId: string | null; selection: unknown };
  emitStructure(): void;
}

const LIMIT = 100;

/**
 * Snapshot-based undo/redo. Call begin() at the start of an interaction (drag,
 * edit burst, click action); call commit() at the end. begin() coalesces — a
 * second begin() with no intervening commit is ignored, so a continuous drag
 * produces a single history entry.
 */
export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private pending: Snapshot | null = null;

  constructor(private host: Host) {}

  private capture(): Snapshot {
    return JSON.parse(
      JSON.stringify({
        calibration: this.host.state.calibration,
        series: this.host.state.series,
        probes: this.host.state.probes,
      }),
    );
  }

  private same(a: Snapshot, b: Snapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** Mark the pre-change state. Safe to call repeatedly within one interaction. */
  begin(): void {
    if (!this.pending) this.pending = this.capture();
  }

  /** Finalise: push the pre-change snapshot if anything actually changed. */
  commit(): void {
    if (!this.pending) return;
    const now = this.capture();
    if (!this.same(this.pending, now)) {
      this.undoStack.push(this.pending);
      if (this.undoStack.length > LIMIT) this.undoStack.shift();
      this.redoStack = [];
    }
    this.pending = null;
  }

  /** Convenience: snapshot, run a mutation, commit. */
  run(mutate: () => void): void {
    this.begin();
    mutate();
    this.commit();
  }

  private restore(snap: Snapshot): void {
    this.host.state.calibration = JSON.parse(JSON.stringify(snap.calibration));
    this.host.state.series = JSON.parse(JSON.stringify(snap.series));
    this.host.state.probes = JSON.parse(JSON.stringify(snap.probes));
    // keep references valid
    const active = this.host.state.series.find((s) => s.id === this.host.ui.activeSeriesId);
    this.host.ui.activeSeriesId = active?.id ?? this.host.state.series[0]?.id ?? null;
    this.host.ui.selection = null;
    this.host.emitStructure();
  }

  undo(): boolean {
    this.pending = null;
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(this.capture());
    this.restore(snap);
    return true;
  }

  redo(): boolean {
    this.pending = null;
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(this.capture());
    this.restore(snap);
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }
}
