"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { AdminGuest } from "@/types/guest";

async function readMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** Downloads the guest's access card PDF straight from the server. */
export function DownloadCardButton({ guest, disabled }: { guest: AdminGuest; disabled?: boolean }) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const response = await fetch(`/admin/guests/${guest.id}/access-card`);

      // An expired session is redirected to the login page.
      if (response.redirected) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        toast.error(await readMessage(response, "We couldn't download the access card."), {
          duration: 8000,
        });
        return;
      }

      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `access-card-${guest.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("We couldn't reach the server. Check your connection and try again.", {
        duration: 8000,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={download}
      disabled={disabled || downloading}
      aria-label={`Download access card for ${guest.name}`}
      title="Download access card"
    >
      {downloading ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
    </Button>
  );
}
