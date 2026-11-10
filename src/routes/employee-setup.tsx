import { createFileRoute } from "@tanstack/react-router";
import EmployeeSetup from "@/components/pages/EmployeeSetup";
export const Route = createFileRoute("/employee-setup")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Update employee records | We Find Guards" },
    { name: "referrer", content: "no-referrer" },
    { name: "robots", content: "noindex" },
  ] }),
  component: EmployeeSetup,
});
