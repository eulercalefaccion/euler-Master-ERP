import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary atrapó un error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', backgroundColor: '#fee2e2', color: '#991b1b', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ marginBottom: '1rem' }}>💥 Ups, la aplicación falló</h1>
          <p style={{ marginBottom: '2rem' }}>Ocurrió un error inesperado al renderizar la pantalla.</p>
          <div style={{ padding: '1rem', backgroundColor: 'white', borderRadius: '8px', maxWidth: '80%', overflowX: 'auto', border: '1px solid #f87171' }}>
            <h3 style={{ marginTop: 0 }}>Detalle del Error:</h3>
            <pre style={{ fontSize: '0.875rem' }}>{this.state.error && this.state.error.toString()}</pre>
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', fontSize: '0.75rem' }}>
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </details>
          </div>
          <p style={{ marginTop: '2rem', fontSize: '0.875rem' }}>Por favor, envíame una captura de esta pantalla roja para que pueda solucionarlo inmediatamente.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
