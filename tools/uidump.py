#!/usr/bin/env python3
"""uiautomator dump helper for the parity emulator flow.

Usage:
  uidump.py list                      # print interactive nodes (text/desc/class/bounds/center)
  uidump.py tap-text <substr> [idx]   # tap Nth node whose text contains substr (--exact, --clickable)
  uidump.py tap-desc <substr> [idx]   # tap Nth node whose content-desc contains substr
  uidump.py tap-edit <idx>            # tap the Nth EditText, top-to-bottom (0-based)
  uidump.py find <substr> [idx]       # print node + center, exit 1 if absent
  uidump.py center <substr> [idx]     # print "X Y" of node center only

Serial from ANDROID_SERIAL or --serial. Dump cached per invocation (one adb round-trip).
"""
import argparse
import re
import subprocess
import sys

NODE_RE = re.compile(r'<node[^>]*/>|<node[^>]*>')


def attr(node: str, name: str) -> str:
    m = re.search(rf'{name}="([^"]*)"', node)
    return m.group(1) if m else ''


def bounds(node: str):
    m = re.search(r'bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"', node)
    if not m:
        return None
    x1, y1, x2, y2 = map(int, m.groups())
    return x1, y1, x2, y2


def center(node: str):
    b = bounds(node)
    if not b:
        return None
    x1, y1, x2, y2 = b
    return (x1 + x2) // 2, (y1 + y2) // 2


def dump(serial: str) -> str:
    subprocess.run(
        ['adb', '-s', serial, 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'],
        capture_output=True, timeout=30)
    out = subprocess.run(
        ['adb', '-s', serial, 'shell', 'cat', '/sdcard/ui.xml'],
        capture_output=True, timeout=30)
    return out.stdout.decode('utf-8', 'replace')


def interactive_nodes(xml: str):
    for node in NODE_RE.findall(xml):
        cls = attr(node, 'class')
        text = attr(node, 'text')
        desc = attr(node, 'content-desc')
        clickable = attr(node, 'clickable') == 'true'
        editable = 'EditText' in cls
        if not (text or desc or clickable or editable):
            continue
        c = center(node)
        if not c:
            continue
        yield {
            'text': text, 'desc': desc, 'class': cls, 'clickable': clickable,
            'editable': editable, 'password': attr(node, 'password') == 'true',
            'center': c, 'bounds': bounds(node),
        }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['list', 'tap-text', 'tap-desc', 'tap-edit', 'find', 'center'])
    ap.add_argument('needle', nargs='?', default='')
    ap.add_argument('index', nargs='?', type=int, default=0)
    ap.add_argument('--serial', default=None)
    ap.add_argument('--exact', action='store_true', help='match text/content-desc exactly')
    ap.add_argument('--clickable', action='store_true', help='only consider clickable nodes')
    args = ap.parse_args()
    serial = args.serial or __import__('os').environ.get('ANDROID_SERIAL', 'emulator-5554')

    xml = dump(serial)
    nodes = list(interactive_nodes(xml))
    if args.clickable:
        nodes = [n for n in nodes if n['clickable']]

    def matches(pred):
        return [n for n in nodes if pred(n)]

    if args.cmd == 'list':
        for n in nodes:
            label = n['text'] or n['desc']
            if n['password'] and n['text']:
                label = '••• (%d chars)' % len(n['text'])
            print(f"{n['class'].split('.')[-1]:12} click={int(n['clickable'])} edit={int(n['editable'])} "
                  f"center={n['center'][0]},{n['center'][1]:5} text={label!r}")
        return 0

    if args.cmd == 'tap-edit':
        # index may arrive as the needle positional ("tap-edit 1")
        idx = int(args.needle) if args.needle else args.index
        edits = sorted((n for n in nodes if n['editable']), key=lambda n: n['center'][1])
        if idx >= len(edits):
            print(f'INDEX {idx} > {len(edits) - 1} EditTexts on screen', file=sys.stderr)
            return 1
        n = edits[idx]
        x, y = n['center']
        subprocess.run(['adb', '-s', serial, 'shell', 'input', 'tap', str(x), str(y)],
                       check=True, timeout=15)
        print(f"tapped EditText #{idx} at {x},{y}")
        return 0

    def is_match(n, hay):
        # tab buttons merge their label into text OR content-desc depending on
        # dump — match the combined haystack for tap-text/find/center
        combined = f"{n['text']} {n['desc']}".strip()
        if args.exact:
            return hay == args.needle or combined == args.needle
        return args.needle.lower() in combined.lower()

    if args.cmd in ('tap-text', 'find', 'center'):
        hits = matches(lambda n: is_match(n, n['text']))
    else:
        hits = matches(lambda n: is_match(n, n['desc']))

    if not hits:
        print(f'NOT FOUND: {args.needle}', file=sys.stderr)
        return 1
    if args.index >= len(hits):
        print(f'INDEX {args.index} > {len(hits) - 1} matches for {args.needle}', file=sys.stderr)
        return 1
    n = hits[args.index]
    x, y = n['center']
    label = n['text'] or n['desc']
    if n['password'] and n['text']:
        label = '••• (%d chars)' % len(n['text'])
    if args.cmd in ('tap-text', 'tap-desc'):
        subprocess.run(['adb', '-s', serial, 'shell', 'input', 'tap', str(x), str(y)],
                       check=True, timeout=15)
        print(f"tapped {label!r} at {x},{y}")
    elif args.cmd == 'center':
        print(f'{x} {y}')
    else:
        print(f"found {label!r} class={n['class']} bounds={n['bounds']} center={x},{y}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
