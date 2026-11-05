import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Default = () => <Input placeholder="Business name" aria-label="Business name" />;

export const WithLabel = () => (
  <div className="grid max-w-sm gap-2">
    <Label htmlFor="story-email">Email</Label>
    <Input id="story-email" type="email" placeholder="you@business.com" />
  </div>
);

export const Disabled = () => <Input disabled value="Locked" aria-label="Locked field" />;
