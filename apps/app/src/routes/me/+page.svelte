<script lang="ts">
	import { ApiError } from '$lib/api/client';
	import { t } from '$lib/i18n';
	import {
		ME,
		MEMBERS,
		PROJECTS,
		TEAMS,
		TEAM_MEMBERS,
		loadTeams,
		loadTeamDetail,
		updateProfile,
		changeMyPassword
	} from '$lib/stores/workspace.svelte';

	// 我负责的项目（后端暂无 owner 归属概念，暂展示全部）
	const myProjects = $derived(PROJECTS());

	const myTaskStats = $derived({
		total: myProjects.reduce((n, p) => n + p.tasks.length, 0),
		done: myProjects.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0)
	});

	const granted = $derived(ME()?.permissions.filter((p) => p.granted).length ?? 0);
	const permTotal = $derived(ME()?.permissions.length ?? 0);

	function initialsOf(name: string) {
		return name.slice(0, 1).toUpperCase();
	}

	/** 加入日期：后端返回 ISO 时间戳，取日期部分 */
	const joinedAt = $derived(ME()?.createdAt ? ME()!.createdAt.slice(0, 10) : '—');
	/** 我已加入的团队（后端真实数据，与团队页共用一份 store） */
	const teams = $derived(TEAMS());
	/** 当前选中的团队 id；默认第一个 */
	let activeTeamId = $state<number | null>(null);
	const activeTeam = $derived(teams.find((tm) => tm.id === activeTeamId) ?? teams[0] ?? null);
	/** 当前团队的成员列表 */
	const teamMembers = $derived(TEAM_MEMBERS());

	// 进入页面即拉取团队数据；只在登录后触发一次，避免读 teamState 造成自触发循环
	let teamsLoadedFor = $state<number | null>(null);
	$effect(() => {
		const me = ME();
		if (!me) return;
		if (teamsLoadedFor === me.id) return;
		teamsLoadedFor = me.id;
		loadTeams();
	});

	// 团队列表变化时把选中项收敛到有效值
	$effect(() => {
		if (!teams.length) {
			activeTeamId = null;
			return;
		}
		if (activeTeamId === null || !teams.some((tm) => tm.id === activeTeamId)) {
			activeTeamId = teams[0].id;
		}
	});

	function selectTeam(id: number) {
		if (activeTeamId === id) return;
		activeTeamId = id;
		loadTeamDetail(id);
	}

	/** 团队卡片副标题：团队数与当前团队成员数 */
	const myTeamsSub = $derived(
		teams.length
			? $t('me.teamsSub', { values: { teams: teams.length, members: teamMembers.length } })
			: $t('me.teamsEmpty')
	);

	// ===== 编辑资料抽屉 =====
	// 可选头像配色，与后端 color 字段（hex）对应
	const COLOR_SWATCHES = [
		'#dc2626',
		'#f59e0b',
		'#22c55e',
		'#06b6d4',
		'#6366f1',
		'#ec4899'
	];

	let editOpen = $state(false);
	let editClosing = $state(false);
	let saving = $state(false);
	let editError = $state('');
	let editOk = $state('');

	let fName = $state('');
	let fEmail = $state('');
	let fInitials = $state('');
	let fTitle = $state('');
	let fColor = $state('#dc2626');
	let fTeamInput = $state('');
	let fTeams = $state<string[]>([]);

	/** 用当前用户数据填充表单 */
	function openEdit() {
		const me = ME();
		fName = me?.name ?? '';
		fEmail = me?.email ?? '';
		fInitials = me?.initials ?? '';
		fTitle = me?.title ?? '';
		fColor = me?.color ?? '#dc2626';
		fTeams = [...(me?.teams ?? [])];
		fTeamInput = '';
		editError = '';
		editOk = '';
		editClosing = false;
		editOpen = true;
	}

	function closeEdit() {
		if (!editOpen || editClosing) return;
		editClosing = true;
		setTimeout(() => {
			editClosing = false;
			editOpen = false;
		}, 240);
	}

	function addTeam() {
		const v = fTeamInput.trim();
		if (!v || fTeams.includes(v)) {
			fTeamInput = '';
			return;
		}
		fTeams = [...fTeams, v];
		fTeamInput = '';
	}

	function onTeamKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addTeam();
		} else if (e.key === 'Backspace' && !fTeamInput && fTeams.length) {
			fTeams = fTeams.slice(0, -1);
		}
	}

	function removeTeam(t: string) {
		fTeams = fTeams.filter((x) => x !== t);
	}

	async function submitEdit(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		editError = '';
		editOk = '';

		if (!fName.trim()) {
			editError = '昵称不能为空';
			return;
		}

		// 输入框里还没回车的团队名一并收进来
		const teams = [...fTeams];
		const pending = fTeamInput.trim();
		if (pending && !teams.includes(pending)) teams.push(pending);

		saving = true;
		try {
			await updateProfile({
				name: fName.trim(),
				email: fEmail.trim(),
				initials: fInitials.trim() || null,
				title: fTitle.trim() || null,
				color: fColor,
				teams
			});
			editOk = $t('common.saved');
			setTimeout(() => closeEdit(), 600);
		} catch (err) {
			editError = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
		} finally {
			saving = false;
		}
	}

	// ===== 修改密码抽屉 =====
	let pwdOpen = $state(false);
	let pwdClosing = $state(false);
	let pwdSaving = $state(false);
	let pwdError = $state('');
	let pwdOk = $state('');
	let pCurrent = $state('');
	let pNew = $state('');
	let pConfirm = $state('');

	function openPwd() {
		pCurrent = '';
		pNew = '';
		pConfirm = '';
		pwdError = '';
		pwdOk = '';
		pwdClosing = false;
		pwdOpen = true;
	}

	function closePwd() {
		if (!pwdOpen || pwdClosing) return;
		pwdClosing = true;
		setTimeout(() => {
			pwdClosing = false;
			pwdOpen = false;
		}, 240);
	}

	async function submitPwd(e: SubmitEvent) {
		e.preventDefault();
		if (pwdSaving) return;
		pwdError = '';
		pwdOk = '';

		if (!pCurrent) {
			pwdError = $t('me.currentPasswordRequired');
			return;
		}
		if (pNew.length < 6) {
			pwdError = $t('me.passwordTooShort');
			return;
		}
		if (pNew !== pConfirm) {
			pwdError = $t('me.passwordMismatch');
			return;
		}
		if (pNew === pCurrent) {
			pwdError = $t('me.passwordSame');
			return;
		}

		pwdSaving = true;
		try {
			await changeMyPassword(pCurrent, pNew);
			pwdOk = $t('me.passwordChanged');
			setTimeout(() => closePwd(), 900);
		} catch (err) {
			pwdError = err instanceof ApiError ? err.message : '修改失败，请稍后重试';
		} finally {
			pwdSaving = false;
		}
	}
</script>

<div class="me-page">
	<!-- 名片 -->
	<section class="card profile">
		<div class="avatar" style="background:{ME()?.color ?? '#33333c'}">{ME()?.initials ?? '--'}</div>
		<div class="profile-main">
			<div class="name-row">
				<h1>{ME()?.name ?? '未登录'}</h1>
				<span class="uid" title={$t('me.uid')}>{$t('me.uid')} {ME()?.uid ?? '—'}</span>
			</div>
			<div class="profile-tags">
				{#if ME()?.title}<span class="pill">{ME()!.title}</span>{/if}
				<span class="pill role">{ME()?.role ?? '—'}</span>
			</div>
			<p class="profile-meta">{ME()?.email ?? '—'} · {$t('account.joinedAt')} {joinedAt}</p>
		</div>

		<div class="profile-actions">
			<button class="btn-edit" onclick={openEdit}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 20h9" />
					<path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
				</svg>
				编辑资料
			</button>
			<button class="btn-ghost-sm" onclick={openPwd}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<rect x="4" y="10" width="16" height="10" rx="2" />
					<path d="M8 10V7a4 4 0 018 0v3" />
				</svg>
				修改密码
			</button>
		</div>

		<div class="profile-stats">
			<div class="stat">
				<span class="stat-v">{myProjects.length}</span>
				<span class="stat-k">{$t('me.statProjects')}</span>
			</div>
			<div class="stat">
				<span class="stat-v">{myTaskStats.done}/{myTaskStats.total}</span>
				<span class="stat-k">{$t('me.statTasks')}</span>
			</div>
			<div class="stat">
				<span class="stat-v">{granted}/{permTotal}</span>
				<span class="stat-k">{$t('me.statPerms')}</span>
			</div>
		</div>
	</section>

	<div class="row">
		<!-- 负责的项目 -->
		<section class="card">
			<header class="card-head">
				<div>
					<h2>{$t('me.myProjects')}</h2>
					<p class="sub">{$t('me.myProjectsSub', { values: { count: myProjects.length, tasks: myTaskStats.total } })}</p>
				</div>
				<a class="link" href="/projects">项目管理 →</a>
			</header>
			<ul class="proj-list">
				{#each myProjects as p (p.label)}
					<li class="proj-item">
						<span class="proj-dot" style="background:{p.color === 'red' ? '#ef4444' : p.color === 'violet' ? '#8b5cf6' : p.color === 'amber' ? '#f59e0b' : p.color === 'green' ? '#34d399' : p.color === 'cyan' ? '#22d3ee' : '#f472b6'}"></span>
						<div class="proj-info">
							<span class="proj-name">{p.label}</span>
							<span class="proj-purpose">{p.purpose || $t('projects.noPurpose')}</span>
						</div>
						<span class="tag {p.color}">{p.tag}</span>
						<span class="proj-count">{p.tasks.filter((t) => t.done).length}/{p.tasks.length}</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- 所在团队 -->
		<section class="card">
			<header class="card-head">
				<div>
					<h2>{$t('me.myTeams')}</h2>
					<p class="sub">{myTeamsSub}</p>
				</div>
				<a class="link" href="/team">{$t('me.manageTeams')} →</a>
			</header>
			{#if !teams.length}
				<p class="team-empty">{$t('me.teamsEmptyHint')}</p>
			{:else}
				<div class="team-tabs" role="tablist">
					{#each teams as tm (tm.id)}
						<button
							type="button"
							class="team-tab"
							class:active={tm.id === activeTeam?.id}
							role="tab"
							aria-selected={tm.id === activeTeam?.id}
							onclick={() => selectTeam(tm.id)}
						>
							<span class="team-tab-name">{tm.name}</span>
							<span class="team-tab-role">{tm.myRole === 'owner' ? $t('team.roleOwner') : $t('team.roleMember')}</span>
						</button>
					{/each}
				</div>
				<ul class="team-list">
					{#each teamMembers as m (m.userId)}
						<li class="team-item" class:me={m.userId === ME()?.id}>
							<span class="team-avatar" style="background:{m.color}">{initialsOf(m.name)}</span>
							<div class="team-info">
								<span class="team-name">{m.name}{#if m.userId === ME()?.id}<span class="me-badge">{$t('me.meBadge')}</span>{/if}</span>
								<span class="team-role">{m.title || m.role}</span>
							</div>
							<span class="team-member-role">{m.teamRole === 'owner' ? $t('team.roleOwner') : $t('team.roleMember')}</span>
						</li>
					{:else}
						<li class="team-item"><span class="team-empty">{$t('team.noMembers')}</span></li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>

	<!-- 职位与权限 -->
	<section class="card">
		<header class="card-head">
			<div>
				<h2>{$t('me.rolePerms')}</h2>
				<p class="sub">{ME()?.role ?? '—'}{ME()?.title ? ` · ${ME()!.title}` : ''} · {$t('me.grantedCount', { values: { count: granted } })}</p>
			</div>
		</header>
		<ul class="perm-list">
			{#each ME()?.permissions ?? [] as p (p.name)}
				<li class="perm-item" class:off={!p.granted}>
					<span class="perm-icon" class:on={p.granted} aria-hidden="true">
						{#if p.granted}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
								<path d="M5 12.5l4.5 4.5L19 7.5" />
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						{/if}
					</span>
					<div class="perm-info">
						<span class="perm-name">{p.name}</span>
						<span class="perm-desc">{p.desc}</span>
					</div>
					<span class="perm-state">{p.granted ? $t('me.granted') : $t('me.notGranted')}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

<!-- 编辑资料抽屉 -->
{#if editOpen}
	<div class="backdrop" class:closing={editClosing} onclick={closeEdit}></div>
	<aside class="drawer" class:closing={editClosing} role="dialog" aria-modal="true" aria-labelledby="edit-title">
		<header class="drawer-head">
			<div>
				<h2 id="edit-title">{$t('me.editProfile')}</h2>
				<p class="drawer-sub">{$t('me.editSub')}</p>
			</div>
			<button class="drawer-close" onclick={closeEdit} aria-label={$t('common.close')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitEdit}>
			<div class="grid-2">
				<label class="field">
					<span class="field-label">{$t('me.nickname')}</span>
					<input class="input" type="text" bind:value={fName} placeholder={$t('me.nicknamePlaceholder')} />
				</label>
				<label class="field">
					<span class="field-label">{$t('me.initials')}</span>
					<input class="input" type="text" maxlength="8" bind:value={fInitials} placeholder={$t('me.initialsPlaceholder')} />
				</label>
			</div>

			<label class="field">
				<span class="field-label">{$t('me.email')}</span>
				<input class="input" type="email" bind:value={fEmail} placeholder="name@example.com" />
			</label>

			<label class="field">
				<span class="field-label">{$t('me.titleLabel')}</span>
				<input class="input" type="text" bind:value={fTitle} placeholder={$t('me.titlePlaceholder')} />
			</label>

			<div class="field">
				<span class="field-label">{$t('me.avatarColor')}</span>
				<div class="swatches">
					{#each COLOR_SWATCHES as c}
						<button
							type="button"
							class="swatch"
							class:on={fColor === c}
							style="background:{c}"
							aria-label={c}
							onclick={() => (fColor = c)}
						></button>
					{/each}
					<span class="swatch-preview" style="background:{fColor}">
						{(fInitials.trim() || fName.trim().slice(0, 2) || '--').toUpperCase()}
					</span>
				</div>
			</div>

			<div class="field">
				<span class="field-label">{$t('me.teamsLabel')}</span>
				<input
					class="input"
					type="text"
					bind:value={fTeamInput}
					onkeydown={onTeamKey}
					onblur={addTeam}
					placeholder={$t('me.teamsPlaceholder')}
				/>
				{#if fTeams.length}
					<div class="chips tag-chips">
						{#each fTeams as t}
							<span class="chip on tag-chip">
								{t}
								<button type="button" class="chip-x" aria-label={`移除 ${t}`} onclick={() => removeTeam(t)}>×</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<p class="field-note">
				{$t('me.adminNote')}
			</p>

			{#if editError}<p class="form-error">{editError}</p>{/if}
			{#if editOk}<p class="form-ok">{editOk}</p>{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={closeEdit}>{$t('common.cancel')}</button>
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? $t('common.saving') : $t('projects.submitSave')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 修改密码抽屉 -->
{#if pwdOpen}
	<div class="backdrop" class:closing={pwdClosing} onclick={closePwd}></div>
	<aside class="drawer" class:closing={pwdClosing} role="dialog" aria-modal="true" aria-labelledby="pwd-title">
		<header class="drawer-head">
			<div>
				<h2 id="pwd-title">{$t('me.changePassword')}</h2>
				<p class="drawer-sub">{$t('me.pwdSub')}</p>
			</div>
			<button class="drawer-close" onclick={closePwd} aria-label={$t('common.close')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitPwd}>
			<label class="field">
				<span class="field-label">{$t('me.currentPassword')} *</span>
				<input class="input" type="password" autocomplete="current-password" bind:value={pCurrent} />
			</label>
			<label class="field">
				<span class="field-label">{$t('me.newPassword')} *</span>
				<input
					class="input"
					type="password"
					autocomplete="new-password"
					bind:value={pNew}
					placeholder="至少 6 位"
				/>
			</label>
			<label class="field">
				<span class="field-label">{$t('me.confirmPassword')} *</span>
				<input class="input" type="password" autocomplete="new-password" bind:value={pConfirm} />
			</label>

			{#if pwdError}<p class="form-error">{pwdError}</p>{/if}
			{#if pwdOk}<p class="form-ok">{pwdOk}</p>{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={closePwd}>取消</button>
				<button type="submit" class="btn-primary" disabled={pwdSaving}>
					{pwdSaving ? $t('common.saving') : $t('me.updatePassword')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<style>
	.me-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}
	.card {
		background: var(--bg-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}
	.row {
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		gap: var(--space-4);
		align-items: start;
	}
	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.card-head h2 {
		font-size: 1.05rem;
	}
	.sub {
		margin-top: 4px;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.link {
		flex: none;
		font-size: 0.8rem;
		color: var(--text-1);
	}
	.link:hover {
		color: var(--red-500);
	}

	/* ===== 名片 ===== */
	.profile {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		flex-wrap: wrap;
	}
	.avatar {
		flex: none;
		width: 76px;
		height: 76px;
		display: grid;
		place-items: center;
		border-radius: 22px;
		color: #fff;
		font-size: 1.6rem;
		font-weight: 800;
		box-shadow: 0 12px 32px rgba(220, 38, 38, 0.3);
	}
	.profile-main {
		flex: 1;
		min-width: 200px;
	}
	.name-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
	}
	.profile-main h1 {
		font-size: 1.6rem;
		line-height: 1.2;
	}
	/* 八位数用户 ID 徽标 */
	.uid {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 3px 9px;
		border-radius: 7px;
		color: var(--text-1);
		background: var(--bg-3);
		border: 1px solid var(--line);
	}
	.profile-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.pill {
		font-size: 0.74rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: 999px;
		color: var(--text-1);
		background: var(--bg-3);
	}
	.pill.role {
		color: #f87171;
		background: rgba(239, 68, 68, 0.15);
	}
	.profile-meta {
		margin-top: 8px;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.profile-stats {
		display: flex;
		gap: var(--space-5);
		flex: none;
	}
	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.stat-v {
		font-size: 1.4rem;
		font-weight: 760;
		letter-spacing: -0.01em;
	}
	.stat-k {
		font-size: 0.74rem;
		color: var(--text-2);
		white-space: nowrap;
	}

	/* ===== 项目列表 ===== */
	.proj-list,
	.team-list,
	.perm-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.proj-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.proj-dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.proj-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.proj-name {
		font-size: 0.9rem;
		font-weight: 650;
	}
	.proj-purpose {
		font-size: 0.74rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		flex: none;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 9px;
		border-radius: 20px;
	}
	.tag.violet { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
	.tag.red { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	.tag.amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
	.tag.green { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.tag.cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
	.tag.pink { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
	.proj-count {
		flex: none;
		font-size: 0.76rem;
		color: var(--text-2);
		white-space: nowrap;
	}

	/* ===== 团队 ===== */
	.team-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}

	.team-tab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border: 1px solid var(--border, rgba(148, 163, 184, 0.28));
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}

	.team-tab.active {
		border-color: var(--red-500);
		color: var(--red-500);
	}

	.team-tab-role {
		font-size: 0.7rem;
		opacity: 0.65;
	}

	.team-member-role {
		margin-left: auto;
		font-size: 0.72rem;
		opacity: 0.65;
	}

	.team-empty {
		font-size: 0.85rem;
		opacity: 0.7;
	}
	.team-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.team-item.me {
		border-color: var(--red-500);
		background: var(--accent-soft);
	}
	.team-avatar {
		flex: none;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 9px;
		color: #fff;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.team-info {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.team-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.88rem;
		font-weight: 650;
	}
	.me-badge {
		font-size: 0.62rem;
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 999px;
		color: #fff;
		background: var(--red-500);
	}
	.team-role {
		font-size: 0.74rem;
		color: var(--text-2);
	}

	/* ===== 权限 ===== */
	.perm-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.perm-item.off {
		opacity: 0.6;
	}
	.perm-icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		color: var(--text-2);
		background: var(--bg-3);
	}
	.perm-icon.on {
		color: #34d399;
		background: rgba(52, 211, 153, 0.15);
	}
	.perm-icon svg {
		width: 13px;
		height: 13px;
	}
	.perm-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.perm-name {
		font-size: 0.88rem;
		font-weight: 650;
	}
	.perm-desc {
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.perm-state {
		flex: none;
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.perm-item:not(.off) .perm-state {
		color: #34d399;
	}

	@media (max-width: 980px) {
		.row {
			grid-template-columns: 1fr;
		}
		.profile {
			flex-direction: column;
			align-items: flex-start;
		}
		.profile-stats {
			width: 100%;
			justify-content: space-between;
		}
	}

	/* ===== 名片上的操作按钮 ===== */
	.profile-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: none;
	}
	.btn-edit,
	.btn-ghost-sm {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 14px;
		border-radius: 10px;
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
	}
	.btn-edit svg,
	.btn-ghost-sm svg {
		width: 15px;
		height: 15px;
		flex: none;
	}
	.btn-edit {
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 18px rgba(220, 38, 38, 0.3);
	}
	.btn-edit:hover {
		filter: brightness(1.08);
	}
	.btn-ghost-sm {
		border: 1px solid var(--line-strong);
		background: var(--bg-2);
		color: var(--text-1);
	}
	.btn-ghost-sm:hover {
		color: var(--text-0);
		border-color: rgba(220, 38, 38, 0.4);
	}

	/* ===== 抽屉 ===== */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(5, 5, 8, 0.62);
		backdrop-filter: blur(3px);
		animation: me-fade 0.2s ease;
	}
	@keyframes me-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes me-fade-out {
		to {
			opacity: 0;
		}
	}
	.backdrop.closing {
		animation: me-fade-out 0.24s ease forwards;
	}

	.drawer {
		position: fixed;
		top: 50%;
		right: var(--space-5);
		transform: translateY(-50%);
		z-index: 61;
		width: min(480px, calc(100vw - 40px));
		max-height: 86vh;
		overflow: auto;
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: -30px 0 80px rgba(0, 0, 0, 0.5);
		animation: me-slide-in 0.26s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes me-slide-in {
		from {
			transform: translate(30px, -50%);
			opacity: 0;
		}
	}
	@keyframes me-slide-out {
		to {
			transform: translate(40px, -50%);
			opacity: 0;
		}
	}
	.drawer.closing {
		animation: me-slide-out 0.26s cubic-bezier(0.4, 0, 0.6, 1) forwards;
	}

	.drawer-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-5) var(--space-5) var(--space-4);
		border-bottom: 1px solid var(--line);
	}
	.drawer-head h2 {
		margin: 0;
		font-size: 1.1rem;
	}
	.drawer-sub {
		margin: 5px 0 0;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.drawer-close {
		flex: none;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.drawer-close:hover {
		color: var(--text-0);
		background: var(--bg-2);
	}
	.drawer-close svg {
		width: 15px;
		height: 15px;
	}

	.drawer-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
	}
	.grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-label {
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-1);
	}
	.input {
		width: 100%;
		padding: 9px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.86rem;
		outline: none;
		transition: border-color 0.16s ease, box-shadow 0.16s ease;
	}
	.input::placeholder {
		color: var(--text-2);
	}
	.input:focus {
		border-color: rgba(220, 38, 38, 0.55);
		box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.13);
	}

	/* 头像配色色板 */
	.swatches {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.swatch {
		width: 26px;
		height: 26px;
		border-radius: 9px;
		border: 2px solid transparent;
		cursor: pointer;
		transition: transform 0.14s ease, border-color 0.14s ease;
	}
	.swatch:hover {
		transform: scale(1.1);
	}
	.swatch.on {
		border-color: var(--text-0);
		box-shadow: 0 0 0 2px var(--bg-1) inset;
	}
	.swatch-preview {
		margin-left: auto;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		color: #fff;
		font-size: 0.82rem;
		font-weight: 800;
	}

	/* 团队 tag */
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag-chips {
		margin-top: 8px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-1);
		font-size: 0.76rem;
	}
	.chip.on {
		border-color: rgba(220, 38, 38, 0.4);
		background: var(--accent-soft);
		color: var(--red-500);
	}
	.chip-x {
		border: none;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
	}
	.chip-x:hover {
		color: #fff;
	}

	.field-note {
		margin: 0;
		padding: 9px 11px;
		border: 1px dashed var(--line-strong);
		border-radius: 9px;
		background: var(--bg-2);
		color: var(--text-2);
		font-size: 0.74rem;
		line-height: 1.6;
	}
	.form-error,
	.form-ok {
		margin: 0;
		padding: 8px 10px;
		border-radius: 9px;
		font-size: 0.78rem;
	}
	.form-error {
		border: 1px solid rgba(220, 38, 38, 0.35);
		background: rgba(220, 38, 38, 0.1);
		color: #f87171;
	}
	.form-ok {
		border: 1px solid rgba(34, 197, 94, 0.35);
		background: rgba(34, 197, 94, 0.1);
		color: #4ade80;
	}

	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding-top: var(--space-2);
	}
	.btn-ghost,
	.btn-primary {
		padding: 9px 18px;
		border-radius: 10px;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}
	.btn-ghost {
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-1);
	}
	.btn-ghost:hover {
		color: var(--text-0);
		background: var(--bg-2);
	}
	.btn-primary {
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 18px rgba(220, 38, 38, 0.3);
	}
	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		box-shadow: none;
	}

	@media (max-width: 720px) {
		.profile-actions {
			width: 100%;
			flex-direction: row;
		}
		.btn-edit,
		.btn-ghost-sm {
			flex: 1;
			justify-content: center;
		}
		.grid-2 {
			grid-template-columns: 1fr;
		}
	}
</style>
