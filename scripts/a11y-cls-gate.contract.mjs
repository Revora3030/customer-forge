// Contract test for scripts/a11y-cls-gate.lib.mjs (no browser needed).
import { readFileSync } from "node:fs";
import { aceKind, classifyViolations, clsFromShifts, judgeRoute, parseRoutes, parseWidths, summarizeAceResults } from "./a11y-cls-gate.lib.mjs";

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

check("only a definite failure of a required rule is a violation", aceKind(["VIOLATION", "FAIL"]) === "violation");
check("potential / manual results are reported, not blocking",
  aceKind(["VIOLATION", "POTENTIAL"]) === "potential" && aceKind(["VIOLATION", "MANUAL"]) === "potential");
check("recommendation-level failures are reported, not blocking", aceKind(["RECOMMENDATION", "FAIL"]) === "recommendation");
check("passes and information are dropped", aceKind(["VIOLATION", "PASS"]) === null && aceKind(["INFORMATION", "PASS"]) === null && aceKind(undefined) === null);

const raw = [
  { ruleId: "img_alt_valid", value: ["VIOLATION", "FAIL"], message: "Images need alt", path: { dom: "/html[1]/a" } },
  { ruleId: "img_alt_valid", value: ["VIOLATION", "FAIL"], message: "Images need alt", path: { dom: "/html[1]/b" } },
  { ruleId: "img_alt_valid", value: ["VIOLATION", "PASS"], message: "ok", path: { dom: "/html[1]/c" } },
  { ruleId: "style_color_misuse", value: ["VIOLATION", "POTENTIAL"], message: "check", path: { dom: "/html[1]/d" } },
];
const sum = summarizeAceResults(raw);
check("engine results group per rule and kind, counting elements and skipping passes",
  sum.length === 2 && sum.find((x) => x.id === "img_alt_valid").nodes === 2 && sum.find((x) => x.id === "img_alt_valid").targets.length === 2);

const v = (id, kind) => ({ id, kind, help: id, nodes: 1 });
const c = classifyViolations("/", [v("text_contrast_sufficient", "violation"), v("style_color_misuse", "potential"), v("img_alt_valid", "violation")], new Set(["/:img_alt_valid"]));
check("definite violations block unless allowlisted", JSON.stringify(c.blocking.map((x) => x.id)) === '["text_contrast_sufficient"]');
check("potential and allowlisted findings are reported, not blocking", c.reported.length === 2);
check("a wildcard allowlist entry applies to every route", classifyViolations("/x", [v("img_alt_valid", "violation")], new Set(["*:img_alt_valid"])).blocking.length === 0);
check("a width-scoped allowlist entry applies only at that width",
  classifyViolations("/x", [v("r", "violation")], new Set(["/x@320:r"]), 320).blocking.length === 0 &&
  classifyViolations("/x", [v("r", "violation")], new Set(["/x@320:r"]), 1440).blocking.length === 1);

check("CLS over budget fails", judgeRoute({ route: "/", cls: 0.15, violations: [] }).ok === false);
check("CLS at budget passes", judgeRoute({ route: "/", cls: 0.1, violations: [] }).ok === true);
check("a load error fails", judgeRoute({ route: "/", cls: null, violations: [], error: "HTTP 500" }).ok === false);
check("a blocking violation fails with a readable reason",
  judgeRoute({ route: "/", cls: 0, violations: [v("img_alt_valid", "violation")] }).reasons[0].startsWith("a11y violation img_alt_valid"));

check("route list parses and de-duplicates", JSON.stringify(parseRoutes(" /, /pricing,/,nope", ["/d"])) === '["/","/pricing"]');
check("empty route list falls back", JSON.stringify(parseRoutes("", ["/d"])) === '["/d"]');
check("widths parse, de-duplicate and fall back to 320 + 1440",
  JSON.stringify(parseWidths("320, 1440,320,abc,10")) === "[320,1440]" && JSON.stringify(parseWidths("")) === "[320,1440]");

const allowlist = JSON.parse(readFileSync(new URL("./a11y-cls-gate.allowlist.json", import.meta.url), "utf8"));
check("every allowlist entry has a well-formed id and a reason",
  allowlist.accepted.every((e) => /^(\*|\/[^:@]*(@\d+)?):[a-z0-9_]+$/.test(e.id) && typeof e.reason === "string" && e.reason.length > 20));
check("the allowlist uses engine rule ids, not axe ids", allowlist.accepted.every((e) => !/:[a-z]+-[a-z-]+$/.test(e.id)));
process.exit(failed ? 1 : 0);
