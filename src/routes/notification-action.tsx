import { createFileRoute } from "@tanstack/react-router";
import NotificationAction from "@/components/pages/NotificationAction";

export const Route = createFileRoute("/notification-action")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Open Account Update | We Find Guards" },
      { name: "description", content: "Securely open a We Find Guards account notification." },
    ],
  }),
  component: NotificationAction,
});
