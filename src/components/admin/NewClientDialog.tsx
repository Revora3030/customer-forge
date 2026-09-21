import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/lib/ui/notify";
import { friendlyError } from "@/lib/user-error";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Panel, Pill } from "@/components/app/Bits";
import { createClientOrg } from "@/lib/admin.functions";
import { INDUSTRIES, TEMPLATES, CONVERSION_GOALS } from "@/lib/domain";
import type { NewClientInput, NewClientService } from "@/lib/admin-types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type Result = { slug: string; email: string; tempPassword: string | null; organizationId: string };

export function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const create = useServerFn(createClientOrg);
  const [result, setResult] = useState<Result | null>(null);

  const [form, setForm] = useState({
    business_name: "",
    owner_name: "",
    owner_email: "",
    phone: "",
    industry: "",
    template: "default",
    address: "",
    city: "",
    state: "",
    zip: "",
    service_area: "",
    tagline: "",
    description: "",
    logo_url: "",
    hero_image_url: "",
    primary_color: "#34d399",
    secondary_color: "#0f172a",
    accent_color: "#fbbf24",
    instagram: "",
    facebook: "",
    tiktok: "",
    google_business: "",
    review_link: "",
    desired_domain: "",
    conversion_goal: "quotes",
    support_email: "",
  });
  const [hours, setHours] = useState<Record<string, string>>({
    Mon: "9:00 AM – 5:00 PM",
    Tue: "9:00 AM – 5:00 PM",
    Wed: "9:00 AM – 5:00 PM",
    Thu: "9:00 AM – 5:00 PM",
    Fri: "9:00 AM – 5:00 PM",
    Sat: "Closed",
    Sun: "Closed",
  });
  const [services, setServices] = useState<NewClientService[]>([
    { name: "", price: undefined, duration_minutes: 60, bookable: true },
  ]);
  const [images, setImages] = useState<string[]>([""]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: NewClientInput = {
        ...form,
        hours,
        services: services.filter((s) => s.name.trim()),
        images: images.filter((url) => url.trim()),
      };
      return create({ data: payload });
    },
    onSuccess: (data) => {
      setResult(data as Result);
      toast.success("Client workspace created.");
      onCreated();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't create that client.")),
  });

  const close = () => {
    onOpenChange(false);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? "Client is ready" : "Create new client"}</DialogTitle>
          <DialogDescription>
            {result
              ? "The workspace, website, CRM and quote system are provisioned and fully isolated."
              : "One intake form provisions an isolated workspace: website, CRM, booking, quotes, analytics."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <Panel className="space-y-3">
              <div>
                <p className="eyebrow">Client website</p>
                <p className="mt-1 text-[13px]">/s/{result.slug}</p>
              </div>
              <div>
                <p className="eyebrow">Client login</p>
                <p className="mt-1 text-[13px]">/auth · {result.email}</p>
              </div>
              {result.tempPassword ? (
                <div>
                  <p className="eyebrow">Temporary password</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="rounded bg-elevated px-2 py-1 text-[12px]">
                      {result.tempPassword}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await navigator.clipboard.writeText(result.tempPassword ?? "");
                        toast.success("Copied. Share it securely and ask them to change it.");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  This email already had an account — it was added as the owner of the new
                  workspace.
                </p>
              )}
            </Panel>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <Section title="Business & owner">
              <Field label="Business name" required>
                <Input
                  value={form.business_name}
                  onChange={(e) => set("business_name")(e.target.value)}
                  required
                />
              </Field>
              <Field label="Owner name" required>
                <Input
                  value={form.owner_name}
                  onChange={(e) => set("owner_name")(e.target.value)}
                  required
                />
              </Field>
              <Field label="Owner email" required>
                <Input
                  type="email"
                  value={form.owner_email}
                  onChange={(e) => set("owner_email")(e.target.value)}
                  required
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
              </Field>
              <Field label="Industry">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
                  value={form.industry}
                  onChange={(e) => {
                    const industry = e.target.value;
                    const match = INDUSTRIES.find((i) => i.name === industry);
                    setForm((f) => ({ ...f, industry, template: match?.template ?? f.template }));
                  }}
                >
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Website template">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
                  value={form.template}
                  onChange={(e) => set("template")(e.target.value)}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Primary goal">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
                  value={form.conversion_goal}
                  onChange={(e) => set("conversion_goal")(e.target.value)}
                >
                  {CONVERSION_GOALS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Support email shown to client">
                <Input
                  value={form.support_email}
                  onChange={(e) => set("support_email")(e.target.value)}
                />
              </Field>
            </Section>

            <Section title="Location & service area">
              <Field label="Address">
                <Input value={form.address} onChange={(e) => set("address")(e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city")(e.target.value)} />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => set("state")(e.target.value)} />
              </Field>
              <Field label="ZIP">
                <Input value={form.zip} onChange={(e) => set("zip")(e.target.value)} />
              </Field>
              <Field label="Service area" full>
                <Input
                  value={form.service_area}
                  onChange={(e) => set("service_area")(e.target.value)}
                  placeholder="e.g. Austin + 30 miles"
                />
              </Field>
            </Section>

            <Section title="Business hours" cols={1}>
              <div className="grid gap-2 sm:grid-cols-2">
                {DAYS.map((day) => (
                  <label key={day} className="flex items-center gap-2">
                    <span className="w-10 text-[12px] text-muted-foreground">{day}</span>
                    <Input
                      value={hours[day] ?? ""}
                      onChange={(e) => setHours((h) => ({ ...h, [day]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </Section>

            <Section title="Brand & copy">
              <Field label="Tagline" full>
                <Input value={form.tagline} onChange={(e) => set("tagline")(e.target.value)} />
              </Field>
              <Field label="About the business" full>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description")(e.target.value)}
                />
              </Field>
              <Field label="Logo URL">
                <Input value={form.logo_url} onChange={(e) => set("logo_url")(e.target.value)} />
              </Field>
              <Field label="Hero image URL">
                <Input
                  value={form.hero_image_url}
                  onChange={(e) => set("hero_image_url")(e.target.value)}
                />
              </Field>
              <Field label="Primary colour">
                <Input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => set("primary_color")(e.target.value)}
                />
              </Field>
              <Field label="Secondary colour">
                <Input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) => set("secondary_color")(e.target.value)}
                />
              </Field>
              <Field label="Accent colour">
                <Input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => set("accent_color")(e.target.value)}
                />
              </Field>
            </Section>

            <Section title="Services & pricing" cols={1}>
              <div className="space-y-2">
                {services.map((service, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1fr_110px_110px_auto]">
                    <Input
                      placeholder="Service name"
                      value={service.name}
                      onChange={(e) =>
                        setServices((list) =>
                          list.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={0}
                      placeholder="Price"
                      value={service.price ?? ""}
                      onChange={(e) =>
                        setServices((list) =>
                          list.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  price: e.target.value === "" ? undefined : Number(e.target.value),
                                }
                              : s,
                          ),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min={15}
                      step={15}
                      placeholder="Minutes"
                      value={service.duration_minutes ?? ""}
                      onChange={(e) =>
                        setServices((list) =>
                          list.map((s, i) =>
                            i === index
                              ? {
                                  ...s,
                                  duration_minutes:
                                    e.target.value === "" ? undefined : Number(e.target.value),
                                }
                              : s,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setServices((list) => list.filter((_, i) => i !== index))}
                      aria-label="Remove service"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setServices((list) => [
                      ...list,
                      { name: "", duration_minutes: 60, bookable: true },
                    ])
                  }
                >
                  <Plus className="mr-1 size-3.5" /> Add service
                </Button>
              </div>
            </Section>

            <Section title="Photos" cols={1}>
              <div className="space-y-2">
                {images.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder="https://…"
                      value={url}
                      onChange={(e) =>
                        setImages((list) => list.map((u, i) => (i === index ? e.target.value : u)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImages((list) => list.filter((_, i) => i !== index))}
                      aria-label="Remove photo"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImages((l) => [...l, ""])}
                >
                  <Plus className="mr-1 size-3.5" /> Add photo URL
                </Button>
              </div>
            </Section>

            <Section title="Social & reviews">
              <Field label="Instagram">
                <Input value={form.instagram} onChange={(e) => set("instagram")(e.target.value)} />
              </Field>
              <Field label="Facebook">
                <Input value={form.facebook} onChange={(e) => set("facebook")(e.target.value)} />
              </Field>
              <Field label="TikTok">
                <Input value={form.tiktok} onChange={(e) => set("tiktok")(e.target.value)} />
              </Field>
              <Field label="Google Business profile">
                <Input
                  value={form.google_business}
                  onChange={(e) => set("google_business")(e.target.value)}
                />
              </Field>
              <Field label="Leave-a-review link" full>
                <Input
                  value={form.review_link}
                  onChange={(e) => set("review_link")(e.target.value)}
                />
              </Field>
            </Section>

            <Section title="Domain" cols={1}>
              <Field label="Desired domain" full>
                <Input
                  value={form.desired_domain}
                  onChange={(e) => set("desired_domain")(e.target.value)}
                  placeholder="clientbusiness.com"
                />
              </Field>
              <p className="text-[12px] text-muted-foreground">
                Saved as <Pill tone="attention">DNS pending</Pill> — nothing is reported as
                connected until DNS is actually verified.
              </p>
            </Section>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="signal" size="sm" disabled={mutation.isPending}>
                {mutation.isPending ? "Provisioning…" : "Create client"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
  cols = 2,
}: {
  title: string;
  children: React.ReactNode;
  cols?: 1 | 2;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="eyebrow">{title}</legend>
      <div className={cols === 2 ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  required,
  full,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label className="mb-1.5 block text-[12px]">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
