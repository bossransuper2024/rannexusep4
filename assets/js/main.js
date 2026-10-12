/* ============================================================================
 * Ran Online EP9 — Site App (vanilla JS, config-driven)
 * Renders every section from window.SITE_CONFIG + window.RGSE_DOWNLOAD_MIRRORS
 * (generated from config.ini by generate-config.mjs / downloads.js). No framework.
 * ========================================================================== */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var MIRRORS = window.RGSE_DOWNLOAD_MIRRORS || {};

  function esc(s) { return (s == null) ? "" : String(s); }
  function el(id) { return document.getElementById(id); }

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

  /* RFC4180-ish CSV parser (quoted fields, commas, escaped quotes). Shared by
   * the news loader and the live Google Sheet fetch. */
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
      if (ch === ',') { row.push(field); field = ""; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /* Audio effects for click/hover */
  var AudioFX = (function () {
    var clickAudio = null;
    var hoverAudio = null;
    var enabled = true;
    var clickVolume = 0.3;
    var hoverVolume = 0.15;
    
    function init() {
      // Create audio elements lazily
      clickAudio = new Audio('assets/audio/click.mp3');
      clickAudio.volume = clickVolume;
      clickAudio.preload = 'auto';
      
      hoverAudio = new Audio('assets/audio/hover.mp3');
      hoverAudio.volume = hoverVolume;
      hoverAudio.preload = 'auto';
    }
    
    function playClick() {
      if (!enabled || !clickAudio) return;
      clickAudio.currentTime = 0;
      clickAudio.play().catch(function () {});
    }
    
    function playHover() {
      if (!enabled || !hoverAudio) return;
      hoverAudio.currentTime = 0;
      hoverAudio.play().catch(function () {});
    }
    
    function setEnabled(val) { enabled = !!val; }
    function setClickVolume(v) { clickVolume = v; if (clickAudio) clickAudio.volume = v; }
    function setHoverVolume(v) { hoverVolume = v; if (hoverAudio) hoverAudio.volume = v; }
    
    return { init: init, playClick: playClick, playHover: playHover, setEnabled: setEnabled, setClickVolume: setClickVolume, setHoverVolume: setHoverVolume };
  })();
  
  // Initialize audio on first user interaction
  var audioInitialized = false;
  function ensureAudioInit() {
    if (!audioInitialized) {
      AudioFX.init();
      audioInitialized = true;
    }
  }
  
  // Attach click/hover audio to interactive elements
  function wireAudioFX() {
    var fxConfig = C.audioFx || {};
    if (fxConfig.enabled !== true) return; // Disabled by default - set audioFx.enabled=true in config.ini to enable
    // Click sounds for buttons, links with .btn class, nav links, tabs
    document.addEventListener('click', function (e) {
      var target = e.target.closest('button, .btn, .nav-links a, .class-tab, .svc-tab, .news-tabs a, .page-btn, .view-all-link, .svc-apply, .music-toggle, .nav-cta, .hero-actions button, .hero-actions a');
      if (target) {
        ensureAudioInit();
        AudioFX.playClick();
      }
    }, true);
    
    // Hover sounds for buttons, cards, nav links
    document.addEventListener('mouseenter', function (e) {
      var target = e.target.closest('button, .btn, .nav-links a, .class-tab, .svc-tab, .news-tabs a, .page-btn, .view-all-link, .stat-card, .mode-card, .svc-card, .class-tab, .rate-chip, .news-row, .diff-block, .info-card');
      if (target && !target.classList.contains('music-toggle')) {
        ensureAudioInit();
        AudioFX.playHover();
      }
    }, true);
  }

  // Normalize bare URLs ("www.fb.com/rey" -> https://...) so they open externally.
  function toAbs(url) {
    var s = String(url || "").trim();
    if (!s) return s;
    if (/^#/.test(s) || /^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
    return "https://" + s;
  }

  /* mini-markdown for article .txt files: **b** __u__ ~~s~~ *i* "- item" */
  /* mini-markdown for article .txt files:
   **b** __u__ ~~s~~ *i* "- item"
   [img]url[img][auto|WxH] - inline images
   [col]...[/col] - column (flex basis 50%)
   [col3]...[/col3] - 3-column grid
   [table]...[/table] - simple tables (pipe-separated)
   [code]...[/code] - inline code
   [quote]...[/quote] - blockquote
   [callout]...[/callout] - highlighted callout box
   [hr] - horizontal rule
   [br] - line break
*/
  /* mini-markdown for article .txt files:
   **b** __u__ ~~s~~ *i* "- item"
   [img]url[img][auto|WxH] - inline images
   [col]...[/col] - column (flex basis 50%)
   [col3]...[/col3] - 3-column grid
   [table]...[/table] - simple tables (pipe-separated)
   [code]...[/code] - inline code
   [quote]...[/quote] - blockquote
   [callout]...[/callout] - highlighted callout box
   [hr] - horizontal rule
   [br] - line break
*/
  function inline(t) {
    return t
      .replace(/\[img\](.*?)\[img\](?:\[(auto|\d+x\d+)\])?/g, function (_m, url, size) {
        url = String(url).replace(/"/g, '"');
        if (url.indexOf('://') === -1 && url.indexOf('/') !== 0) url = 'assets/content/' + url;
        var dim = '';
        if (size && size !== 'auto') { var p = size.split('x'); dim = ' width="' + p[0] + '" height="' + p[1] + '"'; }
        return '<img class="txt-img" src="' + url + '" alt=""' + dim + '>';
      })
      .replace(/\[table\]([\s\S]*?)\[\/table\]/g, function (_m, content) {
        var rows = content.trim().split('\n');
        var html = '<table class="txt-table">';
        rows.forEach(function (row, i) {
          var cells = row.split('|').map(function (c) { return c.trim(); });
          var tag = i === 0 ? 'th' : 'td';
          html += '<tr>';
          cells.forEach(function (cell) { html += '<' + tag + '>' + inline(cell) + '</' + tag + '>'; });
          html += '</tr>';
        });
        html += '</table>';
        return html;
      })
      .replace(/\[callout\]([\s\S]*?)\[\/callout\]/g, '<div class="txt-callout">$1</div>')
      .replace(/\[quote\]([\s\S]*?)\[\/quote\]/g, '<blockquote class="txt-quote">$1</blockquote>')
      .replace(/\[code\](.*?)\[\/code\]/g, '<code class="txt-code">$1</code>')
      .replace(/\[col\]([\s\S]*?)\[\/col\]/g, '<div class="txt-col">$1</div>')
      .replace(/\[col3\]([\s\S]*?)\[\/col3\]/g, '<div class="txt-col3">$1</div>')
      .replace(/\[h2\]([\s\S]*?)\[\/h2\]/g, '<h2 class="txt-h2">$1</h2>')
      .replace(/\[h3\]([\s\S]*?)\[\/h3\]/g, '<h3 class="txt-h3">$1</h3>')
      .replace(/\[hr\]/g, '<hr class="txt-hr">')
      .replace(/\[br\]/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<u>$1</u>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  }
  function renderText(raw) {
    var blocks = [];
    (raw || "").split(/\n/).forEach(function (line) {
      line = line.replace(/\r/g, "");
      if (!line.trim()) return;
      if (/^[-•]\s+/.test(line)) blocks.push({ type: "li", text: inline(line.replace(/^[-•]\s+/, "")) });
      else blocks.push({ type: "p", text: inline(line) });
    });
    return blocks;
  }

  /* -------- HERO -------- */
  function renderHero() {
    var h = C.hero || {};
    if (el("hero-title")) el("hero-title").textContent = h.title || h.Title || "RAN ONLINE";
    if (el("hero-subtitle")) el("hero-subtitle").textContent = h.subtitle || h.Subtitle || "";
    if (el("hero-lead")) el("hero-lead").textContent = h.description || h.Description || "";
    if (h.bg && el("hero-bg")) el("hero-bg").style.backgroundImage = "url('" + h.bg + "')";
    var trailer = el("hero-trailer");
    if (trailer) {
      trailer.textContent = h.ctaPlay || "WATCH TRAILER";
      trailer.onclick = function () { if (h.ctaPlayUrl) window.open(h.ctaPlayUrl, "_blank", "noopener"); };
    }
    if (el("hero-download")) el("hero-download").href = "#download";
    var server = C.server || {};
    var statsWrap = el("hero-stats");
    if (statsWrap) {
      // Hero stats bar wired to [HERO_STATS] in config.ini.
      var items = (C.hero && C.hero.heroStats) ? C.hero.heroStats : [
        { label: "PLAYABLE CLASSES", value: "07", note: "Each with unique skill trees" },
        { label: "MAX CHAR LEVEL", value: "175", note: "Current level cap" },
        { label: "GAME VERSION", value: "EP4", note: "Latest client" },
        { label: "FOCUS", value: "PvP", note: "Server focus" }
      ];
      statsWrap.innerHTML = items.map(function (s) {
        return '<div class="hs"><b>' + (s.value || s.v || '') + '</b><span>' + (s.label || s.l || '') + '</span></div>';
      }).join("");
    }
  }

  /* -------- NAV + active highlight + mobile -------- */
  function wireNav() {
    var nav = el("nav"), links = document.querySelectorAll(".nav-links a");
    var burger = el("nav-burger"), menu = el("nav-menu");
    window.addEventListener("scroll", function () {
      if (nav) {
        if (C.navTransparentOnScroll) {
          nav.classList.remove("is-scrolled");
        } else {
          nav.classList.toggle("is-scrolled", window.scrollY > 24);
        }
      }
    });
    if (burger && menu) {
      burger.addEventListener("click", function () { menu.classList.toggle("is-open"); });
      menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { menu.classList.remove("is-open"); }); });
    }
    var ids = Array.prototype.map.call(links, function (a) {
      var href = a.getAttribute("href") || ""; return href.indexOf("#") === 0 ? href.slice(1) : null;
    }).filter(Boolean);
    if ("IntersectionObserver" in window && ids.length) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id); });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      ids.forEach(function (id) { var s = el(id); if (s) obs.observe(s); });
    }
  }

  /* -------- SERVER -------- */
  function renderServer() {
    var s = C.server || {};
    if (el("server-intro")) el("server-intro").textContent = s.intro || "";
    if (s.bg && el("server-bg")) el("server-bg").style.backgroundImage = "url('" + s.bg + "')";
    var grid = el("server-stats");
    if (grid) {
      grid.innerHTML = (s.stats || []).map(function (st) {
        return '<div class="stat-card reveal"><div class="lbl">' + esc(st.label) + '</div><b>' + esc(st.value) + '</b><div class="note">' + esc(st.note) + '</div></div>';
      }).join("");
    }
    var rates = el("server-rates");
    var pct = { lowhalf: 50, low: 28, mid: 60, high: 90 };
    if (rates) {
      rates.innerHTML = (s.rates || []).map(function (r) {
        var p = pct[r.v] || 40;
        return '<span class="rate-chip">' + esc(r.k) + ' <b>' + esc(r.v) + '</b><span class="rate-bar"><i style="width:' + p + '%"></i></span></span>';
      }).join("");
    }
  }

  /* -------- CLASSES -------- */
  var DIFF_WORDS = ["", "NOVICE", "EASY", "MODERATE", "HARD", "EXPERT"];
  function renderClasses() {
    var c = C.classes || {}, list = c.list || [];
    // Respect CLASS_COUNT from config (0 = show all)
    var count = (typeof c.count === "number" && c.count > 0) ? c.count : list.length;
    var displayList = list.slice(0, count);
    if (c.bg && el("classes-bg")) el("classes-bg").style.backgroundImage = "url('" + c.bg + "')";
    var tabs = el("class-tabs"), panel = el("class-panel");
    if (!tabs || !panel) return;
    tabs.innerHTML = displayList.map(function (n, i) {
      return '<button class="class-tab' + (i === 0 ? " is-active" : "") + '" data-i="' + i + '">' + esc(n.name) + '</button>';
    }).join("");
    function paint(i) {
      var n = displayList[i];
      var bars = [1, 2, 3, 4, 5].map(function (r) { return '<span class="' + (r <= (n.difficulty || 1) ? "on" : "") + '"></span>'; }).join("");
      panel.innerHTML =
        '<div class="class-art"><span class="badge">CLASS ' + String(i + 1).padStart(2, "0") + '</span>' +
        '<img src="' + (n.img || "assets/logo.png") + '" alt="' + esc(n.name) + '" loading="lazy">' +
        '<div class="role-tag"><span class="eyebrow">' + esc(n.role) + '</span></div></div>' +
        '<div class="class-detail"><h2 class="class-name">' + esc(n.name) + '</h2>' +
        '<div class="diff-block"><div class="diff-head">◇ DIFFICULTY USING THE CLASS</div><div class="diff-bars">' + bars + '</div>' +
        '<div class="diff-legend"><span>NOVICE</span><b>' + (DIFF_WORDS[n.difficulty || 1] || "MODERATE") + '</b><span>EXPERT</span></div></div>' +
        '<div class="info-card play"><h4>◇ PLAYSTYLE</h4><p>' + esc(n.playstyle) + '</p></div>' +
        '<div class="info-card adv"><h4>◇ PVP ADVANTAGE</h4><p>' + esc(n.pvpAdvantage) + '</p></div>' +
        '<div class="info-card dis"><h4>◇ PVP DISADVANTAGE</h4><p>' + esc(n.pvpDisadvantage) + '</p></div></div>';
      tabs.querySelectorAll(".class-tab").forEach(function (t) { t.classList.toggle("is-active", Number(t.dataset.i) === i); });
    }
    tabs.addEventListener("click", function (e) { var b = e.target.closest(".class-tab"); if (b) paint(Number(b.dataset.i)); });
    paint(0);
  }


  /* -------- COMBAT -------- */
  function renderCombat() {
    var c = C.combat || {};
    if (c.bg && el("combat-bg")) el("combat-bg").style.backgroundImage = "url('" + c.bg + "')";
    if (el("combat-intro")) el("combat-intro").textContent = c.intro || "";
    var live = el("combat-live");
    if (live) {
      var le = c.liveEvent || {};
      live.querySelector(".ev-title").textContent = le.title || "LIVE EVENT";
      live.querySelector(".ev-desc").textContent = le.desc || "";
      live.querySelector(".ev-sched").textContent = le.schedule || "";
    }
    
    // Respect MODE_COUNT from config (0 = show all)
    var modeCount = (typeof c.modeCount === "number" && c.modeCount > 0) ? c.modeCount : (c.modes ? c.modes.length : 0);
    var displayModes = (c.modes || []).slice(0, modeCount);
    
    var modes = el("combat-modes");
    if (modes) {
      modes.innerHTML = displayModes.map(function (m) {
        return '<div class="mode-card reveal">' + (m.hot ? '<span class="live">LIVE</span>' : '') +
          '<h3>' + esc(m.n) + '</h3><div class="meta">' + esc(m.t) + ' · ' + esc(m.cap) + '</div>' +
          '<div class="sched">' + esc(m.schedule) + '</div></div>';
      }).join("");
    }
    
    // PVE Preview toggle (raids)
    var showPVE = c.pvePreview !== false; // default true
    var raids = el("combat-raids");
    if (raids) {
      var prevHead = raids.previousElementSibling;
      if (!showPVE) {
        raids.style.display = "none";
        if (prevHead && prevHead.textContent && prevHead.textContent.indexOf("PvE") !== -1) {
          prevHead.style.display = "none";
        }
      } else {
        raids.style.display = "";
        if (prevHead && prevHead.textContent && prevHead.textContent.indexOf("PvE") !== -1) {
          prevHead.style.display = "";
        }
        raids.innerHTML = (c.raids || []).map(function (r) {
          return '<div class="raid reveal"><div><div class="tag">RAID</div><h4>' + esc(r.n) + '</h4></div><p>' + esc(r.t) + '</p><div class="limit">' + esc(r.limit) + '</div></div>';
        }).join("");
      }
    }
  }

  /* -------- WAR ALARM -------- */
  function wireWarAlarm() {
    var c = C.combat || {};
    var modes = c.modes || [];
    var alarmContainer = el("alarm-times");
    var alarmToast = el("alarm-toast");
    var alarmStatus = el("alarm-status");
    if (!alarmContainer) return;

    // Next War Feature
    var warCfg = C.war || {};
    var wPriority = warCfg.priority || [];
    var wToggle = warCfg.toggle || {};
    var wHours = warCfg.hours || {};
    var wLabels = warCfg.labels || {};
    var wDays = warCfg.days || {};
    var DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var DAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    function getNextWar(now) {
      if (!wPriority.length) return null;
      var curMs = now.getTime();
      
      for (var dayOffset = 0; dayOffset <= 7; dayOffset++) {
        var d = new Date(curMs + dayOffset * 86400000);
        var dayName = DAY_NAMES[d.getDay()];
        var isToday = (dayOffset === 0);
        
        for (var h = 0; h < 24; h++) {
          var targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
          var diffMs = targetDate.getTime() - curMs;

          // If war started within the last 15 minutes, consider it LIVE NOW
          if (diffMs > -15 * 60 * 1000 && diffMs <= 0) {
            var activeType = null;
            for (var p = 0; p < wPriority.length; p++) {
              var type = wPriority[p];
              if (!wToggle[type]) continue;
              var allowedDays = wDays[type] || [];
              if (allowedDays.length && allowedDays.indexOf(dayName) === -1) continue;
              var hoursList = wHours[type] || [];
              if (hoursList.indexOf(h) !== -1) {
                activeType = type;
                break;
              }
            }
            if (activeType) {
              return {
                type: activeType,
                label: wLabels[activeType] || activeType,
                date: targetDate,
                diffMs: diffMs,
                isLive: true,
                dayName: isToday ? "Today" : DAY_FULL[d.getDay()],
                hour: h
              };
            }
          }

          // Upcoming war
          if (diffMs > 0) {
            var activeType = null;
            for (var p = 0; p < wPriority.length; p++) {
              var type = wPriority[p];
              if (!wToggle[type]) continue;
              var allowedDays = wDays[type] || [];
              if (allowedDays.length && allowedDays.indexOf(dayName) === -1) continue;
              var hoursList = wHours[type] || [];
              if (hoursList.indexOf(h) !== -1) {
                activeType = type;
                break;
              }
            }
            if (activeType) {
              return {
                type: activeType,
                label: wLabels[activeType] || activeType,
                date: targetDate,
                diffMs: diffMs,
                isLive: false,
                dayName: isToday ? "Today" : DAY_FULL[d.getDay()],
                hour: h
              };
            }
          }
        }
      }
      return null;
    }

    var nextWarBar = el("next-war-bar");
    var nextWarName = el("next-war-name");
    var nextWarSched = el("next-war-sched");
    var nextWarTimer = el("next-war-timer");

    function updateNextWar() {
      if (!nextWarBar) return;
      var now = new Date();
      var nw = getNextWar(now);
      if (!nw) {
        nextWarBar.style.display = "none";
        return;
      }
      nextWarBar.style.display = "";
      if (nextWarName) nextWarName.textContent = nw.label;
      if (nextWarSched) {
        var h12 = nw.hour === 0 ? "12AM" : nw.hour < 12 ? nw.hour + "AM" : nw.hour === 12 ? "12PM" : (nw.hour - 12) + "PM";
        nextWarSched.textContent = (nw.isLive ? "Started " : "Starts ") + nw.dayName + " · " + h12;
      }
      if (nextWarTimer) {
        if (nw.isLive) {
          nextWarTimer.textContent = "LIVE NOW";
          nextWarTimer.classList.add("is-live");
        } else {
          nextWarTimer.classList.remove("is-live");
          var totalSec = Math.max(0, Math.floor(nw.diffMs / 1000));
          var hh = Math.floor(totalSec / 3600);
          var mm = Math.floor((totalSec % 3600) / 60);
          var ss = totalSec % 60;
          nextWarTimer.textContent =
            String(hh).padStart(2, "0") + ":" +
            String(mm).padStart(2, "0") + ":" +
            String(ss).padStart(2, "0");
        }
      }
    }

    updateNextWar();
    setInterval(updateNextWar, 1000);

    // Collect all unique alarm time slots from ALL modes (keyed by HH:MM)
    // Each slot tracks which mode names fire at that time
    var slotMap = {}; // { "13:00": { label:"1PM", modes:["TYRANNY WARS"] } }
    modes.forEach(function (m) {
      (m.alarmTimes || []).forEach(function (t) {
        var t24 = t.trim();
        if (!t24) return;
        if (!slotMap[t24]) {
          // Convert "13:00" → "1PM", "23:00" → "11PM" for display
          var parts = t24.split(":");
          var h = parseInt(parts[0], 10);
          var label = h === 0 ? "12AM" : h < 12 ? h + "AM" : h === 12 ? "12PM" : (h - 12) + "PM";
          slotMap[t24] = { label: label, modes: [] };
        }
        if (slotMap[t24].modes.indexOf(m.n) === -1) slotMap[t24].modes.push(m.n);
      });
    });

    var times = Object.keys(slotMap).sort(); // sorted by 24h time
    if (!times.length) {
      if (!getNextWar(new Date())) el("combat-alarm") && (el("combat-alarm").style.display = "none");
      return;
    }

    // Load saved state from localStorage
    var STORE_KEY = "ep9-war-alarms";
    var enabled = {};
    try { enabled = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (e) { enabled = {}; }
    function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(enabled)); } catch (e) {} }

    // Render time-slot toggle buttons grouped by mode
    // Build HTML: one button per unique time slot
    function renderButtons() {
      alarmContainer.innerHTML = times.map(function (t24) {
        var slot = slotMap[t24];
        var on = !!enabled[t24];
        var modeTag = slot.modes.map(function (mn) {
          // Shorten mode name for the tooltip
          return mn.split(" ")[0];
        }).join(", ");
        return '<button class="alarm-btn' + (on ? " is-on" : "") + '" data-time="' + t24 + '" title="' + esc(slot.modes.join(", ")) + '">' +
          '<span class="alarm-btn-time">' + esc(slot.label) + '</span>' +
          '<span class="alarm-btn-mode">' + esc(modeTag) + '</span>' +
          (on ? '<span class="alarm-btn-dot"></span>' : '') +
          '</button>';
      }).join("");

      // Bind clicks
      alarmContainer.querySelectorAll(".alarm-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var t = btn.dataset.time;
          enabled[t] = !enabled[t];
          save();
          renderButtons();
          updateStatus();
          // Request notification permission on first enable
          if (enabled[t] && typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission();
          }
        });
      });
    }

    function updateStatus() {
      if (!alarmStatus) return;
      var count = times.filter(function (t) { return !!enabled[t]; }).length;
      if (count === 0) {
        alarmStatus.textContent = "";
        alarmStatus.className = "alarm-status";
      } else {
        alarmStatus.textContent = count + (count === 1 ? " alarm set" : " alarms set");
        alarmStatus.className = "alarm-status is-active";
      }
    }

    // Beep using Web Audio API
    function playBeep() {
      try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "square";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.30);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      } catch (e) {}
    }

    // Show toast notification on page
    function showToast(msg) {
      if (!alarmToast) return;
      alarmToast.textContent = msg;
      alarmToast.classList.add("is-visible");
      clearTimeout(alarmToast._timer);
      alarmToast._timer = setTimeout(function () {
        alarmToast.classList.remove("is-visible");
      }, 7000);
    }

    // Track which times we already fired today so we don't repeat
    var firedToday = {};

    function checkAlarms() {
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, "0");
      var mm = String(now.getMinutes()).padStart(2, "0");
      var cur = hh + ":" + mm;
      var today = now.toDateString();

      // Reset fired log on new day
      if (firedToday._day !== today) firedToday = { _day: today };

      times.forEach(function (t24) {
        if (!enabled[t24]) return;
        if (firedToday[t24]) return;
        if (cur === t24) {
          firedToday[t24] = true;
          var slot = slotMap[t24];
          var modeNames = slot.modes.join(" & ");
          var msg = "⚔ WAR STARTS NOW! " + modeNames + " — " + slot.label;
          playBeep();
          showToast(msg);
          // Browser notification
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification("⚔ EP9 WAR ALARM", {
                body: modeNames + " is starting now!",
                icon: (C.site && C.site.favicon) ? C.site.favicon : "assets/logo.png",
                tag: "ep9-war-" + t24
              });
            } catch (e) {}
          }
        }
      });
    }

    renderButtons();
    updateStatus();

    // Check every 30 seconds
    checkAlarms(); // immediate check on load
    setInterval(checkAlarms, 30000);
  }

  /* -------- ROADMAP -------- */
  function renderRoadmap() {
    var r = C.roadmap || {};
    if (r.bg && el("roadmap-bg")) el("roadmap-bg").style.backgroundImage = "url('" + r.bg + "')";
    if (el("roadmap-intro")) el("roadmap-intro").textContent = r.intro || "";
    var grid = el("roadmap-grid"); if (!grid) return;
    var phases = r.items || [];
    if (!phases.length) return;

    // Static progress index defined by config (dot is locked here permanently)
    var lockedProgressIdx = Math.max(0, Math.min((Number(r.progress) || 1) - 1, phases.length - 1));

    grid.innerHTML = '<div class="road-line"><i id="road-line-fill"></i></div>' +
      phases.map(function (p, i) {
        var isDone = (i < lockedProgressIdx);
        var ip = (i === lockedProgressIdx);
        var rawSt = (p.status || "IN PROGRESS").toUpperCase();
        var st = isDone ? "DONE" : rawSt;
        var statusClass = (st === "DONE") ? "d" : ((st === "TBA") ? "tba" : "ip");
        var statusText = isDone ? "DONE" : (p.status || "IN PROGRESS");
        var classes = ["road-phase"];
        if (ip) classes.push("is-current");
        if (isDone) classes.push("is-done");

        return '<div class="' + classes.join(" ") + '" data-idx="' + i + '"><span class="dot"></span>' +
          '<div class="ph">PHASE ' + String(i + 1).padStart(2, "0") + '</div><h3>' + esc(p.title) + '</h3>' +
          '<span class="status ' + statusClass + '">' + esc(statusText) + '</span>' +
          '<ul>' + (p.points || []).map(function (it) { return '<li>' + esc(it) + '</li>'; }).join("") + '</ul></div>';
      }).join("");

    var prevBtn = el("road-prev");
    var nextBtn = el("road-next");

    var N = phases.length;
    var viewportStartIdx = 0;

    // Initial positioning: center the active locked progress phase if N > 5
    if (N > 5) {
      viewportStartIdx = Math.max(0, Math.min(lockedProgressIdx - 2, N - 5));
    }

    function update() {
      if (N === 0) return;

      // If 3 items or fewer, slider does not slide
      var isStatic = (N <= 3);
      var maxStartIdx = isStatic ? 0 : Math.max(0, N - 5);

      if (isStatic) {
        viewportStartIdx = 0;
      } else {
        viewportStartIdx = Math.max(0, Math.min(viewportStartIdx, maxStartIdx));
      }

      var centerIdx = isStatic ? Math.floor(N / 2) : Math.min(viewportStartIdx + 2, N - 1);

      var phaseEls = grid.querySelectorAll(".road-phase");
      phaseEls.forEach(function (card, i) {
        card.classList.toggle("is-center", i === centerIdx);
        card.classList.toggle("is-current", i === lockedProgressIdx);
        card.classList.toggle("is-done", i < lockedProgressIdx);
      });

      if (prevBtn) prevBtn.disabled = isStatic || (viewportStartIdx <= 0);
      if (nextBtn) nextBtn.disabled = isStatic || (viewportStartIdx >= maxStartIdx);

      var viewport = el("road-viewport");
      if (viewport) {
        var vWidth = viewport.clientWidth;
        var style = window.getComputedStyle(grid);
        var gap = parseFloat(style.gap || style.gridGap) || 16;
        var visibleCount = isStatic ? N : 5;
        var itemWidth = (vWidth - ((visibleCount - 1) * gap)) / visibleCount;
        var step = itemWidth + gap;

        phaseEls.forEach(function (card) {
          card.style.flex = "0 0 " + itemWidth + "px";
          card.style.width = itemWidth + "px";
        });

        var lineEl = grid.querySelector(".road-line");
        if (lineEl) {
          var lineLeft = itemWidth / 2;
          var lineLineWidth = Math.max(0, (N - 1) * step);
          lineEl.style.left = lineLeft + "px";
          lineEl.style.width = lineLineWidth + "px";
          lineEl.style.right = "auto";
        }

        var fillEl = el("road-line-fill");
        if (fillEl) {
          var pct = (N > 1) ? (lockedProgressIdx / (N - 1)) * 100 : 100;
          fillEl.style.width = pct + "%";
        }

        var shiftX = isStatic ? 0 : viewportStartIdx * step;
        grid.style.transform = "translateX(-" + shiftX + "px)";
      }
    }

    if (prevBtn) {
      prevBtn.onclick = function () {
        if (N > 3 && viewportStartIdx > 0) {
          viewportStartIdx--;
          update();
        }
      };
    }
    if (nextBtn) {
      nextBtn.onclick = function () {
        var maxStartIdx = Math.max(0, N - 5);
        if (N > 3 && viewportStartIdx < maxStartIdx) {
          viewportStartIdx++;
          update();
        }
      };
    }

    grid.onclick = function (e) {
      var card = e.target.closest(".road-phase");
      if (card && card.dataset.idx !== undefined) {
        var idx = Number(card.dataset.idx);
        if (!isNaN(idx) && idx >= 0 && idx < phases.length && N > 3) {
          var maxStartIdx = Math.max(0, N - 5);
          viewportStartIdx = Math.max(0, Math.min(idx - 2, maxStartIdx));
          update();
        }
      }
    };

    window.addEventListener("resize", update);
    update();
  }

  /* -------- NEWS -------- */
  // Fetch an announcement/event .txt snippet and return a one-line preview
  // (old NewsRow behaviour: show the first sentence as the row excerpt).
  function loadTxt(name, cb) {
    if (!name) return cb(null);
    var url = name.indexOf("/") !== -1 ? name : "assets/content/" + name;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () { if (xhr.readyState === 4) cb(xhr.status === 200 ? xhr.responseText : null); };
    xhr.onerror = function () { cb(null); };
    xhr.send();
  }
  function previewFromTxt(txt) {
    if (!txt) return "";
    var first = String(txt).split(/\n|\.|\u2014|\u2013/)[0];
    return first ? first.trim().replace(/^[-–—\s]+/, "").slice(0, 120) : "";
  }
  /* -------- NEWS → PREVIEW ON MAIN PAGE, FULL LIST ON news.html --------
   * On the Main Page the News section is a PREVIEW: at most 4 items per tab
   * (Announcement / Event). When a tab has 5+ items a "View all content" link
   * appears that routes to the standalone news.html page (filtered by kind).
   * Clicking any row / "Read more" also navigates to news.html?kind=&i= so the
   * article opens on its own page — nothing reads inline on the Main Page.
   * The standalone news.html page shows the FULL list (itemsPerPage, default 10)
   * with < Previous / Next > pagination. */
  function renderNews() {
    var n = C.news || {};
    if (n.enabled === false) {
      if (el("news")) el("news").style.display = "none";
      document.querySelectorAll('.nav-links a[href="news.html"], .nav-links a[href="#news"]').forEach(function (a) {
        a.style.display = "none";
      });
      return;
    }
    if (n.bg && el("news-bg")) el("news-bg").style.backgroundImage = "url('" + n.bg + "')";
    if (el("news-title")) el("news-title").textContent = (n.title || "THE LATEST").replace(/\.$/, "");
    if (el("news-accent")) el("news-accent").textContent = n.accent || "";
    if (el("news-intro")) el("news-intro").textContent = n.intro || "";
    var tabs = el("news-tabs"), tbody = el("news-tbody");
    if (!tbody || !tabs) return;
    // Build the category filter (ALL | NEWS | ANNOUNCEMENT | GUIDE) from config,
    // using bossran latest.html's EXACT tab markup: <a href> + <i> underline.
    var filterDefs = (C.newsFilter && C.newsFilter.length) ? C.newsFilter :
      [{ key: "all", label: "All" }, { key: "news", label: "News" }, { key: "announcement", label: "Announcement" }, { key: "guide", label: "Guide" }];
    tabs.innerHTML = filterDefs.map(function (f, i) {
      var href = (f.key === "all") ? "news.html" : "news.html#cat=" + esc(f.key);
      return '<a href="' + href + '" class="' + (i === 0 ? "on" : "") + '" data-filter="' + esc(f.key) + '">' + esc(f.label) + '<i></i></a>';
    }).join("");
    var cfg = C.newsConfig || {};
    // The Main Page is a capped preview; the standalone news.html paginates fully.
    var mainPage = !el("news-pagination");
    var perPage = mainPage ? (Number(n.homeLimit) || 4) : (Number(cfg.itemsPerPage) || 10);
    // Bossran-style single feed + category filter (ALL / NEWS / ANNOUNCEMENT / GUIDE).
    // Source is the SHARED live loader (window.NewsData): it fetches the published
    // Google Sheet CSV in the browser, falling back to baked data/news.json.
    var ND = window.NewsData;
    var items = [];
    // Keep a starting reference (baked items render instantly, then the live
    // loader re-renders when/if it resolves). ND drives the canonical list.
    if (n.items && n.items.length) items = n.items.slice();
    else items = (n.announcement || []).concat(n.event || []).map(function (it) {
      return { id: it.id || it.slug || it.uid, cat: (it.type || it.cat || "NEWS").toUpperCase(),
        title: it.title || "", date: it.date || "", description: it.description || "", image: it.image || "", text: it.text || "" };
    });
    var previewCache = {};
    var pageState = { filter: "all", page: 0 };
    // Build one row as a real <a> so it navigates to the standalone news.html
    // reader via the hash route news.html#id=<CSV_ID> (no per-article HTML files,
    // no modal / inline expand).
    function rowHtml(item, idx) {
      var cat = (item.cat || item.type || "NEWS").toUpperCase();
      var catClass = "cat-" + cat.toLowerCase();
      var date = ((cfg.showDate === false) || !item.date) ? "" : esc(item.date);
      // Per-article link: routes into the standalone reader via hash id.
      var articleId = item.id || item.slug || item.uid || ("news-" + idx);
      var href = "news.html#id=" + encodeURIComponent(String(articleId));
      var title = esc(item.title || "");
      // Excerpt/description for the list preview; full body (.text) lives on
      // the article page. Description is the short field, content is the long.
      var excerpt = item.description || item.desc || "";
      if (cfg && cfg.showExcerpt === false) excerpt = "";
      // On the standalone news.html page we emit bossran latest.html's EXACT
      // markup — <li><a class="news-row"><i class="row-cat"> + direct children
      // .time + .title (NO wrapper <p class="lside">, NO gray .comment excerpt —
      // per user request). Each row is a real link into the standalone reader.
      if (!mainPage) {
        return '<li><a class="news-row" href="' + href + '" id="news-row-' + esc(String(articleId)) + '">' +
          '<i class="row-cat ' + catClass + '">' + esc(cat) + '</i>' +
          (date ? '<span class="time row-date">' + date + '</span>' : '') +
          '<span class="title row-title">' + title + '</span>' +
          (excerpt ? '<span class="desc row-desc">' + esc(excerpt) + '</span>' : '') +
          '<span class="go row-go">READ →</span>' +
        '</a></li>';
      }
      // Main Page preview: a compact dark card (unchanged — its own style.css skin).
      return '<a class="news-row reveal" href="' + href + '" id="news-row-' + esc(String(articleId)) + '">' +
        '<div class="row-head">' +
          '<span class="row-cat ' + catClass + '">' + esc(cat) + '</span>' +
          (date ? '<span class="row-date">' + date + '</span>' : '') +
        '</div>' +
        '<div class="row-main">' +
          '<span class="row-title">' + title + '</span>' +
          (excerpt ? '<span class="row-exc">' + esc(excerpt) + '</span>' : '') +
          '<span class="row-go">READ →</span>' +
        '</div>' +
      '</a>';
    }
    // Re-render the list for a given filter + page.
    window.renderNewsToPage = function (filter, page) {
      pageState.filter = filter || "all";
      pageState.page = page || 0;
      var list = items.filter(function (it) {
        if (pageState.filter === "all") return true;
        if (pageState.filter === "news") return (it.cat === "NEWS") || (it.type === "NEWS");
        if (pageState.filter === "announcement") return (it.cat === "ANNOUNCEMENT") || (it.type === "ANNOUNCEMENT");
        if (pageState.filter === "guide") return (it.cat === "GUIDE") || (it.type === "GUIDE");
        return true;
      });
      var totalPages = Math.max(1, Math.ceil(list.length / perPage));
      if (pageState.page >= totalPages) pageState.page = totalPages - 1;
      if (pageState.page < 0) pageState.page = 0;
      tabs.querySelectorAll("a").forEach(function (b) { b.classList.toggle("on", (b.dataset.filter || "all") === pageState.filter); });
      var start = pageState.page * perPage;
      var pageItems = list.slice(start, start + perPage);
      tbody.innerHTML = pageItems.length
        ? pageItems.map(function (item, i) { return rowHtml(item, start + i); }).join("")
        : '<div class="news-empty">No articles in this category yet.</div>';
      // "View all content" footer (Main Page only): routes to the standalone list.
      var viewAll = el("news-view-all");
      if (viewAll) {
        if (mainPage && items.length > perPage) {
          viewAll.innerHTML = '<a class="view-all-link" href="news.html">VIEW ALL CONTENT →</a>';
        } else {
          viewAll.innerHTML = "";
        }
      }
      // Pagination controls (standalone news.html only; config-driven).
      var pag = el("news-pagination");
      if (pag) {
        if (cfg.pagination === false || totalPages <= 1) { pag.innerHTML = ""; }
        else {
          var prev = (pageState.page === 0) ? "disabled" : "";
          var next = (pageState.page >= totalPages - 1) ? "disabled" : "";
          var prevLabel = cfg.previousLabel || "Previous";
          var nextLabel = cfg.nextLabel || "Next";
          pag.innerHTML =
            '<button class="page-btn" data-act="prev" ' + prev + '>‹ ' + esc(prevLabel) + '</button>' +
            '<span class="page-status">PAGE ' + (pageState.page + 1) + ' / ' + totalPages + '</span>' +
            '<button class="page-btn" data-act="next" ' + next + '>' + esc(nextLabel) + ' ›</button>';
        }
      }
      observeReveals();
    };
    // Pre-load preview snippets from each item's .txt context (preview only).
    if (mainPage && items.length <= perPage) {
      items.forEach(function (item, i) {
        if (item.context) loadTxt(item.context, function (txt) { previewCache[i] = previewFromTxt(txt); window.renderNewsToPage(pageState.filter, pageState.page); });
      });
    }
    // Tabs are bossran-style <a> links. Clicking filters in place (no navigation),
    // so we preventDefault to stop the href hash from reaching the article router.
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("a");
      if (!b || !tabs.contains(b)) return;
      e.preventDefault();
      window.renderNewsToPage(b.dataset.filter, 0);
    });

    // ---- LIVE News from the SHARED Google Sheet loader ----
    // window.NewsData fetches the published CSV directly in the browser (CORS `*`)
    // and falls back to baked data/news.json on failure. When it resolves we
    // rebuild `items` (the canonical list both pages share) and re-render.
    if (ND && typeof ND.load === "function") {
      ND.load().then(function (live) {
        if (!live || !live.length) return;
        items.length = 0;
        live.forEach(function (it) { items.push(it); });
        // Rebuild the category filter chips to match the live categories, using
        // bossran latest.html's EXACT tab markup: <a href> links with an <i>
        // underline element (active state = `on`, not a <button>). Clicking a tab
        // sets pageState.filter via the existing delegation handler (no nav).
        var hidden = (C.newsConfig && C.newsConfig.hiddenCategories) || (C.news && C.news.hiddenCategories) || [];
        var defs = ND.filters(hidden);
        if (tabs) {
          tabs.innerHTML = defs.map(function (f, i) {
            var href = (f.key === "all") ? "news.html" : "news.html#cat=" + esc(f.key);
            return '<a href="' + href + '" class="' + (i === 0 ? "on" : "") + '" data-filter="' + esc(f.key) + '">' + esc(f.label) + '<i></i></a>';
          }).join("");
        }
        window.renderNewsToPage(pageState.filter, pageState.page);
      }).catch(function () { /* keep baked items already rendered */ });
    }

    // ---- Article View Handler ----
    // NOTE: the actual hash-route article reader lives inline at the bottom
    // of news.html. It uses the shared live loader (window.NewsData.getById) +
    // fillArticle() to render the article body from the Google Sheet CSV.
    // That reader is the source of truth for news.html#id=<CSV_ID> deep links.
    // (Dead duplicate reader that looked up <div id=...> removed; news.html
    // handles all hash routing.)
    var pag = el("news-pagination");

    if (pag) pag.addEventListener("click", function (e) {
      var b = e.target.closest(".page-btn"); if (!b || b.disabled) return;
      var p = pageState.page + (b.dataset.act === "next" ? 1 : -1);
      window.renderNewsToPage(pageState.filter, p);
    });

    // Deep-link support: ?filter= headlines the requested category.
    var qp = new URLSearchParams(window.location.search);
    var startFilter = qp.get("filter") || "all";
    window.renderNewsToPage(startFilter, 0);
  }

  /* -------- DOWNLOAD (real mirror URLs) -------- */
  function renderDownload() {
    var d = C.download || {};
    if (d.bg && el("download-bg")) el("download-bg").style.backgroundImage = "url('" + d.bg + "')";
    if (el("download-title")) el("download-title").textContent = (d.title || "GET IN THE").replace(/\.$/, "");
    if (el("download-accent")) el("download-accent").textContent = d.accent || "";
    if (el("download-intro")) el("download-intro").textContent = d.intro || "";
    var grid = el("download-grid"); if (!grid) return;
    function group(title, icon, items) {
      if (!items || !items.length) return "";
      return '<div class="dl-group reveal"><h3><span class="ic">' + icon + '</span>' + esc(title) + '</h3>' +
        items.map(function (it) {
          return '<div class="dl-item"><div class="meta"><b>' + esc(it.label) + '</b><span>' + esc(it.note || "") + '</span></div>' +
            '<a href="' + toAbs(it.url) + '" target="_blank" rel="noopener">DOWNLOAD</a></div>';
        }).join("") + '</div>';
    }
    // Start with offline fallback (config-driven or bundled mirrors)
    // so the page is instant on any static host.
    var flat = (d.mirrors && d.mirrors.length) ? d.mirrors : null;
    function paint(mirrors) {
      var flat2 = (mirrors && mirrors.length) ? mirrors : null;
      if (flat2) {
        var gd = flat2.filter(function (m) { return (m.provider === "googledrive") || /drive\.google\.com/i.test(m.url || ""); });
        var mf = flat2.filter(function (m) { return (m.provider === "mediafire") || /mediafire\.com/i.test(m.url || ""); });
        var other = flat2.filter(function (m) { return gd.indexOf(m) === -1 && mf.indexOf(m) === -1; });
        var known = (gd.length ? group("Google Drive", "G", gd) : "") +
                    (mf.length ? group("MediaFire", "M", mf) : "") +
                    (other.length ? group("Other Mirrors", "↓", other) : "");
        grid.innerHTML = known || group("Download", "↓", flat2);
      } else {
        grid.innerHTML = group("Google Drive", "G", MIRRORS.googleDrive) + group("MediaFire", "M", MIRRORS.mediafire);
      }
      observeReveals();
    }
    // Paint baked fallback immediately
    paint(flat);
    var notes = el("download-notes");
    if (notes) notes.innerHTML = "<span>Full clients include all EP9 content</span><span>Run the launcher as administrator</span><span>Pick the mirror closest to your region</span>";

    // LIVE sync from the published Google Sheet (runtime fetch — no rebuild
    // needed when staff add rows).
    fetchLiveDownloads();
    function fetchLiveDownloads() {
      var sheets = (d.sheets || []).filter(function (sh) { return sh && sh.url; });
      if (!sheets.length) return;
      sheets.forEach(function (sh) {
        var ctrl = (window.AbortController && new AbortController()) || null;
        var timer = setTimeout(function () { if (ctrl && ctrl.abort) ctrl.abort(); }, 20000);
        fetch(toCsvUrl(sh.url), ctrl ? { signal: ctrl.signal } : undefined)
          .then(function (res) { clearTimeout(timer); if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
          .then(function (csv) {
            var rows = parseCsv(csv).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
            if (rows.length < 2) return;
            var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
            var live = [];
            for (var r = 1; r < rows.length; r++) {
              var cells = rows[r], row = {}, label = "", url = "", note = "";
              for (var c = 0; c < header.length; c++) {
                var key = header[c], val = (cells[c] || "").trim();
                if (key === "provider") {
                  // Map provider to icon group
                  if (/googledrive/i.test(val)) row.provider = "googledrive";
                  else if (/mediafire/i.test(val)) row.provider = "mediafire";
                  else row.provider = val.toLowerCase();
                } else if (key === "linkname") {
                  label = val;
                } else if (key === "link") {
                  url = val;
                } else if (key === "group") {
                  // group number for ordering, ignore for display
                  row.group = val;
                }
              }
              if (!label) label = row.provider || "Download";
              if (!url) continue;
              row.label = label;
              row.url = url;
              row.note = note;
              live.push(row);
            }
            // Replace baked mirrors with live ones
            paint(live);
          })
          .catch(function (err) {
            console.warn("[download] live fetch failed: " + (err && err.message ? err.message : err));
          });
      });
    }
  }

  /* -------- COMMUNITY -------- */
  function renderCommunity() {
    var c = C.community || {};
    if (c.enabled === false) {
      if (el("community")) el("community").style.display = "none";
      document.querySelectorAll('.nav-links a[href="#community"]').forEach(function (a) {
        a.style.display = "none";
      });
      return;
    }
    if (c.bg && el("community-bg")) el("community-bg").style.backgroundImage = "url('" + c.bg + "')";
    if (el("community-title")) el("community-title").textContent = (c.title || "JOIN THE").replace(/\.$/, "");
    if (el("community-accent")) el("community-accent").textContent = c.accent || "";
    if (el("community-desc")) el("community-desc").textContent = c.desc || "";
    var acts = el("community-actions");
    if (acts) {
      acts.innerHTML =
        '<a class="btn" href="' + toAbs(c.discordUrl) + '" target="_blank" rel="noopener">DISCORD</a>' +
        '<a class="btn btn--ghost" href="' + toAbs(c.facebookUrl) + '" target="_blank" rel="noopener">FACEBOOK</a>' +
        '<a class="btn btn--ghost" href="' + toAbs(c.facebookGroupUrl) + '" target="_blank" rel="noopener">FB GROUP</a>';
    }
    var stats = el("community-stats");
    if (stats) stats.innerHTML = (c.stats || []).map(function (s) { return '<div><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join("");
    // The right-hand community-art panel now hosts the live Discord widget (iframe),
    // so we must NOT overwrite it with the static "JOIN THE LEGEND." glyph.
  }


  /* -------- SERVICES (CSV-driven, section-specific card style) -------- */
  function renderServices() {
    var s = C.services || {};
    if (s.enabled === false) {
      if (el("services")) el("services").style.display = "none";
      document.querySelectorAll('.nav-links a[href="#services"]').forEach(function (a) {
        a.style.display = "none";
      });
      return;
    }
    if (s.bg && el("services-bg")) el("services-bg").style.backgroundImage = "url('" + s.bg + "')";
    if (el("services-title")) el("services-title").textContent = (s.title || "OUR").replace(/\.$/, "");
    if (el("services-accent")) el("services-accent").textContent = s.accent || "";
    if (el("services-intro")) el("services-intro").textContent = s.intro || "";
    var apply = s.apply || {};
    var tabs = el("svc-tabs"), grid = el("svc-grid"); if (!grid) return;

    // `items` starts as the OFFLINE FALLBACK baked into generated.js (local
    // *.csv / Service_x). The live Google Sheet fetch below REPLACES each
    // section's data with the published rows when it succeeds, so the team can
    // add/remove rows without a rebuild.
    var items = (s.items || []).slice();
    // Apply visibility toggles: 0 = hide, 1 = show (default show)
    var vis = s.visibility || {};
    items = items.filter(function (it) {
      var sec = it.section || '';
      var v = vis[sec];
      if (v === '0') return false;
      return true;
    });
    var currentSec = "all";

    // Section-specific Service card layout:
    //   Pilot     -> [Name] [IGN/Pilot] [note] Fee: 50/hr [Social]
    //   Middleman -> [Name] [IGN] [note] Fee: 3% [Social]
    //   Streamer  -> [Platform] Code: EP9boi [Visit]
    function serviceCardHTML(it) {
      var link = it.social || it.url || "";
      var verified = String(it.ykc || "").trim() === "1";
      var sub = "", note = "", feeHTML = "", cta = "";
      if (it.section === "Pilots") {
        sub = it.ign || it.role || "Pilot";
        note = it.saying || "Pilot service available.";
        feeHTML = '<div class="svc-fee">Fee: ' + esc(it.fee || "-") + esc(it.rateperh || "") + '</div>';
        cta = link ? '<a class="act" href="' + toAbs(link) + '" target="_blank" rel="noopener">' + esc(it.cta || "SOCIAL") + '</a>' : "";
      } else if (it.section === "Middleman") {
        sub = it.ign || "Middleman";
        note = it.saying || "Middleman service available.";
        feeHTML = '<div class="svc-fee">Fee: ' + esc(it.fee || "-") + '</div>';
        cta = link ? '<a class="act" href="' + toAbs(link) + '" target="_blank" rel="noopener">' + esc(it.cta || "SOCIAL") + '</a>' : "";
      } else if (it.section === "Streamer") {
        sub = it.socialtype || it.code || "Stream";
        feeHTML = it.streamkey ? '<div class="svc-code">Code <b>' + esc(it.streamkey) + '</b></div>' : "";
        cta = link ? '<a class="act" href="' + toAbs(link) + '" target="_blank" rel="noopener">VISIT</a>' : "";
      } else {
        sub = it.ign || it.role || it.code || "";
        note = it.saying || "";
        feeHTML = it.fee ? '<div class="svc-fee">Fee: ' + esc(it.fee) + esc(it.rateperh || "") + '</div>' : "";
        cta = link ? '<a class="act" href="' + toAbs(link) + '" target="_blank" rel="noopener">' + esc(it.cta || "CONTACT") + '</a>' : "";
      }

      // Build profile image for Streamer section
      var profileImgHTML = "";
      if (it.section === "Streamer") {
        // Check for image URL from Google Sheets (various possible column names)
        var imgUrl = it.imageurl || it.gameurl || it.imgurl || it["game url"] || it["image url"] || "";
        if (imgUrl && imgUrl.trim() !== "") {
          // Use actual image from Google Sheets
          profileImgHTML = '<div class="svc-avatar"><img src="' + esc(imgUrl) + '" alt="' + esc(it.name || "") + '" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';"></div>';
        }
        // Fallback avatar with first letter of first name
        var firstName = (it.name || "").trim().split(/\s+/)[0] || "";
        var initial = firstName ? firstName.charAt(0).toUpperCase() : "?";
        profileImgHTML += '<div class="svc-avatar fallback" style="display:' + (imgUrl && imgUrl.trim() !== "" ? "none" : "flex") + ';">' + esc(initial) + '</div>';
      }

      return '<div class="svc-card reveal"><div class="top">' +
        profileImgHTML +
        '<div class="nm">' + esc(it.name || "") +
        (verified ? '<span class="verified" title="Verified by admin">✓</span>' : "") + '</div>' +
        '</div>' +
        '<div class="meta">' +
          (sub ? '<div class="svc-sub">' + esc(sub) + '</div>' : "") +
          (note ? '<div class="svc-note">' + esc(note) + '</div>' : "") +
          feeHTML +
        '</div>' + cta + '</div>';
    }
    function sectionsFrom(list) {
      var sections = [], counts = {};
      list.forEach(function (it) {
        var sec = it.section || "Services";
        // Exclude ApplyLinks from tabs - it's a data source for apply links, not a service section
        if (sec === "ApplyLinks") return;
        if (sections.indexOf(sec) === -1) sections.push(sec);
        counts[sec] = (counts[sec] || 0) + 1;
      });
      return { sections: sections, counts: counts };
    }
    function paint(sec) {
      currentSec = sec;
      // Update active tab state (fix: services filter active state not updating)
      tabs.querySelectorAll(".svc-tab").forEach(function(t) {
        t.classList.toggle("is-active", t.dataset.sec === sec);
      });
      // When "all" is selected, show all items without an apply card
      var applyUrl = (sec === "all") ? null : apply[sec];
      var filteredItems = (sec === "all") ? items : items.filter(function (it) { return it.section === sec; });
      // The Apply card always goes FIRST (never mid-grid or last) so visitors
      // see how to join the role immediately.
      grid.innerHTML = (applyUrl ? '<a class="svc-apply reveal" href="' + toAbs(applyUrl) + '" target="_blank" rel="noopener">+ APPLY FOR ' + esc(sec.toUpperCase()) + '</a>' : '') +
        filteredItems.map(serviceCardHTML).join("");
      observeReveals();
    }
    function rebuild() {
      var sc = sectionsFrom(items);
      if (!sc.sections.length) return;
      // Default to first section if currentSec is not valid
      if (sc.sections.indexOf(currentSec) === -1) currentSec = sc.sections[0];
      
      // Build tabs: each section only (no ALL tab)
      var tabDefs = [];
      sc.sections.forEach(function (sec) {
        tabDefs.push({ key: sec, label: sec, count: sc.counts[sec] || 0 });
      });
      
      // Tab label includes a live count of people in that role, e.g. "PILOTS (3)".
      tabs.innerHTML = tabDefs.map(function (tab, i) {
        return '<button class="svc-tab' + (tab.key === currentSec ? " is-active" : "") + '" data-sec="' + esc(tab.key) + '">' + esc(tab.label) + ' (' + (tab.count || 0) + ')</button>';
      }).join("");
      paint(currentSec);
    }
    tabs.addEventListener("click", function (e) { var b = e.target.closest(".svc-tab"); if (b) paint(b.dataset.sec); });

    // Paint the baked fallback immediately (instant, works on any static host).
    rebuild();

    // LIVE sync from the published Google Sheet (runtime fetch — no rebuild
    // needed when staff add rows). Each [SERVICES] Sheet_* URL maps to a section.
    fetchLiveServices();

    function fetchLiveServices() {
      var sheets = (s.sheets || []).filter(function (sh) { return sh && sh.url && sh.section !== 'ApplyLinks'; });
      if (!sheets.length) return;
      sheets.forEach(function (sh) {
        var ctrl = (window.AbortController && new AbortController()) || null;
        var timer = setTimeout(function () { if (ctrl && ctrl.abort) ctrl.abort(); }, 20000);
        fetch(toCsvUrl(sh.url), ctrl ? { signal: ctrl.signal } : undefined)
          .then(function (res) { clearTimeout(timer); if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
          .then(function (csv) {
            var rows = parseCsv(csv).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
            if (rows.length < 2) return;
            var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
            var live = [];
            for (var r = 1; r < rows.length; r++) {
              var cells = rows[r], row = { section: sh.section }, name = "";
              for (var c = 0; c < header.length; c++) {
                var key = header[c], val = (cells[c] || "").trim();
                if (key === "name") name = val; else row[key] = val;
              }
              if (!name) continue;
              row.name = name;
              // Column aliases so the sheet's natural names map onto render fields.
              // Google Sheet uses 'streamer' column for the code (local CSV uses 'streamkey')
              if (row.streamer != null && row.streamkey == null) row.streamkey = row.streamer;
              if (row.social != null && row.url == null) row.url = row.social;
              // Map ImageURL / Game URL columns for Streamer profile images
              if (row.imageurl != null && row.imgurl == null) row.imgurl = row.imageurl;
              if (row.gameurl != null && row.imgurl == null) row.imgurl = row.gameurl;
              if (row["image url"] != null && row.imgurl == null) row.imgurl = row["image url"];
              if (row["game url"] != null && row.imgurl == null) row.imgurl = row["game url"];
              live.push(row);
            }
            // Replace just this section's baked rows with the live ones.
            items = items.filter(function (it) { return it.section !== sh.section; }).concat(live);
            // Re-apply visibility filter after live update
            var vis = s.visibility || {};
            items = items.filter(function (it) {
              var v = vis[it.section || ''];
              if (v === '0') return false;
              return true;
            });
            rebuild();
          })
          .catch(function (err) {
            console.warn("[services] live fetch failed for " + sh.section + ": " + (err && err.message ? err.message : err));
          });
      });
    }

    // LIVE sync for Apply Links from Google Sheets
    // Reads a sheet with columns: name (pilot_link|mm_link|streamer_link), link (URL)
    // Updates the apply object dynamically so Apply buttons get the latest URLs
    function fetchApplyLinks() {
      var sheets = (s.sheets || []).filter(function (sh) { return sh && sh.url && sh.section === 'ApplyLinks'; });
      if (!sheets.length) {
        console.log("[ApplyLinks] No ApplyLinks sheet configured");
        return;
      }
      console.log("[ApplyLinks] Loading Google Sheets...");
      sheets.forEach(function (sh) {
        var ctrl = (window.AbortController && new AbortController()) || null;
        var timer = setTimeout(function () { if (ctrl && ctrl.abort) ctrl.abort(); }, 20000);
        fetch(toCsvUrl(sh.url), ctrl ? { signal: ctrl.signal } : undefined)
          .then(function (res) { clearTimeout(timer); if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
          .then(function (csv) {
            var rows = parseCsv(csv).filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
            if (rows.length < 2) return;
            var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
            var nameIdx = header.indexOf("name");
            var linkIdx = header.indexOf("link");
            if (nameIdx === -1 || linkIdx === -1) {
              console.warn("[ApplyLinks] Required columns 'name' and 'link' not found. Headers:", header);
              return;
            }
            var applyMap = {};
            for (var r = 1; r < rows.length; r++) {
              var cells = rows[r];
              var name = (cells[nameIdx] || "").trim();
              var link = (cells[linkIdx] || "").trim();
              if (!name || !link) continue;
              // Map name to section
              var section = null;
              if (name === "pilot_link" || name === "pilots") section = "Pilots";
              else if (name === "mm_link" || name === "middleman") section = "Middleman";
              else if (name === "streamer_link" || name === "streamer") section = "Streamer";
              if (!section) {
                console.warn("[ApplyLinks] Unknown name: " + name);
                continue;
              }
              // Validate URL
              try {
                new URL(link);
                applyMap[section] = link;
                console.log("[ApplyLinks] " + section + ": loaded");
              } catch (e) {
                console.warn("[ApplyLinks] Invalid URL for " + section + ": " + link);
              }
            }
            // Update the apply object with fetched links (fallback to baked values if empty)
            if (applyMap.Pilots) apply.Pilots = applyMap.Pilots;
            if (applyMap.Middleman) apply.Middleman = applyMap.Middleman;
            if (applyMap.Streamer) apply.Streamer = applyMap.Streamer;
            // Update apply button hrefs live — no full rebuild needed
            updateApplyButtonHrefs();
          })
          .catch(function (err) {
            console.warn("[ApplyLinks] live fetch failed: " + (err && err.message ? err.message : err));
            // Keep using fallback apply links from config
          });
      });
    }

    // Fetch apply links after services
    fetchApplyLinks();
  }

  /* -------- FOOTER -------- */
  function renderFooter() {
    var f = C.footer || {};
    if (f.bg && el("footer-bg")) el("footer-bg").style.backgroundImage = "url('" + f.bg + "')";
    if (el("footer-tagline")) el("footer-tagline").textContent = f.tagline || "";
    if (el("footer-copyright")) el("footer-copyright").textContent = f.copyright || "";
    var cols = el("footer-cols");
    if (cols) cols.innerHTML = (f.columns || []).map(function (col) {
      return '<div><h4>' + esc(col.title) + '</h4><ul>' + col.links.map(function (l) { return '<li><a href="' + toAbs(l.href) + '">' + esc(l.label) + '</a></li>'; }).join("") + '</ul></div>';
    }).join("");
  }

  /* -------- MUSIC -------- */
  function wireMusic() {
    var m = C.music || {};
    if (m.enabled === false) { var mc = el("music-control"); if (mc) mc.style.display = "none"; return; }
    var btn = el("music-toggle"), audio = el("bgm"); if (!btn || !audio) return;
    if (m.src) audio.src = m.src;
    if (m.title) btn.querySelector("strong").textContent = m.title;
    audio.volume = 0.5;

    // Sync playing state with actual audio element state
    function setPlayingState(isPlaying) {
      btn.classList.toggle("is-playing", isPlaying);
      btn.setAttribute("aria-label", isPlaying ? "Pause background music" : "Play background music");
      btn.title = isPlaying ? "Pause background music" : "Play background music";
      var icon = btn.querySelector(".music-icon");
      if (icon) icon.textContent = isPlaying ? "II" : ">";
      var copy = btn.querySelector(".music-copy strong");
      if (copy) copy.textContent = isPlaying ? "Now Playing" : "Play Music";
    }

    // Handle autoplay if enabled
    if (m.autoplay === true) {
      audio.play().then(function () {
        setPlayingState(true);
      }).catch(function () {
        // Autoplay blocked by browser - wait for user interaction
      });
    }

    // Keep state in sync with audio element
    audio.addEventListener("play", function () { setPlayingState(true); });
    audio.addEventListener("pause", function () { setPlayingState(false); });
    audio.addEventListener("ended", function () { setPlayingState(false); });

    btn.addEventListener("click", function () {
      if (audio.paused) {
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
    });
  }

  /* -------- AMBIENT SPARK PARTICLES (LAG-FREE PRE-RENDERED SPRITES) -------- */
  function wireAmbientParticles() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var canvas = document.getElementById("ambient-particles");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "ambient-particles";
      document.body.appendChild(canvas);
    }

    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var width = 0, height = 0;
    var particles = [];
    var count = 36;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }
    window.addEventListener("resize", resize);
    resize();

    var sparkColors = [
      { glow: "rgba(255, 214, 10, 0.9)", core: "#ffffff" },   // Gold Spark
      { glow: "rgba(255, 120, 25, 0.95)", core: "#fff5e6" },  // Fiery Orange Spark
      { glow: "rgba(255, 60, 0, 0.95)", core: "#ffffff" },   // Crimson Spark
      { glow: "rgba(255, 230, 120, 0.9)", core: "#ffffff" }  // Diamond White Spark
    ];

    // Pre-render glowing streak spark sprites onto offscreen canvases
    function createSparkSprite(color, length, width) {
      var pad = Math.ceil(length + 12);
      var sCanvas = document.createElement("canvas");
      sCanvas.width = width + pad * 2;
      sCanvas.height = length + pad * 2;
      var sCtx = sCanvas.getContext("2d");
      if (!sCtx) return { canvas: sCanvas, halfX: pad, halfY: pad };

      var cx = sCanvas.width / 2;
      var topY = pad;
      var bottomY = pad + length;

      sCtx.shadowColor = color.glow;
      sCtx.shadowBlur = width * 2.5;

      // Spark streak gradient (bright white tip at top, glowing tail fading down)
      var grad = sCtx.createLinearGradient(cx, topY, cx, bottomY);
      grad.addColorStop(0, "rgba(255, 255, 255, 0.98)");
      grad.addColorStop(0.25, color.glow);
      grad.addColorStop(1, "rgba(255, 255, 255, 0)");

      sCtx.beginPath();
      sCtx.moveTo(cx, topY);
      sCtx.lineTo(cx + width * 0.5, topY + width * 0.8);
      sCtx.lineTo(cx + width * 0.2, bottomY);
      sCtx.lineTo(cx - width * 0.2, bottomY);
      sCtx.lineTo(cx - width * 0.5, topY + width * 0.8);
      sCtx.closePath();
      sCtx.fillStyle = grad;
      sCtx.fill();

      // Sharp white hot core at top tip
      sCtx.beginPath();
      sCtx.arc(cx, topY + width * 0.4, width * 0.5, 0, Math.PI * 2);
      sCtx.fillStyle = "#ffffff";
      sCtx.fill();

      return {
        canvas: sCanvas,
        halfX: sCanvas.width / 2,
        halfY: sCanvas.height / 2
      };
    }

    // Cache pre-rendered spark sprites (varied sizes & lengths)
    var sprites = [];
    sparkColors.forEach(function (col) {
      sprites.push(createSparkSprite(col, 10, 1.8)); // Micro spark
      sprites.push(createSparkSprite(col, 16, 2.4)); // Medium spark
      sprites.push(createSparkSprite(col, 24, 3.2)); // Heavy energetic spark
    });

    function createParticle(initialY) {
      var spriteObj = sprites[Math.floor(Math.random() * sprites.length)];
      var vy = Math.random() * 1.5 + 0.9; // Fast upward spark velocity
      return {
        x: Math.random() * width,
        y: initialY !== undefined ? initialY : height + Math.random() * 40,
        sprite: spriteObj.canvas,
        halfX: spriteObj.halfX,
        halfY: spriteObj.halfY,
        vy: vy,
        vx: (Math.random() - 0.5) * 0.6,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: Math.random() * 0.04 + 0.02,
        alpha: Math.random() * 0.6 + 0.4,
        baseAlpha: Math.random() * 0.4 + 0.4,
        flicker: Math.random() * Math.PI * 2,
        flickerSpeed: Math.random() * 0.08 + 0.03
      };
    }

    for (var i = 0; i < count; i++) {
      particles.push(createParticle(Math.random() * height));
    }

    var animId = null;

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];

        p.sway += p.swaySpeed;
        p.flicker += p.flickerSpeed;
        p.x += Math.sin(p.sway) * 0.7 + p.vx;
        p.y -= p.vy;

        p.alpha = Math.max(0.15, p.baseAlpha + Math.sin(p.flicker) * 0.35);

        if (p.y < -40 || p.x < -40 || p.x > width + 40) {
          particles[i] = createParticle(height + 20);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.drawImage(p.sprite, p.x - p.halfX, p.y - p.halfY);
      }

      animId = requestAnimationFrame(draw);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (animId) cancelAnimationFrame(animId);
      } else {
        animId = requestAnimationFrame(draw);
      }
    });

    animId = requestAnimationFrame(draw);
  }

  /* -------- REVEAL -------- */
  function observeReveals() {
    if (!("IntersectionObserver" in window)) { document.querySelectorAll(".reveal").forEach(function (n) { n.classList.add("is-in"); }); return; }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); obs.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal:not(.is-in)").forEach(function (n) { obs.observe(n); });
  }

  /* -------- BOOT -------- */
  function boot() {
    wireAmbientParticles();
    // On the standalone news.html page (detected via the #news-page root) we only
    // render the News list — no Main Page sections, nav menu, or music control.
    var isNews = !!document.getElementById("news-page");
    if (!isNews && document.body && typeof document.body.getAttribute === "function") {
      isNews = !!document.body.getAttribute("data-page");
    }
    if (isNews) {
      renderNews();
      observeReveals();
      wireAudioFX();
      return;
    }
    renderHero(); wireNav(); renderServer(); renderClasses(); renderCombat(); wireWarAlarm();
    renderRoadmap(); renderNews(); renderDownload(); renderCommunity();
    renderServices(); renderFooter(); wireMusic(); observeReveals();
    wireAudioFX();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

