#!/usr/bin/env python3
"""Calibrate a similarity threshold from JSON/JSONL labels.

Each row must contain ``similarity`` (0..1) and ``relevant`` (boolean).
This script is offline-only and never calls an embedding or LLM service.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_rows(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    payload = json.loads(text) if path.suffix.lower() == ".json" else [json.loads(line) for line in text.splitlines() if line.strip()]
    if not isinstance(payload, list) or not payload:
        raise ValueError("calibration dataset must be a non-empty list")
    rows = []
    for index, item in enumerate(payload, 1):
        if "similarity" not in item or "relevant" not in item:
            raise ValueError(f"row {index} must contain similarity and relevant")
        similarity = float(item["similarity"])
        if not 0 <= similarity <= 1:
            raise ValueError(f"row {index} similarity must be between 0 and 1")
        rows.append({"similarity": similarity, "relevant": bool(item["relevant"])})
    return rows


def metrics(rows: list[dict], threshold: float) -> dict:
    tp = sum(row["relevant"] and row["similarity"] >= threshold for row in rows)
    fp = sum(not row["relevant"] and row["similarity"] >= threshold for row in rows)
    fn = sum(row["relevant"] and row["similarity"] < threshold for row in rows)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"threshold": threshold, "precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--step", type=float, default=0.01)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    rows = load_rows(args.dataset)
    thresholds = [index * args.step for index in range(int(1 / args.step) + 1)]
    best = max((metrics(rows, threshold) for threshold in thresholds), key=lambda item: (item["f1"], item["precision"], item["threshold"]))
    output = {"samples": len(rows), "suggested_threshold": best["threshold"], **best}
    if args.json:
        print(json.dumps(output, ensure_ascii=False))
    else:
        print(f"samples={output['samples']} threshold={best['threshold']:.3f} precision={best['precision']:.4f} recall={best['recall']:.4f} f1={best['f1']:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
