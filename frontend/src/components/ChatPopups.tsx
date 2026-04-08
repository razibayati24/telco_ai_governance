import { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Send,
  Loader2,
  Bot,
  User,
  X,
  Sparkles,
  ExternalLink,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Policy Assistant Chat (RAG)                                        */
/* ------------------------------------------------------------------ */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

const POLICY_QUESTIONS = [
  'What are the data classification tiers for AI systems?',
  'What is the model deployment approval process?',
  'What are the AI cost budget approval thresholds?',
  'How is unauthorized access detected?',
  'What are the Genie room usage limits?',
  'What uses of the AI platform are prohibited?',
];

function PolicyChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const askQuestion = async (question: string) => {
    if (!question.trim() || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/ka/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, sources: data.sources },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to get a response. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-db-dark-600 bg-db-dark-800 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-db-orange/20 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-db-orange" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Policy Assistant</h3>
            <p className="text-[10px] text-gray-500">RAG-powered governance Q&A</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-1">Ask about AI governance policies</p>
            <p className="text-[11px] text-gray-500 mb-4">
              6 policy docs: data access, model lifecycle, costs, security, Genie, acceptable use
            </p>
            <div className="space-y-1.5">
              {POLICY_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => askQuestion(q)}
                  className="w-full text-left text-xs text-gray-400 bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 hover:border-db-orange/30 rounded-lg px-3 py-2 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-db-orange/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-db-orange" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-db-orange/20 border border-db-orange/30 text-white'
                  : 'bg-db-dark-700 border border-db-dark-600 text-gray-200'
              }`}
            >
              <div className="text-[13px] whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-db-dark-500">
                  <div className="flex flex-wrap gap-1">
                    {msg.sources.map((s, j) => (
                      <span
                        key={j}
                        className="text-[10px] bg-db-dark-600 text-gray-400 px-1.5 py-0.5 rounded"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-blue-400" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-db-orange/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-db-orange" />
            </div>
            <div className="bg-db-dark-700 border border-db-dark-600 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-db-orange animate-spin" />
                <span className="text-xs text-gray-400">Searching policies...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-db-dark-600 bg-db-dark-800 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && askQuestion(input)}
            placeholder="Ask about policies..."
            className="flex-1 bg-db-dark-700 border border-db-dark-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-db-orange/50 transition"
            disabled={loading}
          />
          <button
            onClick={() => askQuestion(input)}
            disabled={loading || !input.trim()}
            className="w-9 h-9 bg-db-orange hover:bg-db-orange-light disabled:opacity-40 text-white rounded-xl transition flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Genie Room Chat                                                    */
/* ------------------------------------------------------------------ */

const GENIE_URL =
  'https://fevm-cmegdemos.cloud.databricks.com/genie/rooms/01f1336d23c21dbeaf01c8b966940ff8';

const GENIE_QUESTIONS = [
  { cat: 'Usage', q: 'What are the top 10 most used AI models in the last 30 days?' },
  { cat: 'Usage', q: 'Which users consume the most tokens?' },
  { cat: 'Cost', q: 'Show AI cost trends broken down by provider' },
  { cat: 'Cost', q: 'Which SKUs are the most expensive?' },
  { cat: 'Security', q: 'How many access denials happened in the last week?' },
  { cat: 'Security', q: 'Which users have the most denied access attempts?' },
  { cat: 'Health', q: 'How many endpoints are idle?' },
  { cat: 'Health', q: 'Which endpoints have the highest error rates?' },
];

function GenieChat({ onClose }: { onClose: () => void }) {
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-db-dark-600 bg-db-dark-800 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Genie Q&A</h3>
            <p className="text-[10px] text-gray-500">Natural language analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={GENIE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
          </a>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Toggle: Embed vs Questions */}
      <div className="px-4 py-2 border-b border-db-dark-700 flex gap-2">
        <button
          onClick={() => setShowEmbed(true)}
          className={`text-xs px-3 py-1.5 rounded-lg transition ${
            showEmbed
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-400 hover:text-white bg-db-dark-700'
          }`}
        >
          Genie Room
        </button>
        <button
          onClick={() => setShowEmbed(false)}
          className={`text-xs px-3 py-1.5 rounded-lg transition ${
            !showEmbed
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-400 hover:text-white bg-db-dark-700'
          }`}
        >
          Sample Questions
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showEmbed ? (
          <iframe
            src={GENIE_URL}
            className="w-full h-full border-0"
            title="AI Governance Genie"
            allow="clipboard-write"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
          />
        ) : (
          <div className="px-4 py-4 space-y-4">
            <div className="text-center mb-4">
              <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                Ask these questions in the Genie Room
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Queries run on live system table data
              </p>
            </div>

            {['Usage', 'Cost', 'Security', 'Health'].map((cat) => (
              <div key={cat}>
                <h4 className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider mb-1.5">
                  {cat}
                </h4>
                <div className="space-y-1">
                  {GENIE_QUESTIONS.filter((g) => g.cat === cat).map((g, i) => (
                    <a
                      key={i}
                      href={GENIE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-gray-300 hover:text-white bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 hover:border-purple-500/30 rounded-lg px-3 py-2 transition-all"
                    >
                      {g.q}
                    </a>
                  ))}
                </div>
              </div>
            ))}

            <a
              href={GENIE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full mt-4 px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 rounded-xl transition text-sm font-medium"
            >
              <MessageSquare className="w-4 h-4" />
              Open Full Genie Room
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Buttons + Popup Container                                 */
/* ------------------------------------------------------------------ */

type OpenPanel = null | 'policy' | 'genie';

export default function ChatPopups() {
  const [open, setOpen] = useState<OpenPanel>(null);
  const [showSelector, setShowSelector] = useState(false);

  const toggle = (panel: 'policy' | 'genie') => {
    setOpen((prev) => (prev === panel ? null : panel));
    setShowSelector(false);
  };

  return (
    <>
      {/* Popup Panel */}
      {open && (
        <>
          {/* Backdrop - click to close */}
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setOpen(null)}
          />
          {/* Chat Window */}
          <div
            className="fixed bottom-24 right-6 z-[100] w-[420px] bg-db-dark-800 border border-db-dark-600 rounded-2xl shadow-2xl shadow-black/50 flex flex-col"
            style={{ height: 'min(600px, calc(100vh - 140px))' }}
          >
            {open === 'policy' && <PolicyChat onClose={() => setOpen(null)} />}
            {open === 'genie' && <GenieChat onClose={() => setOpen(null)} />}
          </div>
        </>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
        {/* Selector flyout */}
        {showSelector && !open && (
          <div className="flex flex-col gap-2 mb-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <button
              onClick={() => toggle('policy')}
              className="flex items-center gap-3 bg-db-dark-800 border border-db-dark-600 hover:border-db-orange/50 rounded-xl px-4 py-3 shadow-xl shadow-black/30 transition-all group"
            >
              <div className="w-9 h-9 rounded-full bg-db-orange/20 flex items-center justify-center group-hover:bg-db-orange/30 transition">
                <BookOpen className="w-5 h-5 text-db-orange" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Policy Assistant</p>
                <p className="text-[10px] text-gray-500">Ask about governance policies</p>
              </div>
            </button>

            <button
              onClick={() => toggle('genie')}
              className="flex items-center gap-3 bg-db-dark-800 border border-db-dark-600 hover:border-purple-500/50 rounded-xl px-4 py-3 shadow-xl shadow-black/30 transition-all group"
            >
              <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-white">Genie Q&A</p>
                <p className="text-[10px] text-gray-500">Query system tables with NL</p>
              </div>
            </button>
          </div>
        )}

        {/* Main FAB */}
        {!open ? (
          <button
            onClick={() => setShowSelector((prev) => !prev)}
            className={`w-14 h-14 rounded-full shadow-lg shadow-black/40 flex items-center justify-center transition-all duration-300 ${
              showSelector
                ? 'bg-db-dark-700 border border-db-dark-500 rotate-45'
                : 'bg-gradient-to-br from-db-orange to-orange-600 hover:from-db-orange-light hover:to-orange-500'
            }`}
          >
            {showSelector ? (
              <X className="w-6 h-6 text-gray-300" />
            ) : (
              <MessageSquare className="w-6 h-6 text-white" />
            )}
          </button>
        ) : (
          /* Show small indicator buttons when a panel is open */
          <div className="flex gap-2">
            {open !== 'policy' && (
              <button
                onClick={() => toggle('policy')}
                className="w-10 h-10 rounded-full bg-db-dark-700 border border-db-dark-500 hover:border-db-orange/50 flex items-center justify-center transition shadow-lg"
                title="Policy Assistant"
              >
                <BookOpen className="w-4 h-4 text-db-orange" />
              </button>
            )}
            {open !== 'genie' && (
              <button
                onClick={() => toggle('genie')}
                className="w-10 h-10 rounded-full bg-db-dark-700 border border-db-dark-500 hover:border-purple-500/50 flex items-center justify-center transition shadow-lg"
                title="Genie Q&A"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
              </button>
            )}
            <button
              onClick={() => setOpen(null)}
              className="w-10 h-10 rounded-full bg-db-dark-700 border border-db-dark-500 hover:border-red-500/50 flex items-center justify-center transition shadow-lg"
              title="Close"
            >
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
