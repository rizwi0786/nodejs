import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this (e.g. the route) clears the error. */
  resetKey: string;
}

/** Keeps a crash in one page from taking down the whole app shell. */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('Page crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-danger/40 bg-danger/5 p-6 text-center">
        <AlertTriangle size={22} className="mx-auto text-danger" aria-hidden />
        <div className="mt-2 font-semibold">This page hit an error</div>
        <p className="mt-1 text-sm text-muted">Your progress is safe. Try reloading, or go back and continue elsewhere.</p>
        <pre className="mt-3 overflow-x-auto rounded bg-raised px-3 py-2 text-left font-mono text-xs text-muted">{this.state.error.message}</pre>
        <button className="btn-outline mx-auto mt-4" onClick={() => window.location.reload()}>
          <RotateCcw size={14} /> Reload
        </button>
      </div>
    );
  }
}
