#!/usr/bin/env python3
"""K-means clustering over Plutchik 8-D emotion vectors.

Reads a Resonance scored_reviews JSON payload, selects k in
[k_min, k_max] by silhouette score, and writes a cluster_results JSON object.

This script is the math that later runs inside the TrueForge sandbox. It does
not call an LLM and does not name archetypes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

EMOTIONS = (
    "joy",
    "trust",
    "fear",
    "surprise",
    "sadness",
    "disgust",
    "anger",
    "anticipation",
)

DEFAULT_K_MIN = 3
DEFAULT_K_MAX = 5
DEFAULT_SEED = 42
N_REPRESENTATIVES = 3


def json_number(value: float) -> float:
    return round(float(value), 4)


def load_payload(path: Path) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"Input is not valid JSON: {path}: {error}") from error

    if isinstance(raw, list):
        return {"type": "scored_reviews", "reviews": raw, "total_reviews": len(raw)}
    if not isinstance(raw, dict):
        raise SystemExit(f"Input must be a JSON object or array, got {type(raw).__name__}")
    return raw


def extract_reviews(payload: dict[str, Any]) -> list[dict[str, Any]]:
    reviews = payload.get("reviews")
    if not isinstance(reviews, list) or len(reviews) == 0:
        raise SystemExit("No reviews[] array found in the scored_reviews payload.")
    return reviews


def build_matrix(reviews: list[dict[str, Any]]) -> tuple[np.ndarray, list[int]]:
    vectors: list[list[float]] = []
    ids: list[int] = []
    seen: set[int] = set()

    for index, review in enumerate(reviews):
        review_id = review.get("id", index + 1)
        try:
            review_id = int(review_id)
        except (TypeError, ValueError) as error:
            raise SystemExit(f"reviews[{index}].id is not an integer: {review_id!r}") from error
        if review_id in seen:
            raise SystemExit(f"Duplicate review id: {review_id}")
        seen.add(review_id)

        plutchik = review.get("plutchik")
        if not isinstance(plutchik, dict):
            raise SystemExit(f"reviews[{index}] (id={review_id}) is missing plutchik")

        row: list[float] = []
        for emotion in EMOTIONS:
            if emotion not in plutchik:
                raise SystemExit(
                    f"reviews[{index}] (id={review_id}) missing plutchik.{emotion}"
                )
            try:
                score = float(plutchik[emotion])
            except (TypeError, ValueError) as error:
                raise SystemExit(
                    f"reviews[{index}] (id={review_id}) plutchik.{emotion} is not a number"
                ) from error
            if score < 0.0 or score > 1.0:
                raise SystemExit(
                    f"reviews[{index}] (id={review_id}) plutchik.{emotion}={score} is outside 0.0–1.0"
                )
            row.append(score)
        vectors.append(row)
        ids.append(review_id)

    return np.asarray(vectors, dtype=float), ids


def choose_k(
    matrix: np.ndarray,
    k_min: int,
    k_max: int,
    seed: int,
) -> tuple[int, float, dict[str, float]]:
    n_samples = int(matrix.shape[0])
    if n_samples < 2:
        return 1, 0.0, {}

    upper = min(k_max, n_samples - 1)
    lower = min(k_min, upper)
    if lower < 2:
        lower = 2 if n_samples > 2 else 1
    if lower > upper:
        lower = upper

    if lower < 2:
        return 1, 0.0, {}

    scores: dict[str, float] = {}
    best_k = lower
    best_score = -1.0

    for k in range(lower, upper + 1):
        model = KMeans(n_clusters=k, n_init=10, random_state=seed, max_iter=300)
        labels = model.fit_predict(matrix)
        if len(set(labels.tolist())) < 2:
            scores[str(k)] = 0.0
            continue
        score = float(silhouette_score(matrix, labels))
        scores[str(k)] = json_number(score)
        if score > best_score:
            best_score = score
            best_k = k

    if best_score < 0:
        best_score = 0.0
    return best_k, json_number(best_score), scores


def cluster_payload(
    reviews: list[dict[str, Any]],
    k_min: int,
    k_max: int,
    seed: int,
) -> dict[str, Any]:
    matrix, ids = build_matrix(reviews)
    frame = pd.DataFrame(matrix, columns=list(EMOTIONS))
    frame["id"] = ids

    n_samples = len(ids)
    k, silhouette, k_scores = choose_k(matrix, k_min=k_min, k_max=k_max, seed=seed)

    if k == 1:
        labels = np.zeros(n_samples, dtype=int)
    else:
        model = KMeans(n_clusters=k, n_init=10, random_state=seed, max_iter=300)
        labels = model.fit_predict(matrix)

    frame["cluster_id"] = labels
    clusters: list[dict[str, Any]] = []

    for cluster_id in range(k):
        mask = labels == cluster_id
        member_ids = frame.loc[mask, "id"].astype(int).tolist()
        points = matrix[mask]
        if len(points) == 0:
            continue
        centroid_vec = points.mean(axis=0)
        distances = np.linalg.norm(points - centroid_vec, axis=1)
        order = np.argsort(distances)
        representative_ids = [int(member_ids[i]) for i in order[: min(N_REPRESENTATIVES, len(member_ids))]]
        clusters.append(
            {
                "id": int(cluster_id),
                "size": int(len(member_ids)),
                "centroid": {
                    emotion: json_number(centroid_vec[index])
                    for index, emotion in enumerate(EMOTIONS)
                },
                "member_ids": [int(value) for value in member_ids],
                "representative_review_ids": representative_ids,
            }
        )

    assignments = [
        {"id": int(review_id), "cluster_id": int(cluster_id)}
        for review_id, cluster_id in zip(ids, labels.tolist(), strict=True)
    ]
    assignments.sort(key=lambda item: item["id"])

    return {
        "type": "cluster_results",
        "algorithm": "kmeans",
        "feature_order": list(EMOTIONS),
        "num_clusters": int(len(clusters)),
        "silhouette_score": float(silhouette),
        "k_candidates": k_scores,
        "random_state": int(seed),
        "total_reviews": int(n_samples),
        "clusters": clusters,
        "assignments": assignments,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cluster Resonance scored_reviews JSON on Plutchik vectors."
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="Path to scored_reviews JSON.",
    )
    parser.add_argument(
        "--output",
        "-o",
        help="Write cluster_results JSON here. Defaults to stdout.",
    )
    parser.add_argument("--k-min", type=int, default=DEFAULT_K_MIN)
    parser.add_argument("--k-max", type=int, default=DEFAULT_K_MAX)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.k_min < 2:
        raise SystemExit("--k-min must be >= 2")
    if args.k_max < args.k_min:
        raise SystemExit("--k-max must be >= --k-min")

    input_path = Path(args.input)
    if not input_path.is_file():
        raise SystemExit(f"Input file not found: {input_path}")

    payload = load_payload(input_path)
    reviews = extract_reviews(payload)
    result = cluster_payload(
        reviews,
        k_min=args.k_min,
        k_max=args.k_max,
        seed=args.seed,
    )

    text = json.dumps(result, separators=(",", ":"))
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
        print(
            f"Wrote {output_path} k={result['num_clusters']} "
            f"silhouette={result['silhouette_score']} reviews={result['total_reviews']}",
            file=sys.stderr,
        )
    else:
        print(text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())