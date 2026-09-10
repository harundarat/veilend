import { Suspense } from "react";
import { LiquidatePage } from "@/components/liquidate/LiquidatePage";

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function Page({ searchParams }: PageProps<"/liquidate">) {
  const resolved = await searchParams;
  const id = firstString(resolved.id) ?? firstString(resolved.positionId);
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LiquidatePage key={id ?? ""} positionId={id} />
    </Suspense>
  );
}
