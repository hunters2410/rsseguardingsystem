"""
generate_mediamtx_paths.py
──────────────────────────
Reads all cameras from Supabase and rewrites the `paths:` section
of mediamtx.yml so every camera slug maps to its real RTSP URL.

The slug is the same formula used by StreamPlayer.tsx:
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').strip('_')

Run from the project root:
  python generate_mediamtx_paths.py
"""

import os, re, sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    sys.exit("[ERROR] Missing Supabase credentials in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 1. Fetch cameras ──────────────────────────────────────────────────────────
res = supabase.table("cameras").select("name, stream_url, username, password").neq("status", "disabled").execute()
cameras = res.data or []

if not cameras:
    sys.exit("[WARN] No cameras found in DB (or all disabled).")

# ── 2. Build slug  (mirrors StreamPlayer.tsx logic) ──────────────────────────
def slugify(name: str) -> str:
    # MUST use hyphens — matches mediamtx.yml path keys AND StreamPlayer.tsx HLS URL generation
    return re.sub(r"[^a-z0-9]+", "-", name.lower().strip()).strip("-") or "camera"

# ── 3. Build RTSP source URL (inject credentials if stored separately) ────────
def build_rtsp(cam: dict) -> str:
    url = (cam.get("stream_url") or "").strip()
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        # HLS source — MediaMTX can pull this too
        return url
    if url.startswith("rtsp://") or url.startswith("rtsps://"):
        # Inject credentials from separate fields if the URL is bare (no @ sign)
        user = cam.get("username", "")
        pwd  = cam.get("password", "")
        if user and pwd and "@" not in url:
            from urllib.parse import quote_plus
            scheme, rest = url.split("://", 1)
            url = f"{scheme}://{quote_plus(user)}:{quote_plus(pwd)}@{rest}"
        return url
    return url

# ── 4. Generate YAML paths block ──────────────────────────────────────────────
lines = []
seen_slugs = {}

for cam in cameras:
    slug = slugify(cam["name"])
    rtsp = build_rtsp(cam)

    if not rtsp:
        print(f"  [SKIP] {cam['name']} - no stream_url, skipping")
        continue

    # Disambiguate duplicate slugs
    if slug in seen_slugs:
        seen_slugs[slug] += 1
        slug = f"{slug}_{seen_slugs[slug]}"
    else:
        seen_slugs[slug] = 0

    print(f"  [OK]   {cam['name']} -> /{slug}")
    lines.append(f"  {slug}:")
    lines.append(f"    source: {rtsp}")
    lines.append(f"    rtspTransport: tcp")
    lines.append(f"    sourceOnDemand: yes")
    lines.append(f"    sourceOnDemandStartTimeout: 10s")
    lines.append(f"    sourceOnDemandCloseAfter: 10s")
    lines.append("")

# ── 5. Patch mediamtx.yml ─────────────────────────────────────────────────────
yml_path = os.path.join(os.path.dirname(__file__), "streaming-server", "mediamtx.yml")

with open(yml_path, "r", encoding="utf-8") as f:
    content = f.read()

# Keep everything up to and including "paths:" line, then replace the block
header_match = re.search(r"^paths:\s*\n", content, re.MULTILINE)
if not header_match:
    sys.exit("[ERROR] Could not find 'paths:' section in mediamtx.yml")

header_end = header_match.end()
new_paths_block = "paths:\n" + "\n".join(lines) + "\n"
new_content = content[: header_match.start()] + new_paths_block

with open(yml_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"\n[DONE] mediamtx.yml updated with {len(seen_slugs)} camera path(s).")
print("   Restart MediaMTX for the changes to take effect.")
print("\n   HLS URLs will be:")
for slug in seen_slugs:
    print(f"     http://localhost:8888/{slug}/index.m3u8")
