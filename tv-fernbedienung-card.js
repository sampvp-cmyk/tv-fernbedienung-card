/*
 * TV-Fernbedienung Card – eine fertige Fernbedienung für Android-TV-/Google-TV-Geräte
 * in Home Assistant. Nur Geräte auswählen, fertig.
 * https://github.com/sampvp-cmyk/tv-fernbedienung-card
 */
const VERSION = "1.1.1";

const DEFAULT_APPS = [
  { name: "waipu.tv", key: "HOME", package: "de.exaring.waipu", icon: "mdi:television-classic", color: "#00a3b4", background: "#ffffff" },
  { name: "NETFLIX", activity: "https://www.netflix.com/title", package: "com.netflix.ninja", color: "#e50914", background: "#ffffff", font: "Impact, 'Arial Narrow', sans-serif" },
  { name: "YouTube", activity: "https://www.youtube.com", package: "com.google.android.youtube.tv", icon: "mdi:youtube", color: "#202020", icon_color: "#ff0000", background: "#ffffff" },
  { name: "Disney+", activity: "https://www.disneyplus.com", package: "com.disney.disneyplus", color: "#ffffff", background: "linear-gradient(135deg,#0c6a87,#14b8c8)" },
  { name: "Paramount+", activity: "https://www.paramountplus.com", package: "com.cbs.ca", icon: "mdi:image-filter-hdr", color: "#ffffff", background: "linear-gradient(135deg,#0064ff,#002a8a)" },
  { name: "Jellyfin", package: "org.jellyfin.androidtv", hidden: true },
];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

class TvFernbedienungCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._tab = null; // null | "medien" | "apps" | "sender"
    this._keyboard = false;
    this._sig = "";
  }

  static getConfigElement() {
    return document.createElement("tv-fernbedienung-card-editor");
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const remote = ids.find((e) => e.startsWith("remote.")) || "";
    const base = remote.split(".")[1] || "";
    const mp = ids.find((e) => e.startsWith("media_player.") && base && e.includes(base)) || "";
    return { remote, ...(mp ? { media_player: mp } : {}) };
  }

  setConfig(config) {
    if (!config || !config.remote) throw new Error("Bitte eine Fernbedienung (remote.…) auswählen.");
    this._config = { apps: DEFAULT_APPS, ...config };
    if (!Array.isArray(this._config.apps)) this._config.apps = DEFAULT_APPS;
    this._sig = "";
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    // Nur auf Änderungen reagieren, die man sieht – sonst baut sich die Karte
    // bei jedem Positions-Update neu auf und Klicks gehen verloren.
    const r = hass.states[c.remote];
    const m = c.media_player ? hass.states[c.media_player] : undefined;
    const l = c.light ? hass.states[c.light] : undefined;
    const sig = JSON.stringify([
      r?.state,
      r?.attributes?.current_activity,
      r?.attributes?.friendly_name,
      m?.state,
      m?.attributes?.volume_level,
      m?.attributes?.is_volume_muted,
      m?.attributes?.media_title,
      l?.state,
    ]);
    if (sig !== this._sig) {
      this._sig = sig;
      this._render();
    }
  }

  getCardSize() {
    return 10;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  // ---------- Helpers ----------
  _st(id) {
    return id ? this._hass?.states[id] : undefined;
  }
  _call(domain, service, data) {
    this._haptic();
    return this._hass.callService(domain, service, data);
  }
  _haptic(type = "light") {
    this.dispatchEvent(new CustomEvent("haptic", { detail: type, bubbles: true, composed: true }));
  }
  _key(k) {
    return this._call("remote", "send_command", { entity_id: this._config.remote, command: k });
  }
  _currentPackage() {
    return this._st(this._config.remote)?.attributes?.current_activity || "";
  }

  _do(action, arg) {
    const c = this._config;
    const mp = c.media_player;
    switch (action) {
      case "key":
        return this._key(arg);
      case "power":
        return this._key("POWER");
      case "tab":
        this._tab = this._tab === arg ? null : arg;
        this._haptic("selection");
        return this._render();
      case "keyboard":
        this._keyboard = !this._keyboard;
        this._render();
        if (this._keyboard) setTimeout(() => this.shadowRoot.querySelector("#kbd")?.focus(), 50);
        return;
      case "vol_up":
        return mp ? this._call("media_player", "volume_up", { entity_id: mp }) : this._key("VOLUME_UP");
      case "vol_down":
        return mp ? this._call("media_player", "volume_down", { entity_id: mp }) : this._key("VOLUME_DOWN");
      case "mute": {
        const s = this._st(mp);
        if (s && s.attributes.is_volume_muted !== undefined)
          return this._call("media_player", "volume_mute", { entity_id: mp, is_volume_muted: !s.attributes.is_volume_muted });
        return this._key("MUTE");
      }
      case "light":
        return this._call("light", "toggle", { entity_id: c.light });
      case "app": {
        const app = c.apps[Number(arg)];
        if (!app) return;
        if (app.key) return this._key(app.key);
        return this._call("remote", "turn_on", { entity_id: c.remote, activity: app.activity || app.package });
      }
    }
  }

  // ---------- Rendering ----------
  _btn(action, arg, icon, cls = "", label = "") {
    return `<button class="b ${cls}" data-a="${action}" data-v="${esc(arg)}" title="${esc(label || arg || action)}">${
      icon ? `<ha-icon icon="${icon}"></ha-icon>` : ""
    }${label && !icon ? `<span>${esc(label)}</span>` : ""}</button>`;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const remote = this._st(c.remote);
    const mp = this._st(c.media_player);
    const light = this._st(c.light);
    const name = c.name || remote?.attributes?.friendly_name || "Fernseher";
    const pkg = this._currentPackage();
    const muted = mp?.attributes?.is_volume_muted;
    const unavailable = !remote || remote.state === "unavailable";
    const t = this._tab;

    const app = c.apps.find((a) => a.package && a.package === pkg);
    const title = mp?.attributes?.media_title;
    const nowLabel = (app ? app.name : pkg || "Startseite") + (title ? ` · ${title}` : "");
    const vol = mp?.attributes?.volume_level;

    let tabBody = "";
    if (t === "medien") {
      tabBody = `
        <div class="now"><ha-icon icon="mdi:play-circle"></ha-icon><span>${esc(nowLabel)}</span></div>
        ${
          vol !== undefined
            ? `<input id="vol" type="range" min="0" max="100" step="1" value="${Math.round(vol * 100)}" aria-label="Lautstärke">`
            : ""
        }
        <div class="row2">
          ${
            c.light
              ? `<button class="pill" data-a="light"><ha-icon icon="mdi:led-strip-variant" style="color:${
                  light?.state === "on" ? "#ffd54f" : "#9a9a9e"
                }"></ha-icon><span>${esc(c.light_name || "Licht")} ${light?.state === "on" ? "an" : "aus"}</span></button>`
              : ""
          }
          <button class="pill" data-a="power"><ha-icon icon="mdi:power" style="color:#ff6b6b"></ha-icon><span>TV an/aus</span></button>
        </div>`;
    } else if (t === "apps") {
      tabBody = `<div class="apps">${c.apps
        .map((a, i) => {
          if (a.hidden) return "";
          const active = a.package && a.package === pkg ? " active" : "";
          const style = `background:${esc(a.background || "#1c1c1e")};color:${esc(a.color || "#f2f2f2")};${
            a.font ? `font-family:${esc(a.font)};font-size:20px;letter-spacing:1px;` : ""
          }`;
          return `<button class="app${active}" data-a="app" data-v="${i}" style="${style}">${
            a.icon ? `<ha-icon icon="${esc(a.icon)}" style="color:${esc(a.icon_color || a.color || "#f2f2f2")}"></ha-icon>` : ""
          }<span>${esc(a.name)}</span></button>`;
        })
        .join("")}</div>`;
    } else if (t === "sender") {
      const n = (d) => this._btn("key", `KEYCODE_${d}`, `mdi:numeric-${d}`, "num", String(d));
      tabBody = `<div class="numpad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n).join("")}${this._btn(
        "key",
        "DEL",
        "mdi:backspace-outline",
        "num",
        "Löschen"
      )}${n(0)}${this._btn("key", "DPAD_CENTER", "mdi:check", "num", "OK")}</div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card class="${unavailable ? "off" : ""}">
        <div class="top">
          ${this._btn("power", "", "mdi:power", "power", "An/Aus")}
          <div class="title">${esc(name)}</div>
          ${this._btn("mute", "", muted ? "mdi:volume-off" : "mdi:volume-high", "mute", "Stumm")}
        </div>
        <div class="row-between">
          ${this._btn("key", "MENU", "mdi:menu", "round l", "Menü")}
          ${this._btn("key", "SETTINGS", "mdi:tune-vertical-variant", "round l", "Einstellungen")}
        </div>
        <div class="nav">
          <div class="side">
            ${this._btn("keyboard", "", "mdi:keyboard-outline", "round", "Tastatur")}
            ${this._btn("key", "BACK", "mdi:keyboard-return", "round", "Zurück")}
          </div>
          <div class="pad">
            ${this._btn("key", "DPAD_UP", "mdi:chevron-up", "dir up", "Hoch")}
            ${this._btn("key", "DPAD_LEFT", "mdi:chevron-left", "dir left", "Links")}
            ${this._btn("key", "DPAD_CENTER", "", "center", "OK")}
            ${this._btn("key", "DPAD_RIGHT", "mdi:chevron-right", "dir right", "Rechts")}
            ${this._btn("key", "DPAD_DOWN", "mdi:chevron-down", "dir down", "Runter")}
          </div>
          <div class="side">
            ${this._btn("key", "SEARCH", "mdi:magnify", "round", "Suche")}
            ${this._btn("key", "HOME", "mdi:home-outline", "round home", "Home")}
          </div>
        </div>
        ${
          this._keyboard
            ? `<div class="kbd"><input id="kbd" type="text" placeholder="Tippen geht sofort an den Fernseher …"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
               ${this._btn("key", "ENTER", "mdi:keyboard-return", "round s", "Enter")}</div>`
            : ""
        }
      </ha-card>
      <div class="tabs ${t ? "open" : ""}">
        ${["medien", "apps", "sender"]
          .map((k) => `<button class="tab ${t === k ? "sel" : ""}" data-a="tab" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`)
          .join("")}
      </div>
      ${
        t
          ? `<div class="panel">${tabBody}</div>`
          : `<div class="media">
              <div class="col">${this._btn("vol_up", "", "mdi:plus", "round", "Lauter")}<span class="lbl">VOL</span>${this._btn(
              "vol_down",
              "",
              "mdi:minus",
              "round",
              "Leiser"
            )}</div>
              <div class="col">${this._btn("key", "MEDIA_REWIND", "mdi:rewind", "round s", "Zurückspulen")}${this._btn(
              "key",
              "MEDIA_PLAY_PAUSE",
              "mdi:play-pause",
              "round play",
              "Play/Pause"
            )}${this._btn("key", "MEDIA_FAST_FORWARD", "mdi:fast-forward", "round s", "Vorspulen")}</div>
              <div class="col">${this._btn("key", "CHANNEL_UP", "mdi:chevron-up", "round", "Sender +")}<span class="lbl">CH</span>${this._btn(
              "key",
              "CHANNEL_DOWN",
              "mdi:chevron-down",
              "round",
              "Sender −"
            )}</div>
            </div>`
      }`;

    this.shadowRoot.querySelectorAll("[data-a]").forEach((el) =>
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._do(el.dataset.a, el.dataset.v);
      })
    );
    const v = this.shadowRoot.querySelector("#vol");
    if (v)
      v.addEventListener("change", () =>
        this._call("media_player", "volume_set", { entity_id: c.media_player, volume_level: Number(v.value) / 100 })
      );
    const k = this.shadowRoot.querySelector("#kbd");
    if (k) {
      // Jede Eingabe geht sofort an den Fernseher – wie die Zahlen im Sender-Block.
      // Statt einzelner Tasten-Ereignisse vergleichen wir den Feldinhalt vorher/nachher:
      // das "input"-Ereignis feuert auf jedem Gerät (auch iPhone-Tastatur mit
      // Autokorrektur) zuverlässig, egal wie das Zeichen zustande kam.
      let alt = k.value;
      const senden = (text) => {
        for (const zeichen of text) {
          if (zeichen === " ") this._key("KEYCODE_SPACE");
          else this._call("remote", "send_command", { entity_id: c.remote, command: `text:${zeichen}` });
        }
      };
      k.addEventListener("input", () => {
        const neu = k.value;
        let anfang = 0;
        while (anfang < alt.length && anfang < neu.length && alt[anfang] === neu[anfang]) anfang++;
        let endeAlt = alt.length, endeNeu = neu.length;
        while (endeAlt > anfang && endeNeu > anfang && alt[endeAlt - 1] === neu[endeNeu - 1]) { endeAlt--; endeNeu--; }
        for (let i = anfang; i < endeAlt; i++) this._key("DEL");
        senden(neu.slice(anfang, endeNeu));
        alt = neu;
      });
      k.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          k.value = "";
          alt = "";
          this._key("ENTER");
        } else if (ev.key === "Backspace" && !k.value) {
          // Feld ist leer: am Fernseher trotzdem löschen
          this._key("DEL");
        }
      });
    }
  }
}

const CSS = `
:host { display:block; --bg:#262628; --btn:#3a3a3c; --deep:#1c1c1e; --fg:#f2f2f2; --muted:#9a9a9e; --accent:#ff5a1f; --title:#4c9bff; }
ha-card { background:var(--bg); border-radius:32px; border:none; box-shadow:none; padding:14px 14px 18px; color:var(--fg); }
ha-card.off { opacity:.55; }
button { font:inherit; color:inherit; border:none; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.b { display:flex; align-items:center; justify-content:center; background:none; padding:0; }
.b:active, .app:active, .pill:active, .tab:active { transform:scale(.94); }
.top { display:flex; align-items:center; justify-content:space-between; }
.title { color:var(--title); font-size:20px; font-weight:600; text-align:center; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.power, .mute { width:48px; height:48px; --mdc-icon-size:30px; }
.power { color:#ff6b6b; }
.mute { --mdc-icon-size:28px; color:var(--fg); }
.row-between { display:flex; justify-content:space-between; margin:10px 8px 4px; }
.round { background:var(--btn); border-radius:50%; width:52px; height:52px; --mdc-icon-size:24px; color:var(--fg); flex:none; }
.round.l { width:56px; height:56px; --mdc-icon-size:28px; }
.round.s { width:44px; height:44px; --mdc-icon-size:22px; }
.round.home, .round.play { background:var(--accent); color:#fff; width:64px; height:64px; --mdc-icon-size:32px; }
.round.play { width:56px; height:56px; --mdc-icon-size:28px; }
.nav { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:6px; }
.side { display:flex; flex-direction:column; justify-content:space-between; align-items:center; height:200px; }
.pad { position:relative; width:min(215px, 52vw); aspect-ratio:1; border-radius:50%; background:var(--deep); flex:none; }
.dir { position:absolute; width:34%; height:34%; color:var(--muted); --mdc-icon-size:40px; border-radius:50%; }
.up { top:0; left:33%; } .down { bottom:0; left:33%; } .left { left:0; top:33%; } .right { right:0; top:33%; }
.center { position:absolute; inset:29%; border-radius:50%; background:var(--bg); }
.kbd { display:flex; gap:8px; margin-top:12px; align-items:center; }
.kbd input { flex:1; height:44px; border-radius:22px; border:none; background:var(--deep); color:var(--fg); padding:0 16px; font-size:16px; outline:none; }
.tabs { display:flex; background:var(--bg); border-radius:28px; padding:6px; margin-top:12px; }
.tabs.open { border-radius:28px 28px 0 0; padding-bottom:0; }
.tab { flex:1; height:40px; margin:0 2px; border-radius:20px; background:transparent; font-size:18px; opacity:.7; }
.tabs.open .tab { border-radius:20px 20px 0 0; }
.tab.sel { background:var(--btn); opacity:1; }
.panel { background:var(--btn); border-radius:0 0 28px 28px; padding:10px; }
.media { display:flex; justify-content:space-around; background:var(--bg); border-radius:28px; padding:12px 6px; margin-top:12px; }
.col { display:flex; flex-direction:column; align-items:center; justify-content:space-between; gap:8px; }
.lbl { font-size:13px; font-weight:800; letter-spacing:2px; color:var(--muted); }
.now { display:flex; align-items:center; gap:10px; background:var(--deep); border-radius:18px; min-height:56px; padding:0 14px; font-size:17px; font-weight:700; }
.now ha-icon { color:var(--accent); --mdc-icon-size:32px; flex:none; }
.now span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#vol { width:calc(100% - 20px); margin:14px 10px; accent-color:var(--accent); height:28px; }
.row2 { display:flex; gap:10px; }
.pill { flex:1; display:flex; align-items:center; justify-content:center; gap:8px; background:var(--deep); border-radius:18px; height:52px; font-weight:600; --mdc-icon-size:24px; }
.apps { display:flex; flex-wrap:wrap; gap:8px; }
.app { flex:1 1 calc(33% - 8px); min-width:90px; height:64px; border-radius:18px; display:flex; align-items:center; justify-content:center; gap:6px; font-weight:800; font-size:15px; --mdc-icon-size:28px; }
.app.active { outline:3px solid var(--accent); outline-offset:2px; }
.numpad { display:grid; grid-template-columns:repeat(3,1fr); gap:6px 10px; }
.num { background:var(--deep); border-radius:14px; height:44px; --mdc-icon-size:30px; color:var(--fg); }
`;

// ---------- Visueller Editor ----------
const SCHEMA = [
  { name: "remote", required: true, selector: { entity: { domain: "remote" } } },
  { name: "media_player", selector: { entity: { domain: "media_player" } } },
  { name: "name", selector: { text: {} } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "light", selector: { entity: { domain: "light" } } },
      { name: "light_name", selector: { text: {} } },
    ],
  },
  { name: "apps", selector: { object: {} } },
];
const LABELS = {
  remote: "Fernbedienung (remote.… vom Fernseher)",
  media_player: "Mediaplayer (für Lautstärke und Titel, optional)",
  name: "Name oben (leer = Gerätename)",
  light: "Licht am Fernseher (optional)",
  light_name: "Name für das Licht",
  apps: "Apps (leer lassen = Standard-Apps)",
};
const HELPERS = {
  apps: "Liste mit name, activity (Link oder Paketname), package (zum Markieren der laufenden App), optional icon, color, background; hidden: true = nur für die Anzeige „läuft gerade“.",
};

class TvFernbedienungCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }
  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.computeHelper = (s) => HELPERS[s.name];
      this._form.addEventListener("value-changed", (ev) => {
        const cfg = { ...ev.detail.value };
        if (!cfg.apps || (Array.isArray(cfg.apps) && !cfg.apps.length)) delete cfg.apps;
        for (const k of Object.keys(cfg)) if (cfg[k] === "" || cfg[k] === undefined) delete cfg[k];
        this._config = cfg;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = SCHEMA;
    this._form.data = this._config;
  }
}

customElements.define("tv-fernbedienung-card", TvFernbedienungCard);
customElements.define("tv-fernbedienung-card-editor", TvFernbedienungCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tv-fernbedienung-card",
  name: "TV-Fernbedienung",
  description: "Komplette Fernbedienung für Android TV / Google TV – nur Geräte auswählen.",
  preview: true,
  documentationURL: "https://github.com/sampvp-cmyk/tv-fernbedienung-card",
});

console.info(`%c TV-FERNBEDIENUNG %c ${VERSION} `, "background:#ff5a1f;color:#fff;font-weight:700", "background:#262628;color:#fff");
