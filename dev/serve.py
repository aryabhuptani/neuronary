"""Local dev server like GitHub Pages: files as-is, /dir/ -> dir/index.html, anything missing -> 404.html (the app).
    python dev/serve.py [port]"""
import http.server, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path) and not os.path.exists(os.path.join(path, "index.html")) or not os.path.exists(path):
            if not os.path.exists(path + ".html") and not (os.path.isdir(path) and os.path.exists(os.path.join(path, "index.html"))):
                self.path = "/404.html"
        return super().send_head()

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8766), H).serve_forever()
