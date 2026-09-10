import { createFileRoute } from "@tanstack/react-router";
import CandidateJobLanding from "@/components/pages/CandidateJobLanding";

export const Route = createFileRoute("/jobs/$jobId")({
  ssr: false,
  component: CandidateJobLanding,
});
