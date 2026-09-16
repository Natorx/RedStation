import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

/** 上传体积上限（字节）：代码托管要收项目压缩包，默认 512MB */
const MAX_UPLOAD_MB = Number(process.env.HOSTING_MAX_UPLOAD_MB ?? 512);
const MAX_UPLOAD_BYTES = Math.max(1, MAX_UPLOAD_MB) * 1024 * 1024;

async function bootstrap() {
	const adapter = new FastifyAdapter({ bodyLimit: MAX_UPLOAD_BYTES });

	const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
		logger: ['log', 'error', 'warn', 'debug']
	});

	// 托管上传以 application/octet-stream 发送原始 zip，这里注册成 Buffer 解析器。
	// useBodyParser 会把 Nest 的解析器标记为「已注册」，json/urlencoded 需要一并显式补上，
	// 否则登录等 JSON 接口会收不到 body。
	adapter.useBodyParser(['application/octet-stream', 'application/zip'], true, {
		bodyLimit: MAX_UPLOAD_BYTES
	});
	adapter.registerParserMiddleware?.('api', false);

	// 全局前缀，与前端约定的 /api/* 对齐
	app.setGlobalPrefix('api');

	// 开发期允许前端 dev server 跨域访问
	app.enableCors({
		origin: true,
		credentials: true,
		methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
		exposedHeaders: ['Content-Disposition']
	});

	const port = Number(process.env.PORT ?? 3001);
	const host = process.env.HOST ?? '0.0.0.0';

	await app.listen(port, host);
	logger.log(`RedStation API 已启动：http://${host}:${port}/api`);
	logger.log(`代码托管上传上限：${MAX_UPLOAD_MB}MB`);
}

bootstrap().catch((err) => {
	logger.error('启动失败', err);
	process.exit(1);
});
