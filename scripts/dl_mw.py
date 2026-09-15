#!/usr/bin/env python3
"""Download all MakerWorld 3MF variants from catalog.json via Brave window automation.

Skips models already downloaded (files `{cat}.{mid}.*` present in OUT). One model per
invocation (pass index arg) so failures don't cascade; logs to .dl_mw.log.
"""
import json, os, re, subprocess, sys, time, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "catalog.json")
LOG = os.path.join(ROOT, ".dl_mw.log")
OUT = "/Users/jesusc/Downloads/3mf_templates/"
DL  = os.path.expanduser("~/Downloads")

def log(msg):
    with open(LOG, "a") as f:
        f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")

def orca(*args, timeout=60):
    cmd = ["orca", "computer"] + list(args)
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None
    try:
        return json.loads(p.stdout)
    except Exception:
        return None

def tree():
    d = orca("get-app-state", "--app", "com.brave.Browser", "--json", "--no-screenshot")
    if not d or not d.get("ok"):
        return []
    t = d.get("result", {}).get("snapshot", {}).get("treeText", "") or ""
    return t.split("\n")

def find(lines, pattern, start=0):
    for i in range(start, len(lines)):
        if re.search(pattern, lines[i]):
            return i, lines[i]
    return None, None

def find_elem(lines, pattern, start=0):
    for i in range(start, len(lines)):
        m = re.match(r"^\s*(\d+)\s+", lines[i])
        if m and re.search(pattern, lines[i]):
            return int(m.group(1))
    return None

def click(idx, restore=True):
    args = ["click", "--app", "com.brave.Browser"]
    if restore:
        args.append("--restore-window")
    args += ["--element-index", str(idx), "--no-screenshot", "--json"]
    return orca(*args)

def close_bubble():
    lines = tree()
    txt = "\n".join(lines)
    if "Recent Download History" in txt or "Recent Download History" in (lines[1] if len(lines) > 1 else ""):
        orca("press-key", "--app", "com.brave.Browser", "--restore-window",
             "--key", "Escape", "--no-screenshot", "--json")
        time.sleep(1.5)
        return True
    return False

def nav(url):
    orca("hotkey", "--app", "com.brave.Browser", "--restore-window", "--key", "CmdOrCtrl+L", "--no-screenshot", "--json")
    time.sleep(1.5)
    orca("type-text", "--app", "com.brave.Browser", "--text", url, "--no-screenshot", "--json")
    time.sleep(1.5)
    orca("press-key", "--app", "com.brave.Browser", "--key", "Return", "--no-screenshot", "--json")

def wait_url(mid, timeout=50):
    t0 = time.time()
    seen = ""
    while time.time() - t0 < timeout:
        close_bubble()
        lines = tree()
        i, l = find(lines, r"Address and search bar")
        if i is not None:
            seen = l
            if mid in l:
                return True
        time.sleep(2)
    print(f"  !! URL not on {mid}: {seen.strip()[:80]}")
    log(f"URL missing for {mid}: {seen.strip()[:80]}")
    return False

def ensure_expanded(timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        lines = tree()
        if close_bubble():
            lines = tree()
        if len(lines) > 100:
            i, _ = find(lines, r"Print Files \(|Download 3MF")
            if i is not None:
                return lines
        idx = find_elem(lines, r"HTML content")
        if idx is not None:
            orca("scroll", "--app", "com.brave.Browser", "--restore-window",
                 "--element-index", str(idx), "--direction", "down",
                 "--no-screenshot", "--json")
        time.sleep(3)
    return tree()

def download_and_move(mid, cat, attempt=0):
    before = set(glob.glob(os.path.join(DL, "*.3mf")))
    lines = tree()
    idx = find_elem(lines, r"text Download 3MF")
    if idx is None:
        lines = ensure_expanded(25)
        idx = find_elem(lines, r"text Download 3MF")
    if idx is None:
        print(f"  !! no Download 3MF button (tree len={len(lines)})")
        log(f"no Download button {mid}")
        return False
    click(idx)
    time.sleep(3)
    for _ in range(14):
        lines = tree()
        txt = "\n".join(lines)
        if "wants to download multiple files" in txt or "wants to download" in txt:
            i = find_elem(lines, r"button Allow")
            if i is not None:
                click(i)
            time.sleep(1)
            orca("press-key", "--app", "com.brave.Browser", "--key", "Escape",
                 "--no-screenshot", "--json")
        new = set(glob.glob(os.path.join(DL, "*.3mf"))) - before
        if new:
            f = new.pop()
            base = f"{cat}.{mid}." + os.path.basename(f)
            ren = os.path.join(OUT, base)
            n = 2
            while os.path.exists(ren):
                stem, ext = os.path.splitext(base)
                ren = os.path.join(OUT, f"{stem}-{n}{ext}")
                n += 1
            os.rename(f, ren)
            sz = os.path.getsize(ren)
            print(f"  + {os.path.basename(ren)} ({sz//1024} KB)")
            log(f"DL {os.path.basename(ren)}")
            close_bubble()
            return True
        time.sleep(2)
    orca("press-key", "--app", "com.brave.Browser", "--key", "Escape", "--no-screenshot", "--json")
    for f in set(glob.glob(os.path.join(DL, "*.3mf"))) - before:
        base = f"{cat}.{mid}." + os.path.basename(f)
        ren = os.path.join(OUT, base)
        n = 2
        while os.path.exists(ren):
            stem, ext = os.path.splitext(base)
            ren = os.path.join(OUT, f"{stem}-{n}{ext}")
            n += 1
        os.rename(f, ren)
        print(f"  + (late) {os.path.basename(ren)}")
        log(f"DL-late {os.path.basename(ren)}")
        return True
    print(f"  !! download timeout for {mid}")
    log(f"DL timeout {mid}")
    return False

def get_profile_cards(lines):
    start_idx = None
    for i, l in enumerate(lines):
        if "Print Files (" in l:
            start_idx = i
            break
    if start_idx is None:
        return []
    cards = []
    for l in lines[start_idx:start_idx+40]:
        m = re.match(r"^\s*(\d+)\s+.*container, Text: .*(?:\bDesigner\b|layer)", l.strip())
        if m and "See More" not in l:
            cards.append(int(m.group(1)))
    return cards

def already_done(mid):
    return bool(glob.glob(os.path.join(OUT, f"*.{mid}.*")))

def main_models():
    """Return [(mid, slug, cat), ...] from catalog.json, ordered."""
    d = json.load(open(CATALOG))
    out = []
    for cat, items in d.items():
        for m in items:
            out.append((m["id"], m["slug"], cat))
    return out

if __name__ == "__main__":
    models = main_models()
    # --all: process every not-done model, else single index
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        todo = [m for m in models if not already_done(m[0])]
        print(f"total={len(models)} done={len(models)-len(todo)} todo={len(todo)} -> {LOG}")
        for mid, slug, cat in todo:
            print(f"\n== {cat} / {mid} ==")
            log(f"START {mid} {slug}")
            url = f"https://makerworld.com/en/models/{mid}-{slug}"
            nav(url)
            if not wait_url(mid):
                log(f"FAIL nav {mid}")
                continue
            lines = ensure_expanded()
            cards = get_profile_cards(lines)
            if not cards:
                print("  !! no cards; trying download without profile cards")
                cards = [0]  # assume at least base download is reachable
            print(f"  profiles: {len(cards)}")
            ok = download_and_move(mid, cat)
            if not ok:
                log(f"FAIL base {mid}")
                continue
            for card in cards[1:]:
                click(card)
                time.sleep(4)
                close_bubble()
                lines = ensure_expanded(25)
                i, _ = find(lines, r"button Close")
                if i is not None:
                    click(int(lines[i].strip().split()[0]))
                    time.sleep(2)
                    click(card)
                    time.sleep(4)
                    lines = ensure_expanded(30)
                if not download_and_move(mid, cat):
                    print("  !! extra variant failed")
                    log(f"FAIL extra {mid}")
            log(f"OK {mid}")
    else:
        which = int(sys.argv[1]) if len(sys.argv) > 1 else 0
        mid, slug, cat = models[which]
        print(f"== {cat} / {mid} ({which}/{len(models)}) ==")
        url = f"https://makerworld.com/en/models/{mid}-{slug}"
        nav(url)
        if not wait_url(mid):
            sys.exit(1)
        lines = ensure_expanded()
        cards = get_profile_cards(lines)
        print(f"  profiles: {len(cards)}")
        ok = download_and_move(mid, cat)
        if not ok:
            sys.exit(1)
        for card in cards[1:]:
            click(card)
            time.sleep(4)
            close_bubble()
            lines = ensure_expanded(25)
            i, _ = find(lines, r"button Close")
            if i is not None:
                click(int(lines[i].strip().split()[0]))
                time.sleep(2)
                click(card)
                time.sleep(4)
                lines = ensure_expanded(30)
            if not download_and_move(mid, cat):
                print("  !! extra variant failed")
        print("  done")