#!/usr/bin/env python3
"""Hook typographie : interdit le tiret cadratin (U+2014).

- PreToolUse (Write, Edit, MultiEdit, NotebookEdit, Bash) : bloque l'outil si le
  contenu ecrit ou la commande contient le caractere.
- Stop : verifie la derniere reponse de l'assistant et demande une correction.
"""
import json
import sys

EM_DASH = chr(0x2014)
MSG = (
    "Typographie : le tiret cadratin (U+2014) est interdit (code, commentaires, "
    "documentation, reponses). Remplace-le par une virgule, deux-points, des "
    "parentheses ou un tiret simple '-'."
)


def collect_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from collect_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from collect_strings(v)


def last_assistant_text(transcript_path):
    try:
        with open(transcript_path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return ""
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("type") == "user" and not entry.get("isMeta"):
            content = entry.get("message", {}).get("content")
            # un vrai message utilisateur (pas un tool_result) marque la fin du tour
            if isinstance(content, str):
                return ""
        if entry.get("type") != "assistant":
            continue
        parts = entry.get("message", {}).get("content", [])
        texts = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text"]
        if texts:
            return "\n".join(texts)
    return ""


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    event = data.get("hook_event_name")

    if event == "PreToolUse":
        tool_input = data.get("tool_input", {})
        if any(EM_DASH in s for s in collect_strings(tool_input)):
            print(MSG, file=sys.stderr)
            return 2
        return 0

    if event == "Stop":
        if data.get("stop_hook_active"):
            return 0
        text = data.get("last_assistant_message") or last_assistant_text(data.get("transcript_path", ""))
        if EM_DASH in text:
            print(MSG + " Ta derniere reponse en contient : reformule-la sans.", file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
