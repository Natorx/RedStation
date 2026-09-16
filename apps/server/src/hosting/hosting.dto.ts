/**
 * 代码托管：文件上传 / 下载的类型与常量。
 *
 * 设计要点：
 * - 上传走「项目 zip 打包」形态，前端用目录选择（webkitdirectory）把整个
 *   文件夹收进一个 zip，后端解包到托管根目录下的项目目录。
 * - 下载走 tar.gz 流式回传，前端直接浏览器下载。
 */

/** 单次上传的压缩包上限（字节），默认 512MB，可由 HOSTING_MAX_UPLOAD_MB 覆盖 */
export const DEFAULT_MAX_UPLOAD_MB = 512;

/** 托管状态中「上次上传」的展示文案所需的字段 */
export type HostingStatus = {
	/** 是否已托管过（存在上次成功上传记录） */
	hosted: boolean;
	/** 首次上传时间；未托管为 null */
	firstUploadedAt: string | null;
	/** 上次上传时间；未托管为 null */
	lastUploadedAt: string | null;
	/** 上次上传者的显示名；未托管为空串 */
	lastUploader: string;
	/** 累计上传次数 */
	uploadCount: number;
	/** 托管目录下的文件数（不含目录本身） */
	fileCount: number;
	/** 托管目录占用的字节数（tar.gz 打包后的近似值 = 原始大小） */
	totalBytes: number;
	/** 服务器上的绝对路径，便于排查；未托管为空串 */
	rootPath: string;
};

/** 一次上传的结果回执 */
export type UploadResult = {
	projectId: number;
	/** 本次解包写入的文件数 */
	fileCount: number;
	/** 本次写入的原始字节数 */
	totalBytes: number;
	/** 本次上传时间（ISO 串） */
	uploadedAt: string;
	/** 覆盖前是否已有旧版本 */
	replaced: boolean;
	/** 当前托管状态快照，前端可直接用于刷新提示文案 */
	status: HostingStatus;
};

/** 解包时忽略的目录/文件名（构建产物、依赖、版本库等） */
export const IGNORED_ENTRIES = new Set([
	'node_modules',
	'.git',
	'.svn',
	'.hg',
	'.DS_Store',
	'dist',
	'build',
	'.next',
	'.nuxt',
	'target',
	'__pycache__',
	'.venv',
	'venv'
]);
