import { createFileRoute } from "@tanstack/react-router";
import PrivacyPolicy from "@/components/pages/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Privacy Policy | WeFindGuards" },
      { name: "description", content: "How WeFindGuards collects, stores and protects your personal information." },
      { property: "og:title", content: "Privacy Policy | WeFindGuards" },
      { property: "og:description", content: "How WeFindGuards collects, stores and protects your personal information." },
    ],
  }),
  component: PrivacyPolicy,
});
