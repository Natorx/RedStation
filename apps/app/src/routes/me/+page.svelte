<script lang="ts">
	import { ME, MEMBERS, projects } from '$lib/stores/workspace.svelte';

	// 我负责的项目（对接后端后可换成按 owner 过滤）
	const myProjects = $derived(projects);

	const myTaskStats = $derived({
		total: myProjects.reduce((n, p) => n + p.tasks.length, 0),
		done: myProjects.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0)
	});

	const granted = $derived(ME.permissions.filter((p) => p.granted).length);

	function initialsOf(name: string) {
		return name.slice(0, 1).toUpperCase();
	}
</script>

<div class="me-page">
	<!-- 名片 -->
	<section class="card profile">
		<div class="avatar" style="background:{ME.color}">{ME.initials}</div>
		<div class="profile-main">
			<div class="name-row">
				<h1>{ME.name}</h1>
				<span class="uid" title="用户 ID">ID {ME.id}</span>
			</div>
			<div class="profile-tags">
				<span class="pill">{ME.title}</span>
				<span class="pill role">{ME.role}</span>
			</div>
			<p class="profile-meta">{ME.email} · 加入于 {ME.joined}</p>
		</div>

		<div class="profile-stats">
			<div class="stat">
				<span class="stat-v">{myProjects.length}</span>
				<span class="stat-k">负责项目</span>
			</div>
			<div class="stat">
				<span class="stat-v">{myTaskStats.done}/{myTaskStats.total}</span>
				<span class="stat-k">任务完成</span>
			</div>
			<div class="stat">
				<span class="stat-v">{granted}/{ME.permissions.length}</span>
				<span class="stat-k">已授权限</span>
			</div>
		</div>
	</section>

	<div class="row">
		<!-- 负责的项目 -->
		<section class="card">
			<header class="card-head">
				<div>
					<h2>负责的项目</h2>
					<p class="sub">{myProjects.length} 个项目 · 共 {myTaskStats.total} 项任务</p>
				</div>
				<a class="link" href="/projects">项目管理 →</a>
			</header>
			<ul class="proj-list">
				{#each myProjects as p (p.label)}
					<li class="proj-item">
						<span class="proj-dot" style="background:{p.color === 'red' ? '#ef4444' : p.color === 'violet' ? '#8b5cf6' : p.color === 'amber' ? '#f59e0b' : p.color === 'green' ? '#34d399' : p.color === 'cyan' ? '#22d3ee' : '#f472b6'}"></span>
						<div class="proj-info">
							<span class="proj-name">{p.label}</span>
							<span class="proj-purpose">{p.purpose || '未填写用途'}</span>
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
					<h2>所在团队</h2>
					<p class="sub">{ME.teams.join('、')}</p>
				</div>
			</header>
			<ul class="team-list">
				{#each MEMBERS as m (m.name)}
					<li class="team-item" class:me={m.name === ME.name}>
						<span class="team-avatar" style="background:{m.color}">{initialsOf(m.name)}</span>
						<div class="team-info">
							<span class="team-name">{m.name}{#if m.name === ME.name}<span class="me-badge">我</span>{/if}</span>
							<span class="team-role">{m.role}</span>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<!-- 职位与权限 -->
	<section class="card">
		<header class="card-head">
			<div>
				<h2>职位与权限</h2>
				<p class="sub">{ME.role} · {ME.title} · 已授予 {granted} 项权限</p>
			</div>
		</header>
		<ul class="perm-list">
			{#each ME.permissions as p (p.name)}
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
					<span class="perm-state">{p.granted ? '已授权' : '未授权'}</span>
				</li>
			{/each}
		</ul>
	</section>
</div>

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
</style>
