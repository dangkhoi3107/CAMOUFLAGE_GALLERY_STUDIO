from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.parse
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

TOOL_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = TOOL_ROOT.parent.parent
STATIC_ROOT = TOOL_ROOT / "static"
INBOX_ROOT = TOOL_ROOT / "inbox"
OUTPUT_ROOT = PROJECT_ROOT / "public" / "gallery"
STATE_FILE = TOOL_ROOT / ".builder-state.json"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif", ".bmp", ".svg"}
ROLE_ORDER = ["output", "object", "background"]
ROLE_KEYWORDS = {
    "output": {"output", "result", "final", "generated", "generate", "camouflage", "render"},
    "object": {"object", "subject", "animal", "input", "original", "foreground", "fg"},
    "background": {"background", "bg", "scene", "texture", "backdrop"},
}
ALL_ROLE_KEYWORDS = set().union(*ROLE_KEYWORDS.values())

INBOX_ROOT.mkdir(parents=True, exist_ok=True)
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)


def natural_key(value: str) -> list[Any]:
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def slugify(value: str, fallback: str = "card") -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug or fallback


def title_from_slug(value: str) -> str:
    return re.sub(r"[-_]+", " ", value).strip().title() or "Untitled Card"


def infer_role(path: Path) -> str | None:
    tokens = set(re.findall(r"[a-z0-9]+", path.stem.lower()))
    parent_tokens = set(re.findall(r"[a-z0-9]+", path.parent.name.lower()))
    tokens |= parent_tokens
    matches = [role for role, keywords in ROLE_KEYWORDS.items() if tokens & keywords]
    return matches[0] if len(matches) == 1 else None


def grouping_key(path: Path) -> str:
    tokens = re.findall(r"[a-z0-9]+", path.stem.lower())
    tokens = [token for token in tokens if token not in ALL_ROLE_KEYWORDS and token not in {"img", "image", "photo", "copy"}]
    key = "-".join(tokens)
    if key:
        return key
    return slugify(path.parent.name, "group")


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"records": {}}
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("Invalid state")
        data.setdefault("records", {})
        return data
    except (OSError, ValueError, json.JSONDecodeError):
        return {"records": {}}


def save_state(state: dict[str, Any]) -> None:
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(STATE_FILE)


def relative_source(path: Path) -> str:
    return path.resolve().relative_to(INBOX_ROOT.resolve()).as_posix()


def source_path(relative: str) -> Path:
    candidate = (INBOX_ROOT / relative).resolve()
    candidate.relative_to(INBOX_ROOT.resolve())
    return candidate


def make_signature(paths: list[Path]) -> str:
    payload = "\n".join(sorted(relative_source(path) for path in paths))
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]


def assign_roles(paths: list[Path]) -> list[dict[str, str]]:
    assignments: list[dict[str, str]] = []
    used: set[str] = set()
    unresolved: list[Path] = []

    for path in paths:
        guessed = infer_role(path)
        if guessed and guessed not in used:
            used.add(guessed)
            assignments.append({"path": relative_source(path), "role": guessed, "guessed": "true"})
        else:
            unresolved.append(path)

    remaining_roles = [role for role in ROLE_ORDER if role not in used]
    for path, role in zip(unresolved, remaining_roles):
        assignments.append({"path": relative_source(path), "role": role, "guessed": "false"})

    order_map = {relative_source(path): index for index, path in enumerate(paths)}
    assignments.sort(key=lambda item: order_map[item["path"]])
    return assignments


@dataclass
class Group:
    paths: list[Path]
    label: str
    source_kind: str

    def to_dict(self, state: dict[str, Any], index: int) -> dict[str, Any]:
        signature = make_signature(self.paths)
        record = state.get("records", {}).get(signature, {})
        suggested = slugify(self.label, f"card-{index:03d}")
        if suggested in {"group", "inbox", "card"}:
            suggested = f"card-{index:03d}"
        return {
            "id": signature,
            "label": self.label,
            "sourceKind": self.source_kind,
            "status": record.get("status", "pending"),
            "savedFolder": record.get("folder"),
            "folderName": suggested,
            "title": title_from_slug(suggested),
            "files": assign_roles(self.paths),
            "complete": len(self.paths) == 3,
        }


def chunked(values: list[Path], size: int = 3) -> list[list[Path]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def scan_groups(mode: str = "smart") -> list[Group]:
    files = sorted(
        [path for path in INBOX_ROOT.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS],
        key=lambda path: natural_key(relative_source(path)),
    )
    if not files:
        return []

    if mode == "sequential":
        return [Group(group, f"card-{index:03d}", "sequential") for index, group in enumerate(chunked(files), start=1)]

    groups: list[Group] = []
    consumed: set[Path] = set()

    # Existing subfolders are treated as intentional groups first.
    by_parent: dict[Path, list[Path]] = {}
    for path in files:
        if path.parent != INBOX_ROOT:
            by_parent.setdefault(path.parent, []).append(path)

    for parent in sorted(by_parent, key=lambda path: natural_key(path.relative_to(INBOX_ROOT).as_posix())):
        parent_files = sorted(by_parent[parent], key=lambda path: natural_key(path.name))
        for part_index, part in enumerate(chunked(parent_files), start=1):
            label = parent.name if len(parent_files) <= 3 else f"{parent.name}-{part_index:02d}"
            groups.append(Group(part, label, "folder"))
            consumed.update(part)

    root_files = [path for path in files if path not in consumed]

    if mode == "folders":
        for index, part in enumerate(chunked(root_files), start=1):
            groups.append(Group(part, f"ungrouped-{index:03d}", "ungrouped"))
        return groups

    # Smart grouping by shared filename stem after removing role suffixes.
    by_key: dict[str, list[Path]] = {}
    for path in root_files:
        by_key.setdefault(grouping_key(path), []).append(path)

    leftovers: list[Path] = []
    for key in sorted(by_key, key=natural_key):
        key_files = sorted(by_key[key], key=lambda path: natural_key(path.name))
        if len(key_files) >= 3:
            for part_index, part in enumerate(chunked(key_files), start=1):
                label = key if len(key_files) <= 3 else f"{key}-{part_index:02d}"
                groups.append(Group(part, label, "smart-name"))
        else:
            leftovers.extend(key_files)

    leftovers.sort(key=lambda path: natural_key(path.name))
    for index, part in enumerate(chunked(leftovers), start=1):
        groups.append(Group(part, f"card-{len(groups) + index:03d}", "sequential-fallback"))

    return groups


def unique_destination(folder_name: str, conflict: str) -> Path:
    base_slug = slugify(folder_name)
    target = OUTPUT_ROOT / base_slug
    if not target.exists():
        return target
    if conflict == "overwrite":
        shutil.rmtree(target)
        return target
    if conflict == "error":
        raise FileExistsError(f"Folder '{base_slug}' already exists")
    index = 2
    while True:
        candidate = OUTPUT_ROOT / f"{base_slug}-{index:03d}"
        if not candidate.exists():
            return candidate
        index += 1


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(data)


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", "0"))
    if length > 2_000_000:
        raise ValueError("JSON body is too large")
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8")) if raw else {}


class Handler(BaseHTTPRequestHandler):
    server_version = "CamouflageCardBuilder/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/config":
                return json_response(
                    self,
                    {
                        "projectRoot": str(PROJECT_ROOT),
                        "inboxRoot": str(INBOX_ROOT),
                        "outputRoot": str(OUTPUT_ROOT),
                        "imageExtensions": sorted(IMAGE_EXTENSIONS),
                    },
                )

            if path == "/api/scan":
                mode = query.get("mode", ["smart"])[0]
                if mode not in {"smart", "sequential", "folders"}:
                    mode = "smart"
                state = load_state()
                groups = [group.to_dict(state, index) for index, group in enumerate(scan_groups(mode), start=1)]
                counts = {"total": len(groups), "pending": 0, "done": 0, "skipped": 0, "incomplete": 0}
                for group in groups:
                    counts[group["status"]] = counts.get(group["status"], 0) + 1
                    if not group["complete"]:
                        counts["incomplete"] += 1
                return json_response(self, {"groups": groups, "counts": counts})

            if path.startswith("/media/"):
                relative = urllib.parse.unquote(path[len("/media/") :])
                file_path = source_path(relative)
                if not file_path.is_file():
                    return self.send_error(HTTPStatus.NOT_FOUND, "Image not found")
                content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
                data = file_path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache")
                self.end_headers()
                self.wfile.write(data)
                return

            return self.serve_static(path)
        except Exception as exc:  # noqa: BLE001
            return json_response(self, {"error": str(exc)}, status=500)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path == "/api/upload":
                relative = query.get("path", [""])[0].replace("\\", "/").lstrip("/")
                if not relative:
                    raise ValueError("Missing file path")
                parts = [slugify(part, "file") if index < len(Path(relative).parts) - 1 else Path(part).name for index, part in enumerate(Path(relative).parts)]
                safe_relative = Path(*parts)
                if safe_relative.suffix.lower() not in IMAGE_EXTENSIONS:
                    raise ValueError("Unsupported image type")
                target = (INBOX_ROOT / safe_relative).resolve()
                target.relative_to(INBOX_ROOT.resolve())
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    stem, suffix = target.stem, target.suffix
                    index = 2
                    while target.exists():
                        target = target.with_name(f"{stem}-{index:03d}{suffix}")
                        index += 1
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > 100 * 1024 * 1024:
                    raise ValueError("Invalid file size")
                with target.open("wb") as file_handle:
                    remaining = length
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        file_handle.write(chunk)
                        remaining -= len(chunk)
                return json_response(self, {"saved": relative_source(target)})

            if path == "/api/save":
                payload = read_json(self)
                file_items = payload.get("files", [])
                roles = [item.get("role") for item in file_items]
                if sorted(roles) != sorted(ROLE_ORDER) or len(file_items) != 3:
                    raise ValueError("A card must contain exactly one output, one object and one background image")

                paths = [source_path(item["path"]) for item in file_items]
                if not all(path.is_file() for path in paths):
                    raise FileNotFoundError("One or more source images no longer exist")

                destination = unique_destination(payload.get("folderName", "card"), payload.get("conflict", "increment"))
                destination.mkdir(parents=True, exist_ok=False)
                move_files = bool(payload.get("moveFiles", False))

                try:
                    for item, source in zip(file_items, paths):
                        role = item["role"]
                        extension = source.suffix.lower() or ".png"
                        target = destination / f"{role}{extension}"
                        if move_files:
                            shutil.move(str(source), str(target))
                        else:
                            shutil.copy2(source, target)

                    tags = payload.get("tags", [])
                    if isinstance(tags, str):
                        tags = [part.strip() for part in tags.split(",") if part.strip()]
                    metadata = {
                        "title": str(payload.get("title", "")).strip() or title_from_slug(destination.name),
                        "description": str(payload.get("description", "")).strip(),
                        "tags": tags,
                        "featured": bool(payload.get("featured", False)),
                    }
                    (destination / "meta.json").write_text(
                        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
                    )
                except Exception:
                    if destination.exists():
                        shutil.rmtree(destination, ignore_errors=True)
                    raise

                signature = make_signature(paths)
                state = load_state()
                state.setdefault("records", {})[signature] = {
                    "status": "done",
                    "folder": destination.name,
                    "updatedAt": int(time.time()),
                }
                save_state(state)
                return json_response(
                    self,
                    {
                        "ok": True,
                        "folder": destination.name,
                        "path": str(destination),
                        "meta": metadata,
                    },
                )

            if path == "/api/status":
                payload = read_json(self)
                signature = str(payload.get("id", ""))
                status = str(payload.get("status", "pending"))
                if not signature or status not in {"pending", "skipped"}:
                    raise ValueError("Invalid status update")
                state = load_state()
                if status == "pending":
                    state.setdefault("records", {}).pop(signature, None)
                else:
                    state.setdefault("records", {})[signature] = {
                        "status": status,
                        "updatedAt": int(time.time()),
                    }
                save_state(state)
                return json_response(self, {"ok": True})

            if path == "/api/reset-state":
                save_state({"records": {}})
                return json_response(self, {"ok": True})

            if path == "/api/open-folder":
                payload = read_json(self)
                target = INBOX_ROOT if payload.get("kind") == "inbox" else OUTPUT_ROOT
                if os.name == "nt":
                    os.startfile(target)  # type: ignore[attr-defined]
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", str(target)])
                else:
                    subprocess.Popen(["xdg-open", str(target)])
                return json_response(self, {"ok": True, "path": str(target)})

            if path == "/api/build-gallery":
                npm = "npm.cmd" if os.name == "nt" else "npm"
                process = subprocess.run(
                    [npm, "run", "build"],
                    cwd=PROJECT_ROOT,
                    capture_output=True,
                    text=True,
                    timeout=120,
                    check=False,
                )
                return json_response(
                    self,
                    {
                        "ok": process.returncode == 0,
                        "code": process.returncode,
                        "stdout": process.stdout,
                        "stderr": process.stderr,
                    },
                    status=200 if process.returncode == 0 else 500,
                )

            return self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")
        except (ValueError, FileNotFoundError, FileExistsError) as exc:
            return json_response(self, {"error": str(exc)}, status=400)
        except Exception as exc:  # noqa: BLE001
            return json_response(self, {"error": str(exc)}, status=500)

    def serve_static(self, request_path: str) -> None:
        relative = request_path.lstrip("/") or "index.html"
        file_path = (STATIC_ROOT / relative).resolve()
        try:
            file_path.relative_to(STATIC_ROOT.resolve())
        except ValueError:
            return self.send_error(HTTPStatus.FORBIDDEN)
        if file_path.is_dir():
            file_path = file_path / "index.html"
        if not file_path.is_file():
            return self.send_error(HTTPStatus.NOT_FOUND)
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8" if content_type.startswith("text/") else content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


def find_available_port(start: int) -> int:
    import socket

    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No available local port found")


def main() -> None:
    preferred = int(os.environ.get("CARD_BUILDER_PORT", "8787"))
    port = find_available_port(preferred)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}"
    print("\nCamouflage Card Builder")
    print(f"Open:   {url}")
    print(f"Inbox:  {INBOX_ROOT}")
    print(f"Output: {OUTPUT_ROOT}")
    print("Press Ctrl+C to stop.\n")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Card Builder...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
