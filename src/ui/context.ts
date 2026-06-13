import type { Store } from '../state/store';
import type { Stage } from '../render/stage';
import type { LoadedImage } from '../io/imageInput';

/** Shared surface the panels use to trigger app-wide actions. */
export interface AppContext {
  store: Store;
  stage: Stage;
  setImageFromLoaded(loaded: LoadedImage): void;
  loadProjectText(text: string, filename?: string): void;
  pickImage(): void;
  pickProject(): void;
  loadSample(): void;
  saveProject(embedImage: boolean): void;
  toast(msg: string): void;
}
