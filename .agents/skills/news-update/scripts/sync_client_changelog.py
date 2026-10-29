#!/usr/bin/env python3
"""Refresh reviewed website content from the public Duris Mudlet client history."""

import base64
import datetime
import html
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlparse


REPOSITORY = "LuminariMUD/duris-client"
REPOSITORY_URL = f"https://github.com/{REPOSITORY}"
OUTPUT = Path(__file__).resolve().parents[4] / "frontend/src/content/clientChangelog.json"
HEADING = re.compile(r"^## (\d+\.\d+(?:\.\d+)?)(?: - (\d{4}-\d{2}-\d{2}))?$")
INLINE = re.compile(r"`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)")


def github_api(path, paginate=False):
    endpoint = f"repos/{REPOSITORY}" + (f"/{path}" if path else "")
    command = ["gh", "api", endpoint]
    if paginate:
        command.extend(["--paginate", "--slurp"])
    return json.loads(subprocess.check_output(command, text=True, timeout=60))


def render_inline(text, source_sha):
    result = []
    position = 0
    for match in INLINE.finditer(text):
        result.append(html.escape(text[position:match.start()]))
        code, bold, label, target = match.groups()
        if code is not None:
            result.append(f"<code>{html.escape(code)}</code>")
        elif bold is not None:
            result.append(f"<strong>{html.escape(bold)}</strong>")
        else:
            url = urljoin(f"{REPOSITORY_URL}/blob/{source_sha}/", target)
            parsed = urlparse(url)
            if parsed.scheme != "https" or parsed.username or parsed.password:
                raise ValueError("Changelog contains an unsupported link; review before importing")
            result.append(f'<a href="{html.escape(url, quote=True)}">{html.escape(label)}</a>')
        position = match.end()
    result.append(html.escape(text[position:]))
    return "".join(result)


def render_body(lines, source_sha):
    blocks = []
    paragraph = []
    in_list = False
    for line in [*lines, ""]:
        if line.startswith("- "):
            if paragraph:
                blocks.append(f"<p>{render_inline(' '.join(paragraph), source_sha)}</p>")
                paragraph = []
            if not in_list:
                blocks.append("<ul>")
                in_list = True
            blocks.append(f"<li>{render_inline(line[2:], source_sha)}</li>")
        else:
            if in_list:
                blocks.append("</ul>")
                in_list = False
            if not line.strip():
                if paragraph:
                    blocks.append(f"<p>{render_inline(' '.join(paragraph), source_sha)}</p>")
                    paragraph = []
            else:
                if line.startswith("#") or line[:1].isspace():
                    raise ValueError("Unsupported changelog formatting; review before importing")
                paragraph.append(line)
    return "\n".join(blocks)


def parse_changelog(markdown, source_sha, published_tags):
    entries = []
    for section in re.split(r"(?m)^## ", markdown)[1:]:
        heading, *lines = section.splitlines()
        match = HEADING.fullmatch(f"## {heading}")
        if not match:
            raise ValueError(f"Unsupported version heading: {heading}")
        version, date = match.groups()
        if date:
            datetime.date.fromisoformat(date)
        content = render_body(lines, source_sha)
        if not content:
            raise ValueError("Empty changelog version")
        entries.append({
            "version": version,
            "date": date,
            "releaseUrl": (
                f"{REPOSITORY_URL}/releases/tag/v{version}"
                if f"v{version}" in published_tags else None
            ),
            "content": content,
        })
    if not entries or len({item["version"] for item in entries}) != len(entries):
        raise ValueError("Missing or duplicate changelog versions")
    return entries


def main():
    branch = github_api("")["default_branch"]
    source_sha = github_api(f"commits/{branch}")["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("Expected a full source commit SHA")
    source = github_api(f"contents/CHANGELOG.md?ref={source_sha}")
    markdown = base64.b64decode("".join(source["content"].split()), validate=True).decode("utf-8")
    pages = github_api("releases?per_page=100", paginate=True)
    published_tags = {
        release["tag_name"] for page in pages for release in page
        if not release["draft"] and not release["prerelease"]
    }
    entries = parse_changelog(markdown, source_sha, published_tags)
    snapshot = {
        "sourceSha": source_sha,
        "sourceUrl": f"{REPOSITORY_URL}/blob/{source_sha}/CHANGELOG.md",
        "entries": entries,
    }
    # Fetch and validate the entire history before replacing the reviewable snapshot.
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(entries)} versions through {entries[0]['version']} at {source_sha}")


if __name__ == "__main__":
    main()
