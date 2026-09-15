#!/usr/bin/env python3
"""Parse MakerWorld model-page markdown dumps (raw/model-{id}.md) into a clean metadata object."""
import json, os, re, glob, html

def clean_markdown_links(text):
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = html.unescape(text)
    return text

def strip_bottom(text):
    cut = text.find("### Remixes")
    if cut != -1:
        text = text[:cut]
    cut = text.find("### Ideas for you")
    if cut != -1:
        text = text[:cut]
    cut = text.find("#### Print Profile")
    if cut != -1:
        text = text[:cut]
    cut = text.find("#### License")
    if cut != -1:
        text = text[:cut]
    return text.strip()

def parse_model(md, mid):
    m = {}
    title_re = re.search(r"^# (.+)$", md, re.M)
    m["title"] = title_re.group(1).strip() if title_re else ""
    author_re = re.search(r"https://makerworld\.com/en/@([A-Za-z0-9_\-\.]+)", md)
    m["author"] = author_re.group(1) if author_re else ""
    # category breadcrumb: "Household > Decor"
    cat_re = re.search(r"\[([^\]]+)\]\(https://makerworld\.com/en/3d-models/\d+\).*\[([^\]]+)\]\(https://makerworld\.com/en/3d-models/\d+\)", md)
    m["category"] = f"{cat_re.group(1)} > {cat_re.group(2)}" if cat_re else ""
    # description: text inside "### Description" ... "### Comment & Rating"
    desc = ""
    if "### Description" in md:
        seg = md[md.find("### Description")+len("### Description"):]
        seg = seg.split("### Comment")[0]
        seg = seg.split("#### Print Profile")[0]
        seg = clean_markdown_links(seg)
        seg = re.sub(r"\n{3,}", "\n\n", seg).strip()
        seg = re.sub(r"^Content has been automatically translated\.\s*\n*\s*Show original\s*\n*", "", seg)
        if seg and seg.lower() not in ("boost me (for free)",):
            desc = seg
    m["description"] = desc
    # tags: search term links right after "### Description"
    tags = set()
    if "### Description" in md:
        sex = md[md.find("### Description"):]
        sex = sex.split("### Comment")[0]
        for t in re.findall(r"\[([^\]]+)\]\(https://makerworld\.com/en/search/models\?keyword=tag:([^)]*)\)", sex):
            tags.add(t[1].replace("%20", " ").strip())
    m["tags"] = sorted(tags, key=lambda s: (s.startswith((" ", "%")), s.strip()))
    # license block
    lic = ""
    if "#### License" in md:
        lic_seg = md[md.find("#### License"):md.find("#### License")+400]
        rules = [
            ("cc-zero.png", "Public Domain / CC0"),
            ("share-your-work/public-domain/cc0", "Public Domain / CC0"),
            ("publicdomain/zero/1.0", "Public Domain / CC0"),
            ("public-domain/", "Public Domain / CC0"),
            ("creativecommons/by-sa.png", "CC BY-SA 4"),
            ("Attribution-ShareAlike", "CC BY-SA 4"),
            ("creativecommons/by.png", "CC BY 4"),
            ("Attribution", "CC BY 4"),
        ]
        for pat, val in rules:
            if pat in lic_seg:
                lic = val
                break
    m["license"] = lic
    # release date: first image date in design URLs
    dates = re.findall(r"/design/(\d{4}-\d{2}-\d{2})", md)
    m["release_date"] = dates[0] if dates else ""
    # leaves: first design image (w_1000, with ?x-oss-process or /format,webp suffix)
    prev = re.findall(r"https://makerworld\.bblmw\.com/makerworld/model/\S+?/design/\S+?(?:\?[^)\s]*resize,w_1000|/[^)\s]*w_1000[^)\s]*)", md)
    m["preview_url"] = prev[0] if prev else ""
    # all design images w_1000, deduped, in page order
    m["images"] = list(dict.fromkeys(prev))
    return m

def load_existing_metadata():
    out = {}
    for f in glob.glob(os.path.join(os.path.dirname(__file__), "..", "..", "raw", "model-*.md")):
        mid = os.path.basename(f).replace("model-", "").replace(".md", "")
        md = open(f).read()
        out[mid] = parse_model(md, mid)
    return out

if __name__ == "__main__":
    meta = load_existing_metadata()
    print(f"parsed {len(meta)} raw scrapes")
    for mid in sorted(meta)[:3]:
        print(json.dumps(meta[mid], ensure_ascii=False, indent=1))