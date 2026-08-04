# 四派人生档案会诊网站

当前定位：服务介绍与首批封闭内测入口。

## 路由

- `/`：介绍四轴方法、先盲断后核验、证据状态、服务方式和风险边界。
- `/pilot`：首批 8—12 例的两阶段资料台。

## 封闭内测边界

- 第一阶段只生成出生资料包，不收人生经历。
- 第二阶段必须填写案例编号、盲断锁定编号和锁定时间。
- 页面不向服务器提交或保存填写内容；参与者主动复制资料包，通过约定的私密渠道传递。
- 服务、匿名研究和公开展示分别授权。
- 确定性排盘 v0 已在 `domain/chart` 中实现，但尚未接入页面或真实个案；当前仍没有真实账号接入、真实数据持久化、支付和线上 AI 会诊。
- `domain/workflow` 已实现 `chart-case-workflow.v0.1` 纯函数状态机；它强制 Chart 准入、盲断隔离与锁定、追加版本、核验和前瞻资格，但尚未接 API、数据库和页面。
- `domain/privacy` 已实现 `data-ownership-lifecycle.v0.1` 的内存权限/生命周期原型，`db/schema.ts` 与首版迁移定义 13 表、复合租户约束、授权闸门和级联删除；它们只用于合成测试，当前站点没有连接 D1，也没有稳定身份、KMS/AEAD 或生产三数据域，禁止接真实资料。

## 部署前安全闸

- 必须把 `SITE_ORIGIN` 配成正式站点的唯一 `https` origin；未配置时非本地请求只生成 `example.invalid` 元数据，避免反射不可信 Host。
- `PILOT_INVITE_CODE` 必须使用至少 128 bit 的随机值，不得使用姓名、日期或可猜短语；变更邀请码会立即撤销已有访问令牌。
- 必须在 Cloudflare 边缘为 `POST /pilot` 配置按来源的失败限流/告警。仓库内无法提供跨 Worker isolate 的可靠计数，因此这仍是公开部署阻断项。
- 在稳定身份适配器、服务端时间、KMS/AEAD、三数据域和生产 API 全部接通并复核前，`domain/privacy` 与 D1 迁移只能处理合成数据。

## 本地验证

要求 Node.js `>=22.13.0`。

```bash
pnpm dev
pnpm test
pnpm run typecheck:domain
pnpm run lint:domain
```

Sites 项目标识保存在 `.openai/hosting.json`。真实命例、精确出生资料、联系方式和私人经历不得写入本仓库。
