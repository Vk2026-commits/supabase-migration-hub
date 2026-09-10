import { createFileRoute } from "@tanstack/react-router";
import CompleteTeamProfile from "@/components/pages/CompleteTeamProfile";

export const Route = createFileRoute("/complete-team-profile")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete Your Team Profile | We Find Guards" },
      {
        name: "description",
        content: "Complete your We Find Guards team member profile to activate workspace access.",
      },
    ],
  }),
  component: CompleteTeamProfile,
});
