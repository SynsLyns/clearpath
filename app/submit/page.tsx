import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageContainer, PageFooter, PageHeading } from "@/components/app-shell";
import { SubmissionForm } from "@/components/submission-form";
import { requireRole } from "@/lib/session";

export default async function SubmitPage() {
  await requireRole("submitter");
  return (
    <>
      <PageContainer>
        <Link className="back-link" href="/submissions"><ArrowLeft size={15} /> My submissions</Link>
        <PageHeading
          eyebrow="New submission"
          title="Start with the creative."
          description="A few details and a quick self-check can save a full review cycle."
        />
        <SubmissionForm />
      </PageContainer>
      <PageFooter />
    </>
  );
}
