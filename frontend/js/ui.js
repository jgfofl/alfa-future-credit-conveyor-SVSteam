(function () {
  const { h, ic } = window.U, U = window.U, S = window.Store;
  const UI = (window.UI = {});

  const BANK_LABELS = { manual_review: "Ожидает решения", need_info: "Ждём клиента", offer: "Предложение отправлено", submitted: "Новая", scoring: "Скоринг" };
  UI.chip = (status, side = "client") => {
    const s = S.STATUS[status];
    return h("span", { class: "chip " + s.tone }, side === "bank" && BANK_LABELS[status] ? BANK_LABELS[status] : s.label);
  };

  UI.kv = (rows) => h("dl", { class: "kv" }, rows.filter(Boolean).map(([k, v]) => [h("dt", null, k), h("dd", null, v)]));

  UI.field = (label, input, { hint, error, id, full } = {}) =>
    h("div", { class: "field" + (error ? " has-error" : "") + (full ? " full" : "") },
      h("label", { for: id }, label), input, hint ? h("div", { class: "hint" }, hint) : null, error ? h("div", { class: "err", role: "alert" }, error) : null);

  UI.docItem = (d, { onRemove, bank } = {}) =>
    h("div", { class: "doc" },
      ic("file", 20),
      h("div", { class: "doc-main" }, h("div", { class: "doc-name" }, d.name), h("div", { class: "muted small" }, (S.DOC_KINDS[d.kind] || "Документ") + " · " + U.size(d.size))),
      h("button", { class: "icon-btn", title: "Скачать", "aria-label": "Скачать " + d.name, onclick: () => {
        if (d.data) U.download(d.name, d.data);
        else U.toast("В демо-версии сохраняются файлы до 400 КБ; этот файл хранится только как запись о вложении");
      } }, ic("download", 18)),
      onRemove ? h("button", { class: "icon-btn", title: "Удалить", "aria-label": "Удалить " + d.name, onclick: onRemove }, ic("x", 18)) : null);

  UI.timeline = (events) =>
    h("ol", { class: "timeline" }, [...events].reverse().map((e) =>
      h("li", { class: "tl-" + e.actor + (e.type === "comment" ? " tl-comment" : "") },
        h("div", { class: "tl-dot" }),
        h("div", null, h("div", { class: "tl-text" }, e.text), h("div", { class: "muted small" }, U.dt(e.at) + " · " + e.actorName)))));

  const PHASES = ["Заявка", "Проверка", "Решение", "Подписание", "Выдача"];
  const PHASE_OF = { submitted: 1, scoring: 1, manual_review: 1, need_info: 1, offer: 2, signing: 3, disbursed: 5, rejected: 2, declined: 2 };
  UI.stepper = (status) => {
    const cur = PHASE_OF[status];
    return h("ol", { class: "phases", "aria-label": "Этапы рассмотрения" }, PHASES.map((p, i) => {
      let cls = i < cur ? "done" : i === cur ? "active" : "";
      if (i === cur && ["rejected", "declined"].includes(status)) cls = "fail";
      if (i === cur && status === "need_info") cls = "active warn";
      return h("li", { class: cls }, h("span", { class: "ph-dot" }, i < cur ? ic("check", 14) : i + 1), h("span", { class: "ph-label" }, p));
    }));
  };

  UI.empty = (title, text, action) => h("div", { class: "empty" }, h("h3", null, title), h("p", { class: "muted" }, text), action || null);

  /* загрузка файла в слот: возвращает кнопку + скрытый input */
  UI.filePicker = (label, onFile, { accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.csv,.json", kind = "ghost" } = {}) => {
    const inp = h("input", { type: "file", accept, hidden: true, onchange: async () => { if (inp.files[0]) { await onFile(inp.files[0]); inp.value = ""; } } });
    return h("span", null, inp, h("button", { type: "button", class: "btn small " + kind, onclick: () => inp.click() }, ic("upload", 16), label));
  };

  UI.productLabel = (id) => (S.PRODUCTS[id] ? S.PRODUCTS[id].name : id);
  UI.terms = (o) => `${U.money(o.amount)} · ${U.months(o.term)}`;
})();
