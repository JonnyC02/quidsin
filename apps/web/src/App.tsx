import { useEffect, useState } from 'react';
import type { HealthStatus } from '@quidsin/shared';
import { getHealth } from './lib/api';
import './App.css';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; health: HealthStatus }
  | { kind: 'error'; message: string };

function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    getHealth()
      .then((health) => setState({ kind: 'loaded', health }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
      );
  }, []);

  return (
    <main className="app">
      <h1>QuidsIn</h1>
      <p>Phase 1 foundation check: web &rarr; api &rarr; DynamoDB Local.</p>

      {state.kind === 'loading' && <p>Checking API status&hellip;</p>}

      {state.kind === 'loaded' && (
        <div className="status status--ok">
          <strong>API status: {state.health.status}</strong>
          <p>Uptime: {state.health.uptimeSeconds.toFixed(1)}s</p>
          <p>As of: {state.health.timestamp}</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="status status--error">
          <strong>Could not reach the API</strong>
          <p>{state.message}</p>
        </div>
      )}
    </main>
  );
}

export default App;
