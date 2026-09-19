"""Local static preview; no external packages or production mutations."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=4185)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(Path(__file__).parent)))
    print(f'Preview listening on port {args.port}', flush=True)
    server.serve_forever()
