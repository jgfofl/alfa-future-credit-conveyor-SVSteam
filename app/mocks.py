import hashlib


def _h(inn: str, salt: str) -> int:
    return int(hashlib.sha256((salt + inn).encode()).hexdigest()[:8], 16)


def egrul(inn: str) -> dict:
    """Mock EGRUL/EGRIP: status is deterministic by INN; INNs ending in 00 are liquidated."""
    if not inn.isdigit() or len(inn) not in (10, 12):
        return {"found": False}
    n = _h(inn, "egr")
    return {"found": True, "status": "liquidated" if inn.endswith("00") else "active",
            "okved": ["47.11", "49.41", "62.01", "56.10", "41.20"][n % 5],
            "reg_year": 2005 + n % 20, "legal_form": "IP" if len(inn) == 12 else "OOO"}


def bureau(inn: str) -> dict:
    """Mock credit bureau: INNs ending in 99 simulate unavailability."""
    if inn.endswith("99"):
        raise TimeoutError("bureau unavailable")
    n = _h(inn, "bki")
    has = n % 7 != 0
    return {"history_months": n % 120 + 6 if has else 0,
            "delinq_cnt": (n >> 3) % 3 if has else 0,
            "max_dpd": [0, 0, 0, 5, 20, 40, 95][(n >> 5) % 7] if has else 0,
            "active_loans": (n >> 7) % 4 if has else 0}
