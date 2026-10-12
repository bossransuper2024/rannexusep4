/* ============================================================================
 * news-data.js — SHARED, LIVE News loader for the Main Page (index.html) and
 * the standalone news.html. Both pages fetch the published Google Sheet CSV
 * directly in the browser (the published CSV sends `access-control-allow-origin:
 * *`, so CORS is clear — no proxy / build step required). If the live fetch
 * fails (offline / blocked host), it falls back to the baked same-origin
 * data/news.json so the site still renders.
 *
 * Normalized item shape (both live + fallback):
 *   { id, cat, title, date, description, image, text }
 *   `cat` is always one of: "NEWS" | "ANNOUNCEMENT" | "EVENT" | "GUIDE".
 * ========================================================================== */
(function () {
  "use strict";

  // category codes/strings -> canonical category key
  function classify(raw) {
    var s = ("" + (raw == null ? "" : raw)).trim().toUpperCase().replace(/\s+/g, "");
    if (s === "1" || s === "NEWS" || s === "NEW" || s === "ANNOUNCEMENTS") return "NEWS";
    if (s === "2" || s === "ANNOUNCEMENT" || s === "ANNOUNCE" || s === "PATCH" || s === "PATCHNOTES") return "ANNOUNCEMENT";
    if (s === "3" || s === "EVENT" || s === "EVENTS") return "EVENT";
    if (s === "4" || s === "GUIDE" || s === "TUTORIAL" || s === "GUIDES") return "GUIDE";
    if (s === "") return "NEWS";
    return s; // any other token: keep upper-cased (staff can add categories)
  }

  /* Normalizes Google Sheets URLs to CSV export format.
   * Converts /pubhtml URLs to /pub?output=csv with matching gid. */
  function toCsvUrl(url) {
    if (!url || typeof url !== "string") return url;
    var u = url.trim();
    if (u.indexOf("/pubhtml") !== -1) {
      var gidMatch = u.match(/[?&#]gid=([0-9]+)/);
      var gid = gidMatch ? gidMatch[1] : null;
      var base = u.split("/pubhtml")[0] + "/pub?output=csv";
      return gid ? base + "&gid=" + gid : base;
    }
    if (u.indexOf("/pub") !== -1 && u.indexOf("output=csv") === -1) {
      var delim = u.indexOf("?") !== -1 ? "&" : "?";
      return u + delim + "output=csv";
    }
    return u;
  }

  // RFC4180-ish CSV parser (quoted fields, embedded commas, escaped quotes).
  function parseCsv(text) {
    if (!text) return [];
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [], row = [], field = "", i = 0, inQ = false, n = text.length;
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { inQ = true; i++; continue; }
      if (ch === ",") { row.push(field); field = ""; i++; continue; }
      if (ch === "\r") { i++; continue; }
      if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Map a raw CSV row (object keyed by header) into the normalized item shape.
  function normalizeRow(obj) {
    var id = (obj.id != null && obj.id !== "") ? String(obj.id).trim() : ("row-" + Math.random().toString(36).slice(2, 9));
    var title = (obj.Title != null && obj.Title !== "") ? obj.Title : (obj.title || "");
    var cat = classify(obj.category != null ? obj.category : obj.type);
    var date = (obj.date != null && obj.date !== "") ? obj.date : (obj.Date || "");
    var description = (obj.desc != null && obj.desc !== "") ? obj.desc : (obj.description || "");
    var content = (obj.content != null && obj.content !== "") ? obj.content : "";
    var body = (obj.body != null && obj.body !== "") ? obj.body : "";
    var text = (content !== "") ? content : (body !== "" ? body : (obj.text != null && obj.text !== "") ? obj.text : "");
        var image = (obj.image != null && obj.image !== "") ? obj.image : "";
    var author = (obj.author != null && obj.author !== "") ? obj.author : "";
    return { id: id, cat: cat, title: title, date: date, description: description, image: image, text: text, author: author };
  }

  // Build filter chips from HiddenCategories + categories present in the data.
  function buildFilters(items, hidden) {
    var present = {};
    items.forEach(function (it) { present[it.cat] = true; });
    var order = ["NEWS", "ANNOUNCEMENT", "EVENT", "GUIDE"];
    var defs = [{ key: "all", label: "ALL" }];
    order.forEach(function (k) {
      if (present[k] && hidden.indexOf(k) === -1) defs.push({ key: k.toLowerCase(), label: k });
    });
    Object.keys(present).forEach(function (k) {
      if (order.indexOf(k) === -1 && hidden.indexOf(k) === -1 &&
          !defs.some(function (d) { return d.label === k; })) {
        defs.push({ key: k.toLowerCase(), label: k });
      }
    });
    return defs;
  }

  // Cache of rendered article bodies by id (avoids re-fetch / re-render).
  var RENDER_CACHE = {};
  var _items = null;
  var _loadPromise = null;

  function getCfg() {
    var C = window.SITE_CONFIG || {};
    return { news: C.news || {}, newsConfig: C.newsConfig || {} };
  }
  function applyHidden(items, hidden) {
    if (!hidden || !hidden.length) return items;
    return items.filter(function (it) { return hidden.indexOf(it.cat) === -1; });
  }
  function normalizeLegacy(rec) {
    var cat = (rec.type || rec.cat || "NEWS").toString().toUpperCase();
    return {
      id: rec.id || rec.slug || rec.uid,
      cat: cat,
      title: rec.title || "",
      date: rec.date || "",
      description: rec.description || "",
      image: rec.image || "",
      text: rec.text || "",
      author: rec.author || ""
    };
  }

  // Load: try live sheet first, else baked dataUrl. Returns Promise<items[]>.
  function loadNewsData(opts) {
    opts = opts || {};
    if (_items) return Promise.resolve(_items);
    if (_loadPromise) return _loadPromise;
    var cfg = getCfg();
    var sheetUrl = toCsvUrl(cfg.news.sheetUrl);
    var dataUrl = cfg.news.dataUrl;

    function fromCsvText(text) {
      var rows = parseCsv(text);
      if (!rows.length) return [];
      var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
      var out = [];
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i].length || rows[i].every(function (c) { return c.trim() === ""; })) continue;
        var obj = {};
        header.forEach(function (h, j) { obj[h] = rows[i][j] != null ? rows[i][j] : ""; });
        out.push(normalizeRow(obj));
      }
      return out;
    }

    function loadFromDataUrl() {
      if (!dataUrl) return Promise.resolve([]);
      return fetch(dataUrl, { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (json) {
          var arr = (json && json.items) || [];
          return applyHidden(arr.map(normalizeLegacy),
            (cfg.newsConfig.hiddenCategories || cfg.news.hiddenCategories || []).map(function (s) { return s.toUpperCase(); }));
        })
        .catch(function () { return []; });
    }

    if (!sheetUrl) {
      _loadPromise = loadFromDataUrl().then(function (items) { _items = items; return items; });
      return _loadPromise;
    }

    var ctrl = (window.AbortController && new AbortController()) || null;
    var timer = setTimeout(function () { if (ctrl && ctrl.abort) ctrl.abort(); }, 20000);
    _loadPromise = fetch(sheetUrl, ctrl ? { signal: ctrl.signal, cache: "no-cache" } : { cache: "no-cache" })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        var items = fromCsvText(text);
        if (!items.length) return loadFromDataUrl();
        items = applyHidden(items, (cfg.newsConfig.hiddenCategories || cfg.news.hiddenCategories || []).map(function (s) { return s.toUpperCase(); }));
        items = items.slice().sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
        _items = items;
        return items;
      })
      .catch(function (err) {
        if (opts.warn !== false) console.warn("[news-data] live Sheet fetch failed, using baked data: " + (err && err.message ? err.message : err));
        return loadFromDataUrl().then(function (items) { _items = items; return items; });
      });
    return _loadPromise;
  }

  function getNewsById(id) {
    if (!_items || id == null) return null;
    var sid = String(id);
    for (var i = 0; i < _items.length; i++) if (String(_items[i].id) === sid) return _items[i];
    for (var j = 0; j < _items.length; j++) if (String(_items[j].id).toLowerCase() === sid.toLowerCase()) return _items[j];
    return null;
  }

  function filterNewsByCategory(key) {
    if (!_items) return [];
    if (!key || key === "all") return _items.slice();
    var k = key.toUpperCase();
    return _items.filter(function (it) { return it.cat === k; });
  }

  function getFilters(hidden) {
    hidden = (hidden || []).map(function (s) { return s.toUpperCase(); });
    return _items ? buildFilters(_items, hidden) : [{ key: "all", label: "ALL" }];
  }

  window.NewsData = {
    load: loadNewsData,
    getById: getNewsById,
    filter: filterNewsByCategory,
    filters: getFilters,
    parseCsv: parseCsv,
    classify: classify,
    RENDER_CACHE: RENDER_CACHE,
    setItems: function (items) { _items = items || null; },
    get items() { return _items || []; }
  };
})();