import Fastify from 'fastify';

const app = Fastify({
	logger: true,
});

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

app.get('/api/health', async () => {
	return { status: 'ok', service: 'redstation-server', time: new Date().toISOString() };
});

app.get('/api', async () => {
	return { name: 'RedStation API', version: '0.0.1', routes: ['/api/health'] };
});

try {
	await app.listen({ port: PORT, host: HOST });
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
