import type { BuilderGroup } from "@/components/app/BuilderGroups";

export function orderGroups(groups: BuilderGroup[], order: string[]): BuilderGroup[] {
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index === -1 ? order.length : index;
  };
  return [...groups].sort((a, b) => rank(a.key) - rank(b.key));
}
