#!/usr/bin/env bash
# Print every page URL reachable from the given sitemaps (sitemap indexes are
# followed one level deep per pass, up to 3 levels). Used by links.yml.
set -euo pipefail
queue=("$@")
seen=""
depth=0
while [ "${#queue[@]}" -gt 0 ] && [ "$depth" -lt 3 ]; do
  next=()
  for url in "${queue[@]}"; do
    case " $seen " in *" $url "*) continue ;; esac
    seen="$seen $url"
    body="$(curl --fail --silent --show-error --location --max-time 30 "$url" || true)"
    locs="$(printf '%s' "$body" | grep -o '<loc>[^<]*</loc>' | sed -e 's#<loc>##' -e 's#</loc>##' || true)"
    if printf '%s' "$body" | grep -q '<sitemapindex'; then
      while IFS= read -r loc; do [ -n "$loc" ] && next+=("$loc"); done <<< "$locs"
    else
      printf '%s\n' "$locs" | sed '/^$/d'
    fi
  done
  queue=("${next[@]+"${next[@]}"}")
  depth=$((depth + 1))
done | sort -u
