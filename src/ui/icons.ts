/**
 * The app's icon set: small inline SVGs on a 24-unit grid with one stroke
 * width, so every control is drawn the same way (instead of mixing Unicode
 * glyphs and emoji, which render differently on every platform).
 */
const PATHS: Record<string, string> = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none"/>',
  step: '<path d="M6.5 5.5v13l8.5-6.5z" fill="currentColor" stroke="none"/><path d="M17.5 5.5v13"/>',
  back: '<path d="M17.5 5.5v13L9 12z" fill="currentColor" stroke="none"/><path d="M6.5 5.5v13"/>',
  undo: '<path d="M9 14.5L4.5 10 9 5.5"/><path d="M4.5 10h9.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14.5l4.5-4.5L15 5.5"/><path d="M19.5 10H10a5.5 5.5 0 0 0 0 11h3"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.5H8"/>',
  draw: '<path d="M4.5 19.5l1-4 10-10a2.1 2.1 0 0 1 3 3l-10 10z"/><path d="M13.5 7.5l3 3"/>',
  erase: '<path d="M9 19.5h10.5"/><path d="M5.3 14.3l8.5-8.5a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8l-7.7 7.7a2 2 0 0 1-1.4.6H8.2a2 2 0 0 1-1.4-.6l-1.5-1.5a2 2 0 0 1 0-2.8z"/><path d="M9.5 10l5 5"/>',
  pan: '<path d="M12 3.5v17M3.5 12h17"/><path d="M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>',
  dice: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  clear: '<path d="M6 6l12 12M18 6L6 18"/>',
  record: '<circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none"/>',
  tree: '<path d="M12 20.5V11M12 11L6.5 6M12 11l5.5-5M12 15l4-3"/><circle cx="6.5" cy="5" r="1.5"/><circle cx="17.5" cy="5" r="1.5"/><circle cx="16.5" cy="11.5" r="1.5"/>',
  cube: '<path d="M12 3.5l7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7z"/><path d="M4.5 7.7L12 12l7.5-4.3M12 12v8.5"/>',
  forward: '<path d="M4.5 6v12l7-6zM12.5 6v12l7-6z" fill="currentColor" stroke="none"/>',
  rewind: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8.5V12l2.5 1.5"/>',
  download: '<path d="M12 4.5v10M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  svg.innerHTML = PATHS[name];
  return svg;
}

/** Replace a button's content with an icon and optional text label. */
export function setIcon(el: HTMLElement, name: IconName, label?: string) {
  el.replaceChildren(icon(name), ...(label ? [document.createTextNode(label)] : []));
}
