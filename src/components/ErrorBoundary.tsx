import { Component, type ReactNode } from 'react';

/**
 * Catches render-time crashes in the subtree and swaps in a fallback UI.
 *
 * Used around the 3D experience: a renderer crash must never white-screen the
 * site when a complete 2D version of the same content is one click away. The
 * fallback explains what happened and offers the way out; the error itself is
 * logged to the console for the report-a-bug path, never shown to the reader.
 *
 * Deliberately a class component — error boundaries are the one thing function
 * components cannot do. No state updates outside the two static/instance
 * lifecycles React provides for exactly this.
 */
interface ErrorBoundaryProps {
  /** Rendered when no error has been caught. */
  children: ReactNode;
  /** What to show after a crash. Receives a retry that remounts the subtree. */
  fallback: (retry: () => void) => ReactNode;
  /** Tag for the console report, so the source is identifiable. */
  label: string;
}

interface ErrorBoundaryState {
  error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: unknown, info: { componentStack?: string }): void {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) {
      return this.props.fallback(this.retry);
    }
    return this.props.children;
  }
}
