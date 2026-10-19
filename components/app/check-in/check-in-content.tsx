import { CheckInPanel } from "@/components/app/check-in/check-in-panel";
import { InvalidInvitation } from "@/components/app/check-in/invalid-invitation";
import { RestrictedAccess } from "@/components/app/check-in/restricted-access";
import { getAdminSession } from "@/lib/admin-session";
import { getCheckInView } from "@/lib/data/check-in";
import { isCheckInToken } from "@/lib/check-in/check-in-path";

/**
 * The page behind a guest's QR code. Who is looking comes first: nothing about
 * the guest is read, let alone shown, until the session has been verified as an
 * authorized admin. A visitor who isn't one sees the same page for every
 * address, so it doesn't even say whether the code belongs to anyone.
 */
export async function CheckInContent({
  params,
}: {
  params: PageProps<"/check-in/[token]">["params"];
}) {
  const { token } = await params;

  if (!(await getAdminSession())) return <RestrictedAccess token={token} />;

  const guest = isCheckInToken(token) ? await getCheckInView(token) : null;
  if (!guest) return <InvalidInvitation />;

  return <CheckInPanel token={token} initial={guest} />;
}
