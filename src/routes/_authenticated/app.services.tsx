import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  EmptyState,
  LoadingRows,
  PageHead,
  Panel,
  Pill,
  SectionHeading,
} from "@/components/app/Bits";
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
import { useDeleteService, useQuoteRequests, useSaveService, useServices } from "@/lib/queries";
import { useWorkspace } from "@/lib/use-tenant";
import { currency, relative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({
    meta: [
      { title: "Services & Quotes — Revora" },
      {
        name: "description",
        content: "Manage your service menu and review incoming quote requests.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ServicesPage,
});

type Editing = {
  id?: string;
  name: string;
  description: string;
  category: string;
  price: string;
  starting_price: string;
  duration_minutes: string;
  bookable: boolean;
  featured: boolean;
  is_active: boolean;
};

const blank: Editing = {
  name: "",
  description: "",
  category: "",
  price: "",
  starting_price: "",
  duration_minutes: "60",
  bookable: true,
  featured: false,
  is_active: true,
};

function ServicesPage() {
  const { data: ws } = useWorkspace();
  const orgId = ws?.workspace?.organizationId;
  const { data: services, isLoading } = useServices(orgId);
  const { data: quotes } = useQuoteRequests(orgId);
  const saveService = useSaveService(orgId);
  const deleteService = useDeleteService(orgId);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (isLoading) return <LoadingRows rows={5} />;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Offer"
        title="Services & Quotes"
        purpose="What you sell, your prices, and the estimates people ask for."
      >
        <Button variant="signal" onClick={() => setEditing({ ...blank })}>
          <Plus className="size-4" /> Add service
        </Button>
      </PageHead>

      {(services ?? []).length === 0 ? (
        <EmptyState
          title="No services yet"
          description="Your services are what customers browse, price and book. Add your first one to make your website useful."
          action={
            <Button variant="signal" onClick={() => setEditing({ ...blank })}>
              Add your first service
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {(services ?? []).map((service) => (
            <li key={service.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-semibold">{service.name}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {service.price !== null
                      ? `${service.starting_price ? "From " : ""}${currency(Number(service.starting_price ?? service.price))}`
                      : "Price on request"}
                    {service.duration_minutes ? ` · ${service.duration_minutes} min` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {service.featured ? <Pill tone="attention">Featured</Pill> : null}
                  {service.bookable ? <Pill tone="signal">Bookable</Pill> : null}
                  {!service.is_active ? <Pill>Hidden</Pill> : null}
                </div>
              </div>
              {service.description ? (
                <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                  {service.description}
                </p>
              ) : null}
              <div className="mt-3.5 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditing({
                      id: service.id,
                      name: service.name,
                      description: service.description ?? "",
                      category: service.category ?? "",
                      price: service.price === null ? "" : String(service.price),
                      starting_price:
                        service.starting_price === null ? "" : String(service.starting_price),
                      duration_minutes: service.duration_minutes
                        ? String(service.duration_minutes)
                        : "",
                      bookable: service.bookable,
                      featured: service.featured,
                      is_active: service.is_active,
                    })
                  }
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteService.mutate(service.id)}
                  aria-label={`Remove ${service.name}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Panel className="p-5">
        <SectionHeading eyebrow="Instant estimates" title="Quote requests" />
        {(quotes ?? []).length === 0 ? (
          <p className="mt-3 text-[13px] text-muted-foreground">
            When someone uses the quote calculator on your site, their answers and price range land
            here — with their contact details attached.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {(quotes ?? []).map((quote) => (
              <li key={quote.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">
                    {(quote.leads as { name?: string } | null)?.name ?? "Website visitor"}
                  </p>
                  <p className="tnum text-[13px] font-semibold text-primary">
                    {currency(Number(quote.estimate_min))} – {currency(Number(quote.estimate_max))}
                  </p>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {relative(quote.created_at)}
                  {Array.isArray(quote.answers)
                    ? ` · ${(quote.answers as { answer?: string }[])
                        .map((a) => a.answer)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Edit service" : "Add service"}</DialogTitle>
                <DialogDescription>
                  Clear names and honest prices convert better than "call for pricing".
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveService.mutate(
                    {
                      ...(editing.id ? { id: editing.id } : {}),
                      name: editing.name.trim(),
                      description: editing.description.trim() || null,
                      category: editing.category.trim() || null,
                      price: editing.price ? Number(editing.price) : null,
                      starting_price: editing.starting_price
                        ? Number(editing.starting_price)
                        : null,
                      duration_minutes: editing.duration_minutes
                        ? Number(editing.duration_minutes)
                        : null,
                      bookable: editing.bookable,
                      featured: editing.featured,
                      is_active: editing.is_active,
                    },
                    { onSuccess: () => setEditing(null) },
                  );
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="s-name">Name</Label>
                  <Input
                    id="s-name"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-description">Description</Label>
                  <Textarea
                    id="s-description"
                    rows={3}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-price">Price ($)</Label>
                    <Input
                      id="s-price"
                      inputMode="decimal"
                      value={editing.price}
                      onChange={(e) =>
                        setEditing({ ...editing, price: e.target.value.replace(/[^0-9.]/g, "") })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-duration">Minutes</Label>
                    <Input
                      id="s-duration"
                      inputMode="numeric"
                      value={editing.duration_minutes}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          duration_minutes: e.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-starting">Starting at ($)</Label>
                    <Input
                      id="s-starting"
                      inputMode="decimal"
                      value={editing.starting_price}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          starting_price: e.target.value.replace(/[^0-9.]/g, ""),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-category">Category</Label>
                    <Input
                      id="s-category"
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  {(
                    [
                      ["bookable", "Customers can book this online"],
                      ["featured", "Feature on the website"],
                      ["is_active", "Visible on the website"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <Label htmlFor={`s-${key}`} className="text-[13px] font-normal">
                        {label}
                      </Label>
                      <Switch
                        id={`s-${key}`}
                        checked={editing[key]}
                        onCheckedChange={(checked) => setEditing({ ...editing, [key]: checked })}
                      />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button type="submit" variant="signal" disabled={saveService.isPending}>
                    Save service
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
