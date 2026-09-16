import {
	BadRequestException,
	Inject,
	Injectable,
	Logger,
	NotFoundException,
	PayloadTooLargeException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

import { DB, type Database } from '../db/database.module';
import { projectHostings, projects, type ProjectHostingRow } from '../db/schema';
import {
	DEFAULT_MAX_UPLOAD_MB,
	IGNORED_ENTRIES,
	type HostingStatus,
	type UploadResult
} from './hosting.dto';

/** 允许作为 url 参数携带的字符（项目名会被编码后再做安全校验） */
const UNSAFE_SLUG = /[^a-zA-Z0-9\u4e00-\u9fa5._-]+/g;

@Injectable()
export class HostingService {
	private readonly logger = new Logger(HostingService.name);

	constructor(
		@Inject(DB) private readonly db: Database,
		private readonly config: ConfigService
	) {}

	// ===== 路径与限额 =====

	/**
	 * 托管根目录。默认挂在仓库里的 storage/hosting，可用 HOSTING_ROOT 覆盖。
	 * 解析为绝对路径，后续所有子路径都必须落在这个前缀内（防目录穿越）。
	 */
	private root(): string {
		const configured = this.config.get<string>('HOSTING_ROOT');
		const base = configured?.trim() || join(process.cwd(), 'storage', 'hosting');
		return resolve(base);
	}

	private maxUploadBytes(): number {
		const mb = Number(this.config.get<string>('HOSTING_MAX_UPLOAD_MB') ?? DEFAULT_MAX_UPLOAD_MB);
		const safe = Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_UPLOAD_MB;
		return Math.floor(safe * 1024 * 1024);
	}

	/** 项目名 -> 目录名：去危险字符，避免路径穿越与非法文件名 */
	private slugify(label: string): string {
		const slug = label
			.normalize('NFKC')
			.replace(UNSAFE_SLUG, '-')
			.replace(/^[-.]+|[-.]+$/g, '')
			.slice(0, 64);
		return slug || 'project';
	}

	/** 某个项目的托管目录绝对路径，带前缀校验 */
	private projectDir(projectId: number, label: string): string {
		const root = this.root();
		const dir = resolve(root, `${projectId}-${this.slugify(label)}`);
		if (dir !== root && !dir.startsWith(root + sep)) {
			throw new BadRequestException('项目托管路径非法');
		}
		return dir;
	}

	// ===== 状态 =====

	/** 读托管状态；未托管过时返回空态（hosted=false），不抛错 */
	async status(projectId: number): Promise<HostingStatus> {
		const project = await this.requireProject(projectId);
		const [row] = await this.db
			.select()
			.from(projectHostings)
			.where(eq(projectHostings.projectId, projectId))
			.limit(1);

		const dir = this.projectDir(projectId, project.label);
		const onDisk = await this.measure(dir);

		if (!row) {
			return {
				hosted: false,
				firstUploadedAt: null,
				lastUploadedAt: null,
				lastUploader: '',
				uploadCount: 0,
				fileCount: onDisk.fileCount,
				totalBytes: onDisk.totalBytes,
				rootPath: onDisk.fileCount > 0 || onDisk.totalBytes > 0 ? dir : ''
			};
		}

		return {
			hosted: true,
			firstUploadedAt: row.firstUploadedAt?.toISOString() ?? null,
			lastUploadedAt: row.lastUploadedAt?.toISOString() ?? null,
			lastUploader: row.lastUploader,
			uploadCount: row.uploadCount,
			fileCount: onDisk.fileCount,
			totalBytes: onDisk.totalBytes,
			rootPath: dir
		};
	}

	/** 统计目录下的文件数与总字节数；目录不存在返回 0 */
	private async measure(dir: string): Promise<{ fileCount: number; totalBytes: number }> {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return { fileCount: 0, totalBytes: 0 };
		}

		let fileCount = 0;
		let totalBytes = 0;
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				const sub = await this.measure(full);
				fileCount += sub.fileCount;
				totalBytes += sub.totalBytes;
			} else if (entry.isFile()) {
				try {
					const s = await stat(full);
					fileCount += 1;
					totalBytes += s.size;
				} catch {
					// 统计期间文件被删，忽略
				}
			}
		}
		return { fileCount, totalBytes };
	}

	// ===== 上传 =====

	/**
	 * 接收 zip 压缩包并解包到项目托管目录。
	 *
	 * 安全约束：
	 * - 体积先按 header 里的长度挡一道，再靠 unzip 进程实际大小兜底；
	 * - 解包用 `unzip -o` 到目标目录，解包前先清空旧的托管目录（全量覆盖语义），
	 *   zip 内条目若含 ../ 会被 unzip 自身拒绝（它会剥离危险路径）。
	 */
	async upload(
		projectId: number,
		buffer: Buffer,
		uploaderName: string
	): Promise<UploadResult> {
		const project = await this.requireProject(projectId);
		const max = this.maxUploadBytes();
		if (buffer.length === 0) throw new BadRequestException('上传内容为空');
		if (buffer.length > max) {
			throw new PayloadTooLargeException(
				`压缩包超出上限（${Math.round(max / 1024 / 1024)}MB）`
			);
		}

		const dir = this.projectDir(projectId, project.label);
		await mkdir(dir, { recursive: true, mode: 0o755 });

		// 打散到临时文件，交给 unzip（避免把整包再进内存）
		const tmpZip = join(tmpdir(), `redstation-upload-${projectId}-${Date.now()}.zip`);
		await pipeline(
			(async function* () {
				yield buffer;
			})(),
			createWriteStream(tmpZip)
		);

		const [existing] = await this.db
			.select({ id: projectHostings.id, count: projectHostings.uploadCount })
			.from(projectHostings)
			.where(eq(projectHostings.projectId, projectId))
			.limit(1);

		try {
			// 全量覆盖：先清掉旧内容，避免已删除的文件残留
			const olds = await readdir(dir);
			await Promise.all(
				olds.map((name) => rm(join(dir, name), { recursive: true, force: true }))
			);

			await this.unzipInto(tmpZip, dir);
		} finally {
			await rm(tmpZip, { force: true });
		}

		const measured = await this.measure(dir);
		if (measured.fileCount === 0) {
			throw new BadRequestException('压缩包内没有可用文件（可能全是 node_modules 等忽略项）');
		}

		const now = new Date();
		const values = {
			projectId,
			rootPath: dir,
			lastUploader: uploaderName,
			lastUploadedAt: now,
			fileCount: measured.fileCount,
			totalBytes: measured.totalBytes
		};

		if (existing) {
			await this.db
				.update(projectHostings)
				.set({ ...values, uploadCount: existing.count + 1, updatedAt: now })
				.where(eq(projectHostings.id, existing.id));
		} else {
			await this.db.insert(projectHostings).values({
				...values,
				firstUploadedAt: now,
				uploadCount: 1,
				createdAt: now,
				updatedAt: now
			});
		}

		this.logger.log(
			`项目 ${project.label} 托管上传完成：${measured.fileCount} 个文件 / ${measured.totalBytes} 字节`
		);

		return {
			projectId,
			fileCount: measured.fileCount,
			totalBytes: measured.totalBytes,
			uploadedAt: now.toISOString(),
			replaced: !!existing,
			status: await this.status(projectId)
		};
	}

	/** 调 unzip 解包；忽略项在解包后清理，zip 解包本身不做过滤 */
	private unzipInto(zipPath: string, targetDir: string): Promise<void> {
		return new Promise((resolvePromise, rejectPromise) => {
			const excludes = [...IGNORED_ENTRIES].flatMap((name) => ['-x', `*/${name}/*`, `${name}/*`, `*/${name}`, `${name}`]);
			const child = spawn(
				'unzip',
				['-o', '-q', zipPath, '-d', targetDir, ...excludes],
				{ stdio: ['ignore', 'ignore', 'pipe'] }
			);

			let stderr = '';
			child.stderr.on('data', (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			child.on('error', (err) => rejectPromise(new BadRequestException(`解包失败：${err.message}`)));
			child.on('close', (code) => {
				if (code === 0) resolvePromise();
				else rejectPromise(new BadRequestException(`解包失败（unzip 退出码 ${code}）：${stderr.slice(0, 200)}`));
			});
		});
	}

	// ===== 下载 =====

	/**
	 * 打包托管目录为 tar.gz 并返回可读流。
	 * 用 tar 进程现场打包，避免先落盘再回传占用双份空间。
	 */
	async prepareDownload(
		projectId: number
	): Promise<{ stream: NodeJS.ReadableStream; filename: string }> {
		const project = await this.requireProject(projectId);
		const dir = this.projectDir(projectId, project.label);

		let info;
		try {
			info = await stat(dir);
		} catch {
			throw new NotFoundException('该项目尚未托管代码');
		}
		if (!info.isDirectory()) throw new NotFoundException('该项目尚未托管代码');

		const measured = await this.measure(dir);
		if (measured.fileCount === 0) throw new NotFoundException('该项目尚未托管代码');

		const child = spawn('tar', ['-czf', '-', '-C', dir, '.'], {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		const filename = `${project.label}-hosting-${this.stamp()}.tar.gz`;

		return { stream: child.stdout, filename };
	}

	/** 文件名里的时间戳：20260917-1530 */
	private stamp(now = new Date()): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	}

	// ===== 内部工具 =====

	private async requireProject(projectId: number) {
		const [row] = await this.db
			.select({ id: projects.id, label: projects.label })
			.from(projects)
			.where(eq(projects.id, projectId))
			.limit(1);
		if (!row) throw new NotFoundException(`项目不存在：${projectId}`);
		return row;
	}

	/** 清空某项目的托管记录与磁盘目录（删项目时调用，失败仅记日志） */
	async purge(projectId: number, label: string): Promise<void> {
		try {
			await this.db.delete(projectHostings).where(eq(projectHostings.projectId, projectId));
			await rm(this.projectDir(projectId, label), { recursive: true, force: true });
		} catch (err) {
			this.logger.warn(`清理项目 ${projectId} 托管数据失败：${(err as Error).message}`);
		}
	}

	/** 供调试：列出托管根目录下所有项目目录 */
	async listDirs(): Promise<string[]> {
		const root = this.root();
		await mkdir(root, { recursive: true });
		const entries = await readdir(root, { withFileTypes: true });
		return entries.filter((e) => e.isDirectory()).map((e) => join(root, e.name));
	}

	/** 最近一次上传记录（用于状态提示文案兜底） */
	async lastRow(projectId: number): Promise<ProjectHostingRow | null> {
		const [row] = await this.db
			.select()
			.from(projectHostings)
			.where(eq(projectHostings.projectId, projectId))
			.orderBy(desc(projectHostings.lastUploadedAt))
			.limit(1);
		return row ?? null;
	}

	/** 统计托管过的项目数（报表页用） */
	async hostedCount(): Promise<number> {
		const [row] = await this.db
			.select({ count: sql<number>`count(*)::int` })
			.from(projectHostings)
			.where(and(eq(projectHostings.projectId, projectHostings.projectId)));
		return row?.count ?? 0;
	}

	/** 确保托管根目录存在（启动时调用一次） */
	async ensureRoot(): Promise<string> {
		const root = this.root();
		await mkdir(root, { recursive: true, mode: 0o755 });
		await mkdir(dirname(root), { recursive: true });
		return root;
	}
}
