# 四境人生档案网站

当前定位：服务介绍、确定性四柱排盘与 DeepSeek 四境报告的公开体验入口。`/pilot` 无需邀请码、账号或 ChatGPT 登录即可使用。

## 路由

- `/`：介绍四轴方法、先盲断后核验、证据状态、服务方式和风险边界。
- `/pilot`：公开的基础排盘与详细解读入口。出生资料和用户主动填写的现实处境会提交到站点的分析接口，用于本次报告生成。

## 公开体验边界

- 页面使用 `domain/chart` 的确定性排盘引擎生成基础四柱结果。
- 用户主动提交后，Cloudflare Pages Function `/api/analyze` 才会调用 DeepSeek 生成详细报告。
- API Key 只配置在 Cloudflare Pages 服务端，不进入浏览器代码或静态资源。
- 现实处境字段用于本次分析请求；当前版本不提供用户账号、历史报告保存或付费后内容管理。
- 页面仍明确区分结构提示、现实事实和待核验内容，不把报告当作医疗、法律或财务专业意见。
- `domain/workflow` 已实现 `chart-case-workflow.v0.1` 纯函数状态机；它强制 Chart 准入、盲断隔离与锁定、追加版本、核验和前瞻资格，但尚未接 API、数据库和页面。
- `domain/privacy` 已实现 `data-ownership-lifecycle.v0.1` 的内存权限/生命周期原型，`db/schema.ts` 与首版迁移定义 13 表、复合租户约束、授权闸门和级联删除；它们只用于合成测试，当前站点没有连接 D1，也没有稳定身份、KMS/AEAD 或生产三数据域，禁止接真实资料。

## 部署前安全闸

- 必须把 `SITE_ORIGIN` 配成正式站点的唯一 `https` origin；未配置时非本地请求只生成 `example.invalid` 元数据，避免反射不可信 Host。
- `/pilot` 是公开页面；不设邀请码、账号登录或资料提交 API。
- 页面公开可访问，但用户应只提交自己愿意交给第三方模型处理的内容；不要填写证件号、银行卡号、联系方式或其他无关敏感资料。
- DeepSeek 密钥只通过 Cloudflare Pages Secret 配置，禁止写入仓库、前端代码或 `.env` 文件。
- 当前版本不提供真实数据持久化、账户体系或付费内容权限控制。
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
