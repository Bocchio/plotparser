import type { NodeMode, ProbePoint, Project, Series } from '../state/types';
import { defaultCalibration, defaultOverlay, uid } from '../state/store';

export interface SerializeOpts {
  embedImage: boolean;
}

export function serializeProject(project: Project, opts: SerializeOpts): string {
  const out: Project = {
    ...project,
    image: {
      ...project.image,
      dataUrl: opts.embedImage ? project.image.dataUrl : null,
    },
  };
  return JSON.stringify(out, null, 2);
}

/** Parse + normalise a project JSON. Throws on clearly invalid input. */
export function parseProject(text: string): Project {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('Project file is empty or malformed.');
  if (!raw.calibration || !Array.isArray(raw.series)) {
    throw new Error('This JSON does not look like a PlotParser project.');
  }

  const image = raw.image ?? {};
  const series: Series[] = (raw.series as any[]).map((s, i) => ({
    id: typeof s.id === 'string' ? s.id : uid('ser'),
    name: typeof s.name === 'string' ? s.name : `Series ${i + 1}`,
    color: typeof s.color === 'string' ? s.color : '#4c9aff',
    visible: s.visible !== false,
    width: Number(s.width) > 0 ? Number(s.width) : 2,
    trace: {
      type: 'bezier',
      anchors: Array.isArray(s.trace?.anchors)
        ? s.trace.anchors.map((a: any) => ({
            x: Number(a.x),
            y: Number(a.y),
            hIn: a.hIn ? { x: Number(a.hIn.x), y: Number(a.hIn.y) } : undefined,
            hOut: a.hOut ? { x: Number(a.hOut.x), y: Number(a.hOut.y) } : undefined,
            // tolerate the older `manual` flag
            mode: (['auto', 'smooth', 'corner'].includes(a.mode)
              ? a.mode
              : a.manual ? 'smooth' : 'auto') as NodeMode,
          }))
        : [],
    },
  }));

  const probes: ProbePoint[] = Array.isArray(raw.probes)
    ? raw.probes.map((p: any) => ({
        id: typeof p.id === 'string' ? p.id : uid('pr'),
        x: Number(p.x),
        y: Number(p.y),
        snapSeriesId: typeof p.snapSeriesId === 'string' ? p.snapSeriesId : null,
      }))
    : [];

  const project: Project = {
    version: typeof raw.version === 'number' ? raw.version : 1,
    image: {
      dataUrl: typeof image.dataUrl === 'string' ? image.dataUrl : null,
      name: typeof image.name === 'string' ? image.name : '',
      naturalWidth: Number(image.naturalWidth) || 0,
      naturalHeight: Number(image.naturalHeight) || 0,
    },
    calibration: { ...defaultCalibration(), ...raw.calibration },
    series,
    probes,
    view: raw.view,
    overlay: { ...defaultOverlay(), ...(raw.overlay ?? {}) },
  };
  return project;
}
