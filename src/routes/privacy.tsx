import { createFileRoute } from "@tanstack/react-router";
import PrivacyPolicy from "@/components/pages/PrivacyPolicy";

export const Route = createFileRoute("/privacy")({
  ssr: false,
  component: PrivacyPolicy,
});
