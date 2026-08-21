/* Slot Machine Tool
 *
 * Rebuilds the reel transition from MTV Music Transitions 2021, 10–15s: a row of
 * vertical reels, each scrolling its own strip of graphic tiles, landing one
 * after another rather than together. The stagger is what makes it read as a
 * slot machine instead of a wipe.
 *
 * Everything is drawn to one canvas so the result can be captured straight to
 * video — no screen recording, no dropped frames.
 */

// Palette sampled off the reference footage rather than guessed.
const PALETTE = ['#f2d53d', '#01a9f0', '#35ff6f', '#ff4824', '#ff2fd0', '#7b2ff7', '#fdf74e', '#111111'];

const RATIOS = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080] };
const EXPORT_FPS = 30;
const MP4_ENCODER_URL = 'https://cdn.jsdelivr.net/npm/mediabunny@1.52.3/+esm';
const QUERY = new URLSearchParams(location.search);

const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: false });

// The scene is drawn flat to an offscreen canvas, then composited onto the
// visible one through a barrel warp. Doing it in that order means the reels
// never have to know the screen is curved.
const scene = document.createElement('canvas');
const sctx = scene.getContext('2d', { alpha: false });

let colours = PALETTE.slice(0, 6);
let payoffColours = [colours[0], colours[1]];
let logoImg = new Image();
logoImg.onload = () => {
    buildReels();
    // Deterministic final-frame preview for visual QA and art-direction review.
    if (QUERY.has('payoff')) {
        startSpin(0, 1);
        renderFrame(10_000);
        exportInProgress = true;
    } else if (QUERY.has('merge')) {
        startSpin(0, 1);
        const phase = Math.max(0, Math.min(1, parseFloat(QUERY.get('merge')) || 0.5));
        const mergePreview = parseFloat($('dur').value)
                           + parseFloat($('stag').value) * (reels.length - 1)
                           + parseFloat($('col').value)
                           + parseFloat($('matchHold').value)
                           + parseFloat($('mergeTime').value) * phase;
        renderFrame(mergePreview * 1000);
        exportInProgress = true;
    } else if (QUERY.has('match')) {
        startSpin(0, 1);
        const matchPreview = parseFloat($('dur').value)
                           + parseFloat($('stag').value) * (reels.length - 1)
                           + parseFloat($('col').value)
                           + parseFloat($('matchHold').value) * 0.5;
        renderFrame(matchPreview * 1000);
        exportInProgress = true;
    }
};
logoImg.src = new URL('wtv-logo.png', document.baseURI).href;
let reels = [];
let spinStart = null;
// The reels are the random part; the payout is the fixed thing you pull for.
// Seeding it off the clock meant every spin and every export rolled a fresh
// pair, so a bumper's wide and tall cuts were two separate pulls and landed on
// two different colours — and the payout colour is the bumper's identity, so
// that made ten palettes to keep straight instead of five. This survives a
// ratio switch and a second export. RESEED is the only thing that rolls it.
let payoffSeed = Date.now();
let exportInProgress = false;

/* ── tile artwork ──────────────────────────────────────────────────────
 * Each tile is one flat graphic on a flat ground — stripes, rings, dots and
 * so on. Kept procedural so RESEED gives a whole new set without assets.
 */
const MOTIFS = ['rings', 'stripes', 'dots', 'zigzag', 'checks', 'burst', 'solid', 'logo'];

function makeTile(rand) {
    const reserved = $('prizeColor')?.value.toLowerCase();
    const available = colours.filter(colour => colour.toLowerCase() !== reserved);
    const pool = available.length > 1 ? available : colours;
    const bgIndex = (rand() * pool.length) | 0;
    const bg = pool[bgIndex];
    let fg = pool[(rand() * pool.length) | 0];
    if (fg === bg) fg = pool[(bgIndex + 1) % pool.length] || '#111111';
    const logoChance = parseFloat($('logoFreq').value);
    const motif = rand() < logoChance ? 'logo' : MOTIFS[(rand() * (MOTIFS.length - 1)) | 0];
    return { bg, fg, motif, phase: rand() };
}

function drawTile(t, x, y, w, h) {
    const ctx = sctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.fillStyle = t.bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = t.fg;
    ctx.strokeStyle = t.fg;

    const cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);

    switch (t.motif) {
        case 'rings': {
            const step = m / 14;
            ctx.lineWidth = step * 0.55;
            for (let r = step; r < m * 0.95; r += step) {
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            break;
        }
        case 'stripes': {
            const n = 7, sw = w / n;
            for (let i = 0; i < n; i += 2) ctx.fillRect(x + i * sw, y, sw, h);
            break;
        }
        case 'dots': {
            const n = 4, cell = w / n, r = cell * 0.26;
            for (let i = 0; i < n; i++)
                for (let j = 0; j < Math.ceil(h / cell); j++) {
                    ctx.beginPath();
                    ctx.arc(x + (i + 0.5) * cell, y + (j + 0.5) * cell, r, 0, Math.PI * 2);
                    ctx.fill();
                }
            break;
        }
        case 'zigzag': {
            ctx.lineWidth = m * 0.09;
            const rows = 5, step = h / rows, seg = w / 4;
            for (let r = 0; r < rows; r++) {
                ctx.beginPath();
                for (let i = 0; i <= 4; i++) {
                    const px = x + i * seg;
                    const py = y + r * step + (i % 2 ? step * 0.7 : step * 0.2);
                    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
                }
                ctx.stroke();
            }
            break;
        }
        case 'checks': {
            const n = 4, c = w / n;
            for (let i = 0; i < n; i++)
                for (let j = 0; j < Math.ceil(h / c); j++)
                    if ((i + j) % 2) ctx.fillRect(x + i * c, y + j * c, c, c);
            break;
        }
        case 'burst': {
            const spokes = 12;
            for (let i = 0; i < spokes; i += 2) {
                const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, m, a0, a1);
                ctx.closePath();
                ctx.fill();
            }
            break;
        }
        case 'logo': {
            if (logoImg) {
                const pad = m * 0.16;
                const bw = w - pad * 2, bh = h - pad * 2;
                const s = Math.min(bw / logoImg.width, bh / logoImg.height);
                const dw = logoImg.width * s, dh = logoImg.height * s;
                ctx.drawImage(logoImg, cx - dw / 2, cy - dh / 2, dw, dh);
            } else {
                ctx.fillRect(x + w * 0.18, y + h * 0.34, w * 0.64, h * 0.32);
                ctx.fillStyle = t.bg;
                ctx.font = `700 ${m * 0.2}px ui-monospace,monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('WTV', cx, cy);
            }
            break;
        }
        default:
            ctx.fillRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6);
    }

    const sw = parseFloat($('stroke').value);
    if (sw > 0) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = sw;
        ctx.strokeRect(x + sw / 2, y + sw / 2, w - sw, h - sw);
    }
    ctx.restore();
}

function drawPrizeGround(t, x, y, w, h, opacity) {
    const sw = parseFloat($('stroke').value);
    sctx.save();
    sctx.globalAlpha = opacity;
    sctx.fillStyle = t.bg;
    sctx.fillRect(x, y, w, h);
    if (sw > 0) {
        sctx.strokeStyle = '#000';
        sctx.lineWidth = sw * opacity;
        sctx.strokeRect(x + sw / 2, y + sw / 2, w - sw, h - sw);
    }
    sctx.restore();
}

/* ── backdrop ───────────────────────────────────────────────────────
 * In the reference the pattern runs unbroken behind all three panels — the
 * reels are windows onto one continuous ground, not separate tiles that happen
 * to sit side by side. Drawing it once across the whole frame is what makes the
 * ending read as a single screen.
 */
function drawBackdrop(W, H, now, alpha) {
    const kind = $('backdrop').value;
    if (kind === 'none' || alpha <= 0) return false;
    sctx.save();
    sctx.globalAlpha = alpha;

    const scale = parseFloat($('bdScale').value);
    const drift = parseFloat($('bdDrift').value);
    const t = (now / 1000) * drift;

    const [bg, fg] = payoffColours;
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, W, H);
    sctx.fillStyle = fg;
    sctx.strokeStyle = fg;

    const cx = W / 2, cy = H / 2;

    if (kind === 'rings') {
        const step = (Math.max(W, H) / 26) * scale;
        sctx.lineWidth = step * 0.5;
        const phase = (t * step) % step;
        for (let r = step * 0.4 + phase; r < Math.hypot(W, H); r += step) {
            sctx.beginPath();
            sctx.arc(cx, cy, r, 0, Math.PI * 2);
            sctx.stroke();
        }
    } else if (kind === 'stripes') {
        const sw = (W / 14) * scale;
        const phase = (t * sw * 2) % (sw * 2);
        for (let x = -sw * 2 + phase; x < W + sw; x += sw * 2) sctx.fillRect(x, 0, sw, H);
    } else if (kind === 'zigzag') {
        // Chevron bands stacked down the frame. Drawn as filled strips rather
        // than stroked lines so the two colours meet edge to edge, the way the
        // tile motif does — a stroke would leave the ground showing between
        // them at this scale.
        const band = (H / 11) * scale;
        const teeth = Math.max(2, Math.round(6 / scale));
        const amp = band * 0.85;
        const phase = (t * band * 2) % (band * 2);
        const edge = (i) => (i % 2 === 0 ? 0 : amp);
        for (let y = -band * 3 + phase; y < H + band * 3; y += band * 2) {
            sctx.beginPath();
            for (let i = 0; i <= teeth; i++) sctx[i === 0 ? 'moveTo' : 'lineTo']((i / teeth) * W, y + edge(i));
            for (let i = teeth; i >= 0; i--) sctx.lineTo((i / teeth) * W, y + band + edge(i));
            sctx.closePath();
            sctx.fill();
        }
    } else if (kind === 'dots') {
        const step = (Math.max(W, H) / 13) * scale;
        const radius = step * 0.29;
        const phase = (t * step) % step;
        for (let y = -step + phase; y < H + step; y += step) {
            for (let x = -step + phase; x < W + step; x += step) {
                sctx.beginPath();
                sctx.arc(x, y, radius, 0, Math.PI * 2);
                sctx.fill();
            }
        }
    } else if (kind === 'checks') {
        const step = (Math.max(W, H) / 11) * scale;
        // Drift a whole cell per beat: at anything less the squares crawl and
        // the eye reads the seam instead of the pattern.
        const phase = (t * step) % (step * 2);
        let row = 0;
        for (let y = -step * 2 + phase; y < H + step * 2; y += step, row++) {
            let col = 0;
            for (let x = -step * 2; x < W + step * 2; x += step, col++) {
                if ((row + col) % 2 === 0) sctx.fillRect(x, y, step, step);
            }
        }
    } else if (kind === 'burst') {
        const spokes = Math.max(6, Math.round(20 / scale));
        for (let i = 0; i < spokes; i += 2) {
            const a0 = (i / spokes) * Math.PI * 2 + t, a1 = ((i + 1) / spokes) * Math.PI * 2 + t;
            sctx.beginPath(); sctx.moveTo(cx, cy);
            sctx.arc(cx, cy, Math.hypot(W, H), a0, a1);
            sctx.closePath(); sctx.fill();
        }
    }
    sctx.restore();
    return true;
}

/* ── reels ─────────────────────────────────────────────────────────── */

// Small seeded RNG so RESEED is reproducible within a session.
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function choosePayoffColours(seed) {
    const rand = rng((seed ^ 0x9e3779b9) >>> 0);
    const winning = $('prizeColor').value.toLowerCase();
    const alternatives = colours.filter(colour => colour.toLowerCase() !== winning);
    const otherPool = alternatives.length ? alternatives : colours;
    const other = otherPool[(rand() * otherPool.length) | 0] || '#111111';
    payoffColours = rand() < 0.5 ? [winning, other] : [other, winning];
}

function buildReels(seed = Date.now()) {
    const n = +$('reels').value;
    const rows = +$('rows').value;
    const rand = rng(seed);
    reels = [];
    for (let i = 0; i < n; i++) {
        // Each strip is longer than the window so the scroll never runs dry.
        const strip = [];
        const len = rows + 12;
        for (let k = 0; k < len; k++) strip.push(makeTile(rand));
        reels.push({ strip, offset: 0, from: 0, to: 0, travel: 0 });
    }
}

// Ease-out with a small overshoot — the reel passes its stop and settles back.
function easeBack(t, back) {
    const c1 = back, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function smoothstep(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
}

function recyclePrizeTiles(strip, createTile) {
    return strip.map(tile => tile.prize ? createTile() : tile);
}

function startSpin(startTime = performance.now(), prizeSeed = payoffSeed) {
    const rows = +$('rows').value;
    choosePayoffColours(prizeSeed);
    const recycleRand = rng((prizeSeed ^ 0x85ebca6b) >>> 0);

    reels.forEach((r, i) => {
        // A prize tile is written into each strip on every spin. Replace the
        // previous spin's prize before choosing the next stop, otherwise those
        // forced matches accumulate and can produce two or more winning rows.
        r.strip = recyclePrizeTiles(r.strip, () => makeTile(recycleRand));
        r.from = r.offset;
        // Always target an integer tile boundary, even when a new spin starts
        // before the previous one has fully settled at a fractional offset.
        const wholeTileStop = Math.ceil(r.from);
        r.to = wholeTileStop + (r.strip.length - rows) + (6 + i * 2);
        r.travel = r.to - r.from;
    });

    // A slot machine pays out on matching symbols. Without this the reels just
    // stop wherever they like, which reads as a scrolling ticker, not a spin.
    if ($('jackpot').checked) {
        const rand = rng(prizeSeed & 0xffff);
        const prize = makeTile(() => rand());
        prize.motif = 'logo';                     // the payoff is the mark
        prize.bg = $('prizeColor').value;          // user-directed jackpot ground
        prize.prize = true;
        // The payoff sits on the middle row, which is also the row the collapse
        // keeps — draw() derives the same index, so the two must not diverge.
        const payoffRow = Math.floor(rows / 2);
        reels.forEach((r) => {
            const idx = (Math.floor(r.to) + payoffRow) % r.strip.length;
            r.strip[(idx + r.strip.length) % r.strip.length] = prize;
        });
    }

    spinStart = startTime;
}

/* ── frame ─────────────────────────────────────────────────────────── */

function renderFrame(now) {
    const [W, H] = RATIOS[$('ratio').value];
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    if (scene.width !== W || scene.height !== H) { scene.width = W; scene.height = H; }

    const n = reels.length, gap = +$('gap').value;
    const rowsStart = +$('rows').value;
    const rowsEnd = +$('endRows').value;
    const colDur = parseFloat($('col').value) * 1000;
    const mergeDur = parseFloat($('mergeTime').value) * 1000;
    const mergeLogo = $('jackpot').checked && $('mergeLogo').checked;

    // The ending has three distinct beats: collapse the grid into three tall
    // matching panels, hold that enlarged jackpot, then merge them into one
    // full-frame logo. Keeping separate clocks makes the middle beat legible.
    let collapse = 0;
    let merge = 0;
    if (spinStart !== null) {
        const spinEnds = spinStart + parseFloat($('dur').value) * 1000
                       + parseFloat($('stag').value) * 1000 * (n - 1);
        const matchHold = parseFloat($('matchHold').value) * 1000;
        collapse = smoothstep((now - spinEnds) / colDur);
        if (mergeLogo) {
            merge = smoothstep((now - spinEnds - colDur - matchHold) / mergeDur);
        }
    }
    const rows = rowsStart + (rowsEnd - rowsStart) * collapse;
    const centreRow = Math.floor(rowsStart / 2);
    const dur = parseFloat($('dur').value) * 1000;
    const stag = parseFloat($('stag').value) * 1000;
    const back = parseFloat($('back').value);
    const blurAmt = parseFloat($('blur').value);

    // The gap runs between panels and again around the outside, so a fully
    // collapsed payoff used to stop a gap short of all four edges and leave the
    // backdrop showing through as thin bands. Close the outer margin as the
    // reels collapse, so the winning row bleeds off the frame the way the
    // reference does, while the spin keeps its border.
    const outerGap = gap * (1 - collapse);
    const colW = (W - outerGap * 2 - gap * (n - 1)) / n;
    const rowH = (H - outerGap * 2 - gap * (rows - 1)) / rows;
    const drawRows = Math.ceil(rows);
    const collapseSourceRow = Math.min(1, Math.max(0, rowsStart - 1));
    const collapseShiftY = collapse * collapseSourceRow * (rowH + gap);

    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, W, H);
    drawBackdrop(W, H, now, collapse);

    for (let i = 0; i < n; i++) {
        const r = reels[i];
        let speed = 0;
        if (spinStart !== null) {
            const t = (now - spinStart - i * stag) / dur;
            if (t <= 0) { r.offset = r.from; }
            else if (t >= 1) { r.offset = r.to; }
            else {
                const e = easeBack(t, back);
                const prev = r.offset;
                r.offset = r.from + (r.to - r.from) * e;
                speed = Math.abs(r.offset - prev);
            }
        }

        const x = outerGap + i * (colW + gap);
        const frac = r.offset % 1;
        const base = Math.floor(r.offset);

        sctx.save();
        sctx.beginPath();
        sctx.rect(x, outerGap, colW, H - outerGap * 2);
        sctx.clip();

        // Motion blur stands in for the smear a real reel leaves; scaled by speed
        // so it only shows while the reel is actually moving fast.
        const blurPx = Math.min(speed * rowH * blurAmt, rowH * 0.9);
        if (blurPx > 1) sctx.filter = `blur(${blurPx * 0.12}px)`;

        for (let k = -1; k <= drawRows + centreRow; k++) {
            const idx = ((base + k) % r.strip.length + r.strip.length) % r.strip.length;
            // Shift the second source row toward the top as it grows, so that
            // row becomes the final full-frame payoff instead of row one.
            const y = outerGap + (k - frac) * (rowH + gap) - collapseShiftY;
            const tile = r.strip[idx];
            // Once collapsed, the winning card keeps its ground but the rest
            // dissolve, letting the backdrop through — that is the payoff.
            const isPrize = tile.prize === true;
            if (isPrize && mergeLogo && merge > 0) {
                // Keep the panel fully opaque; a geometric reveal replaces it
                // below, avoiding a muddy crossfade between two bright grounds.
                drawPrizeGround(tile, x, y, colW, rowH, 1);
            } else {
                sctx.globalAlpha = isPrize ? 1 : 1 - collapse;
                drawTile(tile, x, y, colW, rowH);
            }
            sctx.globalAlpha = 1;
        }
        sctx.restore();
    }

    // Reveal the shared payoff ground from the convergence point. This turns
    // the background change into a graphic wipe rather than an opacity fade.
    if (merge > 0) {
        const reveal = smoothstep(merge);
        const radius = Math.hypot(W, H) * 0.54 * reveal;
        sctx.save();
        sctx.beginPath();
        sctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2);
        sctx.clip();
        drawBackdrop(W, H, now, 1);
        sctx.restore();
    }

    // Thin black rules between panels — the reference separates the screens with
    // a hairline rather than a gap, so the backdrop reads as one surface.
    const divW = +$('div').value;
    const dividerScale = mergeLogo ? 1 - smoothstep(merge / 0.82) : 1;
    if (divW > 0 && n > 1 && dividerScale > 0) {
        const animatedDivW = divW * dividerScale;
        sctx.fillStyle = '#000';
        for (let i = 1; i < n; i++) {
            const dx = outerGap + i * (colW + gap) - gap / 2 - animatedDivW / 2;
            sctx.fillRect(dx, 0, animatedDivW, H);
        }
        sctx.fillRect(0, 0, animatedDivW, H);
        sctx.fillRect(W - animatedDivW, 0, animatedDivW, H);
    }

    // The three jackpot logos remain opaque and physically converge. At the end
    // they occupy the exact same pixels, so three marks naturally become one —
    // no crossfade or sudden replacement is needed.
    if (merge > 0 && logoImg?.complete && logoImg.naturalWidth > 0) {
        const portrait = H / W > 1.2;
        const target = portrait ? Math.min(W * 0.84, H * 0.54)
                                : Math.min(W * 0.48, H * 0.72);
        const startSize = Math.min(colW, rowH) * 0.68;
        const travel = smoothstep(merge);
        sctx.save();
        const centre = Math.floor(n / 2);
        const drawOrder = [...Array(n).keys()].filter(i => i !== centre).concat(centre);
        for (const i of drawOrder) {
            const startX = outerGap + i * (colW + gap) + colW / 2;
            const cx = startX + (W / 2 - startX) * travel;
            // Outer marks tuck behind the centre mark and physically contract;
            // the centre mark grows into the final payoff. Nothing changes
            // opacity, so the fusion reads as motion rather than a dissolve.
            const size = i === centre
                ? startSize + (target - startSize) * easeBack(travel, 0.28)
                : startSize * (1 - 0.96 * travel);
            sctx.drawImage(logoImg, cx - size / 2, H / 2 - size / 2, size, size);
        }
        sctx.restore();
    }

    composite(W, H);
    applyDegrade(W, H);
}

function draw(now) {
    if (!exportInProgress) renderFrame(now);
    requestAnimationFrame(draw);
}

/* ── barrel warp: the picture tube ──────────────────────────────────
 * A CRT's glass bulges, so the image is widest across the middle and the edges
 * curve away. Remapping every pixel would be far too slow at 1080p60, so the
 * scene is redrawn as a stack of horizontal strips, each scaled about the
 * centre by how far it sits from the middle. At 90 strips the seams are
 * invisible and it costs 90 drawImage calls instead of two million lookups.
 */
function composite(W, H) {
    const k = parseFloat($('bulge').value);
    const vig = parseFloat($('vig').value);

    if (k <= 0) {
        ctx.drawImage(scene, 0, 0);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        // The strip loop pulls rows toward the centre by (1 - k * 0.35), so the
        // warped picture is shorter than the frame and leaves a band of bare
        // canvas top and bottom. Overscan by exactly that much to put the edges
        // back off-frame, which is what a real tube does.
        const overscan = 1 / (1 - k * 0.35);
        const STRIPS = 90;
        const sh = H / STRIPS;
        for (let i = 0; i < STRIPS; i++) {
            const v = ((i + 0.5) / STRIPS) * 2 - 1;      // −1 top … +1 bottom
            const falloff = 1 - v * v;                    // 1 at centre, 0 at edges
            const sx = 1 + k * falloff;                   // widen toward the middle
            const sy = 1 + k * falloff * 0.6;             // and a little taller

            const dw = W * sx;
            const dx = (W - dw) / 2;
            const dh = sh * sy * overscan;
            // Pull the strip toward the centre so rows crowd at the edges,
            // which is what makes the surface read as curved rather than zoomed.
            const dy = H / 2 + (i * sh + sh / 2 - H / 2) * (1 - k * 0.35) * overscan - dh / 2;

            ctx.drawImage(scene, 0, i * sh, W, sh, dx, dy, dw, dh);
        }
    }

    if (vig > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32,
                                           W / 2, H / 2, Math.max(W, H) * 0.72);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${vig})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

/* ── analogue degrade, as a pass over the finished frame ───────────── */
function applyDegrade(W, H) {
    const scan = parseFloat($('scan').value);
    const chroma = parseFloat($('chroma').value);
    const grain = parseFloat($('grain').value);
    if (!scan && !chroma && !grain) return;

    if (chroma > 0) {
        // Cheap composite-video fringing: redraw the frame offset in one channel.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.4;
        ctx.drawImage(canvas, chroma, 0);
        ctx.drawImage(canvas, -chroma, 0);
        ctx.restore();
    }
    if (scan > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${scan * 0.5})`;
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
        ctx.restore();
    }
    if (grain > 0) {
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data, amt = grain * 90;
        for (let i = 0; i < d.length; i += 4) {
            const v = (Math.random() - 0.5) * amt;
            d[i] += v; d[i + 1] += v; d[i + 2] += v;
        }
        ctx.putImageData(img, 0, 0);
    }
}

/* ── wiring ────────────────────────────────────────────────────────── */

function bindOut(id, outId, fmt = (v) => v) {
    const el = $(id), out = $(outId);
    const sync = () => { out.textContent = fmt(el.value); };
    el.addEventListener('input', sync); sync();
}
bindOut('reels', 'reelsOut'); bindOut('rows', 'rowsOut'); bindOut('gap', 'gapOut');
bindOut('dur', 'durOut', v => v + 's'); bindOut('stag', 'stagOut', v => v + 's');
bindOut('back', 'backOut'); bindOut('blur', 'blurOut'); bindOut('stroke', 'strokeOut');
bindOut('logoFreq', 'logoFreqOut'); bindOut('scan', 'scanOut');
bindOut('chroma', 'chromaOut'); bindOut('grain', 'grainOut');
bindOut('bulge', 'bulgeOut'); bindOut('vig', 'vigOut');
bindOut('bdScale','bdScaleOut'); bindOut('bdDrift','bdDriftOut');
bindOut('div','divOut');
bindOut('endRows','endRowsOut'); bindOut('col','colOut', v => v + 's');
bindOut('matchHold','matchHoldOut', v => v + 's');
bindOut('mergeTime','mergeTimeOut', v => v + 's');

['reels', 'rows', 'endRows', 'logoFreq'].forEach(id =>
    $(id).addEventListener('change', () => buildReels()));

$('spin').addEventListener('click', () => startSpin());
$('reseed').addEventListener('click', () => {
    payoffSeed = Date.now();
    buildReels();
    // Shown so two exports can be told apart: same number, same payout.
    $('status').textContent = `Payout ${(payoffSeed & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
});

$('logoFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => { logoImg = img; buildReels(); };
    img.src = URL.createObjectURL(f);
});

// Colour swatches. The payoff picker mirrors this palette, so the winning
// colour is always one of the colours already being used by Look.
const swatchWrap = $('swatches');
const winningWrap = $('winningColors');
let winningColourIndex = Math.max(0, colours.findIndex(colour =>
    colour.toLowerCase() === $('prizeColor').value.toLowerCase()));
const winningButtons = [];

function selectWinningColour(index) {
    winningColourIndex = index;
    $('prizeColor').value = colours[index];
    winningButtons.forEach((button, buttonIndex) => {
        const selected = buttonIndex === index;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-checked', String(selected));
    });
    buildReels();
}

colours.forEach((c, i) => {
    const winningButton = document.createElement('button');
    winningButton.type = 'button';
    winningButton.className = 'winning-swatch';
    winningButton.style.backgroundColor = c;
    winningButton.setAttribute('role', 'radio');
    winningButton.setAttribute('aria-label', `Palette colour ${i + 1}`);
    winningButton.addEventListener('click', () => selectWinningColour(i));
    winningWrap.appendChild(winningButton);
    winningButtons.push(winningButton);

    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = c;
    inp.setAttribute('aria-label', `Edit palette colour ${i + 1}`);
    inp.addEventListener('input', () => {
        colours[i] = inp.value;
        winningButton.style.backgroundColor = inp.value;
        if (i === winningColourIndex) $('prizeColor').value = inp.value;
        buildReels();
    });
    swatchWrap.appendChild(inp);
});
selectWinningColour(winningColourIndex);

$('shot').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `slot-${$('ratio').value.replace(':', 'x')}-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
});

async function exportMp4() {
    if (exportInProgress) return;

    const recordButton = $('record');
    const interactiveControls = [...document.querySelectorAll('button, input, select')];
    const disabledState = interactiveControls.map(control => control.disabled);
    exportInProgress = true;
    interactiveControls.forEach(control => { control.disabled = true; });
    recordButton.classList.add('recording');
    recordButton.textContent = 'MP4 0%';
    $('status').textContent = 'Preparing H.264 encoder…';

    try {
        const {
            BufferTarget,
            CanvasSource,
            Mp4OutputFormat,
            Output,
            Quality,
            canEncodeVideo,
        } = await import(MP4_ENCODER_URL);

        const [width, height] = RATIOS[$('ratio').value];
        // CanvasSource reads the canvas dimensions when it is constructed, so
        // apply a newly selected aspect ratio before creating the video track.
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        if (scene.width !== width || scene.height !== height) {
            scene.width = width;
            scene.height = height;
        }
        const spinSeconds = parseFloat($('dur').value);
        const staggerSeconds = parseFloat($('stag').value) * Math.max(0, reels.length - 1);
        const collapseSeconds = parseFloat($('col').value);
        const mergeEnabled = $('jackpot').checked && $('mergeLogo').checked;
        const matchHoldSeconds = mergeEnabled ? parseFloat($('matchHold').value) : 0;
        const mergeSeconds = mergeEnabled ? parseFloat($('mergeTime').value) : 0;
        const holdSeconds = 0.5;
        const exportDuration = spinSeconds + staggerSeconds + matchHoldSeconds
                             + collapseSeconds + mergeSeconds + holdSeconds;
        const frameCount = Math.max(1, Math.ceil(exportDuration * EXPORT_FPS));
        const quality = new Quality({
            bitrate: width * height >= 1_500_000 ? 18_000_000 : 14_000_000,
            bitrateMode: 'variable',
        });
        const supported = await canEncodeVideo('avc', {
            width,
            height,
            quality,
            latencyMode: 'quality',
        });
        if (!supported) throw new Error('This browser cannot encode H.264 MP4 video. Try current Chrome or Edge.');

        const target = new BufferTarget();
        const output = new Output({
            format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
            target,
        });
        const videoSource = new CanvasSource(canvas, {
            codec: 'avc',
            quality,
            keyFrameInterval: 2,
            latencyMode: 'quality',
            alpha: 'discard',
        });
        output.addVideoTrack(videoSource, {
            frameRate: EXPORT_FPS,
            maximumPacketCount: frameCount,
        });
        output.setMetadataTags({
            title: `Slot Machine Tool — ${$('ratio').value}`,
            artist: 'WTV',
            comment: 'Frame-accurate slot-machine bumper export',
        });
        await output.start();

        startSpin(0, payoffSeed);
        for (let frame = 0; frame < frameCount; frame++) {
            const timestamp = frame / EXPORT_FPS;
            renderFrame(timestamp * 1000);
            await videoSource.add(timestamp, 1 / EXPORT_FPS);

            if (frame % 6 === 0 || frame === frameCount - 1) {
                const progress = Math.round(((frame + 1) / frameCount) * 100);
                recordButton.textContent = `MP4 ${progress}%`;
                $('status').textContent = `Encoding MP4… ${progress}%`;
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        videoSource.close();
        await output.finalize();
        if (!target.buffer) throw new Error('MP4 encoding completed without an output file.');

        const blob = new Blob([target.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `slot-${$('ratio').value.replace(':', 'x')}-${Date.now()}.mp4`;
        a.href = url;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        $('status').textContent = `Saved ${exportDuration.toFixed(1)}s MP4 at ${EXPORT_FPS} fps`;

        // Leave the live preview on the same completed payoff frame when the
        // animation loop resumes instead of jumping back into the spin.
        spinStart = performance.now() - exportDuration * 1000;
    } catch (error) {
        console.error(error);
        $('status').textContent = error instanceof Error ? error.message : 'MP4 export failed';
    } finally {
        exportInProgress = false;
        interactiveControls.forEach((control, index) => { control.disabled = disabledState[index]; });
        recordButton.classList.remove('recording');
        recordButton.textContent = '● MP4';
    }
}

$('record').addEventListener('click', exportMp4);

const requestedRatio = QUERY.get('ratio');
if (requestedRatio && RATIOS[requestedRatio]) $('ratio').value = requestedRatio;

buildReels();
requestAnimationFrame(draw);

// ?autospin — starts a spin on load. Handy when screen-recording the tool or
// dropping it into a demo where nobody is there to press the button.
if (QUERY.has('autospin')) setTimeout(startSpin, 300);
