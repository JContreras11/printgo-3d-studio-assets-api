#!/usr/bin/env python3
"""Scrape missing MakerWorld model pages via Firecrawl into raw/model-{id}.md (resumable)."""
import json, os, sys, time, urllib.request, urllib.error

KEY = "fc-57809f7ff51f461b92eb446c5cf63792"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts", "lib"))

def load_catalog():
    catalog = json.load(open(os.path.join(ROOT, "catalog.json")))
    by_id = {}
    for cat, items in catalog.items():
        for m in items:
            by_id[m["id"]] = m
    return by_id

def scrape(url):
    body = json.dumps({
        "url": url,
        "formats": ["markdown"],
        "onlyMainContent": False,
        "waitFor": 2500,
    }).encode()
    req = urllib.request.Request(
        "https://api.firecrawl.dev/v1/scrape",
        data=body, method="POST",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read().decode())
    if not d.get("success"):
        raise RuntimeError(f"firecrawl fail: {d.get('error')}")
    markdown = (d.get("data") or {}).get("markdown") or ""
    if not markdown:
        raise RuntimeError("empty markdown")
    return markdown

def main():
    by_id = load_catalog()
    todo = json.load(open(os.path.join(ROOT, ".tmp", "todo_scrape.json")))
    base = os.path.join(ROOT, "raw")
    done = ok = fail = 0
    for mid in todo:
        out = os.path.join(base, f"model-{mid}.md")
        if os.path.exists(out) and os.path.getsize(out) > 5000:
            done += 1
            continue
        info = by_id.get(mid, {})
        url = info.get("url")
        if not url:
            print(f"SKIP {mid}: no url in catalog")
            fail += 1
            continue
        for attempt in range(3):
            try:
                md = scrape(url)
                open(out, "w").write(md)
                ok += 1
                print(f"OK  {mid} ({len(md)}b) {info.get('slug','')[:40]}")
                break
            except Exception as e:
                if attempt == 2:
                    fail += 1
                    print(f"FAIL {mid}: {e}")
                else:
                    time.sleep(3 * (attempt + 1))
        time.sleep(0.6)
    print(f"\n=== skipped_exists={done} ok={ok} fail={fail} ===")
    return 0 if fail == 0 else 1

if __name__ == "__main__":
    sys.exit(main())