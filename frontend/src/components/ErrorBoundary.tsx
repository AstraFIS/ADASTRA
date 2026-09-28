import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Short name of what is wrapped, e.g. "Revenue chart". */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render error inside one section so the rest of the page stays up.
 * Without a boundary React unmounts the entire tree and the user sees a blank page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ui] ${this.props.label} failed to render`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-semibold text-loss">{this.props.label} could not be displayed</p>
          <p className="mt-1 break-words text-sm text-ink-2">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
