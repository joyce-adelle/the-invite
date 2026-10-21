import { CheckInPanel } from "@/components/app/check-in/check-in-panel";
import { InvalidInvitation } from "@/components/app/check-in/invalid-invitation";
import { RestrictedAccess } from "@/components/app/check-in/restricted-access";
import { StaffBar } from "@/components/app/check-in/staff-bar";
import { getCheckInSession } from "@/lib/admin-session";
import { getCheckInView } from "@/lib/data/check-in";
import { isCheckInToken } from "@/lib/check-in/check-in-path";
import { isAdmin } from "@/lib/roles";

/**
 * The page behind a guest's QR code. Who is looking comes first: nothing about
 * the guest is read, let alone shown, until the session has been verified as
 * someone allowed to check guests in (an active admin or check-in account). A
 * visitor who isn't sees the same page for every address, so it doesn't even
 * say whether the code belongs to anyone.
 */
export async function CheckInContent({
  params,
}: {
  params: PageProps<"/check-in/[token]">["params"];
}) {
  const { token } = await params;

  const session = await getCheckInSession();
  if (!session) return <RestrictedAccess token={token} />;

  const guest = isCheckInToken(token) ? await getCheckInView(token) : null;
  const canManage = isAdmin(session.user);

  return (
    <>
      <StaffBar user={session.user} />
      {guest ? (
        <CheckInPanel token={token} initial={guest} canManage={canManage} />
      ) : (
        <InvalidInvitation canManage={canManage} />
      )}
    </>
  );
}
