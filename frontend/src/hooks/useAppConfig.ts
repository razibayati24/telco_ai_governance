/**
 * useAppConfig — load /api/config once at boot and share globally.
 *
 * The backend resolves brand / app / chat-panel copy from
 * `template.config.json` + env vars and returns the merged shape here.
 * The frontend uses this to render the page title, header, chat copy and
 * suggested questions — so a deployer can re-brand the app without touching
 * any TSX file.
 */
import { useEffect, useState } from 'react';

export interface AppConfig {
  workspace_host?: string | null;
  genie_url?: string | null;
  brand: {
    name: string;
    parent?: string;
    industry?: string;
    email_domain?: string;
  };
  app: {
    title: string;
    subtitle: string;
    header_brand: string;
  };
  policy_chat_popup: {
    title: string;
    subtitle: string;
    empty_state_label: string;
    empty_state_subtext: string;
    input_placeholder: string;
    loading_text: string;
  };
  policy_assistant: {
    empty_state_heading: string;
    empty_state_description: string;
    suggested_questions: string[];
  };
  genie_chat: {
    empty_state_heading: string;
    empty_state_description: string;
    suggested_questions: string[];
  };
  dashboard?: {
    window_days?: number;
    tabs?: { id: string; label: string }[];
  };
}

export const DEFAULT_APP_CONFIG: AppConfig = {
  brand: { name: 'Acme Corp' },
  app: {
    title: 'AI Governance & Observability',
    subtitle: 'AI Agentic FinOps Assistant',
    header_brand: 'Acme Corp',
  },
  policy_chat_popup: {
    title: 'Policy Assistant',
    subtitle: 'RAG-powered governance Q&A',
    empty_state_label: 'Ask about your data & AI policies',
    empty_state_subtext: 'Policy KB covers your governance topics',
    input_placeholder: 'Ask about policies...',
    loading_text: 'Searching policies...',
  },
  policy_assistant: {
    empty_state_heading: 'Ask about AI Governance Policies',
    empty_state_description: 'This assistant answers questions from your governance policy documents.',
    suggested_questions: [],
  },
  genie_chat: {
    empty_state_heading: 'Ask about your AI operations',
    empty_state_description: 'Queries live system table data via natural language',
    suggested_questions: [],
  },
};

let cached: AppConfig | null = null;
let pending: Promise<AppConfig> | null = null;

export function fetchAppConfig(): Promise<AppConfig> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch('/api/config')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((cfg) => {
      cached = { ...DEFAULT_APP_CONFIG, ...cfg } as AppConfig;
      // Patch document title at runtime so the browser tab matches the brand.
      try {
        if (cached.app?.title && cached.brand?.name) {
          document.title = `${cached.app.title} | ${cached.brand.name}`;
        }
      } catch {
        // ignore (SSR / non-browser)
      }
      return cached;
    })
    .catch(() => {
      cached = DEFAULT_APP_CONFIG;
      return cached;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useAppConfig(): AppConfig {
  const [cfg, setCfg] = useState<AppConfig>(cached ?? DEFAULT_APP_CONFIG);
  useEffect(() => {
    if (cached) return;
    let mounted = true;
    fetchAppConfig().then((c) => {
      if (mounted) setCfg(c);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return cfg;
}
