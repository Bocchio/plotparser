import './styles.css';
import { Store, emptyProject } from './state/store';
import { Stage } from './render/stage';
import { setupToolbar } from './ui/toolbar';
import { setupStatusbar } from './ui/statusbar';
import { setupSidebar } from './ui/sidebar';
import type { AppContext } from './ui/context';
import {
  loadImageElement,
  openFilePicker,
  readAsDataURL,
  setupInput,
  type InputHandlers,
  type LoadedImage,
} from './io/imageInput';
import { parseProject, serializeProject } from './io/project';
import { downloadText } from './io/download';
import { $, el, toast } from './util/dom';
import { icon } from './ui/icons';
import sampleUrl from './assets/sample-plot.png';

function initCalibration(store: Store, w: number, h: number): void {
  // Place the guide lines at visible positions; values stay unset until the
  // user drags each line onto a tick and types its value.
  const cal = store.state.calibration;
  cal.x.p1 = Math.round(w * 0.15);
  cal.x.p2 = Math.round(w * 0.85);
  cal.y.p1 = Math.round(h * 0.85); // lower position -> v1
  cal.y.p2 = Math.round(h * 0.15); // upper position -> v2
}

function main(): void {
  const store = new Store(emptyProject());

  const stage = new Stage(store, {
    stage: $('#stage'),
    canvas: $<HTMLCanvasElement>('#stage-canvas'),
    svg: document.getElementById('stage-svg') as unknown as SVGSVGElement,
    loupe: $<HTMLCanvasElement>('#loupe'),
  });

  let awaitingImage = false;

  const ctx: AppContext = {
    store,
    stage,
    toast,

    setImageFromLoaded(loaded: LoadedImage) {
      const first = !store.hasImage();
      store.state.image = {
        dataUrl: loaded.dataUrl,
        name: loaded.name,
        naturalWidth: loaded.naturalWidth,
        naturalHeight: loaded.naturalHeight,
      };
      if (awaitingImage) {
        awaitingImage = false; // keep calibration from the loaded config
      } else if (first) {
        initCalibration(store, loaded.naturalWidth, loaded.naturalHeight);
      }
      stage.setImage(loaded.img);
      store.history.clear();
      store.emitStructure();
      $('#drop-hint').setAttribute('hidden', '');
    },

    loadProjectText(text: string) {
      let proj;
      try {
        proj = parseProject(text);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not load project');
        return;
      }
      store.state = proj;
      store.ui.activeSeriesId = proj.series[0]?.id ?? null;
      store.ui.selection = null;
      store.history.clear();

      if (proj.image.dataUrl) {
        awaitingImage = false;
        loadImageElement(proj.image.dataUrl)
          .then((img) => {
            stage.setImage(img);
            $('#drop-hint').setAttribute('hidden', '');
            store.emitStructure();
          })
          .catch(() => toast('Project loaded but image failed to decode'));
      } else {
        awaitingImage = true;
        stage.setImage(null);
        $('#drop-hint').removeAttribute('hidden');
        toast('Config loaded — now drop the matching image');
      }
      store.emitStructure();
    },

    pickImage() {
      openFilePicker('image/*', handlers);
    },
    pickProject() {
      openFilePicker('application/json,.json', handlers);
    },

    async loadSample() {
      try {
        const res = await fetch(sampleUrl);
        const blob = await res.blob();
        const dataUrl = await readAsDataURL(blob);
        const img = await loadImageElement(dataUrl);
        ctx.setImageFromLoaded({
          img,
          dataUrl,
          name: 'sample-plot.png',
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
        });
      } catch {
        toast('Could not load sample image');
      }
    },

    saveProject(embedImage: boolean) {
      if (!store.hasImage()) {
        toast('Load an image first');
        return;
      }
      const text = serializeProject(store.state, { embedImage });
      const name = embedImage ? 'plotparser-project.json' : 'plotparser-config.json';
      downloadText(name, text, 'application/json');
      toast(embedImage ? 'Project saved' : 'Config saved (no image)');
    },
  };

  const handlers: InputHandlers = {
    onImage: (loaded) => ctx.setImageFromLoaded(loaded),
    onProjectText: (text) => ctx.loadProjectText(text),
    onError: (m) => toast(m),
  };

  setupInput($('#stage'), handlers);
  setupToolbar($('#toolbar'), ctx);
  setupStatusbar($('#statusbar'), ctx);
  setupSidebar($('#sidebar'), ctx);

  // Empty-state image actions live in the drop hint, not a sidebar panel.
  const openBtn = el('button', { class: 'primary' }, [icon('image'), 'Open image']);
  openBtn.addEventListener('click', () => ctx.pickImage());
  const sampleBtn = el('button', {}, ['Try sample']);
  sampleBtn.addEventListener('click', () => ctx.loadSample());
  $('#drop-hint .drop-hint-inner').appendChild(el('div', { class: 'drop-actions' }, [openBtn, sampleBtn]));

  // Expose for console debugging / inspection (harmless for a local tool).
  (window as any).plotparser = { store, stage };
}

main();
