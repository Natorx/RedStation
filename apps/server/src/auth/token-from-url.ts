/**
 * 从原始 URL 里取 ?token= 的值。
 *
 * 不能直接用 req.query：Nest 通过 Fastify 适配器时，守卫拿到的
 * "请求对象"只保证 headers/raw 可用，query 在装饰器链前未必已解析。
 * 直接解析 req.raw.url 最稳。
 */
function tokenFromRawUrl(rawUrl: string | undefined): string | undefined {
	if (!rawUrl) return undefined;
	const q = rawUrl.indexOf('?');
	if (q < 0) return undefined;
	const params = new URLSearchParams(rawUrl.slice(q + 1));
	const token = params.get('token')?.trim();
	return token || undefined;
}

export { tokenFromRawUrl };
