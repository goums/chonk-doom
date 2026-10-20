// Button icons (emoji) + a helper that renders "icon + label" consistently.
export const ICONS = {
  gamepad: '🎮',
  cat: '🐱',
  soundOn: '🔊',
  soundOff: '🔇',
  github: '🐙',
  pause: '⏸️',
  play: '▶️',
  home: '🏠',
  stop: '⏹️',
  save: '💾',
};

/** Set a button's content to "icon + label". */
export function setBtn(el: HTMLElement, icon: keyof typeof ICONS, label: string) {
  el.innerHTML = `<span class="ico" aria-hidden="true">${ICONS[icon]}</span><span>${label}</span>`;
}
