import { Loader2, AlertCircle } from 'lucide-react';

export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">{label || 'Loading data...'}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
      <p className="text-sm text-red-300 mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs px-3 py-1.5 bg-db-dark-700 hover:bg-db-dark-600 rounded-lg transition"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-gray-500">
      <span className="text-sm">{message || 'No data available'}</span>
    </div>
  );
}
