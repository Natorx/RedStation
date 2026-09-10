<script lang="ts">
	import {
		todos,
		toggleTodo,
		addTodo,
		removeTodo,
		MEMBERS,
		ME,
		TODO_TYPES,
		PRIORITIES,
		type TodoType,
		type Priority
	} from '$lib/stores/workspace.svelte';

	const PRIO_LABEL: Record<Priority, string> = { high: '高', medium: '中', low: '低' };

	// ===== 筛选 =====
	let filterType = $state<'all' | TodoType>('all');
	let filterTime = $state<'all' | '1d' | '3d' | '7d' | '30d'>('all');
	let filterPriority = $state<'all' | Priority>('all');
	let filterDone = $state<'all' | 'open' | 'done'>('all');

	const DAY = 24 * 60 * 60 * 1000;
	/** 各时间粒度的天数 */
	const TIME_RANGES: { value: '1d' | '3d' | '7d' | '30d'; label: string; days: number }[] = [
		{ value: '1d', label: '近 1 天', days: 1 },
		{ value: '3d', label: '近 3 天', days: 3 },
		{ value: '7d', label: '近 7 天', days: 7 },
		{ value: '30d', label: '近 30 天', days: 30 }
	];
	const timeCutoff = $derived(
		filterTime === 'all'
			? 0
			: Date.now() - (TIME_RANGES.find((r) => r.value === filterTime)?.days ?? 0) * DAY
	);

	const filtered = $derived(
		todos.filter((t) => {
			if (filterType !== 'all' && t.type !== filterType) return false;
			if (filterTime !== 'all' && t.createdAt < timeCutoff) return false;
			if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
			if (filterDone === 'open' && t.done) return false;
			if (filterDone === 'done' && !t.done) return false;
			return true;
		})
	);

	const hasFilter = $derived(
		filterType !== 'all' ||
			filterTime !== 'all' ||
			filterPriority !== 'all' ||
			filterDone !== 'all'
	);

	function clearFilters() {
		filterType = 'all';
		filterTime = 'all';
		filterPriority = 'all';
		filterDone = 'all';
	}

	/** 相对时间描述 */
	function relTime(ts: number) {
		const d = Math.floor((Date.now() - ts) / DAY);
		if (d <= 0) return '今天';
		if (d === 1) return '昨天';
		return `${d} 天前`;
	}

	/** 按创建时间倒序（最新在前） */
	const sorted = $derived([...filtered].sort((a, b) => b.createdAt - a.createdAt));

	// ===== 新建任务 =====
	let formOpen = $state(false);
	let formError = $state('');
	let nText = $state('');
	let nType = $state<TodoType>('开发');
	// 发布者默认取当前登录用户；成员列表由根布局异步加载，此处用派生兜底
	let nPriority = $state<Priority>('medium');
	let nAuthor = $state('');

	const defaultAuthor = $derived(ME()?.name ?? MEMBERS()[0]?.name ?? '');
	const authorOptions = $derived(MEMBERS().length ? MEMBERS() : ME() ? [ME()!] : []);

	function openForm() {
		nText = '';
		nType = '开发';
		nAuthor = defaultAuthor;
		nPriority = 'medium';
		formError = '';
		formOpen = true;
	}

	function submitTask(e: SubmitEvent) {
		e.preventDefault();
		if (!nText.trim()) {
			formError = '请填写任务内容';
			return;
		}
		addTodo(nText, nType, nAuthor, nPriority);
		formOpen = false;
	}

	// 统计
	const stats = $derived({
		total: todos.length,
		open: todos.filter((t) => !t.done).length,
		high: todos.filter((t) => !t.done && t.priority === 'high').length
	});
</script>

<div class="tasks-page">
	<!-- 汇总 -->
	<section class="stat-grid">
		<div class="card stat">
			<span class="stat-label">全部任务</span>
			<div class="stat-val">{stats.total}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">进行中</span>
			<div class="stat-val">{stats.open}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">高优先级待办</span>
			<div class="stat-val hi">{stats.high}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">当前筛选结果</span>
			<div class="stat-val">{sorted.length}</div>
		</div>
	</section>

	<!-- 筛选栏 -->
	<section class="card filters">
		<div class="filter-row">
			<div class="fgroup">
				<span class="flabel">类型</span>
				<div class="seg">
					<button class="seg-btn" class:active={filterType === 'all'} onclick={() => (filterType = 'all')}>
						全部
					</button>
					{#each TODO_TYPES as t}
						<button class="seg-btn" class:active={filterType === t} onclick={() => (filterType = t)}>
							{t}
						</button>
					{/each}
				</div>
			</div>

			<div class="fgroup">
				<span class="flabel">时间</span>
				<div class="seg">
					<button class="seg-btn" class:active={filterTime === 'all'} onclick={() => (filterTime = 'all')}>
						全部
					</button>
					{#each TIME_RANGES as r}
						<button
							class="seg-btn"
							class:active={filterTime === r.value}
							onclick={() => (filterTime = r.value)}>{r.label}</button
						>
					{/each}
				</div>
			</div>
		</div>

		<div class="filter-row">
			<div class="fgroup">
				<span class="flabel">优先级</span>
				<div class="seg">
					<button
						class="seg-btn"
						class:active={filterPriority === 'all'}
						onclick={() => (filterPriority = 'all')}>全部</button
					>
					{#each PRIORITIES as p}
						<button
							class="seg-btn"
							class:active={filterPriority === p.value}
							onclick={() => (filterPriority = p.value)}>{p.label}</button
						>
					{/each}
				</div>
			</div>

			<div class="fgroup">
				<span class="flabel">状态</span>
				<div class="seg">
					<button class="seg-btn" class:active={filterDone === 'all'} onclick={() => (filterDone = 'all')}>
						全部
					</button>
					<button class="seg-btn" class:active={filterDone === 'open'} onclick={() => (filterDone = 'open')}>
						进行中
					</button>
					<button class="seg-btn" class:active={filterDone === 'done'} onclick={() => (filterDone = 'done')}>
						已完成
					</button>
				</div>
			</div>

			<div class="filter-actions">
				{#if hasFilter}
					<button class="btn-ghost" onclick={clearFilters}>清除筛选</button>
				{/if}
				<button class="btn-primary" onclick={openForm}>+ 新建任务</button>
			</div>
		</div>
	</section>

	<!-- 任务列表 -->
	<section class="card">
		<header class="card-head">
			<div>
				<h2>任务列表</h2>
				<p class="sub">共 {sorted.length} 条 · 按创建时间倒序</p>
			</div>
		</header>

		{#if sorted.length === 0}
			<p class="empty">没有符合条件的任务。</p>
		{:else}
			<ul class="todo-list">
				{#each sorted as todo (todo.text + todo.createdAt)}
					{@const i = todos.indexOf(todo)}
					<li class="todo-item {todo.done ? 'done' : ''}">
						<label class="todo-check">
							<input
								type="checkbox"
								checked={todo.done}
								onchange={() => toggleTodo(i)}
								aria-label={todo.text}
							/>
							<span class="todo-box" aria-hidden="true"></span>
						</label>
						<span class="prio {todo.priority}" title="优先级：{PRIO_LABEL[todo.priority]}">
							{PRIO_LABEL[todo.priority]}
						</span>
						<span class="todo-text">{todo.text}</span>
						<span class="todo-meta">{relTime(todo.createdAt)}</span>
						{#if todo.due}<span class="todo-due">{todo.due}前</span>{/if}
						<span class="author">{todo.author}</span>
						<span class="tag {todo.color}">{todo.type}</span>
						<button
							class="del"
							title="删除任务"
							aria-label="删除任务"
							onclick={() => removeTodo(i)}
						>
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M18 6L6 18M6 6l12 12" />
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<!-- 新建任务抽屉 -->
{#if formOpen}
	<div class="backdrop" onclick={() => (formOpen = false)}></div>
	<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
		<header class="drawer-head">
			<div>
				<h2 id="task-form-title">新建任务</h2>
				<p class="drawer-sub">填写任务内容，创建后可在任务列表中筛选</p>
			</div>
			<button class="drawer-close" onclick={() => (formOpen = false)} aria-label="关闭">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitTask}>
			<label class="field">
				<span class="field-label">任务内容 *</span>
				<input class="input" type="text" bind:value={nText} placeholder="例如 修复登录闪退" />
			</label>

			<div class="field">
				<span class="field-label">类型</span>
				<div class="chips">
					{#each TODO_TYPES as t}
						<button
							type="button"
							class="chip"
							class:on={nType === t}
							onclick={() => (nType = t)}>{t}</button
						>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field-label">优先级</span>
				<div class="chips">
					{#each PRIORITIES as p}
						<button
							type="button"
							class="chip"
							class:on={nPriority === p.value}
							onclick={() => (nPriority = p.value)}>{p.label}</button
						>
					{/each}
				</div>
			</div>

			<label class="field">
				<span class="field-label">发布者</span>
				<select class="input select" bind:value={nAuthor}>
					{#each authorOptions as m}
						<option value={m.name}>{m.name} · {m.role}</option>
					{/each}
				</select>
			</label>

			{#if formError}
				<p class="form-error">{formError}</p>
			{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={() => (formOpen = false)}>取消</button>
				<button type="submit" class="btn-primary">创建任务</button>
			</footer>
		</form>
	</aside>
{/if}

<style>
	.tasks-page {
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

	/* ===== 汇总 ===== */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-4);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.stat-label {
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.stat-val {
		font-size: 1.8rem;
		font-weight: 760;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.stat-val.hi {
		color: #f87171;
	}

	/* ===== 筛选 ===== */
	.filters {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.filter-row {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--space-5);
	}
	.fgroup {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.flabel {
		font-size: 0.76rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.seg {
		display: flex;
		gap: 4px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg-2);
	}
	.seg-btn {
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 5px 12px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--text-1);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s, background 0.15s;
	}
	.seg-btn:hover {
		color: var(--text-0);
	}
	.seg-btn.active {
		color: #fff;
		background: var(--red-600);
	}
	.filter-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-left: auto;
	}

	.btn-primary,
	.btn-ghost {
		font-family: inherit;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 8px 14px;
		border-radius: 9px;
		cursor: pointer;
		white-space: nowrap;
	}
	.btn-primary {
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 20px rgba(220, 38, 38, 0.3);
	}
	.btn-primary:hover {
		filter: brightness(1.08);
	}
	.btn-ghost {
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-1);
	}
	.btn-ghost:hover {
		color: var(--text-0);
		border-color: var(--text-2);
	}

	/* ===== 列表 ===== */
	.card-head {
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
	.empty {
		padding: var(--space-6);
		text-align: center;
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.todo-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.todo-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0, var(--bg-1));
	}
	.todo-item:hover {
		border-color: var(--red-500);
	}
	.todo-check {
		flex: none;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		cursor: pointer;
		position: relative;
	}
	.todo-check input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	.todo-box {
		flex: none;
		width: 18px;
		height: 18px;
		border: 2px solid var(--text-3, var(--line));
		border-radius: 5px;
		background: transparent;
		position: relative;
	}
	.todo-item.done .todo-box {
		background: var(--red-500);
		border-color: var(--red-500);
	}
	.todo-item.done .todo-box::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 1px;
		width: 4px;
		height: 9px;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}
	.prio {
		flex: none;
		width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border-radius: 5px;
		font-size: 0.66rem;
		font-weight: 800;
	}
	.prio.high { color: #f87171; background: rgba(239, 68, 68, 0.18); }
	.prio.medium { color: #fbbf24; background: rgba(245, 158, 11, 0.18); }
	.prio.low { color: #34d399; background: rgba(52, 211, 153, 0.18); }
	.todo-text {
		flex: 1;
		min-width: 0;
		font-size: 0.9rem;
	}
	.todo-item.done .todo-text {
		color: var(--text-3);
		text-decoration: line-through;
	}
	.todo-meta,
	.todo-due,
	.author {
		flex: none;
		font-size: 0.74rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.author {
		font-weight: 600;
		color: var(--text-1);
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
	.del {
		flex: none;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.del:hover {
		color: var(--red-500);
		border-color: var(--red-500);
	}
	.del svg {
		width: 13px;
		height: 13px;
	}

	/* ===== 抽屉 ===== */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(5, 5, 8, 0.58);
		backdrop-filter: blur(3px);
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 81;
		width: min(460px, 100vw);
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border-left: 1px solid var(--line-strong);
		box-shadow: -24px 0 80px rgba(0, 0, 0, 0.5);
		animation: slide-in 0.26s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes slide-in {
		from { transform: translateX(24px); opacity: 0; }
	}
	.drawer-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-5);
		border-bottom: 1px solid var(--line);
	}
	.drawer-head h2 {
		font-size: 1.2rem;
	}
	.drawer-sub {
		margin-top: 4px;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.drawer-close {
		flex: none;
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
	}
	.drawer-close:hover {
		color: var(--text-0);
	}
	.drawer-close svg {
		width: 16px;
		height: 16px;
	}
	.drawer-body {
		flex: 1;
		overflow: auto;
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-1);
	}
	.input {
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.88rem;
	}
	.input:focus {
		outline: none;
		border-color: var(--red-500);
	}
	.select {
		cursor: pointer;
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-position: calc(100% - 17px) 50%, calc(100% - 12px) 50%;
		background-size: 5px 5px, 5px 5px;
		background-repeat: no-repeat;
		padding-right: 32px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 5px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
	}
	.chip:hover {
		color: var(--text-0);
	}
	.chip.on {
		border-color: var(--red-500);
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
	}
	.form-error {
		font-size: 0.8rem;
		color: #f87171;
	}
	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: auto;
	}

	@media (max-width: 1024px) {
		.stat-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.filter-actions {
			margin-left: 0;
		}
	}
</style>
