"""HTTP delivery and public-path isolation checks."""
from functools import partial
from http.server import ThreadingHTTPServer
import re
import subprocess
import sys
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import publish


class PublishTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        publish.build()
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            partial(publish.PublishHandler, directory=str(publish.DIST)),
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_assets_and_html_references(self):
        for name in publish.ASSETS:
            with self.subTest(name=name), urlopen(self.url + "/" + name) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), (publish.ROOT / name).read_bytes())
                self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        with urlopen(self.url + "/") as response:
            html = response.read().decode()
        for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
            if not ref.startswith("https://"):
                self.assertIn(ref, publish.ASSETS)
        self.assertNotIn('.ts"', html)

    def test_private_paths_not_published(self):
        for path in ("/native_stack/", "/native_stack/config/lab-profile.json",
                     "/publish.py", "/.env", "/../index.html",
                     "/%2e%2e/index.html", "/dist/", "/api/state"):
            for method in ("GET", "HEAD"):
                with self.subTest(path=path, method=method):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(Request(self.url + path, method=method))
                    self.assertEqual(error.exception.code, 404)

    def test_tunnel_host_and_query(self):
        request = Request(self.url + "/app.js?v=1", headers={"Host": "example.trycloudflare.com"})
        with urlopen(request) as response:
            self.assertEqual(response.status, 200)
            self.assertIn("javascript", response.headers["Content-Type"])

    def test_occupied_port_exits_with_actionable_message(self):
        result = subprocess.run(
            [sys.executable, str(publish.ROOT / "publish.py"), "--port", str(self.server.server_port)],
            capture_output=True, text=True, timeout=10,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("already in use", result.stderr)
        self.assertIn("--port", result.stderr)


if __name__ == "__main__":
    unittest.main()
