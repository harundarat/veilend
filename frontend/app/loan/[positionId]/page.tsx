import { Suspense } from "react";
import { LoanPage } from "@/components/loan/LoanPage";

export default async function Page({
  params,
}: PageProps<"/loan/[positionId]">) {
  const { positionId } = await params;
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LoanPage positionId={positionId} />
    </Suspense>
  );
}
