import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChartIcon,
  BellIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  ChevronRightIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  EyeOpenIcon,
  FileTextIcon,
  GearIcon,
  ImageIcon,
  InfoCircledIcon,
  LockClosedIcon,
  PersonIcon,
  ReloadIcon,
  Share2Icon,
  TrashIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, Carousel, KeyboardInput, MobileScroll, useKeyboard } from "./mobile";

type Screen =
  | "welcome"
  | "privacy"
  | "practice"
  | "capture"
  | "quality"
  | "analyzing"
  | "results"
  | "mine"
  | "wordbook"
  | "growth"
  | "feedback"
  | "privacyData"
  | "share";

type QualityMode = "ready" | "blurred" | "partial" | "offline";
type ResultMode = "complete" | "partial" | "degraded";

const characters = [
  { char: "永", score: 88, tone: "good" },
  { char: "和", score: 84, tone: "good" },
  { char: "春", score: 82, tone: "good" },
  { char: "山", score: 91, tone: "good" },
  { char: "日", score: 86, tone: "good" },
  { char: "月", score: 62, tone: "warn" },
  { char: "天", score: 89, tone: "good" },
  { char: "地", score: 0, tone: "uncertain" },
  { char: "人", score: 0, tone: "failed" },
] as const;

const dimensions = [
  ["笔画规范", 68],
  ["间架结构", 61],
  ["字形比例", 70],
  ["位置布局", 58],
  ["稳定性", 55],
] as const;

const analysisStages = ["检查图片", "切分方格", "识别文字", "对比字形", "生成建议", "保存结果"];

function getInitialScreen(): Screen {
  const requested = new URLSearchParams(window.location.search).get("screen") as Screen | null;
  return requested && ["welcome", "privacy", "practice", "capture", "quality", "analyzing", "results", "mine", "wordbook", "growth", "feedback", "privacyData", "share"].includes(requested)
    ? requested
    : "welcome";
}

function getInitialQualityMode(): QualityMode {
  const mode = new URLSearchParams(window.location.search).get("mode") as QualityMode | null;
  return mode && ["ready", "blurred", "partial", "offline"].includes(mode) ? mode : "ready";
}

function getInitialResultMode(): ResultMode {
  const mode = new URLSearchParams(window.location.search).get("resultMode") as ResultMode | null;
  return mode && ["complete", "partial", "degraded"].includes(mode) ? mode : "complete";
}

function getInitialSampleCount() {
  const value = Number(new URLSearchParams(window.location.search).get("samples") ?? 4);
  return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.round(value))) : 4;
}

function getInitialCharacterIndex() {
  return new URLSearchParams(window.location.search).get("state") === "wrong" ? 3 : 5;
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const [screen, setScreen] = useState<Screen>(getInitialScreen);
  const [history, setHistory] = useState<Screen[]>([]);
  const [targetText, setTargetText] = useState("永和春山日月天地人");
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [guardianChecked, setGuardianChecked] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>(getInitialQualityMode);
  const [resultMode, setResultMode] = useState<ResultMode>(getInitialResultMode);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [selectedCharacter, setSelectedCharacter] = useState(getInitialCharacterIndex);
  const [sampleCount] = useState(getInitialSampleCount);
  const [wrongState] = useState(() => new URLSearchParams(window.location.search).get("state") === "wrong");
  const [compareMode, setCompareMode] = useState<"overlay" | "parallel">("overlay");
  const [exceptionSheet, setExceptionSheet] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [toast, setToast] = useState("");

  const navTo = (next: Screen, replace = false) => {
    keyboard.hide();
    if (!replace) setHistory((items) => [...items, screen]);
    setScreen(next);
  };

  const goBack = () => {
    keyboard.hide();
    setHistory((items) => {
      const next = [...items];
      setScreen(next.pop() ?? "practice");
      return next;
    });
  };

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  useEffect(() => {
    if (screen !== "analyzing") return;
    setAnalysisStep(0);
    const stageTimer = window.setInterval(() => {
      setAnalysisStep((current) => Math.min(analysisStages.length, current + 1));
    }, 520);
    const finishTimer = window.setTimeout(() => {
      window.clearInterval(stageTimer);
      setAnalysisStep(analysisStages.length);
    }, 3200);
    return () => {
      window.clearInterval(stageTimer);
      window.clearTimeout(finishTimer);
    };
  }, [screen]);

  useEffect(() => {
    if (keyboard.visible && screen !== "practice" && screen !== "feedback") keyboard.hide();
  }, [keyboard, screen]);

  const showBottomNav = ["practice", "results", "mine", "wordbook", "growth"].includes(screen);
  const activeTab = screen === "mine" || screen === "wordbook" ? "mine" : "practice";

  return (
    <div className="prototype-shell" data-testid="prototype-shell">
      <MobileScroll className={`app-screen screen-${screen}`}>
        <main className="screen-content" data-testid={`screen-${screen}`} aria-label={screenLabel(screen)}>
          {screen === "welcome" && <Welcome onStart={() => navTo("privacy")} onExplain={() => flash("这里会说明产品用途与数据处理方式")} />}
          {screen === "privacy" && (
            <Privacy
              privacyChecked={privacyChecked}
              guardianChecked={guardianChecked}
              onPrivacy={setPrivacyChecked}
              onGuardian={setGuardianChecked}
              onContinue={() => navTo("practice")}
              onBack={goBack}
            />
          )}
          {screen === "practice" && (
            <Practice
              targetText={targetText}
              onTargetText={setTargetText}
              onCapture={() => navTo("capture")}
              onContinuePending={() => {
                setResultMode("complete");
                navTo("analyzing");
              }}
              onResults={() => navTo("results")}
              onExceptions={() => setExceptionSheet(true)}
            />
          )}
          {screen === "capture" && <Capture onBack={goBack} onShot={() => navTo("quality")} onGallery={() => navTo("quality")} />}
          {screen === "quality" && (
            <Quality
              mode={qualityMode}
              targetText={targetText}
              onBack={goBack}
              onRetake={() => navTo("capture")}
              onSubmit={() => {
                if (qualityMode === "offline") {
                  navTo("practice");
                  flash("已保存到本地，联网后可继续上传");
                } else {
                  navTo("analyzing");
                }
              }}
            />
          )}
          {screen === "analyzing" && (
            <Analyzing
              step={analysisStep}
              mode={resultMode}
              onCancel={() => setCancelSheet(true)}
              onLeave={() => navTo("practice")}
              onResults={() => navTo("results")}
            />
          )}
          {screen === "results" && (
            <Results
              mode={resultMode}
              sampleCount={sampleCount}
              wrongState={wrongState}
              selected={selectedCharacter}
              compareMode={compareMode}
              onSelect={setSelectedCharacter}
              onCompareMode={setCompareMode}
              onGrowth={() => navTo("growth")}
              onFeedback={() => navTo("feedback")}
              onShare={() => navTo("share")}
            />
          )}
          {screen === "mine" && <Mine onWordbook={() => navTo("wordbook")} onPrivacy={() => navTo("privacyData")} onFeedback={() => navTo("feedback")} />}
          {screen === "wordbook" && <Wordbook onBack={goBack} onGrowth={() => navTo("growth")} onPractice={() => navTo("capture")} />}
          {screen === "growth" && <Growth sampleCount={sampleCount} onBack={goBack} onPractice={() => navTo("capture")} />}
          {screen === "feedback" && <Feedback onBack={goBack} onSubmit={() => { navTo("analyzing", true); setResultMode("complete"); }} />}
          {screen === "privacyData" && <PrivacyData onBack={goBack} onDelete={() => navTo("share")} />}
          {screen === "share" && <ShareAndDelete onBack={goBack} onShare={() => flash("已生成脱敏结果卡，可由监护人确认后分享")} onDelete={() => { navTo("practice", true); flash("模拟删除完成：图片与结果已移除"); }} />}
        </main>
      </MobileScroll>

      {showBottomNav && (
        <BottomNav
          active={activeTab}
          onPractice={() => navTo("practice")}
          onCapture={() => navTo("capture")}
          onMine={() => navTo("mine")}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      <BottomSheet open={exceptionSheet} onOpenChange={setExceptionSheet} title="查看原型异常状态" description="选择一个固定场景，方便联合评审。">
        <div className="sheet-actions">
          <button onClick={() => { setQualityMode("blurred"); setExceptionSheet(false); navTo("quality"); }}><ExclamationTriangleIcon /> 图片模糊，需要重拍</button>
          <button onClick={() => { setQualityMode("partial"); setExceptionSheet(false); navTo("quality"); }}><InfoCircledIcon /> 部分方格可以处理</button>
          <button onClick={() => { setQualityMode("offline"); setExceptionSheet(false); navTo("quality"); }}><UploadIcon /> 断网，本地待提交</button>
          <button onClick={() => { setResultMode("degraded"); setExceptionSheet(false); navTo("results"); }}><ReloadIcon /> 建议服务降级</button>
          <button onClick={() => { setResultMode("partial"); setExceptionSheet(false); navTo("results"); }}><Cross2Icon /> 部分单字分析失败</button>
        </div>
      </BottomSheet>

      <BottomSheet open={cancelSheet} onOpenChange={setCancelSheet} title="取消本次分析？" description="已上传的图片会保留到你确认删除，取消后不会写入字本。">
        <div className="sheet-actions compact">
          <button className="danger-button" onClick={() => { setCancelSheet(false); navTo("practice", true); }}>确认取消</button>
          <button onClick={() => setCancelSheet(false)}>继续分析</button>
        </div>
      </BottomSheet>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img src="/app-assets/logo.png" alt="字有方印章标志" draggable={false} />
      <div><strong>字有方</strong>{!compact && <span>汉字有形，习字有方</span>}</div>
    </div>
  );
}

function Welcome({ onStart, onExplain }: { onStart: () => void; onExplain: () => void }) {
  return (
    <section className="welcome-page">
      <div className="welcome-ink" aria-hidden="true"><img src="/app-assets/logo.png" alt="" draggable={false} /></div>
      <Brand />
      <div className="welcome-copy">
        <p>拍下方格练习，一次识别多个汉字。</p>
        <p>看清差异，按建议再写一次。</p>
      </div>
      <div className="welcome-privacy"><LockClosedIcon /><span>微信身份仅用于关联练习记录；使用前需完成隐私授权与监护人确认。</span></div>
      <button className="primary-button" onClick={onStart}>开始使用 <ArrowRightIcon /></button>
      <button className="text-button" onClick={onExplain}>先看看说明</button>
      <small>本原型不调用真实 OCR 或大模型服务</small>
    </section>
  );
}

function PageHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  return <header className="page-header"><button aria-label="返回" onClick={onBack}><ArrowLeftIcon /></button><h1>{title}</h1><div className="header-action">{action}</div></header>;
}

function Privacy({ privacyChecked, guardianChecked, onPrivacy, onGuardian, onContinue, onBack }: {
  privacyChecked: boolean; guardianChecked: boolean; onPrivacy: (value: boolean) => void; onGuardian: (value: boolean) => void; onContinue: () => void; onBack: () => void;
}) {
  return (
    <section className="page with-header">
      <PageHeader title="开始前请确认" onBack={onBack} />
      <div className="paper-panel privacy-intro"><LockClosedIcon /><div><h2>练字图片会怎样使用？</h2><p>用于切分方格、识别文字、分析字形和生成练习建议。</p></div></div>
      <div className="privacy-list">
        <article><span>01</span><div><h3>第三方处理</h3><p>图片将由已披露的 OCR 和模型服务处理，密钥只保存在服务端。</p></div></article>
        <article><span>02</span><div><h3>私有存储</h3><p>原图和单字裁剪默认保留 30 天，可在“我的—隐私与数据”删除。</p></div></article>
        <article><span>03</span><div><h3>受控分享</h3><p>仅分享脱敏结果卡，不包含原始照片、姓名和文件地址。</p></div></article>
      </div>
      <label className="check-row"><input type="checkbox" checked={privacyChecked} onChange={(event) => onPrivacy(event.target.checked)} /><span><CheckIcon /></span>我已阅读并理解隐私说明</label>
      <label className="check-row"><input type="checkbox" checked={guardianChecked} onChange={(event) => onGuardian(event.target.checked)} /><span><CheckIcon /></span>我是监护人，并同意继续</label>
      <button className="primary-button" disabled={!privacyChecked || !guardianChecked} onClick={onContinue}>同意并继续</button>
      <button className="text-button" onClick={onBack}>暂不同意</button>
    </section>
  );
}

function Practice({ targetText, onTargetText, onCapture, onContinuePending, onResults, onExceptions }: {
  targetText: string; onTargetText: (value: string) => void; onCapture: () => void; onContinuePending: () => void; onResults: () => void; onExceptions: () => void;
}) {
  const keyboard = useKeyboard();
  return (
    <section className="page home-page nav-padded">
      <div className="home-top"><Brand compact /><button className="icon-text-button" onClick={onExceptions}><GearIcon /> 原型状态</button></div>
      <div className="home-title"><p>下午好</p><h1>今天想练哪些字？</h1></div>
      <label className="target-field"><span>目标文字 <b>必填</b></span><KeyboardInput value={targetText} onChange={(event) => onTargetText(event.target.value)} onBlur={() => keyboard.hide()} onKeyDown={(event) => { if (event.key === "Enter") keyboard.hide(); }} maxLength={24} aria-label="目标练习文字" /><small>{targetText.length}/24 · 按练习本的阅读顺序填写</small></label>
      <div className="recent-text"><span>最近内容</span><button onClick={() => onTargetText("永和春山日月天地人")}>永和春山日月天地人</button><button onClick={() => onTargetText("山川日月")}>山川日月</button></div>
      <button className="capture-card" onClick={onCapture}><span><CameraIcon /></span><div><strong>拍下整页方格练习</strong><small>保持页面平整、光线均匀、方格完整</small></div><ChevronRightIcon /></button>
      <section className="task-section"><div className="section-heading"><h2>练习任务</h2><span>2 条</span></div>
        <button className="task-card pending" onClick={onContinuePending}><span className="task-icon"><UploadIcon /></span><div><strong>待提交 · 9 个字</strong><small>已离线保存，联网后可继续</small></div><em>继续</em></button>
        <button className="task-card" onClick={onResults}><span className="task-icon done"><CheckCircledIcon /></span><div><strong>永和春山日月天地人</strong><small>今天 14:32 · 月字需要重点练习</small></div><ChevronRightIcon /></button>
      </section>
      <div className="privacy-tip"><LockClosedIcon /> 图片仅用于本次书写评测，可随时删除</div>
    </section>
  );
}

function Capture({ onBack, onShot, onGallery }: { onBack: () => void; onShot: () => void; onGallery: () => void }) {
  return (
    <section className="capture-page">
      <div className="capture-toolbar"><button onClick={onBack}>取消</button><strong>拍摄方格练习</strong><button onClick={onGallery}><ImageIcon /> 相册</button></div>
      <div className="camera-preview">
        <img src="/app-assets/practice-grid.png" alt="多行多列方格练习示例" draggable={false} />
        <div className="page-guide"><i /><i /><i /><i /></div>
        <div className="camera-hint"><CheckCircledIcon /> 已找到完整练习页</div>
      </div>
      <div className="capture-guidance"><span>整页放进框内</span><span>避免反光和阴影</span><span>保持手机稳定</span></div>
      <div className="shutter-row"><button className="gallery-mini" onClick={onGallery}><ImageIcon /><span>相册</span></button><button className="shutter" aria-label="拍照" onClick={onShot}><span /></button><button className="flip-mini" onClick={() => undefined}><ReloadIcon /><span>重置</span></button></div>
    </section>
  );
}

function Quality({ mode, targetText, onBack, onRetake, onSubmit }: { mode: QualityMode; targetText: string; onBack: () => void; onRetake: () => void; onSubmit: () => void }) {
  const messages = {
    ready: ["图片清晰，可以上传", "预计识别 9 个方格文字"],
    blurred: ["方格里的笔画看不清", "请放稳手机，在亮一点的地方重拍"],
    partial: ["部分方格可以处理", "已找到 7 个字，1 个还不能确定，1 个方格不完整"],
    offline: ["当前没有网络", "照片可先保存在本机，联网后沿用同一任务提交"],
  } as const;
  const blocked = mode === "blurred";
  return (
    <section className="page with-header quality-page">
      <PageHeader title="确认照片" onBack={onBack} />
      <div className="photo-preview"><img src="/app-assets/practice-grid.png" alt="待上传的多字方格照片" draggable={false} /><span>9 个方格</span></div>
      <div className={`quality-message quality-${mode}`}>{blocked ? <ExclamationTriangleIcon /> : mode === "offline" ? <UploadIcon /> : <CheckCircledIcon />}<div><strong>{messages[mode][0]}</strong><p>{messages[mode][1]}</p></div></div>
      <div className="photo-meta"><div><span>目标文字</span><strong>{targetText}</strong></div><div><span>图片用途</span><strong>识别、纠错与字形纠偏</strong></div></div>
      {mode === "partial" && <div className="partial-summary"><span><b>7</b> 可分析</span><span><b>1</b> 不确定</span><span><b>1</b> 不完整</span></div>}
      <div className="stack-actions"><button className="primary-button" onClick={blocked ? onRetake : onSubmit}>{blocked ? "重新拍摄" : mode === "offline" ? "保存，联网后提交" : "确认上传"}</button><button className="secondary-button" onClick={onRetake}>重拍或换图</button></div>
    </section>
  );
}

function Analyzing({ step, mode, onCancel, onLeave, onResults }: { step: number; mode: ResultMode; onCancel: () => void; onLeave: () => void; onResults: () => void }) {
  const done = step >= analysisStages.length;
  return (
    <section className="page analyzing-page">
      <Brand compact />
      <div className="analysis-glyph"><span>月</span><i style={{ transform: `rotate(${step * 36}deg)` }} /></div>
      <div className="analysis-heading"><h1>{done ? "分析完成" : "正在看你的练习"}</h1><p>{done ? "9 个方格文字已生成评测结果" : "可以先离开，任务会继续处理"}</p></div>
      <ol className="stage-list">{analysisStages.map((label, index) => <li key={label} className={index < step ? "done" : index === step ? "active" : ""}><span>{index < step ? <CheckIcon /> : index + 1}</span><strong>{label}</strong><em>{index < step ? "完成" : index === step ? "进行中" : "等待"}</em></li>)}</ol>
      {mode === "degraded" && <div className="notice"><InfoCircledIcon />识别和对比已完成，详细建议暂用基础提示。</div>}
      {done ? <button className="primary-button" onClick={onResults}>查看识别结果 <ArrowRightIcon /></button> : <button className="secondary-button" onClick={onLeave}>回到练习首页</button>}
      <button className="text-button danger-text" onClick={onCancel}>取消本次分析</button>
    </section>
  );
}

function Results({ mode, sampleCount, wrongState, selected, compareMode, onSelect, onCompareMode, onGrowth, onFeedback, onShare }: {
  mode: ResultMode; sampleCount: number; wrongState: boolean; selected: number; compareMode: "overlay" | "parallel"; onSelect: (index: number) => void; onCompareMode: (value: "overlay" | "parallel") => void; onGrowth: () => void; onFeedback: () => void; onShare: () => void;
}) {
  const item = characters[selected];
  const isMonth = item.char === "月";
  const status = item.tone === "good" ? "书写清楚" : item.tone === "warn" ? "待纠偏" : item.tone === "uncertain" ? "还不能确定" : "这个字没有分析成功";
  return (
    <section className="page results-page nav-padded">
      <div className="results-brand" aria-hidden="true" />
      <div className="results-title"><h1>识别结果</h1><span>{wrongState ? "9 个字 · 5 正常 · 1 错字 · 1 待纠偏 · 1 不确定" : "9 个字 · 6 正常 · 1 待纠偏 · 1 不确定 · 1 失败"}</span><button className="results-share" aria-label="分享脱敏结果" onClick={onShare}><Share2Icon /></button></div>
      <Carousel ariaLabel="单字识别结果" className="character-carousel" contentClassName="character-track">
        {characters.map((character, index) => <button key={character.char} className={`character-chip ${selected === index ? "selected" : ""}`} onClick={() => onSelect(index)}><span>{character.char}</span><i className={character.tone} />{character.score > 0 && <small>{character.score}</small>}</button>)}
      </Carousel>
      <div className="result-divider" />
      <div className="selected-summary"><span className="order">一</span><strong>{item.char}</strong>{item.score > 0 && !wrongState && <em>{item.score}<small>分</small></em>}<b className={`status ${wrongState ? "status-wrong" : `status-${item.tone}`}`}>{wrongState ? "错字" : status}</b></div>
      {wrongState ? (
        <WrongResult />
      ) : item.tone === "uncertain" || item.tone === "failed" ? (
        <ResultUnavailable item={item} />
      ) : (
        <>
          <div className={`glyph-view ${compareMode}`}>
            {isMonth && compareMode === "overlay" ? <img src="/app-assets/main-glyph-overlay.png" alt="手写月字与标准字叠加差异" draggable={false} /> : <div className="parallel-glyphs"><div><span>手写</span><strong>{item.char}</strong></div><div><span>标准宋体</span><strong>{item.char}</strong></div></div>}
          </div>
          <div className="segmented"><button className={compareMode === "overlay" ? "active" : ""} onClick={() => onCompareMode("overlay")}><EyeOpenIcon /> 叠加</button><button className={compareMode === "parallel" ? "active" : ""} onClick={() => onCompareMode("parallel")}><ImageIcon /> 并排</button></div>
          <div className="issue-title"><i />{isMonth ? "整体稍偏左" : "结构稳定，继续保持"}</div>
          <div className="dimension-grid">{dimensions.map(([label, score]) => <div key={label}><span>{label}</span><strong className={label === "稳定性" && sampleCount < 3 ? "collecting" : ""}>{label === "稳定性" && sampleCount < 3 ? "积累中" : isMonth ? score : Math.min(96, score + 21)}</strong></div>)}</div>
          {isMonth && sampleCount < 3 ? <button className="sample-collecting" onClick={onGrowth}><BarChartIcon /><div><strong>稳定性样本积累中</strong><span>已练 {sampleCount} 次，再练 {3 - sampleCount} 次可查看成长曲线</span></div><ChevronRightIcon /></button> : isMonth && <button className="growth-preview" onClick={onGrowth}><div className="growth-heading"><span><BarChartIcon /> 成长曲线</span><em>已练4次</em><strong>近3次均分 <b>65</b></strong></div><img src="/app-assets/growth-chart.png" alt="月字四次练习得分下降的成长曲线" draggable={false} /><div className="monitor-alert"><BellIcon /><strong>已纳入重点字库</strong><span>近3次均分或稳定性低于70</span><ChevronRightIcon /></div></button>}
          {mode === "degraded" && <div className="notice"><InfoCircledIcon />详细建议暂时不可用，以下为基础规则提示。</div>}
          {mode === "partial" && <div className="notice warning"><ExclamationTriangleIcon />已分析 7 个字，1 个还不能确定，1 个没有分析成功。</div>}
          <ol className="advice-list"><li><span>1</span>{isMonth ? "下笔前先看田字格中线" : "保持这一笔画的起收位置"}</li><li><span>2</span>{isMonth ? "让左右留白更均匀" : "再写一次巩固结构"}</li></ol>
        </>
      )}
      <div className="result-actions"><button onClick={onFeedback}><FileTextIcon /> 结果有误</button>{isMonth && <button onClick={onGrowth}><BarChartIcon /> 查看成长详情</button>}</div>
    </section>
  );
}

function WrongResult() {
  return <div className="wrong-result"><div className="wrong-comparison"><div><span>目标文字</span><strong>山</strong></div><ArrowRightIcon /><div className="recognized"><span>稳定识别为</span><strong>出</strong></div></div><div className="issue-title"><i />文字与目标不一致</div><p>两次识别结果一致，且目标文字顺序明确。大模型不会覆盖这一判定。</p><ol className="advice-list"><li><span>1</span>先看中间竖画是否贯穿</li><li><span>2</span>再写一次“山”，注意底部结构</li></ol></div>;
}

function ResultUnavailable({ item }: { item: typeof characters[number] }) {
  return <div className="unavailable-card"><div className="empty-glyph">{item.char}</div><ExclamationTriangleIcon /><h2>{item.tone === "uncertain" ? "这个字还不能确定" : "这个字没有分析成功"}</h2><p>{item.tone === "uncertain" ? "请拍清楚一些，或确认目标文字。" : "方格裁切不完整，请重写后再拍。"}</p><button className="primary-button"><CameraIcon /> 重新拍摄</button></div>;
}

function Mine({ onWordbook, onPrivacy, onFeedback }: { onWordbook: () => void; onPrivacy: () => void; onFeedback: () => void }) {
  return (
    <section className="page mine-page nav-padded">
      <div className="mine-header"><div className="avatar">方</div><div><span>微信用户</span><h1>继续把字写稳</h1></div></div>
      <div className="learning-summary"><div><strong>12</strong><span>已练字数</span></div><div><strong>4</strong><span>重点字</span></div><div><strong>28</strong><span>有效练习</span></div></div>
      <div className="menu-list"><button className="featured" onClick={onWordbook}><span><FileTextIcon /></span><div><strong>字本</strong><small>错字、待纠偏字与历次练习</small></div><em>4 个重点字</em><ChevronRightIcon /></button><button onClick={onPrivacy}><span><LockClosedIcon /></span><div><strong>隐私与数据</strong><small>授权、照片留存与删除</small></div><ChevronRightIcon /></button><button onClick={onFeedback}><span><ReloadIcon /></span><div><strong>结果反馈记录</strong><small>查看重新评测进度</small></div><ChevronRightIcon /></button><button><span><InfoCircledIcon /></span><div><strong>关于字有方</strong><small>版本、说明与服务协议</small></div><ChevronRightIcon /></button></div>
      <p className="mine-note">不提供排行榜、积分挑战和周期报告</p>
    </section>
  );
}

function Wordbook({ onBack, onGrowth, onPractice }: { onBack: () => void; onGrowth: () => void; onPractice: () => void }) {
  const [filter, setFilter] = useState("重点字库");
  const list = filter === "重点字库" ? [{ char: "月", score: 62, times: 4, reason: "近3次均分65 · 稳定性55" }, { char: "永", score: 68, times: 3, reason: "稳定性66" }] : filter === "待纠偏" ? [{ char: "月", score: 62, times: 4, reason: "整体稍偏左" }, { char: "地", score: 66, times: 2, reason: "结构比例需调整" }] : [{ char: "出", score: 0, times: 1, reason: "目标字：山" }];
  return (
    <section className="page with-header wordbook-page nav-padded"><PageHeader title="字本" onBack={onBack} />
      <div className="filter-tabs">{["错字", "待纠偏", "重点字库"].map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
      {filter === "重点字库" && <div className="library-explain"><BellIcon /><div><strong>重点监测字库</strong><p>练习满3次后，近3次均分或稳定性低于70会纳入监测。</p></div></div>}
      <div className="word-list">{list.map((item) => <button key={item.char} onClick={item.char === "月" ? onGrowth : onPractice}><span className="word-grid">{item.char}</span><div><strong>{item.char}<em>{filter}</em></strong><p>{item.reason}</p><small>已练 {item.times} 次 · 今天更新</small></div><div className="word-score">{item.score || "错字"}<ChevronRightIcon /></div></button>)}</div>
      <div className="threshold-note"><InfoCircledIcon />70 分入库线与 80 分退出线为 POC 值，投产前需校准。</div>
    </section>
  );
}

function Growth({ sampleCount, onBack, onPractice }: { sampleCount: number; onBack: () => void; onPractice: () => void }) {
  const [record, setRecord] = useState(3);
  const scores = [72, 68, 64, 62];
  if (sampleCount < 3) return <section className="page with-header growth-page nav-padded"><PageHeader title="月字成长记录" onBack={onBack} /><div className="growth-hero"><span className="word-grid large">月</span><div><b className="collecting-label">样本积累中</b><h1>已完成 {sampleCount} 次练习</h1><p>稳定性需要至少 3 次可比练习</p></div></div><div className="sample-progress"><div>{[1, 2, 3].map((step) => <span key={step} className={step <= sampleCount ? "done" : ""}>{step <= sampleCount ? <CheckIcon /> : step}</span>)}</div><h2>再练 {3 - sampleCount} 次，就能看到成长曲线</h2><p>当前不会把样本不足显示为 0 分，也不会仅因次数不足纳入重点字库。</p></div><div className="dimension-grid collecting-dimensions">{dimensions.map(([label, score]) => <div key={label}><span>{label}</span><strong className={label === "稳定性" ? "collecting" : ""}>{label === "稳定性" ? "积累中" : score}</strong></div>)}</div><button className="primary-button sticky-action" onClick={onPractice}><CameraIcon /> 再练一次“月”</button></section>;
  return (
    <section className="page with-header growth-page nav-padded"><PageHeader title="月字成长记录" onBack={onBack} />
      <div className="growth-hero"><span className="word-grid large">月</span><div><b>已纳入重点字库</b><h1>最近一次 62 分</h1><p>已练 4 次 · 最近三次可比</p></div></div>
      <section className="growth-detail"><div className="section-heading"><h2>成长曲线</h2><span>评分标准 v1.0</span></div><img src="/app-assets/growth-chart.png" alt="月字成长曲线，四次得分为72、68、64、62" draggable={false} /><div className="record-points">{scores.map((score, index) => <button key={score} className={record === index ? "active" : ""} onClick={() => setRecord(index)}><span>第{index + 1}次</span><strong>{score}</strong></button>)}</div></section>
      <div className="growth-stats"><div><span>近3次均分</span><strong>65</strong><small>低于入库线 70</small></div><div><span>稳定性</span><strong>55</strong><small>波动与下降趋势偏高</small></div></div>
      <div className="record-detail"><div><span>第 {record + 1} 次 · 8月{4 + record * 2}日</span><strong>{scores[record]} 分</strong></div>{dimensions.map(([label, score]) => <p key={label}><span>{label}</span><i><b style={{ width: `${Math.max(14, score + record - 3)}%` }} /></i><em>{score + record - 3}</em></p>)}</div>
      <div className="monitor-reason"><BellIcon /><div><strong>为什么进入重点字库？</strong><p>最近三次均分 65，稳定性 55，均低于当前 POC 入库线。继续练习达到退出条件后会保留历史，但不再重点提醒。</p></div></div>
      <button className="primary-button sticky-action" onClick={onPractice}><CameraIcon /> 再练一次“月”</button>
    </section>
  );
}

function Feedback({ onBack, onSubmit }: { onBack: () => void; onSubmit: () => void }) {
  const keyboard = useKeyboard();
  const [reason, setReason] = useState("识别的字不对");
  const [detail, setDetail] = useState("");
  return <section className="page with-header feedback-page"><PageHeader title="结果反馈" onBack={onBack} /><div className="feedback-target"><span className="word-grid">月</span><div><strong>目标字：月 · 62分</strong><p>原结果不会被直接修改，将创建一条重新评测任务。</p></div></div><h2>哪里需要重新检查？</h2><div className="reason-list">{["识别的字不对", "问题说明不符合", "分数明显不合理", "其他"].map((value) => <label key={value}><input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)} /><span />{value}</label>)}</div><label className="feedback-detail"><span>补充说明（选填）</span><KeyboardInput value={detail} onChange={(event) => setDetail(event.target.value)} onBlur={() => keyboard.hide()} onKeyDown={(event) => { if (event.key === "Enter") keyboard.hide(); }} maxLength={100} placeholder="例如：这个字没有偏左" /><small>{detail.length}/100</small></label><button className="primary-button" onPointerDown={() => keyboard.hide()} onClick={onSubmit}>提交并重新评测</button></section>;
}

function PrivacyData({ onBack, onDelete }: { onBack: () => void; onDelete: () => void }) {
  return <section className="page with-header privacy-data-page"><PageHeader title="隐私与数据" onBack={onBack} /><div className="data-summary"><LockClosedIcon /><div><strong>你的练习数据</strong><p>18 张原图将在 30 天内自动清理，结构化记录保留至主动删除。</p></div></div><div className="menu-list"><button><span><EyeOpenIcon /></span><div><strong>授权与第三方处理</strong><small>查看 OCR 与模型服务说明</small></div><ChevronRightIcon /></button><button><span><ImageIcon /></span><div><strong>练字照片</strong><small>18 张 · 最早 12 天后清理</small></div><ChevronRightIcon /></button><button className="danger-menu" onClick={onDelete}><span><TrashIcon /></span><div><strong>删除练习与账户数据</strong><small>操作前会列明影响范围</small></div><ChevronRightIcon /></button></div></section>;
}

function ShareAndDelete({ onBack, onShare, onDelete }: { onBack: () => void; onShare: () => void; onDelete: () => void }) {
  const [tab, setTab] = useState<"share" | "delete">("share");
  const [confirmed, setConfirmed] = useState(false);
  return <section className="page with-header share-page"><PageHeader title="分享与删除确认" onBack={onBack} /><div className="filter-tabs"><button className={tab === "share" ? "active" : ""} onClick={() => { setTab("share"); setConfirmed(false); }}>脱敏分享</button><button className={tab === "delete" ? "active" : ""} onClick={() => { setTab("delete"); setConfirmed(false); }}>删除记录</button></div>{tab === "share" ? <><div className="share-card"><Brand compact /><span>今日练习 · 月</span><div className="share-word">月</div><strong>62分 · 待纠偏</strong><p>下一次先对准田字格中线，让左右留白更均匀。</p><small>不包含原图、姓名和文件地址</small></div><label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><CheckIcon /></span>监护人已确认分享此脱敏结果卡</label><button className="primary-button" disabled={!confirmed} onClick={onShare}><Share2Icon /> 生成微信分享卡</button></> : <><div className="delete-list"><h2>删除后将移除</h2><p><ImageIcon /> 本次原始照片与单字裁剪图</p><p><FileTextIcon /> 评测结果与反馈记录</p><p><BellIcon /> 字本关联和重点监测状态</p><p><Share2Icon /> 已生成分享卡的访问能力</p></div><div className="notice warning"><ExclamationTriangleIcon />删除操作不可撤销；本原型仅模拟，不会更改真实数据。</div><label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span><CheckIcon /></span>我已了解删除范围</label><button className="danger-button full" disabled={!confirmed} onClick={onDelete}><TrashIcon /> 确认删除</button></>}</section>;
}

function BottomNav({ active, onPractice, onCapture, onMine }: { active: string; onPractice: () => void; onCapture: () => void; onMine: () => void }) {
  return <nav className="bottom-nav" aria-label="主导航"><button className={active === "practice" ? "active" : ""} onClick={onPractice}><FileTextIcon /><span>练习</span></button><button className="center-capture" onClick={onCapture}><span><CameraIcon /></span><em>拍照</em></button><button className={active === "mine" ? "active" : ""} onClick={onMine}><PersonIcon /><span>我的</span></button></nav>;
}

function screenLabel(screen: Screen) {
  const labels: Record<Screen, string> = { welcome: "首次进入", privacy: "隐私授权与监护人确认", practice: "练习首页", capture: "拍照与相册", quality: "上传确认与质量反馈", analyzing: "分析进度", results: "多字评测结果", mine: "我的", wordbook: "字本与历次矫正", growth: "成长曲线与重点字库详情", feedback: "结果反馈与重新评测", privacyData: "隐私与数据", share: "分享与删除确认" };
  return labels[screen];
}
