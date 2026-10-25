import joblib
import numpy as np
import pandas as pd
from app.features import annuity, build
from app.mocks import bureau, egrul
from app.train import to_score

M = joblib.load("artifacts/model.joblib")
RULES_VERSION = "rules-1.0"
# product: (max PD to approve, base rate, max payment/income)
PRODUCT = {"working_capital": (0.10, 0.17, 0.55), "equipment": (0.12, 0.15, 0.55),
           "overdraft": (0.08, 0.20, 0.60), "investment": (0.09, 0.16, 0.50)}
REASON = {"debt_load": "высокая долговая нагрузка", "revenue_volatility": "нестабильная выручка",
          "bki_max_dpd": "просрочки в кредитной истории", "bki_delinq_cnt": "число просрочек в БКИ",
          "amount_to_revenue": "запрошенная сумма велика относительно выручки",
          "payment_to_income": "высокий платёж относительно прибыли", "profit_margin": "низкая рентабельность",
          "revenue_12m": "малая выручка", "age_months": "малый срок ведения бизнеса",
          "avg_balance_ratio": "низкие остатки на счетах", "req_term": "длинный срок кредита",
          "bki_active_loans": "много действующих кредитов", "bki_history_months": "короткая кредитная история",
          "employees": "малая численность персонала"}


def _features(a: dict, bki: dict, reg: dict) -> pd.DataFrame:
    return build(pd.DataFrame([{
        "org_form": reg["legal_form"], "revenue_12m": a["revenue_12m"], "profit_margin": a["profit_margin"],
        "debt_load": a["debt_load"], "age_months": a["age_months"], "employees": a["employees"],
        "avg_balance_ratio": a["avg_balance_ratio"], "revenue_volatility": a["revenue_volatility"],
        "product": a["product"], "req_amount": a["req_amount"], "req_term": a["req_term"],
        "bki_delinq_cnt": bki["delinq_cnt"], "bki_max_dpd": bki["max_dpd"],
        "bki_active_loans": bki["active_loans"], "bki_history_months": bki["history_months"]}]))


def explain(x: pd.DataFrame, top=3):
    z = (x.values[0] - np.array(M["means"])) / np.array(M["scales"])
    contrib = pd.Series(z * np.array(M["coef"]), index=M["columns"])
    risk = contrib[contrib > 0].sort_values(ascending=False)
    return [{"factor": k, "text": REASON.get(k, k), "contribution": round(float(v), 3)}
            for k, v in risk.head(top).items() if k in REASON]


def rate_for(product, pd_):
    return round(PRODUCT[product][1] + min(0.12, 1.5 * pd_), 4)


def decide(a: dict) -> dict:
    trace = []
    reg = egrul(a["inn"])
    trace.append({"step": "egrul", "result": reg})
    if not reg["found"]:
        return {"decision": "need_info", "reasons": ["ИНН не найден в ЕГРЮЛ/ЕГРИП — проверьте реквизиты"], "trace": trace}
    if reg["status"] != "active":
        return {"decision": "rejected", "reasons": ["организация ликвидирована"], "trace": trace, "rules_version": RULES_VERSION}
    try:
        bki = bureau(a["inn"])
        trace.append({"step": "bureau", "result": bki})
    except TimeoutError:
        trace.append({"step": "bureau", "result": "unavailable"})
        return {"decision": "manual_review", "reasons": ["бюро кредитных историй недоступно — передано аналитику"],
                "trace": trace, "rules_version": RULES_VERSION}
    if bki["max_dpd"] > 90:
        return {"decision": "rejected", "reasons": ["просрочка свыше 90 дней в кредитной истории"], "trace": trace, "rules_version": RULES_VERSION}
    if a["age_months"] < 6:
        return {"decision": "rejected", "reasons": ["срок ведения бизнеса менее 6 месяцев"], "trace": trace, "rules_version": RULES_VERSION}

    x = _features(a, bki, reg)
    pdv = float(M["model"].predict_proba(x)[0, 1])
    score = int(round(to_score(pdv)))
    prod = a["product"]
    pd_max, _, pti_max = PRODUCT[prod]
    pti = float(x["payment_to_income"].iloc[0])
    out = {"pd": round(pdv, 4), "score": score, "grade": "A" if pdv < 0.04 else "B" if pdv < 0.08 else "C" if pdv < 0.14 else "D",
           "payment_to_income": round(pti, 3), "risk_factors": explain(x), "trace": trace,
           "model_version": "logreg-1.0", "rules_version": RULES_VERSION}
    if pdv > pd_max * 1.6:
        return {**out, "decision": "rejected", "reasons": ["высокий уровень риска"] + [f["text"] for f in out["risk_factors"]]}
    rate = rate_for(prod, pdv)
    if pdv <= pd_max and pti <= pti_max:
        return {**out, "decision": "approved", "offer": {"amount": a["req_amount"], "term": a["req_term"], "rate": rate,
                "payment": round(annuity(a["req_amount"], a["req_term"], rate))}, "reasons": []}
    scale = 1.0
    amt, term = a["req_amount"], a["req_term"]
    if pdv > pd_max:
        scale = 0.6 if pdv <= pd_max * 1.3 else 0.4
        amt = round(amt * scale, -4)
    while annuity(amt, term, rate) / (a["revenue_12m"] / 12 * max(a["profit_margin"], 0.01)) > pti_max and term < 60:
        term += 12
    while annuity(amt, term, rate) / (a["revenue_12m"] / 12 * max(a["profit_margin"], 0.01)) > pti_max and amt > 1e5:
        amt = round(amt * 0.9, -4)
    if amt < 1e5:
        return {**out, "decision": "rejected", "reasons": ["недостаточная платёжеспособность"]}
    return {**out, "decision": "counteroffer", "offer": {"amount": amt, "term": term, "rate": rate,
            "payment": round(annuity(amt, term, rate))},
            "reasons": ["одобрение на иных условиях"] + [f["text"] for f in out["risk_factors"]]}
