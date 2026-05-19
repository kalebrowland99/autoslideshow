"use client";

import { useEffect } from "react";
import { registerNumistaImageProxySw } from "@/lib/numistaImageProxy";

/** Register Numista SW as early as possible so export can use /numista-proxy. */
export default function NumistaProxyBootstrap() {
  useEffect(() => {
    void registerNumistaImageProxySw();
  }, []);
  return null;
}
