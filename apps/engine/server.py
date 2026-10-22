"""Optional long-lived engine HTTP worker, bound to localhost."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from cli import evaluate, encode


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ('/health', '/decisions'):
            self.send_error(404)
            return
        body = json.dumps({'status': 'ok'} if self.path == '/health' else evaluate(), default=encode).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
