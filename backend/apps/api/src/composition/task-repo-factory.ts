import type { TaskRepo } from '@linx/domain-tasks'
import type {
  TaskDatabaseActor,
  TaskDatabasePort,
  TaskMutationSource,
} from '@linx/domain-task-database'
import { makeBaserowTaskRepo, type BaserowClient } from '@linx/infra-baserow'
import { makeTaskRepo, type Queryable } from '@linx/infra-tasks-pg'

export interface TaskRepoRequest {
  actor: TaskDatabaseActor
  source?: TaskMutationSource
  clock?: () => Date
  genId?: (prefix: string) => string
}

export interface TaskRepoFactory {
  readonly backend: 'legacy' | 'baserow'
  readonly database?: TaskDatabasePort
  forRequest(input: TaskRepoRequest): TaskRepo
}

export function createTaskRepoFactory(options: {
  db: Queryable
  baserow?: BaserowClient
}): TaskRepoFactory {
  if (options.baserow) {
    return {
      backend: 'baserow',
      database: options.baserow,
      forRequest: ({ actor, source }) =>
        makeBaserowTaskRepo({
          database: options.baserow!,
          actor,
          ...(source ? { source } : {}),
        }),
    }
  }
  return {
    backend: 'legacy',
    forRequest: ({ actor, clock, genId }) =>
      makeTaskRepo({
        db: options.db,
        userId: actor.id,
        ...(clock ? { clock } : {}),
        ...(genId ? { genId } : {}),
      }),
  }
}

export function actorFromUser(user: {
  id: string
  name: string
  email: string
  role: string
}): TaskDatabaseActor {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}
