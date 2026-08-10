import { createFileRoute } from "@tanstack/react-router";
import Auth from "@/components/pages/Auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign In or Create Account | WeFindGuards" },
      { name: "description", content: "Log in or register as a security officer or security company on WeFindGuards." },
      { property: "og:title", content: "Sign In or Create Account | WeFindGuards" },
      { property: "og:description", content: "Log in or register as a security officer or security company on WeFindGuards." },
    ],
  }),
  component: Auth,
});
