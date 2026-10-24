import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, LoaderCircle, MessageSquare, Send, UserRound } from 'lucide-react'
import { api, userFacingError, type ChatToolCall } from '../api'

type ConversationEntry =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string; toolCalls: ChatToolCall[] }
  | { id: number; kind: 'error'; text: string }

export function ChatPage() {
  const [conversation, setConversation] = useState<ConversationEntry[]>([])
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const nextId = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conversation, pending])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submittedMessage = message.trim()
    if (!submittedMessage || pending) return

    setConversation((entries) => [
      ...entries,
      { id: nextId.current++, kind: 'user', text: submittedMessage },
    ])
    setMessage('')
    setPending(true)

    try {
      const response = await api.chat(submittedMessage)
      setConversation((entries) => [
        ...entries,
        {
          id: nextId.current++,
          kind: 'assistant',
          text: response.reply,
          toolCalls: response.toolCalls,
        },
      ])
    } catch (cause) {
      setConversation((entries) => [
        ...entries,
        { id: nextId.current++, kind: 'error', text: userFacingError(cause) },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="chat-panel content-panel" aria-label="Gateway chat">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MCP ASSISTANT</p>
          <h2>Gateway chat</h2>
          <p className="section-subtitle">Ask about products, inventory, support tickets, or orders.</p>
        </div>
      </div>

      <div className="chat-transcript" aria-live="polite">
        {conversation.length === 0 ? (
          <div className="chat-empty">
            <span className="chat-empty-icon"><MessageSquare size={22} /></span>
            <h3>Start a conversation</h3>
            <p>Ask a question and the assistant can use available MCP tools to find real information.</p>
            <button
              className="chat-suggestion"
              type="button"
              onClick={() => setMessage('List the products in the WooCommerce store.')}
            >
              List the products in the WooCommerce store
            </button>
          </div>
        ) : (
          <div className="chat-messages">
            {conversation.map((entry) => (
              <article
                className={`chat-message chat-message-${entry.kind}`}
                key={entry.id}
              >
                <span className="chat-message-icon" aria-hidden="true">
                  {entry.kind === 'user' ? <UserRound size={16} /> : <Bot size={17} />}
                </span>
                <div className="chat-message-content">
                  <span className="chat-message-label">
                    {entry.kind === 'user' ? 'You' : entry.kind === 'error' ? 'Request error' : 'Assistant'}
                  </span>
                  <p className={entry.kind === 'error' ? 'chat-error-text' : undefined} role={entry.kind === 'error' ? 'alert' : undefined}>
                    {entry.text}
                  </p>
                  {entry.kind === 'assistant' && entry.toolCalls.length > 0 && (
                    <div className="chat-tool-list">
                      {entry.toolCalls.map((toolCall, index) => (
                        <ToolCall key={`${entry.id}-${index}`} toolCall={toolCall} />
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {pending && (
          <div className="chat-message chat-message-assistant" role="status">
            <span className="chat-message-icon" aria-hidden="true"><Bot size={17} /></span>
            <div className="chat-message-content">
              <span className="chat-message-label">Assistant</span>
              <p className="chat-pending"><LoaderCircle size={15} className="spin" />Waiting for Gemini…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-composer" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="chat-message">Your message</label>
        <textarea
          id="chat-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask a question about your gateway data…"
          rows={2}
          maxLength={4000}
        />
        <button
          className="button button-primary chat-send"
          type="submit"
          disabled={pending || !message.trim()}
        >
          {pending ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
          <span>{pending ? 'Sending…' : 'Send'}</span>
        </button>
        <p className="chat-composer-hint">Responses use currently available MCP tools and gateway data.</p>
      </form>
    </section>
  )
}

function ToolCall({ toolCall }: { toolCall: ChatToolCall }) {
  return (
    <section className="chat-tool">
      <header className="chat-tool-heading">
        <strong>{toolCall.name}</strong>
        <span className={`chat-tool-status ${toolCall.success ? 'chat-tool-success' : 'chat-tool-failure'}`}>
          {toolCall.success ? 'Success' : 'Failed'}
        </span>
      </header>
      <details>
        <summary>Arguments</summary>
        <pre>{formatToolValue(toolCall.arguments)}</pre>
      </details>
      <details>
        <summary>Result</summary>
        <pre>{formatToolValue(toolCall.result)}</pre>
      </details>
    </section>
  )
}

function formatToolValue(value: unknown): string {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return value
    }
  }

  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
