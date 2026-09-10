import { createFileRoute } from "@tanstack/react-router";
import AcceptTeamInvitation from "@/components/pages/AcceptTeamInvitation";

export const Route = createFileRoute("/accept-team-invitation")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate Your Team Account | We Find Guards" },
      { name: "description", content: "Securely activate your We Find Guards team account." },
    ],
  }),
  component: AcceptTeamInvitation,
});
