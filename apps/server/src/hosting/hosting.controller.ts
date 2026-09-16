import {
	Body,
	Controller,
	Get,
	Header,
	HttpCode,
	Param,
	ParseIntPipe,
	Post,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { HostingService } from './hosting.service';
import { JwtAuthGuard, type AuthedRequest } from '../auth/jwt-auth.guard';
import type { HostingStatus, UploadResult } from './hosting.dto';

/**
 * 代码托管接口。
 *
 * 上传体是项目压缩包（zip），走 application/octet-stream 原文，
 * 由 main.ts 注册的同名 body parser 收成 Buffer，因此这里直接收 Buffer，
 * 不需要 multipart 依赖。
 */
@Controller('projects/:id/hosting')
export class HostingController {
	constructor(private readonly hosting: HostingService) {}

	/**
	 * GET /api/projects/:id/hosting
	 * 托管状态：是否托管过、上次上传时间与上传者、文件数/体积。
	 * 公开可读（与项目详情一致），前端详情卡据此显示「上次上传 …/未托管代码」。
	 */
	@Get()
	status(@Param('id', ParseIntPipe) id: number): Promise<HostingStatus> {
		return this.hosting.status(id);
	}

	/**
	 * POST /api/projects/:id/hosting
	 * 上传并托管代码。body 为 zip 二进制，需登录（记录上传者）。
	 */
	@Post()
	@HttpCode(200)
	@UseGuards(JwtAuthGuard)
	upload(
		@Param('id', ParseIntPipe) id: number,
		@Req() req: AuthedRequest & { body?: unknown },
		@Body() body: unknown
	): Promise<UploadResult> {
		const buffer = toBuffer(body);
		return this.hosting.upload(id, buffer, req.user?.name ?? '');
	}

	/**
	 * GET /api/projects/:id/hosting/download
	 * 下载托管代码（tar.gz 流）。支持 ?token= 携带 JWT，便于浏览器直接点击下载。
	 */
	@Get('download')
	@Header('Content-Type', 'application/gzip')
	@UseGuards(JwtAuthGuard)
	async download(
		@Param('id', ParseIntPipe) id: number,
		@Res({ passthrough: true }) reply: FastifyReply
	): Promise<NodeJS.ReadableStream> {
		const { stream, filename } = await this.hosting.prepareDownload(id);
		// 文件名含中文，用 RFC 5987 的 filename* 让浏览器正确落盘
		reply.header(
			'Content-Disposition',
			`attachment; filename="hosting-${id}.tar.gz"; filename*=UTF-8''${encodeURIComponent(filename)}`
		);
		return stream;
	}
}

/** 把可能的 Buffer / Uint8Array / 字符串统一成 Buffer */
function toBuffer(body: unknown): Buffer {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof Uint8Array) return Buffer.from(body);
	if (typeof body === 'string') return Buffer.from(body, 'binary');
	return Buffer.alloc(0);
}
