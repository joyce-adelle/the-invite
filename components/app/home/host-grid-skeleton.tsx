import { Skeleton } from "@/components/ui/skeleton";

export default function HostGridSkeleton() {
  return (
    <div aria-hidden className="mt-6 grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-18.5 rounded-xl" />
      ))}
    </div>
  );
}
