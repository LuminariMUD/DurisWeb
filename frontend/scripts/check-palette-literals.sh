#!/usr/bin/env bash
# Reject raw Tailwind neutral and cyan palette classes; colors come from the
# eclipse tokens in src/assets/main.css. Files that map MUD color codes to
# classes are game semantics, not theme, and are permanently exempt. Smaller
# game-color tables inside other files sit between `palette-literals: off`
# and `palette-literals: on` comments.
set -euo pipefail

guard_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
guard_frontend_root=$(cd "${guard_script_dir}/.." && pwd)
cd "${guard_frontend_root}"

guard_pattern='(^|[^[:alnum:]_-])([a-z-]+:)*(bg|text|border(-[trblxyse])?|ring(-offset)?|from|to|via|divide|placeholder|outline|fill|stroke|accent|decoration|caret|shadow)-(gray|cyan|zinc|slate|neutral|stone)-[0-9]{2,3}([^[:alnum:]_-]|$)'

guard_exclusions=(
  --glob '!src/utils/ansiParser.ts'
  --glob '!src/components/forum/editor/MudColorExtension.ts'
  --glob '!src/types/trigger.ts'
  --glob '!src/utils/__tests__/ansiParser.spec.ts'
)

guard_files=$(rg -l --pcre2 "${guard_pattern}" src index.html \
  --glob '*.{vue,ts,css,html}' \
  "${guard_exclusions[@]}" || true)

guard_matches=''
if [ -n "${guard_files}" ]; then
  # shellcheck disable=SC2086
  guard_matches=$(GUARD_PATTERN="${guard_pattern}" perl -ne '
    BEGIN { $pattern = qr/$ENV{GUARD_PATTERN}/; $off = 0 }
    $off = 1 if /palette-literals: off/;
    print "$ARGV:$.:$_" if !$off && /$pattern/;
    $off = 0 if /palette-literals: on/;
    if (eof) { close ARGV; $off = 0 }
  ' ${guard_files})
fi

if [ -n "${guard_matches}" ]; then
  printf 'Raw gray/cyan/zinc/slate palette classes must use eclipse tokens (src/assets/main.css):\n%s\n' \
    "${guard_matches}" >&2
  exit 1
fi

printf 'Palette literal check passed.\n'
