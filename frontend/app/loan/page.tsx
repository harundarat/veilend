import { Suspense } from "react";
import { LoanPage } from "@/components/loan/LoanPage";

export default async function Page({ searchParams }: PageProps<"/loan">) {
  const resolved = await searchParams;
  const id = resolved.id;
  const positionId = typeof id === "string" ? id : undefined;
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <LoanPage positionId={positionId} />
    </Suspense>
  );
}
