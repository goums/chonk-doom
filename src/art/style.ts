// Global graphics style, chosen once at startup.
//  - pixel (default): modern pixel art (limited palette, hue-shifted shading, colored outlines, crisp readable UI)
//  - smooth: soft minimalist vector look            (?style=smooth)
//  - storybook: ink outlines, watercolor and paper   (?style=storybook)
export type StyleName = 'pixel' | 'smooth' | 'storybook';
export const STYLE_ORDER: StyleName[] = ['pixel', 'smooth', 'storybook'];

function pick(): StyleName {
  const ok = (s: string | null): s is StyleName => !!s && (STYLE_ORDER as string[]).includes(s);
  const q = new URLSearchParams(location.search).get('style');
  if (ok(q)) return q;
  return 'pixel';
}

const name = pick();

export const STYLE = {
  name,
  /** high-res anti-aliased art (smooth + storybook) */
  smooth: name !== 'pixel',
  /** modern pixel art (palette snapping, colored outlines) */
  pixel: name === 'pixel',
  /** ink outlines + watercolor (storybook) */
  ink: name === 'storybook',
  /** resolution multiplier for procedurally drawn art */
  art: name === 'pixel' ? 1 : 4,
  /** resolution multiplier for the HUD composite (text is always crisp vector) */
  screen: 3,
  /** resolution multiplier for the 3D view (pixel: 576x300, upscaled 2x nearest-neighbour) */
  render: name === 'pixel' ? 1.5 : 3,
  font: name === 'storybook' ? 'Patrick Hand' : name === 'pixel' ? 'Pixelify Sans' : 'Fredoka',
  fontWeight: name === 'smooth' ? 600 : 400, // Pixelify Sans bold closes its 'C': use regular
  fontScale: name === 'storybook' ? 7.4 : name === 'pixel' ? 6.4 : 6.2,
  inkColor: '#2b1d17',
};
