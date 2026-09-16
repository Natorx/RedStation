<script lang="ts">
	import {
		ME,
		TEAMS,
		MY_JOIN_REQUESTS,
		TEAM_MEMBERS,
		TEAM_REQUESTS,
		TEAM_HANDLED_REQUESTS,
		loadTeams,
		loadTeamDetail,
		createTeam,
		requestJoinTeam,
		reviewJoinRequest,
		cancelJoinRequest,
		leaveTeam,
		dissolveTeam
	} from '$lib/stores/workspace.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { ApiError } from '$lib/api/client';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';

	const teams = $derived(TEAMS());
	const myRequests = $derived(MY_JOIN_REQUESTS());
	const members = $derived(TEAM_MEMBERS());
	const requests = $derived(TEAM_REQUESTS());
	const handled = $derived(TEAM_HANDLED_REQUESTS());

	// 进入页面即拉取（不依赖根布局，刷新本页也能拿到数据）
	// 只在登录后触发一次：用 ref 标记，避免 reading teamState 的字段导致自触发循环
	let loadedFor = $state<number | null>(null);
	$effect(() => {
		const me = ME();
		if (!me) return;
		if (loadedFor === me.id) return;
		loadedFor = me.id;
		loadTeams();
	});

	/** 当前选中的团队 id；默认第一个 */
	let activeId = $state<number | null>(null);
	const activeTeam = $derived(teams.find((t) => t.id === activeId) ?? teams[0] ?? null);

	// 团队列表变化时把选中项收敛到有效值
	$effect(() => {
		if (!teams.length) {
			activeId = null;
			return;
		}
		if (activeId === null || !teams.some((t) => t.id === activeId)) activeId = teams[0].id;
	});

	function selectTeam(id: number) {
		if (activeId === id) return;
		activeId = id;
		loadTeamDetail(id);
	}

	function initialsOf(m: { initials: string | null; name: string }) {
		return (m.initials ?? m.name.slice(0, 2)).toUpperCase();
	}

	/** 相对时间文案 */
	function relTime(iso: string) {
		const diff = Date.now() - new Date(iso).getTime();
		const day = 24 * 60 * 60 * 1000;
		const tr = get(t);
		const d = Math.floor(diff / day);
		if (d <= 0) return tr('tasks.today');
		if (d === 1) return tr('tasks.yesterday');
		return tr('tasks.daysAgo', { values: { days: d } });
	}

	const joinAt = (iso: string) => iso.slice(0, 10);

	// ===== 操作状态 =====
	/** 正在审核的申请 id，防止重复点击 */
	let reviewingId = $state<number | null>(null);
	let actionError = $state('');
	let actionOk = $state('');

	function flashError(err: unknown, fallback: string) {
		actionError = err instanceof ApiError ? err.message : fallback;
		actionOk = '';
	}

	async function onReview(requestId: number, action: 'approve' | 'reject') {
		if (!activeTeam || reviewingId !== null) return;
		reviewingId = requestId;
		actionError = '';
		actionOk = '';
		try {
			await reviewJoinRequest(activeTeam.id, requestId, action);
			actionOk = $t(action === 'approve' ? 'team.approved' : 'team.rejected');
		} catch (err) {
			flashError(err, '操作失败，请稍后重试');
		} finally {
			reviewingId = null;
		}
	}

	async function onCancelRequest(teamId: number, requestId: number) {
		actionError = '';
		actionOk = '';
		try {
			await cancelJoinRequest(teamId, requestId);
		} catch (err) {
			flashError(err, '撤回失败，请稍后重试');
		}
	}

	async function onLeave() {
		if (!activeTeam) return;
		actionError = '';
		actionOk = '';
		try {
			await leaveTeam(activeTeam.id);
			actionOk = $t('team.left');
		} catch (err) {
			flashError(err, '退出失败，请稍后重试');
		}
	}

	// ===== 新建团队 =====
	let createOpen = $state(false);
	let createClosing = $state(false);
	let creating = $state(false);
	let cName = $state('');
	let cDesc = $state('');

	function openCreate() {
		cName = '';
		cDesc = '';
		actionError = '';
		actionOk = '';
		createClosing = false;
		createOpen = true;
	}

	function closeCreate() {
		if (!createOpen || createClosing) return;
		createClosing = true;
		setTimeout(() => {
			createClosing = false;
			createOpen = false;
		}, 240);
	}

	async function submitCreate(e: SubmitEvent) {
		e.preventDefault();
		if (creating) return;
		actionError = '';
		if (!cName.trim()) {
			actionError = $t('team.nameRequired');
			return;
		}
		creating = true;
		try {
			await createTeam(cName, cDesc);
			createOpen = false;
		} catch (err) {
			actionError = err instanceof ApiError ? err.message : '创建失败，请稍后重试';
		} finally {
			creating = false;
		}
	}

	// ===== 申请加入 =====
	let joinOpen = $state(false);
	let joinClosing = $state(false);
	let joining = $state(false);
	let jCode = $state('');
	let jMessage = $state('');

	function openJoin() {
		jCode = '';
		jMessage = '';
		actionError = '';
		actionOk = '';
		joinClosing = false;
		joinOpen = true;
	}

	function closeJoin() {
		if (!joinOpen || joinClosing) return;
		joinClosing = true;
		setTimeout(() => {
			joinClosing = false;
			joinOpen = false;
		}, 240);
	}

	async function submitJoin(e: SubmitEvent) {
		e.preventDefault();
		if (joining) return;
		actionError = '';
		const code = jCode.replace(/\s/g, '');
		if (!/^\d{8}$/.test(code)) {
			actionError = $t('team.codeRule');
			return;
		}
		joining = true;
		try {
			await requestJoinTeam(code, jMessage);
			joinOpen = false;
			actionOk = $t('team.requestSent');
		} catch (err) {
			actionError = err instanceof ApiError ? err.message : '申请提交失败，请稍后重试';
		} finally {
			joining = false;
		}
	}

	// ===== 解散确认 =====
	let dissolveOpen = $state(false);
	let dissolving = $state(false);

	async function confirmDissolve() {
		if (!activeTeam || dissolving) return;
		dissolving = true;
		actionError = '';
		try {
			await dissolveTeam(activeTeam.id);
			dissolveOpen = false;
			actionOk = $t('team.dissolved');
		} catch (err) {
			flashError(err, '解散失败，请稍后重试');
		} finally {
			dissolving = false;
		}
	}

	/** 把八位数团队 ID 按 4+4 分组显示，便于口头传播 */
	const codeDisplay = $derived(activeTeam ? activeTeam.joinCode.replace(/^(\d{4})(\d{4})$/, '$1 $2') : '');

	let copied = $state(false);
	async function copyCode() {
		if (!activeTeam) return;
		try {
			await navigator.clipboard.writeText(activeTeam.joinCode);
			copied = true;
			setTimeout(() => (copied = false), 1600);
		} catch {
			// 剪贴板不可用（非 https / 无权限）时忽略，ID 本身已在页面上可见
		}
	}
</script>

<div class="team-page">

	{#if teams.length === 0}
		<!-- ===== 空态：还没有团队 ===== -->
		<section class="card hero">
			<div class="hero-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
					<path d="M17 20v-2a3 3 0 00-3-3H6a3 3 0 00-3 3v2" />
					<circle cx="10" cy="7" r="3.2" />
					<path d="M20 20v-2a3 3 0 00-2.2-2.9" />
					<path d="M16.2 4.3a3.2 3.2 0 010 5.4" />
				</svg>
			</div>
			<h1>{$t('team.emptyTitle')}</h1>
			<p class="hero-sub">{$t('team.emptySub')}</p>

			<div class="hero-actions">
				<button class="btn-primary" onclick={openCreate}>{$t('team.createTeam')}</button>
				<button class="btn-ghost" onclick={openJoin}>{$t('team.joinTeam')}</button>
			</div>

			<div class="steps">
				<div class="step">
					<span class="step-idx">1</span>
					<div>
						<span class="step-title">{$t('team.step1Title')}</span>
						<span class="step-desc">{$t('team.step1Desc')}</span>
					</div>
				</div>
				<div class="step">
					<span class="step-idx">2</span>
					<div>
						<span class="step-title">{$t('team.step2Title')}</span>
						<span class="step-desc">{$t('team.step2Desc')}</span>
					</div>
				</div>
				<div class="step">
					<span class="step-idx">3</span>
					<div>
						<span class="step-title">{$t('team.step3Title')}</span>
						<span class="step-desc">{$t('team.step3Desc')}</span>
					</div>
				</div>
			</div>
		</section>

		{#if myRequests.length}
			<!-- 我发出的申请（等待审核） -->
			<section class="card">
				<header class="card-head">
					<div>
						<h2>{$t('team.myRequests')}</h2>
						<p class="sub">{$t('team.myRequestsSub', { values: { count: myRequests.length } })}</p>
					</div>
				</header>
				<ul class="req-list">
					{#each myRequests as req (req.id)}
						<li class="req-item pending">
							<div class="req-main">
								<span class="req-name">{$t('team.teamHash')}{req.teamId}</span>
								{#if req.message}<span class="req-msg">{req.message}</span>{/if}
								<span class="req-time">{$t('team.appliedAt')} {relTime(req.createdAt)}</span>
							</div>
							<span class="state pending">{$t('team.pending')}</span>
							<button class="btn-mini" onclick={() => onCancelRequest(req.teamId, req.id)}>
								{$t('team.cancelRequest')}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		<!-- ===== 已加入团队 ===== -->
		<div class="team-bar">
			<div class="chips">
				{#each teams as tm (tm.id)}
					<button class="chip" class:on={tm.id === activeTeam?.id} onclick={() => selectTeam(tm.id)}>
						{tm.name}
						<span class="chip-count">{tm.memberCount}</span>
						{#if tm.pendingCount > 0}<span class="chip-dot" aria-label={$t('team.pendingBadge')}></span>{/if}
					</button>
				{/each}
			</div>
			<div class="team-bar-actions">
				<button class="btn-ghost sm" onclick={openJoin}>{$t('team.joinTeam')}</button>
				<button class="btn-primary sm" onclick={openCreate}>{$t('team.createTeam')}</button>
			</div>
		</div>

		{#if activeTeam}
			<section class="card team-card">
				<header class="team-head">
					<div class="team-title-wrap">
						<h1 class="team-title">{activeTeam.name}</h1>
						<span class="role-tag" class:owner={activeTeam.myRole === 'owner'}>
							{activeTeam.myRole === 'owner' ? $t('team.roleOwner') : $t('team.roleMember')}
						</span>
					</div>
					<div class="team-actions">
						{#if activeTeam.myRole === 'owner'}
							<button class="btn-danger" onclick={() => (dissolveOpen = true)}>{$t('team.dissolve')}</button>
						{:else}
							<button class="btn-ghost sm" onclick={onLeave}>{$t('team.leave')}</button>
						{/if}
					</div>
				</header>

				{#if activeTeam.description}<p class="team-desc">{activeTeam.description}</p>{/if}

				<div class="team-meta">
					<button class="code-box" onclick={copyCode} title={$t('team.copyCode')}>
						<span class="code-label">{$t('team.teamId')}</span>
						<span class="code-val">{codeDisplay}</span>
						<span class="code-hint">{copied ? $t('team.copied') : $t('team.copyCode')}</span>
					</button>
					<div class="meta-cell">
						<span class="meta-label">{$t('team.owner')}</span>
						<span class="meta-val">{activeTeam.ownerName || '—'}</span>
					</div>
					<div class="meta-cell">
						<span class="meta-label">{$t('team.memberCount')}</span>
						<span class="meta-val">{activeTeam.memberCount}</span>
					</div>
					<div class="meta-cell">
						<span class="meta-label">{$t('team.createdAt')}</span>
						<span class="meta-val">{joinAt(activeTeam.createdAt)}</span>
					</div>
				</div>
			</section>

			<div class="split">
				<!-- 成员列表 -->
				<section class="card">
					<header class="card-head">
						<div>
							<h2>{$t('team.members')}</h2>
							<p class="sub">{$t('team.membersSub', { values: { count: members.length } })}</p>
						</div>
					</header>
					{#if members.length === 0}
						<p class="empty">{$t('team.noMembers')}</p>
					{:else}
						<ul class="member-list">
							{#each members as m (m.userId)}
								<li class="member-item" class:me={m.userId === ME()?.id}>
									<span class="avatar" style="background:{m.color}">{initialsOf(m)}</span>
									<div class="member-info">
										<span class="member-name">
											{m.name}
											{#if m.userId === ME()?.id}<span class="me-badge">{$t('me.meBadge')}</span>{/if}
										</span>
										<span class="member-sub">{m.role}{m.title ? ` · ${m.title}` : ''}</span>
									</div>
									<div class="member-side">
										<span class="role-tag sm" class:owner={m.teamRole === 'owner'}>
											{m.teamRole === 'owner' ? $t('team.roleOwner') : $t('team.roleMember')}
										</span>
										<span class="member-uid">ID {m.uid}</span>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<!-- 待审核申请：仅队长可见 -->
				{#if activeTeam.myRole === 'owner'}
					<section class="card">
						<header class="card-head">
							<div>
								<h2>{$t('team.requests')}</h2>
								<p class="sub">
									{$t('team.requestsSub', { values: { count: requests.length } })}
								</p>
							</div>
						</header>

						{#if requests.length === 0}
							<p class="empty">{$t('team.noRequests')}</p>
						{:else}
							<ul class="req-list">
								{#each requests as req (req.id)}
									<li class="req-item">
										<span class="avatar sm" style="background:{req.color}">
											{(req.initials ?? req.name.slice(0, 2)).toUpperCase()}
										</span>
										<div class="req-main">
											<span class="req-name">
												{req.name}
												{#if req.userRole}<span class="req-role">{req.userRole}</span>{/if}
											</span>
											{#if req.message}<span class="req-msg">{req.message}</span>{/if}
											<span class="req-time">ID {req.uid} · {relTime(req.createdAt)}</span>
										</div>
										<div class="req-actions">
											<button
												class="btn-approve"
												disabled={reviewingId !== null}
												onclick={() => onReview(req.id, 'approve')}>{$t('team.approve')}</button
											>
											<button
												class="btn-mini"
												disabled={reviewingId !== null}
												onclick={() => onReview(req.id, 'reject')}>{$t('team.reject')}</button
											>
										</div>
									</li>
								{/each}
							</ul>
						{/if}

						{#if handled.length}
							<details class="handled">
								<summary>{$t('team.handledTitle', { values: { count: handled.length } })}</summary>
								<ul class="req-list compact">
									{#each handled as req (req.id)}
										<li class="req-item">
											<div class="req-main">
												<span class="req-name">{req.name}</span>
												<span class="req-time">
													{req.status === 'approved' ? $t('team.approved') : $t('team.rejected')} ·
													{req.handledBy}
													{req.handledAt ? ` · ${joinAt(req.handledAt)}` : ''}
												</span>
											</div>
											<span class="state" class:done={req.status === 'approved'} class:off={req.status === 'rejected'}>
												{req.status === 'approved' ? $t('team.approved') : $t('team.rejected')}
											</span>
										</li>
									{/each}
								</ul>
							</details>
						{/if}
					</section>
				{/if}
			</div>
		{/if}

		{#if myRequests.length}
			<!-- 我发出的申请 -->
			<section class="card">
				<header class="card-head">
					<div>
						<h2>{$t('team.myRequests')}</h2>
						<p class="sub">{$t('team.myRequestsSub', { values: { count: myRequests.length } })}</p>
					</div>
				</header>
				<ul class="req-list">
					{#each myRequests as req (req.id)}
						<li class="req-item pending">
							<div class="req-main">
								<span class="req-name">{$t('team.teamHash')}{req.teamId}</span>
								{#if req.message}<span class="req-msg">{req.message}</span>{/if}
								<span class="req-time">{$t('team.appliedAt')} {relTime(req.createdAt)}</span>
							</div>
							<span class="state pending">{$t('team.pending')}</span>
							<button class="btn-mini" onclick={() => onCancelRequest(req.teamId, req.id)}>
								{$t('team.cancelRequest')}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>

<!-- 右上角气泡提示：成功/失败共用一条通道，后到的消息覆盖前一条 -->
<Toast message={actionOk} kind="success" onclose={() => (actionOk = '')} />
<Toast message={actionError} kind="error" duration={4500} onclose={() => (actionError = '')} />

<!-- 创建团队抽屉 -->
{#if createOpen}
	<div class="backdrop" class:closing={createClosing} onclick={closeCreate}></div>
	<aside class="drawer" class:closing={createClosing} role="dialog" aria-modal="true" aria-labelledby="create-title">
		<header class="drawer-head">
			<div>
				<h2 id="create-title">{$t('team.createTitle')}</h2>
				<p class="drawer-sub">{$t('team.createHint')}</p>
			</div>
			<button class="drawer-close" onclick={closeCreate} aria-label={$t('common.close')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitCreate}>
			<label class="field">
				<span class="field-label">{$t('team.nameLabel')} *</span>
				<input class="input" type="text" maxlength="64" bind:value={cName} placeholder={$t('team.namePlaceholder')} />
			</label>
			<label class="field">
				<span class="field-label">{$t('team.descLabel')}</span>
				<textarea
					class="input textarea"
					rows="3"
					maxlength="255"
					bind:value={cDesc}
					placeholder={$t('team.descPlaceholder')}
				></textarea>
			</label>

			<p class="field-note">{$t('team.createNote')}</p>
			{#if actionError}<p class="form-error">{actionError}</p>{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={closeCreate}>{$t('common.cancel')}</button>
				<button type="submit" class="btn-primary" disabled={creating}>
					{creating ? $t('common.creating') : $t('team.createTeam')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 申请加入抽屉 -->
{#if joinOpen}
	<div class="backdrop" class:closing={joinClosing} onclick={closeJoin}></div>
	<aside class="drawer" class:closing={joinClosing} role="dialog" aria-modal="true" aria-labelledby="join-title">
		<header class="drawer-head">
			<div>
				<h2 id="join-title">{$t('team.joinTitle')}</h2>
				<p class="drawer-sub">{$t('team.joinHint')}</p>
			</div>
			<button class="drawer-close" onclick={closeJoin} aria-label={$t('common.close')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitJoin}>
			<label class="field">
				<span class="field-label">{$t('team.codeLabel')} *</span>
				<input
					class="input code-input"
					type="text"
					inputmode="numeric"
					maxlength="9"
					bind:value={jCode}
					placeholder="1234 5678"
				/>
			</label>
			<label class="field">
				<span class="field-label">{$t('team.messageLabel')}</span>
				<input class="input" type="text" maxlength="255" bind:value={jMessage} placeholder={$t('team.messagePlaceholder')} />
			</label>

			<p class="field-note">{$t('team.joinNote')}</p>
			{#if actionError}<p class="form-error">{actionError}</p>{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={closeJoin}>{$t('common.cancel')}</button>
				<button type="submit" class="btn-primary" disabled={joining}>
					{joining ? $t('team.submitting') : $t('team.submitRequest')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 解散确认 -->
{#if dissolveOpen && activeTeam}
	<div class="modal-backdrop" onclick={() => !dissolving && (dissolveOpen = false)} role="presentation"></div>
	<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dissolve-title">
		<h3 id="dissolve-title" class="modal-title">{$t('team.dissolveTitle')}</h3>
		<p class="modal-text">
			{$t('team.dissolveBody', { values: { name: activeTeam.name, count: activeTeam.memberCount } })}
		</p>
		<div class="modal-actions">
			<button class="btn-ghost" onclick={() => (dissolveOpen = false)}>{$t('common.cancel')}</button>
			<button class="btn-danger" disabled={dissolving} onclick={confirmDissolve}>
				{dissolving ? $t('common.deleting') : $t('team.confirmDissolve')}
			</button>
		</div>
	</div>
{/if}

<style>
	.team-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.card {
		background: var(--bg-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}

	/* ===== 空态 ===== */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: var(--space-3);
		padding: var(--space-6) var(--space-5);
	}
	.hero-icon {
		width: 68px;
		height: 68px;
		display: grid;
		place-items: center;
		border-radius: 20px;
		color: #f87171;
		background: var(--accent-soft);
		border: 1px solid rgba(220, 38, 38, 0.22);
	}
	.hero-icon svg {
		width: 34px;
		height: 34px;
	}
	.hero h1 {
		font-size: 1.4rem;
	}
	.hero-sub {
		max-width: 460px;
		font-size: 0.88rem;
		color: var(--text-2);
	}
	.hero-actions {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-2);
		flex-wrap: wrap;
		justify-content: center;
	}
	.steps {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
		width: 100%;
		margin-top: var(--space-5);
		padding-top: var(--space-5);
		border-top: 1px solid var(--line);
		text-align: left;
	}
	.step {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.step-idx {
		flex: none;
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border-radius: 7px;
		font-size: 0.74rem;
		font-weight: 700;
		color: #fca5a5;
		background: var(--bg-3);
	}
	.step-title {
		display: block;
		font-size: 0.82rem;
		font-weight: 650;
	}
	.step-desc {
		display: block;
		margin-top: 2px;
		font-size: 0.74rem;
		color: var(--text-2);
	}

	/* ===== 团队切换条 ===== */
	.team-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: inherit;
		font-size: 0.84rem;
		font-weight: 650;
		padding: 7px 13px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--bg-1);
		color: var(--text-1);
		cursor: pointer;
		position: relative;
	}
	.chip:hover {
		color: var(--text-0);
	}
	.chip.on {
		color: #fff;
		background: var(--red-600);
		border-color: var(--red-600);
	}
	.chip-count {
		font-size: 0.72rem;
		opacity: 0.8;
	}
	.chip-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #f87171;
		box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
	}
	.chip.on .chip-dot {
		background: #fff;
		box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.25);
	}
	.team-bar-actions {
		display: flex;
		gap: var(--space-2);
	}

	/* ===== 团队卡片 ===== */
	.team-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.team-title-wrap {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.team-title {
		font-size: 1.35rem;
	}
	.team-desc {
		margin-top: 6px;
		font-size: 0.85rem;
		color: var(--text-1);
	}
	.role-tag {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: 999px;
		color: var(--text-1);
		background: var(--bg-3);
	}
	.role-tag.owner {
		color: #fca5a5;
		background: var(--accent-soft);
	}
	.role-tag.sm {
		font-size: 0.68rem;
		padding: 2px 8px;
	}

	.team-meta {
		display: grid;
		grid-template-columns: auto repeat(3, minmax(90px, auto));
		gap: var(--space-4);
		align-items: center;
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--line);
	}
	/* 团队 ID 是这一页最常被复制的信息，做成整块可点区域 */
	.code-box {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-family: inherit;
		text-align: left;
		padding: 8px 14px;
		border: 1px dashed var(--line-strong);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		cursor: pointer;
	}
	.code-box:hover {
		border-color: var(--red-500);
	}
	.code-label {
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.code-val {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--text-0);
	}
	.code-hint {
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.meta-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.meta-label {
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.meta-val {
		font-size: 0.86rem;
		font-weight: 600;
	}

	/* ===== 两栏 ===== */
	.split {
		display: grid;
		grid-template-columns: minmax(300px, 1fr) minmax(340px, 1.1fr);
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
		font-size: 1.02rem;
	}
	.sub {
		margin-top: 4px;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.empty {
		padding: var(--space-5);
		text-align: center;
		color: var(--text-2);
		font-size: 0.84rem;
	}

	/* ===== 成员 ===== */
	.member-list,
	.req-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.member-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0, var(--bg-1));
	}
	.member-item.me {
		border-color: rgba(220, 38, 38, 0.4);
	}
	.avatar {
		flex: none;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: 11px;
		color: #fff;
		font-size: 0.82rem;
		font-weight: 700;
	}
	.avatar.sm {
		width: 30px;
		height: 30px;
		border-radius: 9px;
		font-size: 0.74rem;
	}
	.member-info {
		flex: 1;
		min-width: 0;
	}
	.member-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.88rem;
		font-weight: 600;
	}
	.member-sub {
		display: block;
		margin-top: 1px;
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.member-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
	}
	.member-uid {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
	}
	.me-badge {
		font-size: 0.62rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 999px;
		color: #fff;
		background: var(--red-600);
	}

	/* ===== 申请 ===== */
	.req-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 9px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0, var(--bg-1));
	}
	.req-item.pending {
		border-color: rgba(245, 158, 11, 0.35);
	}
	.req-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.req-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.86rem;
		font-weight: 600;
	}
	.req-role {
		font-size: 0.66rem;
		font-weight: 600;
		padding: 1px 7px;
		border-radius: 999px;
		color: var(--text-1);
		background: var(--bg-3);
	}
	.req-msg {
		font-size: 0.78rem;
		color: var(--text-1);
	}
	.req-time {
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.req-actions {
		display: flex;
		gap: 6px;
		flex: none;
	}
	.state {
		flex: none;
		font-size: 0.68rem;
		font-weight: 700;
		padding: 3px 9px;
		border-radius: 999px;
		color: var(--text-1);
		background: var(--bg-3);
	}
	.state.pending {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.14);
	}
	.state.done {
		color: #4ade80;
		background: rgba(34, 197, 94, 0.12);
	}
	.state.off {
		color: var(--text-2);
	}
	.handled {
		margin-top: var(--space-4);
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
	}
	.handled summary {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-2);
		cursor: pointer;
	}
	.req-list.compact {
		margin-top: var(--space-3);
	}

	/* ===== 按钮 ===== */
	.btn-primary,
	.btn-ghost,
	.btn-danger,
	.btn-mini,
	.btn-approve {
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-primary,
	.btn-ghost {
		padding: 10px 18px;
		border-radius: 10px;
		font-size: 0.86rem;
	}
	.btn-primary.sm,
	.btn-ghost.sm {
		padding: 7px 14px;
		font-size: 0.8rem;
	}
	.btn-primary {
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 20px rgba(220, 38, 38, 0.3);
	}
	.btn-primary:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		box-shadow: none;
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
	.btn-danger {
		padding: 8px 14px;
		border: 1px solid rgba(220, 38, 38, 0.42);
		border-radius: 9px;
		background: transparent;
		color: #f87171;
		font-size: 0.82rem;
	}
	.btn-danger:hover:not(:disabled) {
		background: var(--accent-soft);
	}
	.btn-danger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.btn-mini {
		padding: 6px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: transparent;
		color: var(--text-1);
		font-size: 0.76rem;
	}
	.btn-mini:hover:not(:disabled) {
		color: var(--text-0);
		background: var(--bg-2);
	}
	.btn-mini:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn-approve {
		padding: 6px 12px;
		border: none;
		border-radius: 8px;
		background: var(--red-600);
		color: #fff;
		font-size: 0.76rem;
	}
	.btn-approve:hover:not(:disabled) {
		filter: brightness(1.1);
	}
	.btn-approve:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ===== 抽屉 ===== */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(5, 5, 8, 0.62);
		backdrop-filter: blur(3px);
		animation: tf-fade 0.2s ease;
	}
	@keyframes tf-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes tf-fade-out {
		to {
			opacity: 0;
		}
	}
	.backdrop.closing {
		animation: tf-fade-out 0.24s ease forwards;
	}
	.drawer {
		position: fixed;
		top: 50%;
		right: var(--space-5);
		transform: translateY(-50%);
		z-index: 61;
		width: min(460px, calc(100vw - 40px));
		max-height: 86vh;
		overflow: auto;
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: -30px 0 80px rgba(0, 0, 0, 0.5);
		animation: tf-slide-in 0.26s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes tf-slide-in {
		from {
			transform: translate(30px, -50%);
			opacity: 0;
		}
	}
	@keyframes tf-slide-out {
		to {
			transform: translate(40px, -50%);
			opacity: 0;
		}
	}
	.drawer.closing {
		animation: tf-slide-out 0.26s cubic-bezier(0.4, 0, 0.6, 1) forwards;
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
		font-size: 1.05rem;
	}
	.drawer-sub {
		margin-top: 5px;
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
	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding-top: var(--space-2);
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
	}
	.input::placeholder {
		color: var(--text-2);
	}
	.input:focus {
		outline: none;
		border-color: var(--red-500);
	}
	.textarea {
		resize: vertical;
		line-height: 1.5;
	}
	.code-input {
		font-family: var(--font-mono);
		font-size: 1.05rem;
		letter-spacing: 0.18em;
	}
	.field-note {
		font-size: 0.74rem;
		color: var(--text-2);
		line-height: 1.5;
	}
	.form-error {
		padding: 9px 12px;
		border-radius: 10px;
		font-size: 0.8rem;
		border: 1px solid rgba(248, 113, 113, 0.35);
		background: rgba(248, 113, 113, 0.1);
		color: #fca5a5;
	}

	/* ===== 确认弹窗 ===== */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgba(5, 5, 8, 0.68);
		backdrop-filter: blur(2px);
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 71;
		width: min(420px, calc(100vw - 40px));
		padding: var(--space-5);
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
	}
	.modal-title {
		font-size: 1.05rem;
	}
	.modal-text {
		margin-top: var(--space-3);
		font-size: 0.84rem;
		color: var(--text-1);
		line-height: 1.6;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-5);
	}

	@media (max-width: 1080px) {
		.split {
			grid-template-columns: 1fr;
		}
		.team-meta {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 720px) {
		.steps {
			grid-template-columns: 1fr;
		}
		.req-item {
			flex-wrap: wrap;
		}
		.req-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
