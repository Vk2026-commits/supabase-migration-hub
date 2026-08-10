import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/components/pages/Auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: Auth,
});
