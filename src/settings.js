const STORAGE_KEY = 'xebay.quality';

export const QUALITY = {
  low: { label: 'Thấp', pixelRatio: 1, anisotropy: 1, shadows: false, shadowSize: 0, post: false, smaa: false, water: false, waterRes: 0, trafficShare: 0.5, treeShare: 0.45 },
  medium: { label: 'Trung bình', pixelRatio: 1.25, anisotropy: 4, shadows: true, shadowSize: 1024, post: true, smaa: true, water: true, waterRes: 256, trafficShare: 0.8, treeShare: 0.75 },
  high: { label: 'Cao', pixelRatio: 1.75, anisotropy: 8, shadows: true, shadowSize: 2048, post: true, smaa: true, water: true, waterRes: 512, trafficShare: 1, treeShare: 1 },
};

export const isMobile = () => matchMedia('(pointer: coarse)').matches || innerWidth < 760;

function initialQuality() {
  const fromUrl = new URLSearchParams(location.search).get('q');
  if (fromUrl && QUALITY[fromUrl]) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && QUALITY[saved]) return saved;
  } catch {}
  return isMobile() ? 'low' : 'medium';
}

export const settings = { quality: initialQuality() };
export const tier = () => QUALITY[settings.quality];

const listeners = [];
export const onQualityChange = (fn) => listeners.push(fn);

export function setQuality(name) {
  if (!QUALITY[name] || name === settings.quality) return;
  settings.quality = name;
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {}
  listeners.forEach((fn) => fn(tier()));
}
