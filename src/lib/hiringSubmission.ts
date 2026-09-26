export type SubmissionReceipt = {
  master_application_id: string;
  employer_application_id: string;
  job_application_id: string;
  submitted_at: string;
};

// Store only an opaque attempt ID, never application data or a signature.
export const submissionAttemptKey = (userId: string, officerId: string, jobId: string) =>
  `hiring-submission-attempt:${userId}:${officerId}:${jobId}`;

export async function withDeadline<T>(operation: PromiseLike<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("The server is taking longer than expected. Your submission has not yet been confirmed.")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

// A timeout does not mean the database rolled back. Always reconcile the receipt
// before allowing another attempt, including after refresh or a lost response.
export async function submitWithReceipt(
  send: () => Promise<SubmissionReceipt>,
  lookup: () => Promise<SubmissionReceipt | null>,
): Promise<SubmissionReceipt> {
  try {
    return await send();
  } catch (error) {
    const receipt = await lookup().catch(() => null);
    if (receipt) return receipt;
    throw error;
  }
}
