# Mudlet GUI demonstration captures

Assets for the [Mudlet GUI page plan](../../2026-10-15-mudlet-gui-page-plan.md),
following the [website design guide](../../../DESIGN.md#preparing-images-and-screenshots).

These original **1.3.3 planning captures** are retained unchanged. The implemented
page uses separately [recaptured public 1.3.0 assets](../../../../frontend/src/assets/mudlet-gui/README.md)
to match the downloadable release. The record below describes only this original set.

These four PNGs are original captures of **the native Mudlet application running
Arjinius Client**, with synthetic offline data. They are not generated artwork,
website mockups, or recordings of a live player session. No pixels were edited,
cropped, resized, or composited after capture. The existing "New Duris" background
and interface are the package's own assets and rendering.

All characters, guild names, dialogue, items, combat, room descriptions, and
geography in these examples were invented for this page. Each screenshot
includes an offline-demonstration label. Preserve that distinction in page
captions. The fictional map contains 27 rooms and 56 directed connections.

## Capture record

| Field | Value |
|---|---|
| GUI project | [LuminariMUD/duris-client](https://github.com/LuminariMUD/duris-client) |
| Source revision | `00c3a819b175feacb0d0a2d194dff41b7a72469a` |
| Package version | 1.3.3 |
| Mudlet / Qt / Lua | 5.0.1 / 6.10.2 / 5.1.5 |
| OS | Linux x86_64, kernel 7.0.0-38-generic, glibc 2.43 |
| Desktop | Xvfb 2048 × 1200, Openbox, Qt scale 1 |
| Captured window | 1920 × 1080 pixels; native window contents, including Mudlet menu and command input |
| Font environment | `Consolas` resolves to DejaVu Sans Mono Book; locale C.UTF-8 |
| Capture interval | 2026-10-15 10:39:03–10:39:17 UTC |
| Run ID | `20261015T103903Z-1c201131` |
| Profile | Disposable `Duris-Visual`, disconnected throughout |
| Candidate archive SHA-256 | `7a1e400e373939f78a827747044495f9cd6bd66a97d724dc849056f68917f940` |
| Candidate payload SHA-256 | `119a363ad5498fb07cf7098f54d1b2e97d7531050b2852d0ce3b86f0860e3be4` |
| Final result | 29 assertions passed; automated PASS, visual review PASS, no Lua errors, normal shutdown and cleanup confirmed |

The fixture emits GMCP-shaped events and game text through the GUI repository's
test companion. It selects the package's normal tabs and tell window. A local
fixture server supplies the invented zone map. The companion intercepts game
commands and restricts map downloads to its local fixture server; no game
connection is opened. The distributable `src/` files are unchanged.

## Files and intended use

| File | State |
|---|---|
| [overview.png](overview.png) | Three-column layout; zone map, room lists, vitals, group and all-channel chat. |
| [combat-group.png](combat-group.png) | Hurt group member, tank and target condition, negative affect, group chat and a damage count. |
| [chat-equipment.png](chat-equipment.png) | Text-derived equipment list, guild chat and an individual tell window with invented session history. |
| [wilderness.png](wilderness.png) | Wilderness terrain and position marker; character identity, vitals, coins and quest progress. |
| [page-demo.lua](page-demo.lua) | Capture scenario; loaded only in the disposable test companion. |
| [zone.json](zone.json) | Invented map data served by the test companion's map server. |

All images are 1920 × 1080. The four PNGs total approximately 2.57 MiB.
Native text is dense; the eventual page should supply readable explanatory
captions and links to the originals at full size.

| File | SHA-256 |
|---|---|
| overview.png | `7c6841178e0180c6a09220d81f3d989433547cc498c4b45952e1ca932b338d94` |
| combat-group.png | `0d233d576488ebbeb256b100e2757262e0f60259ecfe21e46890a18e2ca8cb05` |
| chat-equipment.png | `0ccce80fc76e9c20f3ad3254804135bfeccb3f0296464b042e87c1ffe0609ead` |
| wilderness.png | `20fb775aa13f1120c0c6fc908d1ce3483563fab4111781acbe058c40bdf8eafe` |
| page-demo.lua | `269dac9d2c872795b2c4bdf2f82ea9971fbdce21b8ed08e95e153249baa08cac` |
| zone.json | `a8691a3ca40e545ce594474efffe307c02cac7f4f5bd6260bc717ba4948c0cdf` |

## Reproduce

Run from the DurisWeb repository root. The GUI repository's
[Linux development guide](https://github.com/LuminariMUD/duris-client/blob/00c3a819b175feacb0d0a2d194dff41b7a72469a/docs/LINUX_DEVELOPMENT.md)
lists the native dependencies. Work in a disposable clone so that the added
scenario and replacement demonstration map do not alter a developer's checkout.

```bash
capture_root=$(mktemp -d /tmp/duris-mudlet-page.XXXXXX)
git clone https://github.com/LuminariMUD/duris-client.git "$capture_root/gui"
git -C "$capture_root/gui" checkout --detach 00c3a819b175feacb0d0a2d194dff41b7a72469a
cp docs/ongoing-projects/assets/mudlet-gui/page-demo.lua "$capture_root/gui/tests/mudlet/fixtures/page-demo.lua"
cp docs/ongoing-projects/assets/mudlet-gui/zone.json "$capture_root/gui/tests/mudlet/fixtures/zone.json"
python3 "$capture_root/gui/scripts/mudlet_test.py" doctor
luac5.1 -p docs/ongoing-projects/assets/mudlet-gui/page-demo.lua
python3 "$capture_root/gui/scripts/mudlet_test.py" run --scenario page-demo --size 1920x1080 --timeout 70 --root "$capture_root/runs"
```

The controller prints a run directory. Inspect `01-overview.png`,
`02-combat-group.png`, `03-chat-equipment.png`, `04-wilderness.png`, the
candidate-only image, the Errors view, and `results.json`. Only then record
the review, replacing the example path and note:

```bash
python3 "$capture_root/gui/scripts/mudlet_test.py" review --run-dir /path/to/printed/run --result PASS --note 'Describe the screenshots actually inspected and the observed results.'
```

The controller runs `python3 build.py --check`, builds the package into the
external run directory with `python3 build.py -o <run>/duris-client.mpackage`,
installs it in an isolated profile, captures the checkpoints, collects error
evidence, and closes its desktop processes. Do not install this fixture in an
ordinary play profile. Chat timestamps and archive timestamps vary between
runs; a fresh capture need not have the same image or ZIP checksum.

## Verification performed

The actual working clone was created with
`git clone --shared /home/staging/gui /tmp/duris-mudlet-page.NFPLOT/gui` at the
revision above. These validation commands were run:

| Command or inspection | Result |
|---|---|
| `python3 /home/staging/gui/scripts/mudlet_test.py doctor` | Required native tools found. |
| `luac5.1 -p docs/ongoing-projects/assets/mudlet-gui/page-demo.lua` | Passed, including after fixture revisions. |
| `python3 scripts/mudlet_test.py run --scenario page-demo --size 1920x1080 --timeout 70 --root /tmp/duris-mudlet-page.NFPLOT/runs` in the disposable GUI clone | Ran twice; both passed automated checks. The first visual review rejected an oversized demonstration wilderness map. The final run uses a smaller invented map and consistent group/tank data. |
| `python3 scripts/mudlet_test.py review --run-dir <first-run> --result FAIL --note <review>` | Recorded the first image set as unsuitable; exit 1 was expected. Those images are not included here. |
| `python3 scripts/mudlet_test.py review --run-dir <final-run> --result PASS --note <review>` | Inspected all four final captures, candidate-only image and native Errors view. Final result PASS. |
| Python standard-library artifact checks | Parsed map JSON; verified graph connectivity, PNG dimensions and SHA-256 against the controller manifest; checked relative documentation links and fixture hashes. |
| `git diff --check` and `git diff --cached --check` | Checked whitespace before commit. |
| `git -C /home/staging/gui status --short` and comparison of disposable/original `src/` | Original GUI checkout and distributable source unchanged. |

Raw run evidence remains outside the website checkout under
`/tmp/duris-mudlet-page.NFPLOT/runs/20261015T103903Z-1c201131-page-demo`.
This location is temporary; the revision, inputs, selected captures, checksums,
and reproduction steps above are the durable record.

Website package formatting, lint, type checks, unit tests, builds, and
`verify:mud-writes` were not run for this documentation-only change. Neither
application package, a database, nor the MUD was modified. The full GUI suite,
live-game behavior, Mudlet 4.19.1 minimum, Windows/macOS, alternate desktop sizes,
and mobile layouts were not tested; this is a screenshot scenario, not a client
release qualification. Website acceptance checks are in the page plan.

## Attribution and release status

Arjinius Client was originally created by Arjinius / Arjin and is maintained
in LuminariMUD/duris-client. The screenshots preserve its existing artwork and
credits. This capture record introduces no new license for that material; see
the client's [license record](https://github.com/LuminariMUD/duris-client/blob/00c3a819b175feacb0d0a2d194dff41b7a72469a/LICENSE.md).

The supplied public download destination is the
[GitHub releases page](https://github.com/LuminariMUD/duris-client/releases).
On the capture date, its latest published release was
[v1.3.0](https://github.com/LuminariMUD/duris-client/releases/tag/v1.3.0), while
these captures use local 1.3.3. Align the downloadable release, copy, and
screenshots before the website page launches.
