#!/usr/bin/env python3
"""Closed-loop verification of the served site (run from repo root).

Checks:
  1. Canonical host: served files must not reference www.terpsdispensary.com
     or shop.terpsdispensary.com — canonical is exactly
     https://terpsdispensary.com (apex, post-cutover 2026-07-02).
  2. CNAME content must be exactly terpsdispensary.com.
  3. robots.txt must Disallow: /staff.html and Disallow: /order.html.
  4. Every internal href/src in served HTML must resolve to a file in the repo.
  5. sitemap.xml must be valid XML and every <loc> must map to an existing file.
"""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlparse, unquote

ROOT = os.getcwd()
CANONICAL_HOST = 'terpsdispensary.com'
errors = []


def err(msg):
    errors.append(msg)
    print(f'FAIL: {msg}')


def served_html_files():
    files = ['index.html', 'menu.html']
    for d in ('product', 'post', 'blog'):
        files += sorted(glob.glob(f'{d}/**/*.html', recursive=True))
    return [f for f in files if os.path.isfile(f)]


def served_text_files():
    return served_html_files() + [f for f in ('sitemap.xml', 'robots.txt') if os.path.isfile(f)]


# ---- 1. canonical host -------------------------------------------------
BAD_HOST = re.compile(r'(?:www\.terpsdispensary\.com|shop\.terpsdispensary\.com)')
for f in served_text_files():
    text = open(f, encoding='utf-8', errors='replace').read()
    for m in BAD_HOST.finditer(text):
        line = text.count('\n', 0, m.start()) + 1
        err(f'{f}:{line}: forbidden host reference "{m.group(0)}" '
            f'(canonical is https://{CANONICAL_HOST})')

# ---- 2. CNAME -----------------------------------------------------------
if not os.path.isfile('CNAME'):
    err('CNAME file is missing')
else:
    cname = open('CNAME', encoding='utf-8').read().strip()
    if cname != CANONICAL_HOST:
        err(f'CNAME is "{cname}", expected "{CANONICAL_HOST}"')

# ---- 3. robots.txt ------------------------------------------------------
if not os.path.isfile('robots.txt'):
    err('robots.txt is missing')
else:
    robots = open('robots.txt', encoding='utf-8').read()
    lines = [ln.strip() for ln in robots.splitlines()]
    for required in ('Disallow: /staff.html', 'Disallow: /order.html'):
        if required not in lines:
            err(f'robots.txt lacks "{required}"')

# ---- 4. internal link check ---------------------------------------------
class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ('href', 'src') and value:
                self.links.append(value)


def resolve_target(link, from_file):
    """Return repo-relative path for an internal link, or None if external."""
    link = link.strip()
    if not link or link.startswith('#'):
        return None
    parsed = urlparse(link)
    if parsed.scheme in ('mailto', 'tel', 'sms', 'javascript', 'data', 'geo'):
        return None
    if parsed.scheme in ('http', 'https'):
        if parsed.netloc != CANONICAL_HOST:
            return None  # external
        path = parsed.path
    elif link.startswith('//'):
        return None  # protocol-relative external
    else:
        path = parsed.path
    path = unquote(path)
    if not path:
        return None
    if path.startswith('/'):
        target = path.lstrip('/')
    else:
        target = os.path.normpath(os.path.join(os.path.dirname(from_file), path))
    if target in ('', '.'):
        target = 'index.html'
    if target.endswith('/'):
        target += 'index.html'
    return target


def target_exists(target):
    # GitHub Pages serves extensionless URLs from the matching .html file
    return (os.path.isfile(target)
            or os.path.isfile(target + '.html')
            or os.path.isfile(os.path.join(target, 'index.html')))


for f in served_html_files():
    parser = LinkParser()
    parser.feed(open(f, encoding='utf-8', errors='replace').read())
    for link in parser.links:
        target = resolve_target(link, f)
        if target is None:
            continue
        if not target_exists(target):
            err(f'{f}: internal link "{link}" -> "{target}" does not exist in the repo')

# ---- 5. sitemap ----------------------------------------------------------
if not os.path.isfile('sitemap.xml'):
    err('sitemap.xml is missing')
else:
    try:
        tree = ET.parse('sitemap.xml')
    except ET.ParseError as exc:
        err(f'sitemap.xml is not valid XML: {exc}')
    else:
        ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        locs = [el.text.strip() for el in tree.getroot().findall('.//sm:url/sm:loc', ns) if el.text]
        if not locs:
            err('sitemap.xml contains no <loc> entries')
        for loc in locs:
            parsed = urlparse(loc)
            if parsed.netloc != CANONICAL_HOST:
                err(f'sitemap.xml: <loc> {loc} is not on https://{CANONICAL_HOST}')
                continue
            target = unquote(parsed.path).lstrip('/')
            if target == '' or target.endswith('/'):
                target += 'index.html'
            if not target_exists(target):
                err(f'sitemap.xml: <loc> {loc} -> "{target}" does not exist in the repo')

if errors:
    print(f'\nverify_site: {len(errors)} error(s)')
    sys.exit(1)
print('verify_site: all checks passed')
