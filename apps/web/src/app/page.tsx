"use client";

import dynamic from "next/dynamic";

const Deck = dynamic(() => import("./deck"), { ssr: false });

export default function Page() {
  return <Deck />;
}
