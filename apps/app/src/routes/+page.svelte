<script lang="ts">
	import {
		projects as board,
		toggleProjectTask,
		todos,
		toggleTodo,
		MEMBERS,
		POST_TYPES,
		extractMentions,
		type ProjectItem,
		type PostType
	} from '$lib/stores/workspace.svelte';

	// 任务列表：与任务页共用同一份待办数据
	const runningCount = $derived(todos.filter((t) => !t.done).length);
	const doneCount = $derived(todos.filter((t) => t.done).length);

	// 顶部数据卡片：任务数来自待办清单，项目数来自项目面板
	const stats = $derived([
		{ label: '进行中的任务', value: String(runningCount), trend: '+6', up: true },
		{ label: '已完成', value: String(doneCount), trend: '+18%', up: true },
		{ label: '项目', value: String(board.length), trend: '+2', up: true },
		{ label: '平均专注时长', value: '4.2h', trend: '-8%', up: false }
	]);

	type ProjCard = ProjectItem;

	// 项目详情弹窗
	// 存项目名而不是对象引用，项目页改动后弹窗内容自动同步
	let activeLabel = $state<string | null>(null);
	const activeProj = $derived(board.find((p) => p.label === activeLabel) ?? null);

	function openProject(proj: ProjCard) {
		// 即将查看，清掉“有新任务”提示
		proj.unread = false;
		activeLabel = proj.label;
	}

	function closeProjectPopup() {
		activeLabel = null;
	}

	function toggleProjTask(proj: ProjCard, i: number) {
		toggleProjectTask(proj.label, i);
	}

	const activity = $state([
		{ who: 'T', name: 'TuneOasis', action: 'Tune Oasis 本地测试', time: '2026-9-9 42分钟前', color: '#06b6d4', project: 'Redcloud', type: 'report', mentions: [] },
		{ who: 'R', name: 'Fofow', action: 'RedStation 立项，@Mo 跟进前端', time: '2026-9-9 24分钟前', color: '#6366f1', project: 'RedStation', type: 'report', mentions: ['Mo'] },
		{ who: 'G', name: 'GameStorm', action: '今晚 22:00 服务端重启，请注意保存进度', time: '2026-9-9 2小时前', color: '#22c55e', project: '', type: 'notice', mentions: [] }
	]);

	// 优先级显示文案
	const PRIO_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' };

	// 发布动态：表单内容
	let draft = $state('');
	let draftVisible = $state('team');
	// 关联的项目（来自项目面板），空字符串表示不关联
	let draftProject = $state('');
	// 动态类型：工作汇报 / 通知
	let draftType = $state<PostType>('report');
	// @ 提及面板开关
	let mentionOpen = $state(false);

	// 发布者头像用的首字母、姓名与配色
	const AUTHOR = { who: 'F', name: 'Fofow', color: '#dc2626' };

	// 在光标处插入 @成员
	function insertMention(name: string) {
		const tag = '@' + name + ' ';
		const el = mentionInput as HTMLTextAreaElement | null;
		if (!el) {
			draft += tag;
			return;
		}
		const start = el.selectionStart ?? draft.length;
		const end = el.selectionEnd ?? draft.length;
		draft = draft.slice(0, start) + tag + draft.slice(end);
		mentionOpen = false;
		// 光标移到插入内容之后
		requestAnimationFrame(() => {
			el.focus();
			const pos = start + tag.length;
			el.setSelectionRange(pos, pos);
		});
	}

	let mentionInput = $state<HTMLTextAreaElement | null>(null);

	function publishActivity() {
		const text = draft.trim();
		if (!text) return;
		const d = new Date();
		// 新动态插到最前面，立即出现在「动态」里
		activity.unshift({
			who: AUTHOR.who,
			name: AUTHOR.name,
			action: text,
			time: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`,
			color: AUTHOR.color,
			project: draftProject,
			type: draftType,
			mentions: extractMentions(text)
		});
		draft = '';
		draftVisible = 'team';
		draftProject = '';
		draftType = 'report';
		mentionOpen = false;
		closeDrawer();
	}

	let drawerOpen = $state(false);
	let closingDrawer = $state(false);

	function openDrawer() {
		closingDrawer = false;
		drawerOpen = true;
	}

	function closeDrawer() {
		if (!drawerOpen || closingDrawer) return;
		// 先进入退出动画，动画结束后再真正移除，避免收起突兀
		closingDrawer = true;
		setTimeout(() => {
			closingDrawer = false;
			drawerOpen = false;
		}, 300);
	}
</script>

<div class="dash">
	<section class="hero card">
		<div class="hero-text">
			<span class="eyebrow">仪表盘 · Dashboard</span>
			<h1>下午好，开始今天的工作 ✦</h1>
			<p class="lead">
				你有 <b>{runningCount}</b> 个任务待办，<b>{doneCount}</b> 个已完成。
			</p>
			<div class="hero-actions">
				<a class="btn btn-primary" href="/tasks">查看今日任务</a>
				<a class="btn btn-ghost" href="/projects">浏览项目</a>
			</div>
		</div>
		<!-- 装饰区域 -->
		<div class="hero-art" aria-hidden="true">
			<div class="ring r1"></div>
			<div class="ring r2"></div>
			<div class="ring r3"></div>
			<span class="hero-glyph">R</span>
		</div>
	</section>

	<section class="stat-grid">
		{#each stats as s}
			<div class="card stat">
				<span class="stat-label">{s.label}</span>
				<div class="stat-val">{s.value}</div>
				<span class="trend" class:down={!s.up}>{s.up ? '▲' : '▼'} {s.trend} 较上周</span>
			</div>
		{/each}
	</section>

	<div class="row">
		<section class="card chart-card">
			<header class="card-head">
				<div>
					<h2>任务列表</h2>
					<p class="sub">全部项目任务 · 点击勾选完成</p>
				</div>
				<a class="link" href="/tasks">全部任务 →</a>
			</header>
			<div class="todo-list">
				{#each todos as todo, i}
					<label class="todo-item {todo.done ? 'done' : ''}">
						<input
							type="checkbox"
							checked={todo.done}
							onchange={() => toggleTodo(i)}
							aria-label={todo.text}
						/>
						<span class="todo-box" aria-hidden="true"></span>
						<span class="prio {todo.priority}" title="优先级">{PRIO_LABEL[todo.priority]}</span>
						<span class="todo-text">{todo.text}</span>
						{#if todo.due}<span class="todo-due">{todo.due}前</span>{/if}
						<span class="todo-author-sm">{todo.author}</span>
						<span class="todo-tag {todo.color}">{todo.type}</span>
					</label>
				{/each}
			</div>
		</section>

		<section class="card act-card">
			<header class="card-head">
				<div>
					<h2>动态</h2>
					<p class="sub">团队实时更新</p>
				</div>
				<button class="btn add-dyn" onclick={openDrawer}>
					<span class="plus" aria-hidden="true">+</span> 发布动态
				</button>
			</header>
			<ul class="act-list">
				<!-- 只展示最新的 4 条动态 -->
				{#each activity.slice(0, 4) as a}
					<li class="act-item">
						<span class="act-avatar" style="background:{a.color}">{a.who}</span>
						<div class="act-body">
							<div class="act-tags">
								<span class="act-type {a.type}">{a.type === 'notice' ? '通知' : '工作汇报'}</span>
								{#if a.project}
									<span class="act-proj">{a.project}</span>
								{/if}
							</div>
							<p>{a.action}</p>
							<div class="act-foot">
								<span class="act-time">{a.time}</span>
								<span class="act-name">{a.name}</span>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	</div>

	<section class="card board-section">
		<header class="card-head">
			<div>
				<h2>项目面板</h2>
				<p class="sub">你的工作侧重点</p>
			</div>
			<a class="link" href="/projects">全部项目 →</a>
		</header>
		<div class="board">
			{#each board as b}
				<button class="board-item" type="button" style="position:relative" onclick={() => openProject(b)}>
					{#if b.unread && b.tasks.length > 0}
						<span
							class="board-new"
							style="position:absolute;top:10px;right:10px;z-index:2;font-size:0.62rem;font-weight:800;letter-spacing:0.04em;color:#fff;background:linear-gradient(135deg,var(--red-500),var(--red-600));border-radius:6px;padding:2px 6px;box-shadow:0 4px 12px rgba(220,38,38,0.35)"
							>NEW</span
						>
					{/if}
					<span class="board-tag {b.color}">{b.tag}</span>
					<h3 class="board-title">{b.label}</h3>
					<div class="board-meta">
						<span class="mini-avatars"></span>
						<span class="board-count"
							>{b.tasks.length > 0 ? b.tasks.length + ' 项任务' : '暂无任务'}</span
						>
					</div>
				</button>
			{/each}
		</div>
	</section>

	<!-- 项目详情弹窗 -->
	{#if activeProj}
		<div class="proj-backdrop" onclick={closeProjectPopup}></div>
		<div class="proj-pop" role="dialog" aria-modal="true" aria-labelledby="proj-title">
			<button class="proj-close" onclick={closeProjectPopup} aria-label="关闭" title="返回">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>
			<div class="proj-pop-inner">
				<span class="board-tag {activeProj.color}">{activeProj.tag}</span>
				<h2 id="proj-title">{activeProj.label}</h2>
				<p class="proj-sub"
					>{activeProj.tasks && activeProj.tasks.length > 0
						? activeProj.tasks.length + ' 项具体任务'
						: '暂无排期'}
				</p>
				{#if activeProj.tasks && activeProj.tasks.length > 0}
					<ul class="todo-list proj-pt-list">
						{#each activeProj.tasks as task, ti}
							<li class="todo-item {task.done ? 'done' : ''}">
								<label class="todo-check">
									<input
										type="checkbox"
										checked={task.done}
										onchange={() => toggleProjTask(activeProj!, ti)}
										aria-label={task.title}
									/>
									<span class="todo-box" aria-hidden="true"></span>
								</label>
								<span class="todo-text">{task.title}</span>
								<span class="act-time">发布于 {task.date} · {task.ago}</span>
								<span class="todo-author">{task.author}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="proj-empty">暂无任务。</p>
				{/if}
			</div>
		</div>
	{/if}

	<!-- 发布动态抽屉 -->
	{#if drawerOpen}
		<div class="drawer-backdrop" class:closing={closingDrawer} onclick={closeDrawer}></div>
		<aside class="drawer" class:closing={closingDrawer} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
			<button class="drawer-close" onclick={closeDrawer} aria-label="返回" title="返回">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M15 18l-6-6 6-6" />
				</svg>
			</button>

			<div class="drawer-inner">
				<div class="form">
					<h2 id="drawer-title">发布一条动态</h2>
					<p class="form-sub">分享进展，用 @ 提及团队成员一起协作</p>

					<label class="field">
						<span class="field-label">内容 *</span>
						<textarea
							class="textarea"
							rows="6"
							maxlength="500"
							bind:this={mentionInput}
							bind:value={draft}
							placeholder="记录你刚刚完成的工作、遇到的挑战或下一步计划…"
						></textarea>
						<span class="count">{draft.length} / 500</span>
					</label>

					<div class="field">
						<span class="field-label">动态类型</span>
						<div class="seg">
							{#each POST_TYPES as t}
								<button
									class="seg-btn"
									class:active={draftType === t.value}
									type="button"
									onclick={() => (draftType = t.value)}>{t.label}</button
								>
							{/each}
						</div>
					</div>

					<div class="field">
						<div class="mention-bar">
							<span class="field-label">提及成员</span>
							<button
								class="mention-toggle"
								type="button"
								onclick={() => (mentionOpen = !mentionOpen)}
							>
								@ 选择成员
							</button>
						</div>
						{#if mentionOpen}
							<div class="mention-list">
								{#each MEMBERS() as m}
									<button
										class="mention-item"
										type="button"
										onclick={() => insertMention(m.name)}
									>
										<span class="mention-dot" style="background:{m.color}"></span>
										{m.name}
										<span class="mention-role">{m.role}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					<label class="field">
						<span class="field-label">关联项目（可选）</span>
						<select class="input select" bind:value={draftProject}>
							<option value="">不关联</option>
							{#each board as proj}
								<option value={proj.label}>{proj.label} · {proj.tag}</option>
							{/each}
						</select>
					</label>

					<div class="field">
						<span class="field-label">可见范围</span>
						<div class="seg">
							<button
								class="seg-btn"
								class:active={draftVisible === 'team'}
								type="button"
								onclick={() => (draftVisible = 'team')}>团队可见</button
							>
							<button
								class="seg-btn"
								class:active={draftVisible === 'private'}
								type="button"
								onclick={() => (draftVisible = 'private')}>仅自己</button
							>
						</div>
					</div>
				</div>
			</div>

			<footer class="drawer-foot">
				<button class="btn btn-ghost-foot" onclick={closeDrawer}>取消</button>
				<button class="btn btn-primary-foot" onclick={publishActivity} disabled={!draft.trim()}>
					发布动态
				</button>
			</footer>
		</aside>
	{/if}
</div>

<style>
	.dash {
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

	/* ===== Hero ===== */
	.hero {
		position: relative;
		overflow: hidden;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-5);
		padding: var(--space-6) var(--space-6);
		background:
			radial-gradient(1200px 400px at 15% -20%, rgba(220, 38, 38, 0.18), transparent 60%),
			var(--bg-1);
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--red-500);
	}
	.eyebrow::before {
		content: '';
		width: 14px;
		height: 2px;
		border-radius: 2px;
		background: var(--red-500);
	}
	.hero-text {
		max-width: 560px;
		z-index: 2;
	}
	.hero h1 {
		margin-top: 10px;
	}
	.lead {
		margin-top: 10px;
		color: var(--text-1);
		font-size: 1.02rem;
	}
	.lead b {
		color: var(--text-0);
	}
	.hero-actions {
		display: flex;
		gap: var(--space-3);
		margin-top: var(--space-5);
	}
	.btn {
		display: inline-flex;
		align-items: center;
		font-family: inherit;
		font-weight: 600;
		border-radius: 10px;
		cursor: pointer;
		padding: 10px 18px;
		font-size: 0.9rem;
	}
	.btn-primary {
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 20px rgba(220, 38, 38, 0.32);
	}
	.btn-primary:hover {
		filter: brightness(1.08);
		color: #fff;
	}
	.btn-ghost {
		border: 1px solid var(--line-strong);
		color: var(--text-0);
	}
	.btn-ghost:hover {
		background: var(--bg-2);
		border-color: var(--text-2);
		color: var(--text-0);
	}

	.hero-art {
		position: relative;
		width: 260px;
		height: 180px;
		flex: none;
		z-index: 1;
	}
	.ring {
		position: absolute;
		border-radius: 50%;
		border: 1px solid rgba(220, 38, 38, 0.35);
	}
	.r1 { inset: 0; animation: drift 8s ease-in-out infinite; }
	.r2 { inset: 28px; border-color: rgba(220, 38, 38, 0.22); animation: drift 8s ease-in-out -3s infinite; }
	.r3 { inset: 60px; border-color: rgba(238, 232, 232, 0.18); animation: drift 8s ease-in-out -6s infinite; }
	.hero-glyph {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 3.6rem;
		font-weight: 800;
		background: linear-gradient(135deg, #fff 10%, rgba(255, 255, 255, 0.35));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	@keyframes drift {
		0%, 100% { transform: translate(0, 0) scale(1); }
		50% { transform: translate(6px, -8px) scale(1.02); }
	}

	/* ===== Stats ===== */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-4);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--space-5);
	}
	.stat-label {
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.stat-val {
		font-size: 2.1rem;
		font-weight: 760;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.trend {
		font-size: 0.78rem;
		font-weight: 600;
		color: #34d399;
	}
	.trend.down {
		color: #f87171;
	}

	/* ===== content row ===== */
	.row {
		display: grid;
		grid-template-columns: 1.6fr 1fr;
		gap: var(--space-4);
	}
	.card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: var(--space-4);
	}
	.sub {
		color: var(--text-2);
		font-size: 0.83rem;
		margin-top: 2px;
	}
	.link {
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--red-500);
		white-space: nowrap;
	}

	.chips {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.chip {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--red-500);
	}

	/* ===== Todo List ===== */
	.todo-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.todo-item {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		cursor: pointer;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0, var(--bg-1));
		transition: background 0.15s ease, border-color 0.15s ease;
	}
	.todo-item:hover {
		border-color: var(--red-500);
	}
	/* 复选框：input 透明但可点，视觉由 .todo-box 承担 */
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
	/* 本周任务：原生 input 隐藏，只保留自定义的红色 .todo-box
	   （弹窗里的 .todo-check input 需要保持可点，故排除） */
	.todo-item > input[type='checkbox'] {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		padding: 0;
		opacity: 0;
		pointer-events: none;
	}
	.todo-box {
		flex: none;
		width: 18px;
		height: 18px;
		border: 2px solid var(--text-3, var(--line));
		border-radius: 5px;
		background: transparent;
		position: relative;
		transition: background 0.15s ease, border-color 0.15s ease;
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
	.todo-text {
		flex: 1;
		font-size: 0.9rem;
	}
	.todo-item.done .todo-text {
		color: var(--text-3);
		text-decoration: line-through;
	}
	.todo-due {
		flex: none;
		font-size: 0.72rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	/* 优先级小标 */
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
	/* 发布者（任务列表用） */
	.todo-author-sm {
		flex: none;
		font-size: 0.72rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.todo-tag {
		flex: none;
		font-size: 0.72rem;
		padding: 2px 8px;
		border-radius: 999px;
	}
	.todo-tag.violet { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
	.todo-tag.red { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	.todo-tag.amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
	.todo-tag.green { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.todo-tag.cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
	.todo-tag.pink { background: rgba(236, 72, 153, 0.15); color: #f472b6; }

	/* ===== Activity ===== */
	.act-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.act-item {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--line);
	}
	.act-item:last-child {
		border-bottom: none;
	}
	.act-avatar {
		width: 30px;
		height: 30px;
		flex: none;
		border-radius: 9px;
		display: grid;
		place-items: center;
		color: #fff;
		font-size: 0.8rem;
		font-weight: 700;
	}
	/* 动态正文容器：相对定位，便于把关联项目 tag 放到右上角 */
	.act-body {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.act-body p {
		font-size: 0.9rem;
		color: var(--text-1);
	}
	/* 类型 / 关联项目 tag 行，位于该条动态右上角 */
	.act-tags {
		position: absolute;
		top: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.act-proj,
	.act-type {
		font-size: 0.68rem;
		font-weight: 700;
		line-height: 1.4;
		padding: 1px 8px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.act-proj {
		color: #f87171;
		background: rgba(239, 68, 68, 0.15);
	}
	/* 工作汇报 / 通知 两种类型配色 */
	.act-type {
		color: #a78bfa;
		background: rgba(139, 92, 246, 0.15);
	}
	.act-type.notice {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.15);
	}
	/* @ 提及 */
	.mention-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.mention-toggle {
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 4px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
	}
	.mention-toggle:hover {
		color: #f87171;
		border-color: var(--red-500);
	}
	.mention-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.mention-role {
		font-size: 0.68rem;
		font-weight: 500;
		color: var(--text-2);
	}
	.mention-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.mention-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 5px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s, border-color 0.15s;
	}
	.mention-item:hover {
		color: var(--text-0);
		border-color: var(--text-2);
	}
	/* 底部行：左边时间，右下角汇报人 */
	.act-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.act-time {
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.act-name {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--text-1);
		white-space: nowrap;
	}
	.todo-author {
		flex: none;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--red-500);
	}

	/* ===== Board ===== */
	.board {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-4);
	}
	.board-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		width: 100%;
		gap: 8px;
		padding: var(--space-4);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		font-family: inherit;
		color: inherit;
		cursor: pointer;
		transition: border-color 0.15s, transform 0.15s;
	}
	.board-item:hover {
		border-color: var(--line-strong);
		transform: translateY(-2px);
	}
	.board-tag {
		align-self: flex-start;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 9px;
		border-radius: 20px;
	}
	.board-tag.violet { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
	.board-tag.red { background: rgba(239, 68, 68, 0.15); color: #f87171; }
	.board-tag.amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
	.board-tag.green { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.board-tag.cyan { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }
	.board-tag.pink { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
	.board-title {
		font-size: 1rem;
		font-weight: 650;
		color: var(--text-0);
	}
	.board-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: auto;
	}
	.board-count {
		font-size: 0.76rem;
		color: var(--text-2);
	}

	/* ===== 项目详情弹窗 ===== */
	.proj-backdrop {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgba(5, 5, 8, 0.6);
		backdrop-filter: blur(3px);
		animation: fade 0.2s ease;
	}
	.proj-pop {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 71;
		width: min(560px, calc(100vw - 40px));
		max-height: 80%;
		overflow: auto;
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
		animation: proj-pop-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes proj-pop-in {
		from {
			transform: translate(-50%, -46%);
			opacity: 0;
		}
	}
	.proj-pop-inner {
		padding: var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.proj-pop-inner .board-tag {
		align-self: flex-start;
	}
	.proj-pop h2 {
		font-size: 1.5rem;
		line-height: 1.2;
	}
	.proj-sub {
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.proj-close {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}
	.proj-close:hover {
		color: var(--text-0);
		border-color: var(--text-2);
	}
	.proj-close svg {
		width: 17px;
		height: 17px;
	}
	.proj-tasks {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin-top: var(--space-2);
		padding: 0;
		list-style: none;
	}
	.proj-tasks li {
		position: relative;
		padding: 10px 12px 10px 30px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		font-size: 0.9rem;
		color: var(--text-0);
	}
	.proj-tasks li::before {
		content: '';
		position: absolute;
		left: 13px;
		top: 50%;
		transform: translateY(-50%);
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--red-500);
	}
	.proj-empty {
		color: var(--text-2);
		font-size: 0.9rem;
		text-align: center;
		padding: var(--space-5);
	}

	/* ===== 发布动态按钮 ===== */
	.add-dyn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg-2);
		font-size: 0.84rem;
		white-space: nowrap;
		flex: none;
	}
	.add-dyn:hover {
		border-color: var(--accent);
		color: var(--text-0);
	}
	.plus {
		font-size: 1.05rem;
		line-height: 1;
		color: var(--accent);
	}

	/* ===== 抽屉 ===== */
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
		display: flex;
		flex-direction: column;
		width: min(520px, calc(100vw - 40px));
		height: 60%;
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		box-shadow: -30px 0 80px rgba(0, 0, 0, 0.45);
		overflow: hidden;
		animation: slide-in 0.25s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes fade {
		from { opacity: 0; }
	}
	@keyframes slide-in {
		from { transform: translate(30px, -50%); opacity: 0; }
	}
	.drawer-backdrop.closing {
		animation: fade-out 0.24s ease forwards;
	}
	.drawer.closing {
		animation: slide-out 0.26s cubic-bezier(0.4, 0, 0.6, 1) forwards;
	}
	@keyframes fade-out {
		to { opacity: 0; }
	}
	@keyframes slide-out {
		to { transform: translate(40px, -50%); opacity: 0; }
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
		flex: 1;
		overflow-y: auto;
		padding: var(--space-6) var(--space-6);
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding-right: 18px;
	}
	.form h2 {
		font-size: 1.3rem;
		line-height: 1.2;
		margin-bottom: 4px;
	}
	.form-sub {
		color: var(--text-2);
		font-size: 0.85rem;
		margin-bottom: var(--space-4);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.field-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-1);
	}
	.textarea {
		resize: vertical;
		min-height: 132px;
		padding: var(--space-3) var(--space-3);
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.9rem;
		line-height: 1.6;
		outline: none;
		transition: border-color 0.15s;
	}
	.textarea:focus {
		border-color: var(--accent);
	}
	.textarea::placeholder {
		color: var(--text-2);
	}
	.count {
		align-self: flex-end;
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.input {
		padding: 11px var(--space-3);
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.input:focus {
		border-color: var(--accent);
	}
	.input::placeholder {
		color: var(--text-2);
	}
	/* 关联项目下拉：沿用 .input 外观，补齐 select 原生样式 */
	.select {
		width: 100%;
		cursor: pointer;
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-position: calc(100% - 17px) 50%, calc(100% - 12px) 50%;
		background-size: 5px 5px, 5px 5px;
		background-repeat: no-repeat;
		padding-right: 32px;
	}
	.seg {
		display: flex;
		gap: var(--space-2);
	}
	.seg-btn {
		padding: 7px 16px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.seg-btn.active {
		background: var(--accent-soft);
		border-color: var(--accent);
		color: var(--red-500);
		font-weight: 600;
	}

	.drawer-foot {
		padding: var(--space-4) var(--space-6);
		border-top: 1px solid var(--line);
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		background: var(--bg-2);
	}
	.btn-ghost-foot,
	.btn-primary-foot {
		padding: 9px 20px;
		border-radius: 10px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.btn-ghost-foot {
		background: transparent;
		border: 1px solid var(--line-strong);
		color: var(--text-1);
	}
	.btn-ghost-foot:hover {
		color: var(--text-0);
		border-color: var(--text-2);
	}
	.btn-primary-foot {
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 4px 16px rgba(220, 38, 38, 0.3);
	}
	.btn-primary-foot:hover {
		filter: brightness(1.08);
	}
	.btn-primary-foot:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		filter: none;
		box-shadow: none;
	}

	/* responsive */
	@media (max-width: 1024px) {
		.stat-grid { grid-template-columns: repeat(2, 1fr); }
		.row { grid-template-columns: 1fr; }
		.board { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 620px) {
		.hero-art { display: none; }
		.stat-grid { grid-template-columns: 1fr; }
		.board { grid-template-columns: 1fr; }
	}
</style>
