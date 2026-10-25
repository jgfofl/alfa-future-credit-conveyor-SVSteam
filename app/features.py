import numpy as np
import pandas as pd

NUM = ["revenue_12m", "profit_margin", "debt_load", "age_months", "employees",
       "avg_balance_ratio", "revenue_volatility", "req_amount", "req_term",
       "bki_delinq_cnt", "bki_max_dpd", "bki_active_loans", "bki_history_months",
       "amount_to_revenue", "payment_to_income"]
CAT = ["org_form", "product"]
ORG = ["IP", "OOO"]
PRODUCTS = ["working_capital", "equipment", "overdraft", "investment"]


def annuity(amount, term_months, rate):
    r = rate / 12
    return amount * r / (1 - (1 + r) ** -term_months)


def build(df: pd.DataFrame) -> pd.DataFrame:
    x = df.copy()
    x["amount_to_revenue"] = x["req_amount"] / x["revenue_12m"].clip(lower=1)
    pay = annuity(x["req_amount"], x["req_term"], 0.20)
    x["payment_to_income"] = pay / (x["revenue_12m"] / 12 * x["profit_margin"].clip(lower=0.01))
    for o in ORG:
        x[f"org_{o}"] = (x["org_form"] == o).astype(int)
    for p in PRODUCTS[1:]:
        x[f"prod_{p}"] = (x["product"] == p).astype(int)
    cols = NUM + [f"org_{o}" for o in ORG[1:]] + [f"prod_{p}" for p in PRODUCTS[1:]]
    return x[cols].astype(float).replace([np.inf, -np.inf], 0)
