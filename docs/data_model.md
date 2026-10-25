# Модель данных

Вход (`Application`): inn, product, req_amount, req_term, revenue_12m, profit_margin, debt_load, age_months, employees, avg_balance_ratio, revenue_volatility.
Обогащение: ЕГРЮЛ (status, okved, reg_year, legal_form), БКИ (history_months, delinq_cnt, max_dpd, active_loans).
Производные: amount_to_revenue, payment_to_income (аннуитет по 20%).
Выход (`Decision`): decision, reasons, pd, score, grade, offer{amount,term,rate,payment}, risk_factors, trace, model_version, rules_version.
