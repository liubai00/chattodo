验证完毕。关键事实核对结果:collab↔friends 循环**真实存在**(`collab.js` import `friends.js` 的 `areFriends/requestFriendByIdFx`;`friends.js` import `collab.js` 的 `pushNotification`);God-file 属实(`chat.js` 379 行 import `agentChat.js` 340 行,双向耦合);21 表属实;**现网 Redis 配置为 `--save "" --appendonly no --maxmemory 64mb --maxmemory-policy allkeys-lru`**;deploy compose 为单容器 `container_name: chattodo-api` + 固定端口 `127.0.0.1:8788:8787`。以下是对抗式评审。

---

# LinX 后端重构架构 · 首席对抗式评审

**一句话结论**:方向正确、四份草案调和度高、循环消解与 God-file 拆解思路成立;但**存在 4 个会直接违反硬约束(数据零丢失 / 契约稳定)的 Blocker,和一批跨文档内部矛盾**。当前形态**可作为架构方向,但不能直接作为落地蓝图**——必须先关闭 🔴 项,否则照此实现会静默丢数据、破坏前端契约。

---

## 🔴 Blocker(违反硬约束,落地前必须修)

### B1. 可靠投递骨架(outbox→BullMQ)跑在会驱逐 key、无持久化的 Redis 上 —— 直接作废"数据零丢失"
- **问题**:ADR-013/014 把 outbox→BullMQ 定为"唯一可靠投递机制",承 at-least-once/重试/DLQ。但现网 Redis 实配 `--appendonly no --save "" --maxmemory-policy allkeys-lru`。BullMQ **强制要求 `noeviction` + 持久化**;在 `allkeys-lru` 下队列/锁 key 会被驱逐,重启丢全部 job → at-least-once 退化为**静默 at-most-once**。同一 Redis 还承 `platform-ratelimit`(计数被驱逐→限流静默放宽,触碰安全底线)、`platform-idempotency`(SETNX key 被驱逐→幂等失效→"每任务每天一次"提醒/通知扇出**重复**)。
- **影响**:outbox 只保证"事务内落行",但 relay 之后 BullMQ 把它丢了;通知/跨用户 pushChat/协作清理等可靠副作用会丢或重复。**这正是硬约束最禁止的两件事**。主 ADR §7/§20 与 outbox 细化文档把"Redis 7"当作现成可用,只有迁移文档 §9.2 用一句脚注承认"需单独 AOF Redis"——反证主决策未落地。
- **修正**:升为显式 ADR:队列/幂等/限流走 `noeviction + AOF` 的独立逻辑实例(或独立 `chattodo-queue-redis` 容器);易失缓存(`platform-cache`)才可 LRU;两者物理隔离。compose 必须同步改(现 64mb allkeys-lru 单实例是数据面隐患,不是配置细节)。

### B2. TEXT→timestamptz 回填硬编码 `Asia/Shanghai`,极可能整库偏移 8 小时
- **问题**:迁移文档 §4.3 用 `(due_at::timestamp AT TIME ZONE 'Asia/Shanghai')` 把 naive TEXT 解释为北京墙钟。但现网 `nowIso` 用**服务器本地时区**的 `getHours()` 写入,而生产容器是 `node:*` + `postgres:16-alpine`,**默认 TZ 通常是 UTC**(compose 未设 `TZ`)。若写入时是 UTC,却按 Asia/Shanghai 解释,则**所有** due/planned/created 时间被系统性平移 8 小时,且迁移"成功"、无报错。
- **影响**:静默数据损坏,违反零丢失。到期提醒、今日视图、排序全错。
- **修正**:先确定这些值实际是用哪个 TZ 写的(查运行容器 `TZ`/`date`、抽样已知记录核对),**不得硬编码**;提供 dry-run diff(回填前后对同一批记录人工核对)后再执行。

### B3. 错误信封:两份细化文档给出**互斥的 wire format**,踩中"API 契约稳定"
- **问题**:横切文档 §1.2 定义 `ErrorEnvelope = { error: { code, message, details, requestId } }`(`error` 是**嵌套对象**);API 契约文档 §2.1 **明确否决**该形状("被否方案 B…前端读 `body.error` 为字符串会显示 `[object Object]`"),坚持 `error: string` + 平级 `code`。主 ADR #26 只说"类型化统一序列化",未裁决。
- **影响**:两个实现者按不同文档做,一个破坏前端、一个安全。这是硬约束面(契约稳定)上的未消解矛盾。
- **修正**:以 API 契约文档的解(`error:string` 平级加 `code/requestId`,成功体裸传)为准,写回主 ADR;横切文档 §1.2 必须改。这是"调和"没做完的地方。

### B4. worker 编排 + BullMQ 重试 → 半程崩溃产生**重复副作用**
- **问题**:ADR-017 把 LLM 整段编排下沉 worker(`chat.orchestrate`,`attempts:3`),API 侧 SSE 订阅 `publishLive(userId+turnId)`。`idempotencyKey=turnId` 只去重**入队**;BullMQ 重试是**从头重跑 processor**。若 worker 在"已 create_task、未走完 Guard"时崩溃,重试会**再创建一个任务**——而设计里只有 `collab.invite` 标了 `idempotent:true`,`task.create` 没有。无 checkpoint/补偿。
- **影响**:一次 worker 抖动 = 用户多出一条重复任务/重复邀请。触碰数据正确性。
- **修正**:整段编排必须**整体幂等或分步 checkpoint**——要么每个写 action 都带幂等键(`turnId+actionRef`)落 `platform-idempotency`(且该 Redis 须 `noeviction`,见 B1),要么把"已执行 action"落 DB 供重放跳过。另需定义 SSE 客户端断连/turn 超时后 job 的取消语义。

---

## 🟠 High(架构级缺陷 / 内部矛盾)

### H5. `--scale api=N` 与实际 compose 冲突,水平扩展故事不可部署
- **问题**:compose 设 `container_name: chattodo-api` + 固定 `127.0.0.1:8788:8787`,二者都**阻止** `docker compose up --scale`(名字冲突 + 宿主端口冲突)。ADR-020/迁移 §9.2 声称"无状态副本线性扩、nginx upstream 列多端口",但从未给出可用的多副本 compose(去 container_name、端口区间/多 service、真实 upstream 块)。连接池 `api=10`,N=10 即 100 连接撞 Postgres 默认 `max_connections=100`,而 pgBouncer 门槛设在">60 连接"——**默认池大小在 pgBouncer 介入前就先耗尽连接**。
- **影响**:北极星②④的"可水平扩展"是断言而非可交付物。
- **修正**:给出真实多副本 compose + nginx upstream + 与副本数匹配的池大小公式;或诚实降级为"先垂直、副本为二期"。

### H6. UUIDv7 落地:默认"保持 `text`"与 schema/ERD 的 `uuid` 类型**自相矛盾**
- **问题**:数据文档 §4.4 **默认决策**是"`id` 保持 `text`,只把生成器换 UUIDv7 字符串,跳过整库 remap";但 §2.1/schema.ts 草图写 `id: uuid('id').primaryKey()`,横切 `asUuid` 还带 uuid 正则校验。列是 `text` 而 Drizzle 声明 `uuid` → 读到 `u_default`/`conv_...` 旧值即类型错;`asUuid` 正则会拒绝所有 legacy id。
- **影响**:实现者撞墙;新旧 id 格式永久混存,任何假设 uuid 格式的校验都误伤存量。
- **修正**:二选一并全文对齐——要么真做 remap(承担风险),要么 schema 用 `text`、放弃 uuid 列类型与正则校验,明确"UUIDv7 仅作新值生成策略"。

### H7. 全库取消 FK + 用领域事件保完整性 —— 为不会发生的分库牺牲真实完整性
- **问题**:数据文档决定"基线零 FK",跨 context 引用(`tasks.project_id`、`source_idea_id`、`task_collaborators.task_id`)完整性"由 application + 领域事件保证"。但实时事件"至多一次可丢",可靠清理依赖 outbox(见 B1 尚不可靠)。理由是"便于分库演进"——而目标是 10k 用户 / 单机,**永远不会分库**。
- **影响**:项目删除→`tasks.project_id` 悬垂,事件一丢即**永久孤儿**。这是用过度设计**降低**了一个硬约束(数据完整性)。
- **修正**:同库内该加的 FK(`ON DELETE SET NULL/CASCADE`)就加,单 Postgres 成本极低且比事件驱动清理更可靠;把"无 FK"留给真出现分库需求时。

### H8. outbox 表本身未定义 + relay 多副本无去重锁
- **问题**:outbox 是可靠性骨架,但**全套文档没有给出 outbox 表结构**(列/索引/dedup/状态机)。relay "LISTEN/NOTIFY 或轮询",但没说**谁跑 relay**;若每个 `apps/worker` 副本都跑,无 `FOR UPDATE SKIP LOCKED`/advisory lock 就会**重复 enqueue**。advisory lock 只用在了 migration/pg_dump/session-GC,唯独 relay 没有。
- **影响**:多 worker 下 outbox 重复投递(叠加 B1 幂等失效 = 重复副作用)。
- **修正**:补 outbox 表 DDL;relay 用 `SELECT … FOR UPDATE SKIP LOCKED` 批claim,或单副本 leader(advisory lock)。

### H9. 破坏性迁移:"每迁移单事务" 与 "大表分批回填" 直接冲突
- **问题**:runner 契约把每个迁移文件包在一个 `BEGIN/COMMIT`;但 §5.2 又要求 timestamptz 回填"worker 分批 UPDATE"。5M 行(1万×500)单事务 `UPDATE` = 长锁 + WAL 膨胀;而分批又不可能在同一事务里。
- **影响**:要么长锁阻塞在线写(伤并发),要么违背自己的 runner 契约。
- **修正**:区分"schema DDL(单事务)"与"数据回填(事务外分批、幂等、可续跑)"两类迁移步骤,runner 支持 non-transactional/batched 迁移类型。

### H10. "collab↔friends 循环结构上不可能再现" —— 表述过强
- **问题**:消环靠 `FriendCircleQuery`(读)+ `friendship.removed`(反向)+ handoff,方向上成立。但 dependency-cruiser 只硬禁 `domain-A→domain-B` 与 `agent↔agent`;**app 层允许 `app→app` 查询接口**(eslint `from:'app' allow:['app']`无限制)。即 `app-social→app-collaboration` 在架构上**并不被结构禁止**,只被 CI 的 `no-circular` 事后拦截。
- **影响**:"结构上不可能"言过其实,实为"CI 可捕获"。app 层循环仍是敞口。
- **修正**:把表述降级为准确的"CI 门禁拦截";如需结构保证,给 app→app 也加"仅通过声明式查询接口包(如 `app-social-query`)"的更细规则。

---

## 🟡 Medium

| # | 问题 | 影响 | 修正 |
|---|---|---|---|
| M1 | **包数量未决:结构文档列 ~78 又说"合并到 45–60",无最终数;agent 包 15/16、kernel 6/7 跨文档不一致。** 停止条件("独立不变量/独立变更理由")写了但**没实际应用**去裁剪 | ⑤虽要求"包多",但每包 5 个配置文件(pkg/tsconfig/tsup/vitest/barrel)×60–78 ≈ 300–400 个样板;且**新增一实体要动 5 个包 + 5 个 tsconfig references**,直接给北极星①上税,而文档称①⑤两全 | 真正跑一遍停止条件落到确切数;承认①⑤张力;考虑"一 context 少数包 + 文件夹级 depcruise 规则"作为**首期**粒度(边界照样强制,免 npm-package 税),需要时再拆层为独立包 |
| M2 | **有状态 session + Redis 热缓存重新引入了它本要消除的吊销延迟。** `revokeAllExcept` 删 PG 行,但已缓存该 token 的其它副本在 TTL 内仍放行;无跨副本缓存失效(pub/sub busting) | "改密即吊销/即时封禁"被缓存拖成"最多延迟 TTL 才生效",而这正是选有状态的理由 | 明确 max 吊销延迟(短 TTL)或 revoke 时发 pub/sub 令各副本清缓存 |
| M3 | **baseline `--mark-applied` 无 drift 校验。** 21 表由累积的 `ALTER IF NOT EXISTS`+内联回填建成,`drizzle-kit pull` 生成的 0000 与真实 prod schema 很可能有细微差异,标记"已应用"却不执行 → 新环境(执行 0000)与 prod 分叉 | 环境间 schema 漂移,难排查 | mark-applied 前加校验:空库执行 0000 后与 prod pull 结果做 schema diff,作 gate |
| M4 | **生产优雅关闭序列未定义;反复引用的"PGlite syncToFs 顺序"是测试态概念被当生产不变量。** 生产是 pg.Pool,真正要处理的是:停止收流量→排空 in-flight HTTP→干净关闭 SSE(令客户端重连)→worker 续锁/排空 job→最后关池;SIGTERM 在 `restart: unless-stopped` 下的行为未述 | 关停期丢在途请求/SSE 悬挂/job 锁未释放 | 分别定义 api / worker 的关停序列;把 syncToFs 明确标注为仅测试 |
| M5 | **中文全文检索用 `to_tsvector('simple', …)`,`simple` 不切中文词**;文档把 pg_trgm 仅列为"可选" | 中文产品搜索静默劣化(可能不如现网 LIKE) | CJK 默认走 pg_trgm GIN,`simple` FTS 作补充 |
| M6 | **`platform-config` 令 `REDIS_URL` 必填(fail-fast),与现网"Redis 可选 + 进程内回退"矛盾** | dev/单机/无 Redis 场景启动即挂,削弱了被列为"值得保留"的进程内回退 | env schema 对 REDIS_URL 用条件必填(prod 必填、dev/test 可空回退) |

---

## ⚪ Low(仍应记录)

- **L1 依赖从 6 个膨胀到数十个,Vercel AI SDK 边际收益低**:诚实守卫、reply 增量提取、口径逻辑**明确保留在 in-house**,SDK 主要替换的是一段**已能工作的流式 fetch**;OTel/FlowProducer 对 10k 用户属投机。建议 SDK/OTel 标为"二期按需",首期保留精简 fetch adapter。需求文档明确珍视"仅 6 个生产依赖",本设计钟摆甩到另一极端。
- **L2 domain 可 import platform 的规则两文档不一致**:主 ADR 排除 `platform-config`、结构文档排除 `platform-observability`——且允许 domain→任一 platform 就**戳破"domain 只依赖 kernel+contracts"的纯度**。domain 内日志应走注入端口/kernel,不 import platform。
- **L3 agent→app 的 eslint 边界过松**:`from:'agent' allow:['app']` 允许专职 Agent **绕过 ToolBelt 直调 app use-case**,架空 ToolBelt 的权限收口(scope/好友圈)。应收紧为"仅 `agent-tools` 可 import `app-*`"。
- **L4 Fastify plugin 作 DI**:静态依赖图用 `decorate` 单例可行,但**跨 40–60 包的 composition root(`bootstrap.ts`)会变成巨型手工装配文件**,本身有 God-file 风险;应按 context 拆分注册函数并给出装配顺序测试。

---

## 专项裁决

**五北极星逐一**
| | 裁决 | 关键保留意见 |
|---|---|---|
| ① 易扩展 | **部分达成** | 模板清晰,但 layer×context 细拆使"新增一实体动 5 包 5 tsconfig"——①与⑤实为张力,文档未诚实标注上税(M1) |
| ② 高并发 | **纸面达成、地基有洞** | 无状态副本/keyset/N+1 收敛正确;但限流/幂等跑在会驱逐的 Redis(B1)、`--scale` 不可部署(H5) |
| ③ 多 Agent 协同 | **编排设计扎实,失败面有洞** | 确定性 Orchestrator + Planner 差异收敛是亮点;但 worker 重试重复副作用(B4)、handoff 超深度**静默 continue 丢弃**(用户的 @邀请会无声消失,需 DLQ/回执) |
| ④ 万人级 | **过度架构** | 10k 用户/单机是**小规模**,I/O 密集单进程+少量副本足矣;outbox+BullMQ+Streams 否决+Flow+OTel 的重机械与规模不匹配,且其可靠性又被 B1 作废——"上了重装备却装在会漏的底座上",比不上或做对都差 |
| ⑤ 细粒度多包 | **达成但未收口** | 硬约束确实要"包多",这点尊重;但 78 vs 45–60 未决、跨文档计数不一(M1),且 app↔app 循环未被结构禁止(H10) |

**硬约束**
- API 契约稳定:🔴 未达(错误信封矛盾 B3;成功体裸传的解正确)
- 数据零丢失:🔴 未达(B1 可靠投递作废、B2 时区偏移、H9 回填锁、B4 重复)
- 单机 Docker / `/todo/` 不影响现站:🟡 现站隔离设计 OK,但多副本 compose 不可用(H5)、需再加 AOF Redis(B1)
- 多实例安全:🟡 session/限流/幂等三处都因共享 Redis 驱逐或缓存陈旧而打折(B1/M2)
- 优雅关闭落盘:🟡 生产序列未定义、错把测试态当不变量(M4)
- SSRF:🟢 两道闸(静态形态 + 运行时解析 IP 拒私网/元数据)设计到位,是全套里最扎实的横切
- 保留诚实守卫/协作三态等领域逻辑:🟢 明确下沉 `agent-guards` 固定管线并迁移 159 用例,方向正确

**过度设计判定**:是,且集中在④⑤的机械化(78 包 + Turborepo/三闸/per-package tsup、outbox+BullMQ+Flow+OTel、Vercel AI SDK)。真正伤害的是——**复杂度不是白花,而是花在了会削弱硬约束的地方**(取消 FK 伤完整性 H7;重可靠机械跑在会漏的 Redis B1)。

**循环依赖是否真消除**:collab↔friends 的**具体**环(现网 `areFriends`/`pushNotification` 双向)按新方案可断(前向→查询接口、反向→事件、通知改归 notifications context),这点成立且有价值。但"结构上不可能再现"过强:app 层循环只被 CI 拦截,非结构禁止(H10)。

**包粒度**:偏向"碎到有维护税"一侧。⑤要求多包我尊重,但设计**没执行自己的停止条件**收口到确切数,也没正视每包 5 配置 × 数十包的样板成本与①的冲突。

**Agent 失败/超时/回退覆盖度**:LLM provider 失败→熔断→RulePlanner→create_idea 兜底,**这条链完整且优秀**。但缺:worker 崩溃重试的幂等(B4)、handoff 超限的用户可见回执(现为静默丢弃)、turn 级超时与 SSE 断连后的 job 取消。

---

## 总体结论:能否作为下一步实现蓝图

**作为架构方向——可以**:分层 DIP、Planner 收敛消 God-file、SSRF、Strangler 渐进迁移、契约冻结+对拍、consumer 幂等意识,都是对的骨架,四草案调和度也高。

**作为可直接开工的蓝图——尚不能**。在关闭以下之前照此实现会**静默丢数据 / 破坏前端契约**——恰是硬约束最禁止的两件事:
1. B1 Redis/BullMQ 可靠性地基(否则可靠投递、限流、幂等全失效)
2. B2 timestamptz 时区假设(否则整库时间偏移)
3. B3 错误信封跨文档矛盾(否则前端破)
4. B4 worker 编排幂等/失败路径
5. H5 多副本 compose 落地 + H6 uuid/text 统一 + H7 FK/完整性重议 + H8 outbox 表与 relay 锁

建议顺序:先补一份**《运行时可靠性与数据面 ADR》**统一裁决 Redis 拓扑/持久化、幂等、outbox DDL 与 relay 锁、时区回填验证、worker 重试语义;同时把 B3/H6/M1/L2 这类跨文档矛盾在主 ADR 里一次性拍死。这些是"调和"环节遗留的真空,补上后即可作为 P0–P1 的施工图。
