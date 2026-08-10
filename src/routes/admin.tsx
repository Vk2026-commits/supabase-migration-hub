import { createFileRoute } from "@tanstack/react-router";
import Admin from "@/components/pages/Admin";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Console | WeFindGuards" },
      { name: "description", content: "Administrative tools for managing users, subscriptions and platform data." },
      { property: "og:title", content: "Admin Console | WeFindGuards" },
      { property: "og:description", content: "Administrative tools for managing users, subscriptions and platform data." },
    ],
  }),
  component: Admin,
});
