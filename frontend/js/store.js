/* Хранилище и бизнес-логика кредитного конвейера (клиентская часть).
   Данные сохраняются в localStorage. Решение по заявке запрашивается у ML-сервиса (POST /v1/decision).
   Контракт с будущим backend: см. docs/frontend.md — методы Store.* заменяются вызовами REST 1:1. */
(function () {
  const U = window.U, ML = window.ML, CFG = window.APP_CONFIG;
  const KEY = "alfa-credit-cabinet.v1";
  const now = () => Date.now();
  const DAY = 86400000;

  const PRODUCTS = {
    working_capital: { id: "working_capital", name: "Оборотный кредит", desc: "Закупка товара и сырья, текущие расходы, зарплаты.", rate: 0.17, min: 100000, max: 15000000, tmin: 6, tmax: 36 },
    equipment: { id: "equipment", name: "Кредит на оборудование", desc: "Покупка техники, оборудования, транспорта.", rate: 0.15, min: 300000, max: 30000000, tmin: 12, tmax: 60 },
    overdraft: { id: "overdraft", name: "Овердрафт", desc: "Короткие деньги на закрытие кассового разрыва.", rate: 0.2, min: 100000, max: 5000000, tmin: 6, tmax: 12 },
    investment: { id: "investment", name: "Инвестиционный кредит", desc: "Запуск нового направления, расширение, ремонт.", rate: 0.16, min: 1000000, max: 50000000, tmin: 24, tmax: 60 },
  };
  const GOALS = [
    { id: "stock", title: "Пополнить оборотные средства", text: "Закупить товар, сырьё, оплатить расходы", product: "working_capital" },
    { id: "equip", title: "Купить оборудование или технику", text: "Станки, автомобили, кассовое оборудование", product: "equipment" },
    { id: "gap", title: "Закрыть кассовый разрыв", text: "Деньги нужны быстро и ненадолго", product: "overdraft" },
    { id: "grow", title: "Запустить новое направление", text: "Расширение, ремонт, новая точка", product: "investment" },
  ];
  const ROLES = { owner: "Собственник бизнеса", ceo: "Генеральный директор", cfo: "Финансовый директор или бухгалтер", fin: "Сотрудник, отвечающий за финансирование", other: "Иной уполномоченный сотрудник" };
  const DOC_KINDS = { bank_statement: "Выписка по расчётному счёту за 12 месяцев", fin_report: "Бухгалтерская отчётность или декларация", purpose_doc: "Документ по цели кредита (счёт, спецификация)", other: "Другой документ" };
  const PATTERNS = { stable: { label: "Стабильная", vol: 0.12 }, seasonal: { label: "Сезонная", vol: 0.3 }, unstable: { label: "Нестабильная", vol: 0.6 } };
  const STATUS = {
    draft: { label: "Черновик", tone: "gray" },
    submitted: { label: "Отправлена", tone: "blue" },
    scoring: { label: "Проверка данных", tone: "blue" },
    manual_review: { label: "На рассмотрении", tone: "amber" },
    need_info: { label: "Нужны уточнения", tone: "amber" },
    offer: { label: "Предложение готово", tone: "green" },
    signing: { label: "Подписание", tone: "green" },
    disbursed: { label: "Средства выданы", tone: "green-solid" },
    rejected: { label: "Отказ", tone: "red" },
    declined: { label: "Отменена клиентом", tone: "gray" },
  };
  const FINAL = ["disbursed", "rejected", "declined"];

  let DB;
  const subs = new Set();
  const running = new Set();

  /* ---------- persistence ---------- */
  function save(emit = true) {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) { console.warn("storage", e); U.toast("Хранилище браузера переполнено — крупные файлы не сохраняются", "warn"); }
    if (emit) subs.forEach((f) => f());
  }
  function load() {
    try { DB = JSON.parse(localStorage.getItem(KEY)); } catch (e) { DB = null; }
    if (!DB || DB.v !== 1) { DB = seed(); save(false); }
  }
  const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

  /* ---------- helpers ---------- */
  const app = (id) => DB.apps.find((a) => a.id === id);
  const company = (inn) => DB.companies[inn];
  function ev(a, actor, actorName, text, type = "status") {
    a.events.push({ at: now(), actor, actorName, type, text });
    a.updatedAt = now();
  }
  function notify(to, appId, text) { DB.notifs.unshift({ id: "n" + now() + Math.random().toString(16).slice(2, 6), to, appId, text, at: now(), read: false }); }
  function setStatus(a, status, actor, actorName, text, notifyClient) {
    a.status = status;
    ev(a, actor, actorName, text);
    if (notifyClient && a.userId) notify(a.userId, a.id, notifyClient);
    save();
  }
  function rateFor(product, pd) { return Math.round((PRODUCTS[product].rate + Math.min(0.12, 1.5 * pd)) * 10000) / 10000; }
  function offerOf(amount, term, rate, source) {
    return { amount, term, rate, payment: Math.round(U.annuity(amount, term, rate)), source };
  }
  function riskGrade(pd) { return pd < 0.04 ? "A" : pd < 0.08 ? "B" : pd < 0.14 ? "C" : "D"; }

  /* ---------- sessions ---------- */
  function login(email, pass) {
    const u = DB.users.find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase() && x.pass === pass);
    if (!u) return null;
    DB.session = u.id; save(false); return u;
  }
  function register({ name, email, pass }) {
    if (DB.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase())) return { error: "Пользователь с таким e-mail уже есть" };
    const u = { id: "u" + now(), role: "client", email: email.trim(), pass, name: name.trim(), inn: null };
    DB.users.push(u); DB.session = u.id; save(false); return { user: u };
  }
  const logout = () => { DB.session = null; save(false); };
  const user = () => DB.users.find((u) => u.id === DB.session) || null;

  /* ---------- drafts ---------- */
  const draft = (uid) => DB.drafts[uid] || null;
  const saveDraft = (uid, d) => { DB.drafts[uid] = d; save(false); };
  const clearDraft = (uid) => { delete DB.drafts[uid]; save(false); };

  /* ---------- documents ---------- */
  async function makeDoc(kind, file, by) {
    const d = { id: "d" + now() + Math.random().toString(16).slice(2, 5), kind, name: file.name, size: file.size, type: file.type, at: now(), by, data: null };
    if (file.size <= CFG.MAX_STORED_FILE) { try { d.data = await U.readFile(file); } catch (e) {} }
    return d;
  }

  /* ---------- applications ---------- */
  function payloadOf(a) {
    const f = a.fin, rev = Math.max(f.revenue, 1), c = company(a.inn) || {};
    return {
      inn: a.inn, product: a.product, req_amount: a.amount, req_term: Math.round(a.term),
      revenue_12m: rev, profit_margin: U.clamp(f.netProfit / rev, -0.5, 1), debt_load: U.clamp(f.debt / rev, 0, 5),
      age_months: Math.max(0, Math.round(c.ageMonths || 0)), employees: Math.max(1, Math.round(f.employees || c.employees || 1)),
      avg_balance_ratio: U.clamp(f.avgBalance / rev, 0, 1), revenue_volatility: PATTERNS[f.pattern] ? PATTERNS[f.pattern].vol : 0.3,
    };
  }

  function createApp(u, data) {
    const id = "A-" + ++DB.seq;
    const c = { ...data.company };
    DB.companies[c.inn] = { ...(DB.companies[c.inn] || {}), ...c };
    u.inn = c.inn;
    const a = {
      id, userId: u.id, inn: c.inn, companyName: c.name, product: data.product, goal: data.goal || null, amount: data.amount, term: data.term,
      fin: data.fin, docs: data.docs || [], status: "submitted", createdAt: now(), updatedAt: now(),
      ml: null, offer: null, rejectReason: null, infoRequest: null, assignee: null, comments: [], events: [], flags: {},
    };
    ev(a, "client", u.name, "Заявка отправлена в банк");
    DB.apps.unshift(a);
    notify("bank", id, `Новая заявка ${id}: ${c.name}`);
    clearDraft(u.id);
    save();
    runPipeline(id);
    return a;
  }

  /* Конвейер: приём → проверки и скоринг (ML-сервис) → маршрутизация */
  async function runPipeline(id) {
    const a = app(id);
    if (!a || running.has(id) || !["submitted", "scoring"].includes(a.status)) return;
    running.add(id);
    try {
      if (a.status === "submitted") {
        await U.sleep(900);
        setStatus(a, "scoring", "system", "Система", "Проверяем данные в реестрах ЕГРЮЛ/ЕГРИП и бюро кредитных историй, считаем оценку риска");
      }
      await U.sleep(1500);
      try { a.ml = { decision: await ML.decision(payloadOf(a)), at: now() }; }
      catch (e) { a.ml = { error: e.status ? "Сервис скоринга вернул ошибку " + e.status : "Сервис скоринга недоступен", at: now() }; }
      route(a);
    } finally { running.delete(id); }
  }

  function route(a) {
    const d = a.ml.decision;
    const fromInfo = a.flags.infoReceived;
    if (!d) {
      return setStatus(a, "manual_review", "system", "Система", "Автоматическая оценка недоступна — заявка передана сотруднику банка", "Заявка передана сотруднику банка на рассмотрение"), notify("bank", a.id, `Заявка ${a.id} требует ручного рассмотрения (скоринг недоступен)`);
    }
    if (d.decision === "rejected") {
      a.rejectReason = d.reasons;
      return setStatus(a, "rejected", "system", "Система", "Принят отрицательный результат по итогам автоматической проверки", `По заявке ${a.id} принято отрицательное решение`);
    }
    if (d.decision === "need_info") {
      a.infoRequest = { text: (d.reasons || [])[0] || "Проверьте реквизиты компании", docs: [], by: "Система", at: now(), auto: true, response: null };
      return setStatus(a, "need_info", "system", "Система", "Необходимо уточнить данные: " + a.infoRequest.text, "По заявке нужны уточнения");
    }
    if (d.decision === "approved" && a.amount <= CFG.AUTO_APPROVE_LIMIT) {
      a.offer = { ...d.offer, source: "auto" };
      return setStatus(a, "offer", "system", "Система", "Заявка одобрена автоматически на запрошенных условиях", `Заявка ${a.id} одобрена — посмотрите предложение`);
    }
    notify("bank", a.id, fromInfo ? `Клиент ответил на запрос по заявке ${a.id}` : `Заявка ${a.id} ожидает решения сотрудника`);
    setStatus(a, "manual_review", "system", "Система", d.decision === "manual_review" ? "Автоматические проверки не завершены — заявку рассматривает сотрудник банка" : "Заявку рассматривает сотрудник банка", "Заявку рассматривает сотрудник банка");
  }

  /* ---------- действия сотрудника ---------- */
  const bankName = () => (user() ? user().name : "Сотрудник банка");
  function bankApprove(id, terms, comment) {
    const a = app(id); a.assignee = bankName();
    a.offer = offerOf(terms.amount, terms.term, terms.rate, "employee");
    const same = terms.amount === a.amount && terms.term === a.term;
    if (comment) a.comments.push({ at: now(), by: bankName(), text: comment });
    setStatus(a, "offer", "bank", bankName(), same ? "Одобрено на запрошенных условиях" : "Одобрено на иных условиях: " + U.money(terms.amount) + ", " + U.months(terms.term), `Заявка ${a.id} одобрена — посмотрите предложение`);
  }
  function bankReject(id, reason, comment) {
    const a = app(id); a.assignee = bankName(); a.rejectReason = [reason];
    if (comment) a.comments.push({ at: now(), by: bankName(), text: comment });
    setStatus(a, "rejected", "bank", bankName(), "Отказано: " + reason, `По заявке ${a.id} принято отрицательное решение`);
  }
  function bankRequestInfo(id, text, docs) {
    const a = app(id); a.assignee = bankName();
    a.infoRequest = { text, docs, by: bankName(), at: now(), auto: false, response: null };
    a.flags.infoReceived = false;
    setStatus(a, "need_info", "bank", bankName(), "Запрошены уточнения: " + text, "По заявке нужны уточнения — ответьте в личном кабинете");
  }
  function addComment(id, text) {
    const a = app(id); a.comments.push({ at: now(), by: bankName(), text }); ev(a, "bank", bankName(), "Внутренний комментарий: " + text, "comment"); save();
  }
  function takeInWork(id) { const a = app(id); a.assignee = bankName(); ev(a, "bank", bankName(), "Заявка взята в работу", "comment"); save(); }

  /* ---------- действия клиента ---------- */
  function clientRespond(id, text, docs) {
    const a = app(id), u = user();
    a.docs.push(...docs);
    a.infoRequest.response = { text, at: now(), docs: docs.map((d) => d.name) };
    ev(a, "client", u.name, "Клиент ответил на запрос" + (docs.length ? ` и приложил документы (${docs.length})` : ""));
    a.flags.infoReceived = true;
    if (a.infoRequest.auto) {
      setStatus(a, "scoring", "system", "Система", "Проверяем обновлённые данные");
      notify("bank", id, `Клиент уточнил данные по заявке ${id}`);
      return runPipelineAgain(id);
    }
    notify("bank", id, `Клиент ответил на запрос по заявке ${id}`);
    setStatus(a, "manual_review", "client", u.name, "Заявка возвращена на рассмотрение сотруднику банка");
  }
  function runPipelineAgain(id) { return runPipeline(id); }
  async function addDocs(id, docs) {
    const a = app(id), u = user();
    a.docs.push(...docs); ev(a, u.role === "bank" ? "bank" : "client", u.name, "Добавлены документы: " + docs.map((d) => d.name).join(", "), "doc"); save();
  }
  function clientAccept(id) {
    const a = app(id);
    setStatus(a, "signing", "client", user().name, "Клиент принял предложение. Ожидается подписание договора", null);
  }
  function clientDecline(id) {
    const a = app(id); setStatus(a, "declined", "client", user().name, "Клиент отказался от предложения");
  }
  function clientSign(id) {
    const a = app(id);
    a.signedAt = now();
    ev(a, "client", user().name, "Договор подписан простой электронной подписью (имитация)");
    save();
    finishDisbursement(id);
  }
  async function finishDisbursement(id) {
    const a = app(id);
    if (!a || a.status !== "signing" || !a.signedAt) return;
    await U.sleep(1800);
    a.contract = { number: "КД-" + a.id.slice(2) + "/26", account: "40702810" + String(a.inn).padEnd(12, "0").slice(0, 12), at: now() };
    notify(a.userId, a.id, `Кредит по заявке ${a.id} выдан`);
    notify("bank", a.id, `Заявка ${a.id}: договор подписан, средства выданы (имитация)`);
    setStatus(a, "disbursed", "system", "Система", `Средства ${U.money(a.offer.amount)} зачислены на расчётный счёт (имитация)`, null);
  }
  function startFrom(uid, a) {
    saveDraft(uid, { step: 2, goal: a.goal, product: a.product, amount: a.amount, term: a.term, inn: a.inn, fin: { ...a.fin }, docs: [], consent: false, fromId: a.id });
  }

  /* ---------- уведомления ---------- */
  const notifs = (to) => DB.notifs.filter((n) => n.to === to).slice(0, 30);
  const unread = (to) => DB.notifs.filter((n) => n.to === to && !n.read).length;
  const markRead = (to) => { DB.notifs.forEach((n) => n.to === to && (n.read = true)); save(); };

  /* ---------- статистика для кабинета сотрудника ---------- */
  function stats() {
    const A = DB.apps, c = (...s) => A.filter((a) => s.includes(a.status)).length;
    const approved = A.filter((a) => a.offer).length, rejected = c("rejected");
    return {
      total: A.length, review: c("manual_review"), info: c("need_info"), inProc: c("submitted", "scoring"),
      approved, rejected, disbursed: c("disbursed"),
      rate: approved + rejected ? approved / (approved + rejected) : 0,
      sum: A.filter((a) => a.offer).reduce((s, a) => s + a.offer.amount, 0),
    };
  }

  function resume() {
    DB.apps.forEach((a) => {
      if (["submitted", "scoring"].includes(a.status)) runPipeline(a.id);
      if (a.status === "signing" && a.signedAt) finishDisbursement(a.id);
    });
  }
  function reset() { localStorage.removeItem(KEY); load(); subs.forEach((f) => f()); }

  /* ---------- синтетические демо-данные ---------- */
  function seed() {
    const t = now();
    const db = { v: 1, seq: 1007, session: null, users: [], companies: {}, apps: [], notifs: [], drafts: {} };
    db.users.push(
      { id: "u1", role: "client", email: "client@demo", pass: "demo", name: "Алексей Громов", inn: "7701234567" },
      { id: "u2", role: "client", email: "ip@demo", pass: "demo", name: "Ирина Петрова", inn: null },
      { id: "b1", role: "bank", email: "bank@demo", pass: "demo", name: "Мария Орлова", position: "Кредитный менеджер" },
      { id: "b2", role: "bank", email: "risk@demo", pass: "demo", name: "Дмитрий Волков", position: "Риск-аналитик" });
    const co = (inn, name, form, okved, regYear, emp, who, role) => {
      db.companies[inn] = { inn, status: "active", name, orgForm: form, okved, regYear, ageMonths: (2026 - regYear) * 12 + 9, employees: emp, contact: { name: who, role } };
    };
    co("7701234567", "ООО «Ромашка Трейд»", "OOO", "56.10", 2008, 12, "Алексей Громов", "ceo");
    co("5408123456", "ООО «Сибирь Агро»", "OOO", "01.11", 2012, 28, "Павел Лебедев", "cfo");
    co("772012345678", "ИП Кузнецова Е. А.", "IP", "47.19", 2016, 3, "Елена Кузнецова", "owner");
    co("7814123457", "ООО «ТехноМонтаж»", "OOO", "43.29", 2010, 54, "Сергей Мартынов", "ceo");
    co("501234567801", "ИП Соколов Д. В.", "IP", "49.41", 2019, 6, "Дмитрий Соколов", "owner");
    co("1655123456", "ООО «Вектор Логистик»", "OOO", "52.29", 2017, 40, "Руслан Хакимов", "fin");
    const dec = (decision, pd, extra = {}) => ({ decision, pd, score: Math.round(600 + (40 / Math.LN2) * Math.log(((1 - pd) / pd) / 19)), grade: riskGrade(pd), model_version: "logreg-1.0", rules_version: "rules-1.0", reasons: [], ...extra });
    const tr = (okved, year, form, bki) => [{ step: "egrul", result: { found: true, status: "active", okved, reg_year: year, legal_form: form } }, { step: "bureau", result: bki }];
    const mk = (o) => {
      const a = { id: o.id, userId: o.userId || null, inn: o.inn, companyName: db.companies[o.inn].name, product: o.product, goal: null, amount: o.amount, term: o.term, fin: o.fin, docs: o.docs || [],
        status: o.status, createdAt: t - o.days * DAY, updatedAt: t - o.upd * DAY, ml: o.ml || null, offer: o.offer || null, rejectReason: o.rejectReason || null,
        infoRequest: o.infoRequest || null, assignee: o.assignee || null, comments: o.comments || [], events: [], flags: {}, contract: o.contract };
      const E = (d, actor, name, text) => a.events.push({ at: t - d * DAY, actor, actorName: name, type: "status", text });
      E(o.days, "client", db.companies[o.inn].contact.name, "Заявка отправлена в банк");
      E(o.days - 0.001, "system", "Система", "Проверяем данные в реестрах ЕГРЮЛ/ЕГРИП и бюро кредитных историй, считаем оценку риска");
      (o.ev || []).forEach((x) => E(x[0], x[1], x[2], x[3]));
      db.apps.push(a); return a;
    };
    const fin = (revenue, net, debt, bal, pattern, employees) => ({ revenue, netProfit: net, debt, avgBalance: bal, pattern, employees });
    const doc = (kind, name, size) => ({ id: "d" + name, kind, name, size, type: "application/pdf", at: t - 3 * DAY, by: "Клиент", data: null });

    mk({ id: "A-1001", inn: "5408123456", product: "working_capital", amount: 4500000, term: 24, fin: fin(21000000, 2100000, 7350000, 1260000, "seasonal", 28), status: "manual_review", days: 1.2, upd: 1.1,
      docs: [doc("bank_statement", "vypiska_2025-2026.pdf", 182000), doc("fin_report", "bukh_otchetnost_2025.pdf", 244000)],
      ml: { at: t - DAY, decision: dec("counteroffer", 0.118, { payment_to_income: 1.31, offer: offerOf(2500000, 36, 0.1977), reasons: ["одобрение на иных условиях", "высокая долговая нагрузка", "запрошенная сумма велика относительно выручки"],
        risk_factors: [{ factor: "debt_load", text: "высокая долговая нагрузка", contribution: 0.41 }, { factor: "payment_to_income", text: "высокий платёж относительно прибыли", contribution: 0.38 }, { factor: "amount_to_revenue", text: "запрошенная сумма велика относительно выручки", contribution: 0.22 }],
        trace: tr("01.11", 2012, "OOO", { history_months: 74, delinq_cnt: 1, max_dpd: 15, active_loans: 2 }) }) },
      ev: [[1.1, "system", "Система", "Заявку рассматривает сотрудник банка"]] });
    mk({ id: "A-1002", inn: "772012345678", product: "overdraft", amount: 800000, term: 12, fin: fin(6200000, 1240000, 300000, 450000, "stable", 3), status: "manual_review", days: 0.4, upd: 0.35,
      docs: [doc("bank_statement", "vypiska_ip.pdf", 96000)],
      ml: { at: t - 0.4 * DAY, decision: { decision: "manual_review", reasons: ["бюро кредитных историй недоступно — передано аналитику"], trace: [{ step: "egrul", result: { found: true, status: "active", okved: "47.19", reg_year: 2016, legal_form: "IP" } }, { step: "bureau", result: "unavailable" }], rules_version: "rules-1.0" } },
      ev: [[0.35, "system", "Система", "Автоматические проверки не завершены — заявку рассматривает сотрудник банка"]] });
    mk({ id: "A-1003", inn: "7814123457", product: "equipment", amount: 12000000, term: 48, fin: fin(64000000, 6400000, 12800000, 5100000, "seasonal", 54), status: "need_info", days: 3, upd: 1.5, assignee: "Мария Орлова",
      docs: [doc("fin_report", "otchetnost_2025.pdf", 310000)],
      ml: { at: t - 3 * DAY, decision: dec("approved", 0.061, { payment_to_income: 0.29, offer: offerOf(12000000, 48, 0.179), risk_factors: [{ factor: "debt_load", text: "высокая долговая нагрузка", contribution: 0.18 }, { factor: "revenue_volatility", text: "нестабильная выручка", contribution: 0.12 }], trace: tr("43.29", 2010, "OOO", { history_months: 96, delinq_cnt: 0, max_dpd: 0, active_loans: 1 }) }) },
      infoRequest: { text: "Приложите выписку по счёту за последние 12 месяцев и счёт на оборудование от поставщика.", docs: ["bank_statement", "purpose_doc"], by: "Мария Орлова", at: t - 1.5 * DAY, auto: false, response: null },
      ev: [[2.9, "system", "Система", "Заявку рассматривает сотрудник банка"], [1.5, "bank", "Мария Орлова", "Запрошены уточнения: приложите выписку по счёту и счёт на оборудование"]] });
    mk({ id: "A-1004", inn: "501234567801", product: "working_capital", amount: 1200000, term: 18, fin: fin(9800000, 1470000, 490000, 980000, "stable", 6), status: "offer", days: 0.8, upd: 0.75,
      offer: { ...offerOf(1200000, 18, 0.1904), source: "auto" },
      ml: { at: t - 0.8 * DAY, decision: dec("approved", 0.0136, { payment_to_income: 0.11, offer: offerOf(1200000, 18, 0.1904), risk_factors: [], trace: tr("49.41", 2019, "IP", { history_months: 40, delinq_cnt: 0, max_dpd: 0, active_loans: 1 }) }) },
      ev: [[0.75, "system", "Система", "Заявка одобрена автоматически на запрошенных условиях"]] });
    mk({ id: "A-1005", inn: "1655123456", product: "investment", amount: 9000000, term: 60, fin: fin(15000000, 450000, 12000000, 150000, "unstable", 40), status: "rejected", days: 2, upd: 2,
      rejectReason: ["высокий уровень риска", "высокая долговая нагрузка", "нестабильная выручка"],
      ml: { at: t - 2 * DAY, decision: dec("rejected", 0.241, { reasons: ["высокий уровень риска", "высокая долговая нагрузка", "нестабильная выручка"], payment_to_income: 3.9,
        risk_factors: [{ factor: "debt_load", text: "высокая долговая нагрузка", contribution: 0.86 }, { factor: "revenue_volatility", text: "нестабильная выручка", contribution: 0.52 }, { factor: "bki_max_dpd", text: "просрочки в кредитной истории", contribution: 0.44 }], trace: tr("52.29", 2017, "OOO", { history_months: 52, delinq_cnt: 2, max_dpd: 70, active_loans: 3 }) }) },
      ev: [[2, "system", "Система", "Принят отрицательный результат по итогам автоматической проверки"]] });
    mk({ id: "A-1000", userId: "u1", inn: "7701234567", product: "working_capital", amount: 1500000, term: 12, fin: fin(18000000, 2700000, 3600000, 2160000, "stable", 12), status: "disbursed", days: 120, upd: 118, assignee: null,
      docs: [doc("bank_statement", "vypiska_romashka.pdf", 150000)],
      offer: { ...offerOf(1500000, 12, 0.1841), source: "auto" }, contract: { number: "КД-1000/26", account: "407028107701", at: t - 118 * DAY },
      ml: { at: t - 120 * DAY, decision: dec("approved", 0.0094, { payment_to_income: 0.1, offer: offerOf(1500000, 12, 0.1841), risk_factors: [], trace: tr("56.10", 2008, "OOO", { history_months: 110, delinq_cnt: 0, max_dpd: 0, active_loans: 0 }) }) },
      ev: [[119.9, "system", "Система", "Заявка одобрена автоматически на запрошенных условиях"], [119, "client", "Алексей Громов", "Клиент принял предложение. Ожидается подписание договора"], [118.5, "client", "Алексей Громов", "Договор подписан простой электронной подписью (имитация)"], [118, "system", "Система", "Средства 1 500 000 ₽ зачислены на расчётный счёт (имитация)"]] });
    db.apps.sort((a, b) => b.createdAt - a.createdAt);
    db.notifs.push({ id: "n1", to: "bank", appId: "A-1001", text: "Заявка A-1001 ожидает решения сотрудника", at: t - DAY, read: false },
      { id: "n2", to: "bank", appId: "A-1002", text: "Заявка A-1002 требует ручного рассмотрения (бюро недоступно)", at: t - 0.4 * DAY, read: false });
    return db;
  }

  load();
  window.Store = {
    PRODUCTS, GOALS, ROLES, DOC_KINDS, PATTERNS, STATUS, FINAL,
    subscribe, resume, reset, load, db: () => DB,
    login, register, logout, user,
    app, apps: () => DB.apps, appsOf: (uid) => DB.apps.filter((a) => a.userId === uid), company, companies: () => DB.companies,
    draft, saveDraft, clearDraft, makeDoc, payloadOf, createApp, startFrom,
    bankApprove, bankReject, bankRequestInfo, addComment, takeInWork,
    clientRespond, clientAccept, clientDecline, clientSign, addDocs,
    notifs, unread, markRead, stats, rateFor, offerOf, riskGrade, saveCompany: (c) => { DB.companies[c.inn] = { ...(DB.companies[c.inn] || {}), ...c }; save(false); },
  };
})();
