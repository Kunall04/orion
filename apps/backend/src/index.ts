import { buildApp } from './app';

const app = buildApp();
const port = Number(process.env.PORT ?? 4000);

app.listen({ port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Failed to start backend server:', err);
    process.exit(1);
  }
  console.log(`🚀 Orion Backend server listening at ${address}`);

  // Start embedded Chrome DevTools (Chii) on port 4001
  try {
    const chii = require('chii');
    chii.start({ port: 4001, domain: 'localhost:4001' });
    console.log(`🛠️ Chrome DevTools (Chii) running at http://localhost:4001`);
  } catch (e) {
    console.warn('Could not initialize Chii devtools:', e);
  }
});
