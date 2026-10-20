// Global graphics style. 'smooth' (default) = soft minimalist vector look, 'retro' = crunchy 1993 pixels.
// Chosen once at startup (toggle button stores it and reloads).
export type StyleName = 'smooth' | 'retro';

function pick(): StyleName {
  const q = new URLSearchParams(location.search).get('style');
  if (q === 'retro' || q === 'smooth') return q;
  try {
    const s = localStorage.getItem('chonk.style');
    if (s === 'retro' || s === 'smooth') return s;
  } catch { /* storage blocked */ }
  return 'smooth';
}

const name = pick();

export const STYLE = {
  name,
  smooth: name === 'smooth',
  /** resolution multiplier for procedurally drawn art */
  art: name === 'smooth' ? 4 : 1,
  /** resolution multiplier for the 3D view + HUD composite */
  screen: name === 'smooth' ? 3 : 1,
  font: 'Fredoka',
};

export function setStyle(s: StyleName) {
  try { localStorage.setItem('chonk.style', s); } catch { /* ignore */ }
  location.reload();
}
