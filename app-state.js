/*
  app-state.js — gestione centralizzata dello stato delle app del catalogo.
  Stati supportati su .app-card[data-app-state]:
    public       (default, nessun attributo necessario)
    private      accesso riservato: la card non naviga, mostra una modale UX
    unavailable  app pubblica ma temporaneamente non raggiungibile

  Nota di sicurezza: questa è solo UX. Nessuna autenticazione, nessuna password,
  nessun segreto lato client. Il controllo degli accessi resta sul servizio che
  ospita l'app. Qui evitiamo soltanto di inviare l'utente verso URL non
  raggiungibili (es. 404).

  Le logica è unica: un solo listener delegato, una sola modale riusata.
*/
(function () {
  "use strict";

  var STATES = {
    private: {
      badge: "Riservata",
      badgeIcon: "fa-lock",
      badgeClass: "app-badge--private",
      title: "Accesso riservato",
      body: "Questa applicazione non è disponibile pubblicamente. L'accesso è riservato agli utenti autorizzati."
    },
    unavailable: {
      badge: "Non disponibile",
      badgeIcon: "fa-info-circle",
      badgeClass: "app-badge--unavailable",
      title: "Applicazione non disponibile",
      body: "Questa applicazione è attualmente non disponibile."
    }
  };

  /* ---- Stili iniettati (unica fonte, coerente con la grafica del sito) ---- */
  var css =
    ".app-badge{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;" +
    "padding:4px 10px;border-radius:999px;margin-bottom:10px;font-size:.7rem;font-weight:700;" +
    "letter-spacing:.6px;text-transform:uppercase}" +
    ".app-badge i{font-size:.78rem}" +
    ".app-badge--private{background:rgba(255,193,7,.14);border:1px solid rgba(255,193,7,.38);color:#ffd766}" +
    ".app-badge--unavailable{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#c8c8c8}" +

    ".actions .appx-guard{font-family:inherit;cursor:pointer;border:0;display:inline-flex;" +
    "align-items:center;justify-content:center;gap:6px;padding:9px 12px;border-radius:10px;" +
    "background:#2a2a2a;color:#fff;font-size:.88rem;font-weight:600;" +
    "transition:transform .18s ease, background .18s ease}" +
    ".actions .appx-guard:hover{transform:translateY(-1px)}" +
    ".actions .appx-guard.primary{background:#00b894}" +
    ".actions .appx-guard.primary:hover{background:#13d2ad}" +
    ".actions .appx-guard.secondary{background:transparent;border:1px solid rgba(255,255,255,.08);color:#e5e5e5}" +
    ".actions .appx-guard.secondary:hover{background:rgba(255,255,255,.06);border-color:rgba(0,184,148,.40)}" +

    ".appx-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;" +
    "justify-content:center;padding:20px;background:rgba(0,0,0,.62);" +
    "-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}" +
    ".appx-overlay[hidden]{display:none}" +
    ".appx-dialog{background:linear-gradient(180deg,#1f1f1f,#181818);color:#f0f0f0;" +
    "border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.45);" +
    "max-width:420px;width:100%;padding:24px;font-family:'Poppins',sans-serif}" +
    ".appx-dialog .appx-icon{width:52px;height:52px;border-radius:12px;display:flex;" +
    "align-items:center;justify-content:center;font-size:1.4rem;margin-bottom:14px;" +
    "background:linear-gradient(135deg,rgba(0,184,148,.22),rgba(9,132,227,.20));" +
    "border:1px solid rgba(255,255,255,.08);color:#fff}" +
    ".appx-title{margin:0 0 8px;font-size:1.2rem;line-height:1.3}" +
    ".appx-body{margin:0 0 20px;color:#c8c8c8;line-height:1.6;font-size:.95rem}" +
    ".appx-actions{display:flex;justify-content:flex-end}" +
    ".appx-close{font-family:inherit;cursor:pointer;border:0;min-height:44px;padding:11px 20px;" +
    "border-radius:12px;background:#00b894;color:#fff;font-weight:600;font-size:.95rem;" +
    "transition:background .18s ease,transform .18s ease}" +
    ".appx-close:hover{background:#13d2ad;transform:translateY(-1px)}" +
    ".appx-close:focus-visible{outline:2px solid #7ec8ff;outline-offset:2px}";

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- Modale unica ---- */
  var overlay, dialog, iconEl, titleEl, bodyEl, closeBtn;
  var lastFocused = null;

  function buildModal() {
    overlay = document.createElement("div");
    overlay.className = "appx-overlay";
    overlay.hidden = true;

    dialog = document.createElement("div");
    dialog.className = "appx-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "appxTitle");
    dialog.setAttribute("aria-describedby", "appxBody");

    iconEl = document.createElement("div");
    iconEl.className = "appx-icon";
    iconEl.setAttribute("aria-hidden", "true");
    iconEl.innerHTML = '<i class="fa fa-lock"></i>';

    titleEl = document.createElement("h2");
    titleEl.className = "appx-title";
    titleEl.id = "appxTitle";

    bodyEl = document.createElement("p");
    bodyEl.className = "appx-body";
    bodyEl.id = "appxBody";

    var actions = document.createElement("div");
    actions.className = "appx-actions";
    closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "appx-close";
    closeBtn.textContent = "Chiudi";
    actions.appendChild(closeBtn);

    dialog.appendChild(iconEl);
    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", function (e) {
      if (overlay.hidden) return;
      if (e.key === "Escape") {
        closeModal();
      } else if (e.key === "Tab") {
        trapFocus(e);
      }
    });
  }

  function trapFocus(e) {
    var focusable = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openModal(stateKey) {
    var cfg = STATES[stateKey] || STATES.private;
    iconEl.innerHTML = '<i class="fa ' + cfg.badgeIcon + '"></i>';
    titleEl.textContent = cfg.title;
    bodyEl.textContent = cfg.body;
    lastFocused = document.activeElement;
    overlay.hidden = false;
    closeBtn.focus();
  }

  function closeModal() {
    overlay.hidden = true;
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  /* ---- Badge automatici per ogni card con stato ---- */
  function applyBadges() {
    var cards = document.querySelectorAll(".app-card[data-app-state]");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cfg = STATES[card.getAttribute("data-app-state")];
      if (!cfg) continue;
      if (card.querySelector(".app-badge")) continue;
      var badge = document.createElement("span");
      badge.className = "app-badge " + cfg.badgeClass;
      badge.innerHTML = '<i class="fa ' + cfg.badgeIcon + '" aria-hidden="true"></i> ' + cfg.badge;
      card.insertBefore(badge, card.firstChild);
    }
  }

  /* ---- Listener delegato unico ---- */
  function onClick(e) {
    var trigger = e.target.closest(".appx-guard");
    if (!trigger) return;
    e.preventDefault();
    var card = trigger.closest("[data-app-state]");
    var stateKey = card ? card.getAttribute("data-app-state") : "private";
    openModal(stateKey);
  }

  function init() {
    buildModal();
    applyBadges();
    document.addEventListener("click", onClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
