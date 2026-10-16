import Link from "next/link";
import { SupportForm } from "@/components/app/invitation/support-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown when the submitted name matches an existing guest. The wording is the
 * same whatever that guest's status, so it reveals nothing about them.
 */
export function RequestDuplicate({
  initialName,
  initialEmail,
}: {
  /** What the guest typed into the registration form, to prefill the help form. */
  initialName?: string;
  initialEmail?: string;
}) {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <h2 className="font-display text-3xl font-medium text-primary">
        Error Registering Your Invitation
      </h2>
      <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
      <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
        If you’ve already registered but haven’t received your access card by
        email, or if you haven’t registered yet, please reach out to your host
        for assistance.
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "outline" }), "mt-8")}
      >
        Back to the start
      </Link>
      <SupportForm
        defaultOpen
        initialName={initialName}
        initialEmail={initialEmail}
        className="mt-10 w-full border-t pt-6"
      />
    </div>
  );
}
