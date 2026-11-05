// JC-12 Tap-to-act: the four actions offered when a district is long-pressed.
// Every draft is an existing AI City draft (CITY_MISSIONS, triageDraft or the
// district mission) and carries GATE, so nothing runs until the owner sends it
// in Jarvis, and nothing sends or spends without an approval card there.
import { CITY_DISTRICTS, GATE, cityCommandDraft, districtFailureSummary, missionsFor, triageDraft, type CitySnapshot, type DistrictId } from "./ai-city";

export type TapActionId = "brief" | "check" | "open" | "ask";
export type TapAction =
  | { id: Exclude<TapActionId, "open">; label: string; hint: string; kind: "draft"; draft: string; source: string }
  | { id: "open"; label: string; hint: string; kind: "link"; to: string; source: "route" };

const gated = (draft: string) => (draft.includes(GATE) ? draft : `${draft} ${GATE}`);

/** Pure mapping from a district to its four tap actions. */
export function tapActions(id: DistrictId, snapshot: CitySnapshot | undefined, now: number): TapAction[] {
  const district = CITY_DISTRICTS.find((d) => d.id === id);
  if (!district) return [];
  const missions = missionsFor(id);
  const brief = missions[0];
  const checkMission = missions.find((m) => /check|^\[AI City · [^\]]+\] Run /i.test(`${m.label} ${m.draft}`) && m !== brief) ?? missions.find((m) => /\bRun\b/.test(m.draft)) ?? missions[missions.length - 1];
  const topFailure = districtFailureSummary(snapshot, id, now)?.groups[0];
  const actions: TapAction[] = [];
  if (brief) actions.push({ id: "brief", label: "Brief me", hint: brief.label, kind: "draft", draft: gated(brief.draft), source: `CITY_MISSIONS.${id}.${brief.id}` });
  if (topFailure) actions.push({ id: "check", label: "Run the check", hint: `Triage: ${topFailure.label}`, kind: "draft", draft: gated(triageDraft(topFailure, now)), source: "triageDraft" });
  else if (checkMission) actions.push({ id: "check", label: "Run the check", hint: checkMission.label, kind: "draft", draft: gated(checkMission.draft), source: `CITY_MISSIONS.${id}.${checkMission.id}` });
  actions.push({ id: "open", label: "Open the page", hint: district.route, kind: "link", to: district.route, source: "route" });
  actions.push({ id: "ask", label: "Ask Jarvis", hint: `Mission for ${district.name}`, kind: "draft", draft: gated(cityCommandDraft(id)), source: "cityCommandDraft" });
  return actions;
}

export const LONG_PRESS_MS = 500;
/** Movement (px) that cancels a long-press so a swipe of the carousel still scrolls. */
export const LONG_PRESS_SLOP = 10;
