import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
		logger: ['log', 'error', 'warn', 'debug']
	});

	// 全局前缀，与前端约定的 /api/* 对齐
	app.setGlobalPrefix('api');

	// 开发期允许前端 dev server 跨域访问
	app.enableCors({
		origin: true,
		credentials: true,
		methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
	});

	const port = Number(process.env.PORT ?? 3001);
	const host = process.env.HOST ?? '0.0.0.0';

	await app.listen(port, host);
	logger.log(`RedStation API 已启动：http://${host}:${port}/api`);
}

bootstrap().catch((err) => {
	logger.error('启动失败', err);
	process.exit(1);
});
