import { createFileRoute } from "@tanstack/react-router";
import Browse from "@/components/pages/Browse";

export const Route = createFileRoute("/browse")({
  ssr: false,
  component: Browse,
});
