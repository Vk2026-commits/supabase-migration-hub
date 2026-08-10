import { createFileRoute } from "@tanstack/react-router";
import ResetPassword from "@/components/pages/ResetPassword";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset Your Password | WeFindGuards" },
      { name: "description", content: "Choose a new password for your WeFindGuards account." },
      { property: "og:title", content: "Reset Your Password | WeFindGuards" },
      { property: "og:description", content: "Choose a new password for your WeFindGuards account." },
    ],
  }),
  component: ResetPassword,
});
