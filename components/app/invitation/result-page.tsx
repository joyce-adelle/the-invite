import { BackLink } from "@/components/common/back-link";
import { getPublicHost } from "@/lib/data/hosts";
import { notFound } from "next/navigation";

/**
 * The body of the pages a guest lands on after sending a request. The host in
 * the address has to be a real one, so a made-up address is a 404 rather than
 * a page that talks about a request that was never made.
 */
export default async function ResultPage({
  params,
  children,
}: {
  params: PageProps<"/invite/[hostId]">["params"];
  children: React.ReactNode;
}) {
  const { hostId } = await params;
  const host = await getPublicHost(hostId);
  if (!host) notFound();

  return (
    <>
      <BackLink href="/">Back</BackLink>
      <div className="rounded-2xl border border-gold/30 border-t-gold bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
        {children}
      </div>
    </>
  );
}
