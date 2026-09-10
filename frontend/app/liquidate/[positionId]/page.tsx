import { Suspense } from "react";
import { LiquidatePage } from "@/components/liquidate/LiquidatePage";

export default async function Page({
  params,
}: PageProps<"/liquidate/[positionId]">) {
  const { positionId } = await params;
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LiquidatePage key={positionId} positionId={positionId} />
    </Suspense>
  );
}
