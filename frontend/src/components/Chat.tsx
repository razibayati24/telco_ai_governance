import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  CircleUser,
  Activity,
  Sparkles,
} from 'lucide-react';
import { useAppConfig } from '../hooks/useAppConfig';

/* -----------------------------------------------------------------------
 * Full-page chat tab — Multi-Agent Supervisor (Agent Bricks)
 *
 * Layout (left sidebar + main panel) is identical to the deployed app.
 * All customer-specific copy (brand strings, agent cards, demo paths,
 * placeholder text) is fetched from /api/agent/config which renders
 * `template.config.json["agents"]` with brand substitutions applied
 * server-side.  Until that response arrives, we use a brand-aware
 * fallback derived from /api/config (useAppConfig) so the empty state
 * still says the deployer's brand, never "Acme Corp".
 *
 * Wires to:
 *   GET  /api/agent/config  — sidebar copy + OBO badge state
 *   POST /api/agent/ask     — supervisor invocation
 * -------------------------------------------------------------------- */

interface AgentMeta {
  label: string;
  color: string;
  description: string;
}

interface DemoPath {
  title: string;
  icon: string;
  questions: string[];
}

interface AgentConfig {
  app_name: string;
  app_subtitle: string;
  app_icon: string;
  powered_by: string;
  agents: Record<string, AgentMeta>;
  demo_paths: DemoPath[];
  placeholder: string;
  viewer_email?: string | null;
  obo_active?: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agent?: string | null;
}

export default function Chat() {
  const appCfg = useAppConfig();

  // Fallback config — brand-aware via useAppConfig so the chat tab still
  // looks branded before /api/agent/config returns.
  const fallbackConfig: AgentConfig = useMemo(
    () => ({
      app_name: `${appCfg.brand.name} AI Governance`,
      app_subtitle: appCfg.app.subtitle,
      app_icon: '\u2B22',
      powered_by: 'Databricks Agent Bricks',
      agents: {},
      demo_paths: [],
      placeholder:
        'Ask about AI vendor contracts, spend, latency SLAs, or governance clauses\u2026',
    }),
    [appCfg]
  );

  const [config, setConfig] = useState<AgentConfig>(fallbackConfig);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [openDemoIdx, setOpenDemoIdx] = useState<number | null>(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the visible config in sync with the latest brand fallback so the
  // Chat header doesn't flash "Acme Corp" before /api/agent/config returns.
  useEffect(() => {
    setConfig((prev) => ({ ...fallbackConfig, ...prev }));
  }, [fallbackConfig]);

  useEffect(() => {
    fetch('/api/agent/config')
      .then((r) => r.json())
      .then((data) => setConfig({ ...fallbackConfig, ...data }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const askAgent = async (questionRaw?: string) => {
    const question = (questionRaw ?? input).trim();
    if (!question || loading) return;
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: question },
    ];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/agent/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'No response received.',
          agent: data.agent ?? null,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Unable to reach the AI Governance Supervisor right now. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  const renderAgentTag = (agentKey?: string | null) => {
    if (!agentKey) return null;
    const a = config.agents[agentKey];
    if (!a) return null;
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider mb-2"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.85)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-sm"
          style={{ background: a.color }}
        />
        {a.label}
      </div>
    );
  };

  // Stable list of agent keys for the sidebar (preserves config order).
  const agentEntries = useMemo(
    () => Object.entries(config.agents),
    [config.agents]
  );

  return (
    <div className="grid grid-cols-[280px_1fr] h-[calc(100vh-60px)]">
      {/* ---------------- Sidebar ---------------- */}
      <aside className="bg-db-dark-800/70 border-r border-db-dark-600 overflow-y-auto px-4 py-5">
        {/* Brand */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.app_icon}</span>
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              {config.app_name}
            </h2>
          </div>
          <p className="mt-1 text-[11px] text-gray-500 leading-snug">
            {config.app_subtitle}
          </p>
        </div>

        {/* Signed-in / OBO badge */}
        <div className="mb-5 px-3 py-2.5 rounded-lg bg-db-dark-700 border border-db-dark-600">
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: config.obo_active ? '#7BC88F' : '#E8945A',
              }}
            />
            <CircleUser className="w-3 h-3 text-gray-400" />
            <span className="text-[11px] text-white font-medium truncate">
              {config.viewer_email || 'Service principal mode'}
            </span>
          </div>
          <div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-gray-500">
            {config.obo_active
              ? 'OBO active — queries run as you'
              : 'Service principal mode'}
          </div>
        </div>

        {/* Agents */}
        <div className="mb-5">
          <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-gray-500 mb-2">
            Agents
          </div>
          <div className="space-y-1.5">
            {agentEntries.map(([key, a]) => (
              <div key={key} className="flex items-start gap-2 py-1">
                <span
                  className="w-1.5 h-1.5 rounded-sm mt-1.5 flex-shrink-0"
                  style={{ background: a.color }}
                />
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-white">
                    {a.label}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-snug mt-0.5">
                    {a.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Demo paths */}
        <div className="mb-5">
          <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-gray-500 mb-2">
            Demo Paths
          </div>
          <div className="space-y-1.5">
            {config.demo_paths.map((path, idx) => {
              const isOpen = openDemoIdx === idx;
              return (
                <div
                  key={path.title}
                  className="rounded-lg border border-db-dark-600 bg-db-dark-700/40"
                >
                  <button
                    onClick={() => setOpenDemoIdx(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-db-dark-600/50 transition rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{path.icon}</span>
                      <span className="text-[12px] font-medium text-white">
                        {path.title}
                      </span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-2 pb-2 space-y-1">
                      {path.questions.map((q) => (
                        <button
                          key={q}
                          onClick={() => askAgent(q)}
                          disabled={loading}
                          className="w-full text-left text-[11px] text-gray-400 hover:text-white px-2 py-1.5 rounded-md hover:bg-db-dark-600 transition leading-snug disabled:opacity-50"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Clear conversation */}
        <button
          onClick={handleClear}
          disabled={messages.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12px] text-gray-400 hover:text-white bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Clear conversation
        </button>
      </aside>

      {/* ---------------- Main chat panel ---------------- */}
      <section className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-6 pb-4 border-b border-db-dark-700">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.app_icon}</span>
            <h1 className="text-lg font-bold text-white tracking-tight">
              {config.app_name}
            </h1>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {config.app_subtitle} &middot; powered by {config.powered_by}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {messages.length === 0 && !loading && (
            <div className="max-w-2xl mx-auto text-center py-16">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-db-orange/10 border border-db-orange/30 mb-4">
                <Sparkles className="w-6 h-6 text-db-orange" />
              </div>
              <h3 className="text-base font-semibold text-white mb-2">
                Ask the AI Governance Supervisor
              </h3>
              <p className="text-[13px] text-gray-400 leading-relaxed max-w-md mx-auto">
                Routed through Agent Bricks &mdash; the supervisor will pick
                the right agent (Genie for live ops data, Contract Analyst
                for governance PDFs) and run queries on your behalf.
              </p>
              <p className="text-[11px] text-gray-600 mt-3">
                Try a demo path on the left to get started.
              </p>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-1">
            {messages.map((m, i) => (
              <div
                key={i}
                className="py-5 border-b border-db-dark-700/60 last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5 ${
                      m.role === 'user'
                        ? 'bg-blue-500/15 text-blue-300'
                        : 'bg-db-dark-700 text-gray-300'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <CircleUser className="w-4 h-4" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                      {m.role === 'user'
                        ? config.viewer_email || 'You'
                        : 'Supervisor'}
                    </div>
                    {m.role === 'assistant' && renderAgentTag(m.agent)}
                    <div className="prose-chat text-[13.5px] text-gray-100 leading-7 whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="py-5">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-db-dark-700 text-gray-300 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                      Supervisor
                    </div>
                    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-db-dark-700 border border-db-dark-600">
                      <Loader2 className="w-3.5 h-3.5 text-db-orange animate-spin" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
                        Routing through Agent Bricks Supervisor&hellip;
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-db-dark-700 bg-db-dark-800/40 px-8 py-4">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  askAgent();
                }
              }}
              placeholder={config.placeholder}
              rows={1}
              className="flex-1 resize-none bg-db-dark-700 border border-db-dark-600 rounded-xl px-4 py-3 text-[13.5px] text-white placeholder-gray-500 focus:outline-none focus:border-db-orange/50 transition leading-6 max-h-40"
              disabled={loading}
            />
            <button
              onClick={() => askAgent()}
              disabled={loading || !input.trim()}
              className="h-11 w-11 flex-shrink-0 rounded-xl bg-db-orange hover:bg-db-orange-light disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="max-w-3xl mx-auto mt-2 text-[10px] font-mono text-gray-600 uppercase tracking-wider">
            Enter to send &middot; Shift+Enter for newline
          </div>
        </div>
      </section>
    </div>
  );
}
