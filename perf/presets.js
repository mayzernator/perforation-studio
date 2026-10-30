(function (G) {
  const R = (u, v, r, o) => Object.assign({ type: 'radial', u, v, r, invert: false, w: 1 }, o);
  const Lin = (au, av, bu, bv, o) => Object.assign({ type: 'linear', au, av, bu, bv, invert: false, w: 1 }, o);
  const DEF = {
    W: 116, H: 116, boundary: 'circle', corner: 8, margin: 2, thick: 1.2,
    layout: 'hex', pitch: 5.2, rowF: 1, angle: 0, seed: 7,
    shape: 'hexagon', sMin: 2.2, sMax: 4.6, elong: 3, rot: 30, rotGrad: 0, alignRadial: false,
    steps: 0, dropBelow: 0,
    grads: [R(0.5, 0.5, 62)], blend: 'max', ease: 'smooth',
    jit: 0, jitMode: 'all', jitSeed: 1, rotJit: 0,
    adaptive: true, webMin: 1, wrap: false, cylD: 60, wrapShape: 'cyl', d1: 80, d2: 50, axH: 60, twist: 0,
    out: 'plate',
  };
  const PRESETS = [
    { name: '120 mm fan grille', s: {} },
    { name: 'Speaker grille, sunflower', s: { W: 90, H: 90, boundary: 'circle', margin: 3, layout: 'fibonacci', pitch: 4, shape: 'circle', sMin: 1.2, sMax: 2.6, rot: 0, thick: 0.6, grads: [R(0.5, 0.5, 46)], ease: 'out' } },
    { name: 'Enclosure vent slots', s: { W: 160, H: 80, boundary: 'rounded', corner: 6, margin: 6, layout: 'grid', pitch: 7, rowF: 3.4, shape: 'slot', sMin: 2, sMax: 3.5, elong: 5, rot: 90, grads: [Lin(0.05, 0.5, 0.95, 0.5)], ease: 'linear' } },
    { name: 'Hex lattice plate', s: { W: 150, H: 100, boundary: 'rect', margin: 5, thick: 3, layout: 'hex', pitch: 10, shape: 'hexagon', sMin: 8, sMax: 8, rot: 30, grads: [] } },
    { name: 'Twin hotspots, jittered', s: { W: 160, H: 100, boundary: 'rounded', corner: 10, margin: 4, thick: 1, layout: 'hex', pitch: 5, shape: 'circle', sMin: 0.8, sMax: 4.2, rot: 0, grads: [R(0.3, 0.55, 42), R(0.72, 0.42, 36)], blend: 'max', ease: 'smooth', jit: 30, jitMode: 'mid', jitSeed: 4, dropBelow: 0.9 } },
    { name: 'Diamond halftone', s: { W: 140, H: 90, boundary: 'rect', margin: 4, thick: 1, layout: 'grid', pitch: 5, angle: 45, shape: 'diamond', elong: 1, sMin: 0, sMax: 4.2, rot: 0, grads: [Lin(0.05, 0.1, 0.95, 0.9)], ease: 'smooth', dropBelow: 0.6 } },
    { name: 'Radial slots', s: { W: 100, H: 100, boundary: 'circle', margin: 3, layout: 'concentric', pitch: 6, rowF: 1.4, shape: 'slot', elong: 2.6, sMin: 1.2, sMax: 2.4, rot: 0, alignRadial: true, grads: [R(0.5, 0.5, 50, { invert: true })], ease: 'linear', thick: 1 } },
    { name: 'Spiral dots, 3 drill sizes', s: { W: 100, H: 100, boundary: 'circle', margin: 2, layout: 'spiral', pitch: 3.8, rowF: 1.2, shape: 'circle', sMin: 1, sMax: 3, rot: 0, grads: [R(0.5, 0.5, 50)], ease: 'in', steps: 3, thick: 1 } },
    { name: 'Packed bubbles', s: { W: 140, H: 100, boundary: 'rounded', corner: 12, margin: 4, thick: 1, layout: 'random', pitch: 2.4, seed: 5, shape: 'circle', sMin: 1.2, sMax: 9, rot: 0, grads: [R(0.38, 0.6, 55), R(0.78, 0.3, 30, { w: 0.8 })], blend: 'max', ease: 'smooth', jit: 25, jitMode: 'all', jitSeed: 3, webMin: 1.2 } },
    { name: 'Cylinder sleeve Ø60, wraps', s: { wrap: true, cylD: 60, W: Math.PI * 60, H: 70, margin: 4, thick: 1.5, layout: 'hex', pitch: 6, shape: 'circle', sMin: 1.6, sMax: 4.6, rot: 0, grads: [R(0.97, 0.5, 48)], ease: 'smooth', jit: 15, jitMode: 'mid', webMin: 1.2 } },
    { name: 'Lampshade frustum, wraps', s: { wrap: true, wrapShape: 'cone', d1: 160, d2: 90, axH: 120, margin: 5, thick: 0.8, layout: 'hex', pitch: 7, shape: 'circle', sMin: 1.6, sMax: 5.8, rot: 0, grads: [R(0.25, 0.55, 70), R(0.75, 0.42, 55, { w: 0.85 })], blend: 'max', ease: 'smooth', jit: 20, jitMode: 'mid', jitSeed: 7, webMin: 1.2 } },
    { name: 'Helix sleeve, twisted slots', s: { wrap: true, wrapShape: 'cyl', cylD: 50, W: Math.PI * 50, H: 80, margin: 5, thick: 1.2, layout: 'grid', pitch: 8, rowF: 1.1, twist: 35, shape: 'slot', elong: 3, sMin: 1.8, sMax: 2.6, rot: 55, grads: [Lin(0.5, 0.0, 0.5, 1.0)], ease: 'smooth', webMin: 1.2 } },
    { name: 'Random scatter', s: { W: 120, H: 80, boundary: 'ellipse', margin: 3, layout: 'random', pitch: 5, seed: 11, shape: 'circle', sMin: 1, sMax: 3.6, rot: 0, grads: [Lin(0.05, 0.5, 0.95, 0.5)], ease: 'smooth', thick: 1 } },
  ];
  G.PerfPresets = { DEF, PRESETS };
})(typeof window !== 'undefined' ? window : globalThis);
