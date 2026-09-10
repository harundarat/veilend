import { Suspense } from "react";
import { BorrowPage } from "@/components/borrow/BorrowPage";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" />}>
      <BorrowPage />
    </Suspense>
  );
}
