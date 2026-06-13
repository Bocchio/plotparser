export interface LoadedImage {
  img: HTMLImageElement;
  dataUrl: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface InputHandlers {
  onImage: (loaded: LoadedImage) => void;
  onProjectText: (text: string, filename: string) => void;
  onError?: (message: string) => void;
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsDataURL(file);
  });
}

function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file.'));
    r.readAsText(file);
  });
}

export function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = dataUrl;
  });
}

async function handleImageFile(file: File, handlers: InputHandlers): Promise<void> {
  const dataUrl = await readAsDataURL(file);
  const img = await loadImageElement(dataUrl);
  handlers.onImage({
    img,
    dataUrl,
    name: file.name || 'pasted-image.png',
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  });
}

function isJsonFile(file: File): boolean {
  return file.type === 'application/json' || /\.json$/i.test(file.name);
}

async function handleFile(file: File, handlers: InputHandlers): Promise<void> {
  try {
    if (file.type.startsWith('image/')) {
      await handleImageFile(file, handlers);
    } else if (isJsonFile(file)) {
      const text = await readAsText(file);
      handlers.onProjectText(text, file.name);
    } else {
      handlers.onError?.(`Unsupported file: ${file.name}`);
    }
  } catch (e) {
    handlers.onError?.(e instanceof Error ? e.message : String(e));
  }
}

export function setupInput(stageEl: HTMLElement, handlers: InputHandlers): void {
  // ---- drag & drop (whole window) ----
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    stageEl.classList.add('dragover');
  });
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) stageEl.classList.remove('dragover');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    stageEl.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files && files.length) {
      handleFile(files[0], handlers);
    }
  });

  // ---- paste (clipboard image) ----
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          handleImageFile(file, handlers).catch((err) =>
            handlers.onError?.(err instanceof Error ? err.message : String(err)),
          );
          return;
        }
      }
    }
  });
}

export function openFilePicker(accept: string, handlers: InputHandlers): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = () => {
    if (input.files && input.files.length) handleFile(input.files[0], handlers);
  };
  input.click();
}
