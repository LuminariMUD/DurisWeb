import base64
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from sync_client_changelog import main, parse_changelog


class ClientChangelogImportTests(unittest.TestCase):
    def test_preserves_all_history_and_distinguishes_published_packages(self):
        entries = parse_changelog(
            "# Changelog\n\n## 2.0.0 - 2026-10-22\n\n"
            "- Use `look ship` and **Contacts**.\n\n"
            "## 1.1 - 2026-09-20\n\nFirst tagged release.\n\n"
            "## 1.0\n\nOriginal client.\n",
            "a" * 40,
            {"v2.0.0"},
        )
        self.assertEqual([entry["version"] for entry in entries], ["2.0.0", "1.1", "1.0"])
        self.assertTrue(entries[0]["releaseUrl"].endswith("/v2.0.0"))
        self.assertIsNone(entries[1]["releaseUrl"])
        self.assertIsNone(entries[2]["date"])
        self.assertIn("<code>look ship</code>", entries[0]["content"])
        self.assertIn("<strong>Contacts</strong>", entries[0]["content"])
        self.assertEqual(entries[2]["content"], "<p>Original client.</p>")

    def test_escapes_source_html_and_pins_relative_document_links(self):
        entry = parse_changelog(
            "## 1.0\n\n<script>alert(1)</script>\n\n"
            "- [Guide](docs/RELEASING.md)\n- Send `<item>`.\n",
            "a" * 40,
            set(),
        )[0]
        self.assertNotIn("<script>", entry["content"])
        self.assertIn("&lt;script&gt;", entry["content"])
        self.assertIn(f'/blob/{"a" * 40}/docs/RELEASING.md', entry["content"])
        self.assertIn("<code>&lt;item&gt;</code>", entry["content"])

    def test_rejects_ambiguous_or_unsupported_imports(self):
        for markdown in [
            "# Changelog\n",
            "## Unreleased\n\n- Pending.\n",
            "## 1.0\n\nFirst.\n\n## END\n\nUnexpected heading.\n",
            "## 1.0\n",
            "## 1.0\n\nFirst.\n\n## 1.0\n\nDuplicate.\n",
            "## 1.0 - 2026-02-30\n\nInvalid date.\n",
            "## 1.0\n\n- [Unsafe](javascript:alert)\n",
            "## 1.0\n\n### Unsupported subheading\n",
        ]:
            with self.subTest(markdown=markdown), self.assertRaises(ValueError):
                parse_changelog(markdown, "a" * 40, set())

    def test_fetches_pinned_history_and_uses_all_public_release_pages(self):
        markdown = "## 2.0.0 - 2026-10-22\n\nCurrent.\n\n## 1.0\n\nOriginal.\n"
        responses = [
            {"default_branch": "master"},
            {"sha": "a" * 40},
            {"content": base64.b64encode(markdown.encode()).decode()},
            [
                [{"tag_name": "v2.0.0", "draft": True, "prerelease": False}],
                [{"tag_name": "v1.0", "draft": False, "prerelease": False}],
            ],
        ]
        with TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            with patch("sync_client_changelog.OUTPUT", output), patch(
                "sync_client_changelog.github_api", side_effect=responses
            ) as api:
                main()
            snapshot = json.loads(output.read_text())
            self.assertEqual(snapshot["sourceSha"], "a" * 40)
            self.assertIsNone(snapshot["entries"][0]["releaseUrl"])
            self.assertTrue(snapshot["entries"][1]["releaseUrl"].endswith("/v1.0"))
            self.assertEqual(api.call_args_list[2].args, (f'contents/CHANGELOG.md?ref={"a" * 40}',))
            self.assertEqual(api.call_args_list[3].kwargs, {"paginate": True})

    def test_leaves_existing_content_unchanged_when_release_fetch_fails(self):
        with TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            output.write_text("previous reviewed snapshot")
            with patch("sync_client_changelog.OUTPUT", output), patch(
                "sync_client_changelog.github_api",
                side_effect=[
                    {"default_branch": "master"}, {"sha": "a" * 40},
                    {"content": base64.b64encode(b"## 1.0\n\nOriginal.\n").decode()},
                    RuntimeError("GitHub unavailable"),
                ],
            ), self.assertRaises(RuntimeError):
                main()
            self.assertEqual(output.read_text(), "previous reviewed snapshot")


if __name__ == "__main__":
    unittest.main()
