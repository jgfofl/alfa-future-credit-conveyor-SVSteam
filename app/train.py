import json
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, roc_curve, brier_score_loss
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from app.features import build
from app.synth import generate

SEED = 42
PDO, BASE_SCORE, BASE_ODDS = 40, 600, 19  # score = 600 at odds good:bad 19:1, +40 points doubles odds


def to_score(pd_):
    odds = (1 - pd_) / np.clip(pd_, 1e-6, 1)
    return BASE_SCORE + PDO / np.log(2) * np.log(odds / BASE_ODDS)


def ks(y, p):
    f = roc_curve(y, p)
    return float(np.max(f[1] - f[0]))


def main():
    df = generate(20000, SEED)
    df.to_csv("data/synthetic_applications.csv", index=False)
    X, y = build(df), df["default"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=SEED)
    model = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=2000))
    model.fit(Xtr, ytr)
    p = model.predict_proba(Xte)[:, 1]
    auc = roc_auc_score(yte, p)
    m = {"auc": round(auc, 4), "gini": round(2 * auc - 1, 4), "ks": round(ks(yte, p), 4),
         "brier": round(brier_score_loss(yte, p), 4), "n_train": len(Xtr), "n_test": len(Xte),
         "default_rate": round(float(y.mean()), 4)}
    coefs = pd.Series(model[-1].coef_[0], index=X.columns)
    m["coefficients_std"] = coefs.round(4).to_dict()
    scaler = model[0]
    joblib.dump({"model": model, "columns": list(X.columns), "means": scaler.mean_.tolist(),
                 "scales": scaler.scale_.tolist(), "coef": model[-1].coef_[0].tolist(),
                 "intercept": float(model[-1].intercept_[0]), "metrics": m}, "artifacts/model.joblib")
    json.dump(m, open("artifacts/metrics.json", "w"), indent=1)

    fig, ax = plt.subplots(1, 3, figsize=(15, 4.3))
    fpr, tpr, _ = roc_curve(yte, p)
    ax[0].plot(fpr, tpr, label=f"AUC={auc:.3f}, Gini={2*auc-1:.3f}")
    ax[0].plot([0, 1], [0, 1], "--", c="gray")
    ax[0].set(title="ROC", xlabel="FPR", ylabel="TPR"); ax[0].legend()
    fo, mp = calibration_curve(yte, p, n_bins=10, strategy="quantile")
    ax[1].plot(mp, fo, "o-", label="model"); ax[1].plot([0, .4], [0, .4], "--", c="gray")
    ax[1].set(title="Calibration", xlabel="predicted PD", ylabel="observed default rate"); ax[1].legend()
    sc = to_score(p)
    ax[2].hist(sc[yte == 0], bins=40, alpha=.6, label="good"); ax[2].hist(sc[yte == 1], bins=40, alpha=.6, label="default")
    ax[2].set(title="Score distribution", xlabel="score"); ax[2].legend()
    plt.tight_layout(); plt.savefig("docs/metrics.png", dpi=110)

    c = coefs.sort_values()
    plt.figure(figsize=(7, 6)); c.plot.barh(color=np.where(c > 0, "#ef3124", "#2e7d32"))
    plt.title("Standardized coefficients (+ raises PD)"); plt.tight_layout(); plt.savefig("docs/coefficients.png", dpi=110)
    print(json.dumps({k: v for k, v in m.items() if k != "coefficients_std"}, indent=1))


if __name__ == "__main__":
    main()
