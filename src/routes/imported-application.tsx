import { createFileRoute } from "@tanstack/react-router";
import ImportedApplication from "@/components/pages/ImportedApplication";
export const Route = createFileRoute("/imported-application")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Review your saved application | We Find Guards" },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ImportedApplication,
});
