(function () {
  const U = window.U, S = window.Store, UI = window.UI, CFG = window.APP_CONFIG;
  const { h, ic } = U;
  const Bank = (window.Bank = {});

  const PRIO = { manual_review: 0, submitted: 1, scoring: 1, need_info: 2, offer: 3, signing: 3, disbursed: 4, rejected: 4, declined: 4 };
  const NEEDS_ACTION = (a) => a.status === "manual_review";
  const F = { status: "", product: "", q: "", attn: false };
  const GRADE_COL = { A: "green", B: "lime", C: "amber", D: "red" };
  const REC = { approved: "Одобрить на запрошенных условиях", counteroffer: "Одобрить на иных условиях", rejected: "Отказать", manual_review: "Автоматическое решение не принято", need_info: "Запросить данные у клиента" };
  const REJECT_REASONS = ["Высокая долговая нагрузка", "Недостаточная платёжеспособность", "Негативная кредитная история", "Недостаточный срок ведения бизнеса", "Нельзя подтвердить доходы по документам", "Иная причина (см. комментарий)"];

  /* ============ Очередь заявок ============ */
  Bank.Queue = (root) => {
    const st = S.stats();
    const tile = (label, val, cls = "", hint) => h("div", { class: "kpi " + cls }, h("div", { class: "kpi-val" }, val), h("div", { class: "kpi-label" }, label), hint ? h("div", { class: "muted small" }, hint) : null);
    const tbl = h("div", { class: "card table-card" });
    const draw = () => {
      let rows = S.apps().filter((a) =>
        (!F.status || a.status === F.status) && (!F.product || a.product === F.product) && (!F.attn || NEEDS_ACTION(a)) &&
        (!F.q || (a.id + a.companyName + a.inn).toLowerCase().includes(F.q.toLowerCase())));
      rows.sort((a, b) => PRIO[a.status] - PRIO[b.status] || b.updatedAt - a.updatedAt);
      tbl.replaceChildren(rows.length ? h("table", { class: "tbl" },
        h("thead", null, h("tr", null, ["Заявка", "Компания", "Продукт", "Сумма и срок", "Риск", "Статус", "Обновлена", "Ответственный"].map((t) => h("th", null, t)))),
        h("tbody", null, rows.map((a) => {
          const d = a.ml && a.ml.decision, g = d && d.grade;
          return h("tr", { class: NEEDS_ACTION(a) ? "attn" : "", tabindex: 0, onclick: () => go("/bank/app/" + a.id), onkeydown: (e) => e.key === "Enter" && go("/bank/app/" + a.id) },
            h("td", null, h("a", { href: "#/bank/app/" + a.id, onclick: (e) => e.stopPropagation() }, a.id)),
            h("td", null, h("div", { class: "row-title" }, a.companyName), h("div", { class: "muted small" }, "ИНН " + a.inn)),
            h("td", null, UI.productLabel(a.product)), h("td", null, h("div", null, U.money(a.amount)), h("div", { class: "muted small" }, U.months(a.term))),
            h("td", null, g ? h("span", { class: "grade " + GRADE_COL[g] }, g, h("small", null, d.score)) : h("span", { class: "muted" }, "—")),
            h("td", null, UI.chip(a.status, "bank"), a.flags.infoReceived && a.status === "manual_review" ? h("div", { class: "small ok-text" }, "Ответ клиента получен") : null),
            h("td", { class: "muted" }, U.dt(a.updatedAt)), h("td", { class: "muted" }, a.assignee || "—"));
        }))) : UI.empty("Ничего не найдено", "Измените фильтры или поисковый запрос."));
    };
    const sel = (key, opts, ph) => h("select", { "aria-label": ph, onchange: (e) => { F[key] = e.target.value; draw(); } }, h("option", { value: "" }, ph), opts.map(([v, l]) => h("option", { value: v, selected: F[key] === v }, l)));
    const max = Math.max(1, ...Object.keys(S.STATUS).map((k) => S.apps().filter((a) => a.status === k).length));
    const bars = Object.entries(S.STATUS).map(([k, v]) => [k, v, S.apps().filter((a) => a.status === k).length]).filter((x) => x[2]);

    root.append(
      h("div", { class: "page-head" }, h("div", null, h("h1", null, "Заявки клиентов"), h("div", { class: "muted" }, "Рабочее место сотрудника банка")), h("div", { class: "muted small" }, "Обновляется в реальном времени")),
      h("div", { class: "kpis" }, tile("Ждут решения", st.review, st.review ? "hot" : ""), tile("Ждём клиента", st.info), tile("В автопроверке", st.inProc), tile("Одобрено", st.approved, "", U.money(st.sum)), tile("Отказано", st.rejected), tile("Доля одобрений", U.pct(st.rate, 0))),
      h("details", { class: "policy card" }, h("summary", null, ic("shield", 18), "Как заявки распределяются между системой и сотрудниками"),
        h("ul", null,
          h("li", null, h("b", null, "Автоотказ: "), "организация ликвидирована, просрочка более 90 дней, бизнес младше 6 месяцев или риск (PD) выше порога продукта в 1,6 раза."),
          h("li", null, h("b", null, "Автоодобрение: "), `риск и платёж в пределах лимитов продукта, сумма не более ${U.money(CFG.AUTO_APPROVE_LIMIT)}.`),
          h("li", null, h("b", null, "Очередь сотрудника: "), "одобрение на иных условиях, крупные суммы, сбой проверок (например, бюро недоступно). Система даёт рекомендацию, решение принимает человек."),
          h("li", null, h("b", null, "Запрос данных: "), "если не хватает информации, сотрудник запрашивает документы — клиент отвечает в кабинете, заявка возвращается в очередь."))),
      h("div", { class: "grid-bars card" }, h("h3", null, "Заявки по статусам"), bars.map(([k, v, n]) => h("div", { class: "bar-row" }, h("span", { class: "bar-l" }, v.label), h("span", { class: "bar-t" }, h("span", { class: "bar " + v.tone, style: `width:${(n / max) * 100}%` })), h("b", null, n)))),
      h("div", { class: "filters" },
        h("input", { type: "search", placeholder: "Поиск: номер, компания, ИНН", value: F.q, "aria-label": "Поиск", oninput: (e) => { F.q = e.target.value; draw(); } }),
        sel("status", Object.entries(S.STATUS).filter(([k]) => k !== "draft").map(([k, v]) => [k, v.label]), "Все статусы"), sel("product", Object.values(S.PRODUCTS).map((p) => [p.id, p.name]), "Все продукты"),
        h("label", { class: "check inline-check" }, h("input", { type: "checkbox", checked: F.attn, onchange: (e) => { F.attn = e.target.checked; draw(); } }), h("span", null, "Только ожидающие решения"))),
      tbl);
    draw();
    Bank.refresh = () => { if (document.activeElement && document.activeElement.tagName === "INPUT" && root.contains(document.activeElement)) return; root.replaceChildren(); Bank.Queue(root); };
  };

  /* ============ Карточка заявки ============ */
  Bank.Case = (root, id) => {
    const mount = h("div"); root.append(mount);
    let mode = null; const form = {};

    function draw() {
      const a = S.app(id);
      if (!a) return mount.replaceChildren(UI.empty("Заявка не найдена", "", h("a", { class: "btn", href: "#/bank" }, "К списку")));
      const d = a.ml && a.ml.decision, co = S.company(a.inn) || {};
      if (!mode) mode = !d ? "info" : d.decision === "counteroffer" ? "terms" : d.decision === "approved" ? "approve" : d.decision === "rejected" ? "reject" : "info";
      mount.replaceChildren(
        h("a", { class: "back", href: "#/bank" }, ic("left", 18), "К списку заявок"),
        h("div", { class: "page-head" }, h("div", null, h("h1", null, a.companyName), h("div", { class: "muted" }, `Заявка ${a.id} · ${UI.productLabel(a.product)} · создана ${U.dt(a.createdAt)}`)), h("div", { class: "head-end" }, UI.chip(a.status, "bank"), !a.assignee && !S.FINAL.includes(a.status) ? h("button", { class: "btn small ghost", onclick: () => S.takeInWork(a.id) }, "Взять в работу") : h("span", { class: "muted small" }, a.assignee ? "Ответственный: " + a.assignee : ""))),
        h("div", { class: "summary-tiles" }, [["Запрошено", U.money(a.amount)], ["Срок", U.months(a.term)], ["Скоринговый балл", d && d.score ? d.score : "—"], ["Рекомендация", d ? REC[d.decision] : "Нет данных"]].map(([k, v]) => h("div", { class: "card tile" }, h("div", { class: "muted small" }, k), h("div", { class: "tile-val" }, v)))),
        h("div", { class: "case-grid" },
          h("div", { class: "col" }, clientCard(a, co), financeCard(a, d), bureauCard(a, d), docsCard(a)),
          h("div", { class: "col" }, scoringCard(a, d), actionCard(a, d), h("div", { class: "card" }, h("h3", null, "История и комментарии"), UI.timeline(a.events)))));
    }

    function clientCard(a, co) {
      const reg = ((a.ml && a.ml.decision && a.ml.decision.trace) || []).find((t) => t.step === "egrul");
      const r = reg && reg.result;
      return h("div", { class: "card" }, h("h3", null, "Клиент и компания"), UI.kv([
        ["Название", a.companyName], ["ИНН", a.inn], ["Форма", co.orgForm === "IP" ? "ИП" : "ООО"], r && r.okved ? ["ОКВЭД", r.okved] : null, ["Год регистрации", co.regYear], ["Возраст бизнеса", co.ageMonths ? U.months(co.ageMonths) : "—"],
        ["Заявитель", co.contact ? `${co.contact.name}, ${(S.ROLES[co.contact.role] || "").toLowerCase()}` : "—"], ["Сотрудников", a.fin.employees]]));
    }
    function financeCard(a, d) {
      const f = a.fin, r = f.revenue || 1;
      return h("div", { class: "card" }, h("h3", null, "Финансовые показатели за 12 месяцев"), UI.kv([
        ["Выручка", U.money(f.revenue)], ["Чистая прибыль", `${U.money(f.netProfit)} (${U.pct(f.netProfit / r)})`], ["Долги", `${U.money(f.debt)} (${U.pct(f.debt / r, 0)} выручки)`],
        ["Остатки на счетах", `${U.money(f.avgBalance)} (${U.pct(f.avgBalance / r)})`], ["Динамика выручки", S.PATTERNS[f.pattern].label], d && d.payment_to_income != null ? ["Платёж к прибыли", d.payment_to_income.toFixed(2).replace(".", ",")] : null]));
    }
    function bureauCard(a, d) {
      const b = ((d && d.trace) || []).find((t) => t.step === "bureau");
      return h("div", { class: "card" }, h("h3", null, "Проверки (смоделированные интеграции)"),
        !d ? h("p", { class: "muted" }, "Проверки не выполнялись") : [
          h("div", { class: "reg ok" }, ic("check", 18), h("div", null, "ЕГРЮЛ/ЕГРИП: ", ((d.trace || []).find((t) => t.step === "egrul") || { result: {} }).result.status === "active" ? "действует" : "—")),
          !b ? null : b.result === "unavailable" ? h("div", { class: "reg bad" }, ic("alert", 18), h("div", null, "Бюро кредитных историй недоступно — оцените кредитную историю вручную")) :
            h("div", null, h("div", { class: "reg ok" }, ic("check", 18), h("div", null, "Бюро кредитных историй: данные получены")), UI.kv([["Длина истории", b.result.history_months ? U.months(b.result.history_months) : "нет истории"], ["Просрочек", b.result.delinq_cnt], ["Макс. просрочка", b.result.max_dpd + " дн."], ["Действующих кредитов", b.result.active_loans]]))]);
    }
    function docsCard(a) {
      return h("div", { class: "card" }, h("h3", null, "Документы клиента"), a.docs.length ? a.docs.map((x) => UI.docItem(x)) : h("p", { class: "muted" }, "Документы не приложены — можно запросить у клиента."));
    }

    function scoringCard(a, d) {
      if (!d || d.pd == null) return h("div", { class: "card" }, h("h3", null, "Скоринг"), h("div", { class: "alert warn" }, ic("alert", 20), h("div", null, a.ml && a.ml.error ? a.ml.error + ". " : "", (d && d.reasons && d.reasons[0]) || "Автоматическая оценка не получена.", " Примите решение вручную по данным заявки и документам.")));
      const max = Math.max(0.01, ...(d.risk_factors || []).map((f) => f.contribution));
      return h("div", { class: "card" }, h("h3", null, "Скоринг и рекомендация"),
        h("div", { class: "score-row" }, U.gauge(d.pd, d.grade), h("div", null, h("div", { class: "muted small" }, "Скор / класс риска"), h("div", { class: "score-val" }, d.score, h("span", { class: "grade " + GRADE_COL[d.grade] }, d.grade)), h("div", { class: "muted small" }, `Модель ${d.model_version}, правила ${d.rules_version}`))),
        h("div", { class: "rec" }, h("b", null, "Рекомендация системы: "), REC[d.decision], d.offer ? ` — ${U.money(d.offer.amount)}, ${U.months(d.offer.term)}, ${U.pct(d.offer.rate, 2)}` : ""),
        (d.risk_factors || []).length ? h("div", null, h("div", { class: "muted small" }, "Факторы, повышающие риск"), d.risk_factors.map((f) => h("div", { class: "bar-row" }, h("span", { class: "bar-l wide" }, f.text), h("span", { class: "bar-t" }, h("span", { class: "bar red", style: `width:${(f.contribution / max) * 100}%` }))))) : h("p", { class: "muted small" }, "Существенных факторов риска не выявлено."),
        h("p", { class: "muted small" }, "Скоринг — оценка риска, а не решение: итоговое решение учитывает продукт, сумму, проверки и правила банка."));
    }

    /* ----- панель решений ----- */
    function actionCard(a, d) {
      if (a.status === "need_info") return h("div", { class: "card" }, h("h3", null, "Ожидаем ответ клиента"), h("p", { class: "quote" }, a.infoRequest.text), h("div", { class: "muted small" }, `Запрос от ${U.dt(a.infoRequest.at)} · ${a.infoRequest.by}`), commentBox(a));
      if (a.status !== "manual_review") return h("div", { class: "card" }, h("h3", null, "Решение"), resultSummary(a), commentBox(a));
      const tabs = [["approve", "Одобрить"], ["terms", "Другие условия"], ["info", "Запросить данные"], ["reject", "Отказать"]];
      return h("div", { class: "card action-card" }, h("h3", null, "Решение по заявке"),
        a.flags.infoReceived && a.infoRequest && a.infoRequest.response ? h("div", { class: "alert info" }, ic("info", 20), h("div", null, h("b", null, "Ответ клиента: "), a.infoRequest.response.text, a.infoRequest.response.docs.length ? ` (файлы: ${a.infoRequest.response.docs.join(", ")})` : "")) : null,
        h("div", { class: "seg tabs", role: "tablist" }, tabs.map(([k, l]) => h("button", { type: "button", role: "tab", "aria-selected": mode === k, class: mode === k ? "sel" : "", onclick: () => { mode = k; draw(); } }, l))),
        mode === "approve" || mode === "terms" ? termsForm(a, d, mode === "terms") : mode === "info" ? infoForm(a) : rejectForm(a));
    }
    function resultSummary(a) {
      if (a.offer) return UI.kv([["Условия", UI.terms(a.offer)], ["Ставка", U.pct(a.offer.rate, 2)], ["Платёж", U.money(a.offer.payment) + " / мес"], ["Принято", a.offer.source === "employee" ? "сотрудником" : "автоматически"]]);
      if (a.rejectReason) return h("div", null, h("b", null, "Причины отказа: "), a.rejectReason.join("; "));
      return h("p", { class: "muted" }, "Решение принимается автоматически.");
    }
    function commentBox(a) {
      const t = h("input", { placeholder: "Внутренний комментарий (клиент не видит)", "aria-label": "Комментарий" });
      return h("div", { class: "comment-box" }, t, h("button", { class: "btn small ghost", onclick: () => { if (t.value.trim()) { S.addComment(a.id, t.value.trim()); } } }, "Добавить"));
    }

    function termsForm(a, d, editable) {
      const base = (d && d.offer) || null, pd = d && d.pd != null ? d.pd : 0.06;
      const init = editable ? { amount: (base || a).amount, term: (base || a).term, rate: (base || {}).rate || S.rateFor(a.product, pd) } : { amount: a.amount, term: a.term, rate: (d && d.offer && d.offer.amount === a.amount ? d.offer.rate : S.rateFor(a.product, pd)) };
      const k = "t" + editable; if (!form[k] || form[k].a !== a.id) form[k] = { a: a.id, ...init };
      const T = form[k], p = S.PRODUCTS[a.product], f = a.fin;
      const out = h("div", { class: "calc" }), com = h("textarea", { rows: 2, placeholder: "Комментарий клиенту (необязательно)" });
      const calc = () => {
        const pay = U.annuity(T.amount || 0, T.term || 1, T.rate), inc = (f.revenue / 12) * Math.max(f.netProfit / f.revenue, 0.01), pti = pay / inc;
        T.err = !T.amount || T.amount < p.min || T.amount > p.max ? `Сумма: от ${U.money(p.min)} до ${U.money(p.max)}` : !T.term || T.term < p.tmin || T.term > p.tmax ? `Срок: от ${p.tmin} до ${p.tmax} мес.` : !(T.rate >= 0.01 && T.rate <= 0.6) ? "Ставка: от 1% до 60%" : null;
        out.replaceChildren(h("div", null, h("span", { class: "muted small" }, "Платёж в месяц"), h("b", null, U.money(pay))), h("div", null, h("span", { class: "muted small" }, "Платёж к прибыли"), h("b", { class: pti > 0.55 ? "bad-text" : "" }, pti.toFixed(2).replace(".", ","))), pti > 0.55 ? h("div", { class: "small bad-text" }, "Выше лимита 0,55 — платёж может быть тяжёлым для бизнеса") : null, T.err ? h("div", { class: "err" }, T.err) : null);
      };
      const amt = U.moneyInput({ value: T.amount, onInput: (v) => { T.amount = v; calc(); } });
      const term = h("input", { type: "number", value: T.term, oninput: (e) => { T.term = +e.target.value; calc(); } });
      const rate = h("input", { type: "number", step: "0.1", value: +(T.rate * 100).toFixed(2), oninput: (e) => { T.rate = +e.target.value / 100; calc(); } });
      if (!editable) { amt.disabled = term.disabled = true; }
      calc();
      return h("div", null, h("div", { class: "form-grid" }, UI.field("Сумма, ₽", amt), UI.field("Срок, мес.", term), UI.field("Ставка, % годовых", rate)), out, com,
        h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => { calc(); if (T.err) return U.toast(T.err, "warn"); S.bankApprove(a.id, { amount: T.amount, term: T.term, rate: T.rate }, com.value.trim()); mode = null; U.toast("Предложение отправлено клиенту", "ok"); } }, editable ? "Одобрить на этих условиях" : "Одобрить заявку")));
    }
    function infoForm(a) {
      const txt = h("textarea", { rows: 3, placeholder: "Что нужно уточнить у клиента?" }), checks = Object.entries(S.DOC_KINDS).filter(([k]) => k !== "other").map(([k, v]) => [k, v, h("input", { type: "checkbox", value: k, checked: !a.docs.some((x) => x.kind === k) })]);
      return h("div", null, txt, h("div", { class: "muted small" }, "Запросить документы:"), checks.map(([k, v, c]) => h("label", { class: "check" }, c, h("span", null, v))),
        h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => { if (!txt.value.trim()) return U.toast("Опишите, что нужно уточнить", "warn"); S.bankRequestInfo(a.id, txt.value.trim(), checks.filter(([, , c]) => c.checked).map(([k]) => k)); mode = null; U.toast("Запрос отправлен клиенту", "ok"); } }, "Отправить запрос")));
    }
    function rejectForm(a) {
      const reason = h("select", { "aria-label": "Причина отказа" }, h("option", { value: "" }, "Выберите причину"), REJECT_REASONS.map((r) => h("option", null, r))), com = h("textarea", { rows: 2, placeholder: "Комментарий (по желанию)" });
      return h("div", null, UI.field("Причина отказа", reason), com, h("div", { class: "actions" }, h("button", { class: "btn danger", onclick: () => { if (!reason.value) return U.toast("Выберите причину отказа", "warn"); S.bankReject(a.id, reason.value, com.value.trim()); mode = null; U.toast("Отказ зафиксирован, клиент уведомлён", "ok"); } }, "Отказать")));
    }

    Bank.refresh = () => { if (document.activeElement && ["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement.tagName) && mount.contains(document.activeElement)) return; draw(); };
    draw();
  };
})();
