#!/usr/bin/env python
"""Create timestamped backups for pixiv novel text files before edits."""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKUP_ROOT = PROJECT_ROOT / "_backups" / "text-history"


def safe_segment(value: str) -> str:
    return "".join("_" if ch in '<>:"/\\|?*' else ch for ch in value).strip() or "未分类"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backup text files before editing.")
    parser.add_argument("files", nargs="+", help="Files to backup.")
    parser.add_argument("--reason", default="before-edit", help="Backup reason.")
    parser.add_argument("--work", default="未分类作品", help="Work name.")
    parser.add_argument("--branch", default="未分类分支", help="Branch or draft name.")
    parser.add_argument("--chapter", default="未分类章节", help="Chapter or section name.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = (
        BACKUP_ROOT
        / safe_segment(args.work)
        / safe_segment(args.branch)
        / safe_segment(args.chapter)
        / f"{stamp}-{safe_segment(args.reason)}"
    )
    backup_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "reason": args.reason,
        "work": args.work,
        "branch": args.branch,
        "chapter": args.chapter,
        "files": [],
    }

    for raw in args.files:
        src = Path(raw)
        if not src.is_absolute():
            src = (Path.cwd() / src).resolve()
        if not src.exists() or not src.is_file():
            raise FileNotFoundError(f"File not found: {src}")
        dst = backup_dir / src.name
        shutil.copy2(src, dst)
        manifest["files"].append(
            {
                "source": str(src),
                "backup": str(dst),
                "size_bytes": src.stat().st_size,
            }
        )

    (backup_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(str(backup_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

