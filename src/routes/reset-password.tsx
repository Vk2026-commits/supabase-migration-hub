import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/components/pages/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPassword,
});
