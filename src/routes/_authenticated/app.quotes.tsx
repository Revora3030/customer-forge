import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { LoadingRows, MetricCard, PageHead, Panel, SectionHeading } from "@/components/app/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuoteBuilder, useQuoteBuilderMutations, useQuoteRequests } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { currency, relative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/quotes")({
  head: () => ({
    meta: [
      { title: "Quote calculator — Revora" },
      {
        name: "description",
        content: "Build the instant estimate that turns website visitors into priced leads.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuotesPage,
});

type OptionDraft = {
  id?: string;
  question_id: string;
  label: string;
  price_modifier: number;
  modifier_type: string;
  sort_order: number;
};

type QuestionDraft = {
  id?: string;
  form_id: string;
  label: string;
  helper_text: string;
  sort_order: number;
};

type AddonDraft = {
  id?: string;
  form_id: string;
  label: string;
  description: string;
  price: number;
  sort_order: number;
};

function QuotesPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const slug = ws?.workspace?.organization?.slug;
  const { data: builder, isLoading } = useQuoteBuilder(orgId);
  const { data: requests } = useQuoteRequests(orgId);
  const m = useQuoteBuilderMutations(orgId);

  const [question, setQuestion] = useState<QuestionDraft | null>(null);
  const [option, setOption] = useState<OptionDraft | null>(null);
  const [addon, setAddon] = useState<AddonDraft | null>(null);

  const form = builder?.form ?? null;
  const questions = useMemo(() => builder?.questions ?? [], [builder?.questions]);
  const addons = useMemo(() => builder?.addons ?? [], [builder?.addons]);

  const sample = useMemo(() => {
    if (!form) return { min: 0, max: 0 };
    let total = Number(form.base_price ?? 0);
    for (const q of questions) {
      const top = [...q.options].sort(
        (a, b) => Number(b.price_modifier) - Number(a.price_modifier),
      )[0];
      if (!top) continue;
      total =
        top.modifier_type === "multiply"
          ? total * Number(top.price_modifier)
          : total + Number(top.price_modifier);
    }
    const withAddons = total + addons.reduce((s, a) => s + Number(a.price), 0);
    return {
      min: Math.max(Number(form.min_price ?? 0), Math.round(total * 0.9)),
      max: Math.round(withAddons * 1.15),
    };
  }, [form, questions, addons]);

  const avgEstimate =
    (requests ?? []).length > 0
      ? (requests ?? []).reduce(
          (s, r) => s + (Number(r.estimate_min) + Number(r.estimate_max)) / 2,
          0,
        ) / (requests ?? []).length
      : 0;

  if (isLoading) return <LoadingRows rows={5} />;

  return (
    <div className="product-page">
      <PageHead
        eyebrow="Instant estimates"
        title="Quote calculator"
        purpose="Set your prices so visitors get an estimate straight away."
      >
        {slug ? (
          <Button asChild variant="outline">
            <Link to="/s/$slug" params={{ slug }} target="_blank">
              View on my website
            </Link>
          </Button>
        ) : null}
      </PageHead>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Quote requests" value={String((requests ?? []).length)} tone="signal" />
        <MetricCard label="Average estimate" value={currency(avgEstimate)} />
        <MetricCard
          label="Current range shown"
          value={`${currency(sample.min)}–${currency(sample.max)}`}
          hint="top options plus add-ons"
          tone="attention"
        />
      </div>

      {/* Form settings */}
      <Panel className="p-5">
        <SectionHeading
          eyebrow="Pricing rules"
          title={form ? form.name : "Create your calculator"}
        />
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            m.saveForm.mutate({
              ...(form ? { id: form.id } : {}),
              name: String(data.get("name") ?? "Instant estimate"),
              base_price: Number(data.get("base") ?? 0),
              min_price: Number(data.get("min") ?? 0),
              max_price: Number(data.get("max") ?? 0),
              is_active: form ? form.is_active : true,
            });
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="f-name">Calculator name</Label>
            <Input
              id="f-name"
              name="name"
              defaultValue={form?.name ?? "Instant estimate"}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-base">Base price ($)</Label>
            <Input
              id="f-base"
              name="base"
              inputMode="decimal"
              defaultValue={String(form?.base_price ?? 100)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-min">Floor price ($)</Label>
            <Input
              id="f-min"
              name="min"
              inputMode="decimal"
              defaultValue={String(form?.min_price ?? 75)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-max">Ceiling price ($)</Label>
            <Input
              id="f-max"
              name="max"
              inputMode="decimal"
              defaultValue={String(form?.max_price ?? 900)}
            />
          </div>
          <div className="flex items-end gap-3 sm:col-span-2">
            <Button type="submit" variant="signal" disabled={m.saveForm.isPending}>
              Save pricing
            </Button>
            {form ? (
              <label className="flex items-center gap-2 text-[13px]">
                <Switch
                  aria-label="Show this quote form on my website"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    m.saveForm.mutate({
                      id: form.id,
                      name: form.name,
                      base_price: Number(form.base_price),
                      min_price: Number(form.min_price),
                      max_price: Number(form.max_price),
                      is_active: checked,
                    })
                  }
                />
                Live on my website
              </label>
            ) : null}
          </div>
        </form>
      </Panel>

      {/* Questions */}
      {form ? (
        <Panel className="p-5">
          <SectionHeading
            eyebrow="Questions"
            title="What visitors are asked"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setQuestion({
                    form_id: form.id,
                    label: "",
                    helper_text: "",
                    sort_order: questions.length,
                  })
                }
              >
                <Plus className="size-4" /> Add question
              </Button>
            }
          />
          <div className="mt-4 space-y-3">
            {questions.map((q) => (
              <div key={q.id} className="panel-inset p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{q.label}</p>
                    {q.helper_text ? (
                      <p className="text-[12px] text-muted-foreground">{q.helper_text}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setQuestion({
                          id: q.id,
                          form_id: form.id,
                          label: q.label,
                          helper_text: q.helper_text ?? "",
                          sort_order: q.sort_order,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${q.label}`}
                      onClick={() => m.deleteQuestion.mutate(q.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {q.options.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-[13px]">{o.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="tnum text-[12px] text-primary">
                          {o.modifier_type === "multiply"
                            ? `× ${Number(o.price_modifier)}`
                            : `${Number(o.price_modifier) >= 0 ? "+" : "−"} ${currency(Math.abs(Number(o.price_modifier)))}`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setOption({
                              id: o.id,
                              question_id: q.id,
                              label: o.label,
                              price_modifier: Number(o.price_modifier),
                              modifier_type: o.modifier_type,
                              sort_order: o.sort_order,
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${o.label}`}
                          onClick={() => m.deleteOption.mutate(o.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    setOption({
                      question_id: q.id,
                      label: "",
                      price_modifier: 0,
                      modifier_type: "add",
                      sort_order: q.options.length,
                    })
                  }
                >
                  <Plus className="size-4" /> Add option
                </Button>
              </div>
            ))}
            {questions.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                Add your first question — vehicle size, property size, number of rooms, whatever
                drives your price.
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {/* Add-ons */}
      {form ? (
        <Panel className="p-5">
          <SectionHeading
            eyebrow="Add-ons"
            title="Optional extras"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAddon({
                    form_id: form.id,
                    label: "",
                    description: "",
                    price: 0,
                    sort_order: addons.length,
                  })
                }
              >
                <Plus className="size-4" /> Add extra
              </Button>
            }
          />
          <ul className="mt-4 divide-y divide-border">
            {addons.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{a.label}</p>
                  {a.description ? (
                    <p className="text-[12px] text-muted-foreground">{a.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="tnum text-[13px] text-primary">
                    +{currency(Number(a.price))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAddon({
                        id: a.id,
                        form_id: form.id,
                        label: a.label,
                        description: a.description ?? "",
                        price: Number(a.price),
                        sort_order: a.sort_order,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${a.label}`}
                    onClick={() => m.deleteAddon.mutate(a.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
            {addons.length === 0 ? (
              <li className="py-4 text-[13px] text-muted-foreground">
                Add-ons let visitors raise their own price — interior shampoo, gutter clearing,
                extra rooms.
              </li>
            ) : null}
          </ul>
        </Panel>
      ) : null}

      {/* Requests */}
      <Panel className="p-5">
        <SectionHeading eyebrow="Results" title="Quote requests" />
        <ul className="mt-4 divide-y divide-border">
          {(requests ?? []).map((request) => (
            <li key={request.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] font-medium">
                  {(request.leads as { name?: string } | null)?.name ?? "Website visitor"}
                </p>
                <p className="tnum text-[13px] text-primary">
                  {currency(Number(request.estimate_min))} –{" "}
                  {currency(Number(request.estimate_max))}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {relative(request.created_at)}
                {Array.isArray(request.answers)
                  ? ` · ${(request.answers as { answer?: string }[])
                      .map((a) => a.answer)
                      .filter(Boolean)
                      .join(", ")}`
                  : ""}
              </p>
            </li>
          ))}
          {(requests ?? []).length === 0 ? (
            <li className="py-6 text-center text-[13px] text-muted-foreground">
              Every completed calculator creates a priced lead in your pipeline.
            </li>
          ) : null}
        </ul>
      </Panel>

      {/* Question editor */}
      <Dialog open={!!question} onOpenChange={(open) => !open && setQuestion(null)}>
        <DialogContent>
          {question ? (
            <>
              <DialogHeader>
                <DialogTitle>{question.id ? "Edit question" : "Add question"}</DialogTitle>
                <DialogDescription>
                  Keep it to one decision a visitor can answer fast.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.saveQuestion.mutate(
                    {
                      ...(question.id ? { id: question.id } : {}),
                      form_id: question.form_id,
                      label: question.label,
                      helper_text: question.helper_text || null,
                      sort_order: question.sort_order,
                    },
                    { onSuccess: () => setQuestion(null) },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="q-label">Question</Label>
                  <Input
                    id="q-label"
                    required
                    value={question.label}
                    onChange={(e) => setQuestion({ ...question, label: e.target.value })}
                    placeholder="What size is your vehicle?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-helper">Helper text</Label>
                  <Textarea
                    id="q-helper"
                    rows={2}
                    value={question.helper_text}
                    onChange={(e) => setQuestion({ ...question, helper_text: e.target.value })}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={m.saveQuestion.isPending}>
                    Save question
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Option editor */}
      <Dialog open={!!option} onOpenChange={(open) => !open && setOption(null)}>
        <DialogContent>
          {option ? (
            <>
              <DialogHeader>
                <DialogTitle>{option.id ? "Edit option" : "Add option"}</DialogTitle>
                <DialogDescription>
                  Add a fixed amount to the running total, or multiply it.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.saveOption.mutate(
                    {
                      ...(option.id ? { id: option.id } : {}),
                      question_id: option.question_id,
                      label: option.label,
                      price_modifier: option.price_modifier,
                      modifier_type: option.modifier_type,
                      sort_order: option.sort_order,
                    },
                    { onSuccess: () => setOption(null) },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="o-label">Option</Label>
                  <Input
                    id="o-label"
                    required
                    value={option.label}
                    onChange={(e) => setOption({ ...option, label: e.target.value })}
                    placeholder="Large SUV / truck"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="o-type">Price effect</Label>
                    <select
                      id="o-type"
                      value={option.modifier_type}
                      onChange={(e) => setOption({ ...option, modifier_type: e.target.value })}
                      className="h-10 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="add">Add / subtract dollars</option>
                      <option value="multiply">Multiply the total</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="o-mod">
                      {option.modifier_type === "multiply" ? "Multiplier" : "Amount ($)"}
                    </Label>
                    <Input
                      id="o-mod"
                      inputMode="decimal"
                      value={String(option.price_modifier)}
                      onChange={(e) =>
                        setOption({ ...option, price_modifier: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={m.saveOption.isPending}>
                    Save option
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Add-on editor */}
      <Dialog open={!!addon} onOpenChange={(open) => !open && setAddon(null)}>
        <DialogContent>
          {addon ? (
            <>
              <DialogHeader>
                <DialogTitle>{addon.id ? "Edit add-on" : "Add extra"}</DialogTitle>
                <DialogDescription>
                  Visitors can tick these to raise their estimate.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.saveAddon.mutate(
                    {
                      ...(addon.id ? { id: addon.id } : {}),
                      form_id: addon.form_id,
                      label: addon.label,
                      description: addon.description || null,
                      price: addon.price,
                      sort_order: addon.sort_order,
                    },
                    { onSuccess: () => setAddon(null) },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="ad-label">Add-on</Label>
                  <Input
                    id="ad-label"
                    required
                    value={addon.label}
                    onChange={(e) => setAddon({ ...addon, label: e.target.value })}
                    placeholder="Interior shampoo"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-price">Price ($)</Label>
                    <Input
                      id="ad-price"
                      inputMode="decimal"
                      value={String(addon.price)}
                      onChange={(e) => setAddon({ ...addon, price: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ad-desc">Description</Label>
                    <Input
                      id="ad-desc"
                      value={addon.description}
                      onChange={(e) => setAddon({ ...addon, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={m.saveAddon.isPending}>
                    Save add-on
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
