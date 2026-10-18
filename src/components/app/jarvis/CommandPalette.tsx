import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desktop shows a centered dialog; phones get a bottom sheet. */
  desktop: boolean;
  commands: ReadonlyArray<readonly [string, string]>;
  disabled: boolean;
  onRun: (prompt: string) => void;
};

/** Every quick command, searchable. Opened by the Commands button or "/" in an empty composer. */
export function CommandPalette({ open, onOpenChange, desktop, commands, disabled, onRun }: Props) {
  const list = (
    <Command className="bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-input]]:text-base">
      <CommandInput placeholder="Search commands" aria-label="Search commands" />
      <CommandList className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain">
        <CommandEmpty>No command matches.</CommandEmpty>
        <CommandGroup heading="Quick commands">
          {commands.map(([label, prompt]) => (
            <CommandItem
              key={label}
              value={label}
              disabled={disabled}
              onSelect={() => { onOpenChange(false); onRun(prompt); }}
              className="min-h-11 flex-col items-start gap-0.5 rounded-lg px-3 py-2"
            >
              <span className="text-sm font-medium">{label}</span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{prompt}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:p-0">
          <DialogTitle className="sr-only">Quick commands</DialogTitle>
          <DialogDescription className="sr-only">Pick a command to send it to Jarvis.</DialogDescription>
          {list}
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-jarvis-sheet=""
        // Don't pop the keyboard over the list on phones; the search field is one tap away.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="max-h-[85dvh] gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] [&>button:first-child]:hidden"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
        <div className="flex items-center justify-between gap-2 pl-4 pr-2 pt-1">
          <SheetTitle className="text-left text-base">Quick commands</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="size-11 sm:size-11" aria-label="Close"><X className="size-5" aria-hidden /></Button>
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Pick a command to send it to Jarvis.</SheetDescription>
        {list}
      </SheetContent>
    </Sheet>
  );
}
