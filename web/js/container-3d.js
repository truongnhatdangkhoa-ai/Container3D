/* container-3d.js — JS RIÊNG của công cụ "Container Loading 3D" (M14). Gồm 4 phần theo thứ tự nạp:
   (1) LÕI thuật toán xếp hàng (trước là js/c3d-engine.js, không DOM)  (2) DỰNG 3D bằng Three.js (trước là js/c3d-view.js)
   (3) GIAO DIỆN + LƯU TRỮ (trước là js/container-3d.js)  (4) chú thích nhanh data-tip (trước là js/tip-nhanh.js).
   Bản điện thoại (ban-dien-thoai/www/c3d-engine.js, c3d-view.js) là BẢN CHÉP RIÊNG, không đổi theo file này. */

/* ===================== (1) LÕI — c3d-engine ===================== */
/* MODULE "CONTAINER LOADING 3D" — LÕI THUẬT TOÁN XẾP HÀNG (PC 8.57, 10/2026). KHÔNG đụng DOM → chạy được trong Node để kiểm thử.
   Hệ toạ độ (mm): x = dọc cont, 0 ở VÁCH ĐẦU (phía máy lạnh) → L ở CỬA · y = ngang cont (0 = vách PHẢI khi đứng ở cửa nhìn vào, tăng dần sang trái) · z = cao (0 = sàn).
   Cách làm (xếp theo "vách" từ trong ra ngoài, giống cách công nhân đóng hàng thật):
   1. Mỗi dòng hàng (mã hàng · size · ngày) là 1 NHÓM, sắp theo mã hàng > size > ngày. Nhóm đầu vào SÂU NHẤT (sát vách đầu), nhóm cuối sát cửa.
   2. Mỗi nhóm được xếp thành các VÁCH liên tiếp (vách = 1 lát cắt ngang cont, từ sàn lên đường red line). Thử mọi hướng đặt hợp lệ
      (dựng / nằm / xoay), kiểu cột thẳng, kiểu trộn cột cùng chiều sâu, kiểu SOLE (tầng lẻ xoay 90° so với tầng chẵn) rồi chọn phương án
      xếp được nhiều nhất / tốn ít chiều dài cont nhất.
   3. Mọi thùng đều có số thứ tự đóng (seq). Sau khi xếp, hàm verify() KIỂM LẠI độc lập: nằm trong cont, không chồng nhau, không vượt red line,
      mỗi thùng được đỡ đủ bên dưới (và thùng đỡ phải được đóng TRƯỚC), và không thùng nào bị thùng đóng trước chắn đường trượt từ cửa vào.
   4. Tải trọng: nhóm nào quá tải thì giảm số thùng; báo số thùng rớt lại kho + lý do. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.C3DEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EPS = 1e-6;
  const MIN_SAMPLE = 10; // số thùng mẫu hải quan tối thiểu cho mỗi dòng (mã · size · ngày) — hệ thống tự chia đều, người dùng không nhập

  // ---------------------------------------------------------------- danh sách container lạnh mẫu (THAM KHẢO — sửa theo cont thực tế)
  const PRESETS = [
    { id: 'rf20', name: "Cont lạnh 20' RF", type: '20RF', L: 5450, W: 2290, H: 2270, doorW: 2290, doorH: 2260, maxPayload: 27400, redLine: 2170, clearFront: 50, clearRear: 50, clearSide: 10, note: 'Thông số tham khảo hãng tàu — kiểm tra lại cont thực tế.' },
    { id: 'rf40', name: "Cont lạnh 40' RF (thấp)", type: '40RF', L: 11560, W: 2290, H: 2250, doorW: 2290, doorH: 2180, maxPayload: 29000, redLine: 2150, clearFront: 50, clearRear: 50, clearSide: 10, note: 'Thông số tham khảo hãng tàu — kiểm tra lại cont thực tế.' },
    { id: 'rf40hc', name: "Cont lạnh 40' HC RF (cao)", type: '40HC', L: 11560, W: 2290, H: 2550, doorW: 2290, doorH: 2500, maxPayload: 29500, redLine: 2450, clearFront: 50, clearRear: 50, clearSide: 10, note: 'Thông số tham khảo hãng tàu — kiểm tra lại cont thực tế.' },
  ];

  // ---------------------------------------------------------------- tiện ích
  const num = (v, d) => { const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : (d || 0); };
  const flag = (v, d) => (v === undefined || v === null || v === '' ? d : (v === true || v === 1 || v === '1' || v === 'true'));
  const natKey = (s) => String(s == null ? '' : s).toLowerCase().match(/\d+|\D+/g) || [];
  function natCmp(a, b) {
    const A = natKey(a), B = natKey(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = A[i], y = B[i];
      if (x === undefined) return -1; if (y === undefined) return 1;
      const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
      if (nx && ny) { const d = parseInt(x, 10) - parseInt(y, 10); if (d) return d; } else if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }
  // ngày dd/mm/yyyy · dd-mm-yyyy · dd.mm.yyyy · yyyy-mm-dd · dd/mm (không năm → năm hiện tại). Không đọc được → NaN.
  function dateVal(s) {
    const t = String(s == null ? '' : s).trim(); if (!t) return NaN;
    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return Date.UTC(y, +m[2] - 1, +m[1]); }
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/);
    if (m) return Date.UTC(new Date().getFullYear(), +m[2] - 1, +m[1]);
    return NaN;
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  // Hướng đặt do người dùng chọn: 3 chữ = (dọc cont, ngang cont, đứng) lấy từ Dài (L) / Rộng (W) / Cao (H) của thùng
  const PERMS = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'];

  // ---------------------------------------------------------------- chuẩn hoá đầu vào
  function normContainer(c) {
    c = c || {};
    const L = num(c.L), W = num(c.W), H = num(c.H);
    const o = {
      id: String(c.id || ''), name: String(c.name || ''), type: String(c.type || ''), L, W, H,
      doorW: num(c.doorW, W) || W, doorH: num(c.doorH, H) || H,
      maxPayload: num(c.maxPayload), redLine: num(c.redLine), clearFront: Math.max(0, num(c.clearFront)), clearRear: Math.max(0, num(c.clearRear)), clearSide: Math.max(0, num(c.clearSide)),
      note: String(c.note || ''),
    };
    return o;
  }
  function makeSpace(c) {
    const red = c.redLine > 0 ? c.redLine : c.H;
    const effH = Math.min(c.H, red, c.doorH > 0 ? c.doorH : c.H);
    const x0 = c.clearFront, x1 = c.L - c.clearRear, y0 = c.clearSide, y1 = c.W - c.clearSide;
    return { x0, x1, y0, y1, Lu: x1 - x0, Wu: y1 - y0, effH, red, L: c.L, W: c.W, H: c.H };
  }
  function normSku(s, i) {
    s = s || {};
    const o = {
      id: String(s.id || ('s' + i)), code: String(s.code == null ? '' : s.code).trim(), name: String(s.name || '').trim(), size: String(s.size == null ? '' : s.size).trim(), date: String(s.date == null ? '' : s.date).trim(),
      qty: Math.max(0, Math.floor(num(s.qty))), L: num(s.L), W: num(s.W), H: num(s.H), kg: Math.max(0, num(s.kg)),
      allowRotate: flag(s.allowRotate, true), allowStand: flag(s.allowStand, true), allowLay: flag(s.allowLay, false), sole: flag(s.sole, false),
      maxLayers: Math.max(0, Math.floor(num(s.maxLayers))), orient: PERMS.includes(s.orient) ? s.orient : '', rowPlan: String(s.rowPlan || '').trim(), rowSet: (s.rowSet && typeof s.rowSet === 'object') ? s.rowSet : {}, note: String(s.note || ''), color: String(s.color || ''), _idx: i,
    };
    if (!o.allowStand && !o.allowLay) o.allowStand = true; // không chọn gì → mặc định dựng đứng
    return o;
  }

  // ---------------------------------------------------------------- hướng đặt hợp lệ của 1 loại thùng
  // dx = theo chiều DÀI cont, dy = theo chiều NGANG cont, dz = chiều CAO. L (dài) mặc định nằm dọc cont khi KHÔNG cho xoay.
  function orientationsOf(k, sp) {
    if (k.orient) { // người dùng đã chốt hướng đặt → chỉ dùng đúng hướng đó
      const m = { L: k.L, W: k.W, H: k.H }, p = k.orient.split(''), o = { dx: m[p[0]], dy: m[p[1]], dz: m[p[2]], kind: p[2] === 'H' ? 'dung' : 'nam', rot: ['WLH', 'HLW', 'HWL'].includes(k.orient) ? 1 : 0 };
      return (o.dx <= sp.Lu + EPS && o.dy <= sp.Wu + EPS && o.dz <= sp.effH + EPS) ? [o] : [];
    }
    const l = k.L, w = k.W, h = k.H, all = [];
    const add = (dx, dy, dz, kind, rot) => { if (!all.some((o) => Math.abs(o.dx - dx) < EPS && Math.abs(o.dy - dy) < EPS && Math.abs(o.dz - dz) < EPS)) all.push({ dx, dy, dz, kind, rot }); };
    if (k.allowStand) { add(l, w, h, 'dung', 0); if (k.allowRotate) add(w, l, h, 'dung', 1); }
    if (k.allowLay) {
      add(l, h, w, 'nam', 0); if (k.allowRotate) add(h, l, w, 'nam', 1);
      add(w, h, l, 'nam', 0); if (k.allowRotate) add(h, w, l, 'nam', 1);
    }
    return all.filter((o) => o.dx <= sp.Lu + EPS && o.dy <= sp.Wu + EPS && o.dz <= sp.effH + EPS);
  }
  // thùng có đưa lọt cửa cont (xoay tay khi khiêng) không
  function passDoor(k, c) {
    const s = [k.L, k.W, k.H].sort((a, b) => a - b), d = [Math.min(c.doorW, c.doorH), Math.max(c.doorW, c.doorH)];
    return s[0] <= d[0] + EPS && s[1] <= d[1] + EPS;
  }

  // ---------------------------------------------------------------- các kiểu xếp 1 "vách"
  const mk = (x, y, z, o, tier) => ({ x, y, z, dx: o.dx, dy: o.dy, dz: o.dz, tier, ori: o.kind, rot: o.rot });

  // CỘT THẲNG: cả vách cùng 1 hướng; vách dày đúng 1 thùng (dx). style 'wide' = lên từng tầng, 'tall' = từng cột đầy.
  function colPattern(o, T, Wu) {
    const nc = Math.floor((Wu + EPS) / o.dy); if (nc < 1 || T < 1) return null;
    return {
      kind: 'col', o, D: o.dx, cap: nc * T, nc, T,
      build(count, style, ox, oy) {
        const out = []; let k = 0;
        if (style === 'tall') { for (let c = 0; c < nc && k < count; c++) for (let t = 0; t < T && k < count; t++, k++) out.push(mk(ox, oy + c * o.dy, t * o.dz, o, t + 1)); }
        else { for (let t = 0; t < T && k < count; t++) for (let c = 0; c < nc && k < count; c++, k++) out.push(mk(ox, oy + c * o.dy, t * o.dz, o, t + 1)); }
        return out;
      },
    };
  }
  // TRỘN CỘT: các hướng cùng chiều sâu dx nhưng khác (dy, dz) trong cùng vách (VD nằm + dựng) — quy hoạch động theo bề ngang.
  function mixPattern(os, Tof, Wu) {
    const types = os.map((o) => ({ o, T: Tof(o) })).filter((t) => t.T >= 1 && t.o.dy <= Wu + EPS);
    if (types.length < 2) return null;
    const W = Math.floor(Wu + EPS), dp = new Array(W + 1).fill(0), ch = new Array(W + 1).fill(-1);
    for (let w = 1; w <= W; w++) {
      dp[w] = dp[w - 1]; ch[w] = -1;
      types.forEach((t, i) => { const d = Math.ceil(t.o.dy - EPS); if (w >= d && dp[w - d] + t.T > dp[w]) { dp[w] = dp[w - d] + t.T; ch[w] = i; } });
    }
    const cols = []; let w = W;
    while (w > 0) { if (ch[w] === -1) { w--; continue; } const t = types[ch[w]]; cols.push(t); w -= Math.ceil(t.o.dy - EPS); }
    if (new Set(cols.map((t) => t.o)).size < 2) return null;
    cols.sort((a, b) => (a.o.dz - b.o.dz) || (a.o.dy - b.o.dy)); // cột thấp-nhiều-tầng gom 1 phía cho gọn
    const cap = cols.reduce((s, t) => s + t.T, 0);
    return {
      kind: 'mix', o: cols[0].o, D: cols[0].o.dx, cap, cols, T: Math.max(...cols.map((c) => c.T)),
      build(count, style, ox, oy) {
        const out = []; let k = 0, y = oy; const pos = cols.map((c) => { const p = y; y += c.o.dy; return p; });
        if (style === 'tall') { cols.forEach((c, i) => { for (let t = 0; t < c.T && k < count; t++, k++) out.push(mk(ox, pos[i], t * c.o.dz, c.o, t + 1)); }); }
        else { const TT = Math.max(...cols.map((c) => c.T)); for (let t = 0; t < TT && k < count; t++) cols.forEach((c, i) => { if (t < c.T && k < count) { out.push(mk(ox, pos[i], t * c.o.dz, c.o, t + 1)); k++; } }); }
        return out;
      },
    };
  }
  // SOLE (so le trái / phải): trong 1 dãy, tầng lẻ dồn sát vách này chừa khe ở vách kia, tầng chẵn làm ngược lại → mỗi tầng có 1 đường trống sát vách
  // cho hơi lạnh chạy từ đầu cont xuống cuối cont. Độ lệch giữa 2 tầng d = min(khe dư, nửa thùng) → thùng đầu/cuối hàng được đỡ ≥ 50% (trọng tâm vẫn nằm trên điểm đỡ).
  // Hướng nhìn từ cửa vào: y = 0 là vách PHẢI. Tầng 1: khe nằm ở vách phải (thùng dồn sang trái); tầng 2: khe ở vách trái.
  function solePattern(o, T, Wu, allowDrop) {
    if (T < 2) return null;
    let n = Math.floor((Wu + EPS) / o.dy); if (n < 1) return null;
    let g = Wu - n * o.dy;
    if (g < 0.1 * o.dy) { if (allowDrop === false) return null; n -= 1; g += o.dy; } // vừa khít → bỏ 1 cột để có khe thoáng (tự động thì chỉ khi cont còn trống)
    if (n < 1) return null;
    const d = Math.min(g, o.dy / 2); if (d < 1) return null;
    return {
      kind: 'sole', o, D: o.dx, cap: n * T, nc: n, T, shift: d, gap: g,
      build(count, style, ox, oy) {
        const out = []; let k = 0;
        if (style === 'tall') { for (let c = 0; c < n && k < count; c++) for (let t = 0; t < T && k < count; t++, k++) { const b = mk(ox, oy + (t % 2 === 0 ? d : 0) + c * o.dy, t * o.dz, o, t + 1); b.sole = true; out.push(b); } return out; } // cột đầy: mỗi cột chồng thẳng tới red line (tầng lẻ / chẵn vẫn so le)
        for (let t = 0; t < T && k < count; t++) for (let c = 0; c < n && k < count; c++, k++) { const b = mk(ox, oy + (t % 2 === 0 ? d : 0) + c * o.dy, t * o.dz, o, t + 1); b.sole = true; out.push(b); }
        return out;
      },
    };
  }

  // ---------------------------------------------------------------- dựng danh sách kiểu xếp cho 1 nhóm
  function buildPatterns(sku, ors, sp, Wu, info) {
    const Tof = (o) => Math.min(Math.floor((sp.effH + EPS) / o.dz), sku.maxLayers > 0 ? sku.maxLayers : Infinity);
    let pats = [];
    if (sku.sole || sku._auto) { // sole do người dùng chọn, hoặc TỰ ĐỘNG khi trống 1 bên (xem solveBest)
      ors.forEach((o) => { const p = solePattern(o, Tof(o), Wu, sku.sole ? true : !!sku._drop); if (p) pats.push(p); });
      if (!pats.length && info && sku.sole) info.soleFail = ors.every((o) => Tof(o) < 2) ? 'mot-tang' : 'khong-khe';
    }
    if (!pats.length) {
      ors.forEach((o) => { const p = colPattern(o, Tof(o), Wu); if (p) pats.push(p); });
      const byDx = {}; ors.forEach((o) => { (byDx[Math.round(o.dx * 2)] = byDx[Math.round(o.dx * 2)] || []).push(o); });
      Object.keys(byDx).forEach((key) => {
        const g = byDx[key]; if (g.length < 2) return; const p = mixPattern(g, Tof, Wu);
        if (p) { const bestCol = Math.max(0, ...pats.filter((q) => q.kind === 'col' && Math.abs(q.D - p.D) < EPS).map((q) => q.cap)); if (p.cap > bestCol) pats.push(p); }
      });
    }
    return pats;
  }

  // ---- DÃY MẪU do người dùng chọn: "6 nằm 2 đứng" = trong MỖI LỚP của 1 dãy xếp cạnh nhau 6 thùng NẰM + 2 thùng ĐỨNG (mỗi cột chồng lên tới red line).
  // "nằm / đứng / dựng cao" = chiều cao thùng khi đặt nhỏ nhất / vừa / lớn nhất. Có thể ghi số tầng từng nhóm cột: "6 nằm x10 2 đứng x8". Hoặc 1 trong 6 hướng (LWH…).
  // Dãy mẫu LẶP LẠI cho mọi dãy của mặt hàng; rowSet {thứ_tự_dãy_từ_0: "mẫu riêng" | nằm | đứng | dựng cao | hướng} chỉnh riêng từng dãy.
  const stripVn = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function parseColPlan(str) {
    const out = [], t = stripVn(str), re = /(\d+)\s*(dung\s*cao|dung|nam|cao|[lwh]{3})(?:\s*(?:x|\*)\s*(\d+))?/g; let m;
    while ((m = re.exec(t))) { let tok = m[2].replace(/\s+/g, ''); tok = tok === 'dungcao' ? 'cao' : tok; tok = (tok === 'dung' || tok === 'nam' || tok === 'cao') ? tok : tok.toUpperCase(); if (tok === 'dung' || tok === 'nam' || tok === 'cao' || PERMS.includes(tok)) out.push({ tok, n: Math.min(60, +m[1]), t: m[3] ? +m[3] : 0 }); }
    return out;
  }
  const tokName = { nam: 'nằm', dung: 'đứng', cao: 'dựng cao' };
  // token → hướng đặt (ưu tiên cạnh DÀI nằm dọc cont để dãy sâu bằng nhau, cạnh ngắn ngang cont cho nhiều cột)
  function tokOrient(tok, sku, sp, Wu) {
    const m = { L: sku.L, W: sku.W, H: sku.H }, v = [sku.L, sku.W, sku.H].slice().sort((a, b) => a - b); let best = null;
    PERMS.forEach((pm) => {
      const c = pm.split(''), o = { dx: m[c[0]], dy: m[c[1]], dz: m[c[2]], kind: c[2] === 'H' ? 'dung' : 'nam', rot: ['WLH', 'HLW', 'HWL'].includes(pm) ? 1 : 0, perm: pm };
      const ok = PERMS.includes(tok) ? tok === pm : Math.abs(o.dz - v[{ nam: 0, dung: 1, cao: 2 }[tok]]) < 1e-6;
      if (!ok || o.dx > sp.Lu + EPS || o.dy > Wu + EPS || o.dz > sp.effH + EPS) return;
      if (!best || o.dx > best.dx + EPS || (Math.abs(o.dx - best.dx) <= EPS && o.dy < best.dy - EPS)) best = o;
    });
    return best;
  }
  // 1 dãy gồm nhiều cột, mỗi cột 1 hướng + số tầng riêng (cột trái → phải)
  function colsPattern(cols, label) {
    if (!cols.length) return null; const cap = cols.reduce((a, c) => a + c.T, 0), TT = Math.max(...cols.map((c) => c.T));
    return {
      kind: 'cols', label, o: cols[0].o, D: Math.max(...cols.map((c) => c.o.dx)), cap, cols, T: TT,
      build(count, style, ox, oy) {
        const out = []; let k = 0, y = oy; const pos = cols.map((c) => { const q = y; y += c.o.dy; return q; });
        if (style === 'tall') { cols.forEach((c, i) => { for (let t = 0; t < c.T && k < count; t++, k++) out.push(mk(ox, pos[i], t * c.o.dz, c.o, t + 1)); }); }
        else { for (let t = 0; t < TT && k < count; t++) cols.forEach((c, i) => { if (t < c.T && k < count) { out.push(mk(ox, pos[i], t * c.o.dz, c.o, t + 1)); k++; } }); }
        return out;
      },
    };
  }
  // dựng dãy từ chuỗi mẫu; trả { pat, info:{cols:[{tok,n,t,o,T,ok}], width, over, cap, top} }
  function buildTpl(str, sku, sp, Tmax, Wu) {
    const specs = parseColPlan(str); if (!specs.length) return null; const cols = [], det = []; let width = 0, over = false, top = 0;
    specs.forEach((sp0) => {
      const o = tokOrient(sp0.tok, sku, sp, Wu); const T = o ? Math.min(Tmax(o), sp0.t > 0 ? sp0.t : Infinity) : 0; let used = 0;
      if (o && T >= 1) for (let i = 0; i < sp0.n; i++) { if (width + o.dy > Wu + EPS) { over = true; break; } cols.push({ o, T }); width += o.dy; used++; top = Math.max(top, T * o.dz); }
      det.push({ tok: sp0.tok, n: sp0.n, t: sp0.t, o, T, used, ok: !!o && T >= 1 });
    });
    const label = specs.map((q) => q.n + ' ' + (tokName[q.tok] || q.tok) + (q.t ? ' x' + q.t : '')).join(' + ');
    return { pat: colsPattern(cols, label), info: { cols: det, width, over, cap: cols.reduce((a, c) => a + c.T, 0), top, Wu } };
  }
  function makeWallPat(sku, sp, Tof, Wu) {
    const set = sku.rowSet || {}, setKeys = Object.keys(set).filter((k) => set[k] !== '' && set[k] != null), hasTpl = !!parseColPlan(sku.rowPlan).length;
    if (!hasTpl && !setKeys.length) return null;
    const cache = {}, bestFull = (tok) => { // cả dãy 1 hướng: hướng nào cho nhiều thùng / sâu nhất
      const perms = PERMS.includes(tok) ? [tok] : PERMS.filter((pm) => { const o = tokOrient(pm, sku, sp, Wu); return o && Math.abs(o.dz - [sku.L, sku.W, sku.H].slice().sort((a, b) => a - b)[{ nam: 0, dung: 1, cao: 2 }[tok]]) < 1e-6; });
      let best = null; perms.forEach((pm) => { const o = tokOrient(pm, sku, sp, Wu); if (!o) return; const T = Tof(o), p = (sku.sole && T >= 2 && solePattern(o, T, Wu, true)) || colPattern(o, T, Wu); if (p && (!best || p.cap / p.D > best.cap / best.D + 1e-9)) best = p; });
      return best;
    };
    const resolve = (v) => {
      v = String(v); if (cache[v] !== undefined) return cache[v]; let p = null;
      if (/\d/.test(v)) { const r = buildTpl(v, sku, sp, Tof, Wu); p = r && r.pat; } else { const t = stripVn(v).replace(/\s+/g, ''); const tok = t === 'dungcao' ? 'cao' : (t === 'dung' || t === 'nam' || t === 'cao') ? t : v.toUpperCase(); p = bestFull(tok); }
      return (cache[v] = p);
    };
    const fn = (wi) => { if (set[wi] != null && set[wi] !== '') return resolve(set[wi]); return hasTpl ? resolve(sku.rowPlan) : null; };
    fn.K = hasTpl ? 1e9 : Math.max(...setKeys.map((k) => (+k) + 1), 0); // có dãy mẫu → áp cho MỌI dãy; chỉ chỉnh riêng → N dãy đầu rồi tự động
    return fn;
  }
  // xem trước dãy mẫu (cho bảng sắp dãy trên giao diện)
  function previewTpl(skuRaw, contRaw, str) {
    const c = normContainer(contRaw), sp = makeSpace(c), sku = normSku(skuRaw, 0);
    const Tmax = (o) => Math.min(Math.floor((sp.effH + EPS) / o.dz), sku.maxLayers > 0 ? sku.maxLayers : Infinity);
    const r = buildTpl(str, sku, sp, Tmax, sp.Wu); if (!r) return { cols: [], width: 0, Wu: sp.Wu, cap: 0, top: 0, effH: sp.effH, red: sp.red, H: c.H, over: false };
    return { cols: r.pat ? r.pat.cols.map((q) => ({ dy: q.o.dy, dz: q.o.dz, dx: q.o.dx, T: q.T, name: vName(q.o.dz, sku) })) : [], detail: r.info.cols, width: r.info.width, Wu: sp.Wu, cap: r.info.cap, top: r.info.top, effH: sp.effH, red: sp.red, H: c.H, over: r.info.over, depth: r.pat ? r.pat.D : 0, W: c.W, clearSide: c.clearSide };
  }

  // xếp liên tiếp các vách của 1 kiểu; vách cuối có thể thiếu thùng. ctx (tuỳ chọn): { wallPat(wi) → kiểu riêng cho dãy thứ wi của mặt hàng, wi, mark }
  function placeWalls(p0, n, x0, Lend, style, oy, dry, ctx) {
    let p = p0;
    let cur = x0, left = n, placed = 0, tail = null; const boxes = [];
    while (left > 0) {
      if (ctx && ctx.maxWalls != null && ctx.wi >= ctx.maxWalls) break;
      p = p0; if (ctx && ctx.wallPat) { const q = ctx.wallPat(ctx.wi); if (q) p = q; }
      if (cur + p.D > Lend + EPS) break;
      const take = Math.min(left, p.cap), part = take < p.cap, st = part ? style : 'wide';
      const bx = (dry && !part) ? null : p.build(take, st, cur, oy);
      let used = p.D;
      if (part) { let mx = cur; for (const b of bx) mx = Math.max(mx, b.x + b.dx); used = mx - cur; }
      if (cur + used > Lend + EPS) break;
      placed += take; left -= take;
      if (!dry && bx) for (const b of bx) { if (ctx && ctx.mark) b.wall = ctx.wi; boxes.push(b); }
      if (ctx) { ctx.wi++; if (ctx.used && !ctx.used.includes(p)) ctx.used.push(p); }
      if (part) tail = { x0: cur, used, count: take, cap: p.cap, style: st, boxes: dry ? null : bx, kind: p.kind, pat: p };
      cur += used;
    }
    return { boxes, placed, end: cur, tail, left };
  }
  const prefOf = (p) => (p.o.kind === 'dung' ? 0 : 1) * 2 + (p.kind === 'mix' ? 1 : 0);
  // Tên hướng đặt theo CHIỀU CAO THÙNG khi đặt (cách gọi ngoài kho): cao nhỏ nhất = NẰM (dẹt), cao vừa = ĐỨNG, cao lớn nhất = DỰNG CAO
  const vRank = (dz, k) => { const v = [k.L, k.W, k.H].slice().sort((a, b) => a - b); return Math.abs(dz - v[0]) < 1e-6 ? 0 : (Math.abs(dz - v[1]) < 1e-6 ? 1 : 2); };
  const vName = (dz, k) => ['nằm', 'đứng', 'dựng cao'][vRank(dz, k)];
  const orientText = (o, k) => vName(o.dz, k) + ' (cao ' + r1(o.dz) + ')' + (o.rot ? ' · xoay 90°' : '');

  // ---------------------------------------------------------------- xếp 1 nhóm vào cont
  function runGroup(S, g, nWant, opts, isLast) {
    const sp = S.sp, sku = g.sku, out = { boxes: [], placed: 0, info: { soleFail: '' }, patterns: [] };
    const ors = orientationsOf(sku, sp);
    if (!ors.length) { out.reason = 'khong-vua'; return out; }
    let left = nWant;
    // QUY TẮC CAO → THẤP (trong → cửa): vách THIẾU thùng ở cuối mỗi mặt hàng được xếp CỘT ĐẦY tới red line (hẹp hơn, không thấp hơn) — nếu xếp "từng tầng" thì vách này thấp hơn dãy liền sau nó (sai quy tắc đóng hàng).
    const tallRule = opts.heightRule !== false && !opts._sample && (!isLast || !!opts._sampleAfter);
    const style = ((opts.mergeTail && !isLast) || tallRule) ? 'tall' : 'wide';
    const note = (p) => { const tx = describe(p) + (sku._auto && p.kind === 'sole' ? ' [tự động]' : ''); if (!out.patterns.some((q) => q.text === tx)) out.patterns.push({ text: tx, kind: p.kind, o: p.o }); };
    const describe = (p) => p.kind === 'cols' ? 'dãy mẫu: ' + p.label + ' · sâu ' + r1(p.D) + ' mm' : orientText(p.o, sku) + ' · ' + r1(p.o.dx) + '×' + r1(p.o.dy) + '×' + r1(p.o.dz) + (p.kind === 'sole' ? ' · sole (so le trái/phải từng tầng, khe ' + r1(p.gap) + ' mm)' : (p.kind === 'mix' ? ' · trộn hướng cùng chiều sâu' : ''));
    let lastTail = null;
    // 1) lấp phần trống cạnh vách cuối của nhóm trước (nếu bật "ghép")
    if (opts.mergeTail && S.strip && !(sku.sole || sku._auto) && left > 0) {
      const st = S.strip;
      const pats = buildPatterns(sku, ors, sp, st.w, null).filter((p) => p.kind !== 'cross');
      pats.sort((a, b) => (b.cap / b.D) - (a.cap / a.D) || prefOf(a) - prefOf(b));
      const ps = pats[0];
      if (ps) {
        const D = ps.D, fl = Math.floor((st.depth + EPS) / D), ce = Math.ceil((st.depth - EPS) / D) || 1;
        const vFl = fl >= 1 ? (st.depth - fl * D) * st.w : Infinity, vCe = (ce * D - st.depth) * st.aW;
        let rows = (fl >= 1 && vFl <= vCe) ? fl : ce;
        while (rows > 0 && st.x0 + rows * D > sp.x1 + EPS) rows--;
        if (rows >= 1) {
          const want = Math.min(left, rows * ps.cap), res = placeWalls(ps, want, st.x0, st.x0 + rows * D, 'wide', st.y0, false);
          if (res.placed > 0) { out.boxes.push(...res.boxes); left -= res.placed; S.cursor = Math.max(S.cursor, res.end); note(ps); out.stripUsed = res.placed; }
        }
      }
    }
    // 1b) chồng lên khoảng trống phía trên vách cuối của nhóm trước (nếu cho phép)
    if (opts.stackTop && S.top && !(sku.sole || sku._auto) && left > 0) { // chồng lên chỗ hổng phía trên vách cuối của mặt hàng trước (dùng được cả khi bật "ghép lấp")
      const t = S.top, sp2 = Object.assign({}, sp, { Lu: t.depth, Wu: t.w, effH: sp.effH - t.z });
      const o2 = orientationsOf(sku, sp2), pats2 = o2.length ? buildPatterns(sku, o2, sp2, t.w, null).filter((p) => p.kind !== 'sole') : [];
      let bst = null;
      pats2.forEach((p) => { const rows = Math.floor((t.depth + EPS) / p.D); if (rows < 1) return; const r = placeWalls(p, Math.min(left, rows * p.cap), t.x0, t.x0 + rows * p.D, 'wide', t.y0, true); if (r.placed > 0 && (!bst || r.placed > bst.placed || (r.placed === bst.placed && prefOf(p) < prefOf(bst.p)))) bst = { p, rows, placed: r.placed }; });
      if (bst) {
        const res = placeWalls(bst.p, Math.min(left, bst.rows * bst.p.cap), t.x0, t.x0 + bst.rows * bst.p.D, 'wide', t.y0, false);
        res.boxes.forEach((b) => { b.z += t.z; b.tier += t.tiers; b.onPrev = true; });
        out.boxes.push(...res.boxes); left -= res.placed; out.stackedOn = res.placed; note(bst.p);
      }
    }
    // 2) các vách chính
    let used = 0;
    if (left > 0) {
      const pats = buildPatterns(sku, ors, sp, sp.Wu, out.info);
      const TofW = (o) => Math.min(Math.floor((sp.effH + EPS) / o.dz), sku.maxLayers > 0 ? sku.maxLayers : Infinity);
      const wallPat = makeWallPat(sku, sp, TofW, sp.Wu), ctx = { wallPat, wi: 0, mark: true, used: [], maxWalls: null };
      if (!pats.length && wallPat) { const q = wallPat(0); if (q) pats.push(q); }
      if (!pats.length) { if (!out.boxes.length) out.reason = 'khong-vua'; }
      else {
        const airy = !!opts._airflow; // cont còn trống nhiều: ưu tiên DỰNG ĐỨNG + thoáng khí trước, tiết kiệm chiều dài sau
        const pick = (cx) => { // kiểu xếp tốt nhất cho phần còn lại (mô phỏng khô)
          let best = null;
          pats.forEach((p) => {
            const r = placeWalls(p, left, S.cursor, sp.x1, style, sp.y0, true, cx ? { wallPat: cx.wallPat, wi: 0, maxWalls: cx.maxWalls } : null), cand = { p, placed: r.placed, end: r.end };
            if (!best || cand.placed > best.placed || (cand.placed === best.placed && (airy ? (prefOf(p) < prefOf(best.p) || (prefOf(p) === prefOf(best.p) && cand.end < best.end - EPS)) : (cand.end < best.end - EPS || (Math.abs(cand.end - best.end) <= EPS && prefOf(p) < prefOf(best.p)))))) best = cand;
          });
          return best;
        };
        const run = (p, count) => { // xếp 1 bước, cập nhật trạng thái
          const res = placeWalls(p, Math.min(left, count), S.cursor, sp.x1, style, sp.y0, false, ctx);
          out.boxes.push(...res.boxes); left -= res.placed; S.cursor = res.end; lastTail = res.tail; used += res.placed; return res;
        };
        // A) các dãy đầu do NGƯỜI DÙNG chọn hướng (kế hoạch "4 đứng 3 nằm…" / chỉnh riêng từng dãy); dãy chưa chỉ định trong đoạn này dùng kiểu tốt nhất
        if (wallPat && wallPat.K > 0) {
          ctx.maxWalls = wallPat.K; const bA = pick({ wallPat, maxWalls: wallPat.K });
          if (bA && bA.placed > 0) run(bA.p, left);
          ctx.maxWalls = null; ctx.wallPat = null; // từ đây TỰ ĐỘNG
        }
        // B) phần còn lại TỰ ĐỘNG. HÀNG NHIỀU (không đủ chỗ cho hết): thử TRỘN dãy kiểu A rồi dãy kiểu B (VD x dãy đứng + y dãy nằm) bằng quy hoạch chiều dài → thường đóng thêm được thùng
        if (left > 0) {
          const best = pick(null); let steps = best && best.placed > 0 ? [{ p: best.p, count: left }] : [];
          const seq = (!opts._sample && !wallPat && sku._tierSeq && sku._tierSeq.length) ? sku._tierSeq : null;
          if (seq && best && best.placed > 0) { // TRẢI ĐỀU: dãy thứ i chỉ chồng seq[i] tầng (số tầng các dãy chênh nhau ≤ 1, xếp bậc thang)
            const bp = best.p, cache = {}, Wu0 = sp.Wu;
            const limitT = (cap) => {
              cap = Math.max(1, cap); if (cap >= bp.T) return bp; if (cache[cap]) return cache[cap]; let q;
              if (bp.kind === 'col') q = colPattern(bp.o, cap, Wu0); else if (bp.kind === 'sole') q = solePattern(bp.o, cap, Wu0, true) || colPattern(bp.o, cap, Wu0); else if (bp.cols) q = colsPattern(bp.cols.map((c) => ({ o: c.o, T: Math.min(c.T, cap) })), bp.label); else q = bp;
              return (cache[cap] = q || bp);
            };
            ctx.wallPat = (wi) => limitT(seq[Math.min(wi, seq.length - 1)]);
          }
          if (best && !seq && best.placed < left && pats.length > 1) {
            const R0 = sp.x1 - S.cursor, cand = pats.filter((q) => q.kind === 'col' || q.kind === 'sole'); let bm = null;
            for (let i = 0; i < cand.length; i++) for (let j = 0; j < cand.length; j++) {
              if (i === j) continue; const A = cand[i], B = cand[j];
              for (let a = 1; a * A.D <= R0 + EPS; a++) { const b = Math.floor((R0 - a * A.D + EPS) / B.D), tot = a * A.cap + b * B.cap; if (b >= 1 && tot > best.placed && (!bm || tot > bm.total)) bm = { pi: A, pj: B, a, b, total: tot }; }
            }
            if (bm) steps = [{ p: bm.pi, count: bm.a * bm.pi.cap }, { p: bm.pj, count: left }];
          }
          steps.forEach((st0) => { if (left > 0) run(st0.p, st0.count); });
        }
        // C) phần còn dư ở cuối cont: thử kiểu khác có chiều sâu nhỏ hơn
        let guard = 0;
        while (left > 0 && guard++ < 4) {
          const R = sp.x1 - S.cursor; let b2 = null;
          pats.forEach((p) => { if (p.D > R + EPS) return; const r = placeWalls(p, left, S.cursor, sp.x1, tallRule ? style : 'wide', sp.y0, true, null); if (r.placed > 0 && (!b2 || r.placed > b2.placed || (r.placed === b2.placed && r.end < b2.end))) b2 = { p, placed: r.placed, end: r.end }; });
          if (!b2) break;
          const r2 = placeWalls(b2.p, left, S.cursor, sp.x1, tallRule ? style : 'wide', sp.y0, false, ctx);
          if (!r2.placed) break;
          out.boxes.push(...r2.boxes); left -= r2.placed; S.cursor = r2.end; lastTail = r2.tail; note(b2.p); used += r2.placed;
        }
        ctx.used.forEach(note);
      }
    }
    out.placed = nWant - left;
    // 3) ghi lại phần trống bên cạnh vách cuối để nhóm sau lấp (chỉ khi ghép + vách cuối đang xếp "cột đầy")
    // Nhóm quá ít, nằm gọn trong chỗ hổng của nhóm trước (không mở vách mới) → phần hổng chưa dùng vẫn để dành cho nhóm sau.
    const absorbed = !lastTail && left === 0 && out.placed > 0;
    if (!(absorbed && !out.stripUsed)) S.strip = null;
    if (opts.mergeTail && !isLast && left === 0 && lastTail && lastTail.style === 'tall' && lastTail.boxes && lastTail.kind === 'col' && Math.abs(S.cursor - (lastTail.x0 + lastTail.used)) < EPS) {
      let yEnd = sp.y0; lastTail.boxes.forEach((b) => { yEnd = Math.max(yEnd, b.y + b.dy); });
      const w = sp.y1 - yEnd; if (w > 1) S.strip = { x0: lastTail.x0, depth: lastTail.used, y0: yEnd, w, aW: yEnd - sp.y0 };
    }
    // 4) ghi lại mặt phẳng trống phía trên vách cuối: cột còn thiếu tầng (vách "cột đầy" thiếu vài thùng) hoặc vách xếp "từng tầng"
    if (!(absorbed && !out.stackedOn)) S.top = null;
    if (opts.stackTop && !isLast && left === 0 && lastTail && lastTail.kind === 'col' && lastTail.boxes && Math.abs(S.cursor - (lastTail.x0 + lastTail.used)) < EPS) {
      const pt = lastTail.pat, tops = []; for (let c = 0; c < pt.nc; c++) tops.push(0);
      lastTail.boxes.forEach((b) => { const c = Math.round((b.y - sp.y0) / pt.o.dy); if (c >= 0 && c < pt.nc) tops[c] = Math.max(tops[c], b.z + b.dz); });
      let bestRun = null, i0 = 0;
      // cột còn TRỐNG hẳn (vách cột đầy chừa cột trống bên cạnh) không phải "mặt phẳng phía trên" → bỏ qua (phần này do "ghép lấp" xử lý); chỉ chồng lên cột đang thiếu tầng
      if (opts.heightRule !== false || lastTail.style === 'tall') for (let c = 0; c < tops.length; c++) if (tops[c] <= EPS) tops[c] = 1e18;
      const mn = Math.min(...tops);
      while (i0 < tops.length) { if (Math.abs(tops[i0] - mn) > EPS) { i0++; continue; } let i1 = i0; while (i1 + 1 < tops.length && Math.abs(tops[i1 + 1] - mn) <= EPS) i1++; if (!bestRun || i1 - i0 > bestRun.i1 - bestRun.i0) bestRun = { i0, i1 }; i0 = i1 + 1; }
      if (bestRun && sp.effH - mn > 1) S.top = { x0: lastTail.x0, depth: lastTail.used, y0: sp.y0 + bestRun.i0 * pt.o.dy, w: (bestRun.i1 - bestRun.i0 + 1) * pt.o.dy, z: mn, tiers: Math.round(mn / pt.o.dz) };
    }
    out.soleFail = out.info.soleFail || '';
    return out;
  }

  // ---------------------------------------------------------------- KIỂM TRA ĐỘC LẬP phương án (chống "đúng trên hình nhưng không làm được")
  // HÀNG MẪU HẢI QUAN — CÁC DÃY CUỐI (sát cửa) TRỘN ĐỦ MỌI MẶT HÀNG, mỗi dãy đầy đặn như các dãy khác (không để dãy mẫu thưa).
  // Mỗi dãy mẫu chia bề ngang cho các mặt hàng sao cho số thùng mỗi mặt hàng xấp xỉ nhau (VD 3 mặt hàng, dãy 50 thùng → 15/15/20); số thùng mẫu
  // của mỗi mặt hàng do hệ thống tự tính (≈ sức chứa các dãy mẫu ÷ số mặt hàng, tối thiểu minQ nếu đủ hàng) — người dùng không nhập.
  function buildSampleRows(infos, sp, R, weightLeft) {
    const rem = infos.map((f) => f.want), placed = infos.map(() => 0), rows = []; let wl = weightLeft;
    for (let r = 0; r < R; r++) {
      let wLeft = sp.Wu; const cols = infos.map(() => []);
      for (let guard = 0; guard < 5000; guard++) {
        let pick = -1;
        infos.forEach((f, i) => { if (rem[i] <= 0 || f.o.dy > wLeft + EPS) return; if (pick < 0 || placed[i] < placed[pick]) pick = i; });
        if (pick < 0) break;
        const f = infos[pick]; let n = Math.min(f.T, rem[pick]);
        if (Number.isFinite(wl) && f.k.kg > 0) n = Math.min(n, Math.floor((wl + 1e-6) / f.k.kg));
        if (n <= 0) { rem[pick] = 0; continue; }
        cols[pick].push(n); wLeft -= f.o.dy; rem[pick] -= n; if (Number.isFinite(wl)) wl -= n * f.k.kg;
        placed[pick] += n;
      }
      const used = infos.map((f, i) => (cols[i].length ? f.o.dx : 0)); if (!used.some((d) => d > 0)) break;
      rows.push({ D: Math.max(...used), cols });
    }
    return { rows, placed, reserve: rows.reduce((a, r) => a + r.D, 0), kg: Number.isFinite(weightLeft) ? weightLeft - wl : 0 };
  }
  function planSampleRows(gs, sp, minQ, weightLeft) {
    const infos = [];
    gs.forEach((g) => {
      const k = g.sku, ors = orientationsOf(k, sp); let best = null, bs = -1;
      ors.forEach((o) => {
        let T = Math.floor((sp.effH + EPS) / o.dz); if (k.maxLayers > 0) T = Math.min(T, k.maxLayers);
        if (T < 1 || o.dy > sp.Wu + EPS) return;
        const sc = T / (o.dx * o.dy);
        if (!best || sc > bs + 1e-12 || (Math.abs(sc - bs) <= 1e-12 && prefOf({ o, kind: 'col' }) < prefOf({ o: best.o, kind: 'col' }))) { bs = sc; best = { o, T }; }
      });
      if (best) infos.push({ g, k, o: best.o, T: best.T, want: Math.min(k.qty, Math.max(Math.min(minQ, k.qty), Math.floor(k.qty / 2))) });
    });
    if (infos.length < 2) return null;
    let res = null;
    for (let R = 2; R <= 4; R++) {
      res = buildSampleRows(infos, sp, R, weightLeft);
      if (infos.every((f, i) => res.placed[i] >= Math.min(minQ, f.k.qty))) break;
    }
    return res && res.rows.length ? { infos, rows: res.rows, placed: res.placed, reserve: res.reserve, kg: res.kg } : null;
  }

  function verify(boxes, sp, opts) {
    const minSup = (opts && opts.minSupport) || 0.7, v = [], push = (type, i, msg) => { if (v.length < 200) v.push({ type, box: i, msg }); };
    boxes.forEach((b, i) => {
      if (b.x < sp.x0 - 1e-3 || b.x + b.dx > sp.x1 + 1e-3 || b.y < sp.y0 - 1e-3 || b.y + b.dy > sp.y1 + 1e-3) push('ngoai-cont', i, 'Thùng #' + b.seq + ' nằm ngoài vùng chứa hàng của cont.');
      if (b.z < -1e-3 || b.z + b.dz > sp.effH + 1e-3) push('vuot-redline', i, 'Thùng #' + b.seq + ' vượt chiều cao cho phép (red line).');
    });
    // chồng nhau
    const ix = boxes.map((_, i) => i).sort((p, q) => boxes[p].x - boxes[q].x);
    for (let a = 0; a < ix.length; a++) {
      const A = boxes[ix[a]];
      for (let b = a + 1; b < ix.length; b++) {
        const B = boxes[ix[b]]; if (B.x >= A.x + A.dx - 1e-3) break;
        if (B.y < A.y + A.dy - 1e-3 && A.y < B.y + B.dy - 1e-3 && B.z < A.z + A.dz - 1e-3 && A.z < B.z + B.dz - 1e-3) push('chong-nhau', ix[a], 'Thùng #' + A.seq + ' chồng lên thùng #' + B.seq + '.');
      }
    }
    // được đỡ bên dưới + thùng đỡ phải đóng trước
    const byTop = new Map();
    boxes.forEach((b, i) => { const k = Math.round((b.z + b.dz) * 100); if (!byTop.has(k)) byTop.set(k, []); byTop.get(k).push(i); });
    boxes.forEach((b, i) => {
      if (b.z < 1e-3) return;
      const cand = byTop.get(Math.round(b.z * 100)) || []; let area = 0, cx = 0, cy = 0, cover = false; const sup = [];
      cand.forEach((j) => {
        const c = boxes[j]; if (j === i) return;
        const ox = Math.min(b.x + b.dx, c.x + c.dx) - Math.max(b.x, c.x), oy = Math.min(b.y + b.dy, c.y + c.dy) - Math.max(b.y, c.y);
        if (ox > 1e-3 && oy > 1e-3) { area += ox * oy; sup.push(j); }
      });
      const ratio = area / (b.dx * b.dy); cx = b.x + b.dx / 2; cy = b.y + b.dy / 2;
      cover = sup.some((j) => { const c = boxes[j]; return cx >= c.x - 1e-3 && cx <= c.x + c.dx + 1e-3 && cy >= c.y - 1e-3 && cy <= c.y + c.dy + 1e-3; });
      if (ratio < (b.sole ? 0.5 : minSup) - 1e-6 || !cover) push('thieu-do', i, 'Thùng #' + b.seq + ' chỉ được đỡ ' + Math.round(ratio * 100) + '% bên dưới.');
      if (sup.some((j) => boxes[j].seq > b.seq)) push('thu-tu-do', i, 'Thùng #' + b.seq + ' được đóng trước thùng đỡ nó.');
    });
    // thùng đóng trước chắn đường trượt từ cửa vào
    const ord = boxes.map((_, i) => i).sort((p, q) => boxes[p].seq - boxes[q].seq);
    for (let a = 0; a < ord.length; a++) {
      const J = boxes[ord[a]];
      for (let b = 0; b < a; b++) {
        const I = boxes[ord[b]];
        if (I.x >= J.x + J.dx - 1e-3 && I.y < J.y + J.dy - 1e-3 && J.y < I.y + I.dy - 1e-3 && I.z < J.z + J.dz - 1e-3 && J.z < I.z + I.dz - 1e-3) { push('chan-duong', ord[a], 'Thùng #' + J.seq + ' không đưa vào được: thùng #' + I.seq + ' (đóng trước) chắn phía cửa.'); break; }
      }
    }
    return { ok: v.length === 0, violations: v };
  }

  // ---------------------------------------------------------------- GIẢI
  function solveOnce(input, opts) {
    const c = normContainer(input.container), sp = makeSpace(c);
    const warnings = [], errors = [];
    if (!(c.L > 0 && c.W > 0 && c.H > 0)) errors.push('Container chưa có kích thước bên trong (dài / rộng / cao).');
    if (sp.Lu <= 0 || sp.Wu <= 0 || sp.effH <= 0) errors.push('Khe hở đầu / cửa / hai bên lớn hơn kích thước cont — không còn chỗ chứa hàng.');
    const skus = (input.skus || []).map(normSku).filter((k) => k.qty > 0 || k.code || k.size);
    if (opts._auto) skus.forEach((k) => { if (!k.sole) { k._auto = true; k._drop = !!opts._drop; } });
    if (opts._tierSeqs) skus.forEach((k) => { if (opts._tierSeqs[k.id]) k._tierSeq = opts._tierSeqs[k.id]; }); // TRẢI ĐỀU: số tầng từng dãy (có thể khác nhau)
    if (opts._tierCap) skus.forEach((k) => { k.maxLayers = k.maxLayers > 0 ? Math.min(k.maxLayers, opts._tierCap) : opts._tierCap; }); // chế độ TRẢI ĐỀU: giới hạn số tầng mọi mặt hàng
    const groups = skus.map((k) => ({ sku: k }));
    // thứ tự đóng: mặt hàng > size > ngày (hoặc đúng thứ tự nhập)
    if (opts.sortMode !== 'manual') {
      const dir = opts.dateDir === 'desc' ? -1 : 1;
      groups.sort((a, b) => {
        const x = a.sku, y = b.sku; let d = natCmp(x.code, y.code); if (d) return d;
        d = natCmp(x.size, y.size); if (d) return d;
        const dx = dateVal(x.date), dy = dateVal(y.date), nx = Number.isNaN(dx), ny = Number.isNaN(dy);
        if (nx !== ny) return nx ? 1 : -1; if (!nx && dx !== dy) return (dx - dy) * dir;
        d = natCmp(x.date, y.date); if (d) return d * dir;
        return x._idx - y._idx;
      });
    }
    let weightLeft = c.maxPayload > 0 ? c.maxPayload : Infinity, loadedKg = 0;
    const sampleQ = opts.sampleOn === false ? 0 : MIN_SAMPLE; // hàng mẫu hải quan: TỰ ĐỘNG tối thiểu MIN_SAMPLE thùng / mỗi dòng, chia đều vào các dãy (không còn dãy mẫu riêng); sampleOn=false → không đánh dấu mẫu
    const SOLE_WHY = { 'mot-tang': 'chỉ xếp được 1 tầng', 'khong-khe': 'bề ngang không còn khe để so le' };
    groups.forEach((g, gi) => {
      const k = g.sku; g.index = gi; g.requested = k.qty; g.loaded = 0; g.left = k.qty; g.sample = 0; g.reasons = []; g.patterns = []; g.xStart = null; g.xEnd = null; g.kg = 0; g.ok = false;
      if (errors.length || k.qty <= 0) return;
      if (!(k.L > 0 && k.W > 0 && k.H > 0)) { g.reasons.push('Thiếu kích thước thùng.'); return; }
      if (!passDoor(k, c)) { g.reasons.push('Thùng quá lớn, không đưa lọt cửa cont (' + r1(c.doorW) + '×' + r1(c.doorH) + ' mm).'); return; }
      g.ok = true;
    });
    const boxes = [], mainBoxes = [], sampBoxes = [], wLimit = (k, n) => { if (k.kg > 0 && Number.isFinite(weightLeft)) return Math.min(n, Math.floor((weightLeft + 1e-6) / k.kg)); return n; };
    const addWhy = (g, t) => { if (!g.reasons.includes(t)) g.reasons.push(t); };
    // (hàng mẫu hải quan KHÔNG còn xếp riêng 2 dãy cuối: sau khi xếp xong, hệ thống tự chọn & đánh dấu thùng mẫu chia đều vào các dãy — xem bước đánh dấu bên dưới)
    const Ds = 0;
    // A) DÃY MẪU HẢI QUAN: các dãy cuối trộn đủ mọi mặt hàng (cần ≥ 2 mặt hàng xếp được) — tính trước để chừa chỗ + trừ số thùng mẫu khỏi hàng chính
    const sampPlan = (sampleQ > 0 && !errors.length) ? planSampleRows(groups.filter((g) => g.ok), sp, sampleQ, weightLeft) : null;
    if (sampPlan) { sampPlan.infos.forEach((f, i) => { f.g.sample = sampPlan.placed[i]; }); if (Number.isFinite(weightLeft)) weightLeft -= sampPlan.kg; }
    // B) HÀNG CHÍNH: từ vách đầu ra tới trước các dãy mẫu
    const spM = sampPlan ? Object.assign({}, sp, { x1: sp.x1 - sampPlan.reserve, Lu: sp.Lu - sampPlan.reserve }) : sp, S = { sp: spM, cursor: sp.x0, strip: null, top: null };
    const lastIdx = (() => { let li = -1; groups.forEach((g, i) => { if (g.ok && g.requested - g.sample > 0) li = i; }); return li; })();
    groups.forEach((g, gi) => {
      if (!g.ok) return; const k = g.sku; const n0 = k.qty - g.sample; if (n0 <= 0) return;
      let n = wLimit(k, n0); if (n < n0) addWhy(g, 'Hết tải trọng cho phép (' + Math.round(c.maxPayload) + ' kg).'); if (n <= 0) return;
      const r = runGroup(S, g, n, opts, gi === lastIdx);
      if (r.reason === 'khong-vua') { addWhy(g, k.orient ? 'Hướng đặt bạn chọn không vừa cont (so với bề ngang / red line). Đổi hướng hoặc chọn “Tự động”.' : 'Không có hướng đặt nào vừa trong cont (kích thước thùng so với bề ngang / red line). Thử bật xoay / đặt nằm.'); return; }
      r.boxes.forEach((b) => { b.group = gi; b.skuId = k.id; }); mainBoxes.push(...r.boxes);
      g.loaded = r.placed; g.patterns = r.patterns; g.soleFail = r.soleFail || g.soleFail; g.stripUsed = r.stripUsed || 0; g.stackedOn = r.stackedOn || 0;
      if (r.placed < n) addWhy(g, 'Hết chỗ trong cont (đã tới dãy mẫu / cửa / red line).');
      if (Number.isFinite(weightLeft)) weightLeft -= r.placed * k.kg;
    });
    if (sampPlan) { // xếp các dãy mẫu ngay sau hàng chính (sát cửa): mỗi dãy chia bề ngang cho các mặt hàng
      let cx = mainBoxes.length ? Math.max(...mainBoxes.map((b) => b.x + b.dx)) : sp.x0; sampPlan.infos.forEach((f) => { f.g.sample = 0; });
      sampPlan.rows.forEach((rw) => {
        if (cx + rw.D > sp.x1 + 1e-3) return; let y = sp.y0;
        sampPlan.infos.forEach((f, i) => rw.cols[i].forEach((n) => {
          for (let t = 0; t < n; t++) { const b = mk(cx, y, t * f.o.dz, f.o, t + 1); b.group = f.g.index; b.skuId = f.k.id; b.sample = true; sampBoxes.push(b); f.g.sample++; f.g.loaded++; }
          y += f.o.dy;
        }));
        cx += rw.D;
      });
      sampPlan.infos.forEach((f) => { const g = f.g; if (!g.patterns.length) g.patterns.push({ text: orientText(f.o, f.k) + ' · hàng mẫu', kind: 'col', o: f.o }); if (g.loaded < g.requested && g.reasons.length === 0) addWhy(g, 'Hết chỗ trong cont (các dãy mẫu sát cửa).'); });
    }
    groups.forEach((g) => {
      g.left = g.requested - g.loaded; g.kg = g.loaded * g.sku.kg; loadedKg += g.kg;
      g.volUnit = g.sku.L * g.sku.W * g.sku.H; g.volReq = g.volUnit * g.requested; g.volLoaded = g.volUnit * g.loaded; // mm³ (÷ 1e9 = m³)
      const all = mainBoxes.concat(sampBoxes).filter((b) => b.group === g.index);
      if (all.length) { g.xStart = Math.min(...all.map((b) => b.x)); g.xEnd = Math.max(...all.map((b) => b.x + b.dx)); }
      if (g.soleFail) addWhy(g, 'Không xếp SOLE được: ' + (SOLE_WHY[g.soleFail] || '') + ' → xếp thẳng hàng.');
    });
    boxes.push(...mainBoxes, ...sampBoxes);
    boxes.forEach((b, i) => { b.seq = i + 1; });
    // đánh số DÃY: dãy = lát cắt liên tiếp theo chiều dài cont (từ vách đầu ra cửa); các thùng chồng lấn về chiều dọc thuộc cùng 1 dãy
    const rows = (() => {
      const ix = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x), info = []; let end = -1e18;
      ix.forEach((i) => { const b = boxes[i]; if (b.x >= end - 1e-3) { info.push({ row: info.length + 1, x0: b.x, x1: b.x + b.dx, n: 0, sample: false, gs: {}, ws: {}, y0: 1e18, y1: -1e18, top: 0, hmin: 1e18 }); end = b.x + b.dx; } else end = Math.max(end, b.x + b.dx); const r = info[info.length - 1]; r.x1 = Math.max(r.x1, b.x + b.dx); r.n++; if (b.sample) r.sample = true; r.gs[b.group] = 1; r.ws[b.wall == null ? -1 : b.wall] = 1; r.y0 = Math.min(r.y0, b.y); r.y1 = Math.max(r.y1, b.y + b.dy); r.top = Math.max(r.top, b.z + b.dz); r.hmin = Math.min(r.hmin, b.dz); b.row = r.row; });
      info.forEach((r) => { const g = Object.keys(r.gs), w = Object.keys(r.ws); r.group = g.length === 1 ? +g[0] : -1; r.wall = (g.length === 1 && w.length === 1 && +w[0] >= 0 && !r.sample) ? +w[0] : -1; delete r.gs; delete r.ws; r.gaps = { right: r.y0, left: c.W - r.y1, top: r.top, ceiling: c.H - r.top, red: sp.red - r.top, eff: sp.effH - r.top }; }); // wall ≥ 0 → dãy này chỉnh được hướng (thuộc 1 mặt hàng, vách chính)
      return info;
    })();
    // HÀNG MẪU HẢI QUAN — TỰ CHIA ĐỀU: mỗi dòng (mã · size · ngày) lấy tối thiểu MIN_SAMPLE thùng, chia đều cho các dãy mà dòng đó nằm
    // (mỗi dãy 1–2 thùng), ưu tiên thùng ở TẦNG TRÊN CÙNG (dễ lấy ra kiểm), xoay vị trí trái/phải giữa các dãy. Thùng mẫu nằm ngay trong khối hàng, KHÔNG tách riêng.
    let nSample = 0;
    if (sampleQ > 0 && !sampPlan) {
      groups.forEach((g) => {
        if (!g.ok) return; const mine = boxes.filter((b) => b.group === g.index); if (!mine.length) return;
        const need = Math.min(sampleQ, mine.length), byRow = {}; mine.forEach((b) => { (byRow[b.row] = byRow[b.row] || []).push(b); });
        const ids = Object.keys(byRow).map(Number).sort((a, b) => a - b), R = ids.length, quota = ids.map((_, i) => Math.floor(need * (i + 1) / R) - Math.floor(need * i / R));
        let miss = 0; ids.forEach((id, i) => { if (quota[i] > byRow[id].length) { miss += quota[i] - byRow[id].length; quota[i] = byRow[id].length; } });
        for (let i = 0; miss > 0 && i < 4 * R; i++) { const j = i % R; if (quota[j] < byRow[ids[j]].length) { quota[j]++; miss--; } } // dãy nào ít thùng quá thì dồn sang dãy khác
        ids.forEach((id, i) => {
          const q = quota[i]; if (q <= 0) return; const cand = byRow[id].slice().sort((a, b) => ((b.z + b.dz) - (a.z + a.dz)) || (a.y - b.y)), topZ = cand[0].z + cand[0].dz;
          const nTop = cand.filter((b) => b.z + b.dz >= topZ - 1e-3).length, head = cand.slice(0, nTop), rest = cand.slice(nTop);
          const sh = (i * 3) % Math.max(1, head.length), ordered = head.slice(sh).concat(head.slice(0, sh)).concat(rest); // xoay điểm bắt đầu theo dãy → mẫu không dồn 1 phía
          ordered.slice(0, q).forEach((b) => { b.sample = true; nSample++; g.sample++; });
        });
        if (g.sample < Math.min(sampleQ, g.sku.qty)) addWhy(g, 'Chỉ xếp được ' + g.sample + ' thùng, chưa đủ ' + sampleQ + ' thùng mẫu hải quan.');
      });
    }
    if (sampPlan) { nSample = sampBoxes.length; groups.forEach((g) => { if (g.ok && g.sample < Math.min(sampleQ, g.sku.qty)) addWhy(g, 'Chỉ xếp được ' + g.sample + ' thùng, chưa đủ ' + sampleQ + ' thùng mẫu hải quan.'); }); }
    rows.forEach((r) => { r.samples = 0; }); boxes.forEach((b) => { if (b.sample && rows[b.row - 1]) rows[b.row - 1].samples++; }); // số thùng mẫu HQ trong từng dãy
    // QUY TẮC CAO → THẤP (trong → cửa): dãy phía trong KHÔNG được thấp hơn dãy phía ngoài. Dãy còn dư chỗ chồng thêm 1 tầng mà dãy liền sau lại cao hơn → vi phạm (bỏ qua dãy mẫu hải quan).
    const heightViol = [];
    for (let i = 0; i + 1 < rows.length; i++) { const a = rows[i], b2 = rows[i + 1]; if (a.sample || b2.sample) continue; if (sp.effH - a.top >= a.hmin - 1e-3 && b2.top > a.top + 1e-3) heightViol.push({ row: a.row, next: b2.row, top: a.top, nextTop: b2.top }); }
    // tầng hiển thị ("lớp")
    const maxTier = boxes.reduce((m, b) => Math.max(m, b.tier), 0);
    const ver = verify(boxes, sp, opts);
    // tổng hợp
    const volBox = boxes.reduce((s, b) => s + b.dx * b.dy * b.dz, 0), volUse = sp.Lu * sp.Wu * sp.effH, volIn = c.L * c.W * c.H;
    let cx = 0, cy = 0, kgSum = 0;
    boxes.forEach((b) => { const k = skus.find((s) => s.id === b.skuId), w = k ? k.kg : 0; cx += w * (b.x + b.dx / 2); cy += w * (b.y + b.dy / 2); kgSum += w; });
    const cog = kgSum > 0 ? { x: cx / kgSum, y: cy / kgSum, xPct: cx / kgSum / c.L * 100, yPct: cy / kgSum / c.W * 100 } : null;
    // KHOẢNG TRỐNG CÒN LẠI (mm): thùng gần nhất → vách đầu / cửa / vách phải / vách trái, thùng CAO NHẤT → trần / red line / giới hạn xếp
    const gaps = boxes.length ? (() => { let mnx = 1e18, mxx = -1e18, mny = 1e18, mxy = -1e18, top = 0; boxes.forEach((b) => { mnx = Math.min(mnx, b.x); mxx = Math.max(mxx, b.x + b.dx); mny = Math.min(mny, b.y); mxy = Math.max(mxy, b.y + b.dy); top = Math.max(top, b.z + b.dz); }); return { front: mnx, door: c.L - mxx, right: mny, left: c.W - mxy, top, ceiling: c.H - top, red: sp.red - top, eff: sp.effH - top }; })() : null;
    const mainEnd = boxes.length ? Math.max(...boxes.map((b) => b.x + b.dx)) - sp.x0 : 0, usedLen = mainEnd + Ds, gapSample = 0;
    const reqTotal = groups.reduce((s, g) => s + g.requested, 0), loadTotal = groups.reduce((s, g) => s + g.loaded, 0);
    if (!ver.ok) errors.push('Kiểm tra độc lập phát hiện ' + ver.violations.length + ' lỗi trong phương án (xem chi tiết).');
    if (cog && (Math.abs(cog.xPct - 50) > 12)) warnings.push('Trọng tâm hàng lệch dọc cont: ' + cog.xPct.toFixed(0) + '% chiều dài tính từ vách đầu (nên 40–60%).');
    if (cog && (Math.abs(cog.yPct - 50) > 6)) warnings.push('Trọng tâm hàng lệch ngang cont: ' + cog.yPct.toFixed(0) + '% bề ngang (nên gần 50%).');
    if (c.maxPayload > 0 && loadedKg > c.maxPayload + 1e-6) errors.push('Vượt tải trọng cho phép.');
    if (!(c.redLine > 0)) warnings.push('Chưa nhập red line — đang lấy chiều cao trong của cont làm giới hạn.');
    if (c.redLine > 0 && c.doorH > 0 && c.doorH < c.redLine) warnings.push('Cao cửa (' + r1(c.doorH) + ' mm) thấp hơn red line (' + r1(c.redLine) + ' mm) → giới hạn chiều cao xếp lấy theo cao cửa.');
    if (heightViol.length) warnings.push('Chưa đúng quy tắc xếp từ cao xuống thấp (trong → cửa): dãy ' + heightViol.slice(0, 6).map((v) => v.row + ' thấp hơn dãy ' + v.next).join(', ') + (heightViol.length > 6 ? ' …' : '') + '. Thường do chỉnh dãy bằng tay / dãy mẫu / trải đều / ghép lấp chỗ trống.');
    groups.forEach((g) => { if (g.sku.note) g.note = g.sku.note; });
    return {
      ok: errors.length === 0, errors, warnings, container: c, space: sp, groups, boxes, skus, rows, heightViol,
      verify: ver, maxTier,
      totals: { volReqAll: groups.reduce((a, g) => a + (g.volReq || 0), 0), volFreeInternal: volIn - volBox, volFreeUsable: volUse - volBox, gaps, rows: rows.length, gapSample, sample: nSample, sampleDepth: 0, requested: reqTotal, loaded: loadTotal, left: reqTotal - loadTotal, kg: loadedKg, payload: c.maxPayload, volBox, volUsable: volUse, volInternal: volIn, fillUsablePct: volUse > 0 ? volBox / volUse * 100 : 0, fillInternalPct: volIn > 0 ? volBox / volIn * 100 : 0, usedLength: usedLen, freeLength: sp.Lu - usedLen, effH: sp.effH, cog },
      options: { heightRule: opts.heightRule !== false, sampleOn: opts.sampleOn !== false, sampleQty: sampleQ, stackTop: !!opts.stackTop, mergeTail: !!opts.mergeTail, dateDir: opts.dateDir || 'asc', sortMode: opts.sortMode || 'auto', minSupport: opts.minSupport || 0.7 },
    };
  }
  // TỰ SẮP XẾP HỢP LÝ KHI TRỐNG MỘT BÊN: bề ngang cont thường dư 1 khe < 1 thùng (VD 275 mm) dồn hết về 1 vách → cả khối sát 1 bên.
  //  • khe không mất chỗ (≥ 10% thùng) → mọi mặt hàng không-sole tự đóng SO LE trái/phải từng tầng (cùng số thùng, có đường khí 2 bên + chống nghiêng);
  //  • cont còn trống nhiều (xếp đủ + còn ≥ 15% chiều dài) → cho phép bỏ 1 cột để có khe, ưu tiên DỰNG ĐỨNG;
  //  • hàng nhiều (sát sức chứa) → chỉ dùng cách so le nếu KHÔNG mất thùng và không dài hơn. Chỉ nhận phương án mới khi kiểm tra độc lập vẫn đạt.
  function solveBest(input, opts) {
    const p1 = solveOnce(input, opts);
    if (opts.autoLayout === false || !(p1.totals.requested > 0) || !p1.groups.some((g) => !g.sku.sole && g.loaded > 0)) return p1;
    const spare = p1.totals.left === 0 && p1.totals.freeLength >= 0.15 * p1.space.Lu;
    let p2; try { p2 = solveOnce(input, Object.assign({}, opts, { _auto: true, _airflow: spare, _drop: spare })); } catch (e) { return p1; }
    const applied = p2.groups.some((g) => g.sku._auto && g.patterns.some((q) => q.kind === 'sole'));
    if (!applied || !p2.verify.ok || p2.errors.length || p2.totals.loaded < p1.totals.loaded || (!spare && p2.totals.usedLength > p1.totals.usedLength + 1)) return p1;
    p2.layoutNote = spare ? 'Cont còn trống nhiều → tự đóng so le (sole) trái/phải từng tầng + ưu tiên dựng đứng để khí lạnh lưu thông hai bên.' : 'Khe dư bề ngang không xếp thêm được thùng → tự đóng so le trái/phải từng tầng (không mất chỗ) để có đường khí hai bên và chống nghiêng.';
    return p2;
  }
  // GỢI Ý ĐÓNG THÊM khi còn hàng rớt: thử (1) bỏ chốt hướng + cho đặt nằm, (2) giảm khe vách đầu / cửa về 0, (3) cả hai → báo số thùng đóng thêm được. Chỉ GỢI Ý — người dùng bấm "Áp dụng" mới đổi.
  function buildHints(input, opts, plan) {
    const out = [];
    // hàng ÍT (mới dùng < 50% chiều dài): gợi ý TRẢI ĐỀU thành nhiều dãy thấp thay vì ít dãy cao + trống phía sau
    if (!opts.spread && plan.totals.left === 0 && plan.totals.requested > 0 && plan.totals.usedLength < 0.5 * plan.space.Lu) {
      const sp = solveSpread(input, Object.assign({}, opts, { spread: true, compare: false }), plan);
      if (sp !== plan && sp.spreadNote) out.push({ id: 'spread', gain: 0, loaded: sp.totals.loaded, left: 0, text: 'Hàng ít (mới dùng ' + Math.round(plan.totals.usedLength / plan.space.Lu * 100) + '% chiều dài): trải đều thành ' + sp.totals.rows + ' dãy thấp thay vì ' + plan.totals.rows + ' dãy cao', note: sp.spreadNote, patch: { opts: { spread: true } } });
    }
    if (!(plan.totals.left > 0)) return out; const base = plan.totals.loaded, c = plan.container;
    if (opts.heightRule !== false) { // quy tắc cao → thấp làm tốn chỗ ở vách thiếu → cho người dùng chọn bỏ nếu cần đóng thêm
      try { const fr = solveBest(input, Object.assign({}, opts, { heightRule: false, compare: false, spread: false })); if (fr.verify.ok && fr.totals.loaded > base) out.push({ id: 'free', gain: fr.totals.loaded - base, loaded: fr.totals.loaded, left: fr.totals.left, text: 'Bỏ quy tắc "cao → thấp (trong → cửa)" để đóng thêm — có thể có dãy phía trong thấp hơn dãy phía ngoài', patch: { opts: { heightRule: false } } }); } catch (e) { /* bỏ qua */ }
    }
    const idsOK = (input.skus || []).every((k) => k && k.id != null && k.id !== ''); if (!idsOK) return out;
    const cl = () => JSON.parse(JSON.stringify(input)), tryRun = (inp) => { try { return solveOnce(inp, Object.assign({}, opts, { compare: false, _auto: false, _airflow: false, _drop: false })); } catch (e) { return null; } };
    const need = plan.groups.filter((g) => g.left > 0 && g.ok && (!g.sku.allowLay || g.sku.orient || g.sku.rowPlan || Object.keys(g.sku.rowSet || {}).length)).map((g) => g.sku.id);
    const skuPatch = { allowLay: true, allowRotate: true, allowStand: true, orient: '', rowPlan: '', rowSet: {} }, contPatch = {};
    const hasGap = c.clearFront > 0 || c.clearRear > 0; if (hasGap) { contPatch.clearFront = 0; contPatch.clearRear = 0; }
    const nm = (ids) => plan.groups.filter((g) => ids.includes(g.sku.id)).map((g) => (g.sku.code || 'mặt hàng') + (g.sku.size ? ' ' + g.sku.size : '')).join(', ');
    const variants = [];
    if (need.length) variants.push({ id: 'lay', skus: need, cont: {}, text: 'Bỏ chốt hướng + cho phép đặt nằm / xoay cho ' + nm(need) });
    if (hasGap) variants.push({ id: 'gap', skus: [], cont: contPatch, text: 'Giảm khe vách đầu / khe cửa từ ' + Math.round(c.clearFront) + ' / ' + Math.round(c.clearRear) + ' mm về 0 (đóng sát)' });
    if (need.length && hasGap) variants.push({ id: 'both', skus: need, cont: contPatch, text: 'Cả hai: bỏ chốt hướng + cho đặt nằm cho ' + nm(need) + ' và đóng sát đầu / cửa' });
    variants.forEach((v) => {
      const inp = cl(); inp.skus.forEach((k) => { if (v.skus.includes(k.id)) Object.assign(k, skuPatch); }); Object.assign(inp.container, v.cont);
      const r = tryRun(inp); if (!r || !r.verify.ok) return; const gain = r.totals.loaded - base;
      if (gain > 0) out.push({ id: v.id, gain, loaded: r.totals.loaded, left: r.totals.left, text: v.text, patch: { skus: Object.fromEntries(v.skus.map((id) => [id, skuPatch])), container: v.cont } });
    });
    return out.sort((a, b) => b.gain - a.gain).slice(0, 3);
  }
  // TRẢI ĐỀU (hàng ít): thay vì đóng đặc 10 dãy cao rồi để trống phía sau, hạ số tầng (thấp hơn, chắc hàng, không đổ) để hàng trải ra tới ~spreadPct % chiều dài cont.
  // Chọn số tầng NHỎ NHẤT mà vẫn đủ hàng và không dài quá mức cho phép.
  function solveSpread(input, opts, p1) {
    const Lu = p1.space.Lu, Ds = p1.totals.sampleDepth || 0, pct = Math.min(100, Math.max(20, num(opts.spreadPct, 70))), main = Lu - Ds, target = main * pct / 100;
    if (!(p1.totals.requested > 0) || p1.totals.left > 0 || p1.maxTier < 2) return p1;
    if (p1.totals.usedLength - Ds >= target - 1) return p1;
    const note = (p, extra) => {
      const rt = {}; p.boxes.forEach((b) => { rt[b.row] = Math.max(rt[b.row] || 0, b.tier); }); const ts = Object.keys(rt).map((k) => rt[k]), mn = Math.min(...ts), mx = Math.max(...ts), rws = ts.length;
      return 'Hàng ít nên trải đều: ' + rws + ' dãy (dùng ' + Math.round((p.totals.usedLength - Ds) / main * 100) + '% chiều dài chứa hàng), mỗi dãy ' + (mn === mx ? mx : mn + '–' + mx) + ' tầng (≈ ' + Math.round(p.totals.loaded / Math.max(1, rws)) + ' thùng/dãy) — thay vì ' + p1.totals.rows + ' dãy cao ' + p1.maxTier + ' tầng.' + (extra || '');
    };
    // CÁCH 1 (ưu tiên): trải ra ĐỦ số dãy vừa chiều dài; số tầng từng dãy chênh nhau tối đa 1 (VD 5 tầng, 4 tầng xen nhau; dãy cao đứng trước)
    try {
      const info = {};
      p1.boxes.forEach((b) => { if (b.wall == null || b.wall < 0) return; const g = (info[b.group] = info[b.group] || { n: 0, walls: {}, t1: {} }); g.n++; const w = (g.walls[b.wall] = g.walls[b.wall] || { x0: 1e18, x1: -1e18 }); w.x0 = Math.min(w.x0, b.x); w.x1 = Math.max(w.x1, b.x + b.dx); if (b.tier === 1) g.t1[b.wall] = (g.t1[b.wall] || 0) + 1; });
      const gi = Object.keys(info); let totalLen = 0;
      gi.forEach((k) => { const g = info[k], ws = Object.keys(g.walls); g.wc = ws.length; g.D = Math.max(...ws.map((w) => g.walls[w].x1 - g.walls[w].x0)); g.capT = Math.max(1, ...Object.keys(g.t1).map((w) => g.t1[w])); g.Tsum = Math.ceil(g.n / g.capT); totalLen += g.wc * g.D; });
      if (gi.length && totalLen > 0) {
        const sc = target / totalLen, seqs = {};
        gi.forEach((k) => {
          const g = info[k], n = Math.min(g.Tsum, Math.max(g.wc, Math.floor(g.wc * sc + 1e-9))), base = Math.floor(g.Tsum / n), extra = g.Tsum - base * n;
          seqs[p1.groups[+k].sku.id] = Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0)); // BẬC THANG: các dãy nhiều tầng liền nhau ở phía vách đầu, hết rồi mới tới các dãy ít tầng hơn (KHÔNG xen kẽ)
        });
        const p2 = solveBest(input, Object.assign({}, opts, { _tierSeqs: seqs, spread: false, compare: false }));
        if (p2.totals.left === 0 && p2.verify.ok && !p2.errors.length && p2.totals.usedLength - (p2.totals.sampleDepth || 0) <= target + 1 && p2.totals.rows > p1.totals.rows) { p2.spreadNote = note(p2); return p2; }
      }
    } catch (e) { /* thử cách 2 */ }
    // CÁCH 2 (dự phòng): hạ ĐỀU số tầng của mọi dãy tới mức nhỏ nhất vẫn vừa mục tiêu
    for (let t = 1; t < p1.maxTier; t++) {
      let p; try { p = solveBest(input, Object.assign({}, opts, { _tierCap: t, spread: false, compare: false })); } catch (e) { continue; }
      if (p.totals.left === 0 && p.verify.ok && !p.errors.length && p.totals.usedLength - (p.totals.sampleDepth || 0) <= target + 1) { p.spreadNote = note(p); p.spreadTier = t; return p; }
    }
    return p1;
  }
  function solve(input, options) {
    const opts = Object.assign({ mergeTail: true, stackTop: true, heightRule: true, sampleOn: true, sampleQty: 10, autoLayout: true, spread: false, spreadPct: 70, dateDir: 'asc', sortMode: 'auto', minSupport: 0.7, compare: true }, options || {});
    let plan = solveBest(input, opts);
    if (opts.spread) plan = solveSpread(input, opts, plan);
    if (opts.compare && plan.totals.requested > 0 && !plan.spreadNote) {
      try {
        const alt = solveBest(input, Object.assign({}, opts, { mergeTail: !opts.mergeTail }));
        plan.compare = { mergeTail: !opts.mergeTail, loaded: alt.totals.loaded, kg: alt.totals.kg, ok: alt.ok, usedLength: alt.totals.usedLength, delta: alt.totals.loaded - plan.totals.loaded };
      } catch (e) { /* bỏ qua */ }
    }
    if (opts.hints !== false) { try { plan.hints = buildHints(input, opts, plan); } catch (e) { plan.hints = []; } }
    return plan;
  }

  return { PERMS, previewTpl, parseColPlan, PRESETS, solve, verify, normContainer, makeSpace, normSku, orientationsOf, passDoor, natCmp, dateVal, num, EPS };
});
;

/* ===================== (2) DỰNG 3D — c3d-view ===================== */
/* MODULE "CONTAINER LOADING 3D" — DỰNG HÌNH 3D bằng Three.js (PC 8.57). Chỉ vẽ + lọc hiển thị; mọi tính toán nằm ở c3d-engine.js.
   Toạ độ engine (mm): x dọc cont (0 = vách đầu, L = cửa), y ngang, z cao.  Toạ độ scene (m): X = x, Y = z (lên trên), Z = y; tâm cont đặt ở gốc.
   Vẽ theo yêu cầu: xoay / zoom / kéo (OrbitControls) · bật tắt từng vách · red line · kích thước cont + thùng · màu theo mặt hàng · lọc theo lớp / nhóm / thứ tự đóng
   · 4 góc nhìn (tổng thể, từ trên, nhìn ngang, từ cửa). Các thùng của mọi nhóm được gộp thành 1 mesh + 1 lưới cạnh → mượt với vài nghìn thùng. */
(function (root) {
  'use strict';
  const T = root.THREE;
  const SC = 0.001; // mm → m
  const fmtM = (mm) => (mm / 1000).toFixed(2) + ' m';

  function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '')); const n = m ? parseInt(m[1], 16) : 0x4a90d9; return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  function View(host) {
    this.host = host;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'c3d-canvas'; host.appendChild(this.canvas);
    this.labelLayer = document.createElement('div'); this.labelLayer.className = 'c3d-labels'; host.appendChild(this.labelLayer);
    this.renderer = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(36, 1, 0.05, 400);
    this.camera.position.set(9, 6, 9);
    this.controls = new T.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = false; this.controls.screenSpacePanning = true; this.controls.maxPolarAngle = Math.PI * 0.499 + 0.0001;
    this.controls.addEventListener('change', () => this.invalidate());
    this.scene.add(new T.HemisphereLight(0xffffff, 0x8a97aa, 0.95));
    const dl = new T.DirectionalLight(0xffffff, 0.75); dl.position.set(6, 12, 8); this.scene.add(dl);
    const dl2 = new T.DirectionalLight(0xffffff, 0.35); dl2.position.set(-8, 6, -6); this.scene.add(dl2);
    this.gCont = new T.Group(); this.gCargo = new T.Group(); this.gHL = new T.Group(); this.scene.add(this.gCont, this.gCargo, this.gHL);
    this.labels = []; this.selLabels = [];
    this.plan = null; this.colors = []; this.filter = { tiers: null, groups: null, rows: null, seqMax: null };
    this.opt = { walls: { right: true, left: false, ceil: false, front: true }, redline: true, dims: true, glabels: false, rowlabels: false, wallOpacity: 0.16, usable: true };
    this.visible = []; this.selected = null; this.selRow = null; this.hover = null; this.onPick = null; this.onHover = null; this.onRowPick = null;
    this._dirty = true; this._raf = 0; this._pickReq = null;
    this.light = false;
    this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(host);
    this.canvas.addEventListener('pointermove', (e) => { this._pickReq = { e, click: false }; this.invalidate(); });
    this.canvas.addEventListener('pointerleave', () => { this.setHover(null); });
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
    this.canvas.addEventListener('pointerup', (e) => { if (down && Math.abs(e.clientX - down.x) < 4 && Math.abs(e.clientY - down.y) < 4 && Date.now() - down.t < 500) { this._pickReq = { e, click: true }; this.invalidate(); } down = null; });
    this.ray = new T.Raycaster(); this.mouse = new T.Vector2();
    this.resize();
  }
  const P = View.prototype;

  P.invalidate = function () { if (this._dirty) return; this._dirty = true; this._raf = requestAnimationFrame(() => this.render()); };
  P.resize = function () {
    const w = Math.max(50, this.host.clientWidth), h = Math.max(50, this.host.clientHeight);
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this._dirty = false; this.invalidate();
  };
  P.setLight = function (light) { this.light = !!light; if (this.plan) this.buildContainer(); this.buildCargo(); };

  // ------------------------------------------------------------ container
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) { (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose()); } } }
  P.addLabel = function (text, v3, cls, bag) {
    const el = document.createElement('div'); el.className = 'c3d-lab ' + (cls || ''); el.textContent = text; this.labelLayer.appendChild(el);
    const o = { el, pos: v3.clone() }; (bag || this.labels).push(o); return o;
  };
  P.clearLabels = function (bag) { (bag || this.labels).forEach((o) => o.el.remove()); (bag || this.labels).length = 0; };

  P.buildContainer = function () {
    clearGroup(this.gCont); this.clearLabels(this.labels); if (this.cargoLabels) this.clearLabels(this.cargoLabels); this.cargoLabels = []; this.wall = {};
    const p = this.plan; if (!p) return;
    const c = p.container, sp = p.space, L = c.L * SC, W = c.W * SC, H = c.H * SC, light = this.light;
    const lineCol = light ? 0x4a3a10 : 0xb6c4da, wallCol = light ? 0x6b5316 : 0xa9bddb;
    // sàn + rãnh chữ T
    const floor = new T.Mesh(new T.PlaneGeometry(L, W), new T.MeshLambertMaterial({ color: light ? 0xf0e4bf : 0x3a4250 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; this.gCont.add(floor);
    const rails = []; for (let z = -W / 2 + 0.1; z < W / 2 - 0.05; z += 0.12) { rails.push(-L / 2, 0.001, z, L / 2, 0.001, z); }
    const rg = new T.BufferGeometry(); rg.setAttribute('position', new T.Float32BufferAttribute(rails, 3));
    this.gCont.add(new T.LineSegments(rg, new T.LineBasicMaterial({ color: light ? 0xcdb877 : 0x566073, transparent: true, opacity: 0.8 })));
    // vách
    const mkWall = (name, w, h, pos, rot) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: wallCol, transparent: true, opacity: this.opt.wallOpacity, side: T.DoubleSide, depthWrite: false }));
      m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); m.visible = !!this.opt.walls[name]; m.renderOrder = 5; this.wall[name] = m; this.gCont.add(m);
    };
    mkWall('right', L, H, [0, H / 2, -W / 2], null);
    mkWall('left', L, H, [0, H / 2, W / 2], null);
    mkWall('ceil', L, W, [0, H, 0], [-Math.PI / 2, 0, 0]);
    mkWall('front', W, H, [-L / 2, H / 2, 0], [0, Math.PI / 2, 0]);
    // khung thép
    const fe = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(L, H, W)), new T.LineBasicMaterial({ color: lineCol })); fe.position.y = H / 2; this.gCont.add(fe);
    // vùng chứa hàng (sau khi trừ khe hở + đến chiều cao cho phép)
    if (this.opt.usable) {
      const uL = sp.Lu * SC, uW = sp.Wu * SC, uH = sp.effH * SC;
      const ue = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(uL, uH, uW)), new T.LineDashedMaterial({ color: 0x22c3a6, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.8 }));
      ue.position.set((sp.x0 + sp.Lu / 2) * SC - L / 2, uH / 2, (sp.y0 + sp.Wu / 2) * SC - W / 2); ue.computeLineDistances(); this.gCont.add(ue);
    }
    // red line (đường tối đa xếp hàng — chừa khoảng thông gió lạnh phía trên)
    this.redGroup = new T.Group();
    const rl = sp.red * SC;
    const rg2 = new T.BufferGeometry(); rg2.setAttribute('position', new T.Float32BufferAttribute([-L / 2, rl, -W / 2, L / 2, rl, -W / 2, L / 2, rl, W / 2, -L / 2, rl, W / 2], 3));
    this.redGroup.add(new T.LineLoop(rg2, new T.LineBasicMaterial({ color: 0xef4444 })));
    const rp = new T.Mesh(new T.PlaneGeometry(L, W), new T.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false })); rp.rotation.x = -Math.PI / 2; rp.position.y = rl; this.redGroup.add(rp);
    if (sp.effH < sp.red - 1) {
      const eh = sp.effH * SC, g3 = new T.BufferGeometry(); g3.setAttribute('position', new T.Float32BufferAttribute([-L / 2, eh, -W / 2, L / 2, eh, -W / 2, L / 2, eh, W / 2, -L / 2, eh, W / 2], 3));
      this.redGroup.add(new T.LineLoop(g3, new T.LineBasicMaterial({ color: 0xf59e0b })));
    }
    this.redGroup.visible = !!this.opt.redline; this.gCont.add(this.redGroup);
    this.redLab = this.addLabel('Red line ' + fmtM(sp.red), new T.Vector3(-L / 2, rl, -W / 2), 'red', this.labels); this.redLab.el.style.display = this.opt.redline ? '' : 'none';
    // kích thước cont
    this.dimGroup = new T.Group(); this.dimLabs = [];
    const dl = (a, b, off, txt, cls) => {
      const pts = [a, b]; const geo = new T.BufferGeometry().setFromPoints(pts);
      this.dimGroup.add(new T.Line(geo, new T.LineBasicMaterial({ color: light ? 0x945806 : 0x7fb0ff })));
      const tk = new T.BufferGeometry().setFromPoints([a.clone().add(off.clone().multiplyScalar(-0.5)), a.clone().add(off.clone().multiplyScalar(0.5)), b.clone().add(off.clone().multiplyScalar(-0.5)), b.clone().add(off.clone().multiplyScalar(0.5))]);
      this.dimGroup.add(new T.LineSegments(tk, new T.LineBasicMaterial({ color: light ? 0x945806 : 0x7fb0ff })));
      const mid = a.clone().add(b).multiplyScalar(0.5); this.dimLabs.push(this.addLabel(txt, mid, cls || 'dim', this.labels));
    };
    const g = 0.28;
    dl(new T.Vector3(-L / 2, 0, -W / 2 - g), new T.Vector3(L / 2, 0, -W / 2 - g), new T.Vector3(0, 0, 0.12), 'Dài ' + fmtM(c.L));
    dl(new T.Vector3(L / 2 + g, 0, -W / 2), new T.Vector3(L / 2 + g, 0, W / 2), new T.Vector3(0.12, 0, 0), 'Rộng ' + fmtM(c.W));
    dl(new T.Vector3(-L / 2 - g * 0.6, 0, -W / 2 - g * 0.6), new T.Vector3(-L / 2 - g * 0.6, H, -W / 2 - g * 0.6), new T.Vector3(0.12, 0, 0), 'Cao ' + fmtM(c.H));
    this.doorLab = this.addLabel('Cửa ' + fmtM(c.doorW) + ' × ' + fmtM(c.doorH), new T.Vector3(L / 2, 0.02, 0), 'door', this.labels);
    this.gCont.add(this.dimGroup); this.dimGroup.visible = !!this.opt.dims; this.dimLabs.forEach((o) => { o.el.style.display = this.opt.dims ? '' : 'none'; }); this.doorLab.el.style.display = this.opt.dims ? '' : 'none';
    this.cent = new T.Vector3(0, H / 2, 0); this.rad = 0.5 * Math.sqrt(L * L + W * W + H * H);
    this.invalidate();
  };

  // ------------------------------------------------------------ hàng hoá
  P.setPlan = function (plan, colors) {
    const first = !this.plan; // chỉ đặt góc nhìn lần đầu; sau đó giữ nguyên góc người dùng đang xem (đổi cont thì bấm nút góc nhìn)
    this.plan = plan; this.colors = colors || []; this.selected = null;
    if (this.selRow != null && !((plan && plan.rows) || []).some((r) => r.row === this.selRow)) this.selRow = null; // giữ dãy đang chọn qua các lần tính lại
    this.filter = { tiers: null, groups: null, rows: null, seqMax: null };
    this.buildContainer(); this.buildCargo(); if (first) this.setPreset('iso');
  };
  P.updateColors = function (colors) { this.colors = colors || []; this.buildCargo(); };
  P.setFilter = function (f) { this.filter = Object.assign({}, this.filter, f); this.buildCargo(); };

  P.buildCargo = function () {
    clearGroup(this.gCargo); this.clearLabels(this.cargoLabels || (this.cargoLabels = []));
    this.visible = []; const p = this.plan; if (!p) { this.invalidate(); return; }
    const L = p.container.L * SC, W = p.container.W * SC, f = this.filter, colors = this.colors;
    const vis = []; p.boxes.forEach((b, i) => {
      if (f.tiers && !f.tiers.has(b.tier)) return; if (f.rows && !f.rows.has(b.row)) return; if (f.groups && !f.groups.has(b.group)) return; if (f.seqMax != null && b.seq > f.seqMax) return; vis.push(i);
    });
    this.visible = vis; const n = vis.length;
    if (n) {
      const pos = new Float32Array(n * 108), nor = new Float32Array(n * 108), col = new Float32Array(n * 108), ep = new Float32Array(n * 72);
      let o = 0, eo = 0;
      const F = [ // 6 mặt: pháp tuyến + 4 đỉnh (theo vòng)
        [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]]],
        [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [[0, -1, 0], [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]],
        [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
      ];
      const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
      vis.forEach((bi) => {
        const b = p.boxes[bi], rgb0 = hexToRgb(colors[b.group]), rgb = b.sample ? rgb0.map((v) => v * 0.45 + 0.55) : rgb0; // thùng mẫu hải quan: màu nhạt / sáng hơn
        const x0 = b.x * SC - L / 2, y0 = b.z * SC, z0 = b.y * SC - W / 2, sx = b.dx * SC, sy = b.dz * SC, sz = b.dy * SC; // KHÔNG chừa khe (mặt thùng khít nhau, viền phân tách)
        F.forEach((face) => {
          const nv = face[0], q = face[1];
          [0, 1, 2, 0, 2, 3].forEach((k) => {
            const v = q[k]; pos[o] = x0 + v[0] * sx; pos[o + 1] = y0 + v[1] * sy; pos[o + 2] = z0 + v[2] * sz;
            nor[o] = nv[0]; nor[o + 1] = nv[1]; nor[o + 2] = nv[2]; col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2]; o += 3;
          });
        });
        E.forEach((e) => { ep[eo++] = x0 + e[0] * sx; ep[eo++] = y0 + e[1] * sy; ep[eo++] = z0 + e[2] * sz; ep[eo++] = x0 + e[3] * sx; ep[eo++] = y0 + e[4] * sy; ep[eo++] = z0 + e[5] * sz; });
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.computeBoundingSphere(); g.computeBoundingBox();
      this.cargoMesh = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })); this.gCargo.add(this.cargoMesh);
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(ep, 3));
      this.gCargo.add(new T.LineSegments(eg, new T.LineBasicMaterial({ color: this.light ? 0x3b2a06 : 0x0a0d12, transparent: true, opacity: 0.38 })));
    } else this.cargoMesh = null;
    this.refreshRowLabels(); this.drawGapDims();
    // nhãn nhóm (mã hàng · size · ngày · số thùng) — KHÔNG ghi kích thước thùng (PC 8.69: số liệu dài che màn hình 3D)
    const gb = {};
    vis.forEach((bi) => { const b = p.boxes[bi], gg = gb[b.group] = gb[b.group] || { n: 0, minx: 1e9, maxx: -1e9, miny: 1e9, maxy: -1e9, maxz: 0 }; gg.n++; gg.minx = Math.min(gg.minx, b.x); gg.maxx = Math.max(gg.maxx, b.x + b.dx); gg.miny = Math.min(gg.miny, b.y); gg.maxy = Math.max(gg.maxy, b.y + b.dy); gg.maxz = Math.max(gg.maxz, b.z + b.dz); });
    Object.keys(gb).forEach((k) => {
      const g = p.groups[+k], s = gb[k], sk = g.sku;
      const txt = (sk.code || 'Mặt hàng ' + (+k + 1)) + (sk.size ? ' · ' + sk.size : '') + (sk.date ? ' · ' + sk.date : '') + '\n' + s.n + ' thùng';
      const v = new T.Vector3(((s.minx + s.maxx) / 2) * SC - L / 2, (s.maxz + 40) * SC, ((s.miny + s.maxy) / 2) * SC - W / 2);
      const o = this.addLabel(txt, v, 'grp', this.cargoLabels); o.el.style.borderColor = this.colors[+k] || '#888'; o.el.style.display = this.opt.glabels ? '' : 'none'; o.group = +k;
    });
    this.setHover(null, true); this.drawSelection();
    this.invalidate();
  };

  // KHOẢNG TRỐNG vẽ thẳng trong khung 3D (theo ô "Kích thước"): mặt hàng cao nhất → trần / red line · dãy cuối → cửa · thùng đầu → vách đầu
  P.drawGapDims = function () {
    const p = this.plan; if (!p || !p.totals || !p.totals.gaps) return; const g = p.totals.gaps, c = p.container, L = c.L * SC, W = c.W * SC, z = W / 2 - 0.02, col = 0xf59e0b;
    const mm = (v) => (v >= 1000 ? (v / 1000).toFixed(2) + ' m' : Math.round(v) + ' mm');
    const line = (a, b, txt) => { const geo = new T.BufferGeometry().setFromPoints([a, b]); const ln = new T.Line(geo, new T.LineBasicMaterial({ color: col, depthTest: false })); ln.renderOrder = 9; this.gCargo.add(ln); const o = this.addLabel(txt, a.clone().add(b).multiplyScalar(0.5), 'gap', this.cargoLabels); o.el.style.display = this.opt.dims ? '' : 'none'; o.isGap = true; ln.visible = !!this.opt.dims; (this.gapLines || (this.gapLines = [])).push(ln); };
    this.gapLines = []; let xmax = 0, xmin = 1e18; p.boxes.forEach((b) => { xmax = Math.max(xmax, b.x + b.dx); xmin = Math.min(xmin, b.x); });
    const top = g.top * SC, H = c.H * SC;
    line(new T.Vector3(xmax * SC - L / 2 - 0.05, top, z), new T.Vector3(xmax * SC - L / 2 - 0.05, H, z), 'Trần còn ' + mm(g.ceiling) + ' · red line còn ' + mm(g.red));
    if (g.door > 20) line(new T.Vector3(xmax * SC - L / 2, 0.03, z), new T.Vector3(L / 2, 0.03, z), 'Dãy cuối → cửa ' + mm(g.door));
    if (g.front > 30) line(new T.Vector3(-L / 2, 0.03, z), new T.Vector3(xmin * SC - L / 2, 0.03, z), 'Vách đầu ' + mm(g.front));
  };
  // Số DÃY dọc mép sàn: MẶC ĐỊNH ẨN (đỡ rối mắt) — chỉ hiện dãy đang chọn; bật ô "Số dãy" mới hiện hết.
  P.refreshRowLabels = function () {
    const arr = this.cargoLabels || (this.cargoLabels = []);
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i].isRow) { arr[i].el.remove(); arr.splice(i, 1); }
    const p = this.plan; if (!p) { this.invalidate(); return; }
    const L = p.container.L * SC, W = p.container.W * SC, vis = {}; this.visible.forEach((bi) => { vis[p.boxes[bi].row] = 1; });
    let list = (p.rows || []).filter((r) => vis[r.row]);
    if (this.opt.rowlabels) { const k = Math.max(1, Math.ceil(list.length / 18)); list = list.filter((r, i) => i % k === 0 || r.row === this.selRow); }
    else list = list.filter((r) => r.row === this.selRow);
    list.forEach((r) => { const o = this.addLabel((r.sample ? '🛃 ' : '') + 'Dãy ' + r.row, new T.Vector3(((r.x0 + r.x1) / 2) * SC - L / 2, 0.02, W / 2 + 0.16), 'row' + (r.sample ? ' samp' : '') + (r.row === this.selRow ? ' sel' : ''), arr); o.isRow = true; });
    this.invalidate();
  };
  P.setSelRow = function (r, silent) { this.selRow = r; this.refreshRowLabels(); this.drawSelection(); if (!silent && this.onRowPick) this.onRowPick(r); this.invalidate(); };

  // ------------------------------------------------------------ chọn / rê chuột
  P.pickAt = function (e) {
    if (!this.cargoMesh) return null;
    const r = this.canvas.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObject(this.cargoMesh, false)[0]; if (!hit) return null;
    const vi = Math.floor(hit.faceIndex / 12); return this.visible[vi] != null ? this.visible[vi] : null;
  };
  P.setHover = function (bi, silent) {
    if (this.hover === bi) return; this.hover = bi; this.canvas.style.cursor = bi != null ? 'pointer' : 'grab';
    if (!silent && this.onHover) this.onHover(bi, this._lastEv); this.drawSelection(); this.invalidate();
  };
  P.select = function (bi) { this.selected = bi; this.selRow = (bi != null && this.plan) ? this.plan.boxes[bi].row : null; this.refreshRowLabels(); this.drawSelection(); if (this.onPick) this.onPick(bi); if (this.onRowPick) this.onRowPick(this.selRow); this.invalidate(); };
  P.drawSelection = function () {
    clearGroup(this.gHL); this.clearLabels(this.selLabels); const p = this.plan; if (!p) return;
    const L = p.container.L * SC, W = p.container.W * SC;
    const mkBox = (bi, col, w) => {
      const b = p.boxes[bi]; if (!b) return; const g = new T.EdgesGeometry(new T.BoxGeometry(b.dx * SC * 1.003, b.dz * SC * 1.003, b.dy * SC * 1.003));
      const m = new T.LineSegments(g, new T.LineBasicMaterial({ color: col })); m.position.set((b.x + b.dx / 2) * SC - L / 2, (b.z + b.dz / 2) * SC, (b.y + b.dy / 2) * SC - W / 2); this.gHL.add(m);
      if (w) { const q = new T.Mesh(new T.BoxGeometry(b.dx * SC * 1.01, b.dz * SC * 1.01, b.dy * SC * 1.01), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); q.position.copy(m.position); this.gHL.add(q); }
    };
    if (this.selRow != null) { // khung quanh DÃY đang chọn
      let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18, z1 = 0; p.boxes.forEach((b) => { if (b.row === this.selRow) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x + b.dx); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y + b.dy); z1 = Math.max(z1, b.z + b.dz); } });
      if (x1 > x0) { const fr = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry((x1 - x0) * SC * 1.004, z1 * SC * 1.004, (y1 - y0) * SC * 1.004)), new T.LineBasicMaterial({ color: 0x22e0a0 })); fr.position.set(((x0 + x1) / 2) * SC - L / 2, z1 * SC / 2, ((y0 + y1) / 2) * SC - W / 2); this.gHL.add(fr); }
    }
    if (this.hover != null && this.hover !== this.selected) mkBox(this.hover, 0xffffff, false);
    if (this.selected != null) {
      mkBox(this.selected, 0xffd60a, true);
      const b = p.boxes[this.selected]; if (b) {
        const cx = (b.x + b.dx / 2) * SC - L / 2, cy = (b.z + b.dz / 2) * SC, cz = (b.y + b.dy / 2) * SC - W / 2, x0 = b.x * SC - L / 2, x1 = (b.x + b.dx) * SC - L / 2, y1 = (b.z + b.dz) * SC, z0 = b.y * SC - W / 2, z1 = (b.y + b.dy) * SC - W / 2;
        this.addLabel(Math.round(b.dx) + ' mm', new T.Vector3(cx, y1, z0), 'bdim', this.selLabels); this.addLabel(Math.round(b.dy) + ' mm', new T.Vector3(x1, y1, cz), 'bdim', this.selLabels); this.addLabel(Math.round(b.dz) + ' mm', new T.Vector3(x1, cy, z1), 'bdim', this.selLabels);
      }
    }
  };

  // ------------------------------------------------------------ tuỳ chọn hiển thị
  P.setWall = function (name, on) { this.opt.walls[name] = !!on; if (this.wall && this.wall[name]) this.wall[name].visible = !!on; this.invalidate(); };
  P.setWallOpacity = function (v) { this.opt.wallOpacity = v; if (this.wall) Object.keys(this.wall).forEach((k) => { this.wall[k].material.opacity = v; }); this.invalidate(); };
  P.setOpt = function (k, on) {
    this.opt[k] = !!on;
    if (k === 'redline') { if (this.redGroup) this.redGroup.visible = !!on; if (this.redLab) this.redLab.el.style.display = on ? '' : 'none'; }
    if (k === 'dims') { (this.cargoLabels || []).forEach((o) => { if (o.isGap) o.el.style.display = on ? '' : 'none'; }); (this.gapLines || []).forEach((l) => { l.visible = !!on; }); if (this.dimGroup) this.dimGroup.visible = !!on; (this.dimLabs || []).forEach((o) => { o.el.style.display = on ? '' : 'none'; }); if (this.doorLab) this.doorLab.el.style.display = on ? '' : 'none'; }
    if (k === 'glabels') (this.cargoLabels || []).forEach((o) => { if (!o.isRow) o.el.style.display = on ? '' : 'none'; });
    if (k === 'rowlabels') this.refreshRowLabels();
    if (k === 'usable') { this.buildContainer(); this.buildCargo(); }
    this.invalidate();
  };

  // ------------------------------------------------------------ góc nhìn
  P.setPreset = function (name, keepWalls) {
    if (!this.plan) return;
    const R = this.rad, c = this.cent.clone(), cam = this.camera, cc = this.plan.container, Lm = cc.L * SC, Wm = cc.W * SC, Hm = cc.H * SC;
    const tanV = Math.tan(cam.fov * Math.PI / 360), asp = Math.max(0.6, cam.aspect), fit = (w, h) => Math.max(h / 2 / tanV, w / 2 / (tanV * asp));
    let dir, dist;
    if (name === 'top') { dir = new T.Vector3(0, 1, 0.001); dist = fit(Lm * 1.08, Wm * 1.2) + Hm / 2; }
    else if (name === 'side') { dir = new T.Vector3(0, 0.1, 1); dist = fit(Lm * 1.1, Hm * 1.35) + Wm / 2; }
    else if (name === 'door') { dir = new T.Vector3(1, 0.08, 0); dist = fit(Wm * 1.35, Hm * 1.45) + Lm / 2; }
    else { dir = new T.Vector3(0.78, 0.62, 0.62); dist = Math.max(R * 1.6, fit(1.42 * (Lm * 0.78 + Wm * 0.62), 1.45 * (Hm * 0.85 + 0.53 * (Lm * 0.62 + Wm * 0.78)))); }
    dir.normalize(); if (name !== 'top') c.y -= R * 0.09; // đẩy hình lên cao hơn 1 chút cho khỏi bị thanh "Thứ tự đóng" che
    cam.position.copy(c).add(dir.multiplyScalar(dist)); this.controls.target.copy(c); cam.lookAt(c); this.controls.update();
    if (!keepWalls) { // tự ẩn vách che tầm nhìn
      const w = { iso: { right: true, left: false, ceil: false, front: true }, top: { right: true, left: true, ceil: false, front: true }, side: { right: true, left: false, ceil: false, front: true }, door: { right: true, left: true, ceil: false, front: true } }[name];
      if (w) Object.keys(w).forEach((k) => this.setWall(k, w[k]));
      if (this.onWalls) this.onWalls(Object.assign({}, this.opt.walls));
    }
    this.invalidate();
  };

  // ------------------------------------------------------------ vẽ
  P.render = function () {
    this._dirty = false;
    if (this._pickReq) {
      const rq = this._pickReq; this._pickReq = null; this._lastEv = rq.e; const bi = this.pickAt(rq.e);
      if (rq.click) this.select(bi); else this.setHover(bi);
    }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight, v = new T.Vector3();
    const place = (o) => {
      v.copy(o.pos).project(this.camera);
      if (v.z > 1 || v.z < -1) { o.el.style.visibility = 'hidden'; return; }
      o.el.style.visibility = ''; o.el.style.transform = 'translate(' + ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px,' + ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px) translate(-50%,-50%)';
    };
    this.labels.forEach(place); this.selLabels.forEach(place);
    // nhãn mặt hàng: dịch xuống nếu đè lên nhau (nhìn từ cửa / từ trên các nhóm thẳng hàng nên dễ chồng)
    const gl = (this.cargoLabels || []).filter((o) => o.el.style.display !== 'none' && !o.isRow); (this.cargoLabels || []).filter((o) => o.isRow && o.el.style.display !== 'none').forEach(place); gl.forEach(place);
    const rects = []; gl.map((o) => { v.copy(o.pos).project(this.camera); return { o, y: -v.y, vis: v.z > -1 && v.z < 1 }; }).sort((p, q) => p.y - q.y).forEach((it) => {
      if (!it.vis) return; const el = it.o.el, w2 = el.offsetWidth, h2 = el.offsetHeight; v.copy(it.o.pos).project(this.camera);
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h, n = 0;
      while (n++ < 14 && rects.some((r) => Math.abs(r.x - x) < (r.w + w2) / 2 && Math.abs(r.y - y) < (r.h + h2) / 2)) y += h2 + 2;
      rects.push({ x, y, w: w2, h: h2 }); el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%)';
    });
  };
  P.screenshot = function (bg) {
    this.renderer.render(this.scene, this.camera); const src = this.canvas, c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.fillStyle = bg || '#ffffff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0); return c.toDataURL('image/png');
  };
  P.dispose = function () { cancelAnimationFrame(this._raf); this._ro.disconnect(); this.renderer.dispose(); };

  root.C3DView = { create: (host) => new View(host) };
})(typeof window !== 'undefined' ? window : this);
;

/* ===================== (3) GIAO DIỆN + LƯU — container-3d ===================== */
/* MODULE "CONTAINER LOADING 3D" — GIAO DIỆN + LƯU TRỮ (PC 8.57).
   Lõi tính toán: C3DEngine (c3d-engine.js) · Dựng 3D: C3DView (c3d-view.js).
   Database: dbKey 'module14' = module14_container3d.xlsx
     C3D_Container — container người dùng đã sửa / thêm (mẫu có sẵn nằm trong code; sửa mẫu = ghi 1 dòng "ghi đè", Xóa = về mẫu gốc)
     C3D_Plan      — phương án đã lưu (container + danh sách hàng + tuỳ chọn; kết quả TÍNH LẠI khi mở, không lưu toạ độ từng thùng)
     C3D_State     — trạng thái làm việc lần trước (tự lưu) */
(function () {
  'use strict';
  const E = window.C3DEngine, DB = 'module14', SH_C = 'C3D_Container', SH_P = 'C3D_Plan', SH_S = 'C3D_State', SH_T = 'C3D_Thung'; // C3D_Thung = DANH MỤC loại thùng (kích thước, kg, cách xếp) dùng lại cho các cont sau
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = E.num, clone = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (n, d) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); // nghìn "," · thập phân "."
  const fmtKg = (n) => fmt(n, 2) + ' kg';
  const fmtM = (mm) => fmt(mm / 1000, 2) + ' m';
  const m3 = (mm3, d) => fmt(mm3 / 1e9, d == null ? 2 : d); // mm³ → m³
  const PAL = ['#3b82f6', '#f97316', '#22c55e', '#e11d48', '#a855f7', '#eab308', '#06b6d4', '#84cc16', '#ec4899', '#14b8a6', '#f43f5e', '#8b5cf6'];
  const TYPES = [['20RF', "20' RF"], ['40RF', "40' RF"], ['40HC', "40' HC RF"], ['KHAC', 'Khác']];
  const CKEYS = ['L', 'W', 'H', 'doorW', 'doorH', 'redLine', 'clearFront', 'clearRear', 'clearSide'];

  let bootOk; const booted = new Promise((r) => { bootOk = r; });
  const S = {
    cat: [], unit: 'mm', saved: [], cid: 'rf40hc', cont: null, skus: [], colors: {}, opts: { mergeTail: true, stackTop: true, heightRule: true, sampleOn: true, sampleQty: 10, dateDir: 'asc', sortMode: 'auto' },
    plan: null, plans: [], user: { canWrite: true, canExport: true, ten: '' }, view: null, hidden: { tiers: new Set(), groups: new Set(), rows: new Set() }, selRow: null, seqMax: null, playing: 0,
    calcT: 0, saveT: 0, loaded: false, autoMiss: {}, openedAuto: '', selBox: null, layerOpen: true,
  };
  const f = () => (S.unit === 'cm' ? 10 : 1);
  const toU = (mm) => { const v = mm / f(); return String(Math.round(v * 100) / 100); };
  const fromU = (s) => num(s) * f();
  let toastT = 0;
  function toast(t) { const e = $('c3dToast'); e.textContent = t; e.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { e.hidden = true; }, 3800); }

  // ------------------------------------------------------------------ lưu / nạp
  async function readSheet(name) { try { const r = await window.dbAPI.readSheet(DB, name); return r && r.ok && Array.isArray(r.data) ? r.data : []; } catch (e) { return []; } }
  const unpack = (x) => { try { return JSON.parse(String(x && x.data || '').replace(/^__JSON__/, '')); } catch (e) { return null; } };
  async function writeSheet(name, rows) {
    const r = await window.dbAPI.writeSheets(DB, { [name]: rows }); if (!r || r.ok === false) throw new Error((r && r.error) || 'Không lưu được'); return true;
  }
  async function loadAll() {
    const [c, p, s, th] = await Promise.all([readSheet(SH_C), readSheet(SH_P), readSheet(SH_S), readSheet(SH_T)]);
    S.cat = th.map((x) => { const v = unpack(x); return v ? { id: String(x.id), name: String(x.name || ''), capNhat: String(x.capNhat || ''), v } : null; }).filter(Boolean);
    S.saved = c.map((x) => { const v = unpack(x); return v ? { id: String(x.id || v.id || ''), v } : null; }).filter((x) => x && x.id);
    S.plans = p.map((x) => { const d = unpack(x); return d ? { id: String(x.id), name: String(x.name || ''), capNhat: String(x.capNhat || ''), contName: String(x.contName || ''), loaded: +x.loaded || 0, requested: +x.requested || 0, data: d } : null; }).filter(Boolean).sort((a, b) => b.capNhat.localeCompare(a.capNhat));
    const st = s.length ? unpack(s[0]) : null;
    if (st) {
      if (st.unit) S.unit = st.unit; if (st.cid) S.cid = st.cid; if (st.cont) S.cont = st.cont; if (Array.isArray(st.skus)) S.skus = st.skus; if (st.colors) S.colors = st.colors; if (st.opts) S.opts = Object.assign(S.opts, st.opts); if (st.autoMiss && typeof st.autoMiss === 'object') S.autoMiss = st.autoMiss;
    }
  }
  function scheduleSave() {
    if (!S.user.canWrite || !S.loaded) return; clearTimeout(S.saveT);
    S.saveT = setTimeout(() => { writeSheet(SH_S, [{ id: 'state', capNhat: new Date().toISOString(), data: '__JSON__' + JSON.stringify({ unit: S.unit, cid: S.cid, cont: S.cont, skus: S.skus, colors: S.colors, opts: S.opts, autoMiss: S.autoMiss }) }]).catch(() => { /* tự lưu: bỏ qua lỗi */ }); }, 900);
  }
  async function persistContainers() {
    const rows = S.saved.map((c) => ({ id: c.id, name: c.v.name || '', builtin: E.PRESETS.some((p) => p.id === c.id) ? '1' : '', data: '__JSON__' + JSON.stringify(c.v) }));
    await writeSheet(SH_C, rows);
  }

  // ------------------------------------------------------------------ container
  function contList() {
    const ov = {}; S.saved.forEach((c) => { ov[c.id] = c.v; });
    const out = E.PRESETS.map((p) => Object.assign({}, p, ov[p.id] || {}, { id: p.id, builtin: true, edited: !!ov[p.id] }));
    S.saved.filter((c) => !E.PRESETS.some((p) => p.id === c.id)).forEach((c) => out.push(Object.assign({}, c.v, { id: c.id, builtin: false })));
    return out;
  }
  function pickContainer(id) {
    const c = contList().find((x) => x.id === id) || contList()[2]; S.cid = c.id; S.cont = clone(c); delete S.cont.builtin; delete S.cont.edited;
  }
  const contView = () => { const c = S.cont, cur = contList().find((x) => x.id === S.cid); return { c, cur }; };

  // ------------------------------------------------------------------ mặt hàng
  let skuSeq = 0;
  const newSku = (o) => Object.assign({ id: 's' + Date.now().toString(36) + (skuSeq++), code: '', name: '', size: '', date: '', qty: 100, L: 520, W: 280, H: 190, kg: 10, allowRotate: true, allowStand: true, allowLay: false, sole: false, maxLayers: 0, note: '' }, o || {});
  function colorFor(code) {
    const k = String(code || '').trim() || '(trống)'; if (S.colors[k]) return S.colors[k];
    const used = new Set(Object.values(S.colors)), free = PAL.find((c) => !used.has(c)); S.colors[k] = free || PAL[Object.keys(S.colors).length % PAL.length]; return S.colors[k];
  }
  function shade(hex, d) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    l = Math.min(0.82, Math.max(0.22, l + d));
    const q = (p, qq, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (qq - p) * 6 * t; if (t < 1 / 2) return qq; if (t < 2 / 3) return p + (qq - p) * (2 / 3 - t) * 6; return p; };
    let R, G, B; if (s === 0) R = G = B = l; else { const qq = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - qq; R = q(p, qq, h + 1 / 3); G = q(p, qq, h); B = q(p, qq, h - 1 / 3); }
    const x = (v) => ('0' + Math.round(v * 255).toString(16)).slice(-2); return '#' + x(R) + x(G) + x(B);
  }
  function groupColors(plan) {
    const seen = {}, VAR = [0, 0.1, -0.1, 0.18, -0.16];
    return plan.groups.map((g) => { const k = String(g.sku.code || '').trim() || '(trống)'; seen[k] = (seen[k] || 0); const v = VAR[seen[k] % VAR.length]; seen[k]++; return shade(colorFor(k), v); });
  }

  // ------------------------------------------------------------------ vẽ cột trái
  const fld = (label, attrs, val, cls) => '<label class="c3d-f ' + (cls || '') + '"><span>' + label + '</span><input type="text" inputmode="decimal" autocomplete="off" ' + attrs + ' value="' + esc(val) + '"></label>';
  function renderSide() {
    const c = S.cont, lst = contList(), u = S.unit;
    const opt = (id, t) => '<option value="' + esc(id) + '"' + (id === S.cid ? ' selected' : '') + '>' + esc(t) + '</option>';
    const cont = '<div class="c3d-card"><h3>1. Container lạnh <small>sửa theo cont thực tế</small></h3>' +
      '<div class="c3d-row"><label class="c3d-f" style="flex:2 1 220px"><span>Chọn container</span><select id="cSel">' + lst.map((x) => opt(x.id, (x.builtin ? '' : '★ ') + x.name + (x.edited ? ' (đã sửa)' : '') + ' — ' + m3(x.L * x.W * x.H, 1) + ' m³')).join('') + '</select></label>' +
      '<label class="c3d-f" style="flex:0 0 96px"><span>Đơn vị dài</span><select id="cUnit"><option value="mm"' + (u === 'mm' ? ' selected' : '') + '>mm</option><option value="cm"' + (u === 'cm' ? ' selected' : '') + '>cm</option></select></label></div>' +
      '<div class="c3d-grid g2"><label class="c3d-f"><span>Tên container</span><input type="text" data-c="name" value="' + esc(c.name) + '"></label>' +
      '<label class="c3d-f"><span>Loại</span><select data-c="type">' + TYPES.map((t) => '<option value="' + t[0] + '"' + (c.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="c3d-grid" style="margin-top:7px">' +
      fld('Dài trong <span class="u">(' + u + ')</span>', 'data-c="L"', toU(c.L)) + fld('Rộng trong <span class="u">(' + u + ')</span>', 'data-c="W"', toU(c.W)) + fld('Cao trong <span class="u">(' + u + ')</span>', 'data-c="H"', toU(c.H)) +
      fld('Rộng cửa <span class="u">(' + u + ')</span>', 'data-c="doorW"', toU(c.doorW)) + fld('Cao cửa <span class="u">(' + u + ')</span>', 'data-c="doorH"', toU(c.doorH)) + fld('Tải trọng cho phép <span class="u">(kg)</span>', 'data-c="maxPayload"', String(c.maxPayload || '')) +
      fld('Red line — cao tối đa xếp <span class="c3d-q" tabindex="0">?<span class="c3d-qb">Vạch đỏ trên vách cont lạnh: hàng KHÔNG được cao quá vạch này để khí lạnh lưu thông phía trên. Thông số mẫu chỉ tham khảo — nhập theo cont thực tế.</span></span> <span class="u">(' + u + ')</span>', 'data-c="redLine"', toU(c.redLine), 'span3') +
      fld('Khe vách đầu <span class="c3d-q" tabindex="0">?<span class="c3d-qb">Khe vách đầu (có cửa gió lạnh) / khe cửa / hai bên: để trống khoảng này khi xếp.</span></span> <span class="u">(' + u + ')</span>', 'data-c="clearFront"', toU(c.clearFront)) + fld('Khe cửa <span class="u">(' + u + ')</span>', 'data-c="clearRear"', toU(c.clearRear)) + fld('Khe hai bên <span class="u">(' + u + ')</span>', 'data-c="clearSide"', toU(c.clearSide)) +
      '</div><div class="c3d-ro" id="cRo"></div>' +
      '<div class="c3d-btns"><button type="button" class="c3d-btn sm" data-act="cSave">Lưu thay đổi cont này</button><button type="button" class="c3d-btn sm" data-act="cSaveNew">Lưu thành cont mới</button><button type="button" class="c3d-btn sm danger" data-act="cDel">' + (lst.find((x) => x.id === S.cid) && lst.find((x) => x.id === S.cid).builtin ? 'Khôi phục mẫu gốc' : 'Xóa cont này') + '</button></div></div>';
    const skus = '<div class="c3d-card"><h3>2. Hàng hóa đóng vào 1 cont <small>SL = tổng số thùng cần đóng</small></h3>' +
      '<div class="c3d-btns" style="margin:0 0 9px"><button type="button" class="c3d-btn sm pri" data-act="sAdd">+ Thêm mặt hàng</button><button type="button" class="c3d-btn sm" data-act="sCat" title="Lấy loại thùng đã lưu (kích thước, kg, cách xếp) — chỉ nhập lại số lượng">Từ danh mục thùng</button><button type="button" class="c3d-btn sm" data-act="sPaste">Dán từ Excel</button><button type="button" class="c3d-btn sm" data-act="sDemo">Ví dụ mẫu</button><button type="button" class="c3d-btn sm danger" data-act="sClear">Xóa hết</button></div>' +
      '<div id="skuList">' + (S.skus.length ? S.skus.map(skuCard).join('') : '<div class="c3d-empty-l">Chưa có mặt hàng. Bấm “+ Thêm mặt hàng”, “Dán từ Excel” hoặc “Ví dụ mẫu”.</div>') + '</div>' +
      '<p class="c3d-note">Hệ thống tự sắp thứ tự đóng: <b>mặt hàng → size → ngày</b>; nhóm đầu vào SÂU NHẤT (sát vách đầu), nhóm cuối sát cửa. Mỗi dòng (mã · size · ngày) xếp liền thành 1 khối, không trộn lẫn.</p></div>';
    const o = S.opts;
    const optc = '<div class="c3d-card"><h3>3. Cách xếp</h3><div class="c3d-radio">' +
      '<label><input type="radio" name="mrg" value="0"' + (!o.mergeTail ? ' checked' : '') + '><span><b>Tách riêng từng mặt hàng</b><small>Mỗi mặt hàng bắt đầu ở 1 vách mới, ranh giới rõ ràng.</small></span></label>' +
      '<label><input type="radio" name="mrg" value="1"' + (o.mergeTail ? ' checked' : '') + '><span><b>Ghép lấp chỗ trống cạnh vách cuối</b> (khuyên dùng — không để trống giữa các mặt hàng)<small>Mặt hàng kế tiếp xếp vào phần trống cạnh mặt hàng trước (cùng vách, khác cột) — tiết kiệm chỗ hơn.</small></span></label></div>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Bề ngang cont thường dư 1 khe nhỏ dồn về 1 vách. Bật: tự đóng so le trái/phải từng tầng (không mất chỗ); cont còn trống nhiều thì ưu tiên thoáng khí + dựng đứng"><input type="checkbox" id="oAuto"' + (o.autoLayout !== false ? ' checked' : '') + '> Tự sắp xếp hợp lý khi trống một bên (so le trái/phải, ưu tiên thoáng khí)</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Khi hàng ít hơn sức chứa: không đóng đặc ít dãy cao rồi để trống phía sau (dễ đổ) mà hạ số tầng, trải thành nhiều dãy thấp hơn"><input type="checkbox" id="oSpread"' + (o.spread ? ' checked' : '') + '> Hàng ít: trải đều nhiều dãy thấp (chắc hàng, không để dãy cao đứng riêng)</label>' + (o.spread ? '<div class="c3d-grid g2" style="margin-top:6px">' + fld('Trải tối đa <span class="u">(% chiều dài chứa hàng; 100 = đủ mọi dãy vừa cont)</span>', 'id="oSpreadPct"', o.spreadPct || 70) + '</div>' : '') +
      '<label class="c3d-chk" style="margin-top:9px" title="Hết mặt hàng này, mặt hàng sau được chồng lên khoảng trống phía trên vách cuối của mặt hàng trước (nếu còn chiều cao dưới red line)"><input type="checkbox" id="oStack"' + (o.stackTop !== false ? ' checked' : '') + '> Cho mặt hàng sau chồng lên khoảng trống phía trên mặt hàng trước</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Đóng hàng theo thứ tự cao → thấp từ trong cùng ra cửa: dãy phía trong KHÔNG được thấp hơn dãy phía ngoài. Vách thiếu thùng ở cuối mỗi mặt hàng được xếp cột đầy tới red line (hẹp hơn) thay vì xếp thấp. Tắt nếu cần đóng thêm thùng."><input type="checkbox" id="oHeight"' + (o.heightRule !== false ? ' checked' : '') + '> Xếp từ cao xuống thấp (trong cùng → cửa cont)</label>' +
      '<label class="c3d-chk" style="margin-top:9px" title="Bật: hệ thống tự dành 2 dãy cuối (sát cửa) làm hàng mẫu hải quan, trộn đủ mọi mặt hàng / mọi date, mỗi dãy đầy đặn như các dãy khác; số thùng mẫu mỗi mặt hàng tự tính (khoảng 10–30). Tắt: không đánh dấu hàng mẫu."><input type="checkbox" id="oSampleOn"' + (o.sampleOn !== false ? ' checked' : '') + '> Hàng mẫu hải quan: tự chia ở các dãy cuối, trộn đủ mọi mặt hàng</label>' +
      (o.sampleOn !== false ? '<div class="c3d-note" style="margin:4px 0 0">Không cần nhập số lượng: các dãy ĐÓNG SAU CÙNG (sát cửa) tự trộn đủ mọi mặt hàng / date (VD 1 dãy 50 thùng chia 15 · 15 · 20), các dãy phía trong vẫn đều như thường. Đã nằm trong SL và tải trọng.</div>' : '<div class="c3d-note" style="margin:4px 0 0">Đang TẮT: không đánh dấu hàng mẫu hải quan.</div>') +
      '<div class="c3d-grid g2" style="margin-top:9px"><label class="c3d-f"><span>Thứ tự đóng</span><select id="oSort"><option value="auto"' + (o.sortMode !== 'manual' ? ' selected' : '') + '>Mặt hàng › Size › Ngày (tự động)</option><option value="manual"' + (o.sortMode === 'manual' ? ' selected' : '') + '>Đúng thứ tự tôi nhập</option></select></label>' +
      '<label class="c3d-f"><span>Ngày (trong cùng size)</span><select id="oDate"><option value="asc"' + (o.dateDir !== 'desc' ? ' selected' : '') + '>Ngày cũ vào trong trước</option><option value="desc"' + (o.dateDir === 'desc' ? ' selected' : '') + '>Ngày mới vào trong trước</option></select></label></div></div>';
    $('c3dSide').innerHTML = cont + skus + optc; updateRo();
  }
  function skuCard(k, i) {
    const col = colorFor(k.code), u = S.unit, a = 'data-s="' + esc(k.id) + '"';
    const chk = (key, label, title) => '<label class="c3d-chk" title="' + esc(k.orient && ['allowRotate', 'allowStand', 'allowLay'].includes(key) ? 'Đang chốt hướng đặt thủ công — chọn “Tự động” để dùng lại ô này' : (title || '')) + '"><input type="checkbox" ' + a + ' data-f="' + key + '"' + (k[key] ? ' checked' : '') + (k.orient && ['allowRotate', 'allowStand', 'allowLay'].includes(key) ? ' disabled' : '') + '> ' + label + '</label>';
    return '<div class="c3d-sku" style="--sk:' + col + '" ' + a + '><div class="c3d-sku-h"><span class="no">#' + (i + 1) + '</span><input type="color" value="' + col + '" data-colorcode="' + esc(k.code) + '" title="Màu của mã hàng này (các dòng cùng mã hàng dùng chung màu)"><span class="sp"></span>' +
      '<button type="button" class="c3d-btn sm" data-act="sCatSave" ' + a + ' title="Lưu kích thước + kg + cách xếp của loại thùng này vào danh mục để dùng cho các cont sau">Lưu danh mục</button><button type="button" class="c3d-btn sm" data-act="sDup" ' + a + ' title="Nhân bản dòng này (đổi size / ngày)">Nhân bản</button><button type="button" class="c3d-btn sm danger" data-act="sDel" ' + a + '>Xóa</button></div>' +
      '<div class="c3d-grid">' + '<label class="c3d-f span2"><span>Mã hàng (mặt hàng)</span><input type="text" ' + a + ' data-f="code" value="' + esc(k.code) + '" placeholder="VD: SP001"></label>' + fld('SL thùng', a + ' data-f="qty"', k.qty) +
      '<label class="c3d-f"><span>Size</span><input type="text" ' + a + ' data-f="size" value="' + esc(k.size) + '" placeholder="VD: M, L, 500g"></label><label class="c3d-f"><span>Date (ngày SX)</span><input type="text" ' + a + ' data-f="date" value="' + esc(k.date) + '" placeholder="dd/mm/yyyy"></label>' + fld('kg / thùng', a + ' data-f="kg"', k.kg) + '</div>' +
      '<div class="c3d-grid" style="margin-top:6px">' + fld('Dài thùng <span class="u">(' + u + ')</span>', a + ' data-f="L" data-len="1"', toU(k.L)) + fld('Rộng thùng <span class="u">(' + u + ')</span>', a + ' data-f="W" data-len="1"', toU(k.W)) + fld('Cao thùng <span class="u">(' + u + ')</span>', a + ' data-f="H" data-len="1"', toU(k.H)) + '</div>' +
      '<div class="c3d-note" style="margin:0 0 6px" data-vol="' + esc(k.id) + '">' + volText(k) + '</div>' + catNote(k, a) + '<label class="c3d-f span3" style="margin-bottom:6px"><span>Hướng đặt thùng <span class="u">(tự xoay cho khớp thực tế — hệ thống xếp theo hướng bạn chọn)</span></span><select ' + a + ' data-f="orient">' + oriOpts(k.orient, k) + '</select></label>' + '<label class="c3d-f span3" style="margin-bottom:6px"><span>Dãy mẫu — cách xếp trong 1 LỚP của 1 dãy <span class="u">(VD: 6 nằm 2 đứng · các dãy còn lại lặp lại mẫu này · để trống = tự động)</span></span><div style="display:flex;gap:6px"><input type="text" ' + a + ' data-f="rowPlan" value="' + esc(k.rowPlan || '') + '" placeholder="VD: 6 nằm 2 đứng"><button type="button" class="c3d-btn sm" data-act="sTpl" ' + a + ' style="white-space:nowrap">Sắp dãy mẫu…</button></div></label>' + (k.rowSet && Object.keys(k.rowSet).length ? '<div class="c3d-note" style="margin:0 0 6px">Đang chỉnh riêng ' + Object.keys(k.rowSet).length + ' dãy bằng tay. <button type="button" class="c3d-btn sm" data-act="sRowClr" ' + a + '>Bỏ chỉnh từng dãy</button></div>' : '') + '<div class="c3d-flags">' + chk('allowRotate', 'Cho xoay', 'Xoay thùng 90° trên mặt sàn (đổi dài ↔ rộng)') + chk('allowStand', 'Giữ cao gốc', 'Cho đặt đúng chiều CAO bạn nhập thẳng đứng') + chk('allowLay', 'Cho lật', 'Cho phép lật thùng (đổi chiều cao thành chiều dài / rộng): nằm ↔ đứng ↔ dựng cao') + chk('sole', 'Xếp sole', 'So le trái/phải: tầng 1 dồn sát vách này chừa khe vách kia, tầng 2 ngược lại → có đường thoáng cho hơi lạnh chạy dọc cont') + '</div>' +
      '<div class="c3d-grid g2">' + fld('Chồng tối đa <span class="u">(tầng, 0 = không giới hạn)</span>', a + ' data-f="maxLayers"', k.maxLayers || 0) + '<label class="c3d-f"><span>Tên hàng (không bắt buộc)</span><input type="text" ' + a + ' data-f="name" value="' + esc(k.name) + '"></label>' +
      '<label class="c3d-f span2"><span>Ghi chú đặc biệt khi đóng hàng</span><input type="text" ' + a + ' data-f="note" value="' + esc(k.note) + '" placeholder="VD: không chồng quá 5 tầng, hàng dễ vỡ, để sát cửa…"></label></div></div>';
  }
  const ONAME = { L: 'Dài', W: 'Rộng', H: 'Cao' };
  // Tên hướng theo CHIỀU CAO THÙNG khi đặt (cách gọi ngoài kho): cao nhỏ nhất = NẰM, cao vừa = ĐỨNG, cao lớn nhất = DỰNG CAO
  const vname = (dz, sk) => { const v = [sk.L, sk.W, sk.H].slice().sort((a, b) => a - b); return Math.abs(dz - v[0]) < 0.01 ? 'nằm' : (Math.abs(dz - v[1]) < 0.01 ? 'đứng' : 'dựng cao'); };
  const oriLabel = (p, sk) => { if (!sk) return ONAME[p[0]] + ' dọc cont · ' + ONAME[p[1]] + ' ngang · ' + ONAME[p[2]] + ' đứng'; const m = { L: sk.L, W: sk.W, H: sk.H }; return vname(m[p[2]], sk).toUpperCase() + ' · cao ' + Math.round(m[p[2]]) + ' (dọc cont ' + Math.round(m[p[0]]) + ' · ngang ' + Math.round(m[p[1]]) + ')'; };
  const oriOpts = (cur, sk) => '<option value=""' + (!cur ? ' selected' : '') + '>Tự động (hệ thống chọn hướng tốt nhất)</option>' + E.PERMS.map((p) => '<option value="' + p + '"' + (cur === p ? ' selected' : '') + '>' + oriLabel(p, sk) + '</option>').join('');
  const tokText = (t) => ({ nam: 'nằm', dung: 'đứng', cao: 'dựng cao' }[t] || t);
  const permOfBox = (b, k) => { const m = { L: k.L, W: k.W, H: k.H }; return E.PERMS.find((p) => Math.abs(m[p[0]] - b.dx) < 0.01 && Math.abs(m[p[1]] - b.dy) < 0.01 && Math.abs(m[p[2]] - b.dz) < 0.01) || ''; };
  function catNote(k, a) { const cm = S.cat.find((c) => catKey(c.v) === catKey(k)); if (!cm || !String(k.code || '').trim()) return ''; const d = ['L', 'W', 'H', 'kg'].some((f) => Math.abs((cm.v[f] || 0) - (k[f] || 0)) > 0.001); return d ? '<div class="c3d-note" style="margin:0 0 6px;color:#e0a100">Danh mục có loại này với kích thước <b>' + Math.round(cm.v.L) + '×' + Math.round(cm.v.W) + '×' + Math.round(cm.v.H) + ' mm · ' + fmt(cm.v.kg, 2) + ' kg</b>. <button type="button" class="c3d-btn sm" data-act="sCatUse" ' + a + '>Dùng kích thước danh mục</button> <button type="button" class="c3d-btn sm" data-act="sCatSave" ' + a + '>Cập nhật danh mục theo dòng này</button></div>' : '<div class="c3d-note" style="margin:0 0 6px">✓ Khớp danh mục loại thùng.</div>'; }
  const volText = (k) => 'Khối 1 thùng: <b>' + fmt(k.L * k.W * k.H / 1e9, 4) + ' m³</b> · tổng ' + fmt(k.qty) + ' thùng: <b>' + fmt(k.L * k.W * k.H * k.qty / 1e9, 2) + ' m³</b>';
  function updVol(id) { const k = S.skus.find((x) => x.id === id), el = document.querySelector('[data-vol="' + id + '"]'); if (k && el) el.innerHTML = volText(k); }
  function updateRo() {
    const c = S.cont, el = $('cRo'); if (!el) return; const red = c.redLine > 0 ? c.redLine : c.H, eff = Math.min(c.H, red, c.doorH > 0 ? c.doorH : c.H);
    const vol = c.L * c.W * c.H / 1e9, lu = c.L - c.clearFront - c.clearRear, wu = c.W - 2 * c.clearSide;
    el.innerHTML = '<span>Thể tích trong: <b>' + fmt(vol, 2) + ' m³</b></span><span>Chứa hàng được (tới giới hạn xếp, trừ khe): <b>' + fmt(lu * wu * eff / 1e9, 2) + ' m³</b></span><span>Cao xếp tối đa: <b>' + fmtM(eff) + '</b></span><span>Vùng chứa hàng: <b>' + fmtM(lu) + ' × ' + fmtM(wu) + '</b></span>' + (c.doorH > 0 && c.redLine > 0 && c.doorH < c.redLine ? '<span class="warn"><b>⚠ Cao cửa thấp hơn red line — lấy theo cao cửa</b></span>' : '') + (!(c.redLine > 0) ? '<span class="warn"><b>⚠ Chưa nhập red line</b></span>' : '');
    const cap = lu * wu * eff / 1e9, pv = vol > 0 ? Math.max(0, Math.min(100, cap / vol * 100)) : 0, ph = c.H > 0 ? Math.max(0, Math.min(100, eff / c.H * 100)) : 0;
    el.insertAdjacentHTML('beforeend', '<div class="c3d-pb"><div class="r"><span>Thể tích chứa được / thể tích trong</span><b>' + fmt(pv, 0) + '%</b></div><div class="c3d-bar"><i style="width:' + pv + '%"></i></div></div><div class="c3d-pb"><div class="r"><span>Cao xếp tối đa / cao trong</span><b>' + fmt(ph, 0) + '%</b></div><div class="c3d-bar hi"><i style="width:' + ph + '%"></i></div></div>');
  }

  // ------------------------------------------------------------------ sự kiện cột trái
  function onSideInput(e) {
    const t = e.target;
    if (t.dataset.c) { // container
      const k = t.dataset.c; if (k === 'name' || k === 'type') S.cont[k] = t.value; else if (k === 'maxPayload') S.cont[k] = num(t.value); else S.cont[k] = fromU(t.value);
      updateRo(); scheduleCalc(); scheduleSave(); return;
    }
    if (t.id === 'oSpreadPct') { S.opts.spreadPct = Math.min(100, Math.max(20, num(t.value) || 70)); scheduleCalc(); scheduleSave(); return; }
    if (t.dataset.s && t.dataset.f) {
      const k = S.skus.find((x) => x.id === t.dataset.s); if (!k) return; const fl = t.dataset.f;
      if (t.type === 'checkbox') { k[fl] = t.checked; } else if (t.dataset.len) k[fl] = fromU(t.value); else if (['qty', 'maxLayers'].includes(fl)) k[fl] = Math.max(0, Math.floor(num(t.value))); else if (fl === 'kg') k[fl] = num(t.value); else k[fl] = t.value;
      if (fl === 'code') { const card = t.closest('.c3d-sku'); if (card) { const col = colorFor(k.code); card.style.setProperty('--sk', col); const ci = card.querySelector('input[type=color]'); if (ci) { ci.value = col; ci.dataset.colorcode = k.code; } } }
      updVol(k.id); scheduleCalc(); scheduleSave();
    }
  }
  function onSideChange(e) {
    const t = e.target;
    if (t.id === 'cSel') { pickContainer(t.value); renderSide(); scheduleCalc(0); if (S.view) S.view.setPreset(curView()); scheduleSave(); return; }
    if (t.id === 'cUnit') { S.unit = t.value; renderSide(); scheduleSave(); return; }
    if (t.name === 'mrg') { S.opts.mergeTail = t.value === '1'; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSampleOn') { S.opts.sampleOn = t.checked; renderSide(); scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oHeight') { S.opts.heightRule = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSpread') { S.opts.spread = t.checked; renderSide(); scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oAuto') { S.opts.autoLayout = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oStack') { S.opts.stackTop = t.checked; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oSort') { S.opts.sortMode = t.value; scheduleCalc(0); scheduleSave(); return; }
    if (t.id === 'oDate') { S.opts.dateDir = t.value; scheduleCalc(0); scheduleSave(); return; }
    if (t.dataset.colorcode != null) { S.colors[String(t.dataset.colorcode).trim() || '(trống)'] = t.value; renderSide(); applyColors(); scheduleSave(); return; }
    if (t.dataset.s && t.dataset.f === 'orient') { const k = S.skus.find((x) => x.id === t.dataset.s); if (k) { k.orient = t.value; renderSide(); scheduleCalc(0); scheduleSave(); } return; }
    if (t.dataset.s && t.type === 'checkbox') {
      const k = S.skus.find((x) => x.id === t.dataset.s); if (k) { k[t.dataset.f] = t.checked; scheduleCalc(0); scheduleSave(); }
      return;
    }
    // chuẩn hoá chữ số ngay TẠI Ô (KHÔNG vẽ lại cả cột: vẽ lại lúc ô mất tiêu điểm sẽ nuốt mất cú bấm nút "Lưu…" ngay sau đó)
    if (t.dataset.c && CKEYS.includes(t.dataset.c)) t.value = toU(S.cont[t.dataset.c]);
    else if (t.dataset.c === 'maxPayload') t.value = String(S.cont.maxPayload || '');
    else if (t.dataset.s && t.dataset.len) { const k = S.skus.find((x) => x.id === t.dataset.s); if (k) t.value = toU(k[t.dataset.f]); }
  }
  async function onSideClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return; const act = b.dataset.act, id = b.dataset.s;
    if (act === 'sAdd') { S.skus.push(newSku()); renderSide(); scheduleCalc(0); scheduleSave(); const cards = document.querySelectorAll('.c3d-sku'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ block: 'nearest' }); const ip = last.querySelector('[data-f=code]'); if (ip) ip.focus(); } }
    else if (act === 'sDel') { S.skus = S.skus.filter((x) => x.id !== id); renderSide(); scheduleCalc(0); scheduleSave(); }
    else if (act === 'sDup') { const i = S.skus.findIndex((x) => x.id === id); if (i >= 0) { const c = clone(S.skus[i]); c.id = newSku().id; S.skus.splice(i + 1, 0, c); renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sClear') { if (!S.skus.length || confirm('Xóa toàn bộ danh sách hàng hóa?')) { S.skus = []; renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sDemo') { if (S.skus.length && !confirm('Thay danh sách hàng hiện tại bằng ví dụ mẫu?')) return; S.skus = demoSkus(); renderSide(); scheduleCalc(0); scheduleSave(); }
    else if (act === 'sRowClr') { const k = S.skus.find((x) => x.id === id); if (k) { k.rowSet = {}; renderSide(); scheduleCalc(0); scheduleSave(); } }
    else if (act === 'sTpl') openTpl(id);
    else if (act === 'sCat') openCat();
    else if (act === 'sCatSave') saveSkuToCat(id);
    else if (act === 'sCatUse') { const k = S.skus.find((x) => x.id === id), cm = k && S.cat.find((c) => catKey(c.v) === catKey(k)); if (cm) { CAT_FIELDS.forEach((f) => { if (f !== 'code' && f !== 'size') k[f] = cm.v[f] === undefined ? '' : clone(cm.v[f]); }); renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã dùng kích thước trong danh mục.'); } }
    else if (act === 'sPaste') openPaste();
    else if (act === 'cSave') saveContainer(false);
    else if (act === 'cSaveNew') saveContainer(true);
    else if (act === 'cDel') delContainer();
  }
  function demoSkus() {
    const mk = (o) => newSku(Object.assign({ L: 520, W: 280, H: 190, kg: 10 }, o));
    return [
      mk({ code: 'SP001', size: 'M', date: '15/09/2026', qty: 420, name: 'Hàng mẫu A' }), mk({ code: 'SP001', size: 'M', date: '22/09/2026', qty: 360, name: 'Hàng mẫu A' }),
      mk({ code: 'SP001', size: 'L', date: '20/09/2026', qty: 480, name: 'Hàng mẫu A' }), mk({ code: 'SP002', size: 'S', date: '18/09/2026', qty: 300, name: 'Hàng mẫu B', L: 600, W: 400, H: 220, kg: 12, sole: true, note: 'Xếp sole, để sát cửa' }),
    ];
  }

  // ------------------------------------------------------------------ lưu container
  async function saveContainer(asNew) {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được container.'); return; }
    const c = clone(S.cont); if (!String(c.name || '').trim()) { toast('Nhập tên container trước khi lưu.'); return; }
    let id = S.cid; const cur = contList().find((x) => x.id === S.cid);
    if (asNew || !cur) { id = 'cx' + Date.now().toString(36); if (contList().some((x) => x.name === c.name)) c.name += ' (bản sao)'; }
    c.id = id; delete c.builtin; delete c.edited;
    const i = S.saved.findIndex((x) => x.id === id); if (i >= 0) S.saved[i] = { id, v: c }; else S.saved.push({ id, v: c });
    try { await persistContainers(); S.cid = id; S.cont = clone(c); renderSide(); toast(asNew ? 'Đã lưu thành container mới.' : 'Đã lưu thay đổi container.'); scheduleSave(); } catch (e) { toast('Không lưu được: ' + (e.message || e)); }
  }
  async function delContainer() {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; }
    const cur = contList().find((x) => x.id === S.cid); if (!cur) return;
    if (cur.builtin) { if (!cur.edited) { toast('Đây là thông số mẫu gốc, chưa sửa.'); return; } if (!confirm('Khôi phục "' + cur.name + '" về thông số mẫu gốc?')) return; }
    else if (!confirm('Xóa container "' + cur.name + '"?')) return;
    S.saved = S.saved.filter((x) => x.id !== S.cid);
    try { await persistContainers(); pickContainer(cur.builtin ? cur.id : 'rf40hc'); renderSide(); scheduleCalc(0); toast(cur.builtin ? 'Đã khôi phục mẫu gốc.' : 'Đã xóa container.'); scheduleSave(); } catch (e) { toast('Không lưu được: ' + (e.message || e)); }
  }

  // ------------------------------------------------------------------ dán từ Excel
  function openPaste() {
    $('c3dDlg').innerHTML = '<h2>Dán danh sách hàng từ Excel</h2><p class="c3d-note" style="margin-top:0">Copy các ô trong Excel rồi dán vào đây. Thứ tự cột: <b>Mã hàng · Size · Date · Số lượng thùng · Dài · Rộng · Cao · kg/thùng</b> (có thể thêm: Xoay · Đặt nằm · Dựng đứng · Sole · Chồng tối đa · Ghi chú; ô tích dùng 1/0 hoặc x). Kích thước tính theo đơn vị đang chọn (<b>' + S.unit + '</b>). Dòng tiêu đề (nếu có) tự bỏ qua.</p>' +
      '<textarea id="pasteTa" rows="10" placeholder="SP001\tM\t15/09/2026\t420\t520\t280\t190\t10"></textarea><div class="foot"><button type="button" class="c3d-btn" id="pasteCancel">Hủy</button><button type="button" class="c3d-btn pri" id="pasteOk">Thêm vào danh sách</button></div>';
    $('c3dModal').hidden = false; $('pasteTa').focus();
    $('pasteCancel').onclick = closeModal;
    $('pasteOk').onclick = () => {
      const rows = $('pasteTa').value.split(/\r?\n/).map((l) => l.split('\t')).filter((r) => r.some((x) => String(x).trim())); let added = 0;
      const yes = (v, d) => { const t = String(v == null ? '' : v).trim().toLowerCase(); if (!t) return d; return ['1', 'x', 'c', 'có', 'co', 'true', 'y', 'yes', '✓'].includes(t); };
      rows.forEach((r) => {
        const L = fromU(r[4]), W = fromU(r[5]), H = fromU(r[6]); if (!(L > 0 && W > 0 && H > 0) || !(num(r[3]) > 0)) return;
        S.skus.push(newSku({ code: String(r[0] || '').trim(), size: String(r[1] || '').trim(), date: String(r[2] || '').trim(), qty: Math.floor(num(r[3])), L, W, H, kg: num(r[7]), allowRotate: yes(r[8], true), allowLay: yes(r[9], false), allowStand: yes(r[10], true), sole: yes(r[11], false), maxLayers: Math.floor(num(r[12])), note: String(r[13] || '') })); added++;
      });
      closeModal(); if (!added) { toast('Không đọc được dòng nào (cần Dài / Rộng / Cao / Số lượng là số > 0).'); return; }
      renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã thêm ' + added + ' dòng hàng.');
    };
  }
  function closeModal() { $('c3dModal').hidden = true; }

  // ------------------------------------------------------------------ tính toán
  function scheduleCalc(delay) { clearTimeout(S.calcT); S.calcT = setTimeout(calc, delay == null ? 450 : delay); }
  function calc() {
    clearTimeout(S.calcT);
    const t0 = performance.now();
    try { S.plan = E.solve({ container: S.cont, skus: S.skus }, S.opts); }
    catch (err) { console.error(err); toast('Lỗi tính toán: ' + (err.message || err)); return; }
    S.ms = Math.round(performance.now() - t0); S.hidden = { tiers: new Set(), groups: new Set(), rows: new Set() }; S.seqMax = null; S.selBox = null; stopPlay();
    const gc = groupColors(S.plan); S.gcolors = gc;
    if (S.view) { S.view.setPlan(S.plan, gc); }
    renderReport(); renderLayers(); renderSeq(); $('c3dSel').hidden = true;
  }
  function applyColors() { if (!S.plan) return; S.gcolors = groupColors(S.plan); if (S.view) S.view.updateColors(S.gcolors); renderLayers(); renderReport(); }

  // ------------------------------------------------------------------ báo cáo
  function orientSummary(g) { return (g.patterns || []).map((p) => esc(p.text)).join('<br>') || '—'; }
  function renderReport() {
    const p = S.plan, el = $('c3dReport'); if (!p) { el.innerHTML = ''; return; }
    const t = p.totals;
    if (!p.groups.length || !t.requested) { el.innerHTML = '<div class="c3d-rep"><div class="c3d-empty"><b>Chưa có hàng để xếp.</b><br>Thêm mặt hàng ở khung bên trái (hoặc bấm “Ví dụ mẫu”). Khung 3D đang hiển thị container trống với red line và kích thước.</div></div>'; return; }
    const kpi = (k, v, s, cls, pct) => '<div class="c3d-kpi ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + (pct != null ? '<div class="c3d-gb"><i style="width:' + (100 - Math.max(0, Math.min(100, pct))) + '%"></i></div>' : '') + '</div>';
    const pay = t.payload > 0 ? t.kg / t.payload * 100 : 0;
    const k = '<div class="c3d-dash-h">Tổng quan kết quả</div><div class="c3d-kpis">' +
      kpi('Đã xếp / yêu cầu', fmt(t.loaded) + ' / ' + fmt(t.requested), 'thùng', t.left === 0 ? 'good' : '') +
      kpi('Rớt lại kho', fmt(t.left), t.left ? 'thùng không đóng được vào cont này' : 'đủ hàng', t.left ? 'bad' : 'good') +
      kpi('Khối lượng hàng', fmtKg(t.kg), t.payload > 0 ? fmt(pay, 1) + '% tải trọng cho phép (' + fmt(t.payload) + ' kg)' : 'chưa nhập tải trọng', '', t.payload > 0 ? pay : null) +
      kpi('Khối hàng đã xếp', m3(t.volBox) + ' m³', 'lấp ' + fmt(t.fillUsablePct, 1) + '% vùng chứa hàng (' + m3(t.volUsable) + ' m³)', '', t.fillUsablePct) +
      kpi('Khối còn trống', m3(t.volFreeUsable) + ' m³', 'tới giới hạn xếp · cả cont còn ' + m3(t.volFreeInternal) + ' / ' + m3(t.volInternal) + ' m³') +
      kpi('Chiều dài đã dùng', fmt(t.usedLength / 1000, 2) + ' m', 'còn trống ' + fmt(t.freeLength / 1000, 2) + ' m trước cửa') +
      kpi('Cao xếp tối đa', fmt(t.effH / 1000, 2) + ' m', 'số lớp cao nhất: ' + p.maxTier) +
      (t.cog ? kpi('Trọng tâm hàng', fmt(t.cog.xPct, 0) + '% dài · ' + fmt(t.cog.yPct, 0) + '% ngang', 'tính từ vách đầu / vách phải') : '') + '</div>';
    const g = t.gaps, gp = g ? '<div class="c3d-gaps"><b>Khoảng trống còn lại</b> <span>thùng → vách đầu <b>' + fmt(g.front) + '</b></span><span>thùng → cửa <b>' + fmt(g.door) + '</b></span><span>thùng → vách phải <b>' + fmt(g.right) + '</b></span><span>thùng → vách trái <b>' + fmt(g.left) + '</b></span><span>thùng cao nhất → trần <b>' + fmt(g.ceiling) + '</b></span><span>→ red line <b>' + fmt(g.red) + '</b></span><span>→ giới hạn xếp <b>' + fmt(g.eff) + '</b></span><em>(mm; số nhỏ nhất trên toàn cont — chọn 1 dãy để xem riêng từng dãy)</em></div>' : '';
    const msgs = [];
    if (p.errors.length) p.errors.forEach((m) => msgs.push('<div class="c3d-msg err">⛔ ' + esc(m) + '</div>'));
    (p.hints || []).forEach((h, i) => msgs.push('<div class="c3d-hint"><div>💡 <b>' + esc(h.text) + '</b><br>→ ' + (h.gain > 0 ? 'đóng thêm được <b class="g">+' + fmt(h.gain) + ' thùng</b> (' + fmt(h.loaded) + ' / ' + fmt(t.requested) + ' thùng' + (h.left ? ', còn rớt ' + fmt(h.left) : ', đủ hàng') + ')' : esc(h.note || '')) + '</div><button type="button" class="c3d-btn sm pri" data-hint="' + i + '">Áp dụng</button></div>'));
    if (p.spreadNote) msgs.push('<div class="c3d-msg tip">🧱 ' + esc(p.spreadNote) + '</div>');
    if (p.layoutNote) msgs.push('<div class="c3d-msg tip">🌬 ' + esc(p.layoutNote) + '</div>');
    if (p.verify.ok && t.loaded) msgs.push('<div class="c3d-msg ok">✔ <b>Đã kiểm tra độc lập ' + fmt(t.loaded) + ' thùng:</b> không chồng lấn · nằm trong cont, dưới red line · mỗi thùng được đỡ ≥ ' + Math.round(p.options.minSupport * 100) + '% diện tích bên dưới · thứ tự đóng từ trong ra ngoài, không thùng nào bị chắn đường vào từ cửa.</div>');
    else if (!p.verify.ok) { msgs.push('<div class="c3d-msg err"><b>Chi tiết lỗi kiểm tra:</b><br>' + p.verify.violations.slice(0, 8).map((v) => esc(v.msg)).join('<br>') + '</div>'); }
    p.warnings.forEach((m) => msgs.push('<div class="c3d-msg warn">⚠ ' + esc(m) + '</div>'));
    msgs.push('<div class="c3d-msg tip">📏 Hàng được xếp thành <b>' + fmt(t.rows) + ' dãy</b> (đánh số Dãy 1 → ' + fmt(t.rows) + ' từ vách đầu ra cửa)' + '.</div>');
    if (t.sample > 0) msgs.push('<div class="c3d-msg tip">🛃 <b>Hàng mẫu hải quan: ' + fmt(t.sample) + ' thùng</b> nằm ở ' + fmt(p.rows.filter((r) => r.samples > 0).length) + ' dãy cuối (sát cửa), trộn đủ các mặt hàng, mỗi dãy đầy như các dãy khác — thùng mẫu được tô sáng trên hình 3D.</div>');
    if (t.left > 0) {
      const lefts = p.groups.filter((g) => g.left > 0).map((g) => '<b>' + esc(g.sku.code || 'Mặt hàng') + (g.sku.size ? ' ' + esc(g.sku.size) : '') + (g.sku.date ? ' (' + esc(g.sku.date) + ')' : '') + ': ' + fmt(g.left) + ' thùng</b>');
      msgs.push('<div class="c3d-msg err">📦 <b>Rớt lại kho ' + fmt(t.left) + ' thùng</b> — ' + lefts.join(' · ') + '.</div>');
    }
    if (p.compare && p.compare.ok) {
      if (p.compare.delta > 0) msgs.push('<div class="c3d-msg tip">💡 Nếu chọn <b>' + (p.compare.mergeTail ? '“Ghép lấp chỗ trống cạnh vách cuối”' : '“Tách riêng từng mặt hàng”') + '</b> sẽ xếp được thêm <b>' + fmt(p.compare.delta) + ' thùng</b> (' + fmt(p.compare.loaded) + ' thùng).</div>');
      else if (p.compare.delta === 0 && t.left === 0 && p.compare.usedLength < t.usedLength - 100) msgs.push('<div class="c3d-msg tip">💡 Chọn <b>' + (p.compare.mergeTail ? '“Ghép lấp chỗ trống cạnh vách cuối”' : '“Tách riêng từng mặt hàng”') + '</b> cho cùng số thùng nhưng ngắn hơn ' + fmt((t.usedLength - p.compare.usedLength) / 1000, 2) + ' m chiều dài (chừa chỗ cho hàng khác).</div>');
    }
    const rows = p.groups.map((g, i) => {
      const sk = g.sku, col = (S.gcolors || [])[i] || '#888';
      const pos = g.loaded && g.xStart != null ? fmt((g.xStart - p.space.x0) / 1000, 2) + ' → ' + fmt((g.xEnd - p.space.x0) / 1000, 2) + ' m' : '—';
      const why = (g.reasons || []).map(esc).join('<br>');
      const tiers = g.loaded ? Math.max(...p.boxes.filter((b) => b.group === i).map((b) => b.tier)) : 0;
      return '<tr><td class="n">' + (i + 1) + '</td><td><span class="dot" style="background:' + col + '"></span><b>' + esc(sk.code || '(chưa có mã)') + '</b>' + (sk.name ? ' <span class="nt">' + esc(sk.name) + '</span>' : '') + '<div class="nt">Size ' + esc(sk.size || '—') + ' · Date ' + esc(sk.date || '—') + ' · ' + Math.round(sk.L) + '×' + Math.round(sk.W) + '×' + Math.round(sk.H) + ' mm · ' + fmt(sk.kg, 2) + ' kg</div></td>' +
        '<td class="n">' + fmt(g.requested) + '</td><td class="n">' + fmt(g.loaded) + (g.sample ? '<div class="nt">gồm ' + fmt(g.sample) + ' mẫu HQ</div>' : '') + (g.stackedOn ? '<div class="nt">' + fmt(g.stackedOn) + ' chồng lên hàng trước</div>' : '') + '</td><td class="n ' + (g.left ? 'left' : '') + '">' + fmt(g.left) + '</td><td>' + orientSummary(g) + (tiers ? '<div class="nt">tối đa ' + tiers + ' tầng</div>' : '') + '</td><td class="n">' + pos + '</td><td class="n">' + fmt(g.kg, 2) + '</td><td class="n">' + m3(g.volLoaded) + (g.volReq !== g.volLoaded ? ' / ' + m3(g.volReq) : '') + '<div class="nt">' + fmt(g.volUnit / 1e9, 4) + ' m³/thùng</div></td>' +
        '<td>' + (sk.note ? '<div>📝 ' + esc(sk.note) + '</div>' : '') + (why ? '<div class="why">' + why + '</div>' : '') + '</td></tr>';
    }).join('');
    const tot = '<tr class="tot"><td></td><td>Tổng cộng</td><td class="n">' + fmt(t.requested) + '</td><td class="n">' + fmt(t.loaded) + '</td><td class="n ' + (t.left ? 'left' : '') + '">' + fmt(t.left) + '</td><td></td><td class="n">' + fmt(t.usedLength / 1000, 2) + ' m</td><td class="n">' + fmt(t.kg, 2) + '</td><td class="n">' + m3(t.volBox) + '</td><td></td></tr>';
    el.innerHTML = '<div class="c3d-rep"><h3>Báo cáo sau tính toán <small style="text-transform:none;letter-spacing:0;font-weight:500;color:var(--theme-text-faint)">· ' + esc(p.container.name || 'Container') + ' · tính trong ' + (S.ms || 0) + ' ms</small></h3>' + gp + k + msgs.join('') +
      '<div class="c3d-tw"><table class="c3d-t"><thead><tr><th class="n">STT đóng</th><th>Mặt hàng · size · date</th><th class="n">Yêu cầu</th><th class="n">Đã xếp</th><th class="n">Rớt kho</th><th>Hướng đặt / kiểu xếp</th><th class="n">Vị trí từ vách đầu</th><th class="n">KG</th><th class="n">Khối m³ (xếp / yêu cầu)</th><th>Ghi chú / lý do</th></tr></thead><tbody>' + rows + tot + '</tbody></table></div>' +
      '<p class="c3d-note">Thứ tự STT = thứ tự đóng: nhóm 1 vào SÂU NHẤT (sát vách đầu), nhóm cuối sát cửa. Hàng vượt tải trọng hoặc hết chỗ được tính vào “Rớt kho”. Kéo thanh “Thứ tự đóng” trong khung 3D để xem từng thùng được đóng theo trình tự.</p></div>';
  }

  // ------------------------------------------------------------------ lớp / nhóm / thứ tự đóng
  function renderLayers() {
    const p = S.plan, el = $('c3dLayers'); if (!p || !p.boxes.length) { el.hidden = true; return; } el.hidden = false;
    const cnt = {}; p.boxes.forEach((b) => { cnt[b.tier] = (cnt[b.tier] || 0) + 1; });
    let tiers = ''; for (let t = 1; t <= p.maxTier; t++) tiers += '<label class="c3d-ly"><input type="checkbox" data-tier="' + t + '"' + (S.hidden.tiers.has(t) ? '' : ' checked') + '><span class="t">Lớp ' + t + '</span><span class="n">' + fmt(cnt[t] || 0) + '</span></label>';
    const groups = p.groups.map((g, i) => g.loaded ? '<label class="c3d-ly"><input type="checkbox" data-grp="' + i + '"' + (S.hidden.groups.has(i) ? '' : ' checked') + '><span class="dot" style="background:' + ((S.gcolors || [])[i] || '#888') + '"></span><span class="t" title="' + esc((g.sku.code || '') + ' ' + (g.sku.size || '') + ' ' + (g.sku.date || '')) + '">' + esc(g.sku.code || 'Mặt hàng') + ' ' + esc(g.sku.size || '') + '</span><span class="n">' + fmt(g.loaded) + '</span></label>' : '').join('');
    const rcnt = rowInspector(p) + (p.rows || []).map((r) => '<div class="c3d-ly' + (S.selRow === r.row ? ' rsel' : '') + '"><input type="checkbox" data-row="' + r.row + '"' + (S.hidden.rows.has(r.row) ? '' : ' checked') + '><span class="t" data-rowsel="' + r.row + '" title="Bấm để chọn dãy này (hiện số dãy, chỉnh hướng)">Dãy ' + r.row + (r.samples ? ' <span class="bd">🛃 ' + r.samples + '</span>' : '') + '</span><span class="n">' + fmt(r.n) + '</span></div>').join('');
    el.innerHTML = '<h4>Mặt hàng <span><button type="button" class="mini" data-lyall="grp1">Tất cả</button><button type="button" class="mini" data-lyall="grp0">Ẩn hết</button></span></h4>' + groups +
      '<h4 style="margin-top:8px">Lớp hàng (tầng) <span><button type="button" class="mini" data-lyall="t1">Tất cả</button><button type="button" class="mini" data-lyall="t0">Ẩn hết</button></span></h4>' + tiers +
      '<h4 style="margin-top:8px">Dãy (vách → cửa) <span><button type="button" class="mini" data-lyall="r1">Tất cả</button><button type="button" class="mini" data-lyall="r0">Ẩn hết</button></span></h4>' + rcnt;
  }
  // Bảng chỉnh HƯỚNG cho 1 dãy: người dùng chọn đứng / nằm / 1 trong 6 hướng cho dãy này; các dãy còn lại hệ thống tự sắp lại
  function rowInspector(p) {
    const r = S.selRow != null ? (p.rows || []).find((x) => x.row === S.selRow) : null; if (!r) return '<div class="c3d-note" style="margin:2px 0 6px;font-size:11px">Bấm chữ “Dãy n” (hoặc 1 thùng trong hình) để chọn dãy: hiện số dãy + chỉnh hướng đứng / nằm.</div>';
    if (r.wall < 0 || r.group < 0) return '<div class="c3d-rowbox"><b>Dãy ' + r.row + '</b><small>Dãy này gồm nhiều mặt hàng ghép — không chỉnh hướng riêng được.</small></div>';
    const sk = S.skus.find((x) => x.id === p.groups[r.group].sku.id) || p.groups[r.group].sku, cur = (sk.rowSet && sk.rowSet[r.wall]) || '';
    const isTxt = /\d/.test(String(cur));
    const opts = [['', 'Theo dãy mẫu / tự động'], ['nam', 'Cả dãy NẰM'], ['dung', 'Cả dãy ĐỨNG'], ['cao', 'Cả dãy DỰNG CAO']].concat(E.PERMS.map((q) => [q, oriLabel(q, sk)])).map((o) => '<option value="' + o[0] + '"' + (!isTxt && cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    const gp = r.gaps ? '<div class="c3d-gp">Còn trống: trần <b>' + fmt(r.gaps.ceiling) + '</b> · red line <b>' + fmt(r.gaps.red) + '</b> · vách phải <b>' + fmt(r.gaps.right) + '</b> · vách trái <b>' + fmt(r.gaps.left) + '</b> mm</div>' : '';
    return '<div class="c3d-rowbox"><b>Dãy ' + r.row + '</b> · ' + esc((sk.code || 'mặt hàng') + ' ' + (sk.size || '')) + ' · dãy thứ ' + (r.wall + 1) + ' của mặt hàng' + gp + '<select id="rowOri">' + opts + '</select><input type="text" id="rowTxt" value="' + esc(isTxt ? cur : '') + '" placeholder="hoặc nhập riêng: 5 nằm 3 đứng" style="margin-bottom:4px"><div class="btns"><button type="button" class="c3d-btn sm pri" data-rowapply="1">Áp dụng cho dãy này</button><button type="button" class="c3d-btn sm" data-rowclear="1">Bỏ chỉnh</button></div><small>Các dãy khác tự sắp lại theo. Muốn đổi CẢ mặt hàng: nhập ở ô <b>Dãy mẫu</b> của mặt hàng.</small></div>';
  }
  function applyRowOri(clear) {
    const p = S.plan, r = p && (p.rows || []).find((x) => x.row === S.selRow); if (!r || r.wall < 0 || r.group < 0) return;
    const sk = S.skus.find((x) => x.id === p.groups[r.group].sku.id); if (!sk) return; sk.rowSet = sk.rowSet || {}; const v = clear ? '' : (($('rowTxt').value || '').trim() || $('rowOri').value);
    if (v) sk.rowSet[r.wall] = v; else delete sk.rowSet[r.wall];
    renderSide(); calc(); scheduleSave(); toast(v ? 'Đã đặt dãy ' + r.row + ': ' + (/\d/.test(v) ? v : (tokText(v) === v ? oriLabel(v, sk) : 'cả dãy ' + tokText(v))) + ' — các dãy khác đã tự sắp lại.' : 'Dãy ' + r.row + ' về tự động.');
  }
  // ---- Bảng SẮP DÃY MẪU: chọn trong 1 lớp của 1 dãy có bao nhiêu cột NẰM / ĐỨNG / DỰNG CAO (mỗi nhóm cột có thể ghi số tầng riêng); xem trước mặt cắt nhìn từ cửa
  const TP = { id: null, specs: [] };
  function tplStr() { return TP.specs.filter((q) => q.n > 0).map((q) => q.n + ' ' + tokText(q.tok) + (q.t > 0 ? ' x' + q.t : '')).join(' '); }
  function tplPreviewHtml(k) {
    const pv = E.previewTpl(k, S.cont, tplStr()), c = S.cont, W = c.W, H = c.H, sc = Math.min(430 / W, 250 / H), pad = 14, wpx = W * sc, hpx = H * sc;
    const COL = { 'nằm': '#3b82f6', 'đứng': '#f59e0b', 'dựng cao': '#22c55e' }; let x = c.clearSide || 0, rects = '';
    pv.cols.forEach((q) => { for (let t = 0; t < q.T; t++) rects += '<rect x="' + (pad + x * sc).toFixed(1) + '" y="' + (pad + (H - (t + 1) * q.dz) * sc).toFixed(1) + '" width="' + (q.dy * sc).toFixed(1) + '" height="' + (q.dz * sc).toFixed(1) + '" fill="' + (COL[q.name] || '#888') + '" stroke="#0b0f14" stroke-width="0.6" opacity="0.92"/>'; x += q.dy; });
    const ry = pad + (H - pv.red) * sc, ey = pad + (H - pv.effH) * sc;
    const svg = '<svg viewBox="0 0 ' + (wpx + 2 * pad).toFixed(0) + ' ' + (hpx + 2 * pad).toFixed(0) + '" style="width:100%;max-width:470px;background:var(--theme-panel-2);border:1px solid var(--theme-border);border-radius:9px"><rect x="' + pad + '" y="' + pad + '" width="' + wpx.toFixed(1) + '" height="' + hpx.toFixed(1) + '" fill="none" stroke="#8aa0c0" stroke-width="1.5"/>' + rects + '<line x1="' + pad + '" x2="' + (pad + wpx).toFixed(1) + '" y1="' + ry.toFixed(1) + '" y2="' + ry.toFixed(1) + '" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="5 3"/>' + (pv.effH < pv.red - 1 ? '<line x1="' + pad + '" x2="' + (pad + wpx).toFixed(1) + '" y1="' + ey.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3 3"/>' : '') + '<text x="' + (pad + 4) + '" y="' + (ry - 3).toFixed(1) + '" fill="#ef4444" font-size="9">red line ' + Math.round(pv.red) + '</text></svg>';
    const warn = []; (pv.detail || []).forEach((d) => { if (!d.ok) warn.push('“' + d.n + ' ' + tokText(d.tok) + '” không vừa cont (cao / ngang).'); else if (d.used < d.n) warn.push('“' + d.n + ' ' + tokText(d.tok) + '” chỉ xếp được ' + d.used + ' cột (hết bề ngang).'); });
    const free = pv.Wu - pv.width;
    const stats = '<div class="c3d-note" style="margin:6px 0"><b>' + fmt(pv.cap) + ' thùng / dãy</b> · bề ngang dùng <b>' + fmt(pv.width) + '</b> / ' + fmt(pv.Wu) + ' mm (còn trống <b>' + fmt(free) + '</b>) · cột cao nhất <b>' + fmt(pv.top) + '</b> mm → cách red line <b>' + fmt(pv.red - pv.top) + '</b> mm, cách trần <b>' + fmt(H - pv.top) + '</b> mm' + (pv.top > pv.effH + 0.5 ? ' <span style="color:#e5484d">⚠ vượt giới hạn xếp ' + fmt(pv.effH) + '</span>' : '') + '</div>' + warn.map((w) => '<div class="c3d-msg warn">⚠ ' + esc(w) + '</div>').join('');
    return svg + stats;
  }
  function openTpl(id) {
    const k = S.skus.find((x) => x.id === id); if (!k) return; TP.id = id;
    TP.specs = E.parseColPlan(k.rowPlan).map((q) => ({ tok: q.tok, n: q.n, t: q.t })); if (!TP.specs.length) TP.specs = [{ tok: 'nam', n: 6, t: 0 }, { tok: 'dung', n: 2, t: 0 }];
    renderTpl(); $('c3dModal').hidden = false;
  }
  function renderTpl() {
    const k = S.skus.find((x) => x.id === TP.id); if (!k) return;
    const tops = [['nam', 'NẰM · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[0])], ['dung', 'ĐỨNG · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[1])], ['cao', 'DỰNG CAO · cao ' + Math.round([k.L, k.W, k.H].sort((a, b) => a - b)[2])]].concat(E.PERMS.map((p) => [p, oriLabel(p, k)]));
    const rows = TP.specs.map((q, i) => '<div class="c3d-tprow"><input type="text" inputmode="numeric" data-tp="n" data-i="' + i + '" value="' + q.n + '" title="Số cột"><span>cột</span><select data-tp="tok" data-i="' + i + '">' + tops.map((o) => '<option value="' + o[0] + '"' + (q.tok === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select><span>x</span><input type="text" inputmode="numeric" data-tp="t" data-i="' + i + '" value="' + (q.t || '') + '" placeholder="tối đa" title="Số tầng (để trống = chồng tới red line)"><span>tầng</span><button type="button" class="c3d-btn sm danger" data-tp="del" data-i="' + i + '">✕</button></div>').join('');
    $('c3dDlg').innerHTML = '<h2>Sắp dãy mẫu — ' + esc((k.code || 'mặt hàng') + ' ' + (k.size || '')) + '</h2><p class="c3d-note" style="margin:0 0 8px">Trong <b>1 lớp của 1 dãy</b> xếp cạnh nhau (trái → phải, nhìn từ cửa) các nhóm cột dưới đây. Mỗi cột chồng cùng 1 hướng tới red line (hoặc đúng số tầng bạn ghi). <b>Mọi dãy của mặt hàng sẽ lặp lại mẫu này</b>; muốn 1 dãy khác thì chọn dãy đó trong khung 3D.</p><div id="tpRows">' + rows + '</div><div class="c3d-btns" style="margin:6px 0"><button type="button" class="c3d-btn sm" data-tp="add">+ Thêm nhóm cột</button></div><div id="tpPrev">' + tplPreviewHtml(k) + '</div><div class="foot"><button type="button" class="c3d-btn danger" data-tp="clear">Bỏ dãy mẫu</button><button type="button" class="c3d-btn" data-tp="cancel">Hủy</button><button type="button" class="c3d-btn pri" data-tp="ok">Áp dụng cho mặt hàng</button></div>';
  }
  function onTpl(e) {
    const t = e.target.closest('[data-tp]'); if (!t || TP.id == null) return; const act = t.dataset.tp, i = +t.dataset.i, k = S.skus.find((x) => x.id === TP.id); if (!k) return;
    if (e.type === 'input' || e.type === 'change') {
      if (act === 'n') TP.specs[i].n = Math.max(0, Math.floor(num(t.value))); else if (act === 'tok') TP.specs[i].tok = t.value; else if (act === 't') TP.specs[i].t = Math.max(0, Math.floor(num(t.value))); else return;
      $('tpPrev').innerHTML = tplPreviewHtml(k); return;
    }
    if (e.type !== 'click') return;
    if (act === 'add') { TP.specs.push({ tok: 'nam', n: 1, t: 0 }); renderTpl(); }
    else if (act === 'del') { TP.specs.splice(i, 1); renderTpl(); }
    else if (act === 'cancel') closeModal();
    else if (act === 'clear') { k.rowPlan = ''; closeModal(); renderSide(); calc(); scheduleSave(); toast('Đã bỏ dãy mẫu — về tự động.'); }
    else if (act === 'ok') { k.rowPlan = tplStr(); closeModal(); renderSide(); calc(); scheduleSave(); toast(k.rowPlan ? 'Đã áp dụng dãy mẫu: ' + k.rowPlan : 'Đã bỏ dãy mẫu.'); }
  }
  function applyFilter() {
    const p = S.plan; if (!p || !S.view) return;
    const rows = new Set(); (p.rows || []).forEach((r) => { if (!S.hidden.rows.has(r.row)) rows.add(r.row); });
    const tiers = new Set(), groups = new Set(); for (let t = 1; t <= p.maxTier; t++) if (!S.hidden.tiers.has(t)) tiers.add(t); p.groups.forEach((g, i) => { if (!S.hidden.groups.has(i)) groups.add(i); });
    S.view.setFilter({ tiers: S.hidden.tiers.size ? tiers : null, groups: S.hidden.groups.size ? groups : null, rows: S.hidden.rows.size ? rows : null, seqMax: S.seqMax });
  }
  function onLayerChange(e) {
    const t = e.target; if (t.dataset.tier) { const n = +t.dataset.tier; if (t.checked) S.hidden.tiers.delete(n); else S.hidden.tiers.add(n); applyFilter(); }
    else if (t.dataset.row) { const n = +t.dataset.row; if (t.checked) S.hidden.rows.delete(n); else S.hidden.rows.add(n); applyFilter(); }
    else if (t.dataset.grp) { const n = +t.dataset.grp; if (t.checked) S.hidden.groups.delete(n); else S.hidden.groups.add(n); applyFilter(); }
  }
  function onLayerClick(e) {
    const rs = e.target.closest('[data-rowsel]'); if (rs && S.view) { const n = +rs.dataset.rowsel; S.view.setSelRow(S.selRow === n ? null : n); return; }
    if (e.target.closest('[data-rowapply]')) { applyRowOri(false); return; } if (e.target.closest('[data-rowclear]')) { applyRowOri(true); return; }
    const b = e.target.closest('[data-lyall]'); if (!b || !S.plan) return; const k = b.dataset.lyall;
    if (k[0] === 'r') { S.hidden.rows = new Set(); if (k === 'r0') S.plan.rows.forEach((r) => S.hidden.rows.add(r.row)); }
    else if (k[0] === 't') { S.hidden.tiers = new Set(); if (k === 't0') for (let t = 1; t <= S.plan.maxTier; t++) S.hidden.tiers.add(t); } else { S.hidden.groups = new Set(); if (k === 'grp0') S.plan.groups.forEach((g, i) => S.hidden.groups.add(i)); }
    renderLayers(); applyFilter();
  }
  function renderSeq() {
    const p = S.plan, el = $('c3dSeq'); if (!p || !p.boxes.length) { el.hidden = true; return; } el.hidden = false; const n = p.boxes.length, cur = S.seqMax == null ? n : S.seqMax;
    el.innerHTML = '<span class="lab">Thứ tự đóng (trong → ngoài)</span><button type="button" class="c3d-btn sm" data-seq="start" title="Về thùng đầu tiên">⏮</button><button type="button" class="c3d-btn sm" data-seq="prev">◀</button><button type="button" class="c3d-btn sm" data-seq="play" id="seqPlay">' + (S.playing ? '⏸' : '▶') + '</button><button type="button" class="c3d-btn sm" data-seq="next">▶|</button><button type="button" class="c3d-btn sm" data-seq="end" title="Hiện tất cả">⏭</button>' +
      '<input type="range" id="seqRange" min="0" max="' + n + '" value="' + cur + '"><span class="lab" id="seqLab">' + cur + ' / ' + n + '</span>';
  }
  function setSeq(v) {
    const n = S.plan ? S.plan.boxes.length : 0; v = Math.max(0, Math.min(n, Math.round(v))); S.seqMax = v >= n ? null : v; const r = $('seqRange'); if (r) r.value = v; const l = $('seqLab'); if (l) l.textContent = v + ' / ' + n; applyFilter();
  }
  function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = 0; } const b = $('seqPlay'); if (b) b.textContent = '▶'; }
  function onSeqClick(e) {
    const b = e.target.closest('[data-seq]'); if (!b || !S.plan) return; const n = S.plan.boxes.length, cur = S.seqMax == null ? n : S.seqMax, a = b.dataset.seq;
    if (a === 'start') { stopPlay(); setSeq(0); } else if (a === 'end') { stopPlay(); setSeq(n); } else if (a === 'prev') { stopPlay(); setSeq(cur - 1); } else if (a === 'next') { stopPlay(); setSeq(cur + 1); }
    else if (a === 'play') {
      if (S.playing) { stopPlay(); return; } if (cur >= n) setSeq(0); const step = Math.max(1, Math.round(n / 160)); b.textContent = '⏸';
      S.playing = setInterval(() => { const c2 = S.seqMax == null ? n : S.seqMax; if (c2 >= n) { stopPlay(); return; } setSeq(c2 + step); }, 40);
    }
  }

  // ------------------------------------------------------------------ rê chuột / chọn thùng
  function boxText(bi, full) {
    const p = S.plan, b = p.boxes[bi], g = p.groups[b.group], sk = g.sku, sp = p.space;
    const head = '<b>#' + b.seq + ' · ' + esc(sk.code || 'Mặt hàng') + '</b> ' + esc(sk.size || '') + (sk.date ? ' · ' + esc(sk.date) : '') + ' · <b>' + g.loaded + ' thùng</b>';
    const dims = Math.round(b.dx) + '×' + Math.round(b.dy) + '×' + Math.round(b.dz) + ' mm (dài×ngang×cao khi đặt)';
    if (!full) return head + '<br>Dãy ' + b.row + ' · Lớp ' + b.tier + ' · ' + dims;
    return head + '<br><b>Dãy ' + b.row + '</b>' + (b.sample ? '<br>🛃 <b>Thùng mẫu hải quan</b>' : '') + (b.onPrev ? '<br>↥ chồng lên hàng trước' : '') + '<br>Lớp (tầng) <b>' + b.tier + '</b> · ' + vname(b.dz, sk) + ' (cao ' + Math.round(b.dz) + ')' + (b.rot ? ' · xoay 90°' : '') + '<br>' + dims + '<br><small>Cách vách đầu ' + fmt((b.x - sp.x0) / 1000, 2) + ' m · cách vách phải ' + fmt((b.y - sp.y0) / 1000, 2) + ' m · cao ' + fmt(b.z / 1000, 2) + ' m<br>' + fmt(sk.kg, 2) + ' kg/thùng' + (sk.note ? '<br>📝 ' + esc(sk.note) : '') + '</small>';
  }
  function onHover(bi, ev) {
    const tip = $('c3dTip'); if (bi == null || !S.plan) { tip.hidden = true; return; }
    const vp = $('c3dVp').getBoundingClientRect(); tip.innerHTML = boxText(bi, false); tip.hidden = false;
    let x = ev.clientX - vp.left + 14, y = ev.clientY - vp.top + 14; if (x + 300 > vp.width) x = ev.clientX - vp.left - 310; if (y + 70 > vp.height) y = ev.clientY - vp.top - 70; tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }
  function onPick(bi) {
    const el = $('c3dSel'); S.selBox = bi; if (bi == null || !S.plan) { el.hidden = true; return; }
    const b = S.plan.boxes[bi], sk = S.plan.groups[b.group].sku, cur = sk.orient || permOfBox(b, sk);
    el.innerHTML = '<span class="x" id="selX">✕</span>' + boxText(bi, true) + '<div style="margin-top:6px;border-top:1px solid var(--theme-border);padding-top:5px"><small>Xoay cả nhóm “' + esc(sk.code || 'mặt hàng') + ' ' + esc(sk.size || '') + '” cho khớp thực tế (hệ thống xếp lại):</small><select id="selOri">' + oriOpts(sk.orient, sk) + '</select><button type="button" class="c3d-btn sm" id="selRot" style="margin-top:5px" title="Đổi chiều dài ↔ ngang của thùng">↻ Xoay 90° trên sàn</button></div>'; el.hidden = false; $('selX').onclick = () => { S.view.select(null); };
    const setOri = (v, msg) => { const k = S.skus.find((x) => x.id === sk.id); if (!k) return; k.orient = v; renderSide(); calc(); scheduleSave(); toast(msg); };
    $('selOri').onchange = (e) => setOri(e.target.value, e.target.value ? 'Đã chốt hướng đặt: ' + oriLabel(e.target.value, sk) : 'Về chế độ tự động.');
    $('selRot').onclick = () => { const p0 = cur || 'LWH'; setOri(p0[1] + p0[0] + p0[2], 'Đã xoay 90° trên sàn: ' + oriLabel(p0[1] + p0[0] + p0[2], sk)); };
  }

  // ------------------------------------------------------------------ phương án đã lưu
  async function savePlanDialog() {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được phương án.'); return; }
    if (!S.plan || !S.plan.totals.requested) { toast('Chưa có phương án để lưu.'); return; }
    const t = new Date(), autoOpen = S.openedAuto ? S.plans.find((x) => x.id === S.openedAuto && x.data && x.data.auto) : null, def = autoOpen ? autoOpen.name : (S.cont.name || 'Cont') + ' ' + String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0');
    $('c3dDlg').innerHTML = '<h2>Lưu phương án xếp hàng</h2><label class="c3d-f"><span>Tên phương án</span><input type="text" id="planName" value="' + esc(def) + '"></label><p class="c3d-note">Lưu container, danh sách hàng và cách xếp. Khi mở lại hệ thống tính lại theo thuật toán hiện hành.</p>' + (autoOpen ? '<label class="c3d-chk"><input type="checkbox" id="planOver" checked> Ghi đè lên phương án TỰ ĐỘNG đang mở và KHÓA lại (hệ thống không tự tính lại nữa — giữ nguyên chỉnh sửa của bạn)</label>' : '') + '<div class="foot"><button type="button" class="c3d-btn" id="planCancel">Hủy</button><button type="button" class="c3d-btn pri" id="planOk">Lưu</button></div>';
    $('c3dModal').hidden = false; $('planName').focus(); $('planName').select(); $('planCancel').onclick = closeModal;
    $('planOk').onclick = async () => {
      const name = $('planName').value.trim() || def, id = 'pl' + Date.now().toString(36), over = autoOpen && $('planOver') && $('planOver').checked;
      if (over) { // ghi đè phương án tự động + khóa
        const bk = { name: autoOpen.name, capNhat: autoOpen.capNhat, contName: autoOpen.contName, loaded: autoOpen.loaded, requested: autoOpen.requested, data: autoOpen.data };
        autoOpen.name = name; autoOpen.capNhat = new Date().toISOString(); autoOpen.contName = S.cont.name; autoOpen.loaded = S.plan.totals.loaded; autoOpen.requested = S.plan.totals.requested;
        autoOpen.data = { cont: clone(S.cont), cid: S.cid, skus: clone(S.skus), opts: clone(S.opts), colors: clone(S.colors), unit: S.unit, auto: Object.assign({}, bk.data.auto, { lock: true, edited: true, warn: [] }) };
        try { await persistPlans(); closeModal(); toast('Đã ghi đè và khóa phương án “' + name + '”.'); } catch (e) { Object.assign(autoOpen, bk); closeModal(); toast('Không lưu được: ' + (e.message || e)); } return;
      }
      S.plans.unshift({ id, name, capNhat: new Date().toISOString(), contName: S.cont.name, loaded: S.plan.totals.loaded, requested: S.plan.totals.requested, data: { cont: clone(S.cont), cid: S.cid, skus: clone(S.skus), opts: clone(S.opts), colors: clone(S.colors), unit: S.unit } });
      try { await persistPlans(); closeModal(); toast('Đã lưu phương án “' + name + '”.'); } catch (e) { S.plans.shift(); closeModal(); toast('Không lưu được: ' + (e.message || e)); }
    };
  }
  // ---- DANH MỤC LOẠI THÙNG: lưu kích thước + kg + cách xếp từng loại thùng để dùng lại cho cont sau (chỉ nhập số lượng). Khoá = mã hàng + size.
  const CAT_FIELDS = ['code', 'size', 'name', 'L', 'W', 'H', 'kg', 'allowRotate', 'allowStand', 'allowLay', 'sole', 'maxLayers', 'orient', 'rowPlan', 'note'];
  const catKey = (v) => String(v.code || '').trim().toLowerCase() + '|' + String(v.size || '').trim().toLowerCase();
  const catLabel = (v) => (String(v.code || '').trim() || '(chưa có mã)') + (v.size ? ' · ' + v.size : '') + (v.name ? ' · ' + v.name : '');
  async function persistCat() { await writeSheet(SH_T, S.cat.map((c) => ({ id: c.id, name: c.name, capNhat: c.capNhat, data: '__JSON__' + JSON.stringify(c.v) }))); }
  async function saveSkuToCat(id) {
    if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không lưu được danh mục.'); return; }
    const k = S.skus.find((x) => x.id === id); if (!k) return; if (!String(k.code || '').trim()) { toast('Nhập Mã hàng trước khi lưu vào danh mục.'); return; } if (!(k.L > 0 && k.W > 0 && k.H > 0)) { toast('Nhập đủ Dài / Rộng / Cao thùng trước.'); return; }
    const v = {}; CAT_FIELDS.forEach((f) => { v[f] = k[f] === undefined ? '' : clone(k[f]); }); const key = catKey(v), i = S.cat.findIndex((c) => catKey(c.v) === key), rec = { id: i >= 0 ? S.cat[i].id : 'th' + Date.now().toString(36), name: catLabel(v), capNhat: new Date().toISOString(), v };
    const prev = S.cat.slice(); if (i >= 0) S.cat[i] = rec; else S.cat.push(rec);
    try { await persistCat(); renderSide(); toast((i >= 0 ? 'Đã cập nhật' : 'Đã lưu') + ' loại thùng “' + rec.name + '” vào danh mục (' + Math.round(v.L) + '×' + Math.round(v.W) + '×' + Math.round(v.H) + ' mm).'); } catch (e) { S.cat = prev; toast('Không lưu được: ' + (e.message || e)); }
  }
  const CATQ = { q: '' };
  function catListHtml() {
    const q = stripV(CATQ.q), list = S.cat.filter((c) => !q || stripV(c.name + ' ' + (c.v.note || '')).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return list.length ? list.map((c) => '<div class="c3d-plan"><div class="nm"><b>' + esc(catLabel(c.v)) + '</b><small>' + Math.round(c.v.L) + '×' + Math.round(c.v.W) + '×' + Math.round(c.v.H) + ' mm · ' + fmt(c.v.kg, 2) + ' kg/thùng · ' + fmt(c.v.L * c.v.W * c.v.H / 1e9, 4) + ' m³' + (c.v.rowPlan ? ' · dãy mẫu: ' + esc(c.v.rowPlan) : '') + '</small></div><input type="text" inputmode="numeric" data-cat="qty" data-id="' + esc(c.id) + '" value="100" style="width:70px" title="Số lượng thùng"><button type="button" class="c3d-btn sm pri" data-cat="add" data-id="' + esc(c.id) + '">Thêm vào cont</button><button type="button" class="c3d-btn sm danger" data-cat="del" data-id="' + esc(c.id) + '">Xóa</button></div>').join('') : '<div class="c3d-empty-l">' + (S.cat.length ? 'Không có loại thùng khớp.' : 'Danh mục trống. Ở mỗi mặt hàng bấm “Lưu danh mục” để lưu kích thước loại thùng đó.') + '</div>';
  }
  const stripV = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  function openCat() {
    $('c3dDlg').innerHTML = '<h2>Danh mục loại thùng</h2><p class="c3d-note" style="margin:0 0 8px">Loại thùng đã lưu (kích thước, kg, hướng đặt, dãy mẫu). Chọn loại cần dùng, nhập số lượng, bấm “Thêm vào cont” — danh sách của cont hiện tại không bị mất.</p><label class="c3d-f"><span>Tìm theo mã / size / tên</span><input type="text" data-cat="q" value="' + esc(CATQ.q) + '"></label><div id="catList" style="margin-top:8px">' + catListHtml() + '</div><div class="foot"><button type="button" class="c3d-btn" data-cat="close">Đóng</button></div>';
    $('c3dModal').hidden = false;
  }
  async function onCat(e) {
    const t = e.target.closest('[data-cat]'); if (!t) return; const act = t.dataset.cat;
    if (act === 'q' && (e.type === 'input')) { CATQ.q = t.value; $('catList').innerHTML = catListHtml(); return; }
    if (e.type !== 'click') return;
    if (act === 'close') { closeModal(); return; }
    const c = S.cat.find((x) => x.id === t.dataset.id); if (!c) return;
    if (act === 'add') { const qi = document.querySelector('[data-cat="qty"][data-id="' + c.id + '"]'), qty = Math.max(1, Math.floor(num(qi && qi.value) || 100)); S.skus.push(newSku(Object.assign({}, clone(c.v), { qty }))); renderSide(); scheduleCalc(0); scheduleSave(); toast('Đã thêm ' + catLabel(c.v) + ' × ' + fmt(qty) + ' thùng.'); }
    else if (act === 'del') { if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; } if (!confirm('Xóa loại thùng “' + catLabel(c.v) + '” khỏi danh mục?')) return; const prev = S.cat.slice(); S.cat = S.cat.filter((x) => x.id !== c.id); try { await persistCat(); $('catList').innerHTML = catListHtml(); renderSide(); } catch (er) { S.cat = prev; toast('Không xóa được: ' + (er.message || er)); } }
  }
  async function persistPlans() { await writeSheet(SH_P, S.plans.map((p) => ({ id: p.id, name: p.name, capNhat: p.capNhat, contName: p.contName, loaded: p.loaded, requested: p.requested, data: '__JSON__' + JSON.stringify(p.data) }))); }
  function openPlans() {
    const list = S.plans.length ? S.plans.map((p) => '<div class="c3d-plan"><div class="nm"><b>' + (p.data && p.data.auto ? '<span class="c3d-autotag">TỰ ĐỘNG' + (p.data.auto.lock ? ' 🔒' : '') + '</span> ' : '') + esc(p.name) + '</b><small>' + esc(p.contName) + ' · ' + fmt(p.loaded) + '/' + fmt(p.requested) + ' thùng · ' + esc(new Date(p.capNhat).toLocaleString('vi-VN')) + '</small>' + autoWarnHtml(p) + '</div>' + (p.data && p.data.auto ? '<button type="button" class="c3d-btn sm" data-lock="' + esc(p.id) + '" title="Khóa = hệ thống không tự tính lại phương án này khi lịch xuất / tồn kho thay đổi">' + (p.data.auto.lock ? 'Mở khóa' : 'Khóa') + '</button>' : '') + '<button type="button" class="c3d-btn sm pri" data-open="' + esc(p.id) + '">Mở</button><button type="button" class="c3d-btn sm danger" data-del="' + esc(p.id) + '">Xóa</button></div>').join('') : '<div class="c3d-empty-l">Chưa có phương án nào được lưu.</div>';
    const mk = Object.keys(S.autoMiss || {}).map((k) => S.autoMiss[k]), miss = mk.length ? '<div class="c3d-msg warn" style="margin-bottom:8px">⚠ <b>Lịch xuất chưa mô phỏng đủ — thiếu kích thước thùng trong danh mục</b> (mở Container 3D → thêm mặt hàng → “Lưu danh mục”):<br>' + mk.map((m) => esc(m.name) + ': ' + m.missing.map(esc).join(', ')).join('<br>') + '</div>' : '';
    $('c3dDlg').innerHTML = '<h2>Phương án đã lưu</h2>' + miss + list + '<div class="foot"><button type="button" class="c3d-btn" id="plClose">Đóng</button></div>'; $('c3dModal').hidden = false; $('plClose').onclick = closeModal;
  }
  async function onDlgClick(e) {
    const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]'), lk = e.target.closest('[data-lock]');
    if (lk) { // PC 8.70: khóa / mở khóa phương án tự động
      if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không sửa được.'); return; } const p = S.plans.find((x) => x.id === lk.dataset.lock); if (!p || !p.data || !p.data.auto) return;
      p.data.auto.lock = !p.data.auto.lock; try { await persistPlans(); openPlans(); } catch (er) { p.data.auto.lock = !p.data.auto.lock; toast('Không lưu được: ' + (er.message || er)); } return;
    }
    if (o) { const p = S.plans.find((x) => x.id === o.dataset.open); if (!p) return; const dt = p.data; S.unit = dt.unit || 'mm'; S.cid = dt.cid || S.cid; S.cont = clone(dt.cont); S.skus = clone(dt.skus || []); S.opts = Object.assign({ mergeTail: true, stackTop: true, heightRule: true, sampleOn: true, sampleQty: 10, dateDir: 'asc', sortMode: 'auto' }, dt.opts || {}); S.colors = clone(dt.colors || {}); S.openedAuto = dt.auto ? p.id : ''; closeModal(); renderSide(); calc(); if (S.view) S.view.setPreset(curView()); scheduleSave(); toast('Đã mở phương án “' + p.name + '”.'); }
    else if (d) {
      if (!S.user.canWrite) { toast('Tài khoản chỉ xem — không xóa được.'); return; } if (!confirm('Xóa phương án này?')) return;
      const keep = S.plans.slice(); S.plans = S.plans.filter((x) => x.id !== d.dataset.del); try { await persistPlans(); openPlans(); } catch (er) { S.plans = keep; toast('Không xóa được: ' + (er.message || er)); }
    }
  }

  // ------------------------------------------------------------------ xuất Excel / ảnh
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500); }
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  const ymd = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  function exportExcel() {
    if (!S.user.canExport) { toast('Bạn không được cấp quyền xuất file.'); return; }
    const p = S.plan; if (!p || !p.totals.requested) { toast('Chưa có phương án để xuất.'); return; } if (!window.XLSX) { toast('Thiếu thư viện Excel.'); return; }
    const c = p.container, t = p.totals, sp = p.space, X = window.XLSX;
    const s1 = [['BÁO CÁO XẾP HÀNG CONTAINER — Container Loading 3D'], ['Ngày', ymd()], [], ['Container', c.name], ['Loại', c.type], ['Kích thước trong (D×R×C, mm)', c.L + ' × ' + c.W + ' × ' + c.H], ['Cửa (R×C, mm)', c.doorW + ' × ' + c.doorH], ['Tải trọng cho phép (kg)', c.maxPayload], ['Red line (mm)', c.redLine || ''], ['Khe vách đầu / cửa / hai bên (mm)', c.clearFront + ' / ' + c.clearRear + ' / ' + c.clearSide], ['Chiều cao xếp tối đa (mm)', sp.effH], [],
      ['Số thùng yêu cầu', t.requested], ['Số thùng đã xếp', t.loaded], ['RỚT LẠI KHO (thùng)', t.left], ['Khối lượng hàng đã xếp (kg)', Math.round(t.kg * 100) / 100], ['Thể tích trong cont (m³)', Math.round(t.volInternal / 1e7) / 100], ['Thể tích chứa hàng được (m³)', Math.round(t.volUsable / 1e7) / 100], ['Khối hàng đã xếp (m³)', Math.round(t.volBox / 1e7) / 100], ['Khối còn trống tới giới hạn xếp (m³)', Math.round(t.volFreeUsable / 1e7) / 100], ['Khối còn trống trong cả cont (m³)', Math.round(t.volFreeInternal / 1e7) / 100], ['Lấp đầy vùng chứa (%)', Math.round(t.fillUsablePct * 10) / 10], ['Chiều dài đã dùng (mm)', Math.round(t.usedLength)], ['Chiều dài còn trống trước cửa (mm)', Math.round(t.freeLength)], ['Trọng tâm dọc / ngang (%)', t.cog ? Math.round(t.cog.xPct) + ' / ' + Math.round(t.cog.yPct) : ''], ['Kiểm tra độc lập', p.verify.ok ? 'ĐẠT (không chồng, đủ đỡ, đúng thứ tự đóng)' : 'CÓ LỖI'], ['Cách xếp', p.options.mergeTail ? 'Ghép lấp chỗ trống cạnh vách cuối' : 'Tách riêng từng mặt hàng'], [], ['CẢNH BÁO']].concat(p.warnings.concat(p.errors).map((m) => [m]));
    const s2 = [['STT đóng', 'Mã hàng', 'Tên hàng', 'Size', 'Date', 'Dài (mm)', 'Rộng (mm)', 'Cao (mm)', 'kg/thùng', 'Yêu cầu', 'Đã xếp', 'Rớt lại kho', 'Kiểu xếp / hướng đặt', 'Từ vách đầu (mm)', 'Đến (mm)', 'KG đã xếp', 'Khối 1 thùng (m³)', 'Khối yêu cầu (m³)', 'Khối đã xếp (m³)', 'Ghi chú đóng hàng', 'Lý do rớt / lưu ý']].concat(p.groups.map((g, i) => [i + 1, g.sku.code, g.sku.name, g.sku.size, g.sku.date, g.sku.L, g.sku.W, g.sku.H, g.sku.kg, g.requested, g.loaded, g.left, (g.patterns || []).map((x) => x.text).join(' | '), g.xStart != null ? Math.round(g.xStart - sp.x0) : '', g.xEnd != null ? Math.round(g.xEnd - sp.x0) : '', Math.round(g.kg * 100) / 100, Math.round(g.volUnit / 1e5) / 1e4, Math.round(g.volReq / 1e7) / 100, Math.round(g.volLoaded / 1e7) / 100, g.sku.note, (g.reasons || []).join(' ')])).concat([['', 'TỔNG', '', '', '', '', '', '', '', t.requested, t.loaded, t.left, '', '', '', Math.round(t.kg * 100) / 100, '', Math.round(t.volReqAll / 1e7) / 100, Math.round(t.volBox / 1e7) / 100, '', '']]);
    const s3 = [['STT đóng', 'Dãy', 'Loại', 'Mã hàng', 'Size', 'Date', 'Lớp (tầng)', 'Cách vách đầu (mm)', 'Cách vách phải (mm)', 'Cao từ sàn (mm)', 'Dài đặt (mm)', 'Ngang đặt (mm)', 'Cao đặt (mm)', 'Hướng']].concat(p.boxes.map((b) => { const sk = p.groups[b.group].sku; return [b.seq, b.row, b.sample ? 'Mẫu hải quan' : 'Hàng chính', sk.code, sk.size, sk.date, b.tier, Math.round(b.x - sp.x0), Math.round(b.y - sp.y0), Math.round(b.z), Math.round(b.dx), Math.round(b.dy), Math.round(b.dz), (b.ori === 'dung' ? 'dựng đứng' : 'đặt nằm') + (b.rot ? ' xoay 90°' : '')]; }));
    const wb = X.utils.book_new(), add = (name, aoa, w) => { const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = w.map((x) => ({ wch: x })); X.utils.book_append_sheet(wb, ws, name); };
    add('Tổng quan', s1, [38, 60]); add('Theo mặt hàng', s2, [9, 16, 20, 10, 12, 9, 9, 9, 9, 10, 10, 11, 44, 14, 12, 12, 12, 12, 12, 34, 40]); add('Trình tự đóng', s3, [9, 7, 14, 16, 10, 12, 10, 16, 16, 14, 11, 11, 11, 18]);
    const s4 = [['Dãy', 'Từ vách đầu (mm)', 'Đến (mm)', 'Số thùng', 'Mẫu hải quan', 'Các mặt hàng trong dãy']].concat(p.rows.map((r) => { const names = []; p.boxes.forEach((b) => { if (b.row === r.row) { const sk = p.groups[b.group].sku, nm = (sk.code || '') + ' ' + (sk.size || '') + ' ' + (sk.date || ''); if (!names.includes(nm)) names.push(nm); } }); return [r.row, Math.round(r.x0 - sp.x0), Math.round(r.x1 - sp.x0), r.n, r.samples ? r.samples : '', names.join(' | ')]; }));
    add('Theo dãy', s4, [7, 16, 12, 10, 14, 70]);
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' }); const name = 'XepContainer_' + safeName(c.name) + '_' + ymd() + '.xlsx';
    download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name); toast('Đã xuất ' + name);
  }
  // Đẩy cont đã lưu + phương án đã lưu lên điện thoại (bảng C3D của Đồng bộ điện thoại; điện thoại chỉ xem / mở)
  async function pushPhone() {
    if (!window.sheetsSyncAPI || !window.sheetsSyncAPI.pushModule) { toast('Không có chức năng đồng bộ điện thoại.'); return; }
    toast('Đang đẩy lên điện thoại…');
    try {
      const r = await window.sheetsSyncAPI.pushModule('module14');
      if (r && r.ok) toast('Đã đẩy ' + S.saved.length + ' cont + ' + S.plans.length + ' phương án lên điện thoại. (Chỉ các mục ĐÃ LƯU được đẩy.)');
      else toast((r && r.error) || 'Không đẩy được lên điện thoại.');
    } catch (e) { toast('Không đẩy được: ' + (e.message || e)); }
  }
  function exportPng() {
    if (!S.user.canExport) { toast('Bạn không được cấp quyền xuất file.'); return; } if (!S.view) return;
    const light = document.documentElement.getAttribute('data-theme') === 'light', url = S.view.screenshot(light ? '#fffcf2' : '#14161a'), a = document.createElement('a'); a.href = url; a.download = 'Container3D_' + safeName(S.cont.name) + '_' + ymd() + '.png'; document.body.appendChild(a); a.click(); a.remove(); toast('Đã lưu ảnh 3D.');
  }

  // ------------------------------------------------------------------ khung 3D: góc nhìn + vách
  let viewName = 'iso'; const curView = () => viewName;
  function syncWallBoxes(w) { document.querySelectorAll('[data-wall]').forEach((i) => { i.checked = !!w[i.dataset.wall]; }); }
  function bindView() {
    $('c3dViews').onclick = (e) => { const b = e.target.closest('[data-view]'); if (!b || !S.view) return; viewName = b.dataset.view; document.querySelectorAll('#c3dViews .c3d-chip').forEach((x) => x.classList.toggle('on', x === b)); S.view.setPreset(viewName); };
    $('c3dToggles').onchange = (e) => { const t = e.target; if (!S.view) return; if (t.dataset.wall) S.view.setWall(t.dataset.wall, t.checked); else if (t.dataset.opt) S.view.setOpt(t.dataset.opt, t.checked); };
    $('c3dLayers').onchange = onLayerChange; $('c3dLayers').onclick = onLayerClick; $('c3dSeq').onclick = onSeqClick; $('c3dSeq').oninput = (e) => { if (e.target.id === 'seqRange') { stopPlay(); setSeq(+e.target.value); } };
  }

  // ------------------------------------------------------------------ PC 8.70: MÔ PHỎNG TỰ ĐỘNG TỪ "LỊCH XUẤT"
  // Trang chính (lich-xuat-cont.js) gửi { type:'kla-c3d-auto', groups:[…] } mỗi khi lịch xuất được thêm / sửa / đổi LSX / dò lại tồn:
  //   mỗi group = 1 CONTAINER (cùng ngày + cùng mã "chung cont", hoặc 1 lịch) kèm các dòng hàng { ma, ten, size, qty, ton, kg, nsx, lsx } đã tính sẵn từ tồn kho theo LSX + mã hàng.
  // Ở đây: tra KÍCH THƯỚC THÙNG trong danh mục "Lưu danh mục" (khoá = mã hàng + size) → tự chọn container NHỎ NHẤT vừa đủ → E.solve → lưu thành "Phương án đã lưu" có cờ data.auto
  // (không đụng vào hàng / cont bạn đang làm dở trong màn hình). Chỉ CẢNH BÁO khi hàng không vừa / thiếu kích thước thùng / thiếu tồn. Phương án bị KHÓA (data.auto.lock) thì không bao giờ bị ghi đè.
  const AUTO_OPTS = () => ({ mergeTail: true, stackTop: true, heightRule: true, sampleOn: S.opts.sampleOn !== false, sampleQty: S.opts.sampleQty == null ? 10 : S.opts.sampleQty, dateDir: 'asc', sortMode: 'auto', autoLayout: true, spread: false, compare: false, hints: false });
  const nk = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();
  function catFind(code, size) { // → { v, exact } | null
    const c = nk(code), z = nk(size); if (!c) return null;
    const ex = S.cat.find((x) => nk(x.v.code) === c && nk(x.v.size) === z); if (ex) return { v: ex.v, exact: true };
    const same = S.cat.filter((x) => { const k = nk(x.v.code); return k && (k === c || (k.length >= 6 && (c.startsWith(k) || k.startsWith(c)))); });
    const hit = same.find((x) => nk(x.v.size) === z) || same.find((x) => !nk(x.v.size)) || same[0];
    return hit ? { v: hit.v, exact: nk(hit.v.size) === z } : null;
  }
  const missCount = () => Object.keys(S.autoMiss || {}).length;
  function paintOpenBtn() { const b = $('c3dOpen'); if (b) b.textContent = 'Phương án đã lưu' + (missCount() ? ' ⚠' + missCount() : ''); }
  const autoDmy = (k) => k.slice(8, 10) + '/' + k.slice(5, 7);
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function autoWarnHtml(p) {
    const a = p.data && p.data.auto; if (!a) return '';
    const w = a.warn || [];
    return w.length ? '<small style="color:#e0a100;display:block">⚠ ' + w.map(esc).join(' · ') + '</small>' : '';
  }
  function autoBuild(g) { // → { skus, missing, warn }
    const merged = new Map(), missing = [], warn = [];
    (g.lines || []).forEach((l) => {
      const qty = Math.max(0, Math.floor(num(l.qty))); if (!qty) return;
      const cm = catFind(l.ma, l.size), label = (String(l.ma || l.ten || '').trim() || '(không mã)') + (l.size ? ' ' + l.size : '');
      if (!cm || !(cm.v.L > 0 && cm.v.W > 0 && cm.v.H > 0)) { // PC 8.71: chưa có kích thước → VẪN đưa vào phương án với kích thước TẠM (mặc định của ô thêm hàng) để bạn mở ra sửa trực tiếp, rồi "Lưu danh mục"
        if (missing.indexOf(label) < 0) missing.push(label);
        const code0 = String(l.ma || '').trim(), k0 = nk(code0) + '|' + nk(l.size) + '|' + String(l.nsx || ''), o0 = merged.get(k0);
        if (o0) { o0.qty += qty; return; }
        merged.set(k0, newSku({ code: code0, size: String(l.size || '').trim(), name: String(l.ten || ''), date: String(l.nsx || ''), qty, kg: num(l.ton) > 0 && num(l.kg) > 0 ? num(l.kg) / num(l.ton) : 10, note: 'CHƯA CÓ KÍCH THƯỚC THÙNG — đang dùng số tạm, hãy nhập đúng rồi bấm “Lưu danh mục”' }));
        return;
      }
      if (!cm.exact) warn.push('“' + label + '” chưa có đúng size trong danh mục — tạm dùng kích thước của “' + catLabel(cm.v) + '”');
      const code = String(cm.v.code || l.ma || '').trim(), k = nk(code) + '|' + nk(l.size) + '|' + String(l.nsx || ''), kgEach = num(cm.v.kg) > 0 ? num(cm.v.kg) : (num(l.ton) > 0 ? num(l.kg) / num(l.ton) : 0);
      const o = merged.get(k); if (o) { o.qty += qty; return; }
      merged.set(k, newSku(Object.assign({}, clone(cm.v), { code, size: String(l.size || '').trim(), name: String(l.ten || cm.v.name || ''), date: String(l.nsx || ''), qty, kg: kgEach })));
    });
    if ((g.lack || []).length) warn.push('Thiếu tồn so với số cần xuất: ' + g.lack.join(', '));
    return { skus: Array.from(merged.values()), missing, warn };
  }
  const contCap = (c) => c.L * c.W * Math.min(c.H, c.redLine > 0 ? c.redLine : c.H);
  function autoPick(skus, opts) { // cont NHỎ NHẤT vừa đủ; không có cont nào vừa → cont lớn nhất (kèm cảnh báo)
    const conts = contList().filter((c) => c.L > 0 && c.W > 0 && c.H > 0).sort((a, b) => contCap(a) - contCap(b));
    const boxVol = skus.reduce((a, k) => a + k.L * k.W * k.H * k.qty, 0), totKg = skus.reduce((a, k) => a + k.kg * k.qty, 0);
    let best = null;
    for (const c of conts) {
      if (boxVol > contCap(c) || (c.maxPayload > 0 && totKg > c.maxPayload)) continue; // chắc chắn không vừa → bỏ qua cho nhanh
      let plan; try { plan = E.solve({ container: c, skus: clone(skus) }, opts); } catch (e) { continue; }
      const ok = plan.verify.ok && !plan.errors.length && plan.totals.left === 0;
      if (ok) return { cont: c, plan, fit: true, auto: true };
      if (!best || plan.totals.loaded > best.plan.totals.loaded) best = { cont: c, plan, fit: false, auto: true };
    }
    const big = conts[conts.length - 1]; if (!big) return null;
    if (!best || best.cont.id !== big.id) { try { const plan = E.solve({ container: big, skus: clone(skus) }, opts); if (!best || plan.totals.loaded >= best.plan.totals.loaded) best = { cont: big, plan, fit: plan.totals.left === 0 && plan.verify.ok, auto: true }; } catch (e) { /* giữ best */ } }
    return best;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  async function autoRun(groups, opt) {
    if (!S.user.canWrite) throw new Error('Tài khoản chỉ xem — không lưu được phương án tự động.');
    await booted;
    const res = { created: 0, updated: 0, removed: 0, same: 0, locked: 0, noData: 0, warnings: [] }, keys = new Set(), now = new Date().toISOString(); let dirty = false;
    for (const g of groups) {
      const key = String(g.key); keys.add(key);
      const id = 'lx_' + hash(key), idx = S.plans.findIndex((p) => p.id === id), old = idx >= 0 ? S.plans[idx] : null;
      if (old && old.data && old.data.auto && old.data.auto.lock) { res.locked++; continue; }
      const b = autoBuild(g);
      if (!b.skus.length) { // không có hàng mô phỏng được (chưa dò tồn / thiếu kích thước): xoá phương án tự động cũ (nếu có) để khỏi sai lệch, giữ cảnh báo
        if (old) { S.plans.splice(idx, 1); dirty = true; res.removed++; }
        res.noData++; if (b.missing.length) res.warnings.push('Cont ' + autoDmy(g.ngay) + ' · ' + (g.lsx || []).join('+') + ': chưa có kích thước thùng cho ' + b.missing.join(', ')); continue;
      }
      const sig = hash(JSON.stringify([b.skus.map((k) => [k.code, k.size, k.date, k.qty, Math.round(k.L), Math.round(k.W), Math.round(k.H), k.kg, k.orient || '', k.allowLay, k.allowStand, k.allowRotate]), b.missing, contList().map((c) => [c.id, c.L, c.W, c.H, c.maxPayload, c.redLine]), S.opts.sampleOn, S.opts.sampleQty]));
      if (old && old.data && old.data.auto && old.data.auto.sig === sig) { res.same++; continue; }
      const opts = AUTO_OPTS(), pk = autoPick(b.skus, opts); if (!pk) continue; await tick();
      const t = pk.plan.totals, warn = b.warn.slice();
      if (!pk.fit) warn.unshift('KHÔNG VỪA: ' + (t.left ? 'rớt ' + fmt(t.left) + ' thùng' : 'phương án chưa hợp lệ') + ' với cont lớn nhất (' + pk.cont.name + ')');
      if (b.missing.length) warn.unshift(b.missing.length + ' mã chưa có kích thước thùng — đang dùng kích thước TẠM, kết quả chưa đáng tin: ' + b.missing.join(', '));
      const lsxTxt = (g.lsx || []).join('+') || '—', nm = 'LX ' + autoDmy(g.ngay) + ' · ' + lsxTxt + (g.khach ? ' · ' + String(g.khach).split(' · ')[0] : '');
      const rec = { id, name: nm, capNhat: now, contName: pk.cont.name + ' (tự chọn)', loaded: t.loaded, requested: t.requested,
        data: { cont: clone(pk.cont), cid: pk.cont.id, skus: b.skus, opts, colors: {}, unit: 'mm', auto: { key, ngay: g.ngay, lsx: g.lsx || [], rowIds: g.rowIds || [], sig, lock: false, warn, missing: b.missing, fit: !!pk.fit, at: now } } };
      delete rec.data.cont.builtin; delete rec.data.cont.edited;
      if (old) { S.plans[idx] = rec; res.updated++; } else { S.plans.unshift(rec); res.created++; } dirty = true;
      if (warn.length) res.warnings.push(nm + ': ' + warn.join('; '));
    }
    if (opt && opt.full) { // đối soát đầy đủ: bỏ phương án tự động (chưa khóa) của lịch đã xoá / đổi LSX / ngày, hoặc đã qua > 14 ngày
      const lim = new Date(Date.now() - 14 * 864e5), lk = lim.getFullYear() + '-' + String(lim.getMonth() + 1).padStart(2, '0') + '-' + String(lim.getDate()).padStart(2, '0');
      const keep = S.plans.filter((p) => { const a = p.data && p.data.auto; if (!a || a.lock) return true; return keys.has(a.key) && a.ngay >= lk; });
      if (keep.length !== S.plans.length) { res.removed += S.plans.length - keep.length; S.plans = keep; dirty = true; }
    }
    if (opt && opt.full) Object.keys(S.autoMiss).forEach((k) => { if (!keys.has(k)) delete S.autoMiss[k]; });
    scheduleSave(); paintOpenBtn();
    if (dirty) { await persistPlans(); autoPushSoon(); }
    return res;
  }
  let pushT = 0;
  function autoPushSoon() { // đẩy lên điện thoại (êm, không báo lỗi) sau khi tính xong
    clearTimeout(pushT); pushT = setTimeout(() => { try { if (window.sheetsSyncAPI && window.sheetsSyncAPI.pushModule) window.sheetsSyncAPI.pushModule('module14').catch(() => {}); } catch (e) { /* bỏ qua */ } }, 15000);
  }
  let autoChain = Promise.resolve();
  window.addEventListener('message', (ev) => { // CHỈ nhận từ trang chính
    const d = ev.data; if (!d || window.parent === window || ev.source !== window.parent) return;
    if (d.type === 'kla-c3d-ping') { if (S.loaded) ev.source.postMessage({ type: 'kla-c3d-pong', id: d.id }, '*'); return; }
    if (d.type !== 'kla-c3d-auto') return;
    const run = () => autoRun(Array.isArray(d.groups) ? d.groups : [], { full: !!d.full }), p = autoChain.then(run, run); autoChain = p.catch(() => {});
    p.then((res) => ev.source.postMessage({ type: 'kla-c3d-res', id: d.id, ok: true, res }, '*'), (e) => ev.source.postMessage({ type: 'kla-c3d-res', id: d.id, ok: false, error: String((e && e.message) || e) }, '*'));
  });

  // ------------------------------------------------------------------ khởi động
  async function boot() {
    try { const r = await window.authAPI.state(); if (r && r.ok && r.user) S.user = { canWrite: !!r.user.canWrite, canExport: !!r.user.canExport, ten: r.user.tenHienThi || r.user.ten }; } catch (e) { /* mở ngoài app: để mặc định */ }
    await loadAll();
    if (!S.cont) pickContainer(S.cid); else { const base = contList().find((x) => x.id === S.cid); if (!base) { S.cid = 'rf40hc'; } }
    if (!S.cont || !(S.cont.L > 0)) pickContainer('rf40hc');
    S.loaded = true; bootOk();
    $('c3dSave').disabled = !S.user.canWrite; $('c3dSave').title = S.user.canWrite ? $('c3dSave').title : 'Tài khoản chỉ xem — không lưu được';
    $('c3dExcel').disabled = !S.user.canExport; $('c3dPng').disabled = !S.user.canExport;
    const side = $('c3dSide'); side.addEventListener('input', onSideInput); side.addEventListener('change', onSideChange); side.addEventListener('click', onSideClick);
    $('c3dReport').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hint]'); if (!b || !S.plan) return; const h = (S.plan.hints || [])[+b.dataset.hint]; if (!h) return;
      Object.keys(h.patch.skus || {}).forEach((id) => { const k = S.skus.find((x) => x.id === id); if (k) Object.assign(k, clone(h.patch.skus[id])); });
      Object.assign(S.cont, h.patch.container || {}); Object.assign(S.opts, h.patch.opts || {}); renderSide(); calc(); scheduleSave(); toast('Đã áp dụng gợi ý: ' + h.text);
    });
    ['click', 'input', 'change'].forEach((ev) => { $('c3dDlg').addEventListener(ev, onTpl); $('c3dDlg').addEventListener(ev, onCat); });
    $('c3dModal').addEventListener('click', (e) => { if (e.target === $('c3dModal')) closeModal(); onDlgClick(e); });
    $('c3dCalc').onclick = () => calc(); $('c3dSave').onclick = savePlanDialog; $('c3dOpen').onclick = openPlans; $('c3dExcel').onclick = exportExcel; $('c3dPng').onclick = exportPng; $('c3dPush').onclick = pushPhone;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    bindView(); renderSide();
    try {
      S.view = window.C3DView.create($('c3dVp')); S.view.onHover = onHover; S.view.onPick = onPick; S.view.onWalls = syncWallBoxes; S.view.onRowPick = (r) => { S.selRow = r; renderLayers(); }; syncWallBoxes(S.view.opt.walls);
      const light = () => document.documentElement.getAttribute('data-theme') === 'light'; S.view.setLight(light());
      new MutationObserver(() => { S.view.setLight(light()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (err) { console.error(err); $('c3dVp').insertAdjacentHTML('beforeend', '<div class="c3d-empty" style="position:absolute;inset:0;display:grid;place-items:center">Không dựng được khung 3D (WebGL): ' + esc(err.message || err) + '</div>'); }
    calc();
  }
  boot();
})();
;

/* ===================== (4) CHÚ THÍCH NHANH — tip-nhanh ===================== */
// tip-nhanh.js — chú thích HIỆN NGAY khi rê chuột vào nút chỉ có biểu tượng (PC 0.29). Không chờ như title mặc định của trình duyệt.
// Phần tử nào có data-tip="Tên chức năng" (và tùy chọn data-tip-desc / title làm dòng giải thích) sẽ hiện chú thích ngay; nút .c3d-btn không có data-tip lấy chữ của nút.
// Dùng chung được cho trang khác: nạp file này + thêm CSS `.kl-tip` (css/c3d-redesign.css cuối file).
(function () {
  'use strict';
  var tip = null, cur = null;
  function el() {
    if (tip) return tip;
    tip = document.createElement('div'); tip.className = 'kl-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    document.body.appendChild(tip); return tip;
  }
  function textOf(t) {
    var name = t.getAttribute('data-tip'), desc = t.getAttribute('data-tip-desc'), ti = t.getAttribute('title') || '';
    if (!name && t.closest('.c3d-grp') && t.classList.contains('c3d-btn')) name = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (!name) name = ti; // phần tử chỉ có title: hiện luôn title, không chờ
    if (!name) return null;
    if (ti) { t.removeAttribute('title'); if (!desc && ti !== name) { desc = ti; t.setAttribute('data-tip-desc', ti); } } // bỏ title để khỏi hiện 2 lần
    return { name: name, desc: (desc && desc !== name) ? desc : '' };
  }
  function place(t) {
    var d = el(), r = t.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    var x = r.left + r.width / 2 - w / 2; x = Math.max(6, Math.min(x, vw - w - 6));
    var y = r.bottom + 8; if (y + h > vh - 6) y = Math.max(6, r.top - h - 8);
    d.style.left = Math.round(x) + 'px'; d.style.top = Math.round(y) + 'px';
  }
  function show(t) {
    var c = textOf(t); if (!c) return;
    var d = el(); cur = t;
    d.innerHTML = ''; var b = document.createElement('b'); b.textContent = c.name; d.appendChild(b);
    if (c.desc) { var s = document.createElement('span'); s.textContent = c.desc; d.appendChild(s); }
    d.hidden = false; place(t);
  }
  function hide() { cur = null; if (tip) tip.hidden = true; }
  function find(n) { return n && n.closest ? n.closest('[data-tip],[title],.c3d-btn') : null; }
  document.addEventListener('mouseover', function (e) { var t = find(e.target); if (t && t !== cur) show(t); else if (!t) hide(); });
  document.addEventListener('mouseout', function (e) { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', function (e) { var t = find(e.target); if (t && e.target.matches && e.target.matches(':focus-visible')) show(t); });
  document.addEventListener('focusout', hide);
  ['mousedown', 'wheel', 'scroll', 'keydown', 'blur'].forEach(function (ev) { window.addEventListener(ev, hide, true); });
})();
