import { Skeleton as UISkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SkeletonBox({ className = "" }: { className?: string }) {
  return <UISkeleton className={cn("rounded-lg", className)} />;
}

export function SkeletonText({ width = "w-full" }: { width?: string }) {
  return <UISkeleton className={cn("h-4 rounded", width)} />;
}

export function SkeletonWorkCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <SkeletonBox className="h-5 w-3/4" />
      <SkeletonBox className="mt-3 h-4 w-1/3" />
      <SkeletonBox className="mt-2 h-3 w-1/4" />
    </div>
  );
}

export function SkeletonCharacterCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <SkeletonBox className="aspect-square w-full rounded-lg" />
      <SkeletonBox className="mx-auto mt-3 h-4 w-2/3" />
    </div>
  );
}

export function SkeletonDetailPage() {
  return (
    <div className="space-y-6">
      <SkeletonBox className="h-6 w-1/3" />
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex gap-6">
          <SkeletonBox className="h-48 w-48 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-3">
            <SkeletonBox className="h-7 w-1/2" />
            <SkeletonBox className="h-4 w-1/3" />
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <SkeletonBox className="h-4 w-full" />
          <SkeletonBox className="h-4 w-3/4" />
          <SkeletonBox className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
