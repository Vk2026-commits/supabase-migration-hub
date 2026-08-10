import { createFileRoute } from "@tanstack/react-router";
import Index from "@/components/pages/Index";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "WeFindGuards | Hire Verified Security Officers" },
      {
        name: "description",
        content:
          "WeFindGuards connects licensed security officers with security companies hiring now. Verified certifications, work history and instant messaging.",
      },
      { property: "og:title", content: "WeFindGuards | Hire Verified Security Officers" },
      {
        property: "og:description",
        content:
          "Connect licensed security officers with companies hiring now. Verified certifications, work history and instant messaging.",
      },
    ],
  }),
  component: Index,
});
