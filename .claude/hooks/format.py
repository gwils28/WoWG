#!/usr/bin/env python3
"""PostToolUse : formate avec Prettier le fichier modifie (si Prettier est installe)."""
import json
import os
import subprocess
import sys

EXTS = (".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md", ".html")

data = json.load(sys.stdin)
path = data.get("tool_input", {}).get("file_path", "")
root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
prettier = os.path.join(root, "node_modules", ".bin", "prettier")
if path.endswith(EXTS) and os.path.exists(path) and os.path.exists(prettier):
    subprocess.run([prettier, "--write", "--log-level", "warn", path], cwd=root)
sys.exit(0)
