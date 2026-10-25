from typing import Literal, Optional
from datetime import date
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from app.decision import M, decide
from app.mocks import egrul

app = FastAPI(title="Credit Scoring & Decision Service", version="1.0.0",
              description="ML-скоринг и кредитная логика для «Умного кредитного кабинета предпринимателя». Данные синтетические, интеграции смоделированы.")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Application(BaseModel):
    inn: str = Field(min_length=10, max_length=12, examples=["7701234567"])
    product: Literal["working_capital", "equipment", "overdraft", "investment"]
    req_amount: float = Field(ge=100_000, le=50_000_000, examples=[2_000_000])
    req_term: int = Field(ge=6, le=60, examples=[24])
    revenue_12m: float = Field(gt=0, examples=[18_000_000])
    profit_margin: float = Field(ge=-0.5, le=1, examples=[0.15])
    debt_load: float = Field(ge=0, le=5, examples=[0.2], description="долг / годовая выручка")
    age_months: int = Field(ge=0, examples=[48])
    employees: int = Field(ge=1, examples=[12])
    avg_balance_ratio: float = Field(ge=0, le=1, examples=[0.12], description="средний остаток / выручка")
    revenue_volatility: float = Field(ge=0, le=3, examples=[0.2], description="коэффициент вариации месячной выручки")


class Factor(BaseModel):
    factor: str
    text: str
    contribution: float


class Offer(BaseModel):
    amount: float
    term: int
    rate: float
    payment: float


class Decision(BaseModel):
    decision: Literal["approved", "counteroffer", "rejected", "need_info", "manual_review"]
    reasons: list[str] = []
    pd: Optional[float] = None
    score: Optional[int] = None
    grade: Optional[str] = None
    payment_to_income: Optional[float] = None
    offer: Optional[Offer] = None
    risk_factors: list[Factor] = []
    trace: list[dict] = []
    model_version: Optional[str] = None
    rules_version: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "model": "logreg-1.0"}


@app.get("/v1/model/info")
def info():
    return {k: v for k, v in M["metrics"].items()}


@app.post("/v1/decision", response_model=Decision)
def decision(a: Application):
    return decide(a.model_dump())


@app.get("/v1/company/{inn}")
def company(inn: str):
    """Mock EGRUL/EGRIP lookup used by the cabinet to prefill company data."""
    r = egrul(inn)
    if not r["found"]:
        raise HTTPException(404, "ИНН не найден в ЕГРЮЛ/ЕГРИП")
    t = date.today()
    return {**r, "inn": inn, "age_months": max(0, (t.year - r["reg_year"]) * 12 + t.month - 1)}
