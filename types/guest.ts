
import type { Guest } from "@/lib/generated/prisma/browser";

export type { Guest };
export { CardStatus, GuestStatus } from "@/lib/generated/prisma/enums";


/**
 * A guest as shown in the admin lists: the record plus the name of the host who invited them.
 * It never carries the check-in token, which belongs on the card alone.
 */
export type AdminGuest = Omit<Guest, "checkInToken"> & { hostName: string };
