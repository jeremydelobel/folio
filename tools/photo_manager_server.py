#!/usr/bin/env python3
"""Local-only photo manager and static server for the portfolio."""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import tempfile
import threading
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = "127.0.0.1"
DEFAULT_PORT = 4173
API_VERSION = 2
API_CAPABILITIES = ("photo-delete",)
MAX_FILE_SIZE = 200 * 1024 * 1024
MAX_JSON_SIZE = 2 * 1024 * 1024
LEAD_START = "<!-- photo-project-lead:start -->"
LEAD_END = "<!-- photo-project-lead:end -->"
LEGACY_LEAD_START = "<!-- PHOTO_PROJECT_LEAD_START -->"
LEGACY_LEAD_END = "<!-- PHOTO_PROJECT_LEAD_END -->"
VALID_IMAGE_SUFFIXES = {".jpg", ".jpeg"}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def normalized_text(value: Any) -> str:
    return unicodedata.normalize("NFC", str(value or "")).strip()


def slugify(label: str) -> str:
    ascii_label = (
        unicodedata.normalize("NFKD", label)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", ascii_label))


def ensure_safe_slug(value: str) -> str:
    slug = normalized_text(value)
    if not slug or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Dossier invalide")
    return slug


def ensure_safe_filename(value: str) -> str:
    filename = normalized_text(value)
    if (
        not filename
        or filename in {".", ".."}
        or Path(filename).name != filename
        or "/" in filename
        or "\\" in filename
        or "\x00" in filename
        or len(filename) > 240
        or Path(filename).suffix.lower() not in VALID_IMAGE_SUFFIXES
    ):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Nom de fichier JPG invalide")
    return filename


def is_within(root: Path, candidate: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    atomic_write_text(
        path,
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
    )


def run_command(arguments: list[str], error_message: str) -> str:
    try:
        result = subprocess.run(
            arguments,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        detail = ""
        if isinstance(error, subprocess.CalledProcessError):
            detail = (error.stderr or error.stdout or "").strip()
        raise ApiError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            f"{error_message}{f' : {detail}' if detail else ''}",
        ) from error
    return result.stdout.strip()


def image_dimensions(path: Path) -> tuple[int, int]:
    output = run_command(
        ["magick", "identify", "-format", "%w %h", str(path)],
        "Impossible de lire les dimensions de l’image",
    )
    try:
        width, height = (int(part) for part in output.split())
    except (TypeError, ValueError) as error:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Dimensions JPG invalides") from error
    if width <= 0 or height <= 0:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Dimensions JPG invalides")
    return width, height


def oriented_dimensions(path: Path) -> tuple[int, int]:
    output = run_command(
        ["magick", str(path), "-auto-orient", "-format", "%w %h", "info:"],
        "Impossible d’orienter l’image",
    )
    try:
        width, height = (int(part) for part in output.split())
    except (TypeError, ValueError) as error:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Dimensions JPG invalides") from error
    return width, height


def validate_jpeg(path: Path) -> None:
    image_format = run_command(
        ["magick", "identify", "-format", "%m", str(path)],
        "Fichier JPG illisible",
    ).upper()
    if image_format not in {"JPEG", "JPG"}:
        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Le fichier n’est pas un JPG valide")


def layout_photo_ids(layout: list[dict[str, Any]]) -> list[str]:
    photo_ids: list[str] = []
    for row in layout:
        row_type = row.get("type")
        if row_type == "featured":
            photo_ids.append(row.get("photo"))
        elif row_type == "pair":
            photo_ids.extend(row.get("photos", []))
        elif row_type == "composition":
            photo_ids.append(row.get("portrait"))
            photo_ids.extend(row.get("landscapes", []))
    return [photo_id for photo_id in photo_ids if isinstance(photo_id, str)]


class PhotoManager:
    def __init__(self, site_root: Path, source_root: Path, token: str):
        self.site_root = site_root.resolve()
        self.source_root = source_root.resolve()
        self.manifest_path = self.site_root / "rsrc" / "photo-library.json"
        self.web_root = self.site_root / "rsrc" / "photos"
        self.fullres_root = self.site_root / "rsrc" / "photos-fullres"
        self.token = token
        self.lock = threading.RLock()
        self.imports: dict[str, dict[str, Any]] = {}
        self.load_manifest()

    def load_manifest(self) -> dict[str, Any]:
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Manifeste photo illisible: {self.manifest_path}") from error
        if (
            not isinstance(manifest, dict)
            or manifest.get("version") != 1
            or not isinstance(manifest.get("folders"), dict)
            or not isinstance(manifest.get("photos"), list)
            or not isinstance(manifest.get("projects"), dict)
        ):
            raise RuntimeError("Format de manifeste photo invalide")
        return manifest

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return self.load_manifest()

    def create_folder(self, label_value: Any) -> dict[str, Any]:
        label = normalized_text(label_value)
        if not label or len(label) > 100:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Nom de dossier invalide")
        slug = slugify(label)
        if not slug:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Ce nom ne permet pas de créer un dossier")
        with self.lock:
            manifest = self.load_manifest()
            if slug in manifest["folders"]:
                raise ApiError(HTTPStatus.CONFLICT, "Un dossier portant ce nom existe déjà")
            source_folder = self.source_root / slug
            if not is_within(self.source_root, source_folder):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Dossier invalide")
            source_folder.mkdir(parents=True, exist_ok=False)
            try:
                manifest["folders"][slug] = {"label": label}
                atomic_write_json(self.manifest_path, manifest)
            except Exception:
                try:
                    source_folder.rmdir()
                except OSError:
                    pass
                raise
            return {"manifest": manifest, "folder": {"slug": slug, "label": label}}

    def rename_folder(self, slug_value: str, label_value: Any) -> dict[str, Any]:
        slug = ensure_safe_slug(slug_value)
        label = normalized_text(label_value)
        if not label or len(label) > 100:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Nom de dossier invalide")
        with self.lock:
            manifest = self.load_manifest()
            if slug not in manifest["folders"]:
                raise ApiError(HTTPStatus.NOT_FOUND, "Dossier introuvable")
            manifest["folders"][slug] = {"label": label}
            atomic_write_json(self.manifest_path, manifest)
            return {"manifest": manifest, "folder": {"slug": slug, "label": label}}

    def start_import(self, payload: dict[str, Any]) -> dict[str, Any]:
        folder = ensure_safe_slug(payload.get("folder", ""))
        file_entries = payload.get("files")
        if not isinstance(file_entries, list) or not file_entries or len(file_entries) > 500:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Sélection de fichiers invalide")
        with self.lock:
            manifest = self.load_manifest()
            if folder not in manifest["folders"]:
                raise ApiError(HTTPStatus.NOT_FOUND, "Dossier introuvable")
            if not is_within(self.source_root, self.source_root / folder):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Dossier source invalide")
            existing_by_fold = {
                photo["id"].casefold(): photo["id"]
                for photo in manifest["photos"]
                if isinstance(photo, dict) and isinstance(photo.get("id"), str)
            }
            normalized_entries: dict[str, dict[str, Any]] = {}
            conflicts: list[str] = []
            seen_outputs: set[str] = set()
            for raw_entry in file_entries:
                if not isinstance(raw_entry, dict):
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Fichier invalide")
                filename = ensure_safe_filename(raw_entry.get("name", ""))
                try:
                    size = int(raw_entry.get("size", 0))
                except (TypeError, ValueError) as error:
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Taille de fichier invalide") from error
                if size <= 0 or size > MAX_FILE_SIZE:
                    raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Un JPG dépasse la limite de 200 Mo")
                stem = normalized_text(Path(filename).stem)
                proposed_id = f"{folder}/{stem}.webp"
                output_key = proposed_id.casefold()
                if output_key in seen_outputs:
                    raise ApiError(HTTPStatus.CONFLICT, "Deux fichiers produisent le même nom")
                seen_outputs.add(output_key)
                existing_id = existing_by_fold.get(output_key)
                photo_id = existing_id or proposed_id
                source_target = self._find_source_target(folder, filename)
                conflict = (
                    bool(existing_id)
                    or (self.web_root / photo_id).exists()
                    or (self.fullres_root / Path(photo_id).with_suffix(".jpg")).exists()
                    or source_target.exists()
                )
                if conflict:
                    conflicts.append(filename)
                normalized_entries[filename] = {
                    "name": filename,
                    "size": size,
                    "photo_id": photo_id,
                    "folder": folder,
                    "conflict": conflict,
                    "overwrite_authorized": False,
                    "uploaded": False,
                }
            import_id = secrets.token_urlsafe(18)
            job_dir = Path(tempfile.mkdtemp(prefix="photo-manager-import-"))
            self.imports[import_id] = {
                "id": import_id,
                "folder": folder,
                "dir": job_dir,
                "files": normalized_entries,
                "committing": False,
            }
            return {"importId": import_id, "conflicts": conflicts}

    def upload_file(
        self,
        import_id: str,
        filename_value: str,
        content_length: int,
        overwrite: bool,
        stream: Any,
    ) -> dict[str, Any]:
        filename = ensure_safe_filename(filename_value)
        with self.lock:
            job = self.imports.get(import_id)
            if not job or job.get("committing"):
                raise ApiError(HTTPStatus.NOT_FOUND, "Import introuvable")
            entry = job["files"].get(filename)
            if not entry:
                raise ApiError(HTTPStatus.NOT_FOUND, "Fichier inattendu")
            if entry["conflict"] and not overwrite:
                raise ApiError(HTTPStatus.CONFLICT, "Ce fichier existe déjà")
            if content_length != entry["size"] or content_length > MAX_FILE_SIZE:
                raise ApiError(HTTPStatus.BAD_REQUEST, "Taille reçue incorrecte")
            upload_path = job["dir"] / f"upload-{len(job['files'])}-{secrets.token_hex(8)}.jpg"
        remaining = content_length
        try:
            with upload_path.open("wb") as handle:
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ApiError(HTTPStatus.BAD_REQUEST, "Import interrompu")
                    handle.write(chunk)
                    remaining -= len(chunk)
                handle.flush()
                os.fsync(handle.fileno())
        except Exception:
            upload_path.unlink(missing_ok=True)
            raise
        with self.lock:
            job = self.imports.get(import_id)
            if not job:
                upload_path.unlink(missing_ok=True)
                raise ApiError(HTTPStatus.NOT_FOUND, "Import expiré")
            old_path = entry.get("upload_path")
            if old_path:
                Path(old_path).unlink(missing_ok=True)
            entry["upload_path"] = str(upload_path)
            entry["overwrite_authorized"] = bool(entry["conflict"] and overwrite)
            entry["uploaded"] = True
        return {"uploaded": filename}

    def cancel_import(self, import_id: str) -> None:
        with self.lock:
            job = self.imports.pop(import_id, None)
        if job:
            shutil.rmtree(job["dir"], ignore_errors=True)

    def _find_source_target(self, folder: str, filename: str) -> Path:
        source_folder = self.source_root / folder
        stem_key = normalized_text(Path(filename).stem).casefold()
        if source_folder.exists():
            for candidate in source_folder.iterdir():
                if (
                    candidate.is_file()
                    and candidate.suffix.lower() in VALID_IMAGE_SUFFIXES
                    and normalized_text(candidate.stem).casefold() == stem_key
                ):
                    return candidate
        return source_folder / filename

    def _convert_import(self, job: dict[str, Any]) -> list[dict[str, Any]]:
        converted_root = job["dir"] / "converted"
        converted_root.mkdir(parents=True, exist_ok=True)
        converted: list[dict[str, Any]] = []
        for index, entry in enumerate(job["files"].values()):
            if not entry.get("uploaded"):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Tous les fichiers n’ont pas été reçus")
            upload_path = Path(entry["upload_path"])
            validate_jpeg(upload_path)
            source_width, source_height = oriented_dimensions(upload_path)
            resize_geometry = "x1300>" if source_height > source_width else "1000x>"
            webp_stage = converted_root / f"{index}.webp"
            jpg_stage = converted_root / f"{index}.jpg"
            run_command(
                [
                    "magick",
                    str(upload_path),
                    "-auto-orient",
                    "-resize",
                    resize_geometry,
                    "-strip",
                    "-quality",
                    "90",
                    str(webp_stage),
                ],
                f"Conversion WebP impossible pour {entry['name']}",
            )
            run_command(
                [
                    "magick",
                    str(upload_path),
                    "-auto-orient",
                    "-resize",
                    "1920x1920>",
                    "-strip",
                    "-interlace",
                    "Plane",
                    "-quality",
                    "85",
                    str(jpg_stage),
                ],
                f"Conversion JPG impossible pour {entry['name']}",
            )
            width, height = image_dimensions(webp_stage)
            photo_id = entry["photo_id"]
            converted.append(
                {
                    **entry,
                    "upload_path": upload_path,
                    "webp_stage": webp_stage,
                    "jpg_stage": jpg_stage,
                    "webp_target": self.web_root / photo_id,
                    "jpg_target": self.fullres_root / Path(photo_id).with_suffix(".jpg"),
                    "source_target": self._find_source_target(job["folder"], entry["name"]),
                    "width": width,
                    "height": height,
                }
            )
        return converted

    def _commit_files_and_manifest(
        self,
        converted: list[dict[str, Any]],
        manifest: dict[str, Any],
    ) -> None:
        backup_root = Path(tempfile.mkdtemp(prefix="photo-manager-backup-"))
        targets: list[tuple[Path, Path, Path | None]] = []
        try:
            for index, item in enumerate(converted):
                for kind in ("source", "webp", "jpg"):
                    target = item[f"{kind}_target"]
                    stage = item["upload_path"] if kind == "source" else item[f"{kind}_stage"]
                    if not is_within(
                        self.source_root if kind == "source" else self.site_root,
                        target,
                    ):
                        raise ApiError(HTTPStatus.BAD_REQUEST, "Chemin de destination invalide")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    backup = None
                    if target.exists():
                        backup = backup_root / f"{index}-{kind}.backup"
                        shutil.copy2(target, backup)
                    targets.append((target, stage, backup))
            for index, (target, stage, _) in enumerate(targets):
                target_stage = target.parent / f".{target.name}.{index}.{secrets.token_hex(5)}.tmp"
                shutil.copy2(stage, target_stage)
                os.replace(target_stage, target)
            atomic_write_json(self.manifest_path, manifest)
        except Exception:
            for target, _, backup in reversed(targets):
                try:
                    if backup and backup.exists():
                        shutil.copy2(backup, target)
                    else:
                        target.unlink(missing_ok=True)
                except OSError:
                    pass
            raise
        finally:
            shutil.rmtree(backup_root, ignore_errors=True)

    def commit_import(self, import_id: str) -> dict[str, Any]:
        with self.lock:
            job = self.imports.get(import_id)
            if not job or job.get("committing"):
                raise ApiError(HTTPStatus.NOT_FOUND, "Import introuvable")
            if any(
                entry["conflict"] and not entry["overwrite_authorized"]
                for entry in job["files"].values()
            ):
                raise ApiError(HTTPStatus.CONFLICT, "Confirmation de remplacement requise")
            job["committing"] = True
        try:
            converted = self._convert_import(job)
            with self.lock:
                if any(
                    not item["overwrite_authorized"]
                    and (
                        item["source_target"].exists()
                        or item["webp_target"].exists()
                        or item["jpg_target"].exists()
                    )
                    for item in converted
                ):
                    raise ApiError(
                        HTTPStatus.CONFLICT,
                        "Un fichier du même nom a été ajouté pendant l’import",
                    )
                manifest = self.load_manifest()
                photos = manifest["photos"]
                positions = {
                    photo["id"].casefold(): index
                    for index, photo in enumerate(photos)
                    if isinstance(photo, dict) and isinstance(photo.get("id"), str)
                }
                imported = 0
                replaced = 0
                for item in converted:
                    photo_record = {
                        "id": item["photo_id"],
                        "folder": job["folder"],
                        "width": item["width"],
                        "height": item["height"],
                    }
                    position = positions.get(item["photo_id"].casefold())
                    if position is None:
                        positions[item["photo_id"].casefold()] = len(photos)
                        photos.append(photo_record)
                        imported += 1
                    else:
                        photos[position] = photo_record
                        replaced += 1
                self._commit_files_and_manifest(converted, manifest)
                self.imports.pop(import_id, None)
            return {
                "manifest": manifest,
                "summary": {"imported": imported, "replaced": replaced},
            }
        finally:
            with self.lock:
                failed_job = self.imports.pop(import_id, None)
            shutil.rmtree((failed_job or job)["dir"], ignore_errors=True)

    def _validate_layout(
        self,
        manifest: dict[str, Any],
        project_key: str,
        raw_layout: Any,
    ) -> list[dict[str, Any]]:
        project = manifest["projects"].get(project_key)
        if not isinstance(project, dict):
            raise ApiError(HTTPStatus.NOT_FOUND, "Projet introuvable")
        if not isinstance(raw_layout, list) or not raw_layout:
            raise ApiError(HTTPStatus.BAD_REQUEST, "La mise en page est vide")
        photos = {
            photo["id"]: photo
            for photo in manifest["photos"]
            if isinstance(photo, dict)
            and photo.get("folder") == project.get("folder")
            and isinstance(photo.get("id"), str)
        }
        seen: set[str] = set()

        def require_photo(photo_id: Any) -> dict[str, Any]:
            if not isinstance(photo_id, str) or photo_id not in photos:
                raise ApiError(HTTPStatus.BAD_REQUEST, "Photo de mise en page introuvable")
            if photo_id in seen:
                raise ApiError(HTTPStatus.BAD_REQUEST, "Une photo est utilisée deux fois")
            seen.add(photo_id)
            return photos[photo_id]

        def kind(photo: dict[str, Any]) -> tuple[str, bool, bool]:
            width = float(photo.get("width") or 1)
            height = float(photo.get("height") or 1)
            ratio = width / height
            portrait = ratio < 1
            three_two = not portrait and abs(ratio - 1.5) <= 0.035
            return ("portrait" if portrait else "landscape", three_two, not portrait and not three_two)

        layout: list[dict[str, Any]] = []
        for raw_row in raw_layout:
            if not isinstance(raw_row, dict):
                raise ApiError(HTTPStatus.BAD_REQUEST, "Rangée invalide")
            row_type = raw_row.get("type")
            if row_type == "featured":
                photo_id = raw_row.get("photo")
                require_photo(photo_id)
                layout.append({"type": "featured", "photo": photo_id})
            elif row_type == "pair":
                pair = raw_row.get("photos")
                if not isinstance(pair, list) or len(pair) != 2:
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Duo incomplet")
                pair_photos = [require_photo(photo_id) for photo_id in pair]
                pair_kinds = [kind(photo) for photo in pair_photos]
                compatible = all(value[0] == "portrait" for value in pair_kinds) or all(
                    value[1] for value in pair_kinds
                )
                if not compatible or any(value[2] for value in pair_kinds):
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Formats incompatibles dans un duo")
                layout.append({"type": "pair", "photos": list(pair)})
            elif row_type == "composition":
                portrait_id = raw_row.get("portrait")
                landscapes = raw_row.get("landscapes")
                if not isinstance(landscapes, list) or len(landscapes) != 2:
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Composition incomplète")
                portrait = require_photo(portrait_id)
                landscape_photos = [require_photo(photo_id) for photo_id in landscapes]
                if kind(portrait)[0] != "portrait" or not all(
                    kind(photo)[1] for photo in landscape_photos
                ):
                    raise ApiError(HTTPStatus.BAD_REQUEST, "Formats incompatibles dans une composition")
                layout.append(
                    {
                        "type": "composition",
                        "portrait": portrait_id,
                        "landscapes": list(landscapes),
                        "portraitSide": "right" if raw_row.get("portraitSide") == "right" else "left",
                    }
                )
            else:
                raise ApiError(HTTPStatus.BAD_REQUEST, "Type de rangée inconnu")
        return layout

    def _project_page_path(self, route: str) -> Path:
        parsed = urllib.parse.urlsplit(route)
        if parsed.scheme or parsed.netloc or not parsed.path.startswith("/"):
            raise ApiError(HTTPStatus.BAD_REQUEST, "Route de projet invalide")
        relative = parsed.path.lstrip("/")
        page_path = self.site_root / relative
        if parsed.path.endswith("/"):
            page_path /= "index.html"
        if page_path.suffix.lower() != ".html" or not is_within(self.site_root, page_path):
            raise ApiError(HTTPStatus.BAD_REQUEST, "Page de projet invalide")
        if not page_path.is_file():
            raise ApiError(HTTPStatus.NOT_FOUND, "Page de projet introuvable")
        return page_path

    def _updated_lead_page(self, page_path: Path, photo_id: str) -> str:
        page_text = page_path.read_text(encoding="utf-8")
        marker_pair = None
        for start, end in (
            (LEAD_START, LEAD_END),
            (LEGACY_LEAD_START, LEGACY_LEAD_END),
        ):
            if start in page_text and end in page_text:
                marker_pair = (start, end)
                break
        if not marker_pair:
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Repères SEO absents de la page projet")
        start, end = marker_pair
        start_index = page_text.index(start) + len(start)
        end_index = page_text.index(end, start_index)
        block = page_text[start_index:end_index]
        fullres_id = str(Path(photo_id).with_suffix(".jpg")).replace(os.sep, "/")
        relative_url = f"/rsrc/photos-fullres/{fullres_id}"
        absolute_url = "https://jeremydelobel.fr" + urllib.parse.quote(
            relative_url, safe="/@._-"
        )
        fullres_path = self.fullres_root / fullres_id
        if not fullres_path.is_file() or not is_within(self.fullres_root, fullres_path):
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "JPG principal introuvable")
        width, height = image_dimensions(fullres_path)

        substitutions = (
            (
                r'(<meta\s+property="og:image"\s+content=")[^"]*(")',
                rf"\g<1>{absolute_url}\g<2>",
            ),
            (
                r'(<meta\s+property="og:image:width"\s+content=")[^"]*(")',
                rf"\g<1>{width}\g<2>",
            ),
            (
                r'(<meta\s+property="og:image:height"\s+content=")[^"]*(")',
                rf"\g<1>{height}\g<2>",
            ),
            (
                r'(<meta\s+name="twitter:image"\s+content=")[^"]*(")',
                rf"\g<1>{absolute_url}\g<2>",
            ),
            (
                r'(<link\s+rel="preload"\s+as="image"\s+href=")[^"]*(")',
                rf"\g<1>{urllib.parse.quote(relative_url, safe='/@._-')}\g<2>",
            ),
        )
        required_patterns = {"og:image", "twitter:image", "preload"}
        matched_patterns: set[str] = set()
        for pattern, replacement in substitutions:
            block, count = re.subn(pattern, replacement, block, count=1, flags=re.DOTALL)
            if count:
                if "twitter:image" in pattern:
                    matched_patterns.add("twitter:image")
                elif "og:image" in pattern and "width" not in pattern and "height" not in pattern:
                    matched_patterns.add("og:image")
                elif "preload" in pattern:
                    matched_patterns.add("preload")
        if matched_patterns != required_patterns:
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Métadonnées principales incomplètes")
        return page_text[:start_index] + block + page_text[end_index:]

    def _layout_after_photo_deletion(
        self,
        layout: Any,
        photo_id: str,
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        """Remove one photo while preserving every other photo in valid row shapes."""
        if not isinstance(layout, list):
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Mise en page de projet invalide")

        updated: list[dict[str, Any]] = []
        rows_removed = 0
        rows_transformed = 0
        for raw_row in layout:
            if not isinstance(raw_row, dict):
                raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Rangée de projet invalide")
            row = copy.deepcopy(raw_row)
            row_type = row.get("type")

            if row_type == "featured" and row.get("photo") == photo_id:
                rows_removed += 1
                continue

            if row_type == "pair" and photo_id in row.get("photos", []):
                remaining = [
                    candidate
                    for candidate in row.get("photos", [])
                    if isinstance(candidate, str) and candidate != photo_id
                ]
                if remaining:
                    updated.append({"type": "featured", "photo": remaining[0]})
                    rows_transformed += 1
                else:
                    rows_removed += 1
                continue

            if row_type == "composition":
                portrait = row.get("portrait")
                landscapes = row.get("landscapes", [])
                if portrait == photo_id:
                    remaining_landscapes = [
                        candidate
                        for candidate in landscapes
                        if isinstance(candidate, str) and candidate != photo_id
                    ]
                    if len(remaining_landscapes) == 2:
                        updated.append({"type": "pair", "photos": remaining_landscapes})
                        rows_transformed += 1
                    else:
                        updated.extend(
                            {"type": "featured", "photo": candidate}
                            for candidate in remaining_landscapes
                        )
                        rows_transformed += 1
                    continue

                if photo_id in landscapes:
                    remaining_landscapes = [
                        candidate
                        for candidate in landscapes
                        if isinstance(candidate, str) and candidate != photo_id
                    ]
                    remaining = (
                        [portrait, *remaining_landscapes]
                        if row.get("portraitSide") != "right"
                        else [*remaining_landscapes, portrait]
                    )
                    updated.extend(
                        {"type": "featured", "photo": candidate}
                        for candidate in remaining
                        if isinstance(candidate, str)
                    )
                    rows_transformed += 1
                    continue

            updated.append(row)

        return updated, {
            "rowsRemoved": rows_removed,
            "rowsTransformed": rows_transformed,
        }

    def _photo_paths(self, photo: dict[str, Any]) -> list[Path]:
        """Resolve deletable paths only after the manifest record was found exactly."""
        photo_id = photo["id"]
        folder = photo.get("folder")
        if (
            not isinstance(photo_id, str)
            or normalized_text(photo_id) != photo_id
            or "\\" in photo_id
            or photo_id.startswith("/")
            or Path(photo_id).suffix.lower() != ".webp"
        ):
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Identifiant photo invalide")

        parts = photo_id.split("/")
        if folder is None:
            if len(parts) != 1:
                raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Chemin de photo racine invalide")
            source_folder = self.source_root
            filename = parts[0]
        else:
            safe_folder = ensure_safe_slug(folder)
            if len(parts) != 2 or parts[0] != safe_folder:
                raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Chemin de photo classée invalide")
            source_folder = self.source_root / safe_folder
            filename = parts[1]

        if (
            not filename
            or filename in {".", ".."}
            or Path(filename).name != filename
            or "\x00" in filename
        ):
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Nom de photo invalide")

        webp_path = self.web_root.joinpath(*parts)
        fullres_path = self.fullres_root.joinpath(*parts).with_suffix(".jpg")
        if not is_within(self.web_root, webp_path) or not is_within(
            self.fullres_root, fullres_path
        ):
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Chemin de photo invalide")

        paths = [webp_path, fullres_path]
        stem_key = normalized_text(Path(filename).stem).casefold()
        if source_folder.exists():
            if not source_folder.is_dir() or not is_within(self.source_root, source_folder):
                raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Dossier source invalide")
            for candidate in source_folder.iterdir():
                if (
                    candidate.is_file()
                    and candidate.suffix.lower() in VALID_IMAGE_SUFFIXES
                    and normalized_text(candidate.stem).casefold() == stem_key
                ):
                    if not is_within(self.source_root, candidate):
                        raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Original JPG hors dossier")
                    paths.append(candidate)

        deduplicated: list[Path] = []
        seen: set[str] = set()
        for path in paths:
            key = str(path.resolve(strict=False))
            if key not in seen:
                seen.add(key)
                deduplicated.append(path)
        return deduplicated

    @staticmethod
    def _remove_reference_lines(
        text: str,
        start_marker: str,
        end_marker: str,
        reference: str,
    ) -> tuple[str, int]:
        start_index = text.find(start_marker)
        if start_index < 0:
            return text, 0
        end_index = text.find(end_marker, start_index + len(start_marker))
        if end_index < 0:
            raise ApiError(HTTPStatus.UNPROCESSABLE_ENTITY, "Catalogue JavaScript invalide")
        body_start = start_index + len(start_marker)
        body = text[body_start:end_index]
        kept_lines: list[str] = []
        removed = 0
        for line in body.splitlines(keepends=True):
            if reference in line:
                removed += 1
            else:
                kept_lines.append(line)
        if not removed:
            return text, 0
        return text[:body_start] + "".join(kept_lines) + text[end_index:], removed

    def _catalog_updates(
        self,
        photo: dict[str, Any],
    ) -> tuple[dict[Path, str], dict[str, int]]:
        photo_id = photo["id"]
        updates: dict[Path, str] = {}
        counts = {
            "photographySlideshowSources": 0,
            "photographyLensTest": 0,
            "ewcCarouselTest": 0,
        }

        script_path = self.site_root / "script.js"
        if script_path.is_file():
            old_text = script_path.read_text(encoding="utf-8")
            new_text, removed = self._remove_reference_lines(
                old_text,
                "const photographySlideshowSources = Object.freeze([",
                "]);",
                f'"./rsrc/photos/{photo_id}"',
            )
            if removed:
                updates[script_path] = new_text
                counts["photographySlideshowSources"] = removed

        lens_path = self.site_root / "photography-lens-test" / "config.js"
        if lens_path.is_file():
            old_text = lens_path.read_text(encoding="utf-8")
            new_text, removed = self._remove_reference_lines(
                old_text,
                "export const PHOTOS = [",
                "];",
                f' src: "/rsrc/photos/{photo_id}"',
            )
            if removed:
                updates[lens_path] = new_text
                counts["photographyLensTest"] = removed

        carousel_path = self.site_root / "ewc-carousel-test" / "config.js"
        if photo.get("folder") == "esports-world-cup-2026" and carousel_path.is_file():
            old_text = carousel_path.read_text(encoding="utf-8")
            new_text, removed = self._remove_reference_lines(
                old_text,
                "export const PROJECTS = [",
                "].map(",
                f'["{Path(photo_id).name}",',
            )
            if removed:
                updates[carousel_path] = new_text
                counts["ewcCarouselTest"] = removed

        return updates, counts

    def delete_photo(self, photo_id_value: str) -> dict[str, Any]:
        requested_id = normalized_text(photo_id_value)
        with self.lock:
            if self.imports:
                raise ApiError(
                    HTTPStatus.CONFLICT,
                    "Termine ou annule l’import en cours avant de supprimer une photo",
                )

            manifest = self.load_manifest()
            photo_index = next(
                (
                    index
                    for index, candidate in enumerate(manifest["photos"])
                    if isinstance(candidate, dict) and candidate.get("id") == requested_id
                ),
                None,
            )
            if photo_index is None:
                raise ApiError(HTTPStatus.NOT_FOUND, "Photo introuvable")

            # No path is derived from user input: all paths use this exact manifest record.
            photo = manifest["photos"][photo_index]
            photo_id = photo["id"]
            asset_paths = self._photo_paths(photo)
            updated_manifest = copy.deepcopy(manifest)
            del updated_manifest["photos"][photo_index]

            affected_projects: list[str] = []
            rows_removed = 0
            rows_transformed = 0
            page_updates: dict[Path, str] = {}
            for project_key, project in updated_manifest["projects"].items():
                if not isinstance(project, dict) or photo_id not in layout_photo_ids(
                    project.get("layout", [])
                ):
                    continue
                new_layout, changes = self._layout_after_photo_deletion(
                    project.get("layout"), photo_id
                )
                if not new_layout or not layout_photo_ids(new_layout):
                    raise ApiError(
                        HTTPStatus.CONFLICT,
                        f"La suppression viderait entièrement la mise en page de {project.get('label', project_key)}",
                    )
                project["layout"] = self._validate_layout(
                    updated_manifest, project_key, new_layout
                )
                lead_id = layout_photo_ids(project["layout"])[0]
                page_path = self._project_page_path(project.get("route", ""))
                page_updates[page_path] = self._updated_lead_page(page_path, lead_id)
                affected_projects.append(project_key)
                rows_removed += changes["rowsRemoved"]
                rows_transformed += changes["rowsTransformed"]

            catalog_updates, reference_counts = self._catalog_updates(photo)
            text_updates = {**catalog_updates, **page_updates}
            old_texts = {
                path: path.read_text(encoding="utf-8") for path in text_updates
            }
            old_manifest_text = self.manifest_path.read_text(encoding="utf-8")
            existing_assets = [path for path in asset_paths if path.exists()]
            backup_root = Path(tempfile.mkdtemp(prefix="photo-manager-delete-backup-"))
            asset_backups: dict[Path, Path] = {}
            remove_backup = False

            try:
                for index, path in enumerate(existing_assets):
                    backup = backup_root / f"asset-{index}.backup"
                    shutil.copy2(path, backup)
                    asset_backups[path] = backup

                for path in existing_assets:
                    path.unlink()
                for path, new_text in text_updates.items():
                    atomic_write_text(path, new_text)
                atomic_write_json(self.manifest_path, updated_manifest)
                remove_backup = True
            except Exception as error:
                rollback_errors: list[Exception] = []
                for path, old_text in old_texts.items():
                    try:
                        atomic_write_text(path, old_text)
                    except Exception as rollback_error:
                        rollback_errors.append(rollback_error)
                try:
                    atomic_write_text(self.manifest_path, old_manifest_text)
                except Exception as rollback_error:
                    rollback_errors.append(rollback_error)
                for path, backup in asset_backups.items():
                    try:
                        path.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(backup, path)
                    except Exception as rollback_error:
                        rollback_errors.append(rollback_error)
                if rollback_errors:
                    raise ApiError(
                        HTTPStatus.INTERNAL_SERVER_ERROR,
                        "Restauration locale incomplète. Copies de secours conservées dans "
                        f"{backup_root}",
                    ) from error
                remove_backup = True
                raise
            finally:
                if remove_backup:
                    shutil.rmtree(backup_root, ignore_errors=True)

            return {
                "manifest": updated_manifest,
                "deletedPhotoId": photo_id,
                "summary": {
                    "filesDeleted": len(existing_assets),
                    "originalsDeleted": sum(
                        1 for path in existing_assets if is_within(self.source_root, path)
                    ),
                    "projectsUpdated": affected_projects,
                    "rowsRemoved": rows_removed,
                    "rowsTransformed": rows_transformed,
                    "referencesRemoved": reference_counts,
                },
            }

    def apply_layout(self, project_key_value: str, raw_layout: Any) -> dict[str, Any]:
        project_key = normalized_text(project_key_value)
        with self.lock:
            manifest = self.load_manifest()
            if project_key not in manifest["projects"]:
                raise ApiError(HTTPStatus.NOT_FOUND, "Projet introuvable")
            layout = self._validate_layout(manifest, project_key, raw_layout)
            lead_id = layout_photo_ids(layout)[0]
            project = manifest["projects"][project_key]
            page_path = self._project_page_path(project.get("route", ""))
            old_page = page_path.read_text(encoding="utf-8")
            new_page = self._updated_lead_page(page_path, lead_id)
            old_manifest = copy.deepcopy(manifest)
            manifest["projects"][project_key]["layout"] = layout
            try:
                atomic_write_text(page_path, new_page)
                atomic_write_json(self.manifest_path, manifest)
            except Exception:
                try:
                    atomic_write_text(page_path, old_page)
                    atomic_write_json(self.manifest_path, old_manifest)
                except Exception:
                    pass
                raise
            return {"manifest": manifest}


class PhotoManagerHandler(SimpleHTTPRequestHandler):
    server_version = "PhotoManager/1.0"

    def __init__(self, *args: Any, manager: PhotoManager, port: int, **kwargs: Any):
        self.manager = manager
        self.local_port = port
        super().__init__(*args, directory=str(manager.site_root), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        if urllib.parse.urlsplit(self.path).path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status: int, payload: Any) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _empty(self, status: int = HTTPStatus.NO_CONTENT) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _authorized(self) -> bool:
        host = urllib.parse.urlsplit(f"//{self.headers.get('Host', '')}").hostname
        if host not in {HOST, "localhost"}:
            return False
        origin = self.headers.get("Origin")
        if origin:
            parsed_origin = urllib.parse.urlsplit(origin)
            origin_port = parsed_origin.port or (443 if parsed_origin.scheme == "https" else 80)
            if (
                parsed_origin.scheme != "http"
                or parsed_origin.hostname not in {HOST, "localhost"}
                or origin_port != self.local_port
            ):
                return False
        authorization = self.headers.get("Authorization", "")
        return secrets.compare_digest(authorization, f"Bearer {self.manager.token}")

    def _require_api_auth(self) -> None:
        if not self._authorized():
            raise ApiError(HTTPStatus.FORBIDDEN, "Accès local refusé")

    def _read_json(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Corps de requête invalide") from error
        if length <= 0 or length > MAX_JSON_SIZE:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Corps de requête invalide")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, "JSON invalide") from error
        if not isinstance(payload, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, "JSON invalide")
        return payload

    def _content_length(self) -> int:
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Taille reçue invalide") from error
        if length < 0 or length > MAX_FILE_SIZE:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Fichier trop volumineux")
        return length

    def _dispatch(self, method: str) -> bool:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        if not path.startswith("/api/"):
            return False
        self._require_api_auth()
        parts = [urllib.parse.unquote(part) for part in path.split("/") if part]
        if method == "GET" and parts == ["api", "state"]:
            self._json(
                HTTPStatus.OK,
                {
                    "manifest": self.manager.snapshot(),
                    "apiVersion": API_VERSION,
                    "capabilities": list(API_CAPABILITIES),
                },
            )
            return True
        if method == "POST" and parts == ["api", "folders"]:
            payload = self._read_json()
            self._json(HTTPStatus.CREATED, self.manager.create_folder(payload.get("label")))
            return True
        if method == "PATCH" and len(parts) == 3 and parts[:2] == ["api", "folders"]:
            payload = self._read_json()
            self._json(HTTPStatus.OK, self.manager.rename_folder(parts[2], payload.get("label")))
            return True
        if method == "POST" and parts == ["api", "imports"]:
            self._json(HTTPStatus.CREATED, self.manager.start_import(self._read_json()))
            return True
        if method == "PUT" and len(parts) == 5 and parts[:2] == ["api", "imports"] and parts[3] == "files":
            query = urllib.parse.parse_qs(parsed.query)
            overwrite = query.get("overwrite", ["0"])[0] == "1"
            payload = self.manager.upload_file(
                parts[2], parts[4], self._content_length(), overwrite, self.rfile
            )
            self._json(HTTPStatus.OK, payload)
            return True
        if method == "POST" and len(parts) == 4 and parts[:2] == ["api", "imports"] and parts[3] == "commit":
            self._read_json()
            result = self.manager.commit_import(parts[2])
            self._json(HTTPStatus.OK, result)
            return True
        if method == "DELETE" and len(parts) == 3 and parts[:2] == ["api", "imports"]:
            self.manager.cancel_import(parts[2])
            self._empty()
            return True
        if method == "DELETE" and len(parts) == 3 and parts[:2] == ["api", "photos"]:
            self._json(HTTPStatus.OK, self.manager.delete_photo(parts[2]))
            return True
        if method == "PUT" and len(parts) == 4 and parts[:2] == ["api", "projects"] and parts[3] == "layout":
            payload = self._read_json()
            self._json(
                HTTPStatus.OK,
                self.manager.apply_layout(parts[2], payload.get("layout")),
            )
            return True
        raise ApiError(HTTPStatus.NOT_FOUND, "API inconnue")

    def _handle(self, method: str) -> bool:
        try:
            return self._dispatch(method)
        except ApiError as error:
            self._json(error.status, {"error": error.message})
            return True
        except Exception as error:
            self.log_error("API failure: %s", error)
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "Erreur locale inattendue"})
            return True

    def do_GET(self) -> None:
        if not self._handle("GET"):
            super().do_GET()

    def do_POST(self) -> None:
        if not self._handle("POST"):
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    def do_PUT(self) -> None:
        if not self._handle("PUT"):
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    def do_PATCH(self) -> None:
        if not self._handle("PATCH"):
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)

    def do_DELETE(self) -> None:
        if not self._handle("DELETE"):
            self.send_error(HTTPStatus.METHOD_NOT_ALLOWED)


def state_file(port: int) -> Path:
    return Path(tempfile.gettempdir()) / f"photo-layout-editor-{os.getuid()}-{port}.json"


def server_is_reusable(port: int, state_path: Path, site_root: Path) -> str | None:
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
        token = state.get("token", "")
        if (
            Path(state.get("siteRoot", "")).resolve() != site_root.resolve()
            or not token
            or state.get("apiVersion") != API_VERSION
        ):
            return None
        request = urllib.request.Request(
            f"http://{HOST}:{port}/api/state",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(request, timeout=1.5) as response:
            payload = json.load(response)
            if (
                response.status == HTTPStatus.OK
                and payload.get("apiVersion") == API_VERSION
                and set(API_CAPABILITIES).issubset(payload.get("capabilities", []))
            ):
                return token
    except (OSError, ValueError, urllib.error.URLError, json.JSONDecodeError):
        return None
    return None


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection((HOST, port), timeout=0.5):
            return True
    except OSError:
        return False


def parse_arguments() -> argparse.Namespace:
    default_site_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Gestionnaire local des photos")
    parser.add_argument("--site-root", type=Path, default=default_site_root)
    parser.add_argument(
        "--source-root",
        type=Path,
        default=default_site_root.parent / "PHOTO SITE - JPG",
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-open", action="store_true")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    site_root = arguments.site_root.resolve()
    source_root = arguments.source_root.resolve()
    if not site_root.is_dir() or not (site_root / "rsrc" / "photo-library.json").is_file():
        raise SystemExit("Dossier du site ou manifeste photo introuvable.")
    source_root.mkdir(parents=True, exist_ok=True)
    state_path = state_file(arguments.port)
    reusable_token = server_is_reusable(arguments.port, state_path, site_root)
    if reusable_token:
        url = f"http://{HOST}:{arguments.port}/photo-layout-editor.html?token={urllib.parse.quote(reusable_token)}"
        print(f"Gestionnaire déjà lancé : {url}", flush=True)
        if not arguments.no_open:
            webbrowser.open(url)
        return 0
    if port_is_open(arguments.port):
        try:
            existing_state = json.loads(state_path.read_text(encoding="utf-8"))
            is_stale_manager = (
                Path(existing_state.get("siteRoot", "")).resolve() == site_root
                and bool(existing_state.get("token"))
                and existing_state.get("apiVersion") != API_VERSION
            )
        except (OSError, ValueError, json.JSONDecodeError):
            is_stale_manager = False
        if is_stale_manager:
            raise SystemExit(
                "Une ancienne version du gestionnaire est encore ouverte. "
                "Ferme sa fenêtre Terminal, puis relance LayoutEditor.command."
            )
        raise SystemExit(f"Le port {arguments.port} est déjà utilisé par une autre application.")

    token = secrets.token_urlsafe(32)
    manager = PhotoManager(site_root, source_root, token)

    def handler(*handler_args: Any, **handler_kwargs: Any) -> PhotoManagerHandler:
        return PhotoManagerHandler(
            *handler_args,
            manager=manager,
            port=arguments.port,
            **handler_kwargs,
        )

    server = ThreadingHTTPServer((HOST, arguments.port), handler)
    atomic_write_json(
        state_path,
        {
            "token": token,
            "siteRoot": str(site_root),
            "port": arguments.port,
            "apiVersion": API_VERSION,
        },
    )
    os.chmod(state_path, 0o600)
    url = f"http://{HOST}:{arguments.port}/photo-layout-editor.html?token={urllib.parse.quote(token)}"
    print(f"Gestionnaire local lancé sur {url}", flush=True)
    print("Ferme cette fenêtre pour arrêter le serveur.", flush=True)
    if not arguments.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        state_path.unlink(missing_ok=True)
        for import_id in list(manager.imports):
            manager.cancel_import(import_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
