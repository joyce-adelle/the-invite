import { Skeleton } from "@/components/ui/skeleton";

export default function InviteSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-12 w-72 max-w-full" />
      <Skeleton className="mt-10 h-72 w-full rounded-2xl" />
    </div>
  );
}
