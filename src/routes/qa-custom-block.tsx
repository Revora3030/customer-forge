/** Temporary QA harness for the custom interactive blocks. Removed after the check. */
import { createFileRoute } from "@tanstack/react-router";
import { CustomBlock } from "@/components/site/CustomBlock";
import { parseCustomBlock } from "@/lib/builder/custom-block";

export const Route = createFileRoute("/qa-custom-block")({
  head: () => ({
    meta: [
      { title: "Custom block QA" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const specs = [
  {
    type: "calculator",
    title: "Detailing estimate",
    note: "Guide price only — confirmed after we see the vehicle.",
    resultLabel: "Your estimate",
    base: 80,
    fields: [
      { id: "size", label: "Vehicle size", kind: "select", options: [{ label: "Car", value: 0 }, { label: "SUV", value: 40 }] },
      { id: "seats", label: "Extra seats", kind: "number", rate: 15, min: 0, max: 5, step: 1 },
    ],
  },
  {
    type: "quiz",
    title: "Which service fits?",
    questions: [
      { prompt: "What is happening?", options: [{ label: "Something broke", outcome: "repair" }, { label: "Starting fresh", outcome: "install" }] },
    ],
    outcomes: [
      { id: "repair", label: "Repair visit", body: "We come out and fix what is there." },
      { id: "install", label: "New installation", body: "A full fit from scratch." },
    ],
  },
  { type: "comparison", title: "Plans", columns: ["Standard", "Premium"], rows: [{ label: "Turnaround", cells: ["3 days", "24 hours"] }] },
  { type: "steps", title: "How it works", items: [{ label: "Book", body: "Pick a slot." }, { label: "We visit", body: "On the day." }] },
  { type: "tabs", title: "Details", items: [{ label: "Coverage", body: "Local area." }, { label: "Payment", body: "Card or transfer." }] },
  { type: "metrics", title: "By the numbers", items: [{ label: "Years", value: "12" }, { label: "Jobs", value: "800+" }] },
];

function Page() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      {specs.map((raw, index) => {
        const parsed = parseCustomBlock(raw);
        if (!parsed.ok) return <p key={index}>blocked: {parsed.reason}</p>;
        return (
          <section key={index} className="border-b border-border py-8">
            <CustomBlock spec={parsed.spec} />
          </section>
        );
      })}
    </main>
  );
}
