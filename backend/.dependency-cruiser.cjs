// 闸 2（CI 红线）：越层 / 环 / 深 import / 跨域 物理禁止。
// 规则来自 docs/backend-package-structure.md §4.1，随各 BC 迁移逐步生效；
// P0 阶段仅有 kernel-*/contracts-*/apps，规则全绿（无违规可能）。
module.exports = {
  forbidden: [
    {
      name: 'domain-no-outward',
      comment: 'domain 只能依赖 kernel/contracts/platform-config，禁止向外依赖 infra/app/apps/platform',
      severity: 'error',
      from: { path: '^packages/domain-' },
      to: { path: '^packages/(infra-|app-|apps|platform-(?!config))' },
    },
    {
      name: 'app-no-concrete-infra',
      comment: 'application 只依赖 domain 端口，禁止依赖具体 infra 实现（DIP）',
      severity: 'error',
      from: { path: '^packages/app-' },
      to: { path: '^packages/infra-' },
    },
    {
      name: 'no-cross-domain',
      comment: 'domain-A 不得 import domain-B：跨域只经领域事件或 application 查询接口',
      severity: 'error',
      // dependency-cruiser 用 from 分组 + to.pathNot=$1 表达「不同包」，排除同包内部 import。
      from: { path: '^packages/(domain-[^/]+)/' },
      to: { path: '^packages/(domain-[^/]+)/', pathNot: '^packages/$1/' },
    },
    {
      name: 'agents-no-cross-import',
      comment: '专职 Agent 之间零 import，只走类型化 handoff；仅可依赖 core/contracts/tools/guards/llm/planner',
      severity: 'error',
      from: { path: '^packages/(agent-(?!core|contracts|tools|guards|llm|planner)[^/]+)/' },
      to: { path: '^packages/(agent-(?!core|contracts|tools|guards)[^/]+)/', pathNot: '^packages/$1/' },
    },
    {
      name: 'apps-isolated',
      comment: 'apps/* 互不依赖（各自 composition root）',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'contracts-pure',
      comment: 'contracts-* 仅依赖 kernel-*/contracts-*',
      severity: 'error',
      from: { path: '^packages/contracts-' },
      to: { path: '^packages/(?!kernel-|contracts-)' },
    },
    {
      name: 'no-circular',
      comment: '任何环禁止',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(\\.test\\.ts$|/dist/)' },
    tsPreCompilationDeps: true,
  },
};
