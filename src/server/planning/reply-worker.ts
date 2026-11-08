import type { PlanningRepository, ReplyJob } from './repository'
import { interpretReply, type ReplyInterpreter } from './replies'

// Await this from the webhook or a scheduled invocation; never detach it from the request.
export async function processReplyJobs(repository: PlanningRepository, interpret: ReplyInterpreter, limit = 1,
  afterReply?: (job: ReplyJob) => Promise<void>) {
  const jobs = await repository.pendingReplyJobs(limit, Date.now())
  await Promise.all(jobs.map(async job => {
    await interpretReply(repository, job, job.replyId, interpret)
    await afterReply?.(job)
  }))
  return { processed: jobs.length }
}
