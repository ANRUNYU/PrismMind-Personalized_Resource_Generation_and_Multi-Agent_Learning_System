import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import {
  createTutoringConversation,
  getTutoringConversation,
  getTutoringConversations,
  streamTutoringMessage,
  type TutoringConversation,
  type TutoringMessageRecord,
  type TutoringReference,
  type TutoringStreamEvent
} from '@/api/tutoring'
import SafeMarkdown from '@/external/shared/SafeMarkdown'
import { GenerationProgress, useSimulatedGenerationProgress } from '@/external/shared/GenerationProgress'
import { consumeNdjsonStream } from '@/utils/taskStream'

import PageShell from '../shared/PageShell/PageShell'
import { GlassPanel, PrimaryButton, SecondaryButton } from '../shared/ui/CommonUI'
import './TutoringPage.css'

const quickPrompts = [
  ['◇', '解释概念', '请用通俗语言解释这个知识点，并给出具体例子：'],
  ['◎', '举例说明', '请结合一个真实学习或工程场景举例说明：'],
  ['◆', '易错点', '请分析这个知识点常见的易错点和纠正方法：'],
  ['◇', '复习步骤', '请为我制定这个知识点的分步复习方案：']
] as const

function formatTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export default function ExternalStudentTutoring() {
  const [conversations, setConversations] = useState<TutoringConversation[]>([])
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [messages, setMessages] = useState<TutoringMessageRecord[]>([])
  const [question, setQuestion] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('选择快捷问题或输入你想学习的内容。')
  const [error, setError] = useState('')
  const [generationFailed, setGenerationFailed] = useState(false)
  const [referenceViewer, setReferenceViewer] = useState<{ title: string; references: TutoringReference[] } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const controllerRef = useRef<AbortController | null>(null)

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === conversationId) || null,
    [conversations, conversationId]
  )
  const latestAssistant = useMemo(
    () => [...messages].reverse().find((item) => item.role === 'assistant'),
    [messages]
  )
  const simulatedProgress = useSimulatedGenerationProgress({
    active: sending,
    failed: generationFailed,
    resetKey: conversationId || 'new'
  })

  async function loadConversations(preferredId?: number) {
    setLoading(true)
    try {
      const items = await getTutoringConversations()
      setConversations(items)
      const targetId = preferredId || conversationId
      if (targetId && items.some((item) => item.id === targetId)) await openConversation(targetId)
      else {
        setConversationId(null)
        setMessages([])
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '辅导历史加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function openConversation(id: number) {
    const detail = await getTutoringConversation(id)
    setConversationId(id)
    setMessages(detail.messages)
    setError('')
    setStatus('已恢复完整辅导会话。')
  }

  function createNewConversation() {
    controllerRef.current?.abort()
    setConversationId(null)
    setMessages([])
    setQuestion('')
    setError('')
    setReferenceViewer(null)
    setStatus('新会话已准备好。')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  async function send(retryAssistantId?: number) {
    if (sending) return
    const retryIndex = retryAssistantId ? messages.findIndex((item) => item.id === retryAssistantId) : -1
    const retryQuestion = retryIndex > 0 ? messages.slice(0, retryIndex).reverse().find((item) => item.role === 'user')?.content : ''
    const content = (retryQuestion || question).trim()
    if (!content) return

    setSending(true)
    setGenerationFailed(false)
    setError('')
    setStatus('正在分析问题并生成回答...')
    let activeId = conversationId
    try {
      if (!activeId) {
        const created = await createTutoringConversation({ title: content.slice(0, 40) })
        activeId = created.id
        setConversationId(activeId)
        setConversations((current) => [created, ...current])
      }
      const temporaryUserId = -Date.now()
      const temporaryAssistantId = retryAssistantId || temporaryUserId - 1
      const userMessage: TutoringMessageRecord = {
        id: temporaryUserId, conversation_id: activeId, role: 'user', content, status: 'completed',
        references: [], warnings: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      const assistantMessage: TutoringMessageRecord = {
        id: temporaryAssistantId, conversation_id: activeId, role: 'assistant', content: retryAssistantId
          ? messages.find((item) => item.id === retryAssistantId)?.content || '' : '', status: 'streaming',
        references: [], warnings: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      if (retryAssistantId) {
        setMessages((current) => current.map((item) => item.id === retryAssistantId ? assistantMessage : item))
      } else {
        setMessages((current) => [...current, userMessage, assistantMessage])
      }
      setQuestion('')
      controllerRef.current = new AbortController()
      const response = await streamTutoringMessage(activeId, {
        content,
        client_message_id: retryAssistantId ? `retry-${retryAssistantId}` : crypto.randomUUID(),
        retry_assistant_message_id: retryAssistantId || null
      }, controllerRef.current.signal)
      await consumeNdjsonStream(response, (event: TutoringStreamEvent) => {
        if (event.type === 'error') throw new Error(event.error || '流式回答中断')
        if (event.type === 'delta' && event.text) {
          setMessages((current) => current.map((item) => item.id === temporaryAssistantId
            ? { ...item, content: item.content + event.text, status: 'streaming' } : item))
        }
        if (event.type === 'reference') setStatus('已找到课程资料引用，正在组织回答...')
        if (event.type === 'done' && event.message) {
          setMessages((current) => current.map((item) => item.id === temporaryAssistantId ? event.message! : item))
        }
      })
      setStatus('回答已完成并保存。')
      await loadConversations(activeId)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '流式回答中断'
      if (message.toLowerCase().includes('abort')) setStatus('已停止生成，已生成内容会保留。')
      else {
        setGenerationFailed(true)
        setError('回答生成未完成，请稍后重试。')
        setStatus('回答生成未完成，请稍后重试。')
      }
      setMessages((current) => current.map((item) => item.role === 'assistant' && item.status === 'streaming'
        ? { ...item, status: 'failed', error: '回答生成未完成，请稍后重试。' } : item))
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  useEffect(() => {
    void loadConversations()
    return () => controllerRef.current?.abort()
  }, [])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div data-testid="external-student-tutoring">
      <PageShell className="tutoring-page" prismVariant="center" navUserLabel="智能辅导" navUserDescription="个性化学习助手">
        <section className="tutor-workbench">
          <main className="tutor-main">
            <header className="tutor-heading">
              <h1>智能学习辅导</h1>
              <p>本次进入为一段独立答疑会话；离开后再次进入会自动开始新会话，历史记录可按需查看。</p>
            </header>
            <nav className="tutor-quick-tags" aria-label="快捷辅导问题">
              {quickPrompts.map(([icon, label, prompt]) => (
                <button key={label} type="button" onClick={() => { setQuestion(prompt); inputRef.current?.focus() }}>
                  <span>{icon}</span>{label}
                </button>
              ))}
              <button type="button" onClick={createNewConversation}><span>＋</span>新建会话</button>
            </nav>
            <GlassPanel className="tutor-chat-panel">
              <div className="tutor-chat-scroll" ref={scrollRef} aria-live="polite">
                {!messages.length ? <div className="tutor-empty-chat"><strong>你好，我是你的学习辅导助手</strong><p>输入一个具体问题开始本次会话；离开页面后，下次进入将从新的空白会话开始。</p></div> : null}
                {messages.map((message) => (
                  <article className={`tutor-message ${message.role === 'user' ? 'is-user' : 'is-ai'}`} key={message.id}>
                    {message.role === 'assistant' ? <span className="tutor-avatar tutor-avatar-ai" aria-hidden="true" /> : null}
                    <div className="tutor-message-stack">
                      {message.role === 'assistant' ? <strong>小导 <span>{message.status === 'streaming' ? '正在回答' : 'AI 学习助手'}</span></strong> : null}
                      <div className="tutor-bubble">
                        {message.role === 'assistant' ? <SafeMarkdown content={message.content} /> : <p>{message.content}</p>}
                        {message.status === 'streaming' ? <span className="tutor-thinking">正在生成…</span> : null}
                        {message.warnings?.map((warning) => <p className="tutor-error-message" key={warning}>{warning}</p>)}
                        {message.references?.length ? (
                          <button
                            className="tutor-reference-trigger"
                            type="button"
                            onClick={() => setReferenceViewer({ title: `知识库引用 · ${message.references.length} 条`, references: message.references })}
                          >
                            查看知识库引用 <span>{message.references.length}</span>
                          </button>
                        ) : null}
                        {message.status === 'failed' ? <SecondaryButton onClick={() => void send(message.id)}>继续或重试</SecondaryButton> : null}
                      </div>
                      <time>{formatTime(message.created_at)}</time>
                    </div>
                    {message.role === 'user' ? <span className="tutor-avatar tutor-avatar-user" aria-hidden="true" /> : null}
                  </article>
                ))}
              </div>
              <GenerationProgress
                visible={simulatedProgress.visible}
                title={activeConversation?.title || '智能答疑'}
                subtitle="组织回答"
                statusText={generationFailed ? '回答生成未完成，请稍后重试。' : status}
                percent={simulatedProgress.percent}
                state={simulatedProgress.state}
                variant="compact"
                dataTestId="tutoring-generation-progress"
              />
              <form className="tutor-input-form" onSubmit={(event) => { event.preventDefault(); void send() }}>
                <div className="tutor-input-row">
                  <textarea ref={inputRef} className="student-textarea" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={handleKeyDown} placeholder="输入你的学习问题，Enter 发送，Shift+Enter 换行" aria-label="输入你的问题" />
                  <PrimaryButton className="tutor-send-button" type="submit" disabled={sending || !question.trim()}>↑</PrimaryButton>
                </div>
                <div className="tutor-input-footer"><span>{status}</span>{sending ? <button type="button" onClick={() => controllerRef.current?.abort()}>停止生成</button> : null}</div>
                {error ? <p className="tutor-error-message">{error}</p> : null}
              </form>
            </GlassPanel>
          </main>
          <aside className="tutor-side">
            <GlassPanel className="tutor-assistant-card"><div className="tutor-card-title"><h2>辅导助手</h2><span>在线</span></div><div className="tutor-assistant-orbit" /><p>{activeConversation?.title || '等待你的新问题'}</p><div className="tutor-metrics"><span><i>会话</i><strong>{conversations.length}</strong></span><span><i>消息</i><strong>{messages.length}</strong></span><span><i>引用</i><strong>{latestAssistant?.references?.length || 0}</strong></span></div></GlassPanel>
            <GlassPanel className="tutor-history-card"><div className="tutor-card-title"><h2>历史会话（按需查看）</h2><button type="button" onClick={() => void loadConversations()}>刷新</button></div><div className="tutor-history-list">{loading ? <p className="tutor-list-state">正在加载...</p> : conversations.map((item, index) => <button key={item.id} type="button" className={item.id === conversationId ? 'is-active' : ''} onClick={() => void openConversation(item.id)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}<small>{item.messages?.[item.messages.length - 1]?.content || '打开完整会话'}</small></strong><time>{formatTime(item.updated_at)}</time></button>)}</div></GlassPanel>
            <GlassPanel className="tutor-suggestion-card"><h2>学习建议</h2><p>选择建议后会自动填入输入框，你仍可继续补充具体知识点。</p>{quickPrompts.slice(0, 3).map(([, label, prompt]) => <SecondaryButton key={label} onClick={() => { setQuestion(prompt); inputRef.current?.focus() }}>{label}<span>→</span></SecondaryButton>)}</GlassPanel>
          </aside>
        </section>
        {referenceViewer ? (
          <div className="tutor-reference-dialog-backdrop" role="presentation" onClick={() => setReferenceViewer(null)}>
            <section className="tutor-reference-dialog" role="dialog" aria-modal="true" aria-label="知识库引用详情" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <small>本次回答依据</small>
                  <h2>{referenceViewer.title}</h2>
                </div>
                <button type="button" aria-label="关闭知识库引用" onClick={() => setReferenceViewer(null)}>×</button>
              </header>
              <div className="tutor-reference-dialog-list">
                {referenceViewer.references.map((reference, index) => (
                  <article className="tutor-reference-item" key={`${reference.document_id ?? 'reference'}-${reference.chunk_index ?? index}-${index}`}>
                    <div className="tutor-reference-item-heading">
                      <strong>{reference.source_filename || `知识片段 ${index + 1}`}</strong>
                      {reference.score != null ? <span>匹配度 {Math.round(reference.score * 100)}%</span> : null}
                    </div>
                    {reference.chunk_index != null ? <small>引用分块：{reference.chunk_index}</small> : null}
                    <p>{reference.excerpt || '该引用未返回可展示的摘要。'}</p>
                  </article>
                ))}
              </div>
              <footer><SecondaryButton onClick={() => setReferenceViewer(null)}>关闭</SecondaryButton></footer>
            </section>
          </div>
        ) : null}
      </PageShell>
    </div>
  )
}
