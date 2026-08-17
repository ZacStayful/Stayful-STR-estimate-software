import { requireAdminApi } from '@/lib/auth/guard';
import { countByStatus, estimatedCostGbp, getJob, getJobRows } from '@/lib/bulk/jobs';

export const runtime = 'nodejs';

/** Job state + rows, polled by the progress view. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const { jobId } = await params;

  try {
    const job = await getJob(jobId);
    if (!job) return Response.json({ error: 'Job not found.' }, { status: 404 });

    const rows = await getJobRows(jobId);
    const counts = countByStatus(rows);

    return Response.json({
      job,
      counts,
      estimatedCostGbp: estimatedCostGbp(counts.pending + counts.claimed + counts.running + counts.succeeded + counts.failed),
      rows,
    });
  } catch (err) {
    console.error('[bulk] could not load job:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Could not load the job.' },
      { status: 500 },
    );
  }
}
