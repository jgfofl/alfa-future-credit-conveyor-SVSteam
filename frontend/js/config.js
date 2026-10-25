// Настройки. ML_BASE — адрес сервиса скоринга (в Docker проксируется nginx по /ml).
// Для локальной отладки: откройте страницу с ?ml=http://localhost:8000
(function () {
  let ml = "/ml";
  try {
    const q = new URLSearchParams(location.search).get("ml");
    if (q) localStorage.setItem("alfa-ml-base", q);
    ml = localStorage.getItem("alfa-ml-base") || ml;
  } catch (e) {}
  window.APP_CONFIG = {
    ML_BASE: ml,
    AUTO_APPROVE_LIMIT: 3000000, // автоодобрение без сотрудника: сумма не выше лимита
    MAX_STORED_FILE: 400 * 1024, // в демо-хранилище сохраняем файлы до 400 КБ
  };
})();
