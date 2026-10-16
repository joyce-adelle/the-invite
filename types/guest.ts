
import type { Guest } from "@/lib/generated/prisma/browser";

export type { Guest };
export { CardStatus, GuestStatus } from "@/lib/generated/prisma/enums";


/** A guest as shown in the admin lists: the record plus the name of the host who invited them. */
export type AdminGuest = Guest & { hostName: string };
