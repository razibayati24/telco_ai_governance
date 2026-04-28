import { useState, useRef, useEffect } from 'react';
import { BookOpen, Send, Loader2, FileText, Bot, User } from 'lucide-react';
import { useAppConfig } from '../hooks/useAppConfig';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
}

const SUGGESTED_QUESTIONS = [
  'What are the data classification tiers for AI systems?',
  'What is the model deployment approval process?',
  'What are the AI cost budget approval thresholds?',
  'How is unauthorized access to AI services detected?',
  'What are the Genie room usage limits?',
  'What uses of the AI platform are prohibited?',
  'What are the requirements for decommissioning idle endpoints?',
  'What are the AI Gateway security controls?',
];

export default function PolicyAssistant() {
  const cfg = useAppConfig();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<
    { policy_name: string; source_file: string; chunk_count: number }[]
  >([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ka/policies')
      .then((r) => r.json())
      .then(setPolicies)
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const askQuestion = async (question: string) => {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chat Panel */}
        <div className="lg:col-span-3 card flex flex-col" style={{ minHeight: '650px' }}>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-db-orange" />
            <h3 className="text-lg font-semibold text-white">
              Policy Knowledge Assistant
            </h3>
            <span className="ml-auto text-xs text-gray-500 bg-db-dark-700 px-2 py-1 rounded">
              RAG-powered
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Bot className="w-12 h-12 text-gray-600 mb-4" />
                <h4 className="text-lg text-gray-400 font-medium mb-2">
                  {cfg.policy_assistant.empty_state_heading}
                </h4>
                <p className="text-sm text-gray-500 max-w-md">
                  This assistant answers questions from 6 policy documents covering
                  data access, model lifecycle, cost management, security, Genie
                  governance, and acceptable use.
                </p>
                <div className="grid grid-cols-2 gap-2 mt-6 max-w-lg">
                  {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                    <button
                      key={i}
                      onClick={() => askQuestion(q)}
                      className="text-left text-xs text-gray-400 bg-db-dark-700 hover:bg-db-dark-600 border border-db-dark-600 hover:border-db-orange/30 rounded-lg px-3 py-2 transition-all"
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
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-db-orange/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-db-orange" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-db-orange/20 border border-db-orange/30 text-white'
                      : 'bg-db-dark-700 border border-db-dark-600 text-gray-200'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-db-dark-500">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
                        Sources
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.map((s, j) => (
                          <span
                            key={j}
                            className="text-[11px] bg-db-dark-600 text-gray-400 px-2 py-0.5 rounded"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-blue-400" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-db-orange/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-db-orange" />
                </div>
                <div className="bg-db-dark-700 border border-db-dark-600 rounded-lg px-4 py-3">
                  <Loader2 className="w-5 h-5 text-db-orange animate-spin" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-db-dark-600 pt-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askQuestion(input)}
              placeholder="Ask about AI governance policies..."
              className="flex-1 bg-db-dark-700 border border-db-dark-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-db-orange/50 transition"
              disabled={loading}
            />
            <button
              onClick={() => askQuestion(input)}
              disabled={loading || !input.trim()}
              className="px-4 py-2.5 bg-db-orange hover:bg-db-orange-light disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition flex items-center gap-2 text-sm font-medium"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Policy Documents */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-gray-400" />
              <h4 className="text-sm font-semibold text-white">Policy Documents</h4>
            </div>
            <div className="space-y-2">
              {policies.map((p, i) => (
                <div
                  key={i}
                  className="bg-db-dark-700 rounded-lg px-3 py-2 border border-db-dark-600"
                >
                  <p className="text-xs text-gray-300 font-medium leading-tight">
                    {p.policy_name}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {p.chunk_count} sections indexed
                  </p>
                </div>
              ))}
              {policies.length === 0 && (
                <p className="text-xs text-gray-500">Loading policies...</p>
              )}
            </div>
          </div>

          {/* More questions */}
          <div className="card">
            <h4 className="text-sm font-semibold text-white mb-3">
              Try asking about...
            </h4>
            <div className="space-y-1.5">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => askQuestion(q)}
                  disabled={loading}
                  className="w-full text-left text-xs text-gray-400 hover:text-white bg-db-dark-700 hover:bg-db-dark-600 rounded px-2.5 py-1.5 transition disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
