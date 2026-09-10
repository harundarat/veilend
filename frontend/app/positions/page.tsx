import { Suspense } from "react";
import { PositionsPage } from "@/components/positions/PositionsPage";

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function Page({ searchParams }: PageProps<"/positions">) {
  const resolved = await searchParams;
  const id = firstString(resolved.id) ?? firstString(resolved.positionId);
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <PositionsPage key={id ?? ""} positionId={id} />
    </Suspense>
  );
}
