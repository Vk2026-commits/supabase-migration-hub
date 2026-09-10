import { createFileRoute } from "@tanstack/react-router";
import OfficerIntake from "@/components/pages/OfficerIntake";

export const Route = createFileRoute("/get-started")({
  ssr: false,
  component: OfficerIntake,
});
