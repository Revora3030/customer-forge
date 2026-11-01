#!/usr/bin/env bash
# Lighthouse (mobile, simulated slow 4G, performance only) against the harness.
# Usage: RUNS=5 ./measure.sh  -> prints median FCP/LCP per variant.
set -euo pipefail
LH=${LH:-/workspace/tools/pr2/node_modules/.bin/lighthouse}
RUNS=${RUNS:-5}
OUT=${OUT:-/tmp/pr3-lh}
mkdir -p "$OUT"
for variant in "before|http://127.0.0.1:4528/" "after|http://127.0.0.1:4529/" "after-nopreload|http://127.0.0.1:4529/?nopre=1"; do
  name=${variant%%|*}; url=${variant#*|}
  for i in $(seq 1 "$RUNS"); do
    "$LH" "$url" --quiet --only-categories=performance --output=json --output-path="$OUT/$name-$i.json" \
      --chrome-flags="--headless=new --no-sandbox" >/dev/null 2>&1
  done
done
node -e '
const fs=require("fs");const out=process.argv[1];
const med=(a)=>{a=[...a].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};
for (const name of ["before","after","after-nopreload"]) {
  const runs=fs.readdirSync(out).filter(f=>f.startsWith(name+"-")&&/-\d+\.json$/.test(f)&&!(name==="after"&&f.startsWith("after-nopreload")));
  const r=runs.map(f=>JSON.parse(fs.readFileSync(out+"/"+f))).map(j=>({fcp:j.audits["first-contentful-paint"].numericValue,lcp:j.audits["largest-contentful-paint"].numericValue,score:j.categories.performance.score*100}));
  console.log(name.padEnd(16),"runs",r.length,"FCP",Math.round(med(r.map(x=>x.fcp))),"ms  LCP",Math.round(med(r.map(x=>x.lcp))),"ms  score",med(r.map(x=>x.score)));
}' "$OUT"
