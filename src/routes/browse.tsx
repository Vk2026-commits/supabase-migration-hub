import { createFileRoute } from "@tanstack/react-router";
import Browse from "@/components/pages/Browse";

export const Route = createFileRoute("/browse")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Browse Security Officers | WeFindGuards" },
      { name: "description", content: "Search verified security officers by certification, location and experience." },
      { property: "og:title", content: "Browse Security Officers | WeFindGuards" },
      { property: "og:description", content: "Search verified security officers by certification, location and experience." },
    ],
  }),
  component: Browse,
});
