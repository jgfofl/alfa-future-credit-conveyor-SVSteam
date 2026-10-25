import numpy as np
import pandas as pd
from app.features import PRODUCTS


def generate(n=20000, seed=42) -> pd.DataFrame:
    g = np.random.default_rng(seed)
    org = g.choice(["IP", "OOO"], n, p=[0.45, 0.55])
    rev = np.exp(g.normal(15.6, 1.0, n)).round(-3)
    margin = np.clip(g.normal(0.14, 0.09, n), -0.1, 0.45)
    age = np.clip(g.gamma(2.0, 24, n), 3, 360).astype(int)
    emp = np.clip(np.exp(g.normal(1.6, 1.0, n)), 1, 100).astype(int)
    debt = np.clip(g.beta(2, 5, n) * 1.5, 0, 1.5)
    bal = np.clip(g.normal(0.12, 0.08, n), 0, 0.6)
    vol = np.clip(g.gamma(2, 0.1, n), 0.02, 1.2)
    prod = g.choice(PRODUCTS, n, p=[0.4, 0.25, 0.2, 0.15])
    amt = np.clip(rev * g.uniform(0.05, 0.6, n), 1e5, 5e7).round(-4)
    term = np.where(prod == "overdraft", 12, np.where(prod == "working_capital", g.choice([12, 24, 36], n), g.choice([24, 36, 48, 60], n)))
    hist = np.clip(g.gamma(2, 20, n), 0, 240).astype(int)
    has = hist > 0
    cnt = np.where(has, g.poisson(0.35 + debt, n), 0)
    dpd = np.where(cnt > 0, g.choice([0, 0, 5, 15, 35, 70, 95], n), 0)
    act = np.where(has, g.poisson(1 + debt * 2, n), 0)
    z = (-4.1 - 3.0 * (margin - 0.14) - 2.0 * np.log(rev / 6e6) * 0.2 - 0.012 * np.minimum(age, 120)
         + 1.6 * debt + 0.9 * vol - 2.5 * bal + 0.7 * cnt * 0.4 + 0.022 * dpd
         + 1.2 * np.clip(amt / rev, 0, 1.5) + 0.0025 * term + 0.25 * (org == "IP")
         + 0.4 * (prod == "investment") - 0.2 * (prod == "overdraft") + g.normal(0, 0.5, n))
    p = 1 / (1 + np.exp(-z))
    df = pd.DataFrame(dict(org_form=org, revenue_12m=rev, profit_margin=margin.round(3), debt_load=debt.round(3),
                           age_months=age, employees=emp, avg_balance_ratio=bal.round(3), revenue_volatility=vol.round(3),
                           product=prod, req_amount=amt, req_term=term, bki_delinq_cnt=cnt, bki_max_dpd=dpd,
                           bki_active_loans=act, bki_history_months=hist))
    df["default"] = (g.random(n) < p).astype(int)
    return df


if __name__ == "__main__":
    d = generate()
    d.to_csv("data/synthetic_applications.csv", index=False)
    print(d.shape, "default rate:", round(d["default"].mean(), 3))
