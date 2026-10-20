// Small inline SVG icon set for the UI buttons (consistent across OSes, unlike emoji).
const svg = (body: string, filled = false) =>
  `<svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" ${
    filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
  }>${body}</svg>`;

export const ICONS = {
  gamepad: svg('<rect x="2" y="6" width="20" height="12" rx="6"/><path d="M6.5 12h4M8.5 10v4"/><circle cx="15.5" cy="11" r="0.6"/><circle cx="17.5" cy="13" r="0.6"/>'),
  cat: svg('<path d="M4 20V5l4.5 4h7L20 5v15z"/><circle cx="9.5" cy="13.5" r="0.8"/><circle cx="14.5" cy="13.5" r="0.8"/><path d="M11 16.5h2"/>'),
  soundOn: svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9.5 9.5 0 0 1 0 13"/>'),
  soundOff: svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>'),
  github: svg(
    '<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>',
    true,
  ),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>', true),
  play: svg('<path d="M7 4.5v15l12-7.5z"/>', true),
  home: svg('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>'),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2"/>', true),
  save: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>'),
};

/** Set a button's content to "icon + label". */
export function setBtn(el: HTMLElement, icon: keyof typeof ICONS, label: string) {
  el.innerHTML = `${ICONS[icon]}<span>${label}</span>`;
}
