import { useState, useEffect } from 'react';
import { ExternalLink, MessageSquare, Sparkles, HelpCircle } from 'lucide-react';

const SAMPLE_QUESTIONS = [
  {
    category: 'Usage & Trends',
    questions: [
      'What are the top 10 most used AI models in the last 30 days?',
      'Which users consume the most tokens?',
      'Show me the daily trend of AI requests over the past month',
      'What is the average latency per model?',
    ],
  },
  {
    category: 'Cost Analysis',
    questions: [
      'What is the total AI cost broken down by category?',
      'Which SKUs are the most expensive?',
      'Show cost trends for Anthropic vs OpenAI model serving',
      'What percentage of cost comes from real-time inference?',
    ],
  },
  {
    category: 'Security & Compliance',
    questions: [
      'How many access denials happened in the last week?',
      'Which users have the most denied access attempts?',
      'Show denied access events by service',
      'Are there any unusual access patterns?',
    ],
  },
  {
    category: 'Endpoint Health',
    questions: [
      'How many endpoints are idle?',
      'List all underutilized custom model endpoints',
      'Which endpoints have the highest error rates?',
      'Show me endpoints with zero traffic in the last 30 days',
    ],
  },
];

export default function GenieQA() {
  const [genieUrl, setGenieUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => setGenieUrl(data.genie_url))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Genie Room Embed */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-db-orange" />
            <h3 className="text-lg font-semibold text-white">AI Governance Genie</h3>
          </div>
          <a
            href={genieUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-db-orange hover:bg-db-orange-light text-white rounded-lg transition-all duration-200 text-sm font-medium shadow-lg shadow-db-orange/20"
          >
            <MessageSquare className="w-4 h-4" />
            Open Genie Room
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Try iframe embed */}
        <div className="rounded-lg overflow-hidden border border-db-dark-600 bg-db-dark-900">
          <iframe
            src={genieUrl || ''}
            className="w-full border-0"
            style={{ height: '600px' }}
            title="AI Governance Genie"
            allow="clipboard-write"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
          />
          {/* Fallback message shown below the iframe if it can't render */}
          <noscript>
            <div className="p-8 text-center">
              <p className="text-gray-400">Genie room requires JavaScript to be enabled.</p>
            </div>
          </noscript>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          If the embedded view does not load, click "Open Genie Room" to access it in a new tab.
          Databricks workspace authentication is required.
        </p>
      </div>

      {/* Sample Questions */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-gray-400" />
          <h3 className="card-header mb-0">Sample Questions to Ask</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SAMPLE_QUESTIONS.map((section) => (
            <div key={section.category}>
              <h4 className="text-sm font-semibold text-db-orange mb-2">{section.category}</h4>
              <ul className="space-y-1.5">
                {section.questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-gray-500 mt-0.5">&#8226;</span>
                    <span className="hover:text-white transition cursor-default">{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
