<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ME,
		MEMBERS,
		loadMembers,
		loadWorkspace,
		logout,
		restoreSession,
		session
	} from '$lib/stores/workspace.svelte';

	let { children } = $props();

	// 登录页自身不渲染应用外壳（侧栏 / 顶栏）
	const isAuthPage = $derived(page.url.pathname.startsWith('/login'));

	// 启动时用本地 token 恢复会话（拉 /api/auth/me 校验）
	$effect(() => {
		restoreSession();
	});

	// 登录后加载团队成员与工作区数据（项目/待办/动态）
	$effect(() => {
		if (!session.loggedIn) return;
		if (MEMBERS().length === 0) loadMembers();
		loadWorkspace();
	});

	// 会话恢复完成后才做路由守卫，避免刷新页面时误跳登录页
	$effect(() => {
		if (!session.loading && !session.loggedIn && !isAuthPage) goto('/login');
	});

	const nav = $state([
		{ href: '/', label: '概览', icon: 'grid' },
		{ href: '/messages', label: '消息', icon: 'msg' },
		{ href: '/projects', label: '项目', icon: 'box' },
		{ href: '/tasks', label: '任务', icon: 'check' },
		{ href: '/plans', label: '规划', icon: 'flow' },
		{ href: '/team', label: '团队', icon: 'users' },
		{ href: '/reports', label: '报表', icon: 'chart' },
		{ href: '/me', label: '我', icon: 'user' },
		{ href: '/settings', label: '设置', icon: 'gear' }
	]);

	const notifications = $state([
		{
			kind: 'mention',
			cat: 'mention',
			title: '动态「Q3 数据看板」中提到了你',
			body: '奇奇在动态「Q3 数据看板」中提到了你。',
			time: '5 分钟前'
		},
		{
			kind: 'complete',
			cat: 'task',
			title: 'Lily 于 1 小时前完成了任务「1.0 内测修复清单」',
			body: '任务状态已更新为已完成，可前往任务页查看。',
			time: '1 小时前'
		},
		{
			kind: 'comment',
			cat: 'feed',
			title: '你的动态收到新评论',
			body: 'Mo 在「Redlind 后端重构」下回复了你的留言。',
			time: '3 小时前'
		}
	]);

	/** 通知分类：@我 / 任务状态变更 / 新的动态 */
	type NotifCat = 'mention' | 'task' | 'feed';
	const NOTIF_CATS: { value: NotifCat; label: string }[] = [
		{ value: 'mention', label: '@我' },
		{ value: 'task', label: '任务状态变更' },
		{ value: 'feed', label: '新的动态' }
	];
	// 各分类未读数：静态数据，仅用于标签角标展示
	const catUnread: Record<NotifCat, number> = { mention: 1, task: 1, feed: 1 };
	// 当前选中的分类，null 表示「全部」
	let notifCat = $state<NotifCat | null>(null);
	// 抽屉中展示的通知：按所选分类过滤
	const shownNotifications = $derived(
		notifCat === null ? notifications : notifications.filter((n) => n.cat === notifCat)
	);

	let unreadCount = $state(3);
	let drawerOpen = $state(false);
	let closingDrawer = $state(false);

	// ===== 左下角信息名片 + 账号菜单（含退出登录）=====
	let accountOpen = $state(false);
	let closingAccount = $state(false);

	function openAccount() {
		closingAccount = false;
		accountOpen = true;
	}

	function closeAccount() {
		if (!accountOpen || closingAccount) return;
		// 先播退出动画，再真正移除
		closingAccount = true;
		setTimeout(() => {
			closingAccount = false;
			accountOpen = false;
		}, 240);
	}

	async function doLogout() {
		await logout();
		await goto('/login');
	}

	function openDrawer() {
		closingDrawer = false;
		drawerOpen = true;
	}

	function closeDrawer() {
		if (!drawerOpen || closingDrawer) return;
		// 先进入退出动画，动画结束后再真正移除，避免收回突兀
		closingDrawer = true;
		setTimeout(() => {
			closingDrawer = false;
			drawerOpen = false;
		}, 300);
	}

	function markAllRead() {
		unreadCount = 0;
	}
</script>

{#if isAuthPage}
	{@render children()}
{:else}
<div class="shell">
	<aside class="sidebar">
		<a class="brand" href="/">
			<span class="brand-mark">R</span>
			<span class="brand-name">RedStation</span>
			<span class="brand-badge">alpha</span>
		</a>

		<nav class="nav">
			{#each nav as item}
				<a
					class="nav-item"
					class:active={page.url.pathname === item.href}
					href={item.href}
				>
					<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						{#if item.icon === 'grid'}
							<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
						{:else if item.icon === 'box'}
							<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
							<path d="M3 8l9 5 9-5M12 13v8" />
						{:else if item.icon === 'check'}
							<circle cx="12" cy="12" r="9" />
							<path d="M8 12.5l2.5 2.5L16 9.5" />
						{:else if item.icon === 'users'}
							<circle cx="9" cy="8" r="3.5" />
							<path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M21.5 20a6.5 6.5 0 00-4-6" />
						{:else if item.icon === 'msg'}
							<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h-1z" opacity="0" />
							<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 3-2z" />
							<path d="M4 7l8 5 8-5" />
						{:else if item.icon === 'chart'}
							<path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
						{:else if item.icon === 'flow'}
							<rect x="2.5" y="9" width="6" height="6" rx="1.4" />
							<rect x="15.5" y="9" width="6" height="6" rx="1.4" />
							<path d="M8.5 12h7M12 12v5" />
						{:else if item.icon === 'user'}
							<circle cx="12" cy="8" r="4" />
							<path d="M4 21a8 8 0 0116 0" />
						{:else}
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.7 1.7 0 00.35 1.9l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.9-.35 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.1-1.55 1.7 1.7 0 00-1.9.35l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.35-1.9 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1.1 1.7 1.7 0 00-.35-1.9l-.06-.06A2 2 0 117.06 6.4l.06.06a1.7 1.7 0 001.9.35h.08a1.7 1.7 0 001-1.55V5a2 2 0 114 0v.08a1.7 1.7 0 001 1.55h.08a1.7 1.7 0 001.9-.35l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.35 1.9v.08a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.55 1z" />
						{/if}
					</svg>
					<span>{item.label}</span>
				</a>
			{/each}
		</nav>

		<div class="sidebar-foot">
			<button
				type="button"
				class="foot-user"
				class:open={accountOpen}
				onclick={openAccount}
				aria-haspopup="menu"
				aria-expanded={accountOpen}
				title="账号"
			>
				<span class="avatar" style="background:{ME()?.color ?? '#33333c'}">{ME()?.initials ?? '--'}</span>
				<div class="foot-meta">
					<span class="foot-name">{ME()?.name ?? '未登录'}</span>
					<span class="foot-role">{ME()?.role ?? ''}</span>
				</div>
				<span class="foot-more" aria-hidden="true">⋯</span>
			</button>
			<div class="foot-hint">所有数据保存在本地</div>
		</div>
	</aside>

	<div class="main-col">
		<header class="topbar">
			<div class="crumb">
				<span class="crumb-dot" aria-hidden="true"></span>
				工作区
			</div>
			<div class="search" role="search">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="11" cy="11" r="7" />
					<path d="M21 21l-4.3-4.3" />
				</svg>
				<input type="text" placeholder="搜索项目、文件或命令…" aria-label="全局搜索" />
				<kbd>⌘ K</kbd>
			</div>
			<div class="topbar-actions">
				<button class="icon-btn notif-btn" aria-label="通知" title="通知" onclick={openDrawer}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
						<path d="M13.7 21a2 2 0 01-3.4 0" />
					</svg>
					{#if unreadCount > 0}
						<span class="notif-badge">{unreadCount}</span>
					{/if}
				</button>
			</div>
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<!-- 通知抽屉 -->
{#if drawerOpen}
	<div
		class="drawer-backdrop"
		class:closing={closingDrawer}
		onclick={closeDrawer}
	></div>
	<aside
		class="drawer"
		class:closing={closingDrawer}
		role="dialog"
		aria-modal="true"
		aria-labelledby="notif-title"
	>
		<button class="drawer-close" onclick={closeDrawer} aria-label="关闭" title="关闭">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M18 6L6 18M6 6l12 12" />
			</svg>
		</button>

		<div class="drawer-inner">
			<div class="notif">
				<header class="notif-head">
					<div>
						<h2 id="notif-title">通知</h2>
						<p class="notif-sub">
							{#if unreadCount > 0}
								你有 {unreadCount} 条未读消息
							{:else}
								已全部读完
							{/if}
						</p>
					</div>
					{#if unreadCount > 0}
						<button class="notif-clear" onclick={markAllRead} aria-label="全部标为已读" title="全部标为已读">
							全部已读
						</button>
					{/if}
				</header>

				<div class="notif-tabs" role="tablist" aria-label="通知分类">
					<button
						type="button"
						class="notif-tab"
						class:active={notifCat === null}
						role="tab"
						aria-selected={notifCat === null}
						onclick={() => (notifCat = null)}
					>
						全部
						<span class="notif-tab-num">{notifications.length}</span>
					</button>
					{#each NOTIF_CATS as c}
						<button
							type="button"
							class="notif-tab"
							class:active={notifCat === c.value}
							role="tab"
							aria-selected={notifCat === c.value}
							onclick={() => (notifCat = c.value)}
						>
							{c.label}
							{#if catUnread[c.value] > 0}
								<span class="notif-tab-num">{catUnread[c.value]}</span>
							{/if}
						</button>
					{/each}
				</div>

				{#if shownNotifications.length === 0}
					<p class="notif-empty">该分类暂无通知，休息一下吧。</p>
				{:else}
					<ul class="notif-list">
						{#each shownNotifications as n, i}
							<li class="notif-item">
								<svg class="notif-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
									<path d="M13.7 21a2 2 0 01-3.4 0" />
								</svg>
								<div class="notif-body">
									<div class="notif-title-row">
										<span class="notif-title"
											>{n.title}{#if i < unreadCount}
												<span class="notif-dot" aria-label="未读" title="未读"></span>
											{/if}</span
										>
									</div>
									<p class="notif-text">{n.body}</p>
									<span class="notif-time">{n.time}</span>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</aside>
{/if}

<!-- 账号弹窗：点击左下角信息名片打开，可跳转个人页或退出登录 -->
{#if accountOpen}
	<div class="drawer-backdrop" class:closing={closingAccount} onclick={closeAccount}></div>
	<div class="account-pop" class:closing={closingAccount} role="dialog" aria-modal="true" aria-labelledby="account-title">
		<header class="acc-head">
			<span class="acc-avatar" style="background:{ME()?.color ?? '#33333c'}">{ME()?.initials ?? '--'}</span>
			<div class="acc-id">
				<h2 id="account-title">{ME()?.name ?? '未登录'}</h2>
				<span class="acc-sub">{ME()?.role ?? ''}{ME()?.title ? ` · ${ME()!.title}` : ''}</span>
			</div>
			<button class="drawer-close acc-close" onclick={closeAccount} aria-label="关闭" title="关闭">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<p class="acc-email">{ME()?.email ?? ''} · 加入于 {ME()?.createdAt?.slice(0, 10) ?? '—'}</p>

		<ul class="acc-menu" role="menu">
			<li>
				<a class="acc-item" role="menuitem" href="/me" onclick={closeAccount}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="8" r="4" />
						<path d="M4 21a8 8 0 0116 0" />
					</svg>
					<span>个人资料</span>
				</a>
			</li>
			<li>
				<a class="acc-item" role="menuitem" href="/settings" onclick={closeAccount}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3" />
						<path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
					</svg>
					<span>工作区设置</span>
				</a>
			</li>
		</ul>

		<footer class="acc-foot">
			<button class="acc-logout" onclick={doLogout}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M15 17l5-5-5-5" />
					<path d="M20 12H9" />
					<path d="M12 4H6a2 2 0 00-2 2v12a2 2 0 002 2h6" />
				</svg>
				退出登录
			</button>
		</footer>
	</div>
{/if}

{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-w) 1fr;
		min-height: 100vh;
	}

	/* ===== Sidebar ===== */
	.sidebar {
		position: sticky;
		top: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--line);
		background: var(--bg-1);
		padding: var(--space-4);
		gap: var(--space-5);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 6px 6px 2px;
	}
	.brand-mark {
		width: 30px;
		height: 30px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, var(--red-500), var(--red-700));
		font-weight: 800;
		font-size: 1rem;
		color: #fff;
		box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);
	}
	.brand-name {
		font-size: 1.15rem;
		font-weight: 750;
		letter-spacing: -0.02em;
	}
	.brand-badge {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--red-500);
		border: 1px solid currentColor;
		border-radius: 6px;
		padding: 1px 6px;
	}

	.nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 12px;
		border-radius: var(--radius-sm);
		color: var(--text-1);
		font-weight: 550;
		transition: background 0.15s, color 0.15s;
	}
	.nav-item:hover {
		background: var(--bg-2);
		color: var(--text-0);
	}
	.nav-item.active {
		background: var(--accent-soft);
		color: var(--red-500);
	}
	.icon {
		width: 19px;
		height: 19px;
		flex: none;
	}

	.sidebar-foot {
		margin-top: auto;
	}
	.foot-user {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		color: inherit;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.16s ease, background 0.16s ease, transform 0.16s ease;
	}
	.foot-user:hover {
		border-color: var(--line-strong);
		background: var(--bg-3);
	}
	.foot-user:active {
		transform: scale(0.99);
	}
	.foot-user.open {
		border-color: rgba(220, 38, 38, 0.45);
		background: var(--accent-soft);
	}
	.foot-more {
		margin-left: auto;
		color: var(--text-2);
		font-size: 1rem;
		line-height: 1;
	}
	.foot-user:hover .foot-more {
		color: var(--text-1);
	}

	/* ===== 账号弹窗 ===== */
	.account-pop {
		position: fixed;
		left: calc(var(--space-4) + 4px);
		bottom: 96px;
		z-index: 61;
		width: 272px;
		padding: var(--space-4);
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 26px 60px rgba(0, 0, 0, 0.55);
		animation: pop-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}
	@keyframes pop-out {
		to {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
	}
	.account-pop.closing {
		animation: pop-out 0.22s ease forwards;
	}
	.acc-head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.acc-avatar {
		flex: none;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		color: #fff;
		font-size: 0.86rem;
		font-weight: 800;
	}
	.acc-id {
		min-width: 0;
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.acc-id h2 {
		margin: 0;
		font-size: 1rem;
	}
	.acc-sub {
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.acc-close {
		position: static;
		margin-left: auto;
		width: 28px;
		height: 28px;
	}
	.acc-email {
		margin: var(--space-3) 0 var(--space-3);
		padding-bottom: var(--space-3);
		border-bottom: 1px solid var(--line);
		font-size: 0.74rem;
		color: var(--text-2);
		word-break: break-all;
	}
	.acc-menu {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.acc-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 10px;
		border-radius: 10px;
		color: var(--text-0);
		font-size: 0.86rem;
	}
	.acc-item:hover {
		background: var(--bg-2);
		color: var(--red-500);
	}
	.acc-item svg {
		width: 17px;
		height: 17px;
		flex: none;
		color: var(--text-2);
	}
	.acc-item:hover svg {
		color: var(--red-500);
	}
	.acc-foot {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
	}
	.acc-logout {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 9px;
		border: 1px solid rgba(220, 38, 38, 0.35);
		border-radius: 10px;
		background: rgba(220, 38, 38, 0.1);
		color: #f87171;
		font-family: inherit;
		font-size: 0.86rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.16s ease, color 0.16s ease;
	}
	.acc-logout:hover {
		background: var(--red-600);
		color: #fff;
	}
	.acc-logout svg {
		width: 17px;
		height: 17px;
	}
	.avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: #33333c;
		font-size: 0.75rem;
		font-weight: 700;
	}
	.foot-meta {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}
	.foot-name {
		font-weight: 600;
	}
	.foot-role {
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.foot-hint {
		text-align: center;
		font-size: 0.7rem;
		color: var(--text-2);
		margin-top: var(--space-3);
	}

	/* ===== Main column ===== */
	.main-col {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--bg-0);
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		height: var(--topbar-h);
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: 0 var(--space-6);
		border-bottom: 1px solid var(--line);
		background: rgba(11, 11, 14, 0.85);
		backdrop-filter: blur(10px);
	}
	.crumb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		color: var(--text-0);
		white-space: nowrap;
	}
	.crumb-dot {
		width: 9px;
		height: 9px;
		border-radius: 3px;
		background: var(--red-500);
	}

	.search {
		flex: 1;
		max-width: 420px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg-1);
		color: var(--text-2);
	}
	.search svg {
		width: 15px;
		height: 15px;
		flex: none;
	}
	.search input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--text-0);
		font-size: 0.9rem;
		font-family: inherit;
	}
	.search kbd {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		border: 1px solid var(--line);
		border-radius: 5px;
		padding: 1px 6px;
		background: var(--bg-2);
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-left: auto;
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg-1);
		color: var(--text-1);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}
	.icon-btn:hover {
		color: var(--text-0);
		border-color: var(--line-strong);
	}
	.icon-btn svg {
		width: 17px;
		height: 17px;
	}

	.content {
		flex: 1;
		padding: var(--space-6);
		max-width: 1680px;
		width: 100%;
		margin: 0 auto;
	}

	/* ===== 通知铃铛 ===== */
	.notif-btn {
		position: relative;
	}
	.notif-badge {
		position: absolute;
		top: -4px;
		right: -5px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		display: grid;
		place-items: center;
		font-size: 0.62rem;
		font-weight: 700;
		line-height: 1;
		color: #fff;
		background: var(--red-500);
		border-radius: 999px;
		border: 2px solid var(--bg-1);
	}

	/* ===== 通知抽屉 ===== */
	.drawer-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(5, 5, 8, 0.6);
		backdrop-filter: blur(3px);
		animation: fade 0.2s ease;
	}
	.drawer {
		position: fixed;
		top: 50%;
		right: var(--space-5);
		transform: translateY(-50%);
		z-index: 61;
		max-height: 80%;
		overflow: auto;
		width: min(520px, calc(100vw - 40px));
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: -30px 0 80px rgba(0, 0, 0, 0.45);
		animation: slide-in 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
	@keyframes slide-in {
		from {
			transform: translate(30px, -50%);
			opacity: 0;
		}
	}
	/* 收回时的退出动画 */
	.drawer-backdrop.closing {
		animation: fade-out 0.24s ease forwards;
	}
	.drawer.closing {
		animation: slide-out 0.26s cubic-bezier(0.4, 0, 0.6, 1) forwards;
	}
	@keyframes fade-out {
		to {
			opacity: 0;
		}
	}
	@keyframes slide-out {
		to {
			transform: translate(40px, -50%);
			opacity: 0;
		}
	}

	.drawer-close {
		position: absolute;
		top: 16px;
		right: 18px;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		z-index: 2;
		transition: color 0.15s, border-color 0.15s;
	}
	.drawer-close:hover {
		color: var(--text-0);
		border-color: var(--text-2);
	}
	.drawer-close svg {
		width: 17px;
		height: 17px;
	}

	.drawer-inner {
		padding: var(--space-6);
	}

	/* ===== 通知列表 ===== */
	.notif-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding-right: 40px;
	}
	.notif-head h2 {
		font-size: 1.3rem;
		line-height: 1.2;
	}
	.notif-sub {
		color: var(--text-2);
		font-size: 0.85rem;
		margin-top: 4px;
	}
	.notif-clear {
		flex: none;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--red-500);
		background: var(--accent-soft);
		border: 1px solid transparent;
		border-radius: 8px;
		padding: 6px 12px;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}
	.notif-clear:hover {
		color: var(--red-600);
		background: rgba(220, 38, 38, 0.18);
	}

	/* ===== 通知分类标签栏 ===== */
	.notif-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}
	.notif-tab {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-2);
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 5px 12px;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	.notif-tab:hover {
		color: var(--text-0);
		border-color: var(--line-strong);
	}
	.notif-tab.active {
		color: var(--red-500);
		background: var(--accent-soft);
		border-color: var(--red-500);
	}
	.notif-tab-num {
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1;
		padding: 3px 6px;
		border-radius: 999px;
		color: var(--text-1);
		background: var(--bg-3);
	}
	.notif-tab.active .notif-tab-num {
		color: #fff;
		background: var(--red-500);
	}

	.notif-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		list-style: none;
	}
	.notif-item {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.notif-item:hover {
		border-color: var(--line-strong);
	}
	.notif-icon {
		width: 36px;
		height: 36px;
		flex: none;
		padding: 8px;
		color: var(--red-500);
		background: var(--accent-soft);
		border-radius: 10px;
	}
	.notif-body {
		min-width: 0;
	}
	.notif-title-row {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.notif-title {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-0);
		line-height: 1.4;
	}
	.notif-dot {
		flex: none;
		width: 7px;
		height: 7px;
		margin-top: 5px;
		border-radius: 50%;
		background: var(--red-500);
		box-shadow: 0 0 0 2px var(--bg-2);
	}
	.notif-text {
		font-size: 0.85rem;
		color: var(--text-1);
		line-height: 1.5;
		margin-top: 4px;
	}
	.notif-time {
		display: inline-block;
		margin-top: 6px;
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.notif-empty {
		color: var(--text-2);
		font-size: 0.9rem;
		text-align: center;
		padding: var(--space-5);
	}

	/* ===== Responsive ===== */
	@media (max-width: 900px) {
		.shell {
			grid-template-columns: 1fr;
		}
		.sidebar {
			display: none;
		}
		.topbar {
			padding: 0 var(--space-4);
		}
		.search {
			max-width: none;
		}
	}
</style>
