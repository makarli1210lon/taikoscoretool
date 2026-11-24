/* 太鼓スコア記録：進捗画像の書き出し
 * プレビュー（1920×1080 の DOM）を、そのまま Canvas に描き直して画像にする。
 * html2canvas などの汎用ライブラリは iPhone の Safari で崩れやすいので、このステージで使う CSS だけを自前で描く。
 *  背景色／linear・radial（repeating 含む）グラデーション／url 画像、角丸（楕円も）、枠線、box-shadow（外側・inset の線）、
 *  text-shadow、opacity、overflow の切り抜き、transform、filter: drop-shadow、<img>、<svg>
 */
'use strict';

const SNAP = {};

/* ---------- 文字列の解析 ---------- */
SNAP.splitTop = (s, sep = ',') => {      // 括弧の外の区切りで分ける
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') d++; else if (ch === ')') d--;
    if (ch === sep && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
SNAP.splitSpace = s => SNAP.splitTop(s, ' ').filter(Boolean);
SNAP.len = (v, ref) => { if (v == null) return 0; v = String(v).trim(); if (v.endsWith('%')) return parseFloat(v) / 100 * ref; return parseFloat(v) || 0; };
SNAP.alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };

/* 角丸の半径 [[rx,ry]×4]（左上・右上・右下・左下） */
SNAP.radii = (cs, w, h) => {
  const r = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => {
    const p = String(cs[k] || '0').split(' '); return [SNAP.len(p[0], w), SNAP.len(p[1] ?? p[0], h)];
  });
  // 辺の長さを超える分は CSS と同じく全体を縮める
  const f = Math.min(1, w / (r[0][0] + r[1][0] || 1), w / (r[3][0] + r[2][0] || 1), h / (r[0][1] + r[3][1] || 1), h / (r[1][1] + r[2][1] || 1));
  return r.map(([a, b]) => [a * f, b * f]);
};
SNAP.rrPath = (ctx, x, y, w, h, r) => {
  const K = 0.5523;
  const [[a1, b1], [a2, b2], [a3, b3], [a4, b4]] = r;
  ctx.moveTo(x + a1, y);
  ctx.lineTo(x + w - a2, y);
  ctx.bezierCurveTo(x + w - a2 + a2 * K, y, x + w, y + b2 - b2 * K, x + w, y + b2);
  ctx.lineTo(x + w, y + h - b3);
  ctx.bezierCurveTo(x + w, y + h - b3 + b3 * K, x + w - a3 + a3 * K, y + h, x + w - a3, y + h);
  ctx.lineTo(x + a4, y + h);
  ctx.bezierCurveTo(x + a4 - a4 * K, y + h, x, y + h - b4 + b4 * K, x, y + h - b4);
  ctx.lineTo(x, y + b1);
  ctx.bezierCurveTo(x, y + b1 - b1 * K, x + a1 - a1 * K, y, x + a1, y);
  ctx.closePath();
};
SNAP.shrinkR = (r, t, rgt, b, l) => [[r[0][0] - l, r[0][1] - t], [r[1][0] - rgt, r[1][1] - t], [r[2][0] - rgt, r[2][1] - b], [r[3][0] - l, r[3][1] - b]].map(([a, c]) => [Math.max(0, a), Math.max(0, c)]);
SNAP.growR = (r, s) => r.map(([a, b]) => [a > 0 ? a + s : 0, b > 0 ? b + s : 0]);

/* グラデーションの色の位置（px）。位置の無い色は等分、repeating は面全体まで繰り返す */
SNAP.stops = (parts, L, repeating) => {
  const st = parts.map(p => {
    const m = /^(.*\))\s*(.*)$/.exec(p) || /^(\S+)\s*(.*)$/.exec(p);
    const col = m ? m[1] : p, pos = m && m[2] ? m[2].split(/\s+/) : [];
    return { col, pos: pos.map(v => SNAP.len(v, L)) };
  });
  const flat = [];
  st.forEach(s => { if (!s.pos.length) flat.push({ col: s.col, p: null }); else s.pos.forEach(p => flat.push({ col: s.col, p })); });
  if (flat[0].p == null) flat[0].p = 0;
  if (flat[flat.length - 1].p == null) flat[flat.length - 1].p = repeating ? flat[0].p : L;
  for (let i = 1; i < flat.length; i++) {
    if (flat[i].p == null) { let j = i; while (flat[j].p == null) j++; const a = flat[i - 1].p, b = flat[j].p; for (let k = i; k < j; k++) flat[k].p = a + (b - a) * (k - i + 1) / (j - i + 1); i = j; }
    if (flat[i].p < flat[i - 1].p) flat[i].p = flat[i - 1].p;
  }
  if (!repeating) return flat;
  const p0 = flat[0].p, per = flat[flat.length - 1].p - p0;
  if (per <= 0) return flat;
  const out = [];
  for (let k = Math.floor((0 - p0) / per) - 1; p0 + k * per <= L; k++) flat.forEach(s => out.push({ col: s.col, p: s.p + k * per }));
  return out;
};
SNAP.addStops = (g, stops, L) => {
  stops.forEach(s => { const o = Math.min(1, Math.max(0, s.p / L)); try { g.addColorStop(o, s.col); } catch (e) { /* 読めない色は飛ばす */ } });
};

/* 背景の1層（グラデーション）を x,y,w,h に描く。描く範囲は呼び出し側で切り抜き済み */
SNAP.gradient = (ctx, img, x, y, w, h) => {
  const m = /^(repeating-)?(linear|radial)-gradient\((.*)\)$/.exec(img.trim());
  if (!m) return;
  const rep = !!m[1], kind = m[2], parts = SNAP.splitTop(m[3]);
  if (kind === 'linear') {
    let ang = 180;
    if (/^-?[\d.]+(deg|turn|rad)$/.test(parts[0])) { const v = parseFloat(parts[0]); ang = parts[0].endsWith('turn') ? v * 360 : parts[0].endsWith('rad') ? v * 180 / Math.PI : v; parts.shift(); }
    else if (/^to /.test(parts[0])) { const t = parts.shift(); ang = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[t] ?? 180; }
    const a = ang * Math.PI / 180, sx = Math.sin(a), sy = -Math.cos(a);
    const L = Math.abs(w * sx) + Math.abs(h * sy), cx = x + w / 2, cy = y + h / 2;
    const g = ctx.createLinearGradient(cx - sx * L / 2, cy - sy * L / 2, cx + sx * L / 2, cy + sy * L / 2);
    SNAP.addStops(g, SNAP.stops(parts, L, rep), L);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    return;
  }
  // radial：「160% 46% at 28% 125%」「ellipse …」「circle …」のような形だけ扱う
  let rx = w / 2, ry = h / 2, px = w / 2, py = h / 2;
  if (!/^(rgb|#|transparent|hsl)/.test(parts[0])) {
    const shape = parts.shift().replace(/\b(ellipse|circle)\b/g, '').trim();
    const [sz, at] = shape.split(/\s*at\s*/);
    const s = (sz || '').trim().split(/\s+/).filter(Boolean);
    if (s.length >= 1 && !/side|corner/.test(s[0])) { rx = SNAP.len(s[0], w); ry = SNAP.len(s[1] ?? s[0], h); }
    else { rx = Math.hypot(w, h) / Math.SQRT2; ry = rx * h / w; }
    if (at) { const q = at.trim().split(/\s+/); px = SNAP.len(q[0].replace('center', '50%'), w); py = SNAP.len((q[1] || '50%').replace('center', '50%'), h); }
  }
  const R = Math.max(rx, 1), k = (ry || 1) / R;
  const far = Math.hypot(Math.max(px, w - px), Math.max(py, h - py) / k);   // 一番遠い角までの距離（横方向の単位）
  const Lr = rep ? far : R;
  ctx.save();
  ctx.translate(x + px, y + py); ctx.scale(1, k);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Lr);
  SNAP.addStops(g, SNAP.stops(parts, Lr, rep), Lr);
  ctx.fillStyle = g; ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
  ctx.restore();
};

/* 影は Canvas の座標変換の影響を受けないので、要素の向き・倍率に合わせて自分で変換する。
 * 図形は S だけ左にずらして描き、影だけが元の位置に来るようにする（図形そのものは見えない） */
SNAP.S = 20000;
SNAP.shadow = (ctx, col, ox, oy, bl) => {
  const m = ctx.getTransform(), S = SNAP.S;
  ctx.shadowColor = col;
  ctx.shadowOffsetX = m.a * (ox + S) + m.c * oy;
  ctx.shadowOffsetY = m.b * (ox + S) + m.d * oy;
  ctx.shadowBlur = bl * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
};

/* ---------- 計測：transform を外した配置と、各要素の見た目を取っておく ---------- */
SNAP.collect = root => {
  const base = root.getBoundingClientRect();
  const nodes = [];
  const walk = (el, depth) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const r = el.getBoundingClientRect();
    const n = { el, cs, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, kids: [], tag: el.tagName.toLowerCase(), text: [] };
    if (n.tag === 'svg') { n.svg = el; return n; }
    for (const c of el.childNodes) {
      if (c.nodeType === 1) { const k = walk(c, depth + 1); if (k) n.kids.push(k); }
      else if (c.nodeType === 3 && c.data.trim()) n.kids.push({ textNode: c });
    }
    return n;
  };
  return walk(root, 0);
};
// 文字は1文字ずつ位置を取る（字間・中央寄せ・折り返しをブラウザの配置どおりに再現するため）
SNAP.textRuns = (tn, base) => {
  const out = [], s = tn.data, rg = document.createRange();
  let i = 0;
  for (const ch of s) {
    const n = ch.length;
    if (!/\s/.test(ch)) {
      rg.setStart(tn, i); rg.setEnd(tn, i + n);
      const rs = rg.getClientRects();
      if (rs.length) { const r = rs[0]; if (r.width > 0) out.push({ ch, x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }); }
    }
    i += n;
  }
  return out;
};

/* ---------- 画像の読み込み ---------- */
SNAP.cache = new Map();
SNAP.image = src => {
  if (SNAP.cache.has(src)) return SNAP.cache.get(src);
  const p = new Promise(res => { const im = new Image(); im.decoding = 'sync'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  SNAP.cache.set(src, p); return p;
};
SNAP.svgImage = svg => {
  const c = svg.cloneNode(true);
  c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const r = svg.getBoundingClientRect();
  if (!c.getAttribute('width')) c.setAttribute('width', r.width);
  if (!c.getAttribute('height')) c.setAttribute('height', r.height);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c));
  return SNAP.image(url);
};
SNAP.urlOf = s => { const m = /url\(["']?([^"')]+)["']?\)/.exec(s || ''); return m ? m[1] : null; };

/* ---------- 描画 ---------- */
SNAP.draw = async (ctx, n, alpha) => {
  if (n.textNode) return;
  const cs = n.cs;
  if (cs.visibility === 'hidden' && !n.kids.length) return;
  const op = parseFloat(cs.opacity);
  if (op <= 0.001) return;
  const a = alpha * op;
  const { x, y, w, h } = n;
  ctx.save();
  // transform（計測は transform なしで取っているので、ここで掛ける）
  if (n.tf) {
    const [ox, oy] = n.origin;
    ctx.translate(x + ox, y + oy); ctx.transform(...n.tf); ctx.translate(-(x + ox), -(y + oy));
  }
  // filter: drop-shadow はこの要素以下を別の Canvas に描いてから影付きで重ねる
  const ds = /drop-shadow\((.+?)\s(-?[\d.]+)px\s(-?[\d.]+)px\s([\d.]+)px\)/.exec(cs.filter || '');
  let target = ctx, layer = null;
  if (ds) {
    layer = document.createElement('canvas'); layer.width = ctx.canvas.width; layer.height = ctx.canvas.height;
    target = layer.getContext('2d'); target.setTransform(ctx.getTransform());
  }
  const t = target;
  t.globalAlpha = a;
  const rad = SNAP.radii(cs, w, h);
  const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width']) || 0);
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  sides.forEach((sd, i) => { if (cs['border' + sd + 'Style'] === 'none' || SNAP.alpha(cs['border' + sd + 'Color']) <= 0) bw[i] = 0; });
  const hasBorder = bw.some(v => v > 0);
  // 外側の box-shadow
  if (cs.boxShadow && cs.boxShadow !== 'none') {
    SNAP.splitTop(cs.boxShadow).reverse().forEach(sh => {
      const inset = /\binset\b/.test(sh);
      const col = (/(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(sh) || [])[1] || 'rgba(0,0,0,.5)';
      const nums = sh.replace(/(rgba?\([^)]*\)|#[0-9a-f]+|inset)/gi, '').trim().split(/\s+/).map(parseFloat);
      const [ox = 0, oy = 0, bl = 0, sp = 0] = nums;
      if (inset) { n.insets = (n.insets || []).concat([{ col, ox, oy, bl, sp }]); return; }
      t.save();
      t.beginPath(); t.rect(x - 4000, y - 4000, w + 8000, h + 8000); SNAP.rrPath(t, x, y, w, h, rad); t.clip('evenodd');
      SNAP.shadow(t, col, ox, oy, bl);
      t.beginPath(); SNAP.rrPath(t, x - sp - SNAP.S, y - sp, w + sp * 2, h + sp * 2, SNAP.growR(rad, sp)); t.fillStyle = '#000'; t.fill();
      t.restore();
    });
  }
  // 背景（色→画像の層を下から）
  const layers = cs.backgroundImage && cs.backgroundImage !== 'none' ? SNAP.splitTop(cs.backgroundImage) : [];
  if (SNAP.alpha(cs.backgroundColor) > 0 || layers.length) {
    t.save(); t.beginPath(); SNAP.rrPath(t, x, y, w, h, rad); t.clip();
    if (SNAP.alpha(cs.backgroundColor) > 0) { t.fillStyle = cs.backgroundColor; t.fillRect(x, y, w, h); }
    const sizes = SNAP.splitTop(cs.backgroundSize || 'auto'), poss = SNAP.splitTop(cs.backgroundPosition || '0% 0%');
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (/gradient\(/.test(L)) { SNAP.gradient(t, L, x, y, w, h); continue; }
      const src = SNAP.urlOf(L); if (!src) continue;
      const im = await SNAP.image(src); if (!im) continue;
      const iw = im.naturalWidth || w, ih = im.naturalHeight || h, sz = (sizes[i] || sizes[0] || 'auto').trim();
      let dw = iw, dh = ih;
      if (sz === 'contain' || sz === 'cover') { const k = (sz === 'contain' ? Math.min : Math.max)(w / iw, h / ih); dw = iw * k; dh = ih * k; }
      else if (sz !== 'auto') { const q = sz.split(/\s+/); dw = q[0] === 'auto' ? null : SNAP.len(q[0], w); dh = (q[1] || 'auto') === 'auto' ? null : SNAP.len(q[1], h); if (dw == null) dw = dh * iw / ih; if (dh == null) dh = dw * ih / iw; }
      const pp = (poss[i] || poss[0] || '0% 0%').split(/\s+/);
      const px = pp[0].endsWith('%') ? (w - dw) * parseFloat(pp[0]) / 100 : SNAP.len(pp[0], w);
      const py = (pp[1] || '50%').endsWith('%') ? (h - dh) * parseFloat(pp[1] || 50) / 100 : SNAP.len(pp[1], h);
      t.drawImage(im, x + px, y + py, dw, dh);
    }
    t.restore();
  }
  // 枠線（色は上辺の色でまとめて描く）
  if (hasBorder) {
    const cols = sides.map(sd => cs['border' + sd + 'Color']);
    if (bw.every(v => v > 0) && cols.every(c => c === cols[0])) {   // 4辺同じ：角丸の輪で描く
      t.beginPath(); SNAP.rrPath(t, x, y, w, h, rad);
      SNAP.rrPath(t, x + bw[3], y + bw[0], w - bw[1] - bw[3], h - bw[0] - bw[2], SNAP.shrinkR(rad, bw[0], bw[1], bw[2], bw[3]));
      t.fillStyle = cols[0]; t.fill('evenodd');
    } else {                                                         // 一部の辺だけ：辺ごとに長方形で描く
      if (bw[0]) { t.fillStyle = cols[0]; t.fillRect(x, y, w, bw[0]); }
      if (bw[1]) { t.fillStyle = cols[1]; t.fillRect(x + w - bw[1], y, bw[1], h); }
      if (bw[2]) { t.fillStyle = cols[2]; t.fillRect(x, y + h - bw[2], w, bw[2]); }
      if (bw[3]) { t.fillStyle = cols[3]; t.fillRect(x, y, bw[3], h); }
    }
  }
  // inset の box-shadow（ぼかし無しの縁取りだけ）
  (n.insets || []).forEach(s => {
    if (s.bl > 0 || !s.sp) return;
    const ix = x + bw[3], iy = y + bw[0], iw = w - bw[1] - bw[3], ih = h - bw[0] - bw[2], ir = SNAP.shrinkR(rad, bw[0], bw[1], bw[2], bw[3]);
    t.beginPath(); SNAP.rrPath(t, ix, iy, iw, ih, ir); SNAP.rrPath(t, ix + s.sp, iy + s.sp, iw - 2 * s.sp, ih - 2 * s.sp, SNAP.shrinkR(ir, s.sp, s.sp, s.sp, s.sp));
    t.fillStyle = s.col; t.fill('evenodd');
  });
  // 中身
  if (n.tag === 'img' && n.el.complete && n.el.naturalWidth) {
    const im = await SNAP.image(n.el.currentSrc || n.el.src);
    if (im) t.drawImage(im, x + bw[3] + (parseFloat(cs.paddingLeft) || 0), y + bw[0] + (parseFloat(cs.paddingTop) || 0),
      w - bw[1] - bw[3] - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0), h - bw[0] - bw[2] - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0));
  }
  if (n.svg) { const im = await SNAP.svgImage(n.svg); if (im) t.drawImage(im, x, y, w, h); }
  // はみ出しの切り抜き
  if (/hidden|clip/.test(cs.overflow) && n.tag !== 'svg') {
    t.beginPath(); SNAP.rrPath(t, x + bw[3], y + bw[0], w - bw[1] - bw[3], h - bw[0] - bw[2], SNAP.shrinkR(rad, bw[0], bw[1], bw[2], bw[3])); t.clip();
  }
  for (const k of n.kids) {
    if (k.textNode) SNAP.drawText(t, k, a, cs);
    else await SNAP.draw(t, k, a);
  }
  if (layer) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    ctx.shadowColor = ds[1]; ctx.shadowOffsetX = parseFloat(ds[2]); ctx.shadowOffsetY = parseFloat(ds[3]); ctx.shadowBlur = parseFloat(ds[4]);
    ctx.drawImage(layer, 0, 0); ctx.restore();
  }
  ctx.restore();
};
SNAP.drawText = (ctx, k, alpha, cs) => {
  if (!k.runs || !k.runs.length || SNAP.alpha(cs.color) <= 0 || cs.visibility === 'hidden') return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.textBaseline = 'alphabetic';
  const shadows = cs.textShadow && cs.textShadow !== 'none' ? SNAP.splitTop(cs.textShadow).reverse().map(sh => {
    const col = (/(rgba?\([^)]*\)|#[0-9a-f]+)/i.exec(sh) || [])[1] || cs.color;
    const [ox = 0, oy = 0, bl = 0] = sh.replace(/(rgba?\([^)]*\)|#[0-9a-f]+)/gi, '').trim().split(/\s+/).map(parseFloat);
    return { col, ox, oy, bl };
  }) : [];
  for (const r of k.runs) {
    const m = ctx.measureText(r.ch);
    const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent, desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
    // 文字の箱の中で上下中央に置く（ブラウザの行内の配置と同じ考え方）
    const by = r.y + (r.h - (asc + desc)) / 2 + asc;
    const bx = r.x + (r.w - m.width) / 2;
    for (const s of shadows) {
      ctx.save(); SNAP.shadow(ctx, s.col, s.ox, s.oy, s.bl);
      ctx.fillStyle = '#000'; ctx.fillText(r.ch, bx - SNAP.S, by); ctx.restore();
    }
    ctx.fillStyle = cs.color; ctx.fillText(r.ch, bx, by);
  }
  ctx.restore();
};

/**
 * ステージ（1920×1080 の要素）を Canvas に描く。
 *  アニメーションを止め、transform を外した状態で位置を測り、元に戻してから描く。
 */
SNAP.render = async (stage, W = 1920, H = 1080) => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await Promise.all([...stage.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => {}) : null));
  stage.classList.add('snap-still');
  // transform と原点（transform を掛けた状態で取る）
  const tfs = new Map();
  for (const el of [stage, ...stage.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (el !== stage && cs.transform && cs.transform !== 'none') {
      const m = /matrix\(([^)]+)\)/.exec(cs.transform);
      if (m) { const v = m[1].split(',').map(parseFloat); tfs.set(el, { tf: v, origin: cs.transformOrigin.split(' ').map(parseFloat) }); }
    }
  }
  stage.classList.add('snap-measure');
  const tree = SNAP.collect(stage);
  const base = stage.getBoundingClientRect();
  const fill = n => {
    if (n.textNode) { n.runs = SNAP.textRuns(n.textNode, base); return; }
    const t = tfs.get(n.el); if (t) { n.tf = t.tf; n.origin = t.origin; }
    n.kids.forEach(fill);
  };
  fill(tree);
  stage.classList.remove('snap-measure');
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  await SNAP.draw(ctx, tree, 1);
  stage.classList.remove('snap-still');
  return cv;
};
SNAP.blob = (cv, type, q) => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('画像にできませんでした')), type, q));
