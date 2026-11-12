#!/usr/bin/env python3
"""Native messaging host for the PDF Mailer Thunderbird extension.

Reads one JSON message from stdin (native messaging framing: 4-byte
little-endian length + UTF-8 JSON) of the form:

    {"command": "pdf-stamp {pdf} -o {pdf}", "pdf": "/abs/path/file.pdf"}

Replaces the {pdf} placeholder with the shell-quoted PDF path, runs the
command, then reads the (possibly modified) PDF back and answers with:

    {"ok": true, "data": "<base64 of the adapted PDF>", "stdout": "...", "stderr": "..."}

or, on failure:

    {"ok": false, "error": "..."}
"""

import base64
import json
import shlex
import subprocess
import sys


def read_message(stream):
    raw_length = stream.read(4)
    if len(raw_length) < 4:
        return None
    length = int.from_bytes(raw_length, "little")
    return json.loads(stream.read(length).decode("utf-8"))


def write_message(stream, payload):
    data = json.dumps(payload).encode("utf-8")
    stream.write(len(data).to_bytes(4, "little"))
    stream.write(data)
    stream.flush()


def build_command(template, pdf_path):
    quoted = shlex.quote(pdf_path)
    command = template.replace("{pdf}", quoted).replace("%PDF%", quoted)
    if command == template and "{pdf}" not in template and "%PDF%" not in template:
        command = command + " " + quoted
    return command


def main():
    try:
        message = read_message(sys.stdin.buffer)
        if not message:
            write_message(sys.stdout.buffer, {"ok": False, "error": "no input message"})
            return
        command = build_command(str(message.get("command", "")), str(message.get("pdf", "")))
        proc = subprocess.run(command, shell=True, capture_output=True, text=True)
        with open(message["pdf"], "rb") as handle:
            data = base64.b64encode(handle.read()).decode("ascii")
        if proc.returncode != 0:
            write_message(sys.stdout.buffer, {
                "ok": False,
                "error": "command exited with code %d: %s" % (proc.returncode, proc.stderr.strip()),
            })
            return
        write_message(sys.stdout.buffer, {
            "ok": True,
            "data": data,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        })
    except Exception as exc:  # noqa: BLE001 - report any failure back to the extension
        write_message(sys.stdout.buffer, {"ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
