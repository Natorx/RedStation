<script lang="ts">
	import {
		TODOS,
		toggleTodo,
		addTodo,
		removeTodo,
		MEMBERS,
		ME,
		todoColor,
		TODO_TYPES,
		PRIORITIES,
		type TodoType,
		type Priority
	} from '$lib/stores/workspace.svelte';
	import { ApiError } from '$lib/api/client';
	import { t } from '$lib/i18n';
	import { get } from 'svelte/store';
	/** 任务类型 -> i18n 键，展示层翻译，存储值仍是中文 */
	const TYPE_KEY: Record<string, string> = {
		开发: 'tasks.typeDev',
		设计: 'tasks.typeDesign',
		文档: 'tasks.typeDoc',
		运维: 'tasks.typeOps',
		调研: 'tasks.typeResearch',
		其他: 'tasks.typeOther'
	};

	/** 优先级标签，随语言切换 */
	const PRIO_LABEL = $derived({
		high: $t('tasks.prioHigh'),
		medium: $t('tasks.prioMedium'),
		low: $t('tasks.prioLow')
	} as Record<string, string>);

	/** 待办列表（后端数据，容器在 store 里） */
	const todos = $derived(TODOS());

	// ===== 筛选 =====
	let filterType = $state<'all' | TodoType>('all');
	/** 创建时间范围筛选；空串表示不限 */
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterPriority = $state<'all' | Priority>('all');
	let filterDone = $state<'all' | 'open' | 'done'>('all');

	const DAY = 24 * 60 * 60 * 1000;
	/** 把 <input type="date"> 的 yyyy-mm-dd 转为当天 00:00 的毫秒时间戳；非法输入返回 null */
	function dayStart(v: string): number | null {
		if (!v) return null;
		const ts = new Date(`${v}T00:00:00`).getTime();
		return Number.isNaN(ts) ? null : ts;
	}
	/** 结束日期取当天 23:59:59.999，保证包含当天创建的任务 */
	function dayEnd(v: string): number | null {
		if (!v) return null;
		const ts = new Date(`${v}T23:59:59.999`).getTime();
		return Number.isNaN(ts) ? null : ts;
	}
	const fromTs = $derived(dayStart(filterFrom));
	const toTs = $derived(dayEnd(filterTo));

	// ===== 日历（点选单日筛选） =====
	/** 把毫秒时间戳转成本地 yyyy-mm-dd，避免 toISOString 的 UTC 偏移 */
	function ymd(ts: number): string {
		const d = new Date(ts);
		const m = `${d.getMonth() + 1}`.padStart(2, '0');
		const day = `${d.getDate()}`.padStart(2, '0');
		return `${d.getFullYear()}-${m}-${day}`;
	}
	/** 当前展示的月份（该月 1 号） */
	let calMonth = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime());
	const todayKey = ymd(Date.now());
	/** 有任务的日期 -> 当天任务数 */
	const dayCounts = $derived.by(() => {
		const map = new Map<string, number>();
		for (const t of todos) {
			const k = ymd(t.createdAt);
			map.set(k, (map.get(k) ?? 0) + 1);
		}
		return map;
	});
	/** 当月网格：补齐前导空格，按 7 列排布 */
	const calCells = $derived.by(() => {
		const first = new Date(calMonth);
		const year = first.getFullYear();
		const month = first.getMonth();
		const lead = new Date(year, month, 1).getDay();
		const days = new Date(year, month + 1, 0).getDate();
		const cells: { key: string; day: number; count: number; selected: boolean; today: boolean }[] = [];
		for (let i = 1; i <= days; i++) {
			const key = ymd(new Date(year, month, i).getTime());
			cells.push({
				key,
				day: i,
				count: dayCounts.get(key) ?? 0,
				selected: filterFrom === key && filterTo === key,
				today: key === todayKey
			});
		}
		return { lead, cells };
	});
	const calTitle = $derived(
		`${new Date(calMonth).getFullYear()} 年 ${new Date(calMonth).getMonth() + 1} 月`
	);
	function shiftMonth(delta: number) {
		const d = new Date(calMonth);
		calMonth = new Date(d.getFullYear(), d.getMonth() + delta, 1).getTime();
	}
	/** 点选某天：同一日期再点一次则取消筛选 */
	function pickDay(key: string) {
		if (filterFrom === key && filterTo === key) {
			filterFrom = '';
			filterTo = '';
			return;
		}
		filterFrom = key;
		filterTo = key;
	}

	/** 起止日期都有值时，把范围文本化展示在日历下方 */
	const rangeLabel = $derived.by(() => {
		if (!filterFrom && !filterTo) return '';
		const f = filterFrom || '不限';
		const t = filterTo || '不限';
		return `${f} ~ ${t}`;
	});

	const filtered = $derived(
		todos.filter((t) => {
			if (filterType !== 'all' && t.type !== filterType) return false;
			if (fromTs !== null && t.createdAt < fromTs) return false;
			if (toTs !== null && t.createdAt > toTs) return false;
			if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
			if (filterDone === 'open' && t.done) return false;
			if (filterDone === 'done' && !t.done) return false;
			return true;
		})
	);

	const hasFilter = $derived(
		filterType !== 'all' ||
			!!filterFrom ||
			!!filterTo ||
			filterPriority !== 'all' ||
			filterDone !== 'all'
	);

	function clearFilters() {
		filterType = 'all';
		filterFrom = '';
		filterTo = '';
		filterPriority = 'all';
		filterDone = 'all';
	}

	/** 相对时间描述 */
	function relTime(ts: number) {
		const d = Math.floor((Date.now() - ts) / DAY);
		const tr = get(t);
		if (d <= 0) return tr('tasks.today');
		if (d === 1) return tr('tasks.yesterday');
		return tr('tasks.daysAgo', { values: { days: d } });
	}

	/** 截止时间文案：把后端的 ISO 时间转成「今天 / 2 天」这类相对描述 */
	function relDue(iso: string): string {
		const due = new Date(iso).getTime();
		const days = Math.ceil((due - Date.now()) / DAY);
		const tr = get(t);
		if (days < 0) return tr('tasks.overdue');
		if (days === 0) return tr('tasks.today');
		if (days === 1) return tr('tasks.tomorrow');
		return tr('tasks.daysLater', { values: { days } });
	}

	/** 按创建时间倒序（最新在前） */
	const sorted = $derived([...filtered].sort((a, b) => b.createdAt - a.createdAt));

	// ===== 新建任务 =====
	let formOpen = $state(false);
	let formError = $state('');
	let submitting = $state(false);
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
			formError = $t('tasks.contentRequired');
			return;
		}
		submitting = true;
		formError = '';
		// 提交后端；失败时把后端的中文错误显示出来
		addTodo(nText, nType, nAuthor, nPriority)
			.then(() => {
				formOpen = false;
			})
			.catch((err: unknown) => {
				formError = err instanceof ApiError ? err.message : '创建失败，请稍后重试';
			})
			.finally(() => {
				submitting = false;
			});
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
			<span class="stat-label">{$t('tasks.allStat')}</span>
			<div class="stat-val">{stats.total}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">{$t('tasks.openStat')}</span>
			<div class="stat-val">{stats.open}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">{$t('tasks.highStat')}</span>
			<div class="stat-val hi">{stats.high}</div>
		</div>
		<div class="card stat">
			<span class="stat-label">{$t('tasks.resultStat')}</span>
			<div class="stat-val">{sorted.length}</div>
		</div>
	</section>

	<div class="split">
	<!-- 筛选栏 -->
	<section class="card filters">
		<div class="filter-row">
			<div class="fgroup">
				<span class="flabel">{$t('tasks.type')}</span>
				<div class="seg">
					<button class="seg-btn" class:active={filterType === 'all'} onclick={() => (filterType = 'all')}>
						{$t('common.all')}
					</button>
					{#each TODO_TYPES as ty}
						<button class="seg-btn" class:active={filterType === ty} onclick={() => (filterType = ty)}>
							{$t(TYPE_KEY[ty])}
						</button>
					{/each}
				</div>
			</div>

		</div>

		<div class="filter-row">
			<div class="fgroup">
				<span class="flabel">{$t('tasks.priority')}</span>
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
				<span class="flabel">{$t('tasks.status')}</span>
				<div class="seg">
					<button class="seg-btn" class:active={filterDone === 'all'} onclick={() => (filterDone = 'all')}>
						{$t('common.all')}
					</button>
					<button class="seg-btn" class:active={filterDone === 'open'} onclick={() => (filterDone = 'open')}>
						{$t('tasks.inProgress')}
					</button>
					<button class="seg-btn" class:active={filterDone === 'done'} onclick={() => (filterDone = 'done')}>
						{$t('tasks.done')}
					</button>
				</div>
			</div>

		</div>

		<!-- 日历：按创建日期区间筛选 -->
		<div class="calendar">
			<div class="cal-head">
				<span class="flabel">{$t('tasks.createdDate')}</span>
				{#if filterFrom || filterTo}
					<button class="cal-clear" onclick={() => { filterFrom = ''; filterTo = ''; }}>重置</button>
				{/if}
			</div>
			<div class="cal-fields">
				<div class="cal-bar">
					<button class="cal-nav" onclick={() => shiftMonth(-1)} aria-label="上个月">‹</button>
					<span class="cal-title">{calTitle}</span>
					<button class="cal-nav" onclick={() => shiftMonth(1)} aria-label="下个月">›</button>
				</div>

				<div class="cal-week">
					{#each ['日', '一', '二', '三', '四', '五', '六'] as w}
						<span>{w}</span>
					{/each}
				</div>

				<div class="cal-grid">
					{#each Array(calCells.lead) as _}
						<span class="cal-blank"></span>
					{/each}
					{#each calCells.cells as c (c.key)}
						<button
							class="cal-day"
							class:selected={c.selected}
							class:today={c.today}
							class:busy={c.count > 0}
							onclick={() => pickDay(c.key)}
							title={c.count > 0 ? `${c.count} 个任务` : '无任务'}
						>
							{c.day}
							{#if c.count > 0}<span class="cal-dot"></span>{/if}
						</button>
					{/each}
				</div>
			</div>
			<p class="cal-hint">
				{rangeLabel ? `已筛选：${rangeLabel}` : '点击日期筛选当天创建的任务，再点一次取消'}
			</p>
		</div>

		<!-- 筛选栏右下方：清除筛选 -->
		<div class="filters-foot">
			<button class="btn-ghost" onclick={clearFilters} disabled={!hasFilter}>{$t('tasks.clearFilters')}</button>
		</div>
	</section>

	<!-- 任务列表 -->
	<section class="card">
		<header class="card-head">
			<div>
				<h2>{$t('tasks.title')}</h2>
				<p class="sub">{$t('tasks.total', { values: { count: sorted.length } })}</p>
			</div>
			<button class="btn-primary" onclick={openForm}>{$t('tasks.newTask')}</button>
		</header>

		{#if sorted.length === 0}
			<p class="empty">{$t('tasks.noMatch')}</p>
		{:else}
			<ul class="todo-list">
				{#each sorted as todo (todo.id)}
					<li class="todo-item {todo.done ? 'done' : ''}">
						<label class="todo-check">
							<input
								type="checkbox"
								checked={todo.done}
								onchange={() => toggleTodo(todo.id)}
								aria-label={todo.text}
							/>
							<span class="todo-box" aria-hidden="true"></span>
						</label>
						<span class="prio {todo.priority}" title={$t('tasks.priority')}>
							{PRIO_LABEL[todo.priority]}
						</span>
						<span class="todo-text">{todo.text}</span>
						<span class="todo-meta">{relTime(todo.createdAt)}</span>
						{#if todo.dueAt}<span class="todo-due">{relDue(todo.dueAt)}</span>{/if}
						<span class="author">{todo.author}</span>
						<span class="tag {todoColor(todo.type)}">{$t(TYPE_KEY[todo.type])}</span>
						<button
							class="del"
							title="删除任务"
							aria-label="删除任务"
							onclick={() => removeTodo(todo.id)}
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
</div>

<!-- 新建任务抽屉 -->
{#if formOpen}
	<div class="backdrop" onclick={() => (formOpen = false)}></div>
	<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
		<header class="drawer-head">
			<div>
				<h2 id="task-form-title">{$t('tasks.newTask')}</h2>
				<p class="drawer-sub">{$t('projects.detailHint')}</p>
			</div>
			<button class="drawer-close" onclick={() => (formOpen = false)} aria-label="关闭">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitTask}>
			<label class="field">
				<span class="field-label">{$t('tasks.taskContent')}</span>
				<input class="input" type="text" bind:value={nText} placeholder={$t('tasks.taskContentPlaceholder')} />
			</label>

			<div class="field">
				<span class="field-label">{$t('tasks.type')}</span>
				<div class="chips">
					{#each TODO_TYPES as ty}
						<button
							type="button"
							class="chip"
							class:on={nType === ty}
							onclick={() => (nType = ty)}>{$t(TYPE_KEY[ty])}</button
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
				<button type="submit" class="btn-primary">{$t('tasks.createTask')}</button>
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

	/* ===== 左右布局：筛选在左，任务列表在右 ===== */
	.split {
		display: grid;
		grid-template-columns: minmax(320px, 1fr) minmax(420px, 1.6fr);
		gap: var(--space-4);
		align-items: start;
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

	/* ===== 日历（日期区间筛选） ===== */
	.calendar {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: var(--space-4);
		border-top: 1px solid var(--line);
	}
	.cal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.cal-clear {
		font-family: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		padding: 3px 8px;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.cal-clear:hover {
		color: var(--text-0);
	}
	.cal-fields {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.cal-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.cal-title {
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--text-0);
	}
	.cal-nav {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		font-family: inherit;
		font-size: 0.95rem;
		border: 1px solid var(--line);
		border-radius: 7px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
	}
	.cal-nav:hover {
		color: var(--text-0);
		border-color: var(--red-500);
	}
	.cal-week,
	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.cal-week span {
		text-align: center;
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.cal-blank {
		height: 42px;
	}
	.cal-day {
		position: relative;
		height: 42px;
		display: grid;
		place-items: center;
		font-family: inherit;
		font-size: 0.82rem;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--text-1);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.cal-day:hover {
		background: var(--bg-2);
		color: var(--text-0);
	}
	.cal-day.busy {
		font-weight: 700;
		color: var(--text-0);
	}
	.cal-day.today {
		border-color: var(--line);
	}
	.cal-day.selected {
		background: var(--red-600);
		color: #fff;
	}
	.cal-dot {
		position: absolute;
		bottom: 3px;
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--red-500);
	}
	.cal-day.selected .cal-dot {
		background: #fff;
	}
	.cal-hint {
		margin: 0;
		font-size: 0.72rem;
		color: var(--text-2);
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
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	/* 筛选栏底部：清除筛选靠右下 */
	.filters-foot {
		display: flex;
		justify-content: flex-end;
		padding-top: var(--space-2);
	}
	.filters-foot .btn-ghost:disabled {
		opacity: 0.45;
		cursor: not-allowed;
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
		.split {
			grid-template-columns: 1fr;
		}
	}
</style>
