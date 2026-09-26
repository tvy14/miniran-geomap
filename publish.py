#!/usr/bin/env python3
"""Build and serve the standalone planner; no npm or third-party packages."""
import argparse
import errno
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
ASSETS = (
    "index.html", "style.css", "stack.css", "channel_models.js",
    "nr_numerology.js", "link_budget.js", "app.js", "stack.js",
)


def build():
    # Explicit allowlist: never publish native builds, configs, or evidence.
    for name in ASSETS:
        if not (ROOT / name).is_file():
            raise FileNotFoundError(ROOT / name)
    DIST.mkdir(exist_ok=True)
    for name in ASSETS:
        shutil.copyfile(ROOT / name, DIST / name)
    print(f"Built {len(ASSETS)} web assets in {DIST}", flush=True)


class PublishHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = unquote(urlsplit(self.path).path)
        name = "index.html" if path == "/" else path.removeprefix("/")
        if name not in ASSETS or (DIST / name).is_symlink():
            self.send_error(404)
            return None
        self.path = "/" + name
        return super().send_head()

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "serve"), nargs="?", default="serve")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    build()
    if args.command == "build":
        return
    handler = partial(PublishHandler, directory=str(DIST))
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
        parser.exit(1, f"Port {args.port} is already in use. If the planner is already running, "
                    f"open http://localhost:{args.port} without starting another server. "
                    "Otherwise stop that server or use --port 8767 and update your tunnel URL.\n")
    with server:
        print(f"Serving built planner at http://localhost:{args.port}", flush=True)
        print(f"Tunnel: cloudflared tunnel --url http://localhost:{args.port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
