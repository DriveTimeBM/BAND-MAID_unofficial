// ==UserScript==
// @name         BAND-MAID YouTube Stats Ticker
// @namespace    https://drivetimebm.github.io/
// @version      1.3
// @description  Stock-ticker-style scrolling display of BAND-MAID YouTube stats
// @author       drivetimebm
// @match        https://drivetimebm.github.io/*
// @exclude      https://drivetimebm.github.io/BAND-MAID_unofficial/*
// @grant        GM_xmlhttpRequest
// @connect      drivetimebm.github.io
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const JSON_URL      = 'https://drivetimebm.github.io/BAND-MAID_gpt/youtube/youtube.json';
    const REFRESH_MS    = 4 * 60 * 60 * 1000;   // 4 hours
    const SCROLL_PXPS   = 60;
    const ALLOWED_TYPES = ['Official Music Video', 'Official Live Video', 'Anime Music Video'];
    const TOP_N         = 30;

    // ---------- styles ----------
    function addStyle(css) {
        const s = document.createElement('style');
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    }

    addStyle(`
        #bm-ticker-bar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            height: 34px;
            background: #000;
            color: #fff;
            border-top: 1px solid #c8a96e;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            line-height: 34px;
            z-index: 2147483647;
            overflow: hidden;
            display: flex;
            align-items: center;
        }
        #bm-ticker-bar .bm-ticker-label {
            flex: 0 0 auto;
            padding: 0 12px;
            background: #c8a96e;
            color: #000;
            font-weight: 700;
            letter-spacing: 0.5px;
            height: 100%;
        }
        #bm-ticker-bar .bm-ticker-viewport {
            flex: 1 1 auto;
            overflow: hidden;
            position: relative;
            height: 100%;
        }
        #bm-ticker-bar .bm-ticker-track {
            position: absolute;
            white-space: nowrap;
            will-change: transform;
            padding-left: 100%;
        }
        #bm-ticker-bar .bm-item {
            display: inline-block;
            padding: 0 18px;
            cursor: pointer;
        }
        #bm-ticker-bar .bm-item + .bm-item {
            border-left: 1px solid #333;
        }
        #bm-ticker-bar .bm-rank    { color: #c8a96e; font-weight: 700; margin-right: 8px; }
        #bm-ticker-bar .bm-title   { color: #fff; }
        #bm-ticker-bar .bm-views   { color: #c8a96e; margin-left: 8px; }
        #bm-ticker-bar .bm-delta-up   { color: #4ade80; margin-left: 6px; font-weight: 600; }
        #bm-ticker-bar .bm-delta-flat { color: #888;    margin-left: 6px; }
        #bm-ticker-bar .bm-btn {
            flex: 0 0 auto;
            padding: 0 10px;
            cursor: pointer;
            color: #888;
            height: 100%;
            font-size: 16px;
            user-select: none;
        }
        #bm-ticker-bar .bm-btn:hover { color: #fff; }
        body.bm-ticker-padded { padding-bottom: 34px !important; }

        #bm-ticker-mini {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483647;
            background: #000;
            color: #c8a96e;
            border: 1px solid #c8a96e;
            border-radius: 20px;
            padding: 6px 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            user-select: none;
        }
        #bm-ticker-mini:hover {
            background: #c8a96e;
            color: #000;
        }
    `);

    // ---------- fetch ----------
    function fetchJson() {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: JSON_URL + '?t=' + Date.now(),
                onload: r => {
                    try { resolve(JSON.parse(r.responseText)); }
                    catch (e) { reject(e); }
                },
                onerror: reject,
                ontimeout: reject
            });
        });
    }

    // ---------- format ----------
    const fmt = n => (n || 0).toLocaleString('en-US');

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function shortenTitle(title) {
        let t = String(title || '');
        // strip leading "BAND-MAID / " (or ": " / " - " variants)
        t = t.replace(/^\s*BAND[-\s]?MAID\s*[\/:\-]\s*/i, '');
        // replace type tags
        t = t.replace(/\(\s*Official\s+Music\s+Video\s*\)/i, '(OMV)');
        t = t.replace(/\(\s*Official\s+Live\s+Video\s*\)/i, '(OLV)');
        // drop everything after the (OMV) or (OLV) tag
        t = t.replace(/(\((?:OMV|OLV)\)).*$/i, '$1');
        return t.trim();
    }

    function buildItem(v, rank) {
        const delta    = Number(v.ViewsDelta) || 0;
        const deltaCls = delta > 0 ? 'bm-delta-up' : 'bm-delta-flat';
        const deltaStr = (delta > 0 ? '▲ +' : '') + fmt(delta);
        return `
            <span class="bm-item" data-url="${v.URL}">
                <span class="bm-rank">#${rank}</span>
                <span class="bm-title">${escapeHtml(shortenTitle(v.Title))}</span>
                <span class="bm-views">${fmt(v.Views)} views</span>
                <span class="${deltaCls}">${deltaStr}</span>
            </span>`;
    }

    // ---------- state ----------
    let bar, viewport, track, mini, animRAF;
    let paused      = false;
    let posX        = 0;
    let lastTs      = 0;
    let latestData  = null;
    let savedPosX   = null;   // remembers scroll position across minimize

    // ---------- build DOM ----------
    function ensureBar() {
        if (document.getElementById('bm-ticker-bar')) {
            bar      = document.getElementById('bm-ticker-bar');
            viewport = bar.querySelector('.bm-ticker-viewport');
            track    = bar.querySelector('.bm-ticker-track');
            return;
        }
        bar = document.createElement('div');
        bar.id = 'bm-ticker-bar';
        bar.innerHTML = `
            <div class="bm-ticker-label">Top Videos</div>
            <div class="bm-ticker-viewport"><div class="bm-ticker-track"></div></div>
            <div class="bm-btn bm-minimize" title="Minimize">–</div>
            <div class="bm-btn bm-close" title="Hide ticker">×</div>
        `;
        document.body.appendChild(bar);
        document.body.classList.add('bm-ticker-padded');

        viewport = bar.querySelector('.bm-ticker-viewport');
        track    = bar.querySelector('.bm-ticker-track');

        bar.querySelector('.bm-close').addEventListener('click', hideAll);
        bar.querySelector('.bm-minimize').addEventListener('click', minimize);

        track.addEventListener('click', e => {
            const item = e.target.closest('.bm-item');
            if (item && item.dataset.url) window.open(item.dataset.url, '_blank');
        });

        bar.addEventListener('mouseenter', () => { paused = true; });
        bar.addEventListener('mouseleave', () => { paused = false; });
    }

    function ensureMini() {
        if (document.getElementById('bm-ticker-mini')) {
            mini = document.getElementById('bm-ticker-mini');
            return;
        }
        mini = document.createElement('div');
        mini.id = 'bm-ticker-mini';
        mini.title = 'Restore ticker';
        mini.textContent = '♪ Top Videos';
        document.body.appendChild(mini);
        mini.addEventListener('click', maximize);
    }

    // ---------- state transitions ----------
    function minimize() {
        // remember where we were scrolled to
        savedPosX = posX;
        if (bar) {
            bar.remove();
            bar = null;
            track = null;
            viewport = null;
        }
        document.body.classList.remove('bm-ticker-padded');
        cancelAnimationFrame(animRAF);
        ensureMini();
    }

    function maximize() {
        if (mini) {
            mini.remove();
            mini = null;
        }
        if (latestData) {
            render(latestData, savedPosX);
        }
        // no else branch — we never want maximize to block on a network fetch
    }

    function hideAll() {
        if (bar) { bar.remove(); bar = null; }
        if (mini) { mini.remove(); mini = null; }
        document.body.classList.remove('bm-ticker-padded');
        cancelAnimationFrame(animRAF);
    }

    // ---------- render + animate ----------
    function render(videos, resumePosX) {
        ensureBar();

        const filtered = videos
            .filter(v => ALLOWED_TYPES.includes(v.Type))
            .sort((a, b) => (Number(b.ViewsDelta) || 0) - (Number(a.ViewsDelta) || 0))
            .slice(0, TOP_N);

        const once = filtered.map((v, i) => buildItem(v, i + 1)).join('');
        track.innerHTML = once + once;

        // resume from saved position if provided, otherwise start off-screen right
        if (typeof resumePosX === 'number') {
            posX = resumePosX;
            savedPosX = null;
        } else {
            posX = viewport.clientWidth;
        }
        track.style.transform = `translateX(${posX}px)`;

        cancelAnimationFrame(animRAF);
        lastTs = 0;
        animRAF = requestAnimationFrame(step);
    }

    function step(ts) {
        if (!lastTs) lastTs = ts;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;

        if (!paused && track) {
            posX -= SCROLL_PXPS * dt;
            const half = track.scrollWidth / 2;
            if (posX < -half) posX += half;
            track.style.transform = `translateX(${posX}px)`;
        }
        animRAF = requestAnimationFrame(step);
    }

    // ---------- boot ----------
    async function load() {
        try {
            const data = await fetchJson();
            if (Array.isArray(data) && data.length) {
                latestData = data;
                if (!document.getElementById('bm-ticker-mini')) {
                    render(data);
                }
            }
        } catch (e) {
            console.warn('[BM Ticker] fetch failed:', e);
        }
    }

    load();
    setInterval(load, REFRESH_MS);
})();