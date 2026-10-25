(function () {
  const U = window.U, S = window.Store, UI = window.UI;
  const { h, ic } = U;
  const view = document.getElementById("view"), header = document.getElementById("header");

  window.go = (p) => { if (location.hash === "#" + p) route(); else location.hash = "#" + p; };

  function Login(root) {
    let tab = "client", reg = false;
    const box = h("div", { class: "login-card card" });
    const draw = () => {
      const email = h("input", { id: "email", type: "text", autocomplete: "username", placeholder: tab === "client" ? "client@demo" : "bank@demo" }), pass = h("input", { id: "pass", type: "password", autocomplete: "current-password", placeholder: "Пароль" });
      const name = h("input", { id: "fio", placeholder: "Иван Иванов" }), msg = h("div", { class: "err", role: "alert" });
      const submit = (e) => {
        e && e.preventDefault();
        if (reg) {
          if (!name.value.trim() || !email.value.trim() || pass.value.length < 3) return (msg.textContent = "Заполните ФИО, e-mail и пароль (от 3 символов)");
          const r = S.register({ name: name.value, email: email.value, pass: pass.value });
          if (r.error) return (msg.textContent = r.error);
          return go("/client");
        }
        const u = S.login(email.value, pass.value);
        if (!u) return (msg.textContent = "Неверный логин или пароль");
        if ((u.role === "bank") !== (tab === "bank")) { S.logout(); return (msg.textContent = tab === "bank" ? "Это учётная запись клиента" : "Это учётная запись сотрудника банка"); }
        go(u.role === "bank" ? "/bank" : "/client");
      };
      const demo = tab === "client" ? [["Алексей Громов", "ООО «Ромашка Трейд»", "client@demo"], ["Ирина Петрова", "новый клиент без заявок", "ip@demo"]] : [["Мария Орлова", "кредитный менеджер", "bank@demo"], ["Дмитрий Волков", "риск-аналитик", "risk@demo"]];
      box.replaceChildren(
        h("div", { class: "seg tabs" }, [["client", "Предприниматель"], ["bank", "Сотрудник банка"]].map(([k, l]) => h("button", { type: "button", class: tab === k ? "sel" : "", onclick: () => { tab = k; reg = false; draw(); } }, l))),
        h("h2", null, reg ? "Регистрация" : "Вход в кабинет"),
        h("form", { onsubmit: submit }, reg ? UI.field("ФИО", name, { id: "fio" }) : null, UI.field("E-mail", email, { id: "email" }), UI.field("Пароль", pass, { id: "pass" }), msg, h("button", { class: "btn big full-w", type: "submit" }, reg ? "Зарегистрироваться" : "Войти")),
        tab === "client" ? h("p", { class: "center small" }, reg ? "Уже есть кабинет? " : "Впервые у нас? ", h("a", { href: "#", onclick: (e) => { e.preventDefault(); reg = !reg; draw(); } }, reg ? "Войти" : "Зарегистрироваться")) : null,
        reg ? null : h("div", { class: "demo" }, h("div", { class: "muted small" }, "Демо-доступ (пароль — demo):"), demo.map(([n, d, em]) => h("button", { type: "button", class: "demo-btn", onclick: () => { email.value = em; pass.value = "demo"; submit(); } }, h("b", null, n), h("span", { class: "muted small" }, d)))));
    };
    draw();
    root.append(h("div", { class: "login" }, h("div", { class: "login-hero" }, h("div", { class: "logo-mark big" }, "А"), h("h1", null, "Умный кредитный кабинет предпринимателя"),
      h("ul", null, ["Выберите продукт под задачу бизнеса", "Один раз заполните данные — дальше они подставляются сами", "Статус заявки виден на каждом шаге", "Решение и подписание — в одном месте"].map((t) => h("li", null, ic("check", 18), t))),
      h("p", { class: "small" }, "Учебный прототип. Данные синтетические, интеграции смоделированы.")), box));
  }

  function renderHeader(u) {
    header.replaceChildren();
    if (!u) return;
    const bank = u.role === "bank", n = S.unread(bank ? "bank" : u.id);
    const bell = h("div", { class: "bell-wrap" });
    const bellBtn = h("button", { class: "icon-btn bell", "aria-label": "Уведомления", onclick: () => {
      const list = S.notifs(bank ? "bank" : u.id);
      const close = U.modal({ title: "Уведомления", body: list.length ? h("div", { class: "notifs" }, list.map((x) => h("a", { href: "#/" + (bank ? "bank" : "client") + "/app/" + x.appId, class: x.read ? "" : "unread", onclick: () => close() }, h("div", null, x.text), h("div", { class: "muted small" }, U.dt(x.at))))) : h("p", { class: "muted" }, "Пока ничего нового") });
      S.markRead(bank ? "bank" : u.id);
    } }, ic("bell", 22), n ? h("span", { class: "dot" }, n) : null);
    bell.append(bellBtn);
    header.append(h("div", { class: "container head-in" },
      h("a", { class: "brand", href: bank ? "#/bank" : "#/client" }, h("span", { class: "logo-mark" }, "А"), h("span", null, h("b", null, "Кредитный кабинет"), h("small", null, bank ? "для сотрудников банка" : "для предпринимателей"))),
      h("nav", null, bank ? h("a", { href: "#/bank" }, "Заявки") : [h("a", { href: "#/client" }, "Мои заявки"), h("a", { href: "#/client/new" }, "Новая заявка")]),
      h("div", { class: "head-user" }, bell, h("div", { class: "who" }, h("b", null, u.name), h("small", null, bank ? u.position : "Предприниматель")), h("button", { class: "icon-btn", title: "Выйти", "aria-label": "Выйти", onclick: () => { S.logout(); go("/login"); } }, ic("logout", 20)))));
  }

  function route() {
    window.Client.refresh = window.Bank.refresh = null;
    const u = S.user(), p = (location.hash.slice(1) || "/").split("/").filter(Boolean);
    view.replaceChildren();
    window.scrollTo(0, 0);
    renderHeader(u);
    const need = (role) => { if (!u) { go("/login"); return false; } if (u.role !== role) { go(u.role === "bank" ? "/bank" : "/client"); return false; } return true; };
    const page = h("main", { class: "container" }); view.append(page);
    if (p[0] === "login" || !p[0]) { if (u) return go(u.role === "bank" ? "/bank" : "/client"); view.replaceChildren(); return Login(view); }
    if (p[0] === "client") {
      if (!need("client")) return;
      if (p[1] === "new") return window.Client.Wizard(page);
      if (p[1] === "app") return window.Client.Detail(page, p[2]);
      return window.Client.Dashboard(page);
    }
    if (p[0] === "bank") {
      if (!need("bank")) return;
      if (p[1] === "app") return window.Bank.Case(page, p[2]);
      return window.Bank.Queue(page);
    }
    go("/login");
  }

  let pending;
  S.subscribe(() => {
    clearTimeout(pending);
    pending = setTimeout(() => { const u = S.user(); if (!u) return; renderHeader(u); const r = window.Client.refresh || window.Bank.refresh; r && r(); }, 80);
  });
  window.addEventListener("hashchange", route);
  document.getElementById("footer").append(
    h("div", { class: "container foot-in" }, h("span", { class: "muted small" }, "Учебный прототип · данные синтетические · подписание и выдача смоделированы"),
      h("button", { class: "linklike", onclick: () => U.modal({ title: "Сбросить демо-данные?", body: h("p", null, "Все заявки и черновики вернутся к исходному состоянию."), actions: [{ label: "Сбросить", kind: "danger", onClick: (c) => { c(); S.reset(); go("/login"); route(); } }, { label: "Отмена", kind: "ghost" }] }) }, "Сбросить демо-данные")));
  route();
  S.resume();
})();
