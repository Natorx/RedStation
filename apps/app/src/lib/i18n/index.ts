/**
 * 国际化（svelte-i18n）
 *
 * 用法：
 * - 模板里 `import { t } from '$lib/i18n'` 后用 `{$t('nav.projects')}`
 * - 脚本里用 `$t(...)`（svelte-i18n 的 store 自动订阅）或 `get(t)(...)`
 *
 * 语言存 localStorage，首次进入按浏览器语言猜；只做前端文案，不涉及后端接口。
 */
import { addMessages, init, locale, getLocaleFromNavigator, t } from 'svelte-i18n';

import zh from './locales/zh.json';
import en from './locales/en.json';

/** 模板与脚本里统一从这里取 t */
export { t };

export const SUPPORTED_LOCALES = [
	{ value: 'zh', label: '简体中文' },
	{ value: 'en', label: 'English' }
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]['value'];

const STORAGE_KEY = 'redstation.locale';
const FALLBACK: AppLocale = 'zh';

addMessages('zh', zh);
addMessages('en', en);

/** 读取已保存的语言；没有则按浏览器语言猜，非中文一律回落英文 */
function detectInitialLocale(): AppLocale {
	if (typeof localStorage !== 'undefined') {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'zh' || saved === 'en') return saved;
	}
	const nav = getLocaleFromNavigator();
	return nav?.startsWith('zh') ? 'zh' : 'en';
}

/** 应用启动时调用一次 */
export function setupI18n(): void {
	init({
		fallbackLocale: FALLBACK,
		initialLocale: detectInitialLocale()
	});
}

/** 切换语言并持久化 */
export function setAppLocale(next: AppLocale): void {
	locale.set(next);
	if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next);
}
