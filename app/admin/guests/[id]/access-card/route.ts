import { z } from "zod";

import { createGuestAccessCard } from "@/lib/access-card";
import { getAdminSession } from "@/lib/admin-session";
import { getGuest } from "@/lib/data/guests";
import { GuestStatus } from "@/types/guest";

const idSchema = z.uuid();

function problem(status: number, message: string) {
  return Response.json({ message }, { status });
}

/** Downloads an approved guest's access card as a PDF. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/guests/[id]/access-card">,
) {
  // Route handlers aren't covered by the page checks, so verify the session here.
  if (!(await getAdminSession())) return problem(401, "Please sign in again.");

  const id = idSchema.safeParse((await params).id);
  const guest = id.success ? await getGuest(id.data) : null;
  if (!guest || guest.status !== GuestStatus.APPROVED) {
    return problem(404, "That guest doesn't have an access card.");
  }

  let pdf: Uint8Array;
  try {
    pdf = await createGuestAccessCard(guest);
  } catch (error) {
    console.error(`Generating the access card for guest ${guest.id} failed`, error);
    return problem(500, "We couldn't generate the access card. Please try again.");
  }

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="access-card-${guest.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
