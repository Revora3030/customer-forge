// Contract test for scripts/a11y-cls-gate.lib.mjs (no browser needed).
import { classifyViolations, clsFromShifts, judgeRoute, parseRoutes } from "./a11y-cls-gate.lib.mjs";

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) failed++; };

check("no shifts is CLS 0", clsFromShifts([]) === 0);
check("shifts within one session window add up", clsFromShifts([{ value: 0.05, startTime: 100 }, { value: 0.04, startTime: 900 }]) === 0.09);
check("a gap of 1 s or more starts a new window; the worst window wins",
  clsFromShifts([{ value: 0.05, startTime: 100 }, { value: 0.06, startTime: 1200 }, { value: 0.02, startTime: 1500 }]) === 0.08);
check("a window is capped at 5 s",
  clsFromShifts(Array.from({ length: 12 }, (_, i) => ({ value: 0.01, startTime: i * 900 }))) === 0.06);
check("shifts right after user input are ignored", clsFromShifts([{ value: 0.5, startTime: 10, hadRecentInput: true }]) === 0);
check("entry order does not matter", clsFromShifts([{ value: 0.04, startTime: 900 }, { value: 0.05, startTime: 100 }]) === 0.09);

const v = (id, impact) => ({ id, impact, help: id, nodes: 1 });
const c = classifyViolations("/", [v("color-contrast", "serious"), v("region", "moderate"), v("label", "critical")], new Set(["/:label"]));
check("serious/critical violations block unless allowlisted", JSON.stringify(c.blocking.map((x) => x.id)) === '["color-contrast"]');
check("moderate and allowlisted violations are reported, not blocking", c.reported.length === 2);
check("a wildcard allowlist entry applies to every route", classifyViolations("/x", [v("label", "critical")], new Set(["*:label"])).blocking.length === 0);

check("CLS over budget fails", judgeRoute({ route: "/", cls: 0.15, violations: [] }).ok === false);
check("CLS at budget passes", judgeRoute({ route: "/", cls: 0.1, violations: [] }).ok === true);
check("a load error fails", judgeRoute({ route: "/", cls: null, violations: [], error: "HTTP 500" }).ok === false);
check("a blocking violation fails with a readable reason",
  judgeRoute({ route: "/", cls: 0, violations: [v("image-alt", "critical")] }).reasons[0].startsWith("axe critical image-alt"));

check("route list parses and de-duplicates", JSON.stringify(parseRoutes(" /, /pricing,/,nope", ["/d"])) === '["/","/pricing"]');
check("empty route list falls back", JSON.stringify(parseRoutes("", ["/d"])) === '["/d"]');
process.exit(failed ? 1 : 0);
