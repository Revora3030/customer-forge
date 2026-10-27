import { createFileRoute } from "@tanstack/react-router";
import { AiCity } from "@/components/admin/city/AiCity";

export const Route = createFileRoute("/_authenticated/admin/city")({
  head: () => ({ meta: [
    { title: "AI City — Revora workforce operations" },
    { name: "description", content: "Founder-controlled workforce operations, department queues and recorded Lovable AI evidence." },
    { property: "og:title", content: "AI City — Revora workforce operations" },
    { property: "og:description", content: "Seven operational districts connected to real work, model evidence and approval-gated missions." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AiCity,
});