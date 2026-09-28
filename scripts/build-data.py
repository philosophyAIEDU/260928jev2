"""Make a small district × broad-industry dataset from repository 260903academy.

Usage: python scripts/build-data.py /path/to/commercial-stats.json
"""
import json
import sys
from collections import defaultdict
from pathlib import Path


def build(source):
    raw = json.loads(Path(source).read_text(encoding="utf-8"))
    counts = defaultdict(lambda: defaultdict(int))
    for dong, small, amount in raw["stats"]:
        district = dong[:5]
        industry = small[:2]
        counts[district][industry] += amount
    districts = []
    for code, industries in sorted(counts.items()):
        districts.append({"code": code, "name": raw["sigunguNames"][code],
                          "sido": code[:2], "counts": dict(sorted(industries.items()))})
    result = {
        "meta": {"source": "philosophyAIEDU/260903academy/data/processed/commercial-stats.json",
                 "sourceMonth": raw["meta"]["dataReferenceMonth"],
                 "sourceStores": raw["meta"]["totalStores"],
                 "scope": "시군구 × 업종 대분류의 점포 수 집계"},
        "sidos": raw["sidoNames"],
        "industries": {k: v for k, v in raw["industryNames"].items() if len(k) == 2},
        "districts": districts,
    }
    assert sum(sum(d["counts"].values()) for d in districts) == raw["meta"]["totalStores"]
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    destination = Path(__file__).resolve().parents[1] / "data" / "market.json"
    destination.write_text(json.dumps(build(sys.argv[1]), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{destination}: {destination.stat().st_size:,} bytes")
