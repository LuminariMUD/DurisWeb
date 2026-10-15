# Mudlet GUI page captures

These are unedited native Mudlet window captures for
[`MudletGuiView.vue`](../../views/MudletGuiView.vue), following the
[design guide](../../../../docs/DESIGN.md#preparing-images-and-screenshots).
All characters, dialogue, combat, equipment, and geography are invented offline
demonstration data. No live player session or account is involved.

## Download and capture identity

The public [releases page](https://github.com/LuminariMUD/duris-client/releases)
still selected **v1.3.0** on 2026-10-15. These captures install the exact public
`duris-client.mpackage` asset, rather than the newer source build used in the
[original planning captures](../../../../docs/ongoing-projects/assets/mudlet-gui/README.md).
Those original 1.3.3 images and their fixture remain intact in `docs/`.

| Field | Value |
|---|---|
| Release | [v1.3.0](https://github.com/LuminariMUD/duris-client/releases/tag/v1.3.0) |
| Release source commit | `81d1692cd63f08d549bcc99fdff7c0e7f59f3fe5` |
| Asset | [duris-client.mpackage](https://github.com/LuminariMUD/duris-client/releases/download/v1.3.0/duris-client.mpackage) |
| Archive SHA-256 | `6e30c14e1b2af01d6cba3d4947729206204a30d8a135188667aa604d7f09747f` |
| Canonical payload SHA-256 | `9f4bf1822818706ca40cb60659e2a2bd090ed129d7c152eac9253e350ab8e0bf` |
| Package metadata / `ArjUI.VERSION` | 1.3.0 / 1.3.0 |
| Capture controller and test companion source | `00c3a819b175feacb0d0a2d194dff41b7a72469a`, with the release-archive adaptation below |
| Mudlet / Qt / Lua | 5.0.1 / 6.10.2 / 5.1.5 |
| Platform | Linux x86_64, kernel 7.0.0-38-generic, glibc 2.43 |
| Desktop / window | Xvfb 2048 × 1200, Openbox, Qt scale 1 / 1920 × 1080 |
| Font / locale | `Consolas` resolves to DejaVu Sans Mono Book / C.UTF-8 |
| Profile | Disposable `Duris-Visual`, disconnected throughout |
| Run | `20261015T120929Z-80239a70-page-demo`, 2026-10-15 12:09:29–12:09:40 UTC |
| Result | 29 assertions passed, no Lua errors, visual review PASS, normal shutdown and cleanup confirmed |

The older package retains a `v1.0` footer label despite its 1.3.0 metadata and
startup banner. Its background artwork does not render on Linux because its
asset lookup converts paths to backslashes. Neither its artwork nor its source
was repaired or replaced for these images. The existing bronze controls and
game colors are preserved exactly as captured.

The supplied scenario initially exposed 1.3.0's lack of JSON-null support in
`Combat.Update`. The capture fixture uses absent fields to end combat, then
supplies fresh vitals and selects STATS after changing rooms. These are fixture
inputs, not patches to the installed client. This is a screenshot scenario,
not a client release qualification: live connections, other operating systems,
the declared Mudlet 4.19.1 minimum, and other data/prompt formats remain untested.
The page does not promise compatibility across those environments. In this
release STATS requests `stat`; the page does not promise a specific command.

## Assets

All four original PNGs are 1920 × 1080, totaling 613,637 bytes. The page imports
them through Vite, reserves their dimensions, and links directly to the same
full-size original. There are no resized delivery derivatives, overlays, crops,
or recolored pixels. Readable HTML copy explains each image independently.

| File | SHA-256 |
|---|---|
| [overview.png](overview.png) | `91eef19a2ab85e94749bc1f627e37b36d58e249a7a38a5f104ddc80ff688bb53` |
| [combat-group.png](combat-group.png) | `d34c66552851da45817f744bbbbb705f29eacd449f284098adf36cd964371256` |
| [chat-equipment.png](chat-equipment.png) | `79707fc76d7b6f5114710ab9847eb60a9e74d900e2cce19f8213d0ee7069e83b` |
| [wilderness.png](wilderness.png) | `cfb75f8836105f3928226134d2175391e9c5619ec0bee70021d67b6bfa50dcb5` |
| Adapted `page-demo.lua` | `0bfaa1b6de1a643208f28f534aad77585ef69303546c8568c6949f43c4d55dfc` |
| Unchanged `zone.json` | `a8691a3ca40e545ce594474efffe307c02cac7f4f5bd6260bc717ba4948c0cdf` |

## Reproduce

Run from the website repository root, with the native tools listed in the
[original capture record](../../../../docs/ongoing-projects/assets/mudlet-gui/README.md#reproduce).
The following adapts only a disposable checkout's controller and fixture.
Restoring the release's `src` and `VERSION` lets the controller validate the
archive metadata and assets; it installs the downloaded archive unchanged.

```bash
capture_root=$(mktemp -d /tmp/duris-mudlet-release.XXXXXX)
git clone https://github.com/LuminariMUD/duris-client.git "$capture_root/client"
git -C "$capture_root/client" checkout --detach 00c3a819b175feacb0d0a2d194dff41b7a72469a
git -C "$capture_root/client" restore --source v1.3.0 -- src VERSION
curl -fsSL https://github.com/LuminariMUD/duris-client/releases/download/v1.3.0/duris-client.mpackage -o "$capture_root/duris-client.mpackage"
cp docs/ongoing-projects/assets/mudlet-gui/page-demo.lua "$capture_root/client/tests/mudlet/fixtures/page-demo.lua"
cp docs/ongoing-projects/assets/mudlet-gui/zone.json "$capture_root/client/tests/mudlet/fixtures/zone.json"
python3 - "$capture_root" <<'PY'
from pathlib import Path
import hashlib, sys
root = Path(sys.argv[1])
archive = root / 'duris-client.mpackage'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '6e30c14e1b2af01d6cba3d4947729206204a30d8a135188667aa604d7f09747f'
controller = root / 'client/scripts/mudlet_test.py'
source = controller.read_text()
old = '    command([sys.executable, ROOT / "build.py", "--check"])\n    command([sys.executable, ROOT / "build.py", "-o", run / "duris-client.mpackage"])'
assert old in source
controller.write_text(source.replace(old, '    shutil.copyfile(ROOT.parent / "duris-client.mpackage", run / "duris-client.mpackage")'))
fixture = root / 'client/tests/mudlet/fixtures/page-demo.lua'
source = fixture.read_text()
source = source.replace('T.emit("Combat.Update", yajl.to_value(\'{"target":null,"tank":null}\'))', '-- v1.3.0 expects absent fields when combat ends; JSON null support arrived later.\n    T.emit("Combat.Update", {})')
source = source.replace('    ArjUI:switchTab("stats")\n', '')
old = '    ArjUI:switchChatTab("all")\n    scene({\n      "\\27[32mThe Open Plains'
new = '    -- Refresh vitals and select STATS after changing rooms, as in a fresh game update.\n    T.emit("Char.Vitals", {hp=714, maxHp=1000, mana=241, maxMana=500, move=91, maxMove=120, position="standing", fighting=""})\n    ArjUI:switchTab("stats")\n' + old
assert old in source
fixture.write_text(source.replace(old, new))
assert hashlib.sha256(fixture.read_bytes()).hexdigest() == '0bfaa1b6de1a643208f28f534aad77585ef69303546c8568c6949f43c4d55dfc'
PY
python3 "$capture_root/client/scripts/mudlet_test.py" doctor
luac5.1 -p "$capture_root/client/tests/mudlet/fixtures/page-demo.lua"
python3 "$capture_root/client/scripts/mudlet_test.py" run --scenario page-demo --size 1920x1080 --timeout 70 --root "$capture_root/runs"
```

Inspect all four checkpoint PNGs, the candidate-only image, native Errors view,
`results.json`, and `manifest.json`. Use the controller's `review` command only
after inspecting the actual images. The initial null-event run failed and was
not selected; a second run passed but was superseded to refresh wilderness
stats before capture. The third run above is the selected set.

Raw evidence remains outside the checkout at
`/tmp/durisweb-mudlet.gQqw9C/captures/20261015T120929Z-80239a70-page-demo`.
That path is temporary; this record, the images, immutable identities and
reproduction recipe are the durable evidence. Future releases need a fresh
download/feature/capture comparison before changing the page's version caption.

Originally created by Arjinius / Arjin; maintained by LuminariMUD. These captures
introduce no license claim; see the client's
[license record](https://github.com/LuminariMUD/duris-client/blob/00c3a819b175feacb0d0a2d194dff41b7a72469a/LICENSE.md).
