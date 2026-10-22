"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import Field from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MIN = 2;
const MAX = 60;

/** Asks for a host's name, for adding or renaming. The server checks it again. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  initialName = "",
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  pending: boolean;
  onSubmit: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <NameForm
            initialName={initialName}
            submitLabel={submitLabel}
            pending={pending}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  initialName,
  submitLabel,
  pending,
  onCancel,
  onSubmit,
}: {
  initialName: string;
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.replace(/\s+/g, " ").trim();
    if (clean.length < MIN || clean.length > MAX) {
      setError(`A host's name needs ${MIN} to ${MAX} characters.`);
      document.getElementById("host-name")?.focus();
      return;
    }
    setError(undefined);
    onSubmit(clean);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field
        id="host-name"
        label="Name"
        error={error}
        input={
          <Input
            id="host-name"
            value={name}
            maxLength={MAX}
            placeholder="e.g. Kikelomo's Guests"
            onChange={(event) => setName(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "host-name-error" : undefined}
            disabled={pending}
            autoFocus
            required
          />
        }
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
