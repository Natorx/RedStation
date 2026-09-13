<script lang="ts">
	import {
		PROJECTS,
		addProject,
		updateProject,
		addProjectTask,
		toggleProjectTask,
		removeProjectTask,
		updateProjectTask,
		removeProject,
		markProjectRead,
		STACK_OPTIONS,
		UI_OPTIONS,
		COLOR_OPTIONS,
		type ProjectUI
	} from '$lib/stores/workspace.svelte';
	import { ApiError, TASK_CATEGORIES, type ApiProject, type ApiProjectTask, type ApiTaskCategory } from '$lib/api/client';

	/** 项目列表（后端数据） */
	const projects = $derived(PROJECTS());

	// 当前选中的项目
	// 用 id 定位：改名后仍能正确跟随，也不会与其它项目混淆
	let activeId = $state<number | null>(null);
	let newTask = $state('');
	/** 新任务的类别，默认「功能」 */
	let newCategory = $state<ApiTaskCategory>('功能');
	let inputEl = $state<HTMLInputElement | null>(null);
	let taskError = $state('');
	let addingTask = $state(false);

	/** 当前项目：优先用选中的 id，未选中时回落到第一个 */
	const active = $derived(projects.find((p) => p.id === activeId) ?? projects[0] ?? null);

	const totalTasks = $derived(projects.reduce((n, p) => n + p.tasks.length, 0));
	const doneTasks = $derived(
		projects.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0)
	);

	function selectProject(p: ApiProject) {
		// 打开即清除未读角标（同步到后端）
		markProjectRead(p.id);
		activeId = p.id;
	}

	function submitTask(e: SubmitEvent) {
		e.preventDefault();
		if (!active || addingTask) return;
		if (!newTask.trim()) return;
		addingTask = true;
		taskError = '';
		addProjectTask(active.id, newTask, newCategory)
			.then(() => {
				newTask = '';
				newCategory = '功能';
				inputEl?.focus();
			})
			.catch((err: unknown) => {
				taskError = err instanceof ApiError ? err.message : '添加失败，请稍后重试';
			})
			.finally(() => {
				addingTask = false;
			});
	}

	// ===== 项目表单（新建 / 编辑共用）=====
	// ===== 任务行内编辑 =====
	/** 正在编辑的任务 id；null 表示没有任务处于编辑态 */
	let editingTaskId = $state<number | null>(null);
	let editTitle = $state('');
	let editCategory = $state<ApiTaskCategory>('功能');
	let editError = $state('');
	let savingTask = $state(false);

	function startEditTask(task: ApiProjectTask) {
		editingTaskId = task.id;
		editTitle = task.title;
		editCategory = task.category;
		editError = '';
	}

	function cancelEditTask() {
		editingTaskId = null;
		editError = '';
	}

	/** 保存标题与类别；发布时间由后端保留，不会被改动 */
	async function saveEditTask(taskId: number) {
		const title = editTitle.trim();
		if (!title) {
			editError = '任务标题不能为空';
			return;
		}
		savingTask = true;
		editError = '';
		try {
			await updateProjectTask(taskId, { title, category: editCategory });
			editingTaskId = null;
		} catch (err) {
			editError = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
		} finally {
			savingTask = false;
		}
	}

	let formOpen = $state(false);
	let formError = $state('');
	// 正在编辑的项目名；null 表示新建
	// 正在编辑的项目 id；null 表示新建
	let editingId = $state<number | null>(null);
	// 保存中标记，避免重复提交
	let saving = $state(false);

	const formTitle = $derived(editingId !== null ? '编辑项目' : '新建项目');
	const formSubmitText = $derived(editingId !== null ? '保存修改' : '创建项目');

	let fLabel = $state('');
	let fTag = $state('');
	let fUi = $state<ProjectUI>('GUI');
	let fPurpose = $state('');
	let fIntro = $state('');
	let fStack = $state<string[]>([]);
	let fFramework = $state('');
	let fFrameworks = $state<string[]>([]);
	let fDeployed = $state(false);
	// 运行端口，如 3010；多个用逗号分隔
	let fRunPort = $state('');
	let fColor = $state('red');

	function resetForm() {
		fLabel = '';
		fTag = '';
		fUi = 'GUI';
		fPurpose = '';
		fIntro = '';
		fStack = [];
		fFramework = '';
		fFrameworks = [];
		fDeployed = false;
		fRunPort = '';
		fColor = 'red';
		formError = '';
	}

	function openForm() {
		resetForm();
		editingId = null;
		formOpen = true;
	}

	// 用已有项目的数据打开表单
	function openEdit(p: ApiProject) {
		fLabel = p.label;
		fTag = p.tag;
		fUi = p.ui as ProjectUI;
		fPurpose = p.purpose;
		fIntro = p.intro;
		fStack = [...p.stack];
		fFramework = '';
		fFrameworks = [...p.frameworks];
		fDeployed = p.deployed;
		fRunPort = p.runPort ?? '';
		fColor = p.color;
		formError = '';
		editingId = p.id;
		detailOpen = false;
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
		editingId = null;
		resetForm();
	}

	function toggleStack(lang: string) {
		fStack = fStack.includes(lang) ? fStack.filter((s) => s !== lang) : [...fStack, lang];
	}

	function commitFramework() {
		const v = fFramework.trim();
		if (!v || fFrameworks.includes(v)) {
			fFramework = '';
			return;
		}
		fFrameworks = [...fFrameworks, v];
		fFramework = '';
	}

	function onFrameworkKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			commitFramework();
		} else if (e.key === 'Backspace' && !fFramework && fFrameworks.length) {
			fFrameworks = fFrameworks.slice(0, -1);
		}
	}

	function removeFramework(f: string) {
		fFrameworks = fFrameworks.filter((x) => x !== f);
	}

	/** 新建或保存项目；重名等业务错误由后端返回中文文案 */
	async function submitProject(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		const label = fLabel.trim();
		if (!label) {
			formError = '请填写项目名';
			return;
		}
		// 输入框里还没回车的框架一并收进来
		const frameworks = [...fFrameworks];
		const pending = fFramework.trim();
		if (pending && !frameworks.includes(pending)) frameworks.push(pending);

		const payload = {
			label,
			tag: fTag,
			color: fColor,
			ui: fUi,
			purpose: fPurpose,
			intro: fIntro,
			stack: fStack,
			frameworks,
			deployed: fDeployed,
			runPort: fRunPort.trim(),
			// 编辑时沿用原发起人；新建时留空，由后端记为当前登录用户
			owner: editingId !== null ? (PROJECTS().find((p) => p.id === editingId)?.owner ?? '') : ''
		};

		saving = true;
		formError = '';
		try {
			if (editingId !== null) {
				const updated = await updateProject(editingId, payload);
				// 改名后仍按 id 选中，不会因为名字变化而跳走
				activeId = updated.id;
			} else {
				const created = await addProject(payload);
				activeId = created.id;
			}
			closeForm();
		} catch (err) {
			formError = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
		} finally {
			saving = false;
		}
	}

	// ===== 项目详情抽屉 =====
	let detailOpen = $state(false);
	let closingDetail = $state(false);
	let detailId = $state<number | null>(null);
	const detail = $derived(projects.find((p) => p.id === detailId) ?? null);

	function openDetail(p: ApiProject) {
		// 打开详情即清除未读角标（同步后端）
		markProjectRead(p.id);
		detailId = p.id;
		closingDetail = false;
		detailOpen = true;
	}

	// ===== 删除项目 =====
	/** 待确认删除的项目 id；null 表示未处于确认态 */
	let confirmDeleteId = $state<number | null>(null);
	let deleting = $state(false);
	let deleteError = $state('');

	/** 删除确认弹窗要展示的项目；null 表示弹窗关闭 */
	const deleteTarget = $derived(projects.find((p) => p.id === confirmDeleteId) ?? null);

	function askDelete(id: number) {
		// 左列表点删除时同步打开该项目的详情抽屉，确认条统一在抽屉内展示
		const p = projects.find((x) => x.id === id);
		if (p && (!detailOpen || detailId !== id)) openDetail(p);
		confirmDeleteId = id;
		deleteError = '';
	}

	function cancelDelete() {
		confirmDeleteId = null;
		deleteError = '';
	}

	async function doDelete(id: number) {
		deleting = true;
		deleteError = '';
		try {
			await removeProject(id);
			confirmDeleteId = null;
			// 删的是当前详情项时关掉抽屉；选中项失效则清空，由 active 回落到第一个
			if (detailId === id) closeDetail();
			if (activeId === id) activeId = null;
		} catch (err) {
			deleteError = err instanceof ApiError ? err.message : '删除失败，请稍后重试';
		} finally {
			deleting = false;
		}
	}

	function closeDetail() {
		if (!detailOpen || closingDetail) return;
		closingDetail = true;
		setTimeout(() => {
			closingDetail = false;
			detailOpen = false;
			detailId = null;
		}, 300);
	}
</script>

<div class="proj-page">
	<!-- 左侧：项目列表 -->
	<aside class="proj-side card">
		<header class="side-head">
			<div class="side-title-row">
				<h2>项目</h2>
				<button class="btn-mini" onclick={openForm} title="新建项目">+ 新建</button>
			</div>
			<p class="side-sub">{projects.length} 个项目 · {totalTasks} 项任务</p>
		</header>

		<ul class="proj-list">
			{#each projects as p (p.label)}
				<li>
					<button
						type="button"
						class="proj-row"
						class:active={active?.label === p.label}
						onclick={() => selectProject(p)}
					>
						<span class="proj-row-top">
							<span class="proj-name">{p.label}</span>
							{#if p.unread && p.tasks.length > 0}
								<span class="dot-new" title="有新任务"></span>
							{/if}
						</span>
						<span
							class="row-del"
							role="button"
							tabindex="0"
							title="删除项目"
							aria-label={`删除项目 ${p.label}`}
							onclick={(e) => {
								e.stopPropagation();
								askDelete(p.id);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									askDelete(p.id);
								}
							}}
						>×</span>
						<span class="proj-row-bottom">
							<span class="board-tag {p.color}">{p.tag}</span>
							<span class="proj-count">{p.tasks.length} 项</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</aside>

	<!-- 右侧：任务面板 -->
	<div class="main-split" class:detail-open={detailOpen && !!detail}>
	<section class="proj-main card">
		{#if active}
			<header class="main-head">
				<div>
					<span class="board-tag {active.color}">{active.tag}</span>
					<h2>{active.label}</h2>
					<p class="main-sub">
						{active.tasks.length > 0
							? `${active.tasks.length} 项任务 · ${active.tasks.filter((t) => t.done).length} 项已完成`
							: '暂无任务，添加第一条吧'}
					</p>
				</div>
				<button class="link-btn" onclick={() => (detailOpen ? closeDetail() : openDetail(active))}>
					{detailOpen ? '收起详情 ←' : '查看项目详情 →'}
				</button>
			</header>

			<form class="add-row" onsubmit={submitTask}>
				<input
					bind:this={inputEl}
					class="input"
					type="text"
					bind:value={newTask}
					placeholder="添加任务，回车确认…"
					aria-label="新任务名称"
				/>
				<select
					class="cat-select"
					bind:value={newCategory}
					aria-label="任务类别"
					title="任务类别"
				>
					{#each TASK_CATEGORIES as c}
						<option value={c}>{c}</option>
					{/each}
				</select>
				<button class="btn btn-primary" type="submit">添加任务</button>
			</form>

			{#if active.tasks.length > 0}
				<ul class="todo-list">
					{#each active.tasks as task (task.id)}
						<li class="todo-item {task.done ? 'done' : ''}">
							<label class="todo-check">
								<input
									type="checkbox"
									checked={task.done}
									onchange={() => toggleProjectTask(task.id)}
									aria-label={task.title}
								/>
								<span class="todo-box" aria-hidden="true"></span>
							</label>

							{#if editingTaskId === task.id}
								<!-- 编辑态：改标题与类别，发布时间只读保留 -->
								<div class="task-edit">
									<input
										class="input edit-title"
										bind:value={editTitle}
										placeholder="任务标题"
										aria-label="任务标题"
										onkeydown={(e) => {
											if (e.key === 'Enter') saveEditTask(task.id);
											if (e.key === 'Escape') cancelEditTask();
										}}
									/>
									<select
										class="cat-select"
										bind:value={editCategory}
										aria-label="任务类别"
										title="任务类别"
									>
										{#each TASK_CATEGORIES as c}
											<option value={c}>{c}</option>
										{/each}
									</select>
									<span class="act-time">发布于 {task.date} · {task.ago}</span>
									{#if editError}<span class="task-edit-err">{editError}</span>{/if}
									<div class="task-edit-actions">
										<button
											type="button"
											class="btn-mini"
											onclick={cancelEditTask}
											disabled={savingTask}>取消</button
										>
										<button
											type="button"
											class="btn btn-primary btn-save"
											onclick={() => saveEditTask(task.id)}
											disabled={savingTask}
										>
											{savingTask ? '保存中…' : '保存'}
										</button>
									</div>
								</div>
							{:else}
								<!-- 展示态：点标题或类别即可进入编辑 -->
								<button
									type="button"
									class="task-main"
									title="点击编辑标题与类别"
									onclick={() => startEditTask(task)}
								>
									<span class="todo-text">{task.title}</span>
									<span class="cat-tag">{task.category}</span>
								</button>
								<span class="act-time">发布于 {task.date} · {task.ago}</span>
								<span class="todo-author">{task.author}</span>
								<button
									type="button"
									class="del"
									title="删除任务"
									aria-label="删除任务"
									onclick={() => removeProjectTask(task.id)}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M18 6L6 18M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-tip">该项目还没有任务，用上方输入框添加。</p>
			{/if}

			<footer class="main-foot">
				共 {totalTasks} 项任务，已完成 {doneTasks} 项 · 与「概览」页数据实时同步
			</footer>
		{/if}
	</section>

	<!-- 右栏详情卡片：占右栏一半宽度，任务列表相应收窄 -->
	{#if detailOpen && detail}
		<aside class="detail-card card" aria-labelledby="detail-title">
			<header class="detail-head">
				<div>
					<span class="board-tag {detail.color}">{detail.tag}</span>
					<h2 id="detail-title">{detail.label}</h2>
					<p class="detail-sub">{detail.purpose || '未填写用途'}</p>
				</div>
				<button class="detail-close" onclick={closeDetail} aria-label="收起详情">✕</button>
			</header>

			<div class="detail-actions">
				<button class="btn-edit" onclick={() => openEdit(detail)}>编辑项目</button>
				<button class="btn-danger" onclick={() => askDelete(detail.id)}>删除</button>
			</div>

			<div class="meta-grid">
				<div class="meta">
					<span class="meta-k">UI 形式</span>
					<span class="meta-v">{detail.ui}</span>
				</div>
				<div class="meta">
					<span class="meta-k">服务器部署</span>
					<span class="meta-v" class:yes={detail.deployed}>{detail.deployed ? 'Yes' : 'No'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">运行端口</span>
					<span class="meta-v" class:yes={!!detail.runPort}>{detail.runPort || '—'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">发起人</span>
					<span class="meta-v">{detail.owner || '—'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">任务数</span>
					<span class="meta-v"
						>{detail.tasks.filter((t) => t.done).length}/{detail.tasks.length}</span
					>
				</div>
			</div>

			<div class="field">
				<span class="field-label">用途</span>
				<p class="detail-text">{detail.purpose || '—'}</p>
			</div>

			<div class="field">
				<span class="field-label">介绍</span>
				<p class="detail-text">{detail.intro || '—'}</p>
			</div>

			<div class="field">
				<span class="field-label">技术栈</span>
				<div class="chips">
					{#each detail.stack as s}
						<span class="chip on">{s}</span>
					{:else}
						<span class="detail-text">—</span>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field-label">框架</span>
				<div class="chips">
					{#each detail.frameworks as f}
						<span class="chip on">{f}</span>
					{:else}
						<span class="detail-text">—</span>
					{/each}
				</div>
			</div>
		</aside>
	{/if}
	</div>
</div>

<!-- 新建项目抽屉 -->
{#if formOpen}
	<div class="backdrop" onclick={closeForm}></div>
	<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="form-title">
		<header class="drawer-head">
			<div>
				<h2 id="form-title">{formTitle}</h2>
				<p class="drawer-sub">
					{editingId
						? '修改项目信息，保存后立即生效'
						: '填写项目基本信息，创建后即可添加任务'}
				</p>
			</div>
			<button class="drawer-close" onclick={closeForm} aria-label="关闭">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12" />
				</svg>
			</button>
		</header>

		<form class="drawer-body" onsubmit={submitProject}>
			<div class="grid-2">
				<label class="field">
					<span class="field-label">项目名 *</span>
					<input class="input" type="text" bind:value={fLabel} placeholder="例如 RedStation" />
				</label>
				<label class="field">
					<span class="field-label">标签</span>
					<input class="input" type="text" bind:value={fTag} placeholder="例如 工作台" />
				</label>
			</div>

			<label class="field">
				<span class="field-label">UI 形式</span>
				<select class="input select" bind:value={fUi}>
					{#each UI_OPTIONS as u}
						<option value={u}>{u}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span class="field-label">用途</span>
				<input class="input" type="text" bind:value={fPurpose} placeholder="一句话说明这个项目做什么" />
			</label>

			<label class="field">
				<span class="field-label">介绍</span>
				<textarea class="textarea" rows="4" bind:value={fIntro} placeholder="项目背景、目标与范围…"
				></textarea>
			</label>

			<div class="field">
				<span class="field-label">技术栈（可多选）</span>
				<div class="chips">
					{#each STACK_OPTIONS as lang}
						<button
							type="button"
							class="chip"
							class:on={fStack.includes(lang)}
							onclick={() => toggleStack(lang)}>{lang}</button
						>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field-label">框架（可输入多个，回车确认）</span>
				<input
					class="input"
					type="text"
					bind:value={fFramework}
					onkeydown={onFrameworkKey}
					onblur={commitFramework}
					placeholder="例如 SvelteKit，输入后按回车"
				/>
				{#if fFrameworks.length}
					<div class="chips tag-chips">
						{#each fFrameworks as fw}
							<span class="chip on tag-chip">
								{fw}
								<button
									type="button"
									class="chip-x"
									aria-label={`移除 ${fw}`}
									onclick={() => removeFramework(fw)}>×</button
								>
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="grid-2">
				<label class="field">
					<span class="field-label">是否服务器部署</span>
					<select class="input select" bind:value={fDeployed}>
						<option value={false}>No</option>
						<option value={true}>Yes</option>
					</select>
				</label>
				<label class="field">
					<span class="field-label">标签配色</span>
					<select class="input select" bind:value={fColor}>
						{#each COLOR_OPTIONS as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</label>
			</div>

			<label class="field">
				<span class="field-label">运行端口</span>
				<input
					class="input"
					type="text"
					bind:value={fRunPort}
					placeholder="如 3010；多个用逗号分隔，如 3010,3011"
				/>
			</label>

			{#if formError}
				<p class="form-error">{formError}</p>
			{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn btn-ghost" onclick={closeForm}>取消</button>
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? '保存中…' : formSubmitText}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 删除确认弹窗（屏幕居中） -->
{#if confirmDeleteId !== null && deleteTarget}
	<div
		class="modal-backdrop"
		onclick={() => !deleting && cancelDelete()}
		role="presentation"
	></div>
	<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-modal-title">
		<h3 id="del-modal-title" class="modal-title">删除项目？</h3>
		<p class="modal-text">
			确定删除「<strong>{deleteTarget.label}</strong>」？该项目的 {deleteTarget.tasks.length} 条任务会一并删除，且不可恢复。
		</p>
		{#if deleteError}<p class="form-error">{deleteError}</p>{/if}
		<div class="modal-actions">
			<button class="btn-ghost" onclick={cancelDelete} disabled={deleting}>取消</button>
			<button class="btn-danger on" onclick={() => doDelete(deleteTarget.id)} disabled={deleting}>
				{deleting ? '删除中…' : '确认删除'}
			</button>
		</div>
	</div>
{/if}

<style>
	.proj-page {
		display: grid;
		grid-template-columns: 280px 1fr;
		gap: var(--space-4);
		align-items: start;
	}

	.card {
		background: var(--bg-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}

	/* ===== 左栏 ===== */
	.proj-side {
		position: sticky;
		top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.side-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.side-head h2 {
		font-size: 1.05rem;
	}
	.btn-mini {
		font-family: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		padding: 4px 10px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s, border-color 0.15s;
	}
	.btn-mini:hover {
		color: #fff;
		border-color: var(--red-500);
		background: var(--accent-soft);
	}
	.side-sub {
		margin-top: 6px;
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.proj-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.proj-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		font-family: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	.proj-row:hover {
		border-color: var(--line-strong);
	}
	.proj-row.active {
		border-color: var(--red-500);
		background: var(--accent-soft);
	}
	.proj-row-top {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	/* 悬停行才出现的删除入口 */
	.row-del {
		position: absolute;
		top: 6px;
		right: 8px;
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		font-size: 0.95rem;
		line-height: 1;
		border-radius: 6px;
		color: var(--text-2);
		opacity: 0;
		cursor: pointer;
		transition: opacity 0.15s, color 0.15s, background 0.15s;
	}
	.proj-row {
		position: relative;
	}
	.proj-row:hover .row-del {
		opacity: 1;
	}
	.row-del:hover {
		color: #f87171;
		background: rgba(239, 68, 68, 0.14);
	}
	.proj-name {
		font-size: 0.92rem;
		font-weight: 650;
		color: var(--text-0);
	}
	.dot-new {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--red-500);
		box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.18);
	}
	.proj-row-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.proj-count {
		font-size: 0.74rem;
		color: var(--text-2);
	}

	.board-tag {
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

	/* ===== 右栏 ===== */
	/* 详情打开时右栏一分为二：任务列表在左，详情卡在右 */
	.main-split {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-4);
		align-items: start;
	}
	.main-split.detail-open {
		grid-template-columns: minmax(0, 1fr) minmax(260px, 0.55fr);
	}
	.proj-main {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-height: 420px;
		min-width: 0;
	}
	.main-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.main-head h2 {
		margin-top: 6px;
		font-size: 1.35rem;
	}
	.main-sub {
		margin-top: 2px;
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.link-btn {
		flex: none;
		font-family: inherit;
		font-size: 0.82rem;
		color: var(--text-1);
		background: transparent;
		border: none;
		cursor: pointer;
		padding: 0;
	}
	.link-btn:hover {
		color: var(--red-500);
	}

	.add-row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	/* 类别下拉：宽度固定，不被输入框挤掉 */
	.cat-select {
		flex: none;
		width: 104px;
		padding: 10px 26px 10px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background-color: var(--bg-0);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.84rem;
		cursor: pointer;
		appearance: none;
		background-image: linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
		background-size: 5px 5px, 5px 5px;
		background-repeat: no-repeat;
	}
	.cat-select:focus {
		outline: none;
		border-color: var(--red-500);
	}
	/* 任务类别标签 */
	.cat-tag {
		flex: none;
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg-2);
		color: var(--text-2);
		white-space: nowrap;
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
	/* 添加任务行里：输入框占据剩余宽度，类别下拉与按钮保持自身宽度 */
	.add-row .input {
		flex: 1 1 auto;
		min-width: 0;
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
	.textarea {
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.88rem;
		resize: vertical;
	}
	.textarea:focus {
		outline: none;
		border-color: var(--red-500);
	}
	.btn {
		font-family: inherit;
		font-weight: 600;
		border-radius: 10px;
		cursor: pointer;
		padding: 10px 18px;
		font-size: 0.88rem;
		border: none;
		white-space: nowrap;
	}
	.btn-primary {
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		box-shadow: 0 6px 20px rgba(220, 38, 38, 0.32);
	}
	.btn-primary:hover {
		filter: brightness(1.08);
	}
	.btn-ghost {
		background: transparent;
		border: 1px solid var(--line-strong);
		color: var(--text-0);
	}
	.btn-ghost:hover {
		border-color: var(--text-2);
	}

	/* ===== 删除项目 ===== */
	.btn-danger {
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 6px 12px;
		border: 1px solid rgba(239, 68, 68, 0.5);
		border-radius: 9px;
		background: transparent;
		color: #f87171;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s, color 0.15s;
	}
	.btn-danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.14);
	}
	.btn-danger.on {
		background: var(--red-600);
		border-color: var(--red-600);
		color: #fff;
	}
	.btn-danger.on:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.btn-danger:disabled,
	.btn-ghost:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	/* 删除确认弹窗：固定在屏幕中心 */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 90;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(2px);
	}
	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 91;
		width: min(420px, calc(100vw - 32px));
		padding: var(--space-5);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		background: var(--bg-1);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
	}
	.modal-title {
		margin: 0;
		font-size: 1.05rem;
		color: var(--text-0);
	}
	.modal-text {
		margin: var(--space-3) 0 0;
		font-size: 0.86rem;
		color: var(--text-1);
		line-height: 1.6;
	}
	.modal-text strong {
		color: var(--text-0);
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-5);
	}

	/* 任务清单 */
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
		transition: background 0.15s ease, border-color 0.15s ease;
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
	/* 任务行：点标题/类别进入编辑的可点区域 */
	.task-main {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
		padding: 2px 6px;
		margin-left: -6px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		font-family: inherit;
		text-align: left;
		cursor: pointer;
	}
	.task-main:hover {
		border-color: var(--line);
		background: var(--bg-2);
	}
	/* 编辑态 */
	.task-edit {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-width: 0;
		flex-wrap: wrap;
	}
	.task-edit .edit-title {
		flex: 1 1 180px;
		min-width: 0;
		padding: 6px 10px;
		font-size: 0.85rem;
	}
	.task-edit .cat-select {
		padding: 6px 26px 6px 10px;
		font-size: 0.8rem;
		width: 96px;
	}
	.task-edit-err {
		font-size: 0.74rem;
		color: #f87171;
	}
	.task-edit-actions {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	.task-edit-actions .btn-save {
		padding: 5px 12px;
		font-size: 0.76rem;
	}
	.act-time {
		flex: none;
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.todo-author {
		flex: none;
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--red-500);
	}
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
		transition: color 0.15s, border-color 0.15s;
	}
	.del:hover {
		color: var(--red-500);
		border-color: var(--red-500);
	}
	.del svg {
		width: 13px;
		height: 13px;
	}

	.empty-tip {
		padding: var(--space-6) var(--space-4);
		text-align: center;
		color: var(--text-2);
		font-size: 0.88rem;
	}
	.main-foot {
		margin-top: auto;
		padding-top: var(--space-3);
		border-top: 1px solid var(--line);
		font-size: 0.76rem;
		color: var(--text-2);
	}

	/* ===== 抽屉 ===== */
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(5, 5, 8, 0.58);
		backdrop-filter: blur(3px);
		animation: fade 0.2s ease;
	}
	@keyframes fade {
		from { opacity: 0; }
	}
	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 81;
		width: min(520px, 100vw);
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
	.drawer.closing {
		animation: slide-out 0.3s ease forwards;
	}
	@keyframes slide-out {
		to { transform: translateX(24px); opacity: 0; }
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
		margin-top: 6px;
		font-size: 1.3rem;
	}
	.drawer-sub {
		margin-top: 4px;
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.head-actions {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.btn-edit {
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 6px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s, border-color 0.15s;
	}
	.btn-edit:hover {
		color: #f87171;
		border-color: var(--red-500);
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
		border-color: var(--text-2);
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
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-1);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tag-chips {
		margin-top: 6px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: inherit;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 5px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-1);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	.chip:hover {
		border-color: var(--text-2);
		color: var(--text-0);
	}
	.chip.on {
		border-color: var(--red-500);
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
	}
	.chip.tag-chip {
		cursor: default;
	}
	.chip-x {
		border: none;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0 0 2px;
	}
	.form-error {
		font-size: 0.8rem;
		color: #f87171;
	}
	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding-top: var(--space-2);
		margin-top: auto;
	}

	/* ===== 详情 ===== */
	.meta-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-3);
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.meta-k {
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.meta-v {
		font-size: 0.9rem;
		font-weight: 650;
		color: var(--text-0);
	}
	.meta-v.yes {
		color: #34d399;
	}
	.detail-text {
		font-size: 0.88rem;
		color: var(--text-1);
		line-height: 1.65;
		margin: 0;
		white-space: pre-wrap;
	}

	/* ===== 右栏详情卡 ===== */
	.detail-card {
		position: sticky;
		top: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		min-width: 0;
		animation: detail-in 0.22s ease;
	}
	@keyframes detail-in {
		from {
			opacity: 0;
			transform: translateX(12px);
		}
	}
	.detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.detail-head h2 {
		margin-top: 6px;
		font-size: 1.15rem;
	}
	.detail-sub {
		margin-top: 4px;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.detail-close {
		flex: none;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.detail-close:hover {
		color: var(--text-0);
		border-color: var(--line-strong);
	}
	.detail-actions {
		display: flex;
		gap: var(--space-2);
	}
	/* 详情卡变窄后，元信息从三列改为两列，避免文字被挤断 */
	.detail-card .meta-grid {
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-2);
	}

	@media (max-width: 900px) {
		.proj-page {
			grid-template-columns: 1fr;
		}
		.proj-side {
			position: static;
		}
		.main-split.detail-open {
			grid-template-columns: 1fr;
		}
		.detail-card {
			position: static;
		}
		.grid-2,
		.meta-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
