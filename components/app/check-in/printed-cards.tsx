import { PhysicalCheckIn } from "@/components/app/check-in/physical-check-in";
import { StaffBar } from "@/components/app/check-in/staff-bar";
import { requireCheckIn } from "@/lib/admin-session";
import { listHostsForCards } from "@/lib/data/physical-check-in";

/** Counting in guests with printed cards, for door staff and admins. */
export async function PrintedCards() {
  const { user } = await requireCheckIn();
  const hosts = await listHostsForCards();
  return (
    <>
      <StaffBar user={user} />
      <PhysicalCheckIn hosts={hosts} />
    </>
  );
}
