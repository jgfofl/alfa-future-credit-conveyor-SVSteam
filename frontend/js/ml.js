(function () {
  const base = () => window.APP_CONFIG.ML_BASE.replace(/\/$/, "");

  async function call(path, opts = {}, timeout = 8000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(base() + path, { ...opts, signal: ctl.signal, headers: { "Content-Type": "application/json" } });
      if (!r.ok) {
        const err = new Error(r.status === 404 ? "not_found" : "http_" + r.status);
        err.status = r.status;
        throw err;
      }
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  window.ML = {
    decision: (payload) => call("/v1/decision", { method: "POST", body: JSON.stringify(payload) }),
    company: (inn) => call("/v1/company/" + encodeURIComponent(inn)),
    info: () => call("/v1/model/info"),
    health: () => call("/health", {}, 3000),
  };
})();
