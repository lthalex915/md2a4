import { createFileRoute } from "@tanstack/react-router";
import { CompilerApp } from "@/components/compiler-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <CompilerApp />;
}
