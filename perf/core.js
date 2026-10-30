(function (G) {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const fmt = (v) => { const r = Math.round(v * 1e4) / 1e4; return (r === 0 ? 0 : r).toString(); };
  const fmt6 = (v) => { const r = Math.round(v * 1e6) / 1e6; return (r === 0 ? 0 : r).toString(); };
  const clamp01 = (t) => Math.min(1, Math.max(0, t));

  function ease(t, mode) {
    t = clamp01(t);
    switch (mode) {
      case 'smooth': return t * t * (3 - 2 * t);
      case 'in': return t * t;
      case 'out': return 1 - (1 - t) * (1 - t);
      default: return t;
    }
  }

  // ---------- development: the flat sheet of a wrapped part ----------
  // u = fraction around the part (0..1), v = fraction along its axis from the bottom (0..1)
  function makeDev(S) {
    if (!S.wrap) return null;
    if (S.wrapShape === 'cone' && S.d1 > 0 && S.d2 >= 0 && Math.abs(S.d1 - S.d2) > 1e-6) {
      const big = Math.max(S.d1, S.d2) / 2, small = Math.min(S.d1, S.d2) / 2, Hax = Math.max(S.axH || 0, 1);
      const L = Math.hypot(Hax, big - small), Rb = L * big / (big - small), Rt = Rb - L, phi = TAU * big / Rb;
      const th0 = -Math.PI / 2 - phi / 2; // sector hangs straight down from its apex
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k <= 720; k++) {
        const t = th0 + phi * k / 720;
        for (const r of [Rb, Rt]) { const x = r * Math.cos(t), y = r * Math.sin(t); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      return { kind: 'cone', L, Rb, Rt, phi, th0, ax: -x0, ay: -y0, W: x1 - x0, H: y1 - y0, flip: S.d2 > S.d1, Hax, rBot: S.d1 / 2, rTop: S.d2 / 2, Cm: Math.PI * (S.d1 + S.d2) / 2 };
    }
    const D = Math.max(S.cylD || 0, 1);
    return { kind: 'cyl', W: Math.PI * D, H: S.H, L: S.H, Hax: S.H, rBot: D / 2, rTop: D / 2, Cm: Math.PI * D };
  }
  function uvToXY(S, u, v) {
    const d = S._dev;
    if (!d || d.kind === 'cyl') return [u * S.W, v * S.H];
    const uu = d.flip ? 1 - u : u, rho = d.flip ? d.Rt + v * d.L : d.Rb - v * d.L, t = d.th0 + uu * d.phi;
    return [d.ax + rho * Math.cos(t), d.ay + rho * Math.sin(t)];
  }
  function xyToUV(S, x, y) {
    const d = S._dev;
    if (!d || d.kind === 'cyl') return [x / S.W, y / S.H];
    let rel = Math.atan2(y - d.ay, x - d.ax) + Math.PI / 2;
    rel -= TAU * Math.round(rel / TAU);
    const ur = (rel + d.phi / 2) / d.phi, rho = Math.hypot(x - d.ax, y - d.ay);
    return d.flip ? [1 - ur, (rho - d.Rt) / d.L] : [ur, (d.Rb - rho) / d.L];
  }
  const rotAbout = (x, y, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]; };

  // One controller's value 0..1 at a point context pc = {x, y, u, v}
  function ctrlT(g, S, pc) {
    const W = S.W, H = S.H, d = S._dev, cone = d && d.kind === 'cone';
    let t = 1;
    switch (g.type) {
      case 'radial': {
        let dist;
        if (cone) {
          const [hx, hy] = uvToXY(S, g.u, g.v);
          dist = Math.hypot(pc.x - hx, pc.y - hy);
          for (const s of [-1, 1]) { const [rx, ry] = rotAbout(hx, hy, d.ax, d.ay, s * d.phi); dist = Math.min(dist, Math.hypot(pc.x - rx, pc.y - ry)); }
        } else {
          let dx = pc.x - g.u * W;
          if (S.wrap) dx -= W * Math.round(dx / W);
          dist = Math.hypot(dx, pc.y - g.v * H);
        }
        t = 1 - Math.min(1, dist / Math.max(g.r, 1e-6)); break;
      }
      case 'linear': {
        const Wl = cone ? d.Cm : W, Hl = cone ? d.L : H, X = cone ? pc.u * Wl : pc.x, Y = cone ? pc.v * Hl : pc.y;
        const ax = g.au * Wl, ay = g.av * Hl, vx = g.bu * Wl - ax, vy = g.bv * Hl - ay, L2 = vx * vx + vy * vy || 1e-9;
        t = ((X - ax) * vx + (Y - ay) * vy) / L2; break;
      }
      case 'image': t = g._sampler ? g._sampler.sample(pc.u, 1 - pc.v) : 1; break;
    }
    t = clamp01(t);
    return g.invert ? 1 - t : t;
  }
  // Combine every controller with the chosen blend mode. Weight w (0..1) scales each one's pull.
  function blendT(S, pc) {
    const G = S.grads;
    let acc, num = 0, den = 0;
    switch (S.blend) {
      case 'min': acc = 1; for (const g of G) acc = Math.min(acc, 1 - g.w + g.w * ctrlT(g, S, pc)); break;
      case 'add': acc = 0; for (const g of G) acc += g.w * ctrlT(g, S, pc); break;
      case 'multiply': acc = 1; for (const g of G) acc *= 1 - g.w + g.w * ctrlT(g, S, pc); break;
      case 'average': for (const g of G) { num += g.w * ctrlT(g, S, pc); den += g.w; } acc = den ? num / den : 0; break;
      default: acc = 0; for (const g of G) acc = Math.max(acc, g.w * ctrlT(g, S, pc));
    }
    return clamp01(acc);
  }
  // Stable per-position random in [0,1): a hole keeps its value while you drag controllers
  function hash01(x, y, seed, k) {
    let h = Math.imul((Math.round(x * 1000) | 0) ^ 0x9E3779B1, 0x85EBCA77) ^ Math.imul((Math.round(y * 1000) | 0) ^ Math.imul(seed | 0, 0x27D4EB2D), 0xC2B2AE3D) ^ Math.imul(k, 0x165667B1);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  function poisson(W, H, r, rng, max, wrapX) {
    const gw = wrapX ? Math.max(1, Math.floor(W * Math.SQRT2 / r)) : Math.ceil(W / (r / Math.SQRT2));
    const cs = wrapX ? W / gw : r / Math.SQRT2, gh = Math.ceil(H / cs);
    if (gw * gh > max * 6) return null;
    const grid = new Int32Array(gw * gh).fill(-1), pts = [], act = [];
    const add = (x, y) => {
      pts.push([x, y]); act.push(pts.length - 1);
      grid[Math.floor(y / cs) * gw + Math.min(gw - 1, Math.floor(x / cs))] = pts.length - 1;
    };
    add(W * rng(), H * rng());
    while (act.length && pts.length < max) {
      const ai = Math.floor(rng() * act.length), p = pts[act[ai]];
      let found = false;
      for (let k = 0; k < 30; k++) {
        const a = rng() * TAU, d = r * (1 + rng());
        let x = p[0] + d * Math.cos(a); const y = p[1] + d * Math.sin(a);
        if (wrapX) x = ((x % W) + W) % W;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
        let ok = true;
        for (let yy = Math.max(0, gy - 2); yy <= Math.min(gh - 1, gy + 2) && ok; yy++)
          for (let k2 = -2; k2 <= 2; k2++) {
            let xx = gx + k2;
            if (wrapX) xx = ((xx % gw) + gw) % gw; else if (xx < 0 || xx >= gw) continue;
            const q = grid[yy * gw + xx];
            if (q >= 0) {
              let dx = pts[q][0] - x; if (wrapX) dx -= W * Math.round(dx / W);
              const dy = pts[q][1] - y; if (dx * dx + dy * dy < r * r) { ok = false; break; }
            }
          }
        if (ok) { add(x, y); found = true; break; }
      }
      if (!found) { act[ai] = act[act.length - 1]; act.pop(); }
    }
    return pts;
  }

  const MAXPTS = 80000;

  function layoutPoints(S) {
    const W = S.W, H = S.H, cx = W / 2, cy = H / 2;
    const p = Math.max(S.pitch, 0.2), rf = Math.max(S.rowF || 1, 0.1);
    if (S.layout === 'random') return poisson(W, H, p, mulberry32(S.seed | 0), 40000, !!S.wrap);
    const dv = S._dev, tw = Math.tan(Math.max(-80, Math.min(80, S.twist || 0)) * DEG);
    if (dv && dv.kind === 'cone') {
      // rows along the slant; each row gets as many holes as its radius allows, so pitch stays constant
      const hex = S.layout === 'hex', dy = p * rf * (hex ? Math.sqrt(3) / 2 : 1);
      const rows = Math.max(1, Math.floor(dv.L / dy)), s0 = (dv.L - (rows - 1) * dy) / 2, pts = [];
      let nMin = Infinity, nMax = 0;
      for (let j = 0; j < rows; j++) {
        const rho = dv.Rb - (s0 + j * dy);
        if (rho <= 1e-6) continue;
        const N = Math.max(3, Math.round(dv.phi * rho / p)), step = dv.phi / N;
        if (pts.length + N > MAXPTS) return null;
        nMin = Math.min(nMin, N); nMax = Math.max(nMax, N);
        const off = (hex && (j & 1) ? 0.5 : 0) + (j * dy * tw) / (rho * step);
        for (let i = 0; i < N; i++) {
          let f = (i + 0.5 + off) / N; f -= Math.floor(f);
          const t = dv.th0 + f * dv.phi;
          pts.push([dv.ax + rho * Math.cos(t), dv.ay + rho * Math.sin(t)]);
        }
      }
      pts.fit = { rows, nMin, nMax };
      return pts;
    }
    if (S.wrap) {
      // whole number of columns around the cylinder; the seam falls between columns
      const hex = S.layout === 'hex', N = Math.max(1, Math.round(W / p)), px = W / N;
      const dy = px * rf * (hex ? Math.sqrt(3) / 2 : 1), nj = Math.ceil(H / 2 / dy) + 1;
      if (N * (2 * nj + 1) > MAXPTS) return null;
      const pts = [];
      for (let j = -nj; j <= nj; j++) {
        const off = (hex && (j & 1) ? px / 2 : 0) + j * dy * tw;
        for (let i = 0; i < N; i++) { let x = ((i + 0.5) * px + off) % W; if (x < 0) x += W; pts.push([x, cy + j * dy]); }
      }
      pts.fit = { px, cols: N };
      return pts;
    }
    const R = Math.hypot(W, H) / 2 + p, pts = [];
    const useRot = S.layout === 'grid' || S.layout === 'hex';
    const rot = (useRot ? S.angle || 0 : 0) * DEG, c = Math.cos(rot), s = Math.sin(rot);
    const push = (x, y) => pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    switch (S.layout) {
      case 'grid':
      case 'hex': {
        const hex = S.layout === 'hex';
        const dy = p * rf * (hex ? Math.sqrt(3) / 2 : 1);
        const ni = Math.ceil(R / p) + 1, nj = Math.ceil(R / dy) + 1;
        if ((2 * ni + 1) * (2 * nj + 1) > MAXPTS * 2) return null;
        for (let j = -nj; j <= nj; j++) {
          const off = hex && (j & 1) ? p / 2 : 0;
          for (let i = -ni; i <= ni; i++) push(i * p + off, j * dy);
        }
        break;
      }
      case 'fibonacci': {
        const k = p * Math.sqrt(Math.sqrt(3) / (2 * Math.PI));
        const n = Math.ceil((R / k) ** 2);
        if (n > MAXPTS) return null;
        const ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) { const r = k * Math.sqrt(i + 0.5), a = i * ga; push(r * Math.cos(a), r * Math.sin(a)); }
        break;
      }
      case 'concentric': {
        push(0, 0);
        const dr = p * rf;
        for (let k = 1; k * dr <= R; k++) {
          const r = k * dr, n = Math.max(3, Math.round(TAU * r / p)), off = (k & 1) ? Math.PI / n : 0;
          if (pts.length + n > MAXPTS) return null;
          for (let i = 0; i < n; i++) { const a = off + i * TAU / n; push(r * Math.cos(a), r * Math.sin(a)); }
        }
        break;
      }
      case 'spiral': {
        const b = p * rf / TAU;
        let th = 0, r = 0;
        while (r <= R) {
          push(r * Math.cos(th), r * Math.sin(th));
          if (pts.length > MAXPTS) return null;
          th += p / Math.max(Math.hypot(r, b), 1e-6); r = b * th;
        }
        break;
      }
    }
    return pts;
  }

  function ngon(n, r, startDeg) {
    const v = [];
    for (let i = 0; i < n; i++) { const a = (startDeg + i * 360 / n) * DEG; v.push([r * Math.cos(a), r * Math.sin(a), 0]); }
    return v;
  }

  // size = minor dimension (mm); elong = length/width for slot & diamond
  function shapeGeom(shape, s, elong, rotDeg) {
    const h = s / 2, e = Math.max(elong || 1, 1);
    let v;
    switch (shape) {
      case 'hexagon': v = ngon(6, h, 0); break;
      case 'triangle': v = ngon(3, h, 90); break;
      case 'square': v = [[-h, -h, 0], [h, -h, 0], [h, h, 0], [-h, h, 0]]; break;
      case 'diamond': { const L = h * e; v = [[L, 0, 0], [0, h, 0], [-L, 0, 0], [0, -h, 0]]; break; }
      case 'slot': {
        const a = h * (e - 1);
        if (a < 1e-6) return { circle: h, rho: h };
        v = [[-a, -h, 0], [a, -h, 1], [a, h, 0], [-a, h, 1]];
        break;
      }
      default: return { circle: h, rho: h };
    }
    const r = rotDeg * DEG, c = Math.cos(r), sn = Math.sin(r);
    let rho = 0;
    v = v.map(([x, y, b]) => { const X = x * c - y * sn, Y = x * sn + y * c; rho = Math.max(rho, Math.hypot(X, Y)); return [X, Y, b]; });
    if (shape === 'slot') rho = h * e;
    return { verts: v, rho };
  }

  function polyArea(v) {
    let A = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length];
      A += (a[0] * b[1] - b[0] * a[1]) / 2;
      if (a[2]) {
        const th = 4 * Math.atan(Math.abs(a[2])), ch = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const r = ch / (2 * Math.sin(th / 2));
        A += Math.sign(a[2]) * r * r / 2 * (th - Math.sin(th));
      }
    }
    return Math.abs(A);
  }
  const geomArea = (g) => g.circle != null ? Math.PI * g.circle * g.circle : polyArea(g.verts);

  function boundaryGeom(S) {
    const W = S.W, H = S.H, dv = S._dev;
    if (dv && dv.kind === 'cone') {
      const P = (r, t) => [dv.ax + r * Math.cos(t), dv.ay + r * Math.sin(t)], b = Math.tan(dv.phi / 4), t0 = dv.th0, t1 = dv.th0 + dv.phi;
      if (dv.Rt > 1e-6) return { verts: [[...P(dv.Rb, t0), b], [...P(dv.Rb, t1), 0], [...P(dv.Rt, t1), -b], [...P(dv.Rt, t0), 0]] };
      return { verts: [[...P(dv.Rb, t0), b], [...P(dv.Rb, t1), 0], [dv.ax, dv.ay, 0]] };
    }
    switch (S.boundary) {
      case 'circle': return { circle: W / 2, cx: W / 2, cy: H / 2 };
      case 'ellipse': {
        const v = [], n = 180;
        for (let i = 0; i < n; i++) { const a = i * TAU / n; v.push([W / 2 + W / 2 * Math.cos(a), H / 2 + H / 2 * Math.sin(a), 0]); }
        return { verts: v };
      }
      case 'rounded': {
        const r = Math.min(S.corner, W / 2 - 1e-3, H / 2 - 1e-3);
        if (r > 1e-3) {
          const b = Math.tan(Math.PI / 8);
          return { verts: [[r, 0, 0], [W - r, 0, b], [W, r, 0], [W, H - r, b], [W - r, H, 0], [r, H, b], [0, H - r, 0], [0, r, b]] };
        }
      }
      // fallthrough
      default: return { verts: [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]] };
    }
  }

  function boundaryArea(S) {
    const W = S.W, H = S.H, dv = S._dev;
    if (dv && dv.kind === 'cone') return dv.phi / 2 * (dv.Rb * dv.Rb - dv.Rt * dv.Rt);
    switch (S.boundary) {
      case 'circle': return Math.PI * W * W / 4;
      case 'ellipse': return Math.PI * W * H / 4;
      case 'rounded': { const r = Math.min(S.corner, W / 2, H / 2); return W * H - (4 - Math.PI) * r * r; }
      default: return W * H;
    }
  }

  // Is a hole of bounding radius rho at (x,y) fully inside boundary minus margin?
  function inside(S, x, y, rho) {
    const W = S.W, H = S.H, d = S.margin + rho;
    const dx = Math.abs(x - W / 2), dy = Math.abs(y - H / 2);
    const dv = S._dev;
    if (dv && dv.kind === 'cone') { const r = Math.hypot(x - dv.ax, y - dv.ay); return r >= dv.Rt + d && r <= dv.Rb - d; }
    if (S.wrap) return dy <= H / 2 - d;
    switch (S.boundary) {
      case 'circle': return Math.hypot(dx, dy) <= W / 2 - d;
      case 'ellipse': {
        const a = W / 2 - d, b = H / 2 - d;
        return a > 0 && b > 0 && (dx / a) ** 2 + (dy / b) ** 2 <= 1;
      }
      case 'rounded': {
        const hw = W / 2 - d, hh = H / 2 - d, rc = Math.max(Math.min(S.corner, W / 2, H / 2) - d, 0);
        if (dx > hw || dy > hh) return false;
        if (dx > hw - rc && dy > hh - rc) return Math.hypot(dx - (hw - rc), dy - (hh - rc)) <= rc;
        return true;
      }
      default: return dx <= W / 2 - d && dy <= H / 2 - d;
    }
  }

  // ---------- seam splitting for cylinder wrap ----------
  function arcInfo(a, n) {
    const th = 4 * Math.atan(a[2]), ch = Math.hypot(n[0] - a[0], n[1] - a[1]);
    const r = ch / (2 * Math.sin(Math.abs(th) / 2));
    const mx = (a[0] + n[0]) / 2, my = (a[1] + n[1]) / 2, ux = (n[0] - a[0]) / ch, uy = (n[1] - a[1]) / ch;
    const dc = Math.sign(a[2]) * r * Math.cos(Math.abs(th) / 2);
    const cx = mx - uy * dc, cy = my + ux * dc;
    return { cx, cy, r, a0: Math.atan2(a[1] - cy, a[0] - cx), th };
  }
  function splitAt(V, X) {
    const out = [], EPS = 1e-9;
    for (let i = 0; i < V.length; i++) {
      const a = V[i], n = V[(i + 1) % V.length], P = [a[0], a[1]], Q = [n[0], n[1]];
      if (Math.abs(a[2]) < 1e-12) {
        const da = a[0] - X, dn = n[0] - X;
        if ((da < -EPS && dn > EPS) || (da > EPS && dn < -EPS)) {
          const t = da / (da - dn), m = [a[0] + (n[0] - a[0]) * t, a[1] + (n[1] - a[1]) * t];
          out.push({ p: P, b: 0, q: m }, { p: m, b: 0, q: Q });
        } else out.push({ p: P, b: 0, q: Q });
      } else {
        const A = arcInfo(a, n), dxl = X - A.cx, ts = [];
        if (Math.abs(dxl) < A.r) {
          const dy = Math.sqrt(A.r * A.r - dxl * dxl);
          for (const yy of [A.cy + dy, A.cy - dy]) {
            let d = Math.atan2(yy - A.cy, dxl) - A.a0;
            d = A.th > 0 ? ((d % TAU) + TAU) % TAU : -((((-d) % TAU) + TAU) % TAU);
            const s = d / A.th;
            if (s > 1e-9 && s < 1 - 1e-9) ts.push(s);
          }
        }
        ts.sort((u, v) => u - v);
        let prev = P, prevS = 0;
        for (const s of [...ts, 1]) {
          const ang = A.a0 + A.th * s, pt = s === 1 ? Q : [A.cx + A.r * Math.cos(ang), A.cy + A.r * Math.sin(ang)];
          out.push({ p: prev, b: Math.tan(A.th * (s - prevS) / 4), q: pt });
          prev = pt; prevS = s;
        }
      }
    }
    return out;
  }
  function edgeMidX(e) {
    const mx = (e.p[0] + e.q[0]) / 2;
    if (!e.b) return mx;
    const ch = Math.hypot(e.q[0] - e.p[0], e.q[1] - e.p[1]), uy = (e.q[1] - e.p[1]) / (ch || 1);
    return mx + uy * (e.b * ch / 2); // sagitta toward the right-hand side of the chord
  }
  // Clip a convex bulge-polygon to x <= X (keepLeft) or x >= X
  function clipX(V, X, keepLeft) {
    const E = splitAt(V, X), ins = E.map((e) => keepLeft ? edgeMidX(e) <= X : edgeMidX(e) >= X);
    if (ins.every(Boolean)) return V;
    if (!ins.some(Boolean)) return null;
    const s = ins.findIndex((v, i) => v && !ins[(i - 1 + E.length) % E.length]);
    const out = []; let k = s, last = null;
    do { out.push([E[k].p[0], E[k].p[1], E[k].b]); last = E[k]; k = (k + 1) % E.length; } while (ins[k] && k !== s);
    out.push([last.q[0], last.q[1], 0]);
    return polyArea(out) > 1e-6 ? out : null;
  }
  const rotV = (V, cx, cy, a) => V.map(([x, y, b]) => { const [X, Y] = rotAbout(x, y, cx, cy, a); return [X, Y, b]; });
  // clip to one side of the ray from the apex at angle t (keepCCW: keep the side at larger angles)
  function clipRay(V, ax, ay, t, keepCCW) {
    const a = Math.PI / 2 - t, R = clipX(rotV(V, ax, ay, a), ax, keepCCW);
    return R ? (R === V ? V : rotV(R, ax, ay, -a)) : null;
  }
  // angular position inside a cone sector, and distance to each seam edge
  function seamDist(h, dv) {
    let rel = Math.atan2(h.y - dv.ay, h.x - dv.ax) + Math.PI / 2; rel -= TAU * Math.round(rel / TAU);
    const a0 = rel + dv.phi / 2, a1 = dv.phi - a0, r = Math.hypot(h.x - dv.ax, h.y - dv.ay);
    return [a0 < Math.PI / 2 ? r * Math.sin(Math.max(a0, 0)) : r, a1 < Math.PI / 2 ? r * Math.sin(Math.max(a1, 0)) : r];
  }
  function seamPieces(h, S) {
    const dv = S._dev; if (!dv) return null;
    const V = h.g.circle != null ? [[h.x - h.g.circle, h.y, 1], [h.x + h.g.circle, h.y, 1]] : holeVerts(h);
    let a, b;
    if (dv.kind === 'cyl') {
      const W = dv.W;
      if (h.x - h.g.rho >= 0 && h.x + h.g.rho <= W) return null;
      const left = h.x - h.g.rho < 0, s = left ? W : -W;
      a = clipX(V, left ? 0 : W, !left);
      b = clipX(V.map(([x, y, bb]) => [x + s, y, bb]), left ? W : 0, left);
    } else {
      const [d0, d1] = seamDist(h, dv);
      if (d0 >= h.g.rho && d1 >= h.g.rho) return null;
      const t0 = dv.th0, t1 = dv.th0 + dv.phi;
      if (d0 < h.g.rho) { a = clipRay(V, dv.ax, dv.ay, t0, true); b = clipRay(rotV(V, dv.ax, dv.ay, dv.phi), dv.ax, dv.ay, t1, false); }
      else { a = clipRay(V, dv.ax, dv.ay, t1, false); b = clipRay(rotV(V, dv.ax, dv.ay, -dv.phi), dv.ax, dv.ay, t0, true); }
    }
    const out = [a, b].filter(Boolean);
    return out.length === 1 && out[0] === V ? null : out;
  }
  // copies of a hole on the far side of the seam, so spacing checks see across it
  function ghostsOf(h, S, range) {
    const dv = S._dev; if (!dv) return [];
    const out = [];
    if (dv.kind === 'cyl') {
      if (h.x < range) out.push({ x: h.x + dv.W, y: h.y, g: h.g, size: h.size, src: h });
      if (h.x > dv.W - range) out.push({ x: h.x - dv.W, y: h.y, g: h.g, size: h.size, src: h });
      return out;
    }
    const [d0, d1] = seamDist(h, dv);
    const mk = (a) => {
      const [x, y] = rotAbout(h.x, h.y, dv.ax, dv.ay, a);
      const g = h.g.circle != null ? h.g : { verts: h.g.verts.map(([vx, vy, b]) => { const [X, Y] = rotAbout(vx, vy, 0, 0, a); return [X, Y, b]; }), rho: h.g.rho };
      return { x, y, g, size: h.size, src: h };
    };
    if (d0 < range) out.push(mk(dv.phi));
    if (d1 < range) out.push(mk(-dv.phi));
    return out;
  }

  function polyD(v, H) {
    let d = 'M' + fmt(v[0][0]) + ' ' + fmt(H - v[0][1]);
    for (let i = 0; i < v.length; i++) {
      const a = v[i], n = v[(i + 1) % v.length];
      if (Math.abs(a[2]) < 1e-9) { if (i < v.length - 1) d += 'L' + fmt(n[0]) + ' ' + fmt(H - n[1]); }
      else {
        const th = 4 * Math.atan(Math.abs(a[2])), ch = Math.hypot(n[0] - a[0], n[1] - a[1]);
        const r = ch / (2 * Math.sin(th / 2));
        d += 'A' + fmt(r) + ' ' + fmt(r) + ' 0 ' + (th > Math.PI ? 1 : 0) + ' ' + (a[2] > 0 ? 0 : 1) + ' ' + fmt(n[0]) + ' ' + fmt(H - n[1]);
      }
    }
    return d + 'Z';
  }
  function circleD(x, y, r, H) {
    const Y = H - y;
    return 'M' + fmt(x - r) + ' ' + fmt(Y) + 'A' + fmt(r) + ' ' + fmt(r) + ' 0 1 0 ' + fmt(x + r) + ' ' + fmt(Y) +
      'A' + fmt(r) + ' ' + fmt(r) + ' 0 1 0 ' + fmt(x - r) + ' ' + fmt(Y) + 'Z';
  }
  const holeVerts = (h) => h.g.verts.map(([vx, vy, b]) => [h.x + vx, h.y + vy, b]);
  const holeD = (h, H) => h.pieces ? h.pieces.map((p) => polyD(p, H)).join('') : h.g.circle != null ? circleD(h.x, h.y, h.g.circle, H) : polyD(holeVerts(h), H);
  function boundaryD(S) {
    const g = boundaryGeom(S);
    return g.circle != null ? circleD(g.cx, g.cy, g.circle, S.H) : polyD(g.verts, S.H);
  }

  // Outline as a point loop (arcs subdivided) for exact-ish web distance
  function outlinePts(h) {
    if (h._pts) return h._pts;
    return (h._pts = tess(holeVerts(h), 12));
  }
  function tess(v, segs) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const a = v[i], n = v[(i + 1) % v.length];
      out.push([a[0], a[1]]);
      if (Math.abs(a[2]) > 1e-9) {
        const th = 4 * Math.atan(a[2]), ch = Math.hypot(n[0] - a[0], n[1] - a[1]);
        const r = ch / (2 * Math.sin(Math.abs(th) / 2));
        const mx = (a[0] + n[0]) / 2, my = (a[1] + n[1]) / 2, ux = (n[0] - a[0]) / ch, uy = (n[1] - a[1]) / ch;
        const dc = Math.sign(a[2]) * r * Math.cos(Math.abs(th) / 2); // centre offset to the left of chord
        const cx = mx - uy * dc, cy = my + ux * dc;
        const a0 = Math.atan2(a[1] - cy, a[0] - cx);
        const m = Math.max(2, Math.ceil(segs * Math.abs(th) / Math.PI));
        for (let k = 1; k < m; k++) { const t = a0 + th * k / m; out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
      }
    }
    return out;
  }
  function segDist(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L));
    return Math.hypot(px - a[0] - t * vx, py - a[1] - t * vy);
  }
  function inPoly(px, py, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++)
      if ((P[i][1] > py) !== (P[j][1] > py) && px < (P[j][0] - P[i][0]) * (py - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    return c;
  }
  function pairGap(h, q) {
    const cd = Math.hypot(q.x - h.x, q.y - h.y);
    if (h.g.circle != null && q.g.circle != null) return cd - h.g.circle - q.g.circle;
    const A = h.g.circle != null ? null : outlinePts(h), B = q.g.circle != null ? null : outlinePts(q);
    if (!A) return polyCircleGap(B, h.x, h.y, h.g.circle);
    if (!B) return polyCircleGap(A, q.x, q.y, q.g.circle);
    if (inPoly(A[0][0], A[0][1], B) || inPoly(B[0][0], B[0][1], A)) return -1;
    let best = Infinity;
    for (const p of A) for (let i = 0; i < B.length; i++) best = Math.min(best, segDist(p[0], p[1], B[i], B[(i + 1) % B.length]));
    for (const p of B) for (let i = 0; i < A.length; i++) best = Math.min(best, segDist(p[0], p[1], A[i], A[(i + 1) % A.length]));
    return best;
  }
  function polyCircleGap(P, x, y, r) {
    if (inPoly(x, y, P)) return -1;
    let best = Infinity;
    for (let i = 0; i < P.length; i++) best = Math.min(best, segDist(x, y, P[i], P[(i + 1) % P.length]));
    return best - r;
  }

  function makeHash(cell) {
    const map = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
    return {
      add(h) { const k = key(Math.floor(h.x / cell), Math.floor(h.y / cell)); (map.get(k) || map.set(k, []).get(k)).push(h); },
      near(h, fn) {
        const i0 = Math.floor(h.x / cell), j0 = Math.floor(h.y / cell);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const l = map.get(key(i0 + di, j0 + dj)); if (l) for (const q of l) fn(q); }
      },
    };
  }
  function minWeb(holes, cell, S) {
    if (holes.length < 2) return null;
    const hs = makeHash(cell);
    holes.forEach((h) => { hs.add(h); ghostsOf(h, S, cell).forEach((g) => hs.add(g)); });
    let best = Infinity;
    for (const h of holes) {
      hs.near(h, (q) => {
        if (q === h || q.src === h) return;
        if (Math.hypot(q.x - h.x, q.y - h.y) - h.g.rho - q.g.rho >= best) return;
        const gap = pairGap(h, q);
        if (gap < best) best = gap;
      });
    }
    return best === Infinity ? null : best;
  }


  // Adaptive spacing: place the largest holes first and skip any candidate that would
  // leave less than `web` mm of material to an already placed hole. Big holes thin out,
  // small holes fill the gaps, nothing collides.
  function holesSparse(holes, web, seed, S) {
    if (holes.length < 2) return holes;
    const order = holes.map((h, i) => [h.size + 1e-6 * hash01(h.x, h.y, seed, 3), i]).sort((a, b) => b[0] - a[0]);
    let maxRho = 0; for (const h of holes) maxRho = Math.max(maxRho, h.g.rho);
    const range = Math.max(2 * maxRho + web, 1e-3), hs = makeHash(range), kept = [];
    for (const [, idx] of order) {
      const h = holes[idx];
      let ok = true;
      hs.near(h, (q) => {
        if (!ok || q.src === h) return;
        if (Math.hypot(q.x - h.x, q.y - h.y) - h.g.rho - q.g.rho >= web) return;
        if (pairGap(h, q) < web - 1e-9) ok = false;
      });
      if (ok) { kept.push(h); hs.add(h); ghostsOf(h, S, range).forEach((g) => hs.add(g)); }
    }
    return kept;
  }

  function normalize(S) {
    if (S.wrap) {
      S.boundary = 'rect';
      const cone = S.wrapShape === 'cone';
      if (!['grid', 'hex', 'random'].includes(S.layout) || (cone && S.layout === 'random')) S.layout = 'hex';
      const dv = makeDev(S);
      S._dev = dv; S.W = dv.W;
      if (dv.kind === 'cone') S.H = dv.H;
    } else S._dev = null;
    if (S.boundary === 'circle') S.H = S.W;
    if (S.sMax < S.sMin) S.sMax = S.sMin;
    return S;
  }

  function compute(S, img) {
    normalize(S);
    const pts = layoutPoints(S);
    if (!pts) return { error: 'Too many holes for this panel. Increase the pitch.' };
    const cx = S.W / 2, cy = S.H / 2;
    let holes = [];
    const steps = S.steps | 0, hasG = (S.grads || []).length > 0, jit = (S.jit || 0) / 100;
    const dv = S._dev, cone = dv && dv.kind === 'cone';
    for (const [x, y] of pts) {
      const [pu, pv] = xyToUV(S, x, y), pc = { x, y, u: pu, v: pv };
      let f = hasG ? ease(blendT(S, pc), S.ease) : 1;
      if (jit > 0) {
        const r = hash01(x, y, S.jitSeed, 1);
        if (!hasG) f = 1 - r * jit;
        else {
          const w = S.jitMode === 'mid' ? 4 * f * (1 - f) : S.jitMode === 'high' ? f : S.jitMode === 'low' ? 1 - f : 1;
          f = clamp01(f + (2 * r - 1) * jit * w);
        }
      }
      if (steps >= 2) f = Math.round(f * (steps - 1)) / (steps - 1);
      const size = hasG || jit > 0 ? S.sMin + (S.sMax - S.sMin) * f : S.sMax;
      if (size <= 0.05 || size < S.dropBelow) continue;
      let rot = S.rot + (hasG ? S.rotGrad * f : 0) + (S.alignRadial && !S.wrap ? Math.atan2(y - cy, x - cx) / DEG : 0);
      if (cone) { let rel = Math.atan2(y - dv.ay, x - dv.ax) + Math.PI / 2; rel -= TAU * Math.round(rel / TAU); rot += rel / DEG + (dv.flip ? 180 : 0); }
      if (S.rotJit) rot += (2 * hash01(x, y, S.jitSeed, 2) - 1) * S.rotJit;
      const g = shapeGeom(S.shape, size, S.elong, rot);
      if (!inside(S, x, y, g.rho)) continue;
      holes.push({ x, y, size, g });
    }
    if (S.adaptive) holes = holesSparse(holes, Math.max(S.webMin || 0, 0), S.seed, S);
    let open = 0, sMinU = Infinity, sMaxU = 0, maxRho = 0;
    const sizes = new Set();
    for (const h of holes) {
      open += geomArea(h.g);
      sMinU = Math.min(sMinU, h.size); sMaxU = Math.max(sMaxU, h.size); maxRho = Math.max(maxRho, h.g.rho);
      if (sizes.size < 50) sizes.add(Math.round(h.size * 100) / 100);
    }
    const web = minWeb(holes, Math.max(S.pitch, 2 * maxRho) * 1.5, S);
    if (S.wrap) for (const h of holes) h.pieces = seamPieces(h, S);
    const d = holes.map((h) => holeD(h, S.H)).join('');
    return {
      holes, d, open: open / boundaryArea(S), web,
      sMin: holes.length ? sMinU : 0, sMax: sMaxU,
      sizes: [...sizes].sort((a, b) => a - b), fit: pts.fit || null, seamSplit: S.wrap ? holes.filter((h) => h.pieces).length : 0,
    };
  }

  // ---------- DXF (R12 / AC1009, mm, origin bottom-left) ----------
  function toDXF(S, res) {
    const L = [];
    const p = (c, v) => { L.push(String(c)); L.push(String(v)); };
    const hdr = (name, pairs) => { p(9, name); pairs.forEach(([c, v]) => p(c, v)); };
    p(0, 'SECTION'); p(2, 'HEADER');
    hdr('$ACADVER', [[1, 'AC1009']]);
    hdr('$INSBASE', [[10, 0], [20, 0], [30, 0]]);
    hdr('$EXTMIN', [[10, 0], [20, 0], [30, 0]]);
    hdr('$EXTMAX', [[10, fmt(S.W)], [20, fmt(S.H)], [30, 0]]);
    hdr('$LIMMIN', [[10, 0], [20, 0]]);
    hdr('$LIMMAX', [[10, fmt(S.W)], [20, fmt(S.H)]]);
    p(0, 'ENDSEC');

    p(0, 'SECTION'); p(2, 'TABLES');
    p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 1);
    p(0, 'LTYPE'); p(2, 'CONTINUOUS'); p(70, 0); p(3, 'Solid line'); p(72, 65); p(73, 0); p(40, '0.0');
    p(0, 'ENDTAB');
    p(0, 'TABLE'); p(2, 'LAYER'); p(70, 2);
    p(0, 'LAYER'); p(2, 'OUTLINE'); p(70, 0); p(62, 7); p(6, 'CONTINUOUS');
    p(0, 'LAYER'); p(2, 'HOLES'); p(70, 0); p(62, 1); p(6, 'CONTINUOUS');
    p(0, 'ENDTAB');
    p(0, 'ENDSEC');

    const circle = (layer, x, y, r) => { p(0, 'CIRCLE'); p(8, layer); p(10, fmt(x)); p(20, fmt(y)); p(30, 0); p(40, fmt(r)); };
    const poly = (layer, v) => {
      p(0, 'POLYLINE'); p(8, layer); p(66, 1); p(10, 0); p(20, 0); p(30, 0); p(70, 1);
      for (const [x, y, b] of v) {
        p(0, 'VERTEX'); p(8, layer); p(10, fmt(x)); p(20, fmt(y)); p(30, 0);
        if (Math.abs(b) > 1e-9) p(42, fmt6(b));
      }
      p(0, 'SEQEND'); p(8, layer);
    };

    p(0, 'SECTION'); p(2, 'ENTITIES');
    if (S.out !== 'holes') {
      const g = boundaryGeom(S);
      if (g.circle != null) circle('OUTLINE', g.cx, g.cy, g.circle); else poly('OUTLINE', g.verts);
    }
    for (const h of res.holes) {
      if (h.pieces) h.pieces.forEach((p) => poly('HOLES', p));
      else if (h.g.circle != null) circle('HOLES', h.x, h.y, h.g.circle); else poly('HOLES', holeVerts(h));
    }
    p(0, 'ENDSEC');
    p(0, 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  function toSVG(S, res) {
    const W = fmt(S.W), H = fmt(S.H);
    const inv = S.out === 'holes';
    const out = inv ? '' : `  <path id="outline" d="${boundaryD(S)}" fill="none" stroke="#000" stroke-width="0.1"/>\n`;
    const holes = inv ? `  <path id="holes" d="${res.d}" fill="#000"/>\n` : `  <path id="holes" d="${res.d}" fill="none" stroke="#e00" stroke-width="0.1"/>\n`;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n` +
      out + holes + `</svg>\n`;
  }

  // every hole (or seam piece) as a flat point loop, for texturing the 3D preview
  function outlines(res) {
    const out = [];
    for (const h of res.holes) {
      if (h.pieces) h.pieces.forEach((p) => out.push(tess(p, 24)));
      else if (h.g.circle != null) out.push(tess([[h.x - h.g.circle, h.y, 1], [h.x + h.g.circle, h.y, 1]], 24));
      else out.push(tess(holeVerts(h), 24));
    }
    return out;
  }

  G.PerfCore = { compute, toDXF, toSVG, boundaryD, normalize, mulberry32, _t: { polyArea, geomArea }, uvToXY, xyToUV, outlines };
})(typeof window !== 'undefined' ? window : globalThis);
