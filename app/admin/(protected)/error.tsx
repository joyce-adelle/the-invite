"use client";

import { TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      <Card role="alert" className="items-center py-12 text-center">
        <TriangleAlert className="size-8 text-destructive" aria-hidden />
        <div>
          <p className="font-medium">We couldn&apos;t load the dashboard</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Something went wrong while fetching guests. Nothing has been changed.
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}
