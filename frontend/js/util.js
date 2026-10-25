(function () {
  const U = (window.U = {});

  U.h = function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    let value;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "value") value = v;
        else if (k === "dataset") Object.assign(e.dataset, v);
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
        else if (["checked", "disabled", "selected", "required", "multiple", "hidden"].includes(k)) e[k] = true;
        else e.setAttribute(k, v === true ? "" : v);
      }
    }
    kids.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
    if (value !== undefined) e.value = value;
    return e;
  };
  const h = U.h;

  ["append", "prepend", "replaceChildren"].forEach((m) => {
    const o = Element.prototype[m];
    Element.prototype[m] = function (...a) { return o.apply(this, a.flat(Infinity).filter((x) => x != null && x !== false)); };
  });

  const nf = new Intl.NumberFormat("ru-RU");
  U.num = (n) => nf.format(Math.round(n)).replace(/ /g, " ");
  U.money = (n) => U.num(n) + " ₽";
  U.pct = (x, d = 1) => (x * 100).toFixed(d).replace(".", ",") + "%";
  U.dt = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  U.date = (ts) => new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  U.size = (b) => (b < 1024 ? b + " Б" : b < 1048576 ? Math.round(b / 1024) + " КБ" : (b / 1048576).toFixed(1) + " МБ");
  U.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.annuity = (a, n, r) => (r === 0 ? a / n : (a * (r / 12)) / (1 - Math.pow(1 + r / 12, -n)));
  U.months = (n) => {
    const m10 = n % 10, m100 = n % 100;
    return n + (m10 === 1 && m100 !== 11 ? " месяц" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? " месяца" : " месяцев");
  };

  const ICONS = {
    check: "M5 12l4 4 10-10",
    clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
    file: "M7 3h7l5 5v13H7zM14 3v5h5",
    upload: "M12 16V5m0 0l-4 4m4-4l4 4M5 19h14",
    bell: "M6 17V11a6 6 0 1112 0v6l2 2H4zM10 21h4",
    right: "M5 12h14m-6-6l6 6-6 6",
    left: "M19 12H5m6-6l-6 6 6 6",
    user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
    logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
    alert: "M12 8v5m0 3.5v.01M12 3l10 18H2z",
    info: "M12 11v6m0-9.5v.01M12 3a9 9 0 100 18 9 9 0 000-18z",
    x: "M6 6l12 12M18 6L6 18",
    building: "M4 21V5l8-2v18M12 9h8v12M7 9h2M7 13h2M7 17h2M15 13h2M15 17h2",
    download: "M12 4v11m0 0l-4-4m4 4l4-4M5 20h14",
    plus: "M12 5v14M5 12h14",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  };
  U.ic = (name, size = 20) => {
    const s = h("span", { class: "ic", style: `width:${size}px;height:${size}px` });
    s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name] || ""}"/></svg>`;
    return s;
  };

  U.toast = (text, kind = "") => {
    let box = document.getElementById("toasts");
    if (!box) { box = h("div", { id: "toasts", "aria-live": "polite" }); document.body.append(box); }
    const t = h("div", { class: "toast " + kind }, text);
    box.append(t);
    setTimeout(() => t.classList.add("out"), 3600);
    setTimeout(() => t.remove(), 4000);
  };

  U.modal = ({ title, body, actions = [], wide = false }) => {
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => e.key === "Escape" && close();
    const back = h("div", { class: "modal-back", onclick: (e) => e.target === back && close() },
      h("div", { class: "modal" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true" },
        h("div", { class: "modal-head" }, h("h3", null, title), h("button", { class: "icon-btn", "aria-label": "Закрыть", onclick: close }, U.ic("x"))),
        h("div", { class: "modal-body" }, body),
        actions.length ? h("div", { class: "modal-foot" }, actions.map((a) =>
          h("button", { class: "btn " + (a.kind || ""), onclick: () => a.onClick ? a.onClick(close) : close() }, a.label))) : null));
    document.body.append(back);
    document.addEventListener("keydown", onKey);
    return close;
  };

  U.moneyInput = ({ value, onInput, placeholder, id, allowNegative = false, ariaLabel }) => {
    const parse = (s) => {
      const neg = allowNegative && /^\s*-/.test(s);
      const d = String(s).replace(/[^\d]/g, "");
      return d === "" ? (neg ? "-" : "") : (neg ? "-" : "") + d;
    };
    const show = (p) => (p === "" ? "" : p === "-" ? "-" : U.num(Number(p)));
    const i = h("input", { type: "text", inputmode: "numeric", id, placeholder, autocomplete: "off", "aria-label": ariaLabel,
      value: value === "" || value == null ? "" : show(String(value)),
      oninput: () => { const p = parse(i.value); i.value = show(p); onInput(p === "" || p === "-" ? null : Number(p)); } });
    return i;
  };

  U.gauge = (pd, grade) => {
    const v = U.clamp(pd / 0.3, 0, 1);
    const ang = Math.PI * (1 - v);
    const x = 100 + 80 * Math.cos(ang), y = 100 - 80 * Math.sin(ang);
    const col = { A: "#1FA463", B: "#7AB800", C: "#F5A623", D: "#EF3124" }[grade] || "#6F7A85";
    const w = h("div", { class: "gauge" });
    w.innerHTML = `<svg viewBox="0 0 200 118" role="img" aria-label="Вероятность дефолта ${U.pct(pd)}">
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#E5E7EA" stroke-width="16" stroke-linecap="round"/>
      <path d="M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>
      <text x="100" y="92" text-anchor="middle" font-size="30" font-weight="800" fill="currentColor">${U.pct(pd)}</text>
      <text x="100" y="112" text-anchor="middle" font-size="11" fill="#6F7A85">вероятность дефолта (PD)</text></svg>`;
    return w;
  };

  U.download = (name, data, type) => {
    const a = h("a", { href: data.startsWith("data:") ? data : URL.createObjectURL(new Blob([data], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  };

  U.readFile = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
  });
  U.readText = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
  });
})();
