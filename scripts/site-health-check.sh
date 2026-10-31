#!/usr/bin/env bash
# site-health-check.sh - read-only daily health check used by .github/workflows/site-health.yml.
# Derived from the client-success site-health.sh: same thresholds, trimmed to what CI needs.
# For every URL: HTTP status (final, after redirects), average response time over 3 GETs.
# For every distinct host: SSL days left (openssl).
# FAIL: any status that is not 2xx (404 and 403 included), no response, avg time > 3s, SSL < 7 days.
# WARN: avg time > 1.5s, SSL < 21 days.   Exit 0 = no FAIL, 1 = at least one FAIL.
# Output: a Markdown table on stdout; also written to $REPORT_FILE (default site-health-report.md).
# Safety: GET requests only; nothing is submitted.
# Usage:  scripts/site-health-check.sh [url ...]   (defaults to the list below)
set -u

DEFAULT_URLS=(
  "https://revoragrowthsystems.com/"
  "https://revoragrowthsystems.com/pricing"
  "https://revoragrowthsystems.com/get-started"
  "https://revoragrowthsystems.com/login"
  "https://revoragrowthsystems.com/s/elite-mobile-detailing"
  # Published client sites: the repo exposes no public, secret-free list of them
  # (the old /sitemaps/sites.xml index was removed; /sitemap.xml lists platform pages only).
  # Add one full URL per line below as sites go live, for example:
  # "https://example-client-domain.com/"
)
if [ "$#" -gt 0 ]; then URLS=("$@"); else URLS=("${DEFAULT_URLS[@]}"); fi

REPORT_FILE="${REPORT_FILE:-site-health-report.md}"
UA="RevoraSiteHealth/1.0 (+read-only check; github actions)"
FAILS=0; WARNS=0
ROWS=""

row() { # level check detail
  ROWS+="| $1 | $2 | $3 |"$'\n'
  case "$1" in FAIL) FAILS=$((FAILS+1)) ;; WARN) WARNS=$((WARNS+1)) ;; esac
}

http_check() { # url
  local url="$1" code t times avg level
  code="$(curl -s -L --max-redirs 5 -m 25 -A "$UA" -o /dev/null -w '%{http_code}' "$url")"
  [ "$code" = "000" ] && code="$(curl -s -L --max-redirs 5 -m 25 -A "$UA" -o /dev/null -w '%{http_code}' "$url")" # one retry on a network blip
  case "$code" in
    2??) row PASS "$url status" "HTTP $code" ;;
    000) row FAIL "$url status" "no response (DNS, TLS or timeout)" ;;
    404|403) row FAIL "$url status" "HTTP $code (treated as failure)" ;;
    *) row FAIL "$url status" "HTTP $code" ;;
  esac
  [ "$code" = "000" ] && return 0
  times=""
  for _ in 1 2 3; do
    t="$(curl -s -L --max-redirs 5 -m 25 -A "$UA" -o /dev/null -w '%{time_total}' "$url")"
    times+="$t "
  done
  avg="$(printf '%s\n' $times | awk '{s+=$1; if($1>m)m=$1} END{printf "%.2f %.2f", s/NR, m}')"
  set -- $avg
  level="$(awk -v a="$1" 'BEGIN{print (a>3)?"FAIL":(a>1.5)?"WARN":"PASS"}')"
  row "$level" "$url response time" "avg ${1}s, worst ${2}s over 3 requests (PASS<1.5s, WARN<3s)"
}

ssl_check() { # host
  local host="$1" end epoch days
  end="$(echo | timeout 15 openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [ -z "$end" ]; then row FAIL "$host ssl" "could not read certificate"; return 0; fi
  epoch="$(date -u -d "$end" +%s 2>/dev/null)"
  days=$(( (epoch - $(date -u +%s)) / 86400 ))
  if   [ "$days" -lt 7 ];  then row FAIL "$host ssl" "$days days left (expires $end)"
  elif [ "$days" -lt 21 ]; then row WARN "$host ssl" "$days days left (expires $end)"
  else row PASS "$host ssl" "$days days left (expires $end)"; fi
}

for u in "${URLS[@]}"; do http_check "$u"; done
for h in $(for u in "${URLS[@]}"; do u="${u#https://}"; u="${u#http://}"; echo "${u%%/*}"; done | sort -u); do ssl_check "$h"; done

{
  echo "### Site health $(date -u '+%Y-%m-%d %H:%M UTC'): $FAILS FAIL, $WARNS WARN"
  echo
  echo "| Result | Check | Detail |"
  echo "| --- | --- | --- |"
  printf '%s' "$ROWS"
} | tee "$REPORT_FILE"

[ "$FAILS" -gt 0 ] && exit 1 || exit 0
