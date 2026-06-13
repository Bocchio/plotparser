// Minimal hyperscript helpers — keeps panel code declarative without a framework.

type Props = Record<string, any>;
type Child = Node | string | null | undefined | false;

const PROP_KEYS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag: string, props: Props = {}, children: Child[] = []): SVGElement {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v === true) {
      node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  append(node, children);
  return node;
}

function applyProps(node: HTMLElement, props: Props) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (PROP_KEYS.has(k)) {
      (node as any)[k] = v;
    } else if (v === true) {
      node.setAttribute(k, '');
    } else if (v === false) {
      /* skip */
    } else {
      node.setAttribute(k, String(v));
    }
  }
}

function append(node: Node, children: Child[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(node: Element) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Small "?" affordance carrying detail in a tooltip (keeps panels uncluttered). */
export function help(text: string): HTMLElement {
  return el('span', { class: 'ihelp', title: text }, ['?']);
}

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`Element not found: ${sel}`);
  return found;
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  let t = document.querySelector<HTMLDivElement>('.toast');
  if (!t) {
    t = el('div', { class: 'toast' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 1800);
}
