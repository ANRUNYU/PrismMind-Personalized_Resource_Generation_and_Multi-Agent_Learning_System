import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import SafeMarkdown from "@/external/shared/SafeMarkdown";
import { GenerationProgress, useSimulatedGenerationProgress } from "@/external/shared/GenerationProgress";
import { CHAT_API_PATH, CHAT_SESSION_ID, loadOnboarding, sendChatMessage, streamProfileMessage } from "./chatApi.js";

const INITIAL_MESSAGES = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我是学习画像智能助手。你可以询问六维能力、薄弱点、学习目标或下一步改进建议。",
    timestamp: new Date().toISOString()
  }
];

export default function ChatPanel({ endpoint = CHAT_API_PATH, sessionId = CHAT_SESSION_ID }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [generationFailed, setGenerationFailed] = useState(false);
  const [connectionMode, setConnectionMode] = useState("ready");
  const [onboardingState, setOnboardingState] = useState(null);
  const panelRef = useRef(null);
  const messageListRef = useRef(null);
  const lastMessageRef = useRef(null);
  const streamControllerRef = useRef(null);
  const simulatedProgress = useSimulatedGenerationProgress({
    active: isSending,
    failed: generationFailed,
    resetKey: sessionId
  });

  const reconnect = async () => {
    setConnectionMode("connecting");
    setError("");
    try {
      const state = await loadOnboarding();
      setOnboardingState(state);
      setMessages(state.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, timestamp: item.created_at })));
      setConnectionMode("live");
      window.dispatchEvent(new CustomEvent("prismmind-profile-updated", { detail: state.current_profile }));
      return state;
    } catch (cause) {
      setConnectionMode("error");
      setError(cause instanceof Error ? cause.message : "画像状态加载失败");
      return null;
    }
  };

  useEffect(() => {
    let active = true;
    loadOnboarding().then((state) => {
      if (!active) return;
      setOnboardingState(state);
      setMessages(state.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, timestamp: item.created_at })));
      window.dispatchEvent(new CustomEvent("prismmind-profile-updated", { detail: state.current_profile }));
    }).catch((cause) => { if (active) { setConnectionMode("error"); setError(cause instanceof Error ? cause.message : "画像状态加载失败"); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(
        panelRef.current,
        { opacity: 0, y: -14, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.9, delay: 0.35, ease: "power3.out" }
      );
    }, panelRef);

    return () => context.revert();
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth"
    });

    if (lastMessageRef.current) {
      gsap.fromTo(
        lastMessageRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.42, ease: "power2.out" }
      );
    }
  }, [messages, isSending]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    const cleanValue = inputValue.trim();

    if (!cleanValue || isSending) {
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: cleanValue,
      timestamp: new Date().toISOString()
    };

    setMessages((current) => [...current, userMessage]);
    setInputValue("");
    setError("");
    setGenerationFailed(false);
    setIsSending(true);

    try {
      const activeState = onboardingState || await reconnect();
      if (!activeState) throw new Error("无法连接画像服务，请稍后重试");
      const idempotencyKey = crypto.randomUUID();
      if (activeState.mode === "continuous") {
        const assistantId = `assistant-stream-${Date.now()}`;
        setMessages((current) => [...current, { id: assistantId, role: "assistant", content: "", timestamp: new Date().toISOString() }]);
        streamControllerRef.current = new AbortController();
        await streamProfileMessage(cleanValue, {
          state: activeState,
          idempotencyKey,
          signal: streamControllerRef.current.signal,
          onEvent: (event) => {
            if (event.type === "delta" && event.text) {
              setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: item.content + event.text } : item));
            }
          }
        });
        const response = await loadOnboarding();
        setOnboardingState(response);
        setConnectionMode("live");
        setMessages(response.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, timestamp: item.created_at })));
        window.dispatchEvent(new CustomEvent("prismmind-profile-updated", { detail: response.current_profile }));
        return;
      }
      const response = await sendChatMessage(cleanValue, { state: activeState, idempotencyKey });
      setOnboardingState(response);
      setConnectionMode("live");
      setMessages(response.messages.map((item) => ({ id: item.id, role: item.role, content: item.content, timestamp: item.created_at })));
      window.dispatchEvent(new CustomEvent("prismmind-profile-updated", { detail: response.current_profile }));
    } catch (requestError) {
      setConnectionMode(requestError?.isNetworkError ? "error" : "live");
      setGenerationFailed(true);
      setError("画像分析未完成，请稍后重试。");
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => () => streamControllerRef.current?.abort(), []);

  return (
    <section className="chat-panel" ref={panelRef} aria-label="学习画像问答模块">
      <header className="chat-panel-header">
        <div>
          <span className="chat-panel-title">画像智能助手</span>
          <span className="chat-panel-subtitle">持续同步你的画像线索</span>
        </div>
        <span className="chat-status-dot" aria-label="智能助手在线" />
      </header>

      <div className="chat-message-list" ref={messageListRef}>
        {messages.map((message, index) => (
          <article
            key={message.id}
            ref={index === messages.length - 1 ? lastMessageRef : null}
            className={`chat-message chat-message-${message.role}`}
          >
            <span className="chat-message-role">{message.role === "user" ? "我" : "AI"}</span>
            {message.role === "assistant" ? <SafeMarkdown content={message.content} className="chat-message-markdown" /> : <p>{message.content}</p>}
          </article>
        ))}
      </div>

      <GenerationProgress
        visible={simulatedProgress.visible}
        title="学习画像分析"
        subtitle="分析画像特征"
        statusText={generationFailed ? "画像分析未完成，请稍后重试。" : "正在构建学习画像并组织回答。"}
        percent={simulatedProgress.percent}
        state={simulatedProgress.state}
        variant="compact"
        className="profile-generation-progress"
        dataTestId="portrait-generation-progress"
      />

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          className="chat-panel-input"
          aria-label="发送给画像智能助手的问题"
          value={inputValue}
          placeholder="询问我的学习画像"
          disabled={isSending}
          onChange={(event) => setInputValue(event.target.value)}
        />
        <button type="submit" disabled={!inputValue.trim() || isSending}>
          发送
        </button>
      </form>

      <div className="chat-panel-status" aria-live="polite">
        {error || (isSending ? "AI 正在思考" : statusText(connectionMode))}
        {connectionMode === "error" ? <button type="button" className="chat-reconnect" onClick={reconnect}>重新连接</button> : null}
      </div>
    </section>
  );
}

function statusText(mode) {
  if (mode === "live") {
    return "画像问答已同步";
  }

  if (mode === "error") {
    return "画像问答暂不可用";
  }

  return "等待你的画像问题";
}
