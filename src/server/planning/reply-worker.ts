import type { PlanningRepository } from './repository'
import { interpretReply, type ReplyInterpreter } from './replies'

// Await this from the webhook or a scheduled invocation; never detach it from the request.
export async function processReplyJobs(repository: PlanningRepository, interpret: ReplyInterpreter, limit = 1) {
  const jobs = await repository.pendingReplyJobs(limit, Date.now())
  for (const job of jobs) await interpretReply(repository, job, job.replyId, interpret)
  return { processed: jobs.length }
}
