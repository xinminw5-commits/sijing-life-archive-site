import { ConsultationStarter } from "./ConsultationStarter";

const axes = [
  {
    number: "壹",
    title: "结构轴",
    subtitle: "先定主次，不急着下断语",
    body: "从月令、格局、成败与救应入手，先确认命局在讨论什么问题。结构尚未站稳，就不进入事件判断。",
    source: "《子平真诠》",
  },
  {
    number: "贰",
    title: "环境轴",
    subtitle: "看季节，也看现实条件",
    body: "辨别寒暖燥湿与第一病点，但不把某个五行直接写成万能答案；同一结构仍要接受真实环境校验。",
    source: "《穷通宝鉴》",
  },
  {
    number: "叁",
    title: "气机轴",
    subtitle: "判断有没有来源、路径与承载",
    body: "检查气从哪里来、到哪里去，是否受阻，避免只有格局名称，却没有真正能发生、能承接的条件。",
    source: "《滴天髓》",
  },
  {
    number: "肆",
    title: "事件轴",
    subtitle: "最后才谈年份与现实落点",
    body: "将宫位、十神与岁运翻译为可核对的事件候选，并由反方审查套话、迎合与事后强行对应。",
    source: "综合资料与现实验证",
  },
];

const steps = [
  ["01", "信息核对", "确认公历或农历、出生时间、地点与时间准确度。缺失的边界不靠猜。"],
  ["02", "盲断留痕", "在读取个人经历之前，先写下关键阶段、事件类别、依据与置信度。"],
  ["03", "人生时间轴", "再补充家庭、学业、工作、关系、迁移等已发生事实，先事实、后解释。"],
  ["04", "逐项核验", "明确标出命中、部分命中、未命中与无法判断，并保留替代解释。"],
  ["05", "专题会诊", "围绕当前问题形成共识、分歧、反证与后续观察点，不做无限陪聊。"],
];

const services = [
  {
    title: "首次校盘",
    label: "适合第一次接触",
    body: "完成资料边界核对、少量关键阶段盲断与第一轮事实核验，先确认这套方法是否值得继续。",
    items: ["出生信息核对", "3—5 个阶段候选", "首轮核验记录"],
  },
  {
    title: "完整个案会诊",
    label: "建立核心档案",
    body: "围绕人生时间轴做四轴合参，交付一致点、冲突点、可信度、替代解释与待验证问题。",
    items: ["四轴底盘", "人生事件时间轴", "共识与反证清单"],
    featured: true,
  },
  {
    title: "专题复盘",
    label: "聚焦一个现实问题",
    body: "在既有档案基础上分析职业、关系、迁移或年度主题，只调用与当前任务有关的材料。",
    items: ["单一主题深挖", "相关年份核验", "后续观察点"],
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="四派人生档案会诊首页">
          <span className="brand-seal">四</span>
          <span>
            <strong>人生档案会诊</strong>
            <small>FOUR-LENS LIFE ARCHIVE</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#method">会诊方法</a>
          <a href="#process">咨询流程</a>
          <a href="#services">服务方式</a>
          <a className="nav-cta" href="#prepare">开始准备</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grain" aria-hidden="true" />
        <div className="hero-copy">
          <p className="eyebrow"><span /> 四派人生档案会诊</p>
          <h1>
            不急着告诉你答案，
            <em>先把判断留在经历之前。</em>
          </h1>
          <p className="hero-lead">
            以结构、环境、气机、事件四条轴线，建立一份可核验、可修正、持续理解你的人生命理档案。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#prepare">准备一次咨询 <span>→</span></a>
            <a className="text-link" href="#process">先看我们怎么判断 <span>↘</span></a>
          </div>
          <ul className="trust-list" aria-label="服务原则">
            <li><b>先盲断</b><span>后核验</span></li>
            <li><b>敢说不知道</b><span>保留冲突</span></li>
            <li><b>隐私默认不留存</b><span>经允许才建档</span></li>
          </ul>
        </div>

        <div className="hero-visual" aria-label="结构、环境、气机、事件四轴示意">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-inner" />
          <span className="orbit-label label-structure">结构<small>主次与成败</small></span>
          <span className="orbit-label label-environment">环境<small>寒暖与条件</small></span>
          <span className="orbit-label label-energy">气机<small>来源与承载</small></span>
          <span className="orbit-label label-event">事件<small>年份与现实</small></span>
          <div className="orbit-core">
            <span>人生</span>
            <strong>档案</strong>
            <small>可核验 · 可修正</small>
          </div>
          <div className="visual-note">
            <span className="note-index">反方席</span>
            <p>这句话是事前判断，还是看完经历后的解释？</p>
          </div>
        </div>
      </section>

      <section className="principle-strip" aria-label="核心原则">
        <p>不是一份“谁都像”的模板报告</p>
        <span aria-hidden="true">◆</span>
        <p>而是一段有依据、有反证、有版本的人生会诊</p>
      </section>

      <section className="section method-section" id="method">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span /> 判断底盘</p>
            <h2>四轴各司其职，<br />不把几本书混成一锅。</h2>
          </div>
          <p>
            过往整理最重要的经验，是先分清每套体系在回答什么，再允许它们互相校验。结论越具体，越需要条件、边界和现实证据。
          </p>
        </div>
        <div className="axis-grid">
          {axes.map((axis) => (
            <article className="axis-card" key={axis.title}>
              <div className="axis-topline">
                <span>{axis.number}</span>
                <small>{axis.source}</small>
              </div>
              <h3>{axis.title}</h3>
              <h4>{axis.subtitle}</h4>
              <p>{axis.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section process-section" id="process">
        <div className="section-heading centered-heading">
          <p className="eyebrow"><span /> 会诊流程</p>
          <h2>先判断，后核验。<br />把“算到的”和“后来解释的”分开。</h2>
        </div>
        <div className="process-layout">
          <ol className="steps-list">
            {steps.map(([number, title, body]) => (
              <li key={number}>
                <span className="step-number">{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <aside className="verification-card">
            <div className="verification-head">
              <div>
                <span>核验界面示意</span>
                <strong>关键阶段 · 2021</strong>
              </div>
              <span className="status-dot">已锁定</span>
            </div>
            <div className="verification-row">
              <span>事前判断</span>
              <p>原有的工作、城市或责任结构可能被放大，需要留意身份与承载方式的变化。</p>
            </div>
            <div className="verification-row">
              <span>事实回填</span>
              <p className="muted">由当事人先填写已发生的事实，不展示命理提示。</p>
            </div>
            <div className="match-grid">
              <button type="button">命中</button>
              <button type="button">部分命中</button>
              <button type="button" className="selected">未核验</button>
              <button type="button">无法判断</button>
            </div>
            <div className="review-note">
              <span>反方审查</span>
              <p>若事实不能明确落到时间与领域，不记作命中；单个个案也不会让一条规则自动升级。</p>
            </div>
            <small className="sample-disclaimer">示例只演示核验方法，不代表真实命例或咨询结论。</small>
          </aside>
        </div>
      </section>

      <section className="section evidence-section">
        <div className="evidence-copy">
          <p className="eyebrow light"><span /> 可信度表达</p>
          <h2>完整，不等于已经验证。</h2>
          <p>我们把规则状态、现实证据与风险边界分开，让你知道一条判断凭什么成立，也知道什么情况会推翻它。</p>
        </div>
        <div className="evidence-levels">
          <article>
            <span className="level-mark formal">正</span>
            <div><h3>正式规则</h3><p>来源、条件、失效边界与互证关系齐全，可以进入对应层级的正式分析。</p></div>
          </article>
          <article>
            <span className="level-mark candidate">候</span>
            <div><h3>候选判断</h3><p>可以提出可能性，但必须保留替代解释，不能写成必然发生的事实。</p></div>
          </article>
          <article>
            <span className="level-mark risk">慎</span>
            <div><h3>低权重风险象</h3><p>疾病、灾祸、寿元等不作确定结论；高风险问题会停止命理推演。</p></div>
          </article>
        </div>
      </section>

      <section className="section services-section" id="services">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span /> 服务方式</p>
            <h2>购买一个完整阶段，<br />不是购买无限聊天。</h2>
          </div>
          <p>先用小范围核验建立信任，再决定是否建立完整档案。后续咨询从已有理解继续，不必每次从零开始。</p>
        </div>
        <div className="service-grid">
          {services.map((service) => (
            <article className={`service-card${service.featured ? " featured" : ""}`} key={service.title}>
              {service.featured && <span className="recommended">核心服务</span>}
              <small>{service.label}</small>
              <h3>{service.title}</h3>
              <p>{service.body}</p>
              <ul>
                {service.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
              <a href="#prepare">查看准备清单 <span>→</span></a>
            </article>
          ))}
        </div>
      </section>

      <section className="section prepare-section" id="prepare">
        <div className="prepare-intro">
          <p className="eyebrow light"><span /> 开始之前</p>
          <h2>你不需要整理完整人生，<br />只要带来一个真问题。</h2>
          <p>先选择最想理解的主题，我们会给你一份最小准备清单。清单只在当前设备生成，不会提交或保存你的资料。</p>
          <div className="privacy-note">
            <span>隐私原则</span>
            <p>默认不留存个人信息；只有你明确同意建档、保存或加入匿名验证时，才进入长期档案。</p>
          </div>
        </div>
        <ConsultationStarter />
      </section>

      <section className="section boundaries-section">
        <div>
          <p className="eyebrow"><span /> 服务边界</p>
          <h2>有些问题，应该回到现实世界。</h2>
        </div>
        <div className="boundary-grid">
          <p><b>不作确定性灾祸判断</b>不预测死亡、严重疾病或必然发生的伤害。</p>
          <p><b>不代替专业意见</b>医疗、法律、投资与心理危机问题，请寻求合资格的现实支持。</p>
          <p><b>不靠恐惧促成消费</b>不使用倒计时、危险悬念、改命或“解锁灾祸”等方式推动续费。</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-seal">四</span>
          <span><strong>人生档案会诊</strong><small>有根 · 有证 · 有反思</small></span>
        </a>
        <p>命理用于观察与对话，不替代个人选择和现实行动。</p>
        <a href="#top">回到顶部 ↑</a>
      </footer>
    </main>
  );
}
