// Global graphics style, chosen once at startup (the switcher stores it and reloads).
//  - smooth (default): soft minimalist vector look
//  - storybook: hand-drawn cartoon look with ink outlines, watercolor washes and paper grain
//  - retro: crunchy 1993 pixels
export type StyleName = 'smooth' | 'storybook' | 'retro';
export const STYLE_ORDER: StyleName[] = ['smooth', 'storybook', 'retro'];
export const STYLE_LABEL: Record<StyleName, string> = { smooth: 'SMOOTH', storybook: 'STORYBOOK', retro: 'RETRO' };

function pick(): StyleName {
  const ok = (s: string | null): s is StyleName => !!s && (STYLE_ORDER as string[]).includes(s);
  const q = new URLSearchParams(location.search).get('style');
  if (ok(q)) return q;
  try {
    const s = localStorage.getItem('chonk.style');
    if (ok(s)) return s;
  } catch { /* storage blocked */ }
  return 'smooth';
}

const name = pick();

export const STYLE = {
  name,
  /** high-res anti-aliased art (smooth + storybook) */
  smooth: name !== 'retro',
  /** ink outlines + watercolor (storybook) */
  ink: name === 'storybook',
  /** resolution multiplier for procedurally drawn art */
  art: name === 'retro' ? 1 : 4,
  /** resolution multiplier for the 3D view + HUD composite */
  screen: name === 'retro' ? 1 : 3,
  font: name === 'storybook' ? 'Patrick Hand' : 'Fredoka',
  fontWeight: name === 'storybook' ? 400 : 600,
  fontScale: name === 'storybook' ? 7.4 : 6.2,
  inkColor: '#2b1d17',
};

export function nextStyle() {
  const s = STYLE_ORDER[(STYLE_ORDER.indexOf(STYLE.name) + 1) % STYLE_ORDER.length];
  try { localStorage.setItem('chonk.style', s); } catch { /* ignore */ }
  location.reload();
}
