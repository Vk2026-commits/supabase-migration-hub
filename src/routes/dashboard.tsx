import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/pages/Dashboard";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your Dashboard | WeFindGuards" },
      { name: "description", content: "Manage your profile, jobs, applicants and messages on WeFindGuards." },
      { property: "og:title", content: "Your Dashboard | WeFindGuards" },
      { property: "og:description", content: "Manage your profile, jobs, applicants and messages on WeFindGuards." },
    ],
  }),
  component: Dashboard,
});
