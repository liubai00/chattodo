// @linx/infra-tasks-pg — Tasks BC 的 Postgres 仓储实现 + DDL + row↔domain 映射。
export { TASKS_DDL } from './ddl.js'
export { rowToTask, rowToIdea, rowToNon, rowToRecord } from './mappers.js'
export {
  makeTaskRepo,
  makeIdeaRepo,
  makeNonTodoRepo,
  makeCaptureRecordRepo,
  makeCorrectionRepo,
  type Queryable,
  type RepoDeps,
} from './repos.js'
