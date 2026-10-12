/* ============================================================================
 * Ran Online EP9 EP9 — Site App (config-driven)
 * ----------------------------------------------------------------------------
 * Renders everything from window.SITE_CONFIG (defaults from config.js,
 * overridden at build time by generated.js from config.ini).
 * Uses React + ReactDOM from CDN (react.production.min.js).
 * ========================================================================== */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var e = React.createElement;

  // Push the [BACKGROUND] config into CSS custom properties so the section
  // bg zoom / rotate / sway duration are tunable from config.ini without
  // touching the CSS. Falls back to sane defaults if the section is missing.
  (function applyBackgroundConfig() {
    var bg = (C.background) || {};
    var root = document.documentElement.style;
    root.setProperty('--bg-zoom', String(bg.zoom != null ? bg.zoom : 1.1));
    root.setProperty('--bg-rotate', (bg.rotate != null ? bg.rotate : 3) + 'deg');
    root.setProperty('--bg-duration', (bg.duration != null ? bg.duration : 40) + 's');
  })();

  function cx() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (typeof a === "string") out.push(a);
    }
    return out.join(" ");
  }
  function esc(s) {
    if (s == null) return "";
    return String(s);
  }
  // Normalize a URL so it always opens as an absolute link. Bare values like
  // "www.fb.com/rey" (no protocol) would otherwise be treated as a RELATIVE path
  // by the browser (-> http://localhost:4173/www.fb.com/rey). In-page anchors
  // (#services) and links already starting with a scheme are left untouched.
  function toAbs(url) {
    var s = String(url || "").trim();
    if (!s) return s;
    if (/^#/.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s; // anchor or has scheme (http:, https:, mailto:, etc.)
    return "https://" + s;
  }
  function open(url) {
    if (url) window.open(toAbs(url), "_blank", "noopener");
  }
  /* ---- Hash-based routing (no router library) ---- */
  // Routes: "" / "#home" → site, "#news" → news section anchor,
  // "#/news/:id" → dedicated news detail page.
  function parseHash() {
    var h = window.location.hash || "";
    h = h.replace(/^#/, "");
    if (h.indexOf("/") === 0) h = h.slice(1);
    var parts = h.split("/").map(function (p) { return decodeURIComponent(p); });
    if (parts[0] === "news" && parts[1] != null && parts[1] !== "") {
      return { name: "news-detail", params: { id: parts[1] } };
    }
    if (parts[0] === "news") return { name: "news", params: {} };
    return { name: "home", params: {} };
  }
  function navigate(path) {
    var target = "#" + (path.indexOf("/") === 0 ? path : "/" + path);
    if (window.location.hash === target) {
      // force re-render even if hash unchanged
      window.dispatchEvent(new Event("hashchange"));
    } else {
      window.location.hash = target;
    }
  }
  function useRoute() {
    var [route, setRoute] = React.useState(parseHash());
    React.useEffect(function () {
      function onHash() { setRoute(parseHash()); }
      window.addEventListener("hashchange", onHash);
      return function () { window.removeEventListener("hashchange", onHash); };
    }, []);
    return route;
  }
  function useRouteParams() {
    var route = useRoute();
    return route.params || {};
  }
  /* ---- News/Tutorial content (.txt) loading + lightweight formatting ---- */
  // Inline formatting: **bold**, *italic*, __underline__, ~~strike~~.
  var INLINE_RE = /(\*\*([\s\S]+?)\*\*)|(__([\s\S]+?)__)|(~~([\s\S]+?)~~)|(\*([\s\S]+?)\*)/g;
  function parseInline(text) {
    if (!text) return null;
    var nodes = [], last = 0, m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) nodes.push(text.slice(last, m.index));
      if (m[2] != null) nodes.push(e("strong", null, m[2]));
      else if (m[4] != null) nodes.push(e("u", null, m[4]));
      else if (m[6] != null) nodes.push(e("s", null, m[6]));
      else if (m[8] != null) nodes.push(e("em", null, m[8]));
      last = INLINE_RE.lastIndex;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes.length === 1 ? nodes[0] : nodes;
  }
  // Convert a raw .txt body into an array of React block nodes.
  // Blocks: blank line → paragraph; "- " line → bullet (Discord-style •);
  // otherwise a text line rendered with inline formatting.
  function parseTxt(text) {
    if (!text) return [e("p", { className: "txt-para" }, "No content available.")];
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var blocks = [], para = [], list = [];
    function flushPara() {
      if (!para.length) return;
      blocks.push(e("p", { className: "txt-para" }, parseInline(para.join(" "))));
      para = [];
    }
    function flushList() {
      if (!list.length) return;
      blocks.push(e("ul", { className: "txt-list" }, list.map(function (it, k) {
        return e("li", { className: "txt-bullet", key: k }, parseInline(it));
      })));
      list = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, "");
      if (line === "") { flushPara(); flushList(); continue; }
      if (/^[-–—]\s+/.test(line)) {
        flushPara();
        list.push(line.replace(/^[-–—]\s+/, ""));
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara();
    flushList();
    return blocks;
  }
  // Cache loaded .txt files so re-opening doesn't re-fetch.
  var __txtCache = {};
  function loadTxt(file, cb) {
    if (!file) { cb(null, true); return; }
    if (Object.prototype.hasOwnProperty.call(__txtCache, file)) {
      cb(__txtCache[file], false); return;
    }
    fetch("assets/content/" + encodeURIComponent(file))
      .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(function (t) { __txtCache[file] = t; cb(t, false); })
      .catch(function (err) { __txtCache[file] = null; cb(null, true, String(err && err.message || err)); });
  }
  /* Per-page background layer. `bg` falls back to the generic hero-bg.png so
     the site still renders (with a log in console) before you drop in your
     own hero-bg-01.png … hero-bg-0N.png images. */
  function SecBg(bg, opacity) {
    if (!bg) return null;
    return e("div", {
      className: "sec-bg",
      style: {
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "url(" + bg + "), url(assets/hero-bg.png)",
        backgroundSize: "cover", backgroundPosition: "center",
        opacity: (opacity == null ? 0.16 : opacity)
      }
    });
  }
  /* Section eyebrow label */
  function Eyebrow(props) {
    return e("div", {
      style: {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12, letterSpacing: 3, color: "var(--accent)",
        textTransform: "uppercase", marginBottom: 8
      }
    }, props.children);
  }

  /* Decorative corner brackets */
  function Corners(props) {
    var pos = props.pos || "tl";
    var s = { position: "absolute", width: (props.size || 20), height: (props.size || 20), pointerEvents: "none" };
    var color = props.color || "var(--accent)";
    if (pos === "tl") { s.top = 10; s.left = 10; s.borderTop = "2px solid " + color; s.borderLeft = "2px solid " + color; }
    if (pos === "tr") { s.top = 10; s.right = 10; s.borderTop = "2px solid " + color; s.borderRight = "2px solid " + color; }
    if (pos === "bl") { s.bottom = 10; s.left = 10; s.borderBottom = "2px solid " + color; s.borderLeft = "2px solid " + color; }
    if (pos === "br") { s.bottom = 10; s.right = 10; s.borderBottom = "2px solid " + color; s.borderRight = "2px solid " + color; }
    return e("div", { style: s });
  }
  /* ---- NAV ---- */
  function Nav() {
    var site = C.site || {};
    var route = useRoute();
    // On the News list / detail pages, collapse the tab bar down to just
    // "Home" so the section isn't cluttered with in-page anchors that don't
    // exist on a focused news view.
    var onNews = route.name === "news" || route.name === "news-detail";
    var navItems = onNews ? ["Home"] : (C.nav || []);
    var cm = C.community || {};
    // Social links shown on the upper-right of the nav (FB page, FB group, Discord).
    var socials = [
      cm.facebookUrl ? { key: "fb", label: "Facebook", href: cm.facebookUrl, icon: "M13 22v-9h3l.5-3.5H13V7.3c0-1 .3-1.7 1.8-1.7H17V2.3C16.5 2.2 15.4 2 14.2 2 11.6 2 10 3.5 10 6.3V9.5H7V13h3v9h3z" } : null,
      cm.facebookGroupUrl ? { key: "fg", label: "FB Group", href: cm.facebookGroupUrl, icon: "M12 2C6.5 2 2 6.4 2 11.8c0 4.3 2.8 7.9 6.7 9.2v-6.5H6.2v-2.7h2.5V9.4c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6v1.9h2.8l-.4 2.7h-2.4V23C18.9 21.7 22 18.1 22 13.8 22 8.4 17.5 4 12 4z" } : null,
      cm.discordUrl ? { key: "dc", label: "Discord", href: cm.discordUrl, icon: "M19.3 5.3A16 16 0 0015.3 4l-.2.4a12 12 0 013.4 1.7 11 11 0 00-9 0A12 12 0 0012.9 4.4L12.7 4a16 16 0 00-4 1.3C5 9.5 4.2 13.6 4.6 17.6a16 16 0 004.9 2.5l.6-1.5a9 9 0 01-1.6-.8l.4-.3a11 11 0 009.4 0l.4.3a9 9 0 01-1.6.8l.6 1.5a16 16 0 004.9-2.5c.5-4.6-.8-8.7-2.7-12.3zM9.7 15.3c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9zm4.6 0c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9z" } : null
    ].filter(Boolean);
    return e("nav", {
      style: {
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px",
        background: "linear-gradient(to bottom, rgba(8,12,24,.92), rgba(8,12,24,0))",
        backdropFilter: "blur(8px)"
      }
    },
      e("div", { style: { display: "flex", alignItems: "center", gap: 14 } },
        e("img", { src: site.logo || "assets/logo.png", alt: "", style: { height: 38, width: "auto" } }),
        e("div", { style: { display: "flex", flexDirection: "column", lineHeight: 1 } },
          e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 3, color: "var(--accent)" } }, site.brandShort || "RAN GS"),
          e("span", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 2, color: "#fff" } }, site.brandLong || "RanOnline EP9")
        )
      ),
      e("div", {
        style: { display: "flex", gap: 32, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }
      }, navItems.map(function (a) {
        return e("a", {
          key: a, href: "#" + a.toLowerCase(),
          onClick: a === "Home" ? function (t) { t.preventDefault(); navigate("/home"); } : null
        }, a);
      })),
      e("div", { style: { display: "flex", alignItems: "center", gap: 16 } },
        socials.length ? e("div", {
          style: { display: "flex", alignItems: "center", gap: 10 }
        }, socials.map(function (s) {
          return e("a", {
            key: s.key, href: s.href, title: s.label, "aria-label": s.label,
            target: "_blank", rel: "noopener noreferrer",
            onClick: function (t) { t.preventDefault(); open(s.href); },
            style: {
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,.22)", color: "#fff",
              background: "rgba(255,255,255,.04)",
              transition: "transform .15s ease, border-color .15s ease, background .15s ease"
            }
          },
            e("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true" },
              e("path", { d: s.icon })
            )
          );
        })) : null,
        e("button", {
          onClick: function () { var el = document.getElementById("download"); if (el) el.scrollIntoView({ behavior: "smooth" }); },
          style: {
            padding: "10px 20px", background: "var(--accent)", color: "#0A1020", border: "none",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2,
            textTransform: "uppercase", cursor: "pointer", fontWeight: 700
          }
        }, "PLAY NOW")
      )
    );
  }

  /* ---- NEWS DATA ACCESS ---- */
  // Returns a flat list of news entries (normalized) from generated config.
  function getNews() {
    var a = (C.news && C.news.announcement) || [];
    var t = (C.news && C.news.event) || [];
    var out = [];
    a.forEach(function (it) { out.push(Object.assign({}, it, { _cat: "announcement" })); });
    t.forEach(function (it) { out.push(Object.assign({}, it, { _cat: "event" })); });
    return out;
  }
  // Stable, collision-free lookup key for an item (announcement vs event share
  // plain `id`s, so we use the namespaced `uid` when present).
  function newsKey(it) {
    return it && it.uid ? String(it.uid) : String(it && it.id);
  }

  /* ---- NEWS DETAIL (dedicated page, no modal) ---- */
  function NewsDetail() {
    var params = useRouteParams();
    var id = params.id;
    var nv = C.news || {};
    var tabA = nv.tabAnnouncement || "Announcement";
    var tabT = nv.tabEvent || "Event";
    var item = null;
    var items = getNews();
    for (var i = 0; i < items.length; i++) { if (newsKey(items[i]) === String(id)) { item = items[i]; break; } }
    var label = item && item._cat === "event" ? tabT : tabA;
    var [txt, setTxt] = React.useState(null);
    var [err, setErr] = React.useState(false);
    var reqId = React.useRef(0);
    React.useEffect(function () {
      if (!item) return;
      if (!item.context) { setTxt(""); return; }
      var myId = ++reqId.current;
      setErr(false);
      loadTxt(item.context, function (text, e0, msg) {
        if (myId !== reqId.current) return;
        if (e0) { console.warn("[news] could not load", item.context, "-", msg); setErr(true); setTxt(""); }
        else setTxt(text != null ? text : "");
      });
    }, [id]);
    var blocks = txt != null ? parseTxt(txt)
      : [e("div", { className: "news-detail-loading" }, "Loading…")];
    return e("section", { id: "news-detail", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", minHeight: "70vh", overflow: "hidden" } },
      SecBg(item && item.image ? item.image : (nv.bg || "assets/hero-bg-08.png")),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, var(--bg) 0%, rgba(20,30,60,.28) 50%, var(--bg) 100%)" } }),
      e("div", { style: { position: "relative", maxWidth: 920, margin: "0 auto" } },
        e("button", {
          type: "button",
          onClick: function () { navigate("/news"); },
          style: {
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 18px", marginBottom: 28, background: "rgba(255,255,255,.06)",
            border: "1px solid rgba(255,255,255,.18)", color: "#fff", cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase"
          }
        }, "← BACK TO NEWS"),
        item
          ? e("article", { className: "news-detail", style: { border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,24,.72)" } },
              item.image ? e("div", { className: "news-detail-banner", style: { backgroundImage: "url(" + esc(item.image) + ")" } }) : null,
              e("div", { className: "news-detail-head" },
                e("div", { style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" } },
                  e("span", { className: "news-detail-tag" }, esc(item.date || label)),
                  e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,.5)", textTransform: "uppercase", border: "1px solid rgba(255,255,255,.18)", padding: "4px 10px" } }, esc(label))
                ),
                e("h1", { className: "news-detail-title" }, esc(item.title || ""))
              ),
              e("div", { className: "news-detail-body" },
                err ? e("p", { className: "txt-para" }, "Content unavailable.") : blocks
              ),
              item.link && item.link !== "#"
                ? e("div", { style: { padding: "0 32px 32px" } },
                    e("a", { href: item.link, target: "_blank", rel: "noopener", className: "news-detail-cta" }, "OPEN LINK →"))
                : null
            )
          : e("div", { className: "news-detail-missing", style: { fontFamily: "'Inter', sans-serif", fontSize: 18, color: "rgba(255,255,255,.7)", padding: "40px 0" } }, "Article not found.")
      )
    );
  }



  /* ---- MUSIC CONTROL ----
     Also drives an audio-reactive "bounce": a Web Audio AnalyserNode taps the
     BGM <audio> element (created lazily on first play, since browsers block
     AudioContext until a user gesture) and writes smoothed CSS variables onto
     :root:
       --bgm-beat  overall energy (base page scale + glow)
       --bgm-bass  low-frequency band ("base low")
       --bgm-high  high-frequency band ("base high")
       --bgm-aggr  Aggressive bounce addition = low*bassGain + high*highGain
     The CSS uses these to pulse <main> (the whole page bounces) and the
     section glow on every beat. Aggressive mode makes the page literally
     bounce to the bass/treble instead of just glowing in the background. */
  function MusicControl() {
    var m = C.music || {};
    if (m.enabled === false) return null;
    var bounceOn = m.bounce !== false; // true unless explicitly disabled
    var aggressiveOn = m.aggressive !== false; // true unless explicitly disabled
    var lowGain = (typeof m.lowGain === "number" && isFinite(m.lowGain)) ? m.lowGain : 1;
    var highGain = (typeof m.highGain === "number" && isFinite(m.highGain)) ? m.highGain : 1;
    var audioRef = React.useRef(null);
    var analyserRef = React.useRef(null);
    var rafRef = React.useRef(0);
    var smoothRef = React.useRef({ beat: 0, bass: 0, high: 0, aggr: 0, y: 0 });
    var [playing, setPlaying] = React.useState(false);
    var [errored, setErrored] = React.useState(false);

    // Handle autoplay if enabled
    React.useEffect(function () {
      if (m.autoplay === true) {
        var a = audioRef.current;
        if (a) {
          a.play().then(function () { setPlaying(true); }).catch(function () { /* Autoplay blocked */ });
        }
      }
    }, []);

    // Clean up the analyser loop when the component unmounts.
    React.useEffect(function () {
      return function () { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    React.useEffect(function () {
      window.addEventListener("rgse:pause-music", function () { setPlaying(false); });
    }, []);

    // Per-frame: read frequency data and smooth it into CSS variables.
    function loop() {
      var an = analyserRef.current;
      if (!an) { rafRef.current = 0; return; }
      var bins = an.frequencyBinCount;
      var data = new Uint8Array(bins);
      an.getByteFrequencyData(data);
      var total = 0, bass = 0, high = 0;
      var lowEdge = Math.max(1, Math.floor(bins * 0.12));  // ~lowest 12% = kick/bass
      var highStart = Math.floor(bins * 0.55);            // upper ~45% = treble/hi-hats
      for (var i = 0; i < bins; i++) {
        var v = data[i];
        total += v;
        if (i < lowEdge) bass += v;              // LOW band ("base low")
        else if (i >= highStart) high += v;      // HIGH band ("base high")
      }
      var beat = (total / bins) / 255;                         // 0..1 overall loudness
      var bassN = (bass / lowEdge) / 255;                      // 0..1 low-end
      var highN = (high / Math.max(1, bins - highStart)) / 255; // 0..1 high-end
      // Asymmetric smoothing: snap up fast (the punch), ease down slow (the decay).
      var s = smoothRef.current;
      s.beat = beat > s.beat ? beat : s.beat * 0.88 + beat * 0.12;
      s.bass = bassN > s.bass ? bassN : s.bass * 0.85 + bassN * 0.15;
      s.high = highN > s.high ? highN : s.high * 0.80 + highN * 0.20;
      // Aggressive addition: bass (LOW) + treble (HIGH), each scaled by its
      // gain. AGG_SCALE keeps the resulting page-scale bounded (we add this
      // directly to scale(1 + ...)), and we clamp so a loud peak can't blow
      // the layout out. Tune LowGain/HighGain in config.ini for more punch.
      var AGG_SCALE = 0.04;
      var AGG_MAX = 0.12; // ~12% extra scale at the very peak
      var raw = aggressiveOn ? (s.bass * lowGain + s.high * highGain) * AGG_SCALE : 0;
      var aggr = Math.min(raw, AGG_MAX);
      s.aggr = aggr > s.aggr ? aggr : s.aggr * 0.82 + aggr * 0.18;

      // Whole-page CONTENT bounce offset (px). A real translateY — not just a
      // scale — makes the in-view text/buttons/boxes visibly jump on every beat,
      // regardless of how far down the page is scrolled. BEAT_PX is the base
      // bounce; AGG_PX adds extra punch from the low+high bands in Aggressive
      // mode. Both snap up and ease down so it reads as a "bounce", not a jitter.
      var BEAT_PX = 9, AGG_PX = 11;
      var targetY = -(s.beat * BEAT_PX + (aggressiveOn ? s.aggr * (AGG_PX / AGG_MAX) : 0));
      s.y = targetY > s.y ? targetY : s.y * 0.78 + targetY * 0.22; // snap up, ease down

      var root = document.documentElement.style;
      root.setProperty("--bgm-beat", s.beat.toFixed(3));
      root.setProperty("--bgm-bass", s.bass.toFixed(3));
      root.setProperty("--bgm-high", s.high.toFixed(3));
      root.setProperty("--bgm-aggr", s.aggr.toFixed(3));
      root.setProperty("--bgm-lowgain", lowGain.toFixed(3));
      root.setProperty("--bgm-highgain", highGain.toFixed(3));
      root.setProperty("--bgm-bounce-y", s.y.toFixed(2) + "px");
      rafRef.current = requestAnimationFrame(loop);
    }

    // Build the analyser graph once the audio element is in the DOM and
    // (re)bind the loop whenever playback starts/stops.
    function ensureAnalyser() {
      if (!bounceOn || analyserRef.current) return;
      var a = audioRef.current;
      if (!a) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        var ctx = a._ac || (a._ac = new AC());
        if (ctx.state === "suspended") ctx.resume();
        var src = a._src || (a._src = ctx.createMediaElementSource(a));
        var an = ctx.createAnalyser();
        an.fftSize = 256;
        an.smoothingTimeConstant = 0.8;
        src.connect(an);
        an.connect(ctx.destination);
        analyserRef.current = an;
      } catch (err) { /* ignore: some browsers reject re-tapping the element */ }
    }

    function startLoop() {
      if (!bounceOn || !analyserRef.current || rafRef.current) return;
      rafRef.current = requestAnimationFrame(loop);
    }
    function stopLoop() {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
      var root = document.documentElement.style;
      root.setProperty("--bgm-beat", "0");
      root.setProperty("--bgm-bass", "0");
      root.setProperty("--bgm-high", "0");
      root.setProperty("--bgm-aggr", "0");
      root.setProperty("--bgm-bounce-y", "0px");
    }

    function toggle() {
      var a = audioRef.current;
      if (!a) return;
      if (a.paused) {
        ensureAnalyser();
        a.volume = 0.35;
        a.play().then(function () { setPlaying(true); startLoop(); }).catch(function () { setErrored(true); });
      } else {
        a.pause(); setPlaying(false); stopLoop();
      }
    }
    return e("div", { className: "music-control" },
      e("button", {
        className: cx("music-toggle", playing && "is-playing"),
        onClick: toggle, "aria-label": playing ? "Pause background music" : "Play background music",
        title: playing ? "Pause background music" : "Play background music"
      },
        e("span", { className: "music-icon", "aria-hidden": "true" }, playing ? "II" : ">"),
        e("span", { className: "music-copy" },
          e("span", null, "BGM"),
          e("strong", null, errored ? "No audio" : (playing ? "Now Playing" : "Play Music"))
        ),
        e("span", { className: "music-bars", "aria-hidden": "true" },
          e("i", null), e("i", null), e("i", null))
      ),
      e("audio", { ref: audioRef, src: m.src || "", loop: true, preload: "none",
        onPlay: startLoop, onPause: stopLoop, onEnded: stopLoop })
    );
  }

  /* ---- TRAILER MODAL ---- */
  function Trailer(props) {
    var open = props.open, onClose = props.onClose, url = props.url;
    React.useEffect(function () {
      if (!open) return;
      window.dispatchEvent(new Event("rgse:pause-music"));
      var prev = document.body.style.overflow;
      var onKey = function (ev) { if (ev.key === "Escape") onClose(); };
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
      return function () { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [open, onClose]);
    if (!open) return null;
    return e("div", {
      role: "dialog", "aria-modal": "true", "aria-label": "Ran Online EP9 trailer",
      onClick: onClose,
      style: { position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(2,6,16,.86)", backdropFilter: "blur(10px)" }
    },
      e("div", {
        onClick: function (t) { t.stopPropagation(); },
        style: { position: "relative", width: "min(1040px, 100%)", border: "1px solid rgba(255,214,10,.55)", background: "rgba(8,12,24,.96)", boxShadow: "0 30px 90px rgba(0,0,0,.6)", clipPath: "polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)" }
      },
        e("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.12)" } },
          e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "var(--accent)", textTransform: "uppercase" } }, "Now Playing / Trailer"),
          e("button", { type: "button", onClick: onClose, "aria-label": "Close trailer", style: { width: 42, height: 36, border: "1px solid rgba(255,255,255,.2)", background: "rgba(255,255,255,.04)", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontSize: 18, lineHeight: 1, cursor: "pointer" } }, "x")
        ),
        e("div", { style: { position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000" } },
          e("iframe", { src: url, title: "Ran Online EP9 trailer", allow: "autoplay; encrypted-media; fullscreen; picture-in-picture", allowFullScreen: true, referrerPolicy: "strict-origin-when-cross-origin", style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 } })
        )
      )
    );
  }

  /* ---- RATE TIER (config-driven): low | lowhalf | mid | midhalf | high ----
     The displayed title is always LOW | MID | HIGH only. A "half" value does NOT
     change the title — it only shifts the bar fill position so it sits between
     two tiers (readable against the LOW / MID / HIGH scale below the bar). */
  function rateTierInfo(v) {
    var t = (v || "mid").toLowerCase();
    if (t === "low") return { label: "LOW", bar: 0.15, color: "#5aa9ff" };
    if (t === "lowhalf") return { label: "LOW", bar: 0.32, color: "#5aa9ff" };
    if (t === "mid") return { label: "MID", bar: 0.55, color: "var(--accent)" };
    if (t === "midhalf") return { label: "MID", bar: 0.72, color: "var(--accent)" };
    if (t === "high") return { label: "HIGH", bar: 0.9, color: "#ff6b6b" };
    return { label: (v || "MID").toUpperCase(), bar: 0.55, color: "var(--accent)" };
  }

  /* ---- HERO ---- */
  function Hero(props) {
    var h = C.hero || {};
    return e("section", {
      style: { position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden", padding: "120px 48px" }
    },
      e("div", { className: "sec-bg", style: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "url(" + (h.bg || "assets/hero-bg-01.png") + "), url(assets/hero-bg.png)", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } }),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, var(--bg) 0%, rgba(10,16,32,.55) 45%, var(--bg) 100%)" } }),
      e("div", { style: { position: "relative", display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 40, alignItems: "center", maxWidth: 1280, margin: "0 auto", width: "100%" } },
        e("div", null,
          (C.site && C.site.version) ? e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "var(--accent)", marginBottom: 18, textTransform: "uppercase" } }, esc(C.site.version) + " / " + (C.site.year || "2026")) : null,
          e("h1", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "clamp(56px, 9vw, 110px)", lineHeight: .9, letterSpacing: -2, margin: 0, color: "#fff" } }, esc(h.title || "RAN ONLINE")),
          e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "clamp(28px, 4vw, 52px)", lineHeight: 1, letterSpacing: 2, color: "var(--accent)", marginTop: 6 } }, esc(h.subtitle || "RanOnline EP9 EP9")),
          e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "rgba(255,255,255,.7)", maxWidth: 520, lineHeight: 1.6, marginTop: 22 } }, esc(h.description || "")),
          e("div", { style: { display: "flex", gap: 14, marginTop: 34, flexWrap: "wrap" } },
            e("button", {
              onClick: function () { props.onTrailer(); },
              style: { padding: "16px 26px", background: "transparent", color: "#fff", border: "1px solid rgba(255,214,10,.5)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }
            }, "▶ " + (h.ctaPlay || "WATCH TRAILER")),
            e("button", {
              onClick: function () { var el = document.getElementById("download"); if (el) el.scrollIntoView({ behavior: "smooth" }); },
              style: { padding: "16px 26px", background: "var(--accent)", color: "#0A1020", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }
            }, h.ctaDownload || "DOWNLOAD NOW")
          )
        ),
        e("div", { style: { position: "relative", height: 420, display: "flex", alignItems: "center", justifyContent: "center" } },
          e("div", {
            style: { width: 360, height: 360, maxWidth: "80%", backgroundImage: "url(assets/logo-front.png), url(assets/logo.png)", backgroundSize: "contain", backgroundPosition: "center", backgroundRepeat: "no-repeat", filter: "drop-shadow(0 30px 60px rgba(255,214,10,.25))", animation: "float 6s ease-in-out infinite" }
          })
        )
      )
    );
  }

  /* ---- SERVER (Server Information + Drop Rate tier) ---- */
  function Server() {
    var s = C.server || {};
    var bg = s.bg || "assets/hero-bg-02.png";
    var stats = s.stats || [];
    var rates = s.rates || [];
    return e("section", { id: "server", style: { padding: "120px 48px", position: "relative", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 60, flexWrap: "wrap", gap: 16 } },
        e("div", null,
          e(Eyebrow, null, "// 01 — Configuration"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 92, lineHeight: .9, letterSpacing: -2, margin: "16px 0 0", color: "#fff" } },
            "SERVER", e("br", null), e("span", { style: { color: "var(--accent)" } }, "FEATURES."))
        ),
        e("div", { style: { maxWidth: 360, fontFamily: "'Inter', sans-serif", fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,.6)" } }, esc(s.intro || ""))
      ),
      e("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 60, border: "1px solid rgba(255,255,255,.08)" } },
        stats.map(function (t, n) {
          return e("div", {
            key: t.label, style: {
              padding: "36px 32px",
              borderRight: (n % 3 !== 2) ? "1px solid rgba(255,255,255,.08)" : "none",
              borderBottom: (n < 3) ? "1px solid rgba(255,255,255,.08)" : "none",
              position: "relative", background: (n % 2 === 0) ? "transparent" : "rgba(255,255,255,.015)"
            }
          },
            e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.45)", marginBottom: 14 } }, esc(t.label)),
            e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 40, fontWeight: 700, color: "#fff", lineHeight: 1 } }, esc(t.value)),
            e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.5)", marginTop: 8 } }, esc(t.note))
          );
        })
      ),
      e("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 18 } },
        rates.map(function (o) {
          var info = rateTierInfo(o.v);
          return e("div", {
            key: o.k, className: "card-hov", style: {
              position: "relative", padding: 24, minHeight: 150,
              border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,12,24,.36)", backdropFilter: "blur(7px)",
              display: "flex", flexDirection: "column", gap: 12
            }
          },
            e(Corners, { pos: "tl", size: 20 }),
            e(Corners, { pos: "tr", size: 20 }),
            e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,.5)", textTransform: "uppercase" } }, esc(o.k)),
            e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 26, fontWeight: 700, color: "#fff" } }, esc(info.label)),
            e("div", { style: { height: 4, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden" } },
              e("div", { style: { height: "100%", width: (Math.round(info.bar * 100)) + "%", background: info.color } })
            ),
            e("div", { style: { position: "relative", marginTop: 6 } },
              e("div", { style: { position: "absolute", top: -1, left: (Math.round(info.bar * 100)) + "%", width: 10, height: 10, marginLeft: -5, borderRadius: "50%", background: info.color, boxShadow: "0 0 8px " + info.color, transform: "translateY(-3px)" } }),
              e("div", { style: { display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,.4)" } },
                e("span", { style: { color: info.label === "LOW" ? info.color : "rgba(255,255,255,.4)", fontWeight: info.label === "LOW" ? 700 : 400 } }, "LOW"),
                e("span", { style: { color: info.label === "MID" ? info.color : "rgba(255,255,255,.4)", fontWeight: info.label === "MID" ? 700 : 400 } }, "MID"),
                e("span", { style: { color: info.label === "HIGH" ? info.color : "rgba(255,255,255,.4)", fontWeight: info.label === "HIGH" ? 700 : 400 } }, "HIGH")
              )
            )
          );
        })
      )
    );
  }

  /* ---- CLASSES ---- */
  function Classes() {
    var cls = C.classes || {};
    var list = cls.list || [];
    var bg = cls.bg || "assets/hero-bg-03.png";
    var [active, setX] = React.useState(0);
    var n = list[active] || {};
    if (list.length === 0) return e("section", { id: "classes" });
    function diffWord(d) { return d === 1 ? "VERY EASY" : d === 2 ? "EASY" : d === 3 ? "MEDIUM" : d === 4 ? "HARD" : "EXPERT"; }
    return e("section", { id: "classes", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, var(--bg) 0%, rgba(10,16,32,.28) 30%, rgba(10,16,32,.28) 70%, var(--bg) 100%)" } }),
      e("div", { style: { position: "relative" } },
        e("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 50, flexWrap: "wrap", gap: 12 } },
          e("div", null,
            e(Eyebrow, null, "// 02 — Roster"),
            e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 92, lineHeight: .9, letterSpacing: -2, margin: "16px 0 0", color: "#fff" } },
              "CHOOSE YOUR", e("br", null), e("span", { style: { color: "var(--accent)", fontStyle: "italic" } }, "LEGEND."))
          ),
          e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,.4)" } }, "ROSTER " + String(list.length).padStart(2, "0") + " / " + String(list.length).padStart(2, "0"))
        ),
        e("div", { style: { display: "grid", gridTemplateColumns: "260px 1fr 320px", gap: 32, alignItems: "stretch" } },
          e("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
            list.map(function (r, o) {
              return e("button", {
                key: r.name, onClick: function () { setX(o); }, style: {
                  textAlign: "left", padding: "18px 18px", cursor: "pointer",
                  background: o === active ? "rgba(255,214,10,.08)" : "rgba(255,255,255,.02)",
                  border: o === active ? "1px solid var(--accent)" : "1px solid rgba(255,255,255,.06)",
                  borderLeft: o === active ? "3px solid var(--accent)" : "3px solid transparent",
                  color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "all .2s"
                }
              },
                e("span", null,
                  e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "var(--accent)", letterSpacing: 2, marginRight: 10 } }, "0" + (o + 1)),
                  e("span", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 18, letterSpacing: 2 } }, r.name)
                ),
                o === active ? e("span", { style: { color: "var(--accent)" } }, "→") : null
              );
            })
          ),
          e("div", { style: { position: "relative", minHeight: 620, border: "1px solid rgba(255,255,255,.1)", overflow: "hidden" } },
            e(Corners, { pos: "tl", size: 28 }), e(Corners, { pos: "tr", size: 28 }),
            e(Corners, { pos: "bl", size: 28 }), e(Corners, { pos: "br", size: 28 }),
            e("div", { key: n.name, style: { position: "absolute", inset: 0, backgroundImage: "url(" + (n.img || "") + ")", backgroundSize: "auto 130%", backgroundPosition: "center 30%", backgroundRepeat: "no-repeat", animation: "fadeIn .5s ease", filter: "drop-shadow(0 30px 60px rgba(255,214,10,.2))" } }),
            e("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 0%, transparent 55%, rgba(10,16,32,.95) 100%)" } }),
            e("div", { style: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(to bottom, transparent, var(--accent), transparent)" } }),
            e("div", { style: { position: "absolute", top: 24, left: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.6)", lineHeight: 1.8 } },
              e("div", null, "ID: ", e("span", { style: { color: "var(--accent)" } }, "RGSE-" + String(active + 1).padStart(3, "0"))),
              e("div", null, "SPEC: ", n.spec ? n.spec.toUpperCase() : "")
            ),
            e("div", { style: { position: "absolute", bottom: 28, left: 28, right: 28 } },
              e(Eyebrow, null, n.role),
              e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 88, fontWeight: 700, lineHeight: .9, color: "#fff", letterSpacing: -2, marginTop: 14 } }, n.name)
            )
          ),

          e("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
            e("div", { style: { padding: 20, border: "1px solid rgba(255,255,255,.1)", background: "rgba(10,16,32,.5)" } },
              e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.5)", marginBottom: 18 } }, "◇ DIFFICULTY ON USING THE CLASS"),
              e("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 } },
                [1, 2, 3, 4, 5].map(function (r) { return e("span", { key: r, style: { flex: 1, height: 12, background: r <= (n.difficulty || 1) ? "var(--accent)" : "rgba(255,255,255,.08)", border: r <= (n.difficulty || 1) ? "none" : "1px solid rgba(255,255,255,.12)" } }); })
              ),
              e("div", { style: { display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2 } },
                e("span", { style: { color: "rgba(255,255,255,.5)" } }, "NOVICE"),
                e("span", { style: { color: "var(--accent)", fontWeight: 700 } }, diffWord(n.difficulty || 1)),
                e("span", { style: { color: "rgba(255,255,255,.5)" } }, "EXPERT")
              )
            ),
            e("div", { style: { padding: "16px 18px", background: "rgba(255,214,10,.06)", border: "1px solid rgba(255,214,10,.3)" } },
              e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "var(--accent)", marginBottom: 8 } }, "◇ PLAYSTYLE"),
              e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.72)", lineHeight: 1.5 } }, esc(n.playstyle || ""))
            ),
            e("div", { style: { padding: "16px 18px", background: "rgba(46,213,115,.07)", border: "1px solid rgba(46,213,115,.35)" } },
              e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgb(46,213,115)", marginBottom: 8 } }, "◇ PVP ADVANTAGE"),
              e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(180,245,205,.85)", lineHeight: 1.5 } }, esc(n.pvpAdvantage || ""))
            ),
            e("div", { style: { padding: "16px 18px", background: "rgba(255,107,107,.07)", border: "1px solid rgba(255,107,107,.35)" } },
              e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgb(255,107,107)", marginBottom: 8 } }, "◇ PVP DISADVANTAGE"),
              e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,200,200,.85)", lineHeight: 1.5 } }, esc(n.pvpDisadvantage || ""))
            )
          )
        )
      )
    );
  }
  function diffWord(d) { return d === 1 ? "VERY EASY" : d === 2 ? "EASY" : d === 3 ? "MEDIUM" : d === 4 ? "HARD" : "EXPERT"; }

  /* ---- COMBAT ---- */
  function Combat() {
    var cb = C.combat || {};
    var bg = cb.bg || "assets/hero-bg-04.png";
    var modes = cb.modes || [];
    var raids = cb.raids || [];
    var le = cb.liveEvent || {};
    return e("section", { id: "combat", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" } },
        e("div", null,
          e(Eyebrow, null, "// 03 — Combat doctrine"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 92, lineHeight: .9, letterSpacing: -2, margin: "16px 0 12px", color: "#fff" } },
            "BREAK", e("br", null), e("span", { style: { color: "var(--accent)" } }, "EVERYTHING.")),
          e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "rgba(255,255,255,.6)", maxWidth: 460, lineHeight: 1.6 } }, esc(cb.intro || ""))
        ),
        e("div", { style: { position: "relative", padding: "32px 28px", border: "1px solid var(--accent)", background: "rgba(255,214,10,.04)" } },
          e(Corners, { pos: "tl" }), e(Corners, { pos: "br" }),
          e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3, color: "var(--accent)", marginBottom: 8 } }, "▶ LIVE EVENT"),
          e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1.1, marginBottom: 6 } }, esc(le.title || "")),
          e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.65)" } }, esc(le.desc || "")),
          le.schedule ? e("div", { style: { marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,214,10,.22)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } }, esc(le.schedule)) : null
        )
      ),
      e("div", { style: { marginTop: 50 } },
        e("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } },
          e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "var(--accent)" } }, "// PVP MODES"),
          e("span", { style: { flex: 1, height: 1, background: "rgba(255,255,255,.1)" } }),
          e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,.4)" } }, modes.length + " modes")
        ),
        e("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 } },
          modes.map(function (t, n) {
            return e("div", {
              key: t.n, className: "card-hov", style: {
                padding: "24px 20px", border: "1px solid rgba(255,255,255,.1)", position: "relative",
                background: t.hot ? "linear-gradient(180deg, rgba(255,214,10,.08), rgba(255,214,10,0))" : "rgba(255,255,255,.02)",
                minHeight: 230, display: "flex", flexDirection: "column", justifyContent: "space-between"
              }
            },
              t.hot ? e(Eyebrow, null, "● HOT") : null,
              e("div", null,
                e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 8 } }, "P", String(n + 1).padStart(2, "0")),
                e("div", null,
                  e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.1, letterSpacing: 1, marginBottom: 8 } }, esc(t.n)),
                  e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(255,255,255,.55)", marginBottom: 14 } }, esc(t.t)),
                  e("div", { style: { display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1 } },
                    e("div", { style: { display: "flex", justifyContent: "space-between", gap: 12 } },
                      e("span", { style: { color: "rgba(255,255,255,.4)" } }, "SCALE"),
                      e("span", { style: { color: "var(--accent)" } }, esc(t.cap))
                    ),
                    e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 } },
                      e("span", { style: { color: "rgba(255,255,255,.4)" } }, "SCHEDULE"),
                      e("span", { style: { color: "var(--accent)", textAlign: "right", lineHeight: 1.4 } }, esc(t.schedule))
                    )
                  )
                )
              )
            );
          })
        ),

        e("div", { style: { marginTop: 50 } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 22 } },
            e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "var(--accent)" } }, "// PVE CONTENT"),
            e("span", { style: { flex: 1, height: 1, background: "rgba(255,255,255,.1)" } }),
            e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,.4)" } }, raids.length + " pillars")
          ),
          e("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } },
            raids.map(function (t, n) {
              return e("div", {
                key: t.n, className: "card-hov", style: {
                  padding: "32px 32px", border: "1px solid rgba(255,255,255,.12)", display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "end", minHeight: 200,
                  background: "linear-gradient(135deg, rgba(255,255,255,.03), rgba(255,255,255,0))"
                }
              },
                e("div", null,
                  e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,.4)", marginBottom: 10 } }, "RAID 0" + (n + 1)),
                  e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 44, fontWeight: 700, color: "#fff", letterSpacing: -1, lineHeight: 1, marginBottom: 12 } }, esc(t.n)),
                  e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.6)", marginBottom: 18 } }, esc(t.t)),
                  e("div", { style: { display: "inline-flex", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid rgba(255,214,10,.25)", background: "rgba(255,214,10,.05)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } },
                    e("span", { style: { color: "rgba(255,255,255,.45)" } }, "DAILY LIMIT"),
                    e("span", null, esc(t.limit))
                  )
                ),
                e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 120, fontWeight: 700, color: "rgba(255,214,10,.12)", lineHeight: 1, letterSpacing: -4 } }, "0" + (n + 1))
              );
            })
          )
        )
      )
    );
  }

  /* ---- ROADMAP ---- */
  function Roadmap() {
    var r = C.roadmap || {};
    var bg = r.bg || "assets/hero-bg-05.png";
    var items = r.items || [];
    var doneCount = items.filter(function (i) { return (i.status || "").toUpperCase() === "DONE"; }).length;
    var progress = parseInt(r.progress, 10);
    var hasProgress = items.length && progress >= 1 && progress <= items.length;
    var fillPct = hasProgress ? ((progress - 1) / items.length) * 100 : (items.length ? (100 * doneCount / items.length) : 12.5);
    function statusColor(s) {
      s = (s || "").toUpperCase();
      if (s === "DONE") return "var(--accent)";
      if (s === "IN PROGRESS") return "#5aa9ff";
      if (s === "PLANNED") return "rgba(255,255,255,.6)";
      return "rgba(255,255,255,.35)";
    }
    return e("section", { id: "roadmap", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { marginBottom: 60 } },
        e(Eyebrow, null, "// 04 — Roadmap"),
        e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 92, lineHeight: .9, letterSpacing: -2, margin: "16px 0 0", color: "#fff" } },
          "THE PATH", e("br", null), e("span", { style: { color: "var(--accent)", fontStyle: "italic" } }, "FORWARD."))
      ),
      e("div", { style: { position: "relative" } },
        e("div", { style: { position: "absolute", top: 31, left: "12.5%", right: "12.5%", height: 1, background: "rgba(255,255,255,.12)" } }),
        e("div", { style: { position: "absolute", top: 31, left: "12.5%", width: fillPct + "%", height: 1, background: "var(--accent)" } }),
        e("div", { style: { display: "grid", gridTemplateColumns: "repeat(" + Math.max(1, items.length) + ", minmax(0,1fr))", gap: 0, position: "relative" } },
          items.map(function (t, n) {
            return e("div", { key: t.phase, style: { textAlign: "center", padding: "0 16px" } },
              e("div", { style: { width: 14, height: 14, borderRadius: "50%", margin: "24px auto", background: ((hasProgress && n === progress - 1) || (t.status || "").toUpperCase() === "DONE") ? "var(--accent)" : "transparent", border: "2px solid " + ((hasProgress && n === progress - 1) ? "var(--accent)" : statusColor(t.status)), boxShadow: (hasProgress && n === progress - 1) ? "0 0 0 5px rgba(255,214,10,.16)" : "none" } }),
              e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,.45)", marginBottom: 10 } }, esc(t.phase)),
              e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 14 } }, esc(t.title)),
              e("div", { style: { display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 2, color: statusColor(t.status), textTransform: "uppercase", border: "1px solid " + statusColor(t.status), padding: "4px 10px", borderRadius: 999, marginBottom: 16 } }, esc(t.status)),
              e("ul", { style: { listStyle: "none", padding: 0, margin: 0, textAlign: "left", display: "grid", gap: 8 } },
                (t.points || []).map(function (p, i) {
                  return e("li", { key: i, style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.4 } }, "— " + esc(p));
                })
              )
            );
          })
        )
      )
    );
  }

  /* ---- DOWNLOAD ---- */
  function Download() {
    var d = C.download || {};
    // The config generator produces a FLAT mirror list (DRIVE_x / MEDIAFIRE_x
    // under [DOWNLOAD]). Fall back to the bundled RGSE_DOWNLOAD_MIRRORS nested
    // structure (googleDrive / mediafire) only if the config defines no
    // mirrors at all — otherwise the config-driven links would be dropped.
    var mirrors = d.mirrors && d.mirrors.length ? d.mirrors : (window.RGSE_DOWNLOAD_MIRRORS || {});
    var cards = [];
    if (Array.isArray(mirrors)) {
      cards = mirrors.slice();
    } else {
      var pushGroup = function (group) { (group || []).forEach(function (m) { cards.push(m); }); };
      pushGroup(mirrors.googleDrive); pushGroup(mirrors.mediafire);
    }
    if (!cards.length) {
      cards = [
        { label: "Google Drive", url: "#", note: "Full client" },
        { label: "MediaFire", url: "#", note: "Full client" }
      ];
    }
    return e("section", { id: "download", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      e("div", { className: "download-art-bg", "aria-hidden": "true" }),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(10,16,32,.42) 0%, rgba(10,16,32,.12) 50%, rgba(10,16,32,.42) 100%)" } }),
      e("div", { style: { position: "relative", maxWidth: 1280, margin: "0 auto" } },
        e("div", { style: { marginBottom: 50 } },
          e(Eyebrow, null, "// 05 — Get the game"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 96, lineHeight: .9, letterSpacing: -2, margin: "16px 0 18px", color: "#fff" } },
            esc(d.title || "GET IN THE"), e("br", null), e("span", { style: { color: "var(--accent)" } }, esc(d.accent || "FIGHT."))),
          e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 15, color: "rgba(255,255,255,.6)", maxWidth: 520, lineHeight: 1.6 } }, esc(d.intro || ""))
        ),
        e("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 18 } },
          cards.map(function (m, i) {
            return e("a", {
              key: i, href: m.url || "#", target: "_blank", rel: "noopener",
              className: "card-hov", style: {
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "26px 28px", border: "1px solid rgba(255,255,255,.14)", background: "rgba(8,12,24,.32)",
                backdropFilter: "blur(8px)", textDecoration: "none", color: "#fff"
              }
            },
              e("div", null,
                e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1 } }, esc(m.label)),
                e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 4 } }, esc(m.note || ""))
              ),
              e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: "var(--accent)" } }, "↓")
            );
          })
        )
      )
    );
  }

  /* ---- COMMUNITY ---- */
  function Community() {
    var cm = C.community || {};
    var stats = cm.stats || [];
    return e("section", { id: "community", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      e("div", { className: "sec-bg", style: { position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "url(assets/discord-bg.png)", backgroundSize: "cover", backgroundPosition: "center", opacity: .7 } }),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(90deg, rgba(10,16,32,.22) 0%, rgba(10,16,32,.06) 50%, rgba(10,16,32,.22) 100%)" } }),
      e("div", { style: { position: "relative", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 60, alignItems: "center" } },
        e("div", null,
          e(Eyebrow, null, "// 06 — Community"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 92, lineHeight: .9, letterSpacing: -2, margin: "16px 0 20px", color: "#fff" } },
            esc(cm.title || "JOIN THE"), e("br", null), e("span", { style: { color: "var(--accent)", fontStyle: "italic" } }, esc(cm.accent || "LEGEND."))),
          e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "rgba(255,255,255,.7)", maxWidth: 540, lineHeight: 1.6, marginBottom: 36 } }, esc(cm.desc || "")),
          e("div", { style: { display: "flex", gap: 14, marginBottom: 40, flexWrap: "wrap" } },
            e("button", { onClick: function () { open(cm.discordUrl); }, style: { padding: "18px 28px", background: "var(--accent)", color: "#0A1020", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 } }, "JOIN DISCORD →"),
            e("button", { onClick: function () { open(cm.facebookUrl); }, style: { padding: "18px 28px", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.25)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer" } }, "FACEBOOK PAGE"),
            cm.facebookGroupUrl ? e("button", { onClick: function () { open(cm.facebookGroupUrl); }, style: { padding: "18px 28px", background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.25)", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer" } }, "FB GROUP →") : null
          ),
          stats.length ? e("div", { style: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20, maxWidth: 360 } },
            stats.map(function (row) {
              return e("div", { key: row[1] },
                e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 38, fontWeight: 700, color: "var(--accent)", lineHeight: 1 } }, esc(row[0])),
                e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.55)" } }, esc(row[1]))
              );
            })
          ) : null
        ),
        e("div", { style: { display: "flex", justifyContent: "center" } },
          e("div", { style: { width: "100%", maxWidth: 420, aspectRatio: "9 / 16", border: "1px solid rgba(255,214,10,.3)", background: "rgba(8,12,24,.6)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, textAlign: "center", padding: 24 } },
            e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 3, color: "var(--accent)", textTransform: "uppercase" } }, "DISCORD"),
            e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 26, fontWeight: 700, color: "#fff" } }, "Connect Live"),
            e("button", { onClick: function () { open(cm.discordUrl); }, style: { padding: "14px 22px", background: "var(--accent)", color: "#0A1020", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 } }, "OPEN DISCORD")


          )
        )
      )
    );
  }

  /* ---- NEWS ---- (two tabs: Announcement + Event, fed by news/*.txt via the
     `context` field on each item; columns: date,title,image,link,description)
     Layout: one big featured post on top (with a .txt preview), then a vertical
     list of compact text rows (date + title + .txt preview snippet + arrow). */
  // Pull a short snippet from a news .txt body. Returns up to `maxLines`
  // (default 3) of the leading non-empty, non-bullet lines joined together,
  // so cards show the 1st–3rd lines of the article (not just the first).
  function previewFromTxt(text, maxLines) {
    if (text == null) return "";
    var limit = (maxLines && maxLines > 0) ? maxLines : 3;
    var lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var out = [];
    for (var i = 0; i < lines.length && out.length < limit; i++) {
      var ln = lines[i].trim();
      if (!ln) continue;
      if (/^[-–—]\s+/.test(ln)) continue; // skip bullets/lists
      // strip inline markdown markers for a clean preview
      out.push(ln.replace(/\*\*|\*|__|~~/g, ""));
    }
    return out.join("  ");
  }
  // big highlighted post on top (loads a short preview from its .txt context)
  function NewsFeatured(props) {
    var item = (props && props.item) || props || {};
    var [preview, setPreview] = React.useState("");
    React.useEffect(function () {
      if (!item || !item.context) return;
      loadTxt(item.context, function (text) {
        if (text != null) setPreview(previewFromTxt(text));
      });
    }, [item && item.context]);
    function openEntry() { navigate("/news/" + encodeURIComponent(newsKey(item))); }
    return e("button", {
      className: "news-featured card-hov", type: "button",
      onClick: openEntry,
      style: { display: "block", width: "100%", textAlign: "left", padding: 0, border: "1px solid rgba(255,255,255,.14)", background: "rgba(8,12,24,.66)", overflow: "hidden", cursor: "url(\"assets/cursors/attack.cur\"), pointer", color: "#fff" }
    },
      e("div", { style: { padding: "30px 32px 32px" } },
        item.date ? e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } }, esc(item.date)) : null,
        e("h3", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, lineHeight: 1.02, color: "#fff", margin: "12px 0 14px" } }, esc(item.title || "")),
        preview ? e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.6, maxWidth: 760, margin: 0 } }, esc(preview)) : null,
        e("div", { style: { marginTop: 20 } },
          e("span", { style: { display: "inline-block", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--accent)", paddingBottom: 3 } }, "READ MORE →"))
      )
    );
  }
  // compact list row: date + title + .txt preview snippet (+ arrow). No thumbnail.
  function NewsRow(props) {
    var item = (props && props.item) || props || {};
    var [preview, setPreview] = React.useState("");
    React.useEffect(function () {
      if (!item || !item.context) return;
      loadTxt(item.context, function (text) {
        if (text != null) setPreview(previewFromTxt(text));
      });
    }, [item && item.context]);
    function openEntry() { navigate("/news/" + encodeURIComponent(newsKey(item))); }
    return e("button", {
      className: "news-row card-hov", type: "button",
      onClick: openEntry,
      style: { display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, width: "100%", textAlign: "left", padding: "18px 20px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(8,12,24,.5)", overflow: "hidden", cursor: "url(\"assets/cursors/attack.cur\"), pointer", color: "#fff" }
    },
      item.date ? e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5, color: "var(--accent)", textTransform: "uppercase" } }, esc(item.date)) : null,
      e("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
        e("div", { style: { flex: "1 1 auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" } },
          e("span", { className: "news-row-title", style: { flex: "0 0 auto", fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: "#fff", whiteSpace: "nowrap" } }, esc(item.title || "")),
          e("span", { style: { flex: "1 1 auto", minWidth: 0, fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.55)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
            (preview ? "— " + preview : "")
          )
        ),
        e("span", { style: { flex: "0 0 auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: "var(--accent)" } }, "→")
      ),
      e("span", { style: { flex: "0 0 auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "rgba(255,255,255,.45)", textTransform: "uppercase" } }, "→ READ")
    );
  }
  function News(props) {
    // mode: "home" = short preview on the main page (homeLimit cards + VIEW ALL),
    //       "page" = full /news listing with pagination by pageSize.
    var mode = (props && props.mode) || "page";
    var nv = C.news || {};
    var bg = nv.bg || "assets/hero-bg-01.png";
    var tabA = nv.tabAnnouncement || "Announcement";
    var tabT = nv.tabEvent || "Event";
    var homeLimit = nv.homeLimit ? Number(nv.homeLimit) : 4;
    if (!(homeLimit > 0)) homeLimit = 4;
    var pageSize = nv.pageSize ? Number(nv.pageSize) : 10;
    if (!(pageSize > 0)) pageSize = 10;
    var data = {
      "announcement": nv.announcement && nv.announcement.length ? nv.announcement : [],
      "event": nv.event && nv.event.length ? nv.event : []
    };
    var tabs = [tabA, tabT];
    var [active, setActive] = React.useState(tabA);
    if (tabs.indexOf(active) === -1) active = tabA;
    var rows = data[active === tabT ? "event" : "announcement"] || [];
    var [page, setPage] = React.useState(1);
    // Reset to first page whenever the active tab changes.
    React.useEffect(function () { setPage(1); }, [active]);
    var totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    // Homepage shows a short preview; the /news page paginates the full list.
    var viewRows = mode === "home" ? rows.slice(0, homeLimit) : rows.slice((page - 1) * pageSize, page * pageSize);
    function pagerBtn(label, target, disabled, on) {
      return e("button", {
        type: "button", key: label, disabled: !!disabled,
        onClick: function () { if (!disabled) setPage(target); },
        style: {
          padding: "9px 16px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2,
          textTransform: "uppercase", fontWeight: 700, cursor: disabled ? "default" : "pointer",
          opacity: disabled ? .4 : 1,
          color: on ? "#0A1020" : "#fff",
          background: on ? "var(--accent)" : "rgba(255,255,255,.06)",
          border: "1px solid " + (on ? "var(--accent)" : "rgba(255,255,255,.14)"),
          transition: "all .15s ease"
        }
      }, label);
    }
    return e("section", { id: "news", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, var(--bg) 0%, rgba(20,30,60,.28) 50%, var(--bg) 100%)" } }),
      e("div", { style: { position: "relative", maxWidth: 1280, margin: "0 auto" } },
        e("div", { style: { marginBottom: 50 } },
          e(Eyebrow, null, "// News & Updates"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: "clamp(48px, 8vw, 92px)", lineHeight: .9, letterSpacing: -2, margin: "16px 0 18px", color: "#fff" } },
            esc(nv.title || "THE LATEST"), e("br", null), e("span", { style: { color: "var(--accent)", fontStyle: "italic" } }, esc(nv.accent || "NEWS."))),
          nv.intro ? e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "rgba(255,255,255,.7)", maxWidth: 640, lineHeight: 1.6 } }, esc(nv.intro)) : null
        ),
        e("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 } },
          tabs.map(function (t) {
            var on = t === active;
            return e("button", {
              key: t, onClick: function () { setActive(t); },
              style: {
                padding: "11px 22px", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2,
                textTransform: "uppercase", fontWeight: 700, cursor: "pointer",
                color: on ? "#0A1020" : "#fff",
                background: on ? "var(--accent)" : "rgba(255,255,255,.06)",
                border: "1px solid " + (on ? "var(--accent)" : "rgba(255,255,255,.14)"),
                transition: "all .15s ease"
              }
            }, esc(t));
          })
        ),
        viewRows.length
          ? e("div", { className: "news-list" },
              e("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
                viewRows.map(function (it) { return e(NewsRow, { key: newsKey(it), item: it }); }))
            )
          : e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 15, color: "rgba(255,255,255,.5)" } }, "No " + esc(active) + " posts yet."),
        mode === "home"
          ? e("div", { style: { marginTop: 22 } },
              e("button", {
                type: "button", onClick: function () { navigate("/news"); },
                style: {
                  display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                  fontWeight: 700, cursor: "pointer", color: "#fff",
                  background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.18)",
                  transition: "all .15s ease"
                }
              }, "VIEW ALL NEWS →"))
          : null,
        mode === "page" && totalPages > 1
          ? e("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 26 } },
              pagerBtn("‹ PREV", page - 1, page <= 1, false),
              (function () {
                var btns = [];
                for (var p = 1; p <= totalPages; p++) btns.push(pagerBtn(String(p), p, false, p === page));
                return btns;
              })(),
              pagerBtn("NEXT ›", page + 1, page >= totalPages, false)
            )
          : null
      )
    );
  }

  // (Service cards render with a section-specific layout — see `card` below.)
  function Services() {
    var sv = C.services || {};
    var bg = sv.bg || "assets/hero-bg-07.png";
    var items = sv.items || [];
    if (items.length === 0) return null;
    // group items by their `section` field, preserving first-seen order
    var groups = [], map = {};
    for (var i = 0; i < items.length; i++) {
      var g = items[i].section || "Services";
      if (!map[g]) { map[g] = []; groups.push(g); }
      map[g].push(items[i]);
    }
    var [active, setActive] = React.useState(groups[0]);
    if (groups.indexOf(active) === -1) active = groups[0];
    var applyLinks = sv.apply || {};
    // live count of people per role, e.g. "PILOTS (3)"
    var counts = {};
    for (var ci = 0; ci < items.length; ci++) {
      var cs = items[ci].section || "Services";
      counts[cs] = (counts[cs] || 0) + 1;
    }
    var svcFeeStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 1, fontWeight: 700, color: "#fff" };
    function labelFor(it) {
      if (it.section === "Streamer") return it.socialtype || it.code || "Stream";
      return it.ign || it.role || "";
    }
    function noteFor(it) {
      if (it.section === "Streamer") return "";
      return it.saying || "";
    }
    function feeLine(it) {
      if (it.section === "Pilots") return e("div", { style: svcFeeStyle }, "Fee: " + esc(it.fee || "-") + esc(it.rateperh || ""));
      if (it.section === "Middleman") return e("div", { style: svcFeeStyle }, "Fee: " + esc(it.fee || "-"));
      if (it.section === "Streamer") return it.streamkey ? e("div", { style: { display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", color: "var(--text-dim)", background: "rgba(var(--accent-rgb), .12)", border: "1px solid rgba(var(--accent-rgb), .5)", borderRadius: 8, padding: "7px 12px", boxShadow: "var(--glow)" } }, "Code ", e("b", { style: { fontSize: 14, letterSpacing: 1, color: "#fff" } }, esc(it.streamkey))) : null;
      return it.fee ? e("div", { style: svcFeeStyle }, "Fee: " + esc(it.fee) + esc(it.rateperh || "")) : null;
    }
    function ctaFor(it) {
      var link = it.social || it.url || "";
      if (!link) return null;
      var text = it.section === "Streamer" ? "VISIT" : (it.cta || "SOCIAL");
      return e("button", { onClick: function () { open(link); }, style: { marginTop: 4, padding: "13px 16px", background: "var(--accent)", color: "#0A1020", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 } }, esc(text));
    }
    function card(it, idx) {
      var verified = String(it.ykc || "").trim() === "1";
      var sub = labelFor(it);
      var note = noteFor(it);
      return e("div", {
        key: (it.section || "") + "-" + idx,
        className: "card-hov",
        style: { position: "relative", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,24,.6)", overflow: "hidden" }
      },
        e("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "16px 16px 18px", flex: "1 1 auto" } },
          e("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.05 } }, esc(it.name || "")),
            verified
              ? e("span", {
                  className: "verified-badge",
                  style: { position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "#7CFFB0", color: "#0A1020", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, flex: "0 0 auto", cursor: "help" }
                },
                "✓",
                e("span", { className: "verified-tip", style: { position: "absolute", bottom: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", padding: "5px 9px", background: "#0A1020", color: "#7CFFB0", border: "1px solid rgba(124,255,176,.45)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0, pointerEvents: "none", transition: "opacity .15s ease", zIndex: 20 } }, "Verified by admin")
              )
              : null
          ),
          e("div", { style: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", border: "1px solid rgba(255,255,255,.1)", background: "rgba(0,0,0,.25)", flex: "1 1 auto" } },
            sub ? e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--accent)" } }, esc(sub)) : null,
            note ? e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,.72)" } }, esc(note)) : null,
            feeLine(it)
          ),
          ctaFor(it)
        )
      );
    }
    function ctaLabelFor(section) {
      if (section === "Pilots") return "APPLY";
      if (section === "Middleman") return "REQUEST MM";
      if (section === "Streamer") return "WATCH LIVE";
      return "APPLY";
    }
    function applyCard(section) {
      var link = applyLinks[section] || "";
      return e("div", {
        key: "apply",
        className: "card-hov services-apply",
        style: { position: "relative", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,24,.6)", overflow: "hidden" }
      },
        e("div", { style: { display: "flex", flexDirection: "column", gap: 12, padding: "16px 16px 18px", flex: "1 1 auto" } },
          e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", lineHeight: 1.05 } }, "Become a " + esc(section)),
          e("div", { style: { flex: "1 1 auto", fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.68)", lineHeight: 1.6 } }, "Apply now and join the verified " + esc(section) + " team. Open a ticket and our staff will get you set up."),
          link ? e("button", {
            onClick: function () { open(link); },
            style: { marginTop: 4, padding: "13px 16px", background: "var(--accent)", color: "#0A1020", border: "none", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontWeight: 700 }
          }, esc(ctaLabelFor(section)) + " →") : null
        )
      );
    }
    return e("section", { id: "services", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(20,30,60,.35) 0%, rgba(20,30,60,.15) 50%, rgba(20,30,60,.35) 100%)" } }),
      e("div", { style: { position: "relative", maxWidth: 1280, margin: "0 auto" } },
        e("div", { style: { marginBottom: 50 } },
          e(Eyebrow, null, "// 07 — Services"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 96, lineHeight: .9, letterSpacing: -2, margin: "16px 0 18px", color: "#fff" } },
            esc(sv.title || "OUR"), e("br", null), e("span", { style: { color: "var(--accent)", fontStyle: "italic" } }, esc(sv.accent || "SERVICES."))),
          sv.intro ? e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 16, color: "rgba(255,255,255,.7)", maxWidth: 640, lineHeight: 1.6 } }, esc(sv.intro)) : null
        ),
        e("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 } },
          groups.map(function (g) {
            var on = g === active;
            return e("button", {
              key: g,
              onClick: function () { setActive(g); },
              style: {
                padding: "11px 22px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
                cursor: "pointer",
                color: on ? "#0A1020" : "#fff",
                background: on ? "var(--accent)" : "rgba(255,255,255,.06)",
                border: "1px solid " + (on ? "var(--accent)" : "rgba(255,255,255,.14)"),
                transition: "all .15s ease"
              }
            }, esc(g) + " (" + (counts[g] || 0) + ")");
          })
        ),
        e("div", { className: "services-grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24, alignItems: "stretch" } },
          [applyCard(active)].concat((map[active] || []).map(card))
        )
      )
    );
  }

  /* ---- FACEBOOK ---- (embedded Page Plugin via the official Facebook JS SDK) ---- */
  // Loads the Facebook JS SDK once (singleton). The SDK-based HTML5 fb-page
  // plugin is the reliable way to surface the latest posts — the raw
  // plugins/page.php iframe is frequently blanked by tracking protection /
  // consent dialogs. Resolves to window.FB (or null on failure).
  var fbSdkPromise = null;
  function loadFacebookSdk() {
    if (fbSdkPromise) return fbSdkPromise;
    fbSdkPromise = new Promise(function (resolve) {
      if (window.FB && window.FB.XFBML) { resolve(window.FB); return; }
      if (!document.getElementById("fb-root")) {
        var fbroot = document.createElement("div");
        fbroot.id = "fb-root";
        (document.body || document.documentElement).appendChild(fbroot);
      }
      var s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true; s.defer = true;
      s.src = "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0";
      s.onload = function () { resolve(window.FB || null); };
      s.onerror = function () { resolve(null); };
      var first = document.getElementsByTagName("script")[0];
      if (first && first.parentNode) first.parentNode.insertBefore(s, first);
      else (document.head || document.body).appendChild(s);
    });
    return fbSdkPromise;
  }

  function Facebook() {
    var f = C.facebook || {};
    var cm = C.community || {};
    var bg = f.bg || "assets/hero-bg-09.png";
    // "loading" | "local" | "failed". Facebook refuses to render the Page Plugin
    // on non-public origins (localhost / 127.0.0.1 / file://), so on a dev origin we
    // show an honest "renders on the live site" notice instead of a scary error.
    var [feedMode, setFeedMode] = React.useState("loading");
    var fbHref = "https://www.facebook.com/" + (f.pageId || "RanOnlineEP9");
    var mountRef = React.useRef(null);
    var isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|file:)(:|\/|$)/i.test(window.location.href);
    React.useEffect(function () {
      var cancelled = false;
      var t = null;
      if (isLocalOrigin) { setFeedMode("local"); return; }
      loadFacebookSdk().then(function (FB) {
        if (cancelled) return;
        if (!FB || !FB.XFBML || !mountRef.current) { setFeedMode("failed"); return; }
        // Inject the fb-page element via the DOM (NOT via React) so Facebook's
        // XFBML parser can safely mutate it without colliding with React's virtual
        // DOM on later re-renders.
        var el = document.createElement("div");
        el.className = "fb-page";
        el.setAttribute("data-href", fbHref);
        el.setAttribute("data-tabs", "timeline");
        el.setAttribute("data-width", "500");
        el.setAttribute("data-height", "600");
        el.setAttribute("data-small-header", "false");
        el.setAttribute("data-adapt-container-width", "true");
        el.setAttribute("data-hide-cover", "false");
        el.setAttribute("data-show-facepile", "true");
        el.style.width = "100%";
        el.style.minHeight = "460px";
        var link = document.createElement("a");
        link.href = fbHref; link.target = "_blank"; link.rel = "noopener";
        link.style.color = "var(--accent)";
        link.textContent = "@" + (f.pageId || "RanOnlineEP9");
        var bq = document.createElement("blockquote");
        bq.cite = fbHref; bq.style.cssText = "border:0;padding:0;margin:0;";
        bq.appendChild(link);
        el.appendChild(bq);
        mountRef.current.appendChild(el);
        try { FB.XFBML.parse(mountRef.current); } catch (err) { /* noop */ }
        // Graceful fallback ONLY if the plugin genuinely fails to render an iframe
        // (network blocked / GDPR consent wall / page restricted / offline).
        t = setTimeout(function () {
          if (mountRef.current && !mountRef.current.querySelector("iframe")) setFeedMode("failed");
        }, 8000);
      }).catch(function () { if (!cancelled) setFeedMode("failed"); });
      return function () { cancelled = true; if (t) clearTimeout(t); };
    }, []);
    return e("section", { id: "facebook", style: { position: "relative", padding: "120px 48px", borderTop: "1px solid rgba(255,255,255,.06)", overflow: "hidden" } },
      SecBg(bg),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(10,16,32,.4) 0%, rgba(20,30,60,.15) 50%, rgba(10,16,32,.4) 100%)" } }),
      e("div", { style: { position: "relative", maxWidth: 1280, margin: "0 auto" } },
        e("div", { style: { marginBottom: 50 } },
          e(Eyebrow, null, "// 08 - Facebook"),
          e("h2", { style: { fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 96, lineHeight: .9, letterSpacing: -2, margin: "16px 0 18px", color: "#fff" } },
            esc(f.title || "FIND US ON"), e("br", null), e("span", { style: { color: "var(--accent)" } }, esc(f.accent || "FACEBOOK.")))
        ),
        e("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 28, alignItems: "start" } },
          e("div", { className: "facebook-feed-frame", style: { position: "relative", minHeight: 460, border: "1px solid rgba(255,255,255,.12)", background: "rgba(8,12,24,.5)", overflow: "hidden" } },
              e("div", { ref: mountRef, style: { width: "100%", minHeight: 460 } }),
              feedMode === "loading"
                ? e("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" } },
                    e("div", { style: { width: 26, height: 26, border: "2px solid rgba(255,255,255,.2)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin360 0.9s linear infinite" } }),
                    e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } }, "LOADING FEED")
                  )
                : feedMode === "local"
                ? e("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" } },
                    e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } }, "EMBED ENABLED ON LIVE SITE"),
                    e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.6 } }, "Facebook's Page Plugin can't render on localhost. It goes live on the deployed domain. You can preview the page now."),
                    e("a", { href: fbHref, target: "_blank", rel: "noopener", style: { marginTop: 6, padding: "12px 22px", background: "var(--accent)", color: "#0A1020", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none", fontWeight: 700 } }, "VISIT PAGE →")
                  )
                : e("div", { style: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" } },
                    e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase" } }, "LIVE FEED UNAVAILABLE"),
                    e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 14, color: "rgba(255,255,255,.6)", lineHeight: 1.6 } }, "The embedded feed can't load here. Open the page to see the latest posts."),
                    e("a", { href: fbHref, target: "_blank", rel: "noopener", style: { marginTop: 6, padding: "12px 22px", background: "var(--accent)", color: "#0A1020", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", textDecoration: "none", fontWeight: 700 } }, "VISIT PAGE →")
                  )
          ),
          e("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
            e("a", { href: fbHref, target: "_blank", rel: "noopener", className: "card-hov", style: { display: "block", padding: "24px", border: "1px solid rgba(255,255,255,.14)", background: "rgba(8,12,24,.5)", textDecoration: "none", color: "#fff" } },
              e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700 } }, "Visit Page"),
              e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 6 } }, "@" + esc(f.pageId || "RanOnlineEP9"))
            ),
            cm.facebookGroupUrl ? e("a", { href: cm.facebookGroupUrl, target: "_blank", rel: "noopener", className: "card-hov", style: { display: "block", padding: "24px", border: "1px solid rgba(255,214,10,.35)", background: "rgba(8,12,24,.5)", textDecoration: "none", color: "#fff" } },
              e("div", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, color: "var(--accent)" } }, "Join Group"),
              e("div", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.55)", marginTop: 6 } }, "Hang out with the community")
            ) : null
          )
        )
      )
    );
  }

  /* ---- FOOTER ---- */
  function Footer() {
    var ft = C.footer || {};
    var site = C.site || {};
    var cols = ft.columns || [];
    var fbg = ft.bg || "assets/hero-bg-10.png";
    return e("footer", { style: { position: "relative", padding: "60px 48px 30px", borderTop: "1px solid rgba(255,255,255,.08)", background: "rgba(8,12,24,.6)", overflow: "hidden" } },
      SecBg(fbg, 0.16),
      e("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, rgba(8,12,24,.35) 0%, rgba(8,12,24,.5) 100%)" } }),
      e("div", { style: { position: "relative", display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: 60, marginBottom: 50 } },
        e("div", null,
          e("div", { style: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 } },
            e("img", { src: site.logo || "assets/logo.png", alt: "", style: { height: 50 } }),
            e("div", { style: { display: "flex", flexDirection: "column", lineHeight: 1.1 } },
              e("span", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 3, color: "var(--accent)" } }, site.brandShort || "RAN GS"),
              e("span", { style: { fontFamily: "'Rajdhani', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "#fff" } }, site.brandLong || "RanOnline EP9")
            )
          ),
          e("p", { style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.55)", lineHeight: 1.6, maxWidth: 320 } }, esc(ft.tagline || ""))
        ),
        cols.map(function (col, ci) {
          return e("div", { key: ci },
            e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 2, color: "var(--accent)", textTransform: "uppercase", marginBottom: 16 } }, esc(col.title)),
            e("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
              (col.links || []).map(function (l, li) {
                return e("a", { key: li, href: l.href, target: l.href && l.href.indexOf("http") === 0 ? "_blank" : null, rel: "noopener", style: { fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(255,255,255,.65)", textDecoration: "none" } }, esc(l.label));
              })
            )
          );
        })
      ),
      e("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 24, flexWrap: "wrap", gap: 12 } },
        e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,.4)" } }, esc(ft.copyright || "")),
        e("div", { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,.3)" } }, esc((site.version || "EP9") + " / " + (site.year || "2026")))
      )
    );
  }

  /* ---- APP ---- */
  function App() {
    var [trailer, setTrailer] = React.useState(false);
    var hero = C.hero || {};
    var site = C.site || {};
    var route = useRoute();
    React.useEffect(function () {
      if (site.title) document.title = site.title + (site.tagline ? " — " + site.tagline : "");
      if (site.favicon) { var l = document.getElementById("page-favicon"); if (l) l.href = site.favicon; }
    }, []);
    // Scroll to top whenever the route changes (detail page starts at the top).
    React.useEffect(function () {
      window.scrollTo(0, 0);
    }, [route.name, route.params && route.params.id]);
    // On a news route we render a focused view (no full homepage):
    //  - "/news"          → dedicated News index/listing page (all cards)
    //  - "/news/:id"      → dedicated News article detail page
    if (route.name === "news-detail" || route.name === "news") {
      return e(React.Fragment, null,
        e(Nav),
        e("main", null,
          route.name === "news-detail" ? e(NewsDetail) : e(News, { mode: "page" })
        ),
        e(MusicControl),
        e(Trailer, { open: trailer, onClose: function () { setTrailer(false); }, url: hero.ctaPlayUrl || "" })
      );
    }
    return e(React.Fragment, null,
      e(Nav),
      e("main", null,
        e(Hero, { onTrailer: function () { setTrailer(true); } }),
        e(Server),
        e(News, { mode: "home" }),
        e(Classes),
        e(Combat),
        e(Roadmap),
        e(Download),
        e(Community),
        e(Services),
        e(Facebook)
      ),
      e(Footer),
      e(MusicControl),
      e(Trailer, { open: trailer, onClose: function () { setTrailer(false); }, url: hero.ctaPlayUrl || "" })
    );
  }

  function boot() {
    if (window.React && window.ReactDOM && document.getElementById("root")) {
      ReactDOM.render(e(App), document.getElementById("root"));
    } else {
      window.setTimeout(boot, 30);
    }
  }
  boot();
})();

