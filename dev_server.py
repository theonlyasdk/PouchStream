#!/usr/bin/env python3
"""
PouchStream Development Server for Windows / Desktop
Simulates the Android PouchStream server with the exact same APIs, video range streaming,
and serves the Web UI directly from app/src/main/assets/web.
"""

import os
import sys
import json
import mimetypes
import argparse
import email.parser
import email.policy
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(SCRIPT_DIR, "app", "src", "main", "assets", "web")
DEFAULT_SHARED_DIR = os.path.join(SCRIPT_DIR, "dev_shared_folder")

# Ensure common media/web types are registered
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("video/x-matroska", ".mkv")
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")

def create_sample_files(target_dir):
    """Creates sample files and folders in the test directory if empty, for testing the UI."""
    os.makedirs(target_dir, exist_ok=True)
    sample_txt = os.path.join(target_dir, "welcome.txt")
    if not os.path.exists(sample_txt):
        with open(sample_txt, "w", encoding="utf-8") as f:
            f.write("Welcome to PouchStream Web Portal!\n\nThis file is served by the local Windows dev server.\nYou can edit this file right inside the web editor (Ctrl+S to save) and changes save live to disk.\n")

    sample_md = os.path.join(target_dir, "notes.md")
    if not os.path.exists(sample_md):
        with open(sample_md, "w", encoding="utf-8") as f:
            f.write("# PouchStream Notes\n\n- Remote file manager\n- Video streaming with range requests\n- In-editor editing\n")

    docs_dir = os.path.join(target_dir, "documents")
    os.makedirs(docs_dir, exist_ok=True)
    sample_sub = os.path.join(docs_dir, "sample_code.js")
    if not os.path.exists(sample_sub):
        with open(sample_sub, "w", encoding="utf-8") as f:
            f.write("// Sample script in subfolder\nconsole.log('PouchStream is running!');\n")

def parse_post_data(handler):
    content_type = handler.headers.get("Content-Type", "")
    length = int(handler.headers.get("Content-Length", 0))
    raw_body = handler.rfile.read(length)

    fields = {}
    files = []

    if "application/json" in content_type:
        try:
            return json.loads(raw_body.decode("utf-8")), files
        except Exception:
            return {}, files

    if "multipart/form-data" in content_type:
        header_bytes = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin1")
        msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(header_bytes + raw_body)
        if msg.is_multipart():
            for part in msg.iter_parts():
                name = part.get_param("name", header="content-disposition")
                filename = part.get_filename()
                payload = part.get_payload(decode=True)
                if filename:
                    files.append({"field": name, "filename": filename, "data": payload})
                elif name:
                    fields[name] = payload.decode("utf-8", errors="replace").strip() if payload else ""
        return fields, files

    parsed = parse_qs(raw_body.decode("utf-8", errors="replace"))
    for k, v in parsed.items():
        fields[k] = v[0] if v else ""
    return fields, files

class PouchRequestHandler(BaseHTTPRequestHandler):

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/api/"):
            self.handle_api_get(path, query)
        else:
            self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/api/"):
            self.handle_api_post(path)
        else:
            self.send_error(404, "Not Found")

    def serve_static(self, rel_path):
        if rel_path == "/" or not rel_path:
            rel_path = "/index.html"

        cleaned = rel_path.lstrip("/\\")
        file_path = os.path.normpath(os.path.join(WEB_DIR, cleaned))

        # Avoid path traversal
        if not file_path.startswith(WEB_DIR) or not os.path.exists(file_path) or os.path.isdir(file_path):
            file_path = os.path.join(WEB_DIR, "index.html")

        mime_type, _ = mimetypes.guess_type(file_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        try:
            with open(file_path, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_error(500, f"Error reading static file: {e}")

    def get_real_path(self, rel_path):
        if not rel_path:
            return self.server.shared_dir
        cleaned = rel_path.replace("\\", "/").strip("/.")
        full_path = os.path.normpath(os.path.join(self.server.shared_dir, cleaned))
        if not full_path.startswith(self.server.shared_dir):
            return None
        return full_path

    def handle_api_get(self, path, query):
        if path == "/api/info":
            data = {
                "server": "PouchStream (Dev Server)",
                "folderName": os.path.basename(self.server.shared_dir) or "Shared Folder",
                "isReady": True,
                "port": self.server.server_port
            }
            try:
                import shutil
                total, used, free = shutil.disk_usage(self.server.shared_dir)
                data["storage"] = {
                    "totalBytes": total,
                    "freeBytes": free,
                    "usedBytes": used,
                    "path": self.server.shared_dir
                }
            except Exception:
                pass
            self.send_json(data)

        elif path == "/api/files":
            rel_path = query.get("path", [""])[0]
            real_path = self.get_real_path(rel_path)
            if not real_path or not os.path.exists(real_path) or not os.path.isdir(real_path):
                self.send_json_error(404, "Directory not found")
                return

            items = []
            folder_count = 0
            file_count = 0
            total_size = 0
            sig = 0

            try:
                entries = sorted(os.scandir(real_path), key=lambda e: (not e.is_dir(), e.name.lower()))
                for entry in entries:
                    if entry.name.startswith("."):
                        continue
                    is_dir = entry.is_dir()
                    stat = entry.stat()
                    size = 0 if is_dir else stat.st_size
                    if is_dir:
                        folder_count += 1
                        mime = "directory"
                    else:
                        file_count += 1
                        total_size += size
                        mime, _ = mimetypes.guess_type(entry.name)
                        if not mime:
                            mime = "application/octet-stream"

                    sig = (sig ^ int(stat.st_mtime * 1000)) + size
                    rel_item_path = os.path.relpath(entry.path, self.server.shared_dir).replace("\\", "/")

                    items.append({
                        "name": entry.name,
                        "path": rel_item_path,
                        "isDirectory": is_dir,
                        "size": size,
                        "lastModified": int(stat.st_mtime * 1000),
                        "mimeType": mime,
                        "extension": os.path.splitext(entry.name)[1].lstrip(".").lower()
                    })

                data = {
                    "currentPath": rel_path.replace("\\", "/").strip("/"),
                    "currentName": os.path.basename(real_path) or os.path.basename(self.server.shared_dir),
                    "parentPath": os.path.dirname(rel_path.strip("/")),
                    "folderCount": folder_count,
                    "fileCount": file_count,
                    "totalSize": total_size,
                    "signature": sig,
                    "items": items
                }
                self.send_json(data)
            except Exception as e:
                self.send_json_error(500, str(e))

        elif path == "/api/poll":
            rel_path = query.get("path", [""])[0]
            real_path = self.get_real_path(rel_path)
            sig = 0
            if real_path and os.path.exists(real_path) and os.path.isdir(real_path):
                try:
                    for entry in os.scandir(real_path):
                        stat = entry.stat()
                        sig = (sig ^ int(stat.st_mtime * 1000)) + (0 if entry.is_dir() else stat.st_size)
                except Exception:
                    pass
            self.send_json({"signature": sig})

        elif path == "/api/read":
            rel_path = query.get("path", [""])[0]
            real_path = self.get_real_path(rel_path)
            if not real_path or not os.path.exists(real_path) or os.path.isdir(real_path):
                self.send_json_error(404, "File not found")
                return
            try:
                with open(real_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                self.send_json({"path": rel_path, "content": content})
            except Exception as e:
                self.send_json_error(500, str(e))

        elif path == "/api/stream":
            self.handle_stream(query)

        elif path == "/api/zip":
            self.handle_zip(query)

        else:
            self.send_json_error(404, "Endpoint not found")

    def handle_zip(self, query):
        import zipfile
        import tempfile

        paths_param = query.get("paths", [""])[0]
        rel_path = query.get("path", [""])[0]

        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            tmp_path = tmp.name

        try:
            with zipfile.ZipFile(tmp_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                if paths_param:
                    items = [p.strip() for p in paths_param.split(",") if p.strip()]
                    zip_filename = "selected_files.zip"
                    for item in items:
                        real_item = self.get_real_path(item)
                        if not real_item or not os.path.exists(real_item):
                            continue
                        if os.path.isdir(real_item):
                            base_folder = os.path.basename(real_item)
                            for root, dirs, files in os.walk(real_item):
                                for d in dirs:
                                    dir_full = os.path.join(root, d)
                                    arcname = (os.path.join(base_folder, os.path.relpath(dir_full, real_item)).replace("\\", "/") + "/").strip("/") + "/"
                                    zinfo = zipfile.ZipInfo(arcname)
                                    zf.writestr(zinfo, "")
                                for file in files:
                                    full_file = os.path.join(root, file)
                                    arcname = os.path.join(base_folder, os.path.relpath(full_file, real_item)).replace("\\", "/")
                                    zf.write(full_file, arcname)
                        else:
                            zf.write(real_item, os.path.basename(real_item))
                else:
                    real_target = self.get_real_path(rel_path)
                    if not real_target or not os.path.exists(real_target):
                        self.send_json_error(404, "File or directory not found")
                        return
                    if os.path.isfile(real_target):
                        zip_filename = f"{os.path.basename(real_target)}.zip"
                        zf.write(real_target, os.path.basename(real_target))
                    else:
                        folder_name = os.path.basename(real_target) or "archive"
                        zip_filename = f"{folder_name}.zip"
                        for root, dirs, files in os.walk(real_target):
                            for d in dirs:
                                dir_full = os.path.join(root, d)
                                arcname = os.path.relpath(dir_full, real_target).replace("\\", "/").strip("/") + "/"
                                zinfo = zipfile.ZipInfo(arcname)
                                zf.writestr(zinfo, "")
                            for file in files:
                                full_file = os.path.join(root, file)
                                arcname = os.path.relpath(full_file, real_target).replace("\\", "/")
                                zf.write(full_file, arcname)

            file_size = os.path.getsize(tmp_path)
            safe_zip_filename = os.path.basename(zip_filename).replace('"', '_')
            self.send_response(200)
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(file_size))
            self.send_header("Content-Disposition", f'attachment; filename="{safe_zip_filename}"')
            self.send_cors_headers()
            self.end_headers()

            with open(tmp_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

    def handle_stream(self, query):
        rel_path = query.get("path", [""])[0]
        is_download = query.get("download", ["false"])[0].lower() == "true"
        real_path = self.get_real_path(rel_path)

        if not real_path or not os.path.exists(real_path) or os.path.isdir(real_path):
            self.send_json_error(404, "File not found")
            return

        file_size = os.path.getsize(real_path)
        mime_type, _ = mimetypes.guess_type(real_path)
        if not mime_type:
            mime_type = "application/octet-stream"

        range_header = self.headers.get("Range")

        # HTTP 206 Partial Content support for video seeking
        if range_header and range_header.startswith("bytes="):
            range_val = range_header[6:].strip()
            start = 0
            end = file_size - 1

            if "-" in range_val:
                p1, p2 = range_val.split("-", 1)
                p1 = p1.strip()
                p2 = p2.strip()
                if not p1:
                    # Suffix range: bytes=-500 (last 500 bytes per RFC 7233)
                    if p2:
                        try:
                            suffix_len = int(p2)
                            start = max(0, file_size - suffix_len)
                            end = file_size - 1
                        except ValueError:
                            pass
                else:
                    try:
                        start = int(p1)
                    except ValueError:
                        pass
                    if p2:
                        try:
                            end = int(p2)
                        except ValueError:
                            pass

            if start > end or start >= file_size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.end_headers()
                return

            end = min(end, file_size - 1)
            content_length = end - start + 1

            self.send_response(206)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Content-Length", str(content_length))
            self.send_cors_headers()
            if is_download:
                self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(real_path)}"')
            self.end_headers()

            with open(real_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(remaining, 65536)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return

        # Regular 200 OK download / full stream
        self.send_response(200)
        self.send_header("Content-Type", mime_type)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_cors_headers()
        if is_download:
            self.send_header("Content-Disposition", f'attachment; filename="{os.path.basename(real_path)}"')
        self.end_headers()

        with open(real_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def handle_api_post(self, path):
        fields, files = parse_post_data(self)

        if path == "/api/save":
            rel_path = fields.get("path")
            content = fields.get("content")

            if not rel_path or content is None:
                self.send_json_error(400, "Missing path or content")
                return

            real_path = self.get_real_path(rel_path)
            if not real_path:
                self.send_json_error(400, "Invalid path")
                return

            os.makedirs(os.path.dirname(real_path), exist_ok=True)
            with open(real_path, "w", encoding="utf-8") as f:
                f.write(content)

            self.send_json({"success": True, "message": "File saved successfully"})

        elif path == "/api/create_folder":
            rel_path = fields.get("path", "")
            name = fields.get("name", "").strip()
            if not name:
                self.send_json_error(400, "Folder name is required")
                return
            target_dir = os.path.join(self.get_real_path(rel_path) or self.server.shared_dir, name)
            os.makedirs(target_dir, exist_ok=True)
            self.send_json({"success": True})

        elif path == "/api/create_file":
            rel_path = fields.get("path", "")
            name = fields.get("name", "").strip()
            if not name:
                self.send_json_error(400, "File name is required")
                return
            target_file = os.path.join(self.get_real_path(rel_path) or self.server.shared_dir, name)
            with open(target_file, "w", encoding="utf-8") as f:
                f.write("")
            self.send_json({"success": True})

        elif path == "/api/delete":
            rel_path = fields.get("path", "")
            real_path = self.get_real_path(rel_path)
            if real_path and os.path.exists(real_path):
                if os.path.isdir(real_path):
                    import shutil
                    shutil.rmtree(real_path)
                else:
                    os.remove(real_path)
                self.send_json({"success": True})
            else:
                self.send_json_error(404, "Item not found")

        elif path == "/api/rename":
            rel_path = fields.get("path", "")
            new_name = fields.get("newName", "").strip()
            real_path = self.get_real_path(rel_path)
            if real_path and os.path.exists(real_path) and new_name:
                parent_dir = os.path.dirname(real_path)
                new_path = os.path.join(parent_dir, new_name)
                os.rename(real_path, new_path)
                self.send_json({"success": True})
            else:
                self.send_json_error(400, "Cannot rename item")

        elif path == "/api/upload":
            rel_path = fields.get("path", "")
            base_target_dir = self.get_real_path(rel_path) or self.server.shared_dir
            os.makedirs(base_target_dir, exist_ok=True)

            uploaded_count = 0
            for item in files:
                raw_filename = item.get("filename")
                data = item.get("data")
                if raw_filename and data is not None:
                    clean_filename = raw_filename.replace("\\", "/").strip("/")
                    parts = [p for p in clean_filename.split("/") if p and p != ".."]
                    if parts:
                        subdirs = parts[:-1]
                        leaf_name = parts[-1]
                        file_dir = os.path.join(base_target_dir, *subdirs) if subdirs else base_target_dir
                        os.makedirs(file_dir, exist_ok=True)
                        out_path = os.path.join(file_dir, leaf_name)
                        with open(out_path, "wb") as f:
                            f.write(data)
                        uploaded_count += 1
            self.send_json({"success": True, "uploaded": uploaded_count})
        else:
            self.send_json_error(404, "Not Found")

    def send_json(self, data):
        content = json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def send_json_error(self, code, message):
        content = json.dumps({"error": message, "code": code}).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        sys.stdout.write(f"[DevServer] {self.address_string()} - {format % args}\n")
        sys.stdout.flush()

def main():
    parser = argparse.ArgumentParser(description="PouchStream Windows Development Server")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
    parser.add_argument("--folder", type=str, default=DEFAULT_SHARED_DIR, help="Shared directory path")
    args = parser.parse_args()

    shared_dir = os.path.abspath(args.folder)
    create_sample_files(shared_dir)

    server = HTTPServer(("0.0.0.0", args.port), PouchRequestHandler)
    server.shared_dir = shared_dir
    server.server_port = args.port

    print("=" * 60)
    print("  [PouchStream] Windows Development Server Running!")
    print(f"  * Web UI Directory: {WEB_DIR}")
    print(f"  * Shared Folder:    {shared_dir}")
    print(f"  * Local Portal URL: http://localhost:{args.port}")
    print(f"  * Network URL:      http://127.0.0.1:{args.port}")
    print("=" * 60)
    print("Editing index.html / app.js immediately updates upon page reload.")
    print("Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Dev Server...")
        server.server_close()

if __name__ == "__main__":
    main()
