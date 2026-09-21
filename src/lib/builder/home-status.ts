/**
 * The builder home, answered as four plain questions.
 *
 * A brand-new owner opening the builder should immediately read:
 *   1. What am I building?
 *   2. What am I changing right now?
 *   3. What needs attention?
 *   4. What is ready?
 *
 * Pure function over facts the builder already has — no fetching, no policy.
 * It never claims something is live or ready without the evidence being passed
 * in, and it never invents business facts.
 */
export type HomeTone = "signal" | "attention" | "neutral" | "info";

export type HomeAnswer = {
  key: "building" | "changing" | "attention" | "ready";
  question: string;
  /** The short answer, in the owner's words. */
  answer: string;
  /** One line of supporting detail, or null when there is nothing honest to add. */
  detail: string | null;
  tone: HomeTone;
  /** Where to go next, when there is one obvious next move. */
  action: { label: string; target: string } | null;
};

export type HomeFacts = {
  businessName: string | null;
  industry: string | null;
  pagesCount: number;
  visibleSectionsCount: number;
  publishState: string | null;
  /** True while a request is queued or running. */
  working: boolean;
  /** The request currently being worked on, if any. */
  currentRequest: string | null;
  /** Requests still waiting behind the current one. */
  queuedCount: number;
  /** Things that block going live. */
  blockingCount: number;
  /** The first blocking item, in the owner's words. */
  topBlocking: string | null;
  /** Improvements that do not block going live. */
  improvementCount: number;
  /** The pre-publish score out of 100, when a real check has run. */
  score: number | null;
  /** True only when fresh browser measurements graded the site. */
  measured: boolean;
};

const trim = (value: string, max = 90) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

export function builderHomeStatus(facts: HomeFacts): HomeAnswer[] {
  const building: HomeAnswer = facts.businessName
    ? {
        key: "building",
        question: "What are you building?",
        answer: facts.industry
          ? `${facts.businessName} · ${facts.industry}`
          : `${facts.businessName} website`,
        detail:
          facts.pagesCount > 0
            ? `${facts.pagesCount} ${facts.pagesCount === 1 ? "page" : "pages"}, ${facts.visibleSectionsCount} visible ${
                facts.visibleSectionsCount === 1 ? "section" : "sections"
              }`
            : "Nothing built yet — describe your business to start.",
        tone: facts.pagesCount > 0 ? "signal" : "info",
        action:
          facts.pagesCount > 0 ? { label: "Open pages", target: "pages" } : null,
      }
    : {
        key: "building",
        question: "What are you building?",
        answer: "Your business website",
        detail: "Add your business name so every page can use it.",
        tone: "info",
        action: { label: "Add your details", target: "setup" },
      };

  const changing: HomeAnswer = facts.working
    ? {
        key: "changing",
        question: "What are you changing?",
        answer: facts.currentRequest ? trim(facts.currentRequest) : "Working on your request",
        detail:
          facts.queuedCount > 0
            ? `${facts.queuedCount} more ${facts.queuedCount === 1 ? "request" : "requests"} waiting`
            : "You can keep working while this finishes.",
        tone: "signal",
        action: null,
      }
    : {
        key: "changing",
        question: "What are you changing?",
        answer: "Nothing right now",
        detail: "Ask Revora for a change, or edit any part of the page yourself.",
        tone: "neutral",
        action: { label: "Ask Revora", target: "chat" },
      };

  const attention: HomeAnswer =
    facts.blockingCount > 0
      ? {
          key: "attention",
          question: "What needs attention?",
          answer:
            facts.blockingCount === 1
              ? "1 thing to fix before going live"
              : `${facts.blockingCount} things to fix before going live`,
          detail: facts.topBlocking ? trim(facts.topBlocking) : null,
          tone: "attention",
          action: { label: "Fix these", target: "qa" },
        }
      : facts.improvementCount > 0
        ? {
            key: "attention",
            question: "What needs attention?",
            answer: "Nothing blocking",
            detail: `${facts.improvementCount} optional ${
              facts.improvementCount === 1 ? "improvement" : "improvements"
            } suggested.`,
            tone: "info",
            action: { label: "See suggestions", target: "qa" },
          }
        : {
            key: "attention",
            question: "What needs attention?",
            answer: "Nothing right now",
            detail: null,
            tone: "neutral",
            action: null,
          };

  const published = facts.publishState === "published";
  const ready: HomeAnswer = published
    ? {
        key: "ready",
        question: "What is ready?",
        answer: "Your site is live",
        detail: facts.measured
          ? `Checked on real screen sizes${facts.score === null ? "" : ` · ${facts.score}/100`}`
          : "Run the screen-size check to confirm how it looks to visitors.",
        tone: "signal",
        action: facts.measured ? null : { label: "Run the check", target: "qa" },
      }
    : facts.pagesCount === 0
      ? {
          key: "ready",
          question: "What is ready?",
          answer: "Not started yet",
          detail: null,
          tone: "neutral",
          action: null,
        }
      : facts.blockingCount > 0
        ? {
            key: "ready",
            question: "What is ready?",
            answer: "Not ready to go live",
            detail: "Clear the items above first.",
            tone: "attention",
            action: { label: "Open checks", target: "qa" },
          }
        : facts.measured
          ? {
              key: "ready",
              question: "What is ready?",
              answer: "Ready to go live",
              detail:
                facts.score === null
                  ? "Checked on real screen sizes."
                  : `Checked on real screen sizes · ${facts.score}/100`,
              tone: "signal",
              action: { label: "Go live", target: "publish" },
            }
          : {
              key: "ready",
              question: "What is ready?",
              answer: "Nearly ready",
              detail: "Run the screen-size check, then you can go live.",
              tone: "info",
              action: { label: "Run the check", target: "qa" },
            };

  return [building, changing, attention, ready];
}
