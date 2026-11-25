/* 太鼓スコア記録：段位の進捗画像（試作：1920×1080 の画面を組み立ててプレビューする） */
'use strict';

/** 進捗画像の文字（曲名・★・ノーツ数・バージョン・目標：）のフォント。user はアップロードしたフォント（その場限り） */
const DIMG_FONTS = {
  brush: { name: '筆（標準）', css: "DimgLatin,'Yuji Syuku',DanBrush,serif", fw: 400, gf: 'Yuji+Syuku' },
  mincho: { name: '明朝（Zen Antique Soft）', css: "'Zen Antique Soft',serif", fw: 400, gf: 'Zen+Antique+Soft' },
  gothic: { name: 'ゴシック（IBM Plex Sans JP）', css: "'IBM Plex Sans JP',system-ui,sans-serif", fw: 700, gf: 'IBM+Plex+Sans+JP:wght@700' },
  user: { name: '自分のフォント', css: "DimgUser,DimgLatin,'Yuji Syuku',serif", fw: 400 },
};
let dimgUserFont = null;
const dimgFontOpts = cur => Object.entries(DIMG_FONTS).filter(([k]) => k !== 'user' || dimgUserFont)
  .map(([k, f]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${k === 'user' ? '自分のフォント（' + esc(dimgUserFont) + '）' : f.name}</option>`).join('')
  + '<option value="pick">フォントファイルを読み込む…</option>';   // 読み込んだフォントの名前（ページを閉じるまで）
function dimgLoadGF(key) {
  const f = DIMG_FONTS[key];
  if (!f || !f.gf || document.querySelector(`link[data-dimgf="${key}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.dataset.dimgf = key;
  l.href = `https://fonts.googleapis.com/css2?family=${f.gf}&display=block`;
  document.head.appendChild(l);
}
const DIMG_TYPES = [['red', 'silver'], ['red', 'gold'], ['red', 'rainbow'], ['gold', 'silver'], ['gold', 'gold'], ['gold', 'rainbow']];
/** 背景：達人＝金、玄人〜超人＝銀、十段以下＝青（外伝＝翠は段位の種類が増えたら使う） */
/** 目標の表記：赤合格／金合格 ＋ 枠（銀＝合格、金＝フルコンボ、虹＝全良） */
const dimgLabel = t => (t.res === 'gold' ? '金合格' : '赤合格') + ({ gold: '・フルコンボ', rainbow: '・全良' }[t.frame] || '');
const dimgBg = d => d.gaiden ? 'gaiden' : d.rank >= 18 ? 'gold' : d.rank >= 15 ? 'silver' : 'normal';

/** 目標の合格の種類：赤／金は選択中のもの。目標の不可がすべて0ならフルコンボ、可・不可がすべて0なら全良 */
function dimgAutoType(I) {
  const res = (danSt.mode[I.d.id] || 'red') === 'gold' ? 'gold' : 'red';
  const tg = t => { const k = I.items.findIndex(it => it.type === t); return k < 0 ? null : I.tgs[k]; };
  const zero = a => !!a && a.every(v => v === 0);
  const good = tg('good'), allGood = !!good && I.charts.every((s, i) => s && s.maxCombo && good[i] === s.maxCombo);
  const frame = (zero(tg('bad')) && zero(tg('ok'))) || allGood ? 'rainbow' : zero(tg('bad')) ? 'gold' : 'silver';
  return { res, frame };
}

function dimgStageHtml(I, type) {
  const { d, charts, picks, items, tgs } = I;
  const tOf = (t, i) => { const k = items.findIndex(it => it.type === t); return k < 0 ? null : tgs[k][i]; };
  const songs = charts.map((s, i) => {
    const plays = s ? thPlays(s.id) : [], r = picks[i];
    let bs = null; plays.forEach(p => { if (p.score != null && (!bs || p.score > bs.score)) bs = p; });
    const box = (t, lb) => {
      const v = r ? r[t] : null, tg = tOf(t, i), lt = t !== 'good';
      const m = v == null || tg == null ? null : lt ? tg - v : v - tg;
      return `<div class="dib j${t}"><span class="dil">${lb}</span><b>${v == null ? '—' : v}</b>
        ${tg == null ? '<i></i>' : `<i>目標 ${tg}${m == null ? '' : m >= 0 ? ` <em class="ok">＋${m}</em>` : ` <em class="ng">あと${-m}</em>`}</i>`}</div>`;
    };
    return `<div class="dis t${i + 1}"><span class="disb"></span>
      <div class="dih"><span class="dino">${i + 1}曲目</span>${s ? cicon(s.course) : ''}<span class="dint">${esc(s ? s.title : '—')}</span>
        <span class="dime"><span class="dist">★${s && s.level != null ? s.level : '—'}</span><span class="dinn">${s && s.maxCombo ? s.maxCombo + 'ノーツ' : ''}</span></span></div>
      <div class="dir">${box('good', '良')}${box('ok', '可')}${box('bad', '不可')}
        <div class="dib dibest"><span class="dil">ベスト<small>（プレイ ${plays.length.toLocaleString()}回）</small></span><b>${bs ? crownHtml(crownOf(bs, s)) + bs.score : '—'}</b><i></i></div></div>
    </div>`;
  }).join('');
  // 3曲合計：曲別理論値の良・可・不可を足しただけの値（目標は出さない）と、3曲のプレイ回数の合計
  const sum = arr => arr.every(v => v != null) ? arr.reduce((a, b) => a + b, 0) : null;
  const totBox = (t, lb) => {
    const v = sum(picks.map(r => r ? r[t] : null));
    return `<div class="dtb j${t}"><span class="dil">${lb}</span><b>${v == null ? '—' : v}</b></div>`;
  };
  const nPlays = charts.reduce((a, s) => a + (s ? thPlays(s.id).length : 0), 0);
  const tot = `<div class="dis dtot"><span class="disb"></span><span class="dtl">3曲<br>合計</span>
    <div class="dtrow">${totBox('good', '良')}${totBox('ok', '可')}${totBox('bad', '不可')}<div class="dtb dtp"><span class="dil">総プレイ</span><b>${nPlays.toLocaleString()}</b><i>回</i></div></div></div>`;
  // 右：理論値のゲージをまとめて、その下に段位内ベストのゲージをまとめる
  const gs = (list, key) => list.map((c, k) => c ? `<div class="dgw"><div class="dg" data-g="${key}${k}"></div></div>` : '').join('');
  const conds = I.th.length ? `<div class="dic"><div class="dict th">理論値<small>各曲の最高値の組み合わせ</small></div>${gs(I.th, 'th')}</div>
      ${I.be.length ? `<div class="dic"><div class="dict be">段位内ベスト<small>挑戦1回での最高</small></div>${gs(I.be, 'be')}</div>` : ''}` : '';
  // 挑戦回数は左に固定、その右に到達の流れ
  const [f0, ...fr] = I.fRows;
  const fun = `<span class="dif dif0"><small>${f0[0]}</small><span><b>${f0[1].toLocaleString()}</b>回</span></span>`
    + fr.map(([nm, n], k) => `${k ? '<span class="difa">›</span>' : ''}<span class="dif"><small>${nm}</small><b>${n.toLocaleString()}</b>回</span>`).join('');
  const who = db.player.id ? `<div class="dipn">${esc(db.player.name || db.player.id)}</div><div class="dipi">@${esc(db.player.id)}</div>` : '';
  return `<img class="dibg" src="img/bg/dan_${dimgBg(d)}.webp" alt="">
    <div class="diplate wood ${danClass(d.rank)}"><span class="wt">${esc(d.name)}</span><span class="dipv">${esc(d.version)}</span>
      <div class="dipm">${who}</div>
      <div class="dipt">目標：</div>
      <div class="dipe">${danEmblemSvg(type.res, type.frame, 190)}</div></div>
    <div class="disub">良・可・不可＝曲別理論値（${esc(TH_SRC[danSt.thSrc])}）　ベスト＝曲別ベストスコア</div>
    <div class="disongs">${songs}${tot}</div>
    <div class="diconds">${conds || '<div class="dinone">魂ゲージ以外の条件がない段位です</div>'}</div>
    <div class="difun">${I.recs.length ? fun : '<span class="dif dif0"><small>挑戦</small><span><b>0</b>回</span></span><span class="dif">まだ挑戦の記録がありません</span>'}<span class="dicr"><b>${(n => `${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()}`)(new Date())} 時点</b>太鼓スコア記録</span></div>`;
}

function openDanImg(I) {
  let type = dimgAutoType(I);
  let font = 'brush';
  try { const v = localStorage.getItem('taikoScore.dimgFont'); if (DIMG_FONTS[v] && v !== 'user') font = v; } catch (e) { /* 使えなくても標準で表示 */ }
  if (font === 'brush' && dimgUserFont) font = 'user';
  const ov = document.createElement('div');
  ov.className = 'dimg-ov';
  ov.innerHTML = `<div class="dimg-bar"><div class="dimg-row"><label>目標 <select id="dimgT">${DIMG_TYPES.map(([r, f]) => `<option value="${r}|${f}"${r === type.res && f === type.frame ? ' selected' : ''}>${dimgLabel({ res: r, frame: f })}</option>`).join('')}</select></label>
    <label>文字 <select id="dimgF">${dimgFontOpts(font)}</select></label></div>
    <input type="file" id="dimgFile" accept=".ttf,.otf,.woff,.woff2,font/*" hidden>
    <div class="dimg-row"><button class="btn small" id="dimgSave" disabled>保存</button><button class="btn small" id="dimgShare" disabled>共有</button><button class="btn sub small" id="dimgX">閉じる</button></div>
    <span class="dimg-msg muted" id="dimgMsg"></span></div>
    <div class="dimg-fit"><div class="dimg" id="dimgStage"></div></div>`;
  document.body.appendChild(ov);
  const draw = () => {
    const st = ov.querySelector('#dimgStage');
    st.innerHTML = dimgStageHtml(I, type);
    const F = DIMG_FONTS[font]; dimgLoadGF(font); if (font === 'brush') dimgLoadGF('brush');
    st.style.setProperty('--dimg-font', F.css); st.style.setProperty('--dimg-fw', F.fw);
    st.querySelectorAll('[data-g]').forEach(el => { const k = el.dataset.g, cfg = (k[0] === 't' ? I.th : I.be)[+k.slice(2)]; new DgGauge(el).set(cfg); });
    fit();
    // 長い曲名は文字を小さくして1行に収める
    const fitTitles = () => st.querySelectorAll('.dint').forEach(el => { let fs = 48; el.style.fontSize = ''; while (el.scrollWidth > el.clientWidth + 1 && fs > 26) { fs -= 2; el.style.fontSize = fs + 'px'; } });
    fitTitles();
    if (document.fonts) {
      const fams = F.css.split(',').map(x => x.trim()).filter(x => !/^(serif|sans-serif|system-ui)$/.test(x));
      Promise.all(fams.map(f => document.fonts.load(`${F.fw} 48px ${f}`, st.textContent).catch(() => {}))).then(() => { fitTitles(); prepare(); });
    } else prepare();
  };
  // 画像は先に作っておく（ボタンを押した瞬間に共有・コピーしないと、ブラウザに止められるため）
  let out = null, seq = 0;
  const bSave = ov.querySelector('#dimgSave'), bShare = ov.querySelector('#dimgShare'), msg = ov.querySelector('#dimgMsg');
  const setReady = ok => { bSave.disabled = bShare.disabled = !ok; bSave.textContent = ok ? '保存' : '準備中…'; };
  const prepare = () => {
    const my = ++seq; out = null; setReady(false); msg.textContent = '';
    clearTimeout(prepare._t);
    prepare._t = setTimeout(async () => {
      try {
        const cv = await SNAP.render(ov.querySelector('#dimgStage'));
        const png = await SNAP.blob(cv, 'image/png'), jpg = await SNAP.blob(cv, 'image/jpeg', 0.92);
        if (my !== seq || !ov.isConnected) return;
        const fn = dimgFileName(I.d);
        out = { png, jpg, pngFile: new File([png], fn + '.png', { type: 'image/png' }), jpgFile: new File([jpg], fn + '.jpg', { type: 'image/jpeg' }) };
        setReady(true);
      } catch (e) { if (my === seq) { msg.textContent = '画像を作れませんでした：' + (e.message || e); bSave.textContent = '保存'; } }
    }, 250);
  };
  bSave.onclick = () => { if (out) dimgSave(out, msg); };
  bShare.onclick = () => { if (out) dimgShare(out, I, msg); };
  const fit = () => {
    const box = ov.querySelector('.dimg-fit'), st = ov.querySelector('#dimgStage');
    const s = Math.min(box.clientWidth / 1920, box.clientHeight / 1080);
    st.style.transform = `scale(${s})`; st.parentElement.style.setProperty('--dw', 1920 * s + 'px'); st.parentElement.style.setProperty('--dh', 1080 * s + 'px');
  };
  ov.querySelector('#dimgT').onchange = e => { const [r, f] = e.target.value.split('|'); type = { res: r, frame: f }; draw(); };
  const fsel = ov.querySelector('#dimgF'), ffile = ov.querySelector('#dimgFile');
  fsel.onchange = () => {
    if (fsel.value === 'pick') { fsel.value = font; ffile.click(); return; }
    font = fsel.value;
    try { localStorage.setItem('taikoScore.dimgFont', font); } catch (e) { /* 保存できなくても続ける */ }
    draw();
  };
  // フォントファイルはこの端末の中だけで使い、どこにも送らない
  ffile.onchange = async () => {
    const f = ffile.files[0]; ffile.value = '';
    if (!f) return;
    try {
      const face = new FontFace('DimgUser', await f.arrayBuffer());
      await face.load();
      [...document.fonts].filter(x => x.family.replace(/["']/g, '') === 'DimgUser').forEach(x => document.fonts.delete(x));
      document.fonts.add(face);
      dimgUserFont = f.name.replace(/\.[^.]+$/, '');
      font = 'user';
      fsel.innerHTML = dimgFontOpts('user');
      draw();
    } catch (e) { toast('このファイルはフォントとして読み込めませんでした'); }
  };
  ov.querySelector('#dimgX').onclick = () => { seq++; ov.remove(); window.removeEventListener('resize', fit); };
  window.addEventListener('resize', fit);
  draw();
}

/* ---------- 保存・共有 ---------- */
const dimgUA = navigator.userAgent;
const dimgIOS = /iPhone|iPad|iPod/.test(dimgUA) || (/Macintosh/.test(dimgUA) && navigator.maxTouchPoints > 1);
const dimgMobile = dimgIOS || /Android|Mobile/.test(dimgUA);
/** ファイル名：taiko_<バージョン名><段位>_日付（別バージョンの同じ段位と区別できるように） */
function dimgFileName(d) {
  const n = new Date(), p = v => String(v).padStart(2, '0');
  return `taiko_${d.version || ''}${d.name}_${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`.replace(/[\\/:*?"<>|\s]+/g, '');
}
const dimgShareText = d => `${db.player.name || db.player.id || ''}さんの${d.version || ''}${d.name}　進捗`;
const dimgCanShare = data => { try { return !!(navigator.canShare && navigator.canShare(data)); } catch (e) { return false; } };
function dimgDownload(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
/** 長押しで保存できるように画像を大きく出す（共有メニューが使えない iPhone 用） */
function dimgShowImage(blob, note) {
  const m = document.createElement('div');
  m.className = 'modal';
  const url = URL.createObjectURL(blob);
  m.innerHTML = `<div class="card" style="max-width:96vw"><p class="muted" style="margin:0 0 8px">${esc(note)}</p><img src="${url}" alt="進捗画像" style="width:100%;border-radius:6px"><button class="btn sub" style="margin-top:8px">閉じる</button></div>`;
  m.querySelector('button').onclick = () => { m.remove(); URL.revokeObjectURL(url); };
  document.body.appendChild(m);
}
function dimgSave(out, msg) {
  // iPhone：ダウンロードだと「ファイル」に入るので、共有メニューの「画像を保存」で写真に入れてもらう
  if (dimgIOS) {
    if (dimgCanShare({ files: [out.pngFile] })) {
      navigator.share({ files: [out.pngFile] }).then(() => { msg.textContent = ''; }, e => { if (e.name !== 'AbortError') dimgShowImage(out.png, '画像を長押しして「写真に保存」を選んでください'); });
      msg.textContent = '「画像を保存」を選ぶと写真に入ります';
    } else dimgShowImage(out.png, '画像を長押しして「写真に保存」を選んでください');
    return;
  }
  dimgDownload(out.pngFile);
  msg.textContent = `${out.pngFile.name} を保存しました`;
}
function dimgShare(out, I, msg) {
  const text = dimgShareText(I.d);
  // スマホ：端末の共有メニューを画像と文面付きで開く（X を選ぶと投稿画面に入る）
  if (dimgMobile && dimgCanShare({ files: [out.jpgFile], text })) {
    navigator.share({ files: [out.jpgFile], text }).catch(e => { if (e.name !== 'AbortError') msg.textContent = '共有できませんでした：' + e.message; });
    return;
  }
  // PC：画像をクリップボードに入れてから、文面入りの X の投稿画面を開く（画像は Ctrl+V で貼る）
  //  先に新しいタブを開くとこの画面が裏に回り、コピーが断られるので、コピーが終わってから開く
  const url = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
  const open = note => {
    const w = window.open(url, '_blank');
    if (w) { w.opener = null; msg.textContent = note; return; }
    msg.innerHTML = `${esc(note)} <a href="${url}" target="_blank" rel="noopener">X の投稿画面を開く</a>`;
  };
  const paste = /Mac/.test(dimgUA) ? '⌘+V' : 'Ctrl+V';
  const fallback = () => { dimgDownload(out.pngFile); open(`画像（${out.pngFile.name}）を保存しました。X の投稿画面で画像を添付してください`); };
  try {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': out.png })])
      .then(() => open(`画像をコピーしました。X の投稿画面で ${paste} を押すと画像が付きます`), fallback);
  } catch (e) { fallback(); }
}
