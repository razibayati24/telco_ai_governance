import { useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  Send,
  Loader2,
  Bot,
  User,
  X,
  Sparkles,
  MessageSquare,
  ChevronDown,
  RotateCcw,
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
  'What are the four data security levels and how are they defined?',
  'What is the difference between Secure and PII classification?',
  'What are the access levels for telecom data and who gets Level 3?',
  'What are the SOX compliance requirements for AI models?',
  'What CPNI data is protected and can AI models use it?',
  'What network data can be used for AI model training?',
  'What are the prohibited uses of subscriber data in AI?',
  'What happens if there is a CPNI breach in an AI system?',
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
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
              title="New chat"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Bot className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-1">Ask about telecom data & AI policies</p>
            <p className="text-[11px] text-gray-500 mb-4">
              6 policies: data classification, internal access, SOX compliance, CPNI, network data, AI use
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
/*  Genie Room Chat (in-app via API)                                   */
/* ------------------------------------------------------------------ */

interface GenieMessage {
  role: 'user' | 'assistant';
  content: string;
  sql?: string | null;
}

const GENIE_SUGGESTIONS = [
  'Show per-model cost attribution for the last 30 days',
  'What is the average latency per model?',
  'Which endpoints are idle or underutilized?',
  'Show unauthorized access attempts this week',
  'Were there any cost spikes recently?',
  'What is the MLflow run success rate trend?',
];

function GenieChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<GenieMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const askGenie = async (question: string) => {
    if (!question.trim() || loading) return;
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    try {
      const res = await fetch('/api/genie/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_id: conversationId }),
      });
      const data = await res.json();
      if (data.conversation_id) setConversationId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer || 'No response from Genie.', sql: data.sql },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to reach Genie. Please try again.' },
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
          <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Genie Q&A</h3>
            <p className="text-[10px] text-gray-500">Ask in plain English</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setConversationId(null); }}
              className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
              title="New chat"
            >
              <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-db-dark-600 flex items-center justify-center transition"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles className="w-10 h-10 text-purple-400/50 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-1">Ask about your AI operations</p>
            <p className="text-[11px] text-gray-500 mb-4">
              Queries live system table data via natural language
            </p>
            <div className="space-y-1.5">
              {GENIE_SUGGESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => askGenie(q)}
                  className="w-full text-left text-xs text-gray-400 bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 hover:border-purple-500/30 rounded-lg px-3 py-2 transition-all"
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
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 ${
                msg.role === 'user'
                  ? 'bg-purple-500/20 border border-purple-500/30 text-white'
                  : 'bg-db-dark-700 border border-db-dark-600 text-gray-200'
              }`}
            >
              <div className="text-[13px] whitespace-pre-wrap leading-relaxed">
                {msg.content}
              </div>
              {msg.sql && (
                <details className="mt-2">
                  <summary className="text-[10px] text-purple-400 cursor-pointer hover:text-purple-300">
                    View SQL
                  </summary>
                  <pre className="mt-1 text-[10px] text-gray-400 bg-db-dark-900 rounded p-2 overflow-x-auto font-mono">
                    {msg.sql}
                  </pre>
                </details>
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
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div className="bg-db-dark-700 border border-db-dark-600 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                <span className="text-xs text-gray-400">Querying data...</span>
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
            onKeyDown={(e) => e.key === 'Enter' && askGenie(input)}
            placeholder="Ask about AI operations..."
            className="flex-1 bg-db-dark-700 border border-db-dark-600 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition"
            disabled={loading}
          />
          <button
            onClick={() => askGenie(input)}
            disabled={loading || !input.trim()}
            className="w-9 h-9 bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-white rounded-xl transition flex items-center justify-center flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating Buttons + Popup Containers (both can be open at once)     */
/* ------------------------------------------------------------------ */

export default function ChatPopups() {
  const [policyOpen, setPolicyOpen] = useState(false);
  const [genieOpen, setGenieOpen] = useState(false);
  const [showSelector, setShowSelector] = useState(false);

  const anyOpen = policyOpen || genieOpen;

  return (
    <>
      {/* Policy Assistant Panel - right side */}
      {policyOpen && (
        <div
          className="fixed bottom-24 right-6 z-[100] w-[400px] bg-db-dark-800 border border-db-dark-600 rounded-2xl shadow-2xl shadow-black/50 flex flex-col"
          style={{ height: 'min(550px, calc(100vh - 140px))' }}
        >
          <PolicyChat onClose={() => setPolicyOpen(false)} />
        </div>
      )}

      {/* Genie Panel - left of policy (or right if policy is closed) */}
      {genieOpen && (
        <div
          className={`fixed bottom-24 z-[100] w-[400px] bg-db-dark-800 border border-db-dark-600 rounded-2xl shadow-2xl shadow-black/50 flex flex-col`}
          style={{
            height: 'min(550px, calc(100vh - 140px))',
            right: policyOpen ? '424px' : '24px',
          }}
        >
          <GenieChat onClose={() => setGenieOpen(false)} />
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-[100] flex items-end gap-2">
        {/* Selector flyout */}
        {showSelector && !anyOpen && (
          <div className="flex gap-2 mb-0 mr-2 animate-in fade-in duration-200">
            <button
              onClick={() => { setPolicyOpen(true); setShowSelector(false); }}
              className="flex items-center gap-2 bg-db-dark-800 border border-db-dark-600 hover:border-db-orange/50 rounded-xl px-3 py-2.5 shadow-xl shadow-black/30 transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-db-orange/20 flex items-center justify-center group-hover:bg-db-orange/30 transition">
                <BookOpen className="w-4 h-4 text-db-orange" />
              </div>
              <span className="text-xs font-medium text-white">Policy</span>
            </button>

            <button
              onClick={() => { setGenieOpen(true); setShowSelector(false); }}
              className="flex items-center gap-2 bg-db-dark-800 border border-db-dark-600 hover:border-purple-500/50 rounded-xl px-3 py-2.5 shadow-xl shadow-black/30 transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition">
                <Sparkles className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-white">Genie</span>
            </button>
          </div>
        )}

        {/* Quick-open buttons when one or both panels are open */}
        {anyOpen && (
          <div className="flex gap-2 mr-1">
            {!policyOpen && (
              <button
                onClick={() => setPolicyOpen(true)}
                className="w-10 h-10 rounded-full bg-db-dark-700 border border-db-dark-500 hover:border-db-orange/50 flex items-center justify-center transition shadow-lg"
                title="Open Policy Assistant"
              >
                <BookOpen className="w-4 h-4 text-db-orange" />
              </button>
            )}
            {!genieOpen && (
              <button
                onClick={() => setGenieOpen(true)}
                className="w-10 h-10 rounded-full bg-db-dark-700 border border-db-dark-500 hover:border-purple-500/50 flex items-center justify-center transition shadow-lg"
                title="Open Genie Q&A"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
              </button>
            )}
          </div>
        )}

        {/* Main FAB */}
        <button
          onClick={() => {
            if (anyOpen) {
              setPolicyOpen(false);
              setGenieOpen(false);
            } else {
              setShowSelector((prev) => !prev);
            }
          }}
          className={`w-14 h-14 rounded-full shadow-lg shadow-black/40 flex items-center justify-center transition-all duration-300 ${
            anyOpen || showSelector
              ? 'bg-db-dark-700 border border-db-dark-500'
              : 'bg-gradient-to-br from-db-orange to-orange-600 hover:from-db-orange-light hover:to-orange-500'
          }`}
        >
          {anyOpen || showSelector ? (
            <X className="w-6 h-6 text-gray-300" />
          ) : (
            <MessageSquare className="w-6 h-6 text-white" />
          )}
        </button>
      </div>
    </>
  );
}
