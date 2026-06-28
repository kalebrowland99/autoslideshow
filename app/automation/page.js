import { Suspense } from "react";
import AutomationRunner from "@/components/AutomationRunner";

export default function AutomationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0f0f0f] text-white flex items-center justify-center">
          Loading farm automation…
        </div>
      }
    >
      <AutomationRunner />
    </Suspense>
  );
}
