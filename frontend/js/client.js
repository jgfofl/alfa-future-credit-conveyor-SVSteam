(function () {
  const U = window.U, S = window.Store, UI = window.UI, ML = window.ML;
  const { h, ic } = U;
  const Client = (window.Client = {});

  const NEXT = {
    submitted: "Заявка принята, начинаем проверку", scoring: "Идёт проверка — это займёт меньше минуты", manual_review: "Сотрудник банка изучает заявку",
    need_info: "Нужен ваш ответ", offer: "Посмотрите условия и примите решение", signing: "Подпишите договор", disbursed: "Кредит выдан", rejected: "Подробности внутри", declined: "Вы отказались от предложения",
  };
  const ACTION = ["need_info", "offer", "signing"];

  /* ============ Главная ============ */
  Client.Dashboard = (root) => {
    const u = S.user(), apps = S.appsOf(u.id), co = u.inn && S.company(u.inn);
    const active = apps.filter((a) => ACTION.includes(a.status));
    root.append(
      h("section", { class: "hero" },
        h("div", null,
          h("h1", null, "Здравствуйте, " + u.name.split(" ")[0]),
          h("p", null, "Оформите кредит для бизнеса прямо здесь: выберите продукт, заполните заявку и следите за решением. Все шаги — в одном кабинете.")),
        h("button", { class: "btn big", onclick: () => go("/client/new") }, ic("plus", 20), S.draft(u.id) ? "Продолжить заявку" : "Подать заявку на кредит")),
      active.length ? h("div", { class: "alert warn" }, ic("alert", 22), h("div", null, h("b", null, "Нужны ваши действия: "), active.map((a) => h("a", { href: "#/client/app/" + a.id }, a.id + " — " + NEXT[a.status].toLowerCase())).flatMap((x, i) => (i ? [", ", x] : [x])))) : null,
      h("div", { class: "grid-2" },
        h("section", null,
          h("h2", null, "Мои заявки"),
          apps.length ? h("div", { class: "list" }, apps.map((a) =>
            h("a", { class: "app-row" + (ACTION.includes(a.status) ? " attn" : ""), href: "#/client/app/" + a.id },
              h("div", null, h("div", { class: "row-title" }, UI.productLabel(a.product), h("span", { class: "muted" }, " · " + a.id)),
                h("div", { class: "muted" }, UI.terms(a)), h("div", { class: "next" }, NEXT[a.status])),
              h("div", { class: "row-end" }, UI.chip(a.status), ic("right", 18))))) :
            UI.empty("Заявок пока нет", "Нажмите «Подать заявку на кредит» — это займёт около 5 минут.")),
        h("aside", null,
          h("h2", null, "Моя компания"),
          h("div", { class: "card" }, co ? [h("div", { class: "co-name" }, co.name), UI.kv([["ИНН", co.inn], ["Форма", co.orgForm === "IP" ? "ИП" : "ООО"], ["Год регистрации", co.regYear], ["Контактное лицо", co.contact ? co.contact.name + ", " + (S.ROLES[co.contact.role] || "").toLowerCase() : null]]),
            h("p", { class: "muted small" }, "Эти данные подставятся в новые заявки автоматически — повторно вводить их не нужно.")] :
            h("p", { class: "muted" }, "Данные компании появятся здесь после первой заявки и будут подставляться автоматически.")),
          h("h2", null, "Как это работает"),
          h("ol", { class: "how" }, ["Выберите продукт под вашу задачу", "Заполните заявку и приложите документы", "Банк проверит данные и примет решение", "Подпишите договор и получите деньги"].map((t) => h("li", null, t))))));
  };

  /* ============ Мастер заявки ============ */
  const STEPS = ["Цель и продукт", "Сумма и срок", "Компания", "Финансы", "Документы", "Проверка"];
  const SLOTS = ["bank_statement", "fin_report", "purpose_doc"];

  Client.Wizard = (root) => {
    const u = S.user();
    const last = S.appsOf(u.id)[0];
    const knownCo = u.inn && S.company(u.inn);
    const W = S.draft(u.id) || {
      step: 0, goal: null, product: null, amount: null, term: null, inn: u.inn || "", company: knownCo ? { ...knownCo } : null,
      contactName: knownCo && knownCo.contact ? knownCo.contact.name : u.name, contactRole: knownCo && knownCo.contact ? knownCo.contact.role : "ceo",
      fin: last ? { ...last.fin } : { revenue: null, netProfit: null, debt: null, avgBalance: null, pattern: "stable", employees: null }, docs: [], consent: false,
    };
    if (W.company && !W.contactName) W.contactName = u.name;
    W.errors = {};
    let timer;
    const persist = () => { clearTimeout(timer); timer = setTimeout(() => S.saveDraft(u.id, { ...W, errors: undefined }), 250); };
    const P = () => S.PRODUCTS[W.product];
    const estimate = () => (W.product && W.amount && W.term ? Math.round(U.annuity(W.amount, W.term, P().rate)) : null);

    const validate = (step) => {
      const e = {}, f = W.fin;
      if (step === 0 && !W.product) e.product = "Выберите кредитный продукт";
      if (step === 1) {
        if (!W.amount || W.amount < P().min || W.amount > P().max) e.amount = `Сумма — от ${U.money(P().min)} до ${U.money(P().max)}`;
        if (!W.term || W.term < P().tmin || W.term > P().tmax) e.term = `Срок — от ${P().tmin} до ${P().tmax} мес.`;
      }
      if (step === 2) {
        if (!/^\d{10}$|^\d{12}$/.test(W.inn || "")) e.inn = "ИНН состоит из 10 цифр (организация) или 12 цифр (ИП)";
        else if (!W.company || W.company.inn !== W.inn) e.inn = "Нажмите «Найти в реестре», чтобы проверить компанию";
        else if (W.company.status && W.company.status !== "active") e.inn = "Организация ликвидирована — оформить кредит нельзя";
        if (!W.company || !(W.company.name || "").trim()) e.name = "Укажите название компании";
        if (!(W.contactName || "").trim()) e.contactName = "Укажите ФИО";
        if (!W.fin.employees || W.fin.employees < 1) e.employees = "Укажите число сотрудников";
      }
      if (step === 3) {
        if (!f.revenue || f.revenue <= 0) e.revenue = "Укажите выручку за последние 12 месяцев";
        if (f.netProfit == null) e.netProfit = "Укажите чистую прибыль (если убыток — со знаком минус)";
        if (f.debt == null) e.debt = "Укажите сумму долгов (0, если их нет)";
        if (f.avgBalance == null) e.avgBalance = "Укажите средние остатки (0, если нет)";
      }
      if (step === 5 && !W.consent) e.consent = "Нужно согласие на обработку данных и запрос кредитной истории";
      return e;
    };
    const valid = (s) => !Object.keys(validate(s)).length;
    const firstBad = () => [0, 1, 2, 3].find((s) => !valid(s));

    const nav = h("ol", { class: "wiz-nav" }), card = h("section", { class: "card wiz-card" }), side = h("aside", { class: "card wiz-side" });
    root.append(h("a", { class: "back", href: "#/client" }, ic("left", 18), "К заявкам"), h("h1", null, "Заявка на кредит"), h("div", { class: "wiz" }, nav, card, side));

    function renderNav() {
      nav.replaceChildren(...STEPS.map((t, i) => h("li", { class: (i === W.step ? "active " : "") + (i < W.step && valid(i) ? "done" : "") },
        h("button", { type: "button", disabled: i > W.step && !(i <= 5 && [...Array(i).keys()].every((k) => k > 3 || valid(k))), onclick: () => { W.step = i; draw(); } },
          h("span", { class: "ph-dot" }, i < W.step && valid(i) ? ic("check", 14) : i + 1), h("span", null, t)))));
    }
    function renderSide() {
      const p = W.product && P(), est = estimate();
      side.replaceChildren(h("h3", null, "Ваша заявка"),
        UI.kv([["Продукт", p ? p.name : "—"], ["Сумма", W.amount ? U.money(W.amount) : "—"], ["Срок", W.term ? U.months(W.term) : "—"], ["Компания", W.company && W.company.name ? W.company.name : "—"]]),
        est ? h("div", { class: "est" }, h("div", { class: "muted small" }, "Ориентировочный платёж"), h("div", { class: "est-val" }, "от " + U.money(est) + " / мес"), h("div", { class: "muted small" }, `при ставке от ${U.pct(p.rate, 0)}. Итоговую ставку определит банк.`)) : null,
        h("div", { class: "muted small" }, "Черновик сохраняется автоматически — можно вернуться позже."));
    }
    const err = (k) => W.errors[k];
    const setF = (obj, k) => (v) => { obj[k] = v; persist(); renderSide(); };

    function productCard(p) {
      const rec = W.goal && S.GOALS.find((g) => g.id === W.goal).product === p.id;
      return h("button", { type: "button", class: "choice" + (W.product === p.id ? " sel" : ""), "aria-pressed": W.product === p.id, onclick: () => pickProduct(p.id) },
        rec ? h("span", { class: "badge" }, "Рекомендуем") : null, h("b", null, p.name), h("span", { class: "muted" }, p.desc),
        h("span", { class: "meta" }, `от ${U.pct(p.rate, 0)} · до ${U.months(p.tmax)} · до ${U.money(p.max)}`));
    }
    function pickProduct(id) {
      W.product = id; const p = S.PRODUCTS[id];
      W.amount = U.clamp(W.amount || 1000000, p.min, p.max); W.term = U.clamp(W.term || 12, p.tmin, p.tmax);
      persist(); draw();
    }

    function stepProduct() {
      return [h("h2", null, "Для чего нужны деньги?"), h("p", { class: "muted" }, "Выберите цель — мы подскажем подходящий продукт. Или выберите продукт сами ниже."),
        h("div", { class: "choices" }, S.GOALS.map((g) => h("button", { type: "button", class: "choice" + (W.goal === g.id ? " sel" : ""), "aria-pressed": W.goal === g.id, onclick: () => { W.goal = g.id; pickProduct(g.product); } },
          h("b", null, g.title), h("span", { class: "muted" }, g.text)))),
        h("h3", null, "Кредитные продукты"),
        h("div", { class: "choices" }, Object.values(S.PRODUCTS).map(productCard)),
        err("product") ? h("div", { class: "err", role: "alert" }, err("product")) : null];
    }

    function stepTerms() {
      const p = P(), est = estimate();
      const amt = U.moneyInput({ id: "amount", value: W.amount, ariaLabel: "Сумма", onInput: (v) => { W.amount = v; slider.value = v || p.min; persist(); renderSide(); refreshEst(); } });
      const slider = h("input", { type: "range", min: p.min, max: p.max, step: p.min >= 1000000 ? 100000 : 50000, value: W.amount, "aria-label": "Сумма ползунком", oninput: () => { W.amount = +slider.value; amt.value = U.num(W.amount); persist(); renderSide(); refreshEst(); } });
      const term = h("input", { type: "range", min: p.tmin, max: p.tmax, step: 1, value: W.term, "aria-label": "Срок", oninput: () => { W.term = +term.value; tl.textContent = U.months(W.term); persist(); renderSide(); refreshEst(); } });
      const tl = h("span", { class: "range-val" }, U.months(W.term));
      const estEl = h("div", { class: "est big" });
      const refreshEst = () => { const e = estimate(); estEl.replaceChildren(h("div", { class: "muted small" }, "Ориентировочный платёж"), h("div", { class: "est-val" }, e ? "от " + U.money(e) + " / мес" : "—"), h("div", { class: "muted small" }, `Ставка от ${U.pct(p.rate, 0)} — зависит от оценки банка; точные условия вы увидите в предложении.`)); };
      refreshEst();
      return [h("h2", null, p.name + ": сумма и срок"), h("p", { class: "muted" }, p.desc),
        UI.field("Сумма кредита, ₽", amt, { id: "amount", error: err("amount"), hint: `От ${U.money(p.min)} до ${U.money(p.max)}` }), slider,
        h("div", { class: "field" }, h("label", null, "Срок кредита ", tl), term, err("term") ? h("div", { class: "err" }, err("term")) : null, h("div", { class: "hint" }, `От ${p.tmin} до ${p.tmax} мес.`)), estEl];
    }

    async function lookup() {
      const inn = (W.inn || "").trim();
      W.errors = {};
      if (!/^\d{10}$|^\d{12}$/.test(inn)) { W.errors.inn = "ИНН состоит из 10 цифр (организация) или 12 цифр (ИП)"; return draw(); }
      try {
        const r = await ML.company(inn);
        const prev = (W.company && W.company.inn === inn ? W.company : S.company(inn)) || {};
        W.company = { ...prev, inn, status: r.status, okved: r.okved, regYear: r.reg_year, ageMonths: r.age_months, orgForm: r.legal_form, name: prev.name || "" };
        W.manualCo = false;
      } catch (e) {
        if (e.status === 404) { W.company = null; W.errors.inn = "Такой ИНН не найден в ЕГРЮЛ/ЕГРИП — проверьте цифры"; }
        else { W.manualCo = true; W.company = { ...(W.company || {}), inn, status: "active", name: (W.company || {}).name || "", orgForm: inn.length === 12 ? "IP" : "OOO", regYear: (W.company || {}).regYear || 2020, okved: "—", ageMonths: 0 }; U.toast("Реестр временно недоступен — укажите данные вручную", "warn"); }
      }
      persist(); draw();
    }

    function stepCompany() {
      const c = W.company, f = W.fin;
      const inn = h("input", { id: "inn", inputmode: "numeric", maxlength: 12, autocomplete: "off", value: W.inn || "", oninput: () => { W.inn = inn.value.replace(/\D/g, ""); inn.value = W.inn; if (W.company && W.company.inn !== W.inn) { W.company = null; } persist(); } });
      inn.addEventListener("keydown", (e) => e.key === "Enter" && (e.preventDefault(), lookup()));
      const name = h("input", { id: "coname", value: c ? c.name || "" : "", disabled: !c, placeholder: c ? "" : "Сначала найдите компанию по ИНН", oninput: () => { c.name = name.value; persist(); renderSide(); } });
      const role = h("select", { id: "role", onchange: () => { W.contactRole = role.value; persist(); } }, Object.entries(S.ROLES).map(([k, v]) => h("option", { value: k, selected: W.contactRole === k }, v)));
      const emp = h("input", { id: "emp", type: "number", min: 1, value: f.employees || "", oninput: () => { f.employees = +emp.value || null; persist(); } });
      return [h("h2", null, "О компании"),
        h("div", { class: "inline" }, UI.field("ИНН", inn, { id: "inn", error: err("inn"), hint: "Для демо: 7701234567 — действует; 7701234500 — ликвидирована; 7701234599 — бюро недоступно" }), h("button", { type: "button", class: "btn dark", onclick: lookup }, "Найти в реестре")),
        c ? h("div", { class: "reg " + (c.status === "liquidated" ? "bad" : "ok") }, ic(c.status === "liquidated" ? "alert" : "check", 20),
          h("div", null, h("b", null, c.status === "liquidated" ? "Организация ликвидирована" : "Найдено в ЕГРЮЛ/ЕГРИП: действует"),
            h("div", { class: "muted small" }, `${c.orgForm === "IP" ? "ИП" : "ООО"} · основной ОКВЭД ${c.okved} · зарегистрирована в ${c.regYear} г.`))) : null,
        W.manualCo ? h("div", { class: "alert warn" }, ic("info", 20), h("div", null, "Реестр недоступен. Проверка будет выполнена банком позже. Год регистрации:", " ", h("input", { class: "mini", type: "number", value: c.regYear, onchange: (e) => { c.regYear = +e.target.value; c.ageMonths = Math.max(0, (new Date().getFullYear() - c.regYear) * 12); persist(); } }))) : null,
        h("div", { class: "form-grid" },
          UI.field("Название компании", name, { id: "coname", error: err("name") }),
          UI.field("Число сотрудников", emp, { id: "emp", error: err("employees") }),
          UI.field("Ваше ФИО", h("input", { id: "cn", value: W.contactName || "", oninput: (e) => { W.contactName = e.target.value; persist(); } }), { id: "cn", error: err("contactName") }),
          UI.field("Ваша роль в компании", role, { id: "role" })),
        h("p", { class: "muted small" }, "Данные компании сохраняются в профиле и подставляются в следующие заявки.")];
    }

    async function autofill(file) {
      try {
        const txt = await U.readText(file); let o = {};
        if (/\.json$/i.test(file.name)) o = JSON.parse(txt);
        else {
          const rows = txt.trim().split(/\r?\n/).map((r) => r.split(/[;,\t]/).map((x) => x.trim()));
          if (rows.length >= 2 && rows[0].length > 2) rows[0].forEach((k, i) => (o[k] = rows[1][i]));
          else rows.forEach((r) => r.length >= 2 && (o[r[0]] = r[1]));
        }
        const pick = (...ks) => { for (const k of ks) { const v = o[k]; if (v !== undefined && v !== "" && !isNaN(Number(v))) return Number(v); } return null; };
        const rev = pick("revenue_12m", "revenue", "выручка"), np = pick("net_profit_12m", "net_profit", "чистая_прибыль"), debt = pick("debt_total", "debt", "долги"), bal = pick("avg_balance", "остатки");
        const pat = String(o.revenue_pattern || o.pattern || "").toLowerCase();
        if (rev == null && np == null && debt == null && bal == null) throw new Error("no keys");
        Object.assign(W.fin, { ...(rev != null && { revenue: rev }), ...(np != null && { netProfit: np }), ...(debt != null && { debt }), ...(bal != null && { avgBalance: bal }), ...(S.PATTERNS[pat] && { pattern: pat }) });
        persist(); draw(); U.toast("Показатели загружены из файла", "ok");
      } catch (e) { U.toast("Не удалось прочитать файл. Скачайте образец и сверьте формат.", "warn"); }
    }

    function stepFinance() {
      const f = W.fin, mi = (k, neg) => U.moneyInput({ id: k, value: f[k], allowNegative: neg, onInput: (v) => { f[k] = v; persist(); ratios(); } });
      const rat = h("div", { class: "ratios" });
      const ratios = () => { const r = f.revenue || 0; rat.replaceChildren(
        h("div", null, h("span", { class: "muted small" }, "Рентабельность"), h("b", null, r && f.netProfit != null ? U.pct(f.netProfit / r) : "—")),
        h("div", null, h("span", { class: "muted small" }, "Долги к выручке"), h("b", null, r && f.debt != null ? U.pct(f.debt / r, 0) : "—")),
        h("div", null, h("span", { class: "muted small" }, "Остатки к выручке"), h("b", null, r && f.avgBalance != null ? U.pct(f.avgBalance / r) : "—"))); };
      ratios();
      const sample = () => U.download("pokazateli_primer.json", JSON.stringify({ revenue_12m: 18000000, net_profit_12m: 2700000, debt_total: 3600000, avg_balance: 2160000, revenue_pattern: "stable" }, null, 2), "application/json");
      return [h("h2", null, "Финансовые показатели"), h("p", { class: "muted" }, "За последние 12 месяцев. Данные можно взять из отчётности или загрузить файлом."),
        h("div", { class: "drop" }, ic("upload", 22), h("div", null, h("b", null, "Загрузить показатели файлом"), h("div", { class: "muted small" }, "JSON или CSV — поля заполнятся автоматически. ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); sample(); } }, "Скачать образец"))), UI.filePicker("Выбрать файл", autofill, { accept: ".json,.csv", kind: "dark" })),
        h("div", { class: "form-grid" },
          UI.field("Выручка за 12 месяцев, ₽", mi("revenue"), { id: "revenue", error: err("revenue") }),
          UI.field("Чистая прибыль за 12 месяцев, ₽", mi("netProfit", true), { id: "netProfit", error: err("netProfit"), hint: "Убыток — со знаком минус" }),
          UI.field("Текущие долги по кредитам и займам, ₽", mi("debt"), { id: "debt", error: err("debt"), hint: "Общий остаток задолженности" }),
          UI.field("Средние остатки на счетах, ₽", mi("avgBalance"), { id: "avgBalance", error: err("avgBalance") })),
        rat,
        h("div", { class: "field" }, h("label", null, "Как меняется выручка по месяцам?"),
          h("div", { class: "seg" }, Object.entries(S.PATTERNS).map(([k, v]) => h("button", { type: "button", class: f.pattern === k ? "sel" : "", "aria-pressed": f.pattern === k, onclick: () => { f.pattern = k; persist(); draw(); } }, v.label))))];
    }

    function stepDocs() {
      const slotBox = (kind, optional) => {
        const d = W.docs.find((x) => x.kind === kind);
        return h("div", { class: "slot" }, h("div", null, h("b", null, S.DOC_KINDS[kind]), h("div", { class: "muted small" }, optional ? "По желанию" : "Рекомендуем приложить")),
          d ? UI.docItem(d, { onRemove: () => { W.docs = W.docs.filter((x) => x !== d); persist(); draw(); } }) :
            UI.filePicker("Загрузить", async (file) => { W.docs.push(await S.makeDoc(kind, file, u.name)); persist(); draw(); }));
      };
      return [h("h2", null, "Документы"), h("p", { class: "muted" }, "Файлы ускоряют рассмотрение. Если чего-то нет под рукой — отправьте заявку, банк запросит недостающее прямо в кабинете."),
        SLOTS.map((k, i) => slotBox(k, i === 2)), h("p", { class: "muted small" }, "Форматы: PDF, JPG, PNG, DOC(X), XLS(X), CSV. В демо-версии содержимое сохраняется для файлов до 400 КБ.")];
    }

    function stepReview() {
      const c = W.company || {}, f = W.fin, p = P(), est = estimate();
      const cb = h("input", { type: "checkbox", id: "consent", checked: W.consent, onchange: () => { W.consent = cb.checked; persist(); } });
      return [h("h2", null, "Проверьте заявку"),
        h("div", { class: "review" },
          h("div", null, h("h3", null, "Кредит"), UI.kv([["Продукт", p.name], ["Сумма", U.money(W.amount)], ["Срок", U.months(W.term)], ["Платёж", est ? "от " + U.money(est) + " / мес" : "—"]])),
          h("div", null, h("h3", null, "Компания"), UI.kv([["Название", c.name], ["ИНН", c.inn], ["Контакт", `${W.contactName}, ${(S.ROLES[W.contactRole] || "").toLowerCase()}`], ["Сотрудников", f.employees]])),
          h("div", null, h("h3", null, "Финансы"), UI.kv([["Выручка", U.money(f.revenue)], ["Чистая прибыль", U.money(f.netProfit)], ["Долги", U.money(f.debt)], ["Остатки на счетах", U.money(f.avgBalance)], ["Выручка", S.PATTERNS[f.pattern].label.toLowerCase()]])),
          h("div", null, h("h3", null, "Документы"), W.docs.length ? W.docs.map((d) => UI.docItem(d)) : h("p", { class: "muted" }, "Не приложены — банк может запросить их позже"))),
        h("label", { class: "check" + (err("consent") ? " has-error" : "") }, cb, h("span", null, "Согласен на обработку данных компании и запрос информации в бюро кредитных историй и государственных реестрах")),
        err("consent") ? h("div", { class: "err", role: "alert" }, err("consent")) : null];
    }

    function submit() {
      const bad = firstBad();
      if (bad !== undefined) { W.step = bad; W.errors = validate(bad); U.toast("Заполните обязательные поля", "warn"); return draw(); }
      W.errors = validate(5);
      if (Object.keys(W.errors).length) return draw();
      const c = { ...W.company, contact: { name: W.contactName, role: W.contactRole }, employees: W.fin.employees };
      const a = S.createApp(u, { company: c, product: W.product, goal: W.goal, amount: W.amount, term: W.term, fin: { ...W.fin }, docs: W.docs });
      go("/client/app/" + a.id);
    }

    function draw() {
      const body = [stepProduct, stepTerms, stepCompany, stepFinance, stepDocs, stepReview][W.step]();
      const last = W.step === STEPS.length - 1;
      card.replaceChildren(h("div", { class: "muted small" }, `Шаг ${W.step + 1} из ${STEPS.length}`), ...body,
        h("div", { class: "wiz-actions" },
          W.step > 0 ? h("button", { class: "btn ghost", type: "button", onclick: () => { W.step--; W.errors = {}; draw(); window.scrollTo(0, 0); } }, ic("left", 18), "Назад") : h("span"),
          h("button", { class: "btn", type: "button", onclick: () => {
            if (last) return submit();
            W.errors = validate(W.step);
            if (Object.keys(W.errors).length) { draw(); const el = card.querySelector(".has-error input, .has-error select, .err"); el && el.scrollIntoView({ block: "center" }); return; }
            W.step++; W.errors = {}; persist(); draw(); window.scrollTo(0, 0);
          } }, last ? "Отправить заявку" : "Далее", last ? null : ic("right", 18))));
      renderNav(); renderSide(); persist();
    }
    if (W.step > 0 && !W.product) W.step = 0;
    draw();
  };

  /* ============ Карточка заявки клиента ============ */
  Client.Detail = (root, id) => {
    const u = S.user();
    const mount = h("div"); root.append(mount);
    function draw() {
      const a = S.app(id);
      if (!a || a.userId !== u.id) return mount.replaceChildren(UI.empty("Заявка не найдена", "Возможно, она принадлежит другой учётной записи.", h("a", { class: "btn", href: "#/client" }, "К моим заявкам")));
      mount.replaceChildren(
        h("a", { class: "back", href: "#/client" }, ic("left", 18), "К заявкам"),
        h("div", { class: "page-head" }, h("div", null, h("h1", null, UI.productLabel(a.product)), h("div", { class: "muted" }, `Заявка ${a.id} · от ${U.date(a.createdAt)} · ${UI.terms(a)}`)), UI.chip(a.status)),
        UI.stepper(a.status), banner(a),
        h("div", { class: "grid-2" },
          h("section", null, h("h2", null, "Данные заявки"), details(a)),
          h("section", null, h("h2", null, "История"), h("div", { class: "card" }, UI.timeline(a.events)))));
    }

    function banner(a) {
      const o = a.offer;
      switch (a.status) {
        case "submitted": case "scoring": {
          const sc = a.status === "scoring";
          return h("div", { class: "card status-card" }, h("div", { class: "spinner", "aria-hidden": "true" }), h("div", null, h("h2", null, "Проверяем вашу заявку"), h("p", { class: "muted" }, "Обычно это занимает меньше минуты. Страница обновится сама."),
            h("ul", { class: "checks" }, h("li", { class: "ok" }, ic("check", 16), "Заявка принята"), h("li", { class: sc ? "ok" : "wait" }, ic(sc ? "check" : "clock", 16), "Сверка с реестрами ЕГРЮЛ/ЕГРИП"), h("li", { class: "wait" }, ic("clock", 16), "Оценка кредитного риска"))));
        }
        case "manual_review":
          return h("div", { class: "card status-card" }, h("div", { class: "big-ic amber" }, ic("user", 28)), h("div", null, h("h2", null, "Заявку рассматривает сотрудник банка"),
            h("p", { class: "muted" }, "Ваша заявка требует дополнительного внимания. Если понадобятся уточнения, мы напишем здесь — вам не нужно ничего делать прямо сейчас."), a.flags.infoReceived ? h("p", { class: "small" }, "Ваш ответ получен и передан сотруднику.") : null));
        case "need_info": return infoCard(a);
        case "offer": return offerCard(a, o);
        case "signing": return signCard(a, o);
        case "disbursed":
          return h("div", { class: "card status-card success" }, h("div", { class: "big-ic green" }, ic("check", 28)), h("div", null, h("h2", null, "Кредит выдан"),
            h("p", null, `${U.money(o.amount)} зачислены на расчётный счёт ${a.contract.account}.`), UI.kv([["Договор", a.contract.number], ["Ежемесячный платёж", U.money(o.payment)], ["Ставка", U.pct(o.rate, 2) + " годовых"]]),
            h("p", { class: "muted small" }, "Подписание и выдача смоделированы в демо-версии, реальных операций нет.")));
        case "rejected": return rejectCard(a);
        case "declined": return h("div", { class: "card status-card" }, h("div", { class: "big-ic gray" }, ic("x", 28)), h("div", null, h("h2", null, "Вы отказались от предложения"), h("p", { class: "muted" }, "Заявка закрыта. Вы можете оформить новую в любой момент."), h("button", { class: "btn", onclick: () => { S.startFrom(u.id, a); go("/client/new"); } }, "Подать новую заявку")));
      }
    }

    function offerCard(a, o) {
      const diff = o.amount !== a.amount || o.term !== a.term;
      const over = o.payment * o.term - o.amount;
      return h("div", { class: "card offer" },
        h("div", { class: "offer-head" }, h("div", null, h("span", { class: "badge ok" }, diff ? "Одобрено на иных условиях" : "Одобрено"), h("h2", null, "Предложение банка")), h("div", { class: "muted small" }, o.source === "employee" ? "Решение принял сотрудник банка" : "Автоматическое решение")),
        h("div", { class: "offer-grid" }, [["Сумма", U.money(o.amount)], ["Срок", U.months(o.term)], ["Ставка", U.pct(o.rate, 2) + " годовых"], ["Платёж в месяц", U.money(o.payment)]].map(([k, v]) => h("div", null, h("div", { class: "muted small" }, k), h("div", { class: "offer-val" }, v)))),
        h("p", { class: "muted" }, `Переплата за весь срок — ${U.money(over)}.`),
        diff ? h("div", { class: "alert info" }, ic("info", 20), h("div", null, `Вы запрашивали ${UI.terms(a)}. Банк предлагает меньшую сумму или другой срок, чтобы платёж был комфортным для вашего бизнеса.`)) : null,
        a.comments.length ? h("p", { class: "small" }, h("b", null, "Комментарий банка: "), a.comments[a.comments.length - 1].text) : null,
        h("div", { class: "actions" }, h("button", { class: "btn big", onclick: () => { S.clientAccept(a.id); } }, "Принять предложение"), h("button", { class: "btn ghost", onclick: () => U.modal({ title: "Отказаться от предложения?", body: h("p", null, "Заявка будет закрыта. Новую заявку можно подать в любой момент."), actions: [{ label: "Отказаться", kind: "danger", onClick: (c) => { S.clientDecline(a.id); c(); } }, { label: "Назад", kind: "ghost" }] }) }, "Отказаться")));
    }

    function signCard(a, o) {
      if (a.signedAt) return h("div", { class: "card status-card" }, h("div", { class: "spinner" }), h("div", null, h("h2", null, "Договор подписан"), h("p", { class: "muted" }, "Перечисляем средства на ваш счёт…")));
      const cb = h("input", { type: "checkbox", id: "agree" }), btn = h("button", { class: "btn big", disabled: true, onclick: () => S.clientSign(a.id) }, "Подписать договор");
      cb.onchange = () => (btn.disabled = !cb.checked);
      return h("div", { class: "card" }, h("h2", null, "Подписание договора"), h("div", { class: "contract" },
        h("b", null, `Кредитный договор № ${"КД-" + a.id.slice(2)}/26`), h("p", null, `Банк предоставляет заёмщику «${a.companyName}» кредит в размере ${U.money(o.amount)} на срок ${U.months(o.term)} под ${U.pct(o.rate, 2)} годовых. Погашение — ежемесячными аннуитетными платежами по ${U.money(o.payment)}.`),
        h("p", { class: "muted small" }, "Учебный прототип: документ демонстрационный и не имеет юридической силы, подпись имитируется.")),
        h("label", { class: "check" }, cb, h("span", null, "Ознакомлен с условиями и подписываю договор простой электронной подписью")), h("div", { class: "actions" }, btn));
    }

    function infoCard(a) {
      const r = a.infoRequest, files = [], txt = h("textarea", { rows: 3, placeholder: "Ваш комментарий (по желанию)" });
      const fl = h("div"), send = h("button", { class: "btn", onclick: async () => {
        if (!txt.value.trim() && !files.length) return U.toast("Добавьте комментарий или документы", "warn");
        S.clientRespond(a.id, txt.value.trim() || "Документы приложены", files); U.toast("Ответ отправлен в банк", "ok");
      } }, "Отправить ответ");
      const draw2 = () => fl.replaceChildren(...files.map((d) => UI.docItem(d, { onRemove: () => { files.splice(files.indexOf(d), 1); draw2(); } })));
      const slots = (r.docs || []).map((k) => h("div", { class: "slot" }, h("b", null, S.DOC_KINDS[k]), UI.filePicker("Загрузить", async (f) => { files.push(await S.makeDoc(k, f, u.name)); draw2(); })));
      return h("div", { class: "card status-card col warn" }, h("div", { class: "row" }, h("div", { class: "big-ic amber" }, ic("alert", 28)), h("div", null, h("h2", null, "Банку нужны уточнения"), h("p", { class: "quote" }, r.text), h("div", { class: "muted small" }, `${r.by} · ${U.dt(r.at)}`))),
        slots, h("div", null, UI.filePicker("Добавить другой файл", async (f) => { files.push(await S.makeDoc("other", f, u.name)); draw2(); })), fl, txt, h("div", { class: "actions" }, send));
    }

    function rejectCard(a) {
      return h("div", { class: "card status-card col" }, h("div", { class: "row" }, h("div", { class: "big-ic red" }, ic("x", 28)), h("div", null, h("h2", null, "К сожалению, банк не может одобрить заявку"),
        h("p", { class: "muted" }, "Основные причины:"), h("ul", null, (a.rejectReason || ["решение банка"]).map((r) => h("li", null, r.charAt(0).toUpperCase() + r.slice(1)))))),
        h("div", { class: "alert info" }, ic("info", 20), h("div", null, h("b", null, "Что можно сделать: "), "уменьшить сумму, выбрать более длинный срок или другой продукт — и подать новую заявку. Данные подставятся автоматически.")),
        h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => { S.startFrom(u.id, a); go("/client/new"); } }, "Подать новую заявку с этими данными")));
    }

    function details(a) {
      const f = a.fin, c = S.company(a.inn) || {};
      const kinds = Object.entries(S.DOC_KINDS);
      let kind = "other";
      const sel = h("select", { "aria-label": "Тип документа", onchange: (e) => (kind = e.target.value) }, kinds.map(([k, v]) => h("option", { value: k, selected: k === "other" }, v)));
      return h("div", { class: "card" },
        h("h3", null, "Кредит"), UI.kv([["Продукт", UI.productLabel(a.product)], ["Запрошено", UI.terms(a)]]),
        h("h3", null, "Компания"), UI.kv([["Название", a.companyName], ["ИНН", a.inn], ["Сотрудников", f.employees]]),
        h("h3", null, "Финансы за 12 месяцев"), UI.kv([["Выручка", U.money(f.revenue)], ["Чистая прибыль", U.money(f.netProfit)], ["Долги", U.money(f.debt)], ["Остатки на счетах", U.money(f.avgBalance)]]),
        h("h3", null, "Документы"), a.docs.length ? a.docs.map((d) => UI.docItem(d)) : h("p", { class: "muted small" }, "Документы не приложены"),
        S.FINAL.includes(a.status) ? null : h("div", { class: "add-doc" }, sel, UI.filePicker("Добавить документ", async (file) => { await S.addDocs(a.id, [await S.makeDoc(kind, file, u.name)]); U.toast("Документ добавлен", "ok"); })));
    }

    Client.refresh = () => { if (document.activeElement && ["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement.tagName) && mount.contains(document.activeElement)) return; draw(); };
    draw();
  };
})();
