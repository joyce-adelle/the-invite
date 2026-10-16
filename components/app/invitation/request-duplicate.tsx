import { RememberedSupportForm } from "@/components/app/invitation/remembered-details";

/**
 * The page shown when the submitted name matches an existing guest.
 */
export function RequestDuplicate() {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <h2 className="font-display text-3xl font-medium text-primary">
        Error Registering Your Invitation
      </h2>
      <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
      <p className="mt-5 max-w-md text-pretty text-muted-foreground">
        If you’ve already registered but haven’t received your access card by
        email, or if you haven’t registered yet, please reach out using the
        support form below.
      </p>
      <RememberedSupportForm className="mt-10 w-full" />
    </div>
  );
}
