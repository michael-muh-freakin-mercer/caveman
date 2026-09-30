"""Stands in for Loki in deploy/logs/ci-test.sh: prints each push it receives.

One line per request: the Authorization header and the decompressed body (a
protobuf message, printed as text, so label sets and log lines are readable).
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


def snappy_decompress(data: bytes) -> bytes:
    """Snappy block format, which Loki's push API uses."""
    pos = 0
    while data[pos] & 0x80:  # the uncompressed length, a varint we do not need
        pos += 1
    pos += 1
    out = bytearray()
    while pos < len(data):
        tag = data[pos]
        pos += 1
        kind = tag & 3
        if kind == 0:  # literal
            length = tag >> 2
            if length >= 60:
                extra = length - 59
                length = int.from_bytes(data[pos:pos + extra], "little")
                pos += extra
            length += 1
            out += data[pos:pos + length]
            pos += length
            continue
        if kind == 1:
            length = ((tag >> 2) & 7) + 4
            offset = ((tag >> 5) << 8) | data[pos]
            pos += 1
        else:
            width = 2 if kind == 2 else 4
            length = (tag >> 2) + 1
            offset = int.from_bytes(data[pos:pos + width], "little")
            pos += width
        for _ in range(length):  # a copy may overlap what it writes
            out.append(out[-offset])
    return bytes(out)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        text = snappy_decompress(body).decode("utf-8", "replace")
        print(json.dumps({"path": self.path, "auth": self.headers.get("Authorization"), "body": text}))
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


HTTPServer(("0.0.0.0", 3100), Handler).serve_forever()
