import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ListSkeleton({ label = "Loading guests" }: { label?: string }) {
  return (
    <Card aria-busy="true" aria-label={label} className="gap-0 py-0">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="hidden h-4 w-28 sm:block" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </Card>
  );
}
