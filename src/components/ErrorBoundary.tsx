import React, { ReactNode, ReactElement } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

/**
 * Error Boundary component that catches React errors and displays a fallback UI
 * Prevents entire app crash when a single component fails
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorCount: 0,
    };
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorCount: 0 });
  };

  render(): ReactElement {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              padding: '40px',
              maxWidth: '500px',
              textAlign: 'center',
            }}
          >
            <h1 style={{ color: '#d32f2f', marginBottom: '12px', fontSize: '24px' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '20px', lineHeight: '1.6' }}>
              {this.state.error?.message || 'An unexpected error occurred in the application.'}
            </p>
            {import.meta.env.DEV && this.state.error && (
              <details
                style={{
                  textAlign: 'left',
                  marginBottom: '20px',
                  backgroundColor: '#f5f5f5',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#333',
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                  Error details (dev only)
                </summary>
                <pre
                  style={{
                    marginTop: '8px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                  }}
                >
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={this.resetError}
              style={{
                padding: '10px 24px',
                backgroundColor: '#0052cc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
              onMouseOver={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0747a6';
              }}
              onMouseOut={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#0052cc';
              }}
            >
              Try again
            </button>
            {this.state.errorCount > 3 && (
              <p style={{ marginTop: '16px', fontSize: '12px', color: '#999' }}>
                Multiple errors detected. Please refresh the page.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children as ReactElement;
  }
}
