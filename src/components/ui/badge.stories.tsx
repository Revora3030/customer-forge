import { Badge } from "@/components/ui/badge";

export const Default = () => <Badge>New</Badge>;

export const Variants = () => (
  <div className="flex flex-wrap gap-3">
    <Badge variant="default">Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="outline">Outline</Badge>
    <Badge variant="destructive">Destructive</Badge>
  </div>
);
