#!/usr/bin/env bash
# Reject raw Tailwind neutral and cyan palette classes; colors come from the
# eclipse tokens in src/assets/main.css. Files that map MUD color codes to
# classes are game semantics, not theme, and are permanently exempt.
set -euo pipefail

guard_script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
guard_frontend_root=$(cd "${guard_script_dir}/.." && pwd)
cd "${guard_frontend_root}"

guard_allowlist="${guard_script_dir}/palette-literals-allowlist.txt"
guard_pattern='(^|[^[:alnum:]_-])([a-z-]+:)*(bg|text|border(-[trblxyse])?|ring(-offset)?|from|to|via|divide|placeholder|outline|fill|stroke|accent|decoration|caret|shadow)-(gray|cyan|zinc|slate|neutral|stone)-[0-9]{2,3}([^[:alnum:]_-]|$)'

guard_exclusions=(
  --glob '!src/utils/ansiParser.ts'
  --glob '!src/components/forum/editor/MudColorExtension.ts'
  --glob '!src/types/trigger.ts'
)

if [ -f "${guard_allowlist}" ]; then
  while IFS= read -r guard_entry; do
    case "${guard_entry}" in
      '' | '#'*) continue ;;
    esac
    guard_exclusions+=(--glob "!${guard_entry}")
  done <"${guard_allowlist}"
fi

guard_matches=$(rg -n --pcre2 "${guard_pattern}" src index.html \
  --glob '*.{vue,ts,css,html}' \
  "${guard_exclusions[@]}" || true)

if [ -n "${guard_matches}" ]; then
  printf 'Raw gray/cyan/zinc/slate palette classes must use eclipse tokens (src/assets/main.css):\n%s\n' \
    "${guard_matches}" >&2
  exit 1
fi

printf 'Palette literal check passed.\n'
