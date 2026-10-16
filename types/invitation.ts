import { Guest } from "./guest";
import { InvitationRequestFieldErrors } from "@/lib/validation/invitation";

export type InvitationRequestState =
    | { status: "idle" }
    | { status: "success" }
    | { status: "duplicate" }
    | {
        status: "error";
        /** Page-level problem rather than a field one. */
        message?: string;
        /** Set when the host can't take requests at all, so the form should go away. */
        hostFull?: boolean;
        fieldErrors?: InvitationRequestFieldErrors;
    };

/** `reason` is why a send failed, for the admin to read; it never contains a secret. */
export type CardDelivery = { status: "SENT" } | { status: "FAILED"; reason: string };

export type InvitationResult = {
    /** The guest as they are now, including the card status after delivery. */
    guest: Guest;
    delivery: CardDelivery;
};