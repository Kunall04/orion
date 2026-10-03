import type { TaskStatus } from '@cloud-agent/shared';

// The contract works: these statuses are the SAME type the backend emits.
const statuses: TaskStatus[] = ['queued', 'running', 'waiting', 'completed', 'failed'];

export default function App() {
  return (
    <main>
      <h1>Cloud Agent — Phase 0</h1>
      <p>Frontend scaffolded and importing the shared contract from @cloud-agent/shared.</p>
      <p>Task states: {statuses.join(' · ')}</p>
    </main>
  );
}
