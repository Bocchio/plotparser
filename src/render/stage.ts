import type { Store } from '../state/store';
import type { NodeMode, Vec2, ViewState } from '../state/types';
import {
  recomputeHandles,
  insertNodeOnSegment,
  nearestOnBezier,
  sampleBezier,
  anchorIn,
  anchorOut,
} from '../model/bezier';
import { nearestOnPolyline } from '../model/sampling';
import { drawGridlines, drawReconstruction, drawExportMarks } from './overlayLayer';
import { buildHandles } from './handlesLayer';
import { drawLoupe } from './loupe';

const SVGNS = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.02;
const MAX_SCALE = 200;
const CLICK_THRESH = 4; // px movement below which a pointerup counts as a click

type Drag =
  | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number; downImg: Vec2; moved: boolean; delMod: boolean }
  | { kind: 'calib'; axis: 'x' | 'y'; which: 1 | 2; off: number }
  | { kind: 'anchor'; seriesId: string; index: number; off: Vec2 }
  | { kind: 'handle'; seriesId: string; index: number; side: 'in' | 'out' }
  | { kind: 'probe'; id: string; off: Vec2 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Stage {
  readonly store: Store;
  private stageEl: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private svg: SVGSVGElement;
  private g: SVGGElement;
  private loupe: HTMLCanvasElement;

  img: HTMLImageElement | null = null;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private drag: Drag | null = null;
  private hoverImg: Vec2 | null = null;
  private rafPending = false;

  /** Live cursor readout in image space (null when off-image). */
  onCursor?: (imgPt: Vec2 | null) => void;

  constructor(store: Store, els: {
    stage: HTMLElement;
    canvas: HTMLCanvasElement;
    svg: SVGSVGElement;
    loupe: HTMLCanvasElement;
  }) {
    this.store = store;
    this.stageEl = els.stage;
    this.canvas = els.canvas;
    this.ctx = els.canvas.getContext('2d')!;
    this.svg = els.svg;
    this.loupe = els.loupe;
    this.g = document.createElementNS(SVGNS, 'g') as SVGGElement;
    this.svg.appendChild(this.g);

    this.view().scale ||= 1; // ensure exists
    this.attach();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.stageEl);
    store.onRender(() => this.requestRender());
  }

  // ---------- view ----------
  private view(): ViewState {
    if (!this.store.state.view) this.store.state.view = { scale: 1, tx: 0, ty: 0 };
    return this.store.state.view;
  }
  invScale(): number {
    return 1 / this.view().scale;
  }
  getView(): ViewState {
    return { ...this.view() };
  }
  setView(v: ViewState): void {
    this.store.state.view = { ...v };
    this.requestRender();
  }

  private rect(): DOMRect {
    return this.stageEl.getBoundingClientRect();
  }
  private localPoint(e: { clientX: number; clientY: number }): Vec2 {
    const r = this.rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  screenToImage(sx: number, sy: number): Vec2 {
    const v = this.view();
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  }
  imageToScreen(p: Vec2): Vec2 {
    const v = this.view();
    return { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty };
  }

  setImage(img: HTMLImageElement | null): void {
    this.img = img;
    if (img) this.fit();
    this.requestRender();
  }

  fit(): void {
    const { naturalWidth: w, naturalHeight: h } = this.store.state.image;
    if (!w || !h) return;
    const r = this.rect();
    const scale = Math.min(r.width / w, r.height / h) * 0.92;
    const v = this.view();
    v.scale = scale;
    v.tx = (r.width - w * scale) / 2;
    v.ty = (r.height - h * scale) / 2;
    this.requestRender();
  }

  zoomToFit(): void {
    this.fit();
  }

  // ---------- render ----------
  requestRender(): void {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }

  private resize(): void {
    const r = this.rect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.requestRender();
  }

  private render(): void {
    const v = this.view();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(v.scale * this.dpr, 0, 0, v.scale * this.dpr, v.tx * this.dpr, v.ty * this.dpr);

    const overlay = this.store.state.overlay;
    const inv = 1 / v.scale;

    if (this.img) {
      const W = this.store.state.image.naturalWidth;
      const H = this.store.state.image.naturalHeight;
      // Solid backdrop behind the image so lowering image opacity fades to a
      // clean colour rather than revealing the transparency checkerboard.
      ctx.fillStyle = overlay.backdrop || '#0e141b';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.globalAlpha = overlay.imageOpacity ?? 1;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.img, 0, 0);
      ctx.restore();
    }

    if (overlay.gridlines || overlay.reconstruction) {
      ctx.save();
      ctx.globalAlpha = overlay.opacity;
      if (overlay.gridlines) drawGridlines(ctx, this.store, inv);
      if (overlay.reconstruction) drawReconstruction(ctx, this.store, inv);
      ctx.restore();
    }
    if (overlay.exportPoints) drawExportMarks(ctx, this.store, inv);

    // SVG handles
    this.g.setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.scale})`);
    while (this.g.firstChild) this.g.removeChild(this.g.firstChild);
    for (const node of buildHandles(this.store, this)) this.g.appendChild(node);
  }

  // ---------- loupe ----------
  /** What the magnifier should centre on: the dragged element, else the cursor. */
  private loupeFocus(cursor: Vec2): Vec2 {
    const d = this.drag;
    if (!d) return cursor;
    if (d.kind === 'anchor' || d.kind === 'probe') {
      const obj =
        d.kind === 'anchor'
          ? this.store.seriesById(d.seriesId)?.trace.anchors[d.index]
          : this.store.probeById(d.id);
      return obj ? { x: obj.x, y: obj.y } : cursor;
    }
    if (d.kind === 'handle') {
      const a = this.store.seriesById(d.seriesId)?.trace.anchors[d.index];
      if (a) return d.side === 'out' ? anchorOut(a) : anchorIn(a);
    }
    if (d.kind === 'calib') {
      const ax = this.store.state.calibration[d.axis];
      const p = d.which === 1 ? ax.p1 : ax.p2;
      return d.axis === 'x' ? { x: p, y: cursor.y } : { x: cursor.x, y: p };
    }
    return cursor;
  }

  /** Draw the active curve + nodes inside the magnifier so alignment is visible. */
  private loupeOverlay = (ctx: CanvasRenderingContext2D, toLoupe: (p: Vec2) => Vec2): void => {
    const s = this.store.activeSeries();
    if (!s || !s.visible || s.trace.anchors.length < 1) return;
    if (s.trace.anchors.length >= 2) {
      const pts = sampleBezier(s.trace.anchors).map(toLoupe);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    const sel = this.store.ui.selection;
    s.trace.anchors.forEach((a, i) => {
      const p = toLoupe(a);
      const isSel = sel?.kind === 'anchor' && sel.seriesId === s.id && sel.index === i;
      ctx.fillStyle = isSel ? '#fff' : s.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSel ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  private showLoupe(cursor: Vec2 | null): void {
    const dragging = this.drag != null && this.drag.kind !== 'pan';
    const want = !!this.img && !!cursor && (this.store.ui.tool === 'trace' || dragging);
    if (!want || !cursor) {
      this.loupe.hidden = true;
      return;
    }
    const focus = this.loupeFocus(cursor);
    const screen = this.imageToScreen(focus);
    const size = this.loupe.width;
    const r = this.rect();
    let lx = screen.x + 18;
    let ly = screen.y + 18;
    if (lx + size > r.width) lx = screen.x - size - 18;
    if (ly + size > r.height) ly = screen.y - size - 18;
    this.loupe.style.left = `${lx}px`;
    this.loupe.style.top = `${ly}px`;
    this.loupe.hidden = false;
    drawLoupe(this.loupe, this.img!, focus, 7, this.loupeOverlay);
  }

  // ---------- interactions ----------
  private attach(): void {
    this.svg.addEventListener('pointerdown', (e) => this.onRootDown(e));
    this.stageEl.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.stageEl.addEventListener('pointerleave', () => {
      this.hoverImg = null;
      this.onCursor?.(null);
      if (!this.drag) this.loupe.hidden = true;
    });

    // Holding a delete modifier signals (via the node cursor + a red hover) that
    // clicking a node removes it. Works in any tool, since Ctrl-click deletes.
    const updMod = (e: KeyboardEvent) => {
      const del = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
      this.stageEl.classList.toggle('mod-delete', del);
    };
    window.addEventListener('keydown', updMod);
    window.addEventListener('keyup', updMod);
    window.addEventListener('blur', () => this.stageEl.classList.remove('mod-delete'));
  }

  private isDeleteMod(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): boolean {
    return e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  }

  private onWheel(e: WheelEvent): void {
    if (!this.img) return;
    e.preventDefault();
    const { x: sx, y: sy } = this.localPoint(e);
    const before = this.screenToImage(sx, sy);
    const v = this.view();
    const factor = Math.exp(-e.deltaY * 0.0015);
    v.scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    v.tx = sx - before.x * v.scale;
    v.ty = sy - before.y * v.scale;
    this.requestRender();
  }

  private onRootDown(e: PointerEvent): void {
    if (!this.img) return;
    const { x: sx, y: sy } = this.localPoint(e);
    const v = this.view();
    const downImg = this.screenToImage(sx, sy);
    this.drag = { kind: 'pan', sx, sy, tx: v.tx, ty: v.ty, downImg, moved: false, delMod: this.isDeleteMod(e) };
    this.stageEl.classList.add('panning');
  }

  startCalibDrag(axis: 'x' | 'y', which: 1 | 2, e: PointerEvent): void {
    e.stopPropagation();
    this.store.history.begin();
    const { x: sx, y: sy } = this.localPoint(e);
    const img = this.screenToImage(sx, sy);
    const ax = this.store.state.calibration[axis];
    const cur = which === 1 ? ax.p1 : ax.p2;
    const off = cur - (axis === 'x' ? img.x : img.y);
    this.drag = { kind: 'calib', axis, which, off };
    this.store.ui.selection = { kind: 'calib', axis, which };
    this.store.emitRender();
  }

  startAnchorDrag(seriesId: string, index: number, e: PointerEvent): void {
    e.stopPropagation();
    const s = this.store.seriesById(seriesId);
    if (!s) return;
    this.store.ui.activeSeriesId = seriesId;

    // Ctrl/Alt/Shift/Cmd-click deletes the node outright (GIMP-style). Several
    // modifiers are accepted because some are intercepted by the OS/WM
    // (e.g. Alt+drag moves windows on many Linux desktops).
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      this.store.history.run(() => {
        s.trace.anchors.splice(index, 1);
        recomputeHandles(s.trace.anchors);
      });
      this.store.ui.selection = null;
      this.store.emitStructure();
      return;
    }

    this.store.history.begin();
    this.store.ui.selection = { kind: 'anchor', seriesId, index };
    const { x: sx, y: sy } = this.localPoint(e);
    const img = this.screenToImage(sx, sy);
    const a = s.trace.anchors[index];
    this.drag = { kind: 'anchor', seriesId, index, off: { x: a.x - img.x, y: a.y - img.y } };
    this.store.emitStructure();
  }

  /** Click on the curve (Trace mode): insert a node there and drag it to refine. */
  startInsertOnCurve(e: PointerEvent): void {
    e.stopPropagation();
    if (this.store.ui.tool !== 'trace') return;
    const s = this.store.activeSeries();
    if (!s || s.trace.anchors.length < 2) return;
    const { x: sx, y: sy } = this.localPoint(e);
    const img = this.screenToImage(sx, sy);
    const near = nearestOnBezier(s.trace.anchors, img);
    if (!near) return;
    this.store.history.begin();
    const index = insertNodeOnSegment(s.trace.anchors, near.seg, near.t);
    const a = s.trace.anchors[index];
    this.store.ui.activeSeriesId = s.id;
    this.store.ui.selection = { kind: 'anchor', seriesId: s.id, index };
    // begin dragging the fresh node so the user can nudge it onto the line
    this.drag = { kind: 'anchor', seriesId: s.id, index, off: { x: a.x - img.x, y: a.y - img.y } };
    this.store.emitStructure();
  }

  startHandleDrag(seriesId: string, index: number, side: 'in' | 'out', e: PointerEvent): void {
    e.stopPropagation();
    this.store.history.begin();
    this.store.ui.activeSeriesId = seriesId;
    this.store.ui.selection = { kind: 'handle', seriesId, index, side };
    this.drag = { kind: 'handle', seriesId, index, side };
    this.store.emitRender();
  }

  startProbeDrag(id: string, e: PointerEvent): void {
    e.stopPropagation();
    const p = this.store.probeById(id);
    if (!p) return;
    this.store.history.begin();
    this.store.ui.selection = { kind: 'probe', id };
    const { x: sx, y: sy } = this.localPoint(e);
    const img = this.screenToImage(sx, sy);
    this.drag = { kind: 'probe', id, off: { x: p.x - img.x, y: p.y - img.y } };
    this.store.emitStructure();
  }

  private onMove(e: PointerEvent): void {
    const { x: sx, y: sy } = this.localPoint(e);
    const imgPt = this.img ? this.screenToImage(sx, sy) : null;
    const inBounds =
      imgPt != null &&
      imgPt.x >= 0 && imgPt.y >= 0 &&
      imgPt.x <= this.store.state.image.naturalWidth &&
      imgPt.y <= this.store.state.image.naturalHeight;
    this.hoverImg = imgPt;
    this.onCursor?.(inBounds ? imgPt : null);

    const d = this.drag;
    if (d) {
      if (d.kind === 'pan') {
        const dx = sx - d.sx;
        const dy = sy - d.sy;
        if (!d.moved && Math.hypot(dx, dy) > CLICK_THRESH) d.moved = true;
        if (d.moved) {
          const v = this.view();
          v.tx = d.tx + dx;
          v.ty = d.ty + dy;
          this.requestRender();
        }
      } else if (d.kind === 'calib' && imgPt) {
        const ax = this.store.state.calibration[d.axis];
        const val = (d.axis === 'x' ? imgPt.x : imgPt.y) + d.off;
        if (d.which === 1) ax.p1 = val; else ax.p2 = val;
        this.store.emitRender();
      } else if (d.kind === 'anchor' && imgPt) {
        const s = this.store.seriesById(d.seriesId);
        if (s) {
          const a = s.trace.anchors[d.index];
          a.x = imgPt.x + d.off.x;
          a.y = imgPt.y + d.off.y;
          recomputeHandles(s.trace.anchors);
          this.store.emitRender();
        }
      } else if (d.kind === 'handle' && imgPt) {
        const s = this.store.seriesById(d.seriesId);
        if (s) {
          const a = s.trace.anchors[d.index];
          const dx = imgPt.x - a.x;
          const dy = imgPt.y - a.y;
          // Alt breaks symmetry (corner); otherwise smooth/mirrored.
          const corner = e.altKey || a.mode === 'corner';
          a.mode = corner ? 'corner' : 'smooth';
          if (d.side === 'out') {
            a.hOut = { x: dx, y: dy };
            if (!corner) a.hIn = { x: -dx, y: -dy };
          } else {
            a.hIn = { x: dx, y: dy };
            if (!corner) a.hOut = { x: -dx, y: -dy };
          }
          this.store.emitRender();
        }
      } else if (d.kind === 'probe' && imgPt) {
        const p = this.store.probeById(d.id);
        if (p) {
          if (p.snapSeriesId) {
            const s = this.store.seriesById(p.snapSeriesId);
            const near = s ? nearestOnPolyline(sampleBezier(s.trace.anchors), imgPt) : null;
            if (near) { p.x = near.point.x; p.y = near.point.y; }
            else { p.x = imgPt.x; p.y = imgPt.y; }
          } else {
            p.x = imgPt.x + d.off.x;
            p.y = imgPt.y + d.off.y;
          }
          this.store.emitRender();
        }
      }
    }

    this.showLoupe(imgPt);
  }

  private onUp(_e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    this.stageEl.classList.remove('panning');
    if (!d) return;

    if (d.kind === 'pan' && !d.moved) {
      // Trace-click on empty space appends a node — but not while a delete
      // modifier is held (that gesture is reserved for removing nodes).
      if (this.store.ui.tool === 'trace' && this.img && !d.delMod) {
        this.addOrInsertAnchor(d.downImg);
      } else {
        this.store.ui.selection = null;
        this.store.emitStructure();
      }
    } else if (d.kind === 'calib' || d.kind === 'anchor' || d.kind === 'handle' || d.kind === 'probe') {
      this.store.history.commit();
      this.store.emitStructure();
    }
    if (this.store.ui.tool !== 'trace') this.loupe.hidden = true;
  }

  /**
   * Trace-mode click on empty space appends a node at the end. (Inserting into
   * the middle is handled by clicking the curve itself — see startInsertOnCurve.)
   */
  private addOrInsertAnchor(at: Vec2): void {
    const s = this.store.ensureActiveSeries();
    this.store.history.run(() => {
      s.trace.anchors.push({ x: at.x, y: at.y, mode: 'auto' });
      recomputeHandles(s.trace.anchors);
    });
    this.store.ui.selection = { kind: 'anchor', seriesId: s.id, index: s.trace.anchors.length - 1 };
    this.store.emitStructure();
  }

  /** Drop a new probe pin at the centre of the current view. */
  addProbeAtCenter(): void {
    const r = this.rect();
    const c = this.screenToImage(r.width / 2, r.height / 2);
    const W = this.store.state.image.naturalWidth;
    const H = this.store.state.image.naturalHeight;
    this.store.addProbe({ x: clamp(c.x, 0, W), y: clamp(c.y, 0, H) });
  }

  /** Delete the selected anchor or probe. Returns true if something was removed. */
  deleteSelected(): boolean {
    const sel = this.store.ui.selection;
    if (sel?.kind === 'probe') {
      this.store.removeProbe(sel.id);
      return true;
    }
    if (sel?.kind === 'anchor') {
      const s = this.store.seriesById(sel.seriesId);
      if (!s) return false;
      this.store.history.run(() => {
        s.trace.anchors.splice(sel.index, 1);
        recomputeHandles(s.trace.anchors);
      });
      this.store.ui.selection = null;
      this.store.emitStructure();
      return true;
    }
    return false;
  }

  /** Change the selected node's mode (keyboard: A/S/C). */
  setSelectedNodeMode(mode: NodeMode): boolean {
    const sel = this.store.ui.selection;
    const idx = sel?.kind === 'anchor' ? sel.index : sel?.kind === 'handle' ? sel.index : -1;
    const seriesId = sel?.kind === 'anchor' ? sel.seriesId : sel?.kind === 'handle' ? sel.seriesId : null;
    if (idx < 0 || !seriesId) return false;
    const s = this.store.seriesById(seriesId);
    if (!s) return false;
    const a = s.trace.anchors[idx];
    this.store.history.run(() => {
      a.mode = mode;
      if (mode === 'auto') {
        recomputeHandles(s.trace.anchors);
      } else if (mode === 'smooth' && a.hOut) {
        a.hIn = { x: -a.hOut.x, y: -a.hOut.y };
      }
    });
    this.store.emitStructure();
    return true;
  }

  /** Nudge the selected anchor by image-space delta (keyboard arrows). */
  nudgeSelected(dx: number, dy: number): void {
    const sel = this.store.ui.selection;
    if (sel?.kind === 'anchor') {
      const s = this.store.seriesById(sel.seriesId);
      if (!s) return;
      this.store.history.run(() => {
        const a = s.trace.anchors[sel.index];
        a.x += dx;
        a.y += dy;
        recomputeHandles(s.trace.anchors);
      });
      this.store.emitRender();
    } else if (sel?.kind === 'probe') {
      const p = this.store.probeById(sel.id);
      if (!p) return;
      this.store.history.run(() => { p.x += dx; p.y += dy; });
      this.store.emitRender();
    }
  }
}
