import type { Metadata } from "next";
import { requireUserAndProfile } from "@/lib/intel/auth";
import { accessState, gateForFullAccess } from "@/lib/intel/access";
import { Analyser } from "./Analyser";

export const metadata: Metadata = { title: "Estimate" };

/**
 * Server entrypoint for the analyser tool. Gates expired-trial non-subscribers
 * before rendering the (large) client component.
 */
export default async function EstimatePage() {
  const { profile } = await requireUserAndProfile("/estimate");
  gateForFullAccess(accessState(profile));
  return <Analyser />;
}
