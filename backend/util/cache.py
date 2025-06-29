"""
Small wrapper around json-on-disk with atomic writes & TTL checking.
"""
from __future__ import annotations
import datetime as _dt
import json, os, shutil, tempfile
from pathlib import Path
from typing import Any
from filelock import FileLock

from config import CACHE_DIR, LISTING_TTL_H, CACHE_PURGE_D, LOCK_TIMEOUT_SEC

# ───────────────────────────────── helpers ──────────────────────────────────
def _atomic_write(path: Path, data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent))
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    shutil.move(tmp, path)                       # atomic rename on same FS

def _purge_old_cache() -> None:
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=CACHE_PURGE_D)
    for fp in CACHE_DIR.glob("*.json"):
        try:
            ts = _dt.datetime.fromisoformat(json.loads(fp.read_text())["ts"])
            if ts < cutoff:
                fp.unlink(missing_ok=True)
        except Exception:
            fp.unlink(missing_ok=True)

# ───────────────────────────────── public api ───────────────────────────────
def cache_path(key: str) -> Path:
    return CACHE_DIR / f"{key}.json"

def load(key: str, max_age_h: int) -> list[dict] | None:
    fn = cache_path(key)
    if not fn.exists():
        return None
    meta = json.loads(fn.read_text())
    ts   = _dt.datetime.fromisoformat(meta["ts"])
    if _dt.datetime.utcnow() - ts < _dt.timedelta(hours=max_age_h):
        return meta["raw"]
    return None

def save(key: str, raw: list[dict]) -> None:
    fn = cache_path(key)
    payload = {"ts": _dt.datetime.utcnow().isoformat(), "raw": raw}
    _atomic_write(fn, payload)
    _purge_old_cache()

def with_lock(path: Path) -> FileLock:
    """Return a FileLock guarding *path* (json) with sane timeout."""
    return FileLock(str(path) + ".lock", timeout=LOCK_TIMEOUT_SEC)
