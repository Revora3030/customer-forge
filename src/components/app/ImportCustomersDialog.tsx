/**
 * Bring past customers in from a CSV. The owner sees the column mapping, how many rows would be added and
 * why others would be skipped before anything is saved. Importing never messages anyone.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useCustomers } from "@/lib/queries";
import { friendlyError } from "@/lib/user-error";
import { toast } from "@/lib/ui/notify";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  SKIP_LABELS,
  buildImport,
  detectMapping,
  importTags,
  parseCsv,
  type ColumnMapping,
  type ImportField,
  type SkipReason,
} from "@/lib/customer-import";

const CHUNK = 200;

export function ImportCustomersDialog({ organizationId }: { organizationId: string | undefined }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const customers = useCustomers(open ? organizationId : undefined);
  const queryClient = useQueryClient();

  const headers = rows[0] ?? [];
  const plan = useMemo(
    () => (mapping && rows.length > 1 ? buildImport({ rows: rows.slice(1), mapping, existing: customers.data ?? [] }) : null),
    [rows, mapping, customers.data],
  );
  const skippedByReason = useMemo(() => {
    const counts = new Map<SkipReason, number>();
    for (const skip of plan?.skipped ?? []) counts.set(skip.reason, (counts.get(skip.reason) ?? 0) + 1);
    return [...counts.entries()];
  }, [plan]);

  const reset = () => {
    setRows([]);
    setMapping(null);
    setFileError(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!plan || !organizationId) return 0;
      const tags = importTags(new Date());
      for (let i = 0; i < plan.ready.length; i += CHUNK) {
        const batch = plan.ready.slice(i, i + CHUNK).map((row) => ({ ...row, organization_id: organizationId, tags }));
        const { error } = await supabase.from("customers").insert(batch as never);
        if (error) throw error;
      }
      return plan.ready.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} customers added. Nobody was messaged.`);
      void queryClient.invalidateQueries({ queryKey: ["customers", organizationId] });
      setOpen(false);
      reset();
    },
    onError: (error: Error) => toast.error(friendlyError(error, "Couldn't import that file. Nothing was lost; try again.")),
  });

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setFileError("That file is over 1 MB. Export fewer rows or split it.");
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) return setFileError("That file has no rows under the header.");
      setRows(parsed);
      setMapping(detectMapping(parsed[0] ?? []));
    } catch {
      setFileError("Couldn't read that file. Export it as CSV and try again.");
    }
  };

  const hasName = mapping ? mapping.name >= 0 || (mapping.firstName >= 0 && mapping.lastName >= 0) || mapping.firstName >= 0 : false;
  const hasContact = mapping ? mapping.email >= 0 || mapping.phone >= 0 : false;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" aria-hidden="true" /> Import customers (CSV)
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import past customers</DialogTitle>
            <DialogDescription>
              Upload a CSV from your old tool. You check the columns and the count first. Importing never messages anyone, and only
              people who have done business with you or asked to hear from you belong here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="import-file">CSV file (up to {MAX_IMPORT_ROWS} rows, 1 MB)</Label>
            <input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void onFile(event.target.files?.[0])}
              className="block min-h-11 w-full cursor-pointer text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-card file:px-3 file:text-sm"
            />
            {fileError ? (
              <p role="alert" className="text-[13px] text-destructive">
                {fileError}
              </p>
            ) : null}
          </div>

          {mapping ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map(({ field, label }) => (
                  <div key={field} className="space-y-1">
                    <Label htmlFor={`map-${field}`} className="text-[12px]">
                      {label}
                    </Label>
                    <select
                      id={`map-${field}`}
                      value={mapping[field]}
                      onChange={(event) => setMapping({ ...mapping, [field as ImportField]: Number(event.target.value) })}
                      className="min-h-11 w-full cursor-pointer rounded-md border border-input bg-background px-3 text-sm sm:min-h-10"
                    >
                      <option value={-1}>Not in this file</option>
                      {headers.map((header, index) => (
                        <option key={index} value={index}>
                          {header || `Column ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {!hasName || !hasContact ? (
                <p role="alert" className="text-[13px] text-destructive">
                  Choose a name column and an email or phone column to continue.
                </p>
              ) : plan ? (
                <div className="space-y-2 rounded-md border border-border p-3.5 text-[13px]" aria-live="polite">
                  <p className="font-medium">{plan.ready.length} customers will be added.</p>
                  {skippedByReason.length > 0 ? (
                    <ul className="text-muted-foreground">
                      {skippedByReason.map(([reason, count]) => (
                        <li key={reason}>
                          {count} skipped: {SKIP_LABELS[reason]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {plan.overLimit > 0 ? <p className="text-muted-foreground">{plan.overLimit} rows past the first {MAX_IMPORT_ROWS} were not read.</p> : null}
                  {plan.unreadableDates > 0 ? (
                    <p className="text-muted-foreground">{plan.unreadableDates} last-visit dates could not be read; those customers are added without one.</p>
                  ) : null}
                  {plan.ready.slice(0, 3).map((row, index) => (
                    <p key={index} className="truncate text-muted-foreground">
                      {row.name} · {row.email ?? row.phone}
                    </p>
                  ))}
                </div>
              ) : null}

              <Button
                type="button"
                variant="signal"
                disabled={!plan || plan.ready.length === 0 || !hasName || !hasContact || save.isPending || customers.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? "Importing…" : `Add ${plan?.ready.length ?? 0} customers`}
              </Button>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
