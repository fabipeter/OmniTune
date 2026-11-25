import { buildApp, loadConfig } from './app.js';

const config = loadConfig();
const app = await buildApp(config);
const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: '0.0.0.0' });
