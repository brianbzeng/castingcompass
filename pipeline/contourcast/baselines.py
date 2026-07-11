"""Classical occurrence/CPUE baselines for honest deep-model comparison."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


BASELINE_NAMES = ("naive", "linear", "boosted")


@dataclass
class BaselinePredictions:
    occurrence_probability: np.ndarray
    cpue: np.ndarray


def _positive_regression_data(
    features: np.ndarray, occurrence: np.ndarray, cpue: np.ndarray
) -> Tuple[np.ndarray, np.ndarray]:
    positive = (occurrence == 1) & np.isfinite(cpue) & (cpue >= 0)
    if np.sum(positive) < 5:
        raise ValueError("at least five positive training catches are required for the CPUE head")
    return features[positive], np.log1p(cpue[positive])


def fit_predict_baseline(
    model_name: str,
    train_features: np.ndarray,
    train_occurrence: np.ndarray,
    train_cpue: np.ndarray,
    test_features: np.ndarray,
    *,
    random_state: int = 42,
) -> BaselinePredictions:
    if model_name not in BASELINE_NAMES:
        raise ValueError(f"unknown baseline {model_name!r}")
    train_occurrence = np.asarray(train_occurrence, dtype=int)
    train_cpue = np.asarray(train_cpue, dtype=float)
    if set(np.unique(train_occurrence)) != {0, 1}:
        raise ValueError("occurrence training labels must include both classes")

    if model_name == "naive":
        probability = np.full(len(test_features), np.mean(train_occurrence), dtype=float)
        positive_cpue = train_cpue[train_occurrence == 1]
        predicted_cpue = np.full(len(test_features), np.mean(positive_cpue), dtype=float)
        return BaselinePredictions(probability, predicted_cpue)

    positive_x, positive_log_cpue = _positive_regression_data(
        train_features, train_occurrence, train_cpue
    )
    if model_name == "linear":
        occurrence_model = make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=2000, class_weight="balanced", random_state=random_state),
        )
        cpue_model = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
    else:
        occurrence_model = HistGradientBoostingClassifier(
            learning_rate=0.06,
            max_iter=150,
            max_leaf_nodes=15,
            l2_regularization=1.0,
            random_state=random_state,
        )
        cpue_model = HistGradientBoostingRegressor(
            learning_rate=0.06,
            max_iter=150,
            max_leaf_nodes=15,
            l2_regularization=1.0,
            random_state=random_state,
        )
    occurrence_model.fit(train_features, train_occurrence)
    cpue_model.fit(positive_x, positive_log_cpue)
    probability = occurrence_model.predict_proba(test_features)[:, 1]
    predicted_cpue = np.maximum(np.expm1(cpue_model.predict(test_features)), 0.0)
    return BaselinePredictions(probability, predicted_cpue)
