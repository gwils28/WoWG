#!/usr/bin/env python3
"""Stop : relance les tests (npm test) et bloque la fin du tour s'ils echouent.

Ne fait rien tant que le projet n'a pas de package.json avec script "test"
ou que les dependances ne sont pas installees. Ne bloque qu'une fois par tour
(stop_hook_active) pour eviter une boucle infinie.
"""
import json
import os
import subprocess
import sys

data = json.load(sys.stdin)
if data.get("stop_hook_active"):
    sys.exit(0)
root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
pkg = os.path.join(root, "package.json")
if not (os.path.exists(pkg) and os.path.isdir(os.path.join(root, "node_modules"))):
    sys.exit(0)
with open(pkg, encoding="utf-8") as f:
    if "test" not in json.load(f).get("scripts", {}):
        sys.exit(0)
res = subprocess.run(["npm", "test", "--silent"], cwd=root, capture_output=True, text=True, timeout=300)
if res.returncode != 0:
    out = (res.stdout + res.stderr)[-4000:]
    print("Tests en echec, corrige avant de terminer :\n" + out, file=sys.stderr)
    sys.exit(2)
sys.exit(0)
