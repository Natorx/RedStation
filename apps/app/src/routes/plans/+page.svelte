<script lang="ts">
	import {
		PLANS,
		loadPlans,
		addPlan,
		updatePlan,
		removePlan,
		addPlanStep,
		updatePlanStep,
		removePlanStep
	} from '$lib/stores/workspace.svelte';
	import { ApiError, type ApiPlan, type ApiStepStatus } from '$lib/api/client';
	import { t } from '$lib/i18n';

	/** 计划列表（后端数据） */
	const plans = $derived(PLANS());

	// ===== 筛选 =====
	let filterState = $state<'all' | 'active' | 'paused'>('all');
	const shown = $derived(
		plans.filter((p) => {
			if (filterState === 'active') return p.active;
			if (filterState === 'paused') return !p.active;
			return true;
		})
	);

	const totalSteps = $derived(plans.reduce((n, p) => n + p.stepTotal, 0));
	const doneSteps = $derived(plans.reduce((n, p) => n + p.stepDone, 0));

	/** 步骤状态的中文标签与配色 */
/** 步骤状态标签，随语言切换 */
	const STATUS_LABEL = $derived({
		todo: $t('plans.statusTodo'),
		doing: $t('plans.statusDoing'),
		done: $t('plans.statusDone')
	} as Record<ApiStepStatus, string>);
	/** 点击节点时按 todo → doing → done → todo 循环切换 */
	const STATUS_CYCLE: ApiStepStatus[] = ['todo', 'doing', 'done'];

	// ===== 新建计划 =====
	let formOpen = $state(false);
	let formError = $state('');
	let submitting = $state(false);
	let nTitle = $state('');
	let nGoal = $state('');
	/** 初始步骤：一行一个 */
	let nSteps = $state('');

	function openForm() {
		nTitle = '';
		nGoal = '';
		nSteps = '';
		formError = '';
		formOpen = true;
	}

	async function submitPlan(e: SubmitEvent) {
		e.preventDefault();
		if (!nTitle.trim()) {
			formError = $t('plans.planNameRequired');
			return;
		}
		submitting = true;
		formError = '';
		try {
			await addPlan({
				title: nTitle,
				goal: nGoal,
				steps: nSteps.split('\n')
			});
			formOpen = false;
		} catch (err) {
			formError = err instanceof ApiError ? err.message : '保存失败，请稍后重试';
		} finally {
			submitting = false;
		}
	}

	// ===== 步骤操作 =====
	/** 记录每个计划正在输入的步骤标题 */
	let stepDraft = $state<Record<number, string>>({});
	let stepError = $state<Record<number, string>>({});
	/** 正在编辑标题的步骤 id */
	let editingStepId = $state<number | null>(null);
	let editingTitle = $state('');

	async function submitStep(e: SubmitEvent, planId: number) {
		e.preventDefault();
		const title = (stepDraft[planId] ?? '').trim();
		if (!title) return;
		try {
			await addPlanStep(planId, title);
			stepDraft[planId] = '';
			stepError[planId] = '';
		} catch (err) {
			stepError[planId] = err instanceof ApiError ? err.message : $t('plans.stepAddFailed');
		}
	}

	/** 点节点切换状态：待开始 → 进行中 → 已完成 → 待开始 */
	async function cycleStep(stepId: number, current: ApiStepStatus) {
		const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
		try {
			await updatePlanStep(stepId, { status: next });
		} catch {
			// 状态切换失败不打断页面，保持原状态
		}
	}

	function startEdit(stepId: number, title: string) {
		editingStepId = stepId;
		editingTitle = title;
	}

	async function saveEdit(stepId: number) {
		const title = editingTitle.trim();
		editingStepId = null;
		if (!title) return;
		try {
			await updatePlanStep(stepId, { title });
		} catch {
			// 编辑失败时保留后端原值
		}
	}

	async function delStep(stepId: number) {
		try {
			await removePlanStep(stepId);
		} catch {
			// 忽略：步骤可能已被其他端删除
		}
	}

	// ===== 计划操作 =====
	async function toggleActive(p: ApiPlan) {
		try {
			await updatePlan(p.id, { active: !p.active });
		} catch {
			// 启停失败保持原状态
		}
	}

	/** 删除确认弹窗 */
	let confirmId = $state<number | null>(null);
	const confirmTarget = $derived(plans.find((p) => p.id === confirmId) ?? null);
	let deleting = $state(false);
	let deleteError = $state('');

	async function doDelete(id: number) {
		deleting = true;
		deleteError = '';
		try {
			await removePlan(id);
			confirmId = null;
		} catch (err) {
			deleteError = err instanceof ApiError ? err.message : '删除失败，请稍后重试';
		} finally {
			deleting = false;
		}
	}

	// 进入页面拉取规划数据
	$effect(() => {
		loadPlans();
	});
</script>

<div class="plans-page">
	<header class="page-head">
		<div>
			<h1>{$t('plans.title')}</h1>
			<p class="sub">
				{$t('plans.subtitle', { values: { count: plans.length, done: doneSteps, total: totalSteps } })}
			</p>
		</div>
		<div class="head-actions">
			<div class="seg">
				<button class="seg-btn" class:active={filterState === 'all'} onclick={() => (filterState = 'all')}>
					{$t('plans.filterAll')}
				</button>
				<button
					class="seg-btn"
					class:active={filterState === 'active'}
					onclick={() => (filterState = 'active')}>{$t('plans.filterActive')}</button
				>
				<button
					class="seg-btn"
					class:active={filterState === 'paused'}
					onclick={() => (filterState = 'paused')}>{$t('plans.filterPaused')}</button
				>
			</div>
			<button class="btn-primary" onclick={openForm}>{$t('plans.newPlan')}</button>
		</div>
	</header>

	{#if shown.length === 0}
		<section class="card empty-card">
			<p class="empty">
				{plans.length === 0 ? $t('plans.empty') : $t('plans.emptyFiltered')}
			</p>
		</section>
	{:else}
		{#each shown as plan (plan.id)}
			<section class="card plan-card" class:paused={!plan.active}>
				<header class="plan-head">
					<div class="plan-title-wrap">
						<h2 class="plan-title">{plan.title}</h2>
						<span class="state-tag" class:on={plan.active}>
							{plan.active ? $t('plans.active') : $t('plans.paused')}
						</span>
						{#if plan.owner}<span class="owner">{$t('plans.owner')} {plan.owner}</span>{/if}
					</div>
					<div class="plan-actions">
						<span class="progress">{$t('plans.steps', { values: { done: plan.stepDone, total: plan.stepTotal } })}</span>
						<button class="btn-mini" onclick={() => toggleActive(plan)}>
							{plan.active ? $t('plans.pause') : $t('plans.resume')}
						</button>
						<button class="btn-danger" onclick={() => (confirmId = plan.id)}>{$t('common.delete')}</button>
					</div>
				</header>

				{#if plan.goal}<p class="plan-goal">{plan.goal}</p>{/if}

				<!-- 横向流程图 -->
				<div class="flow-wrap">
					{#if plan.steps.length === 0}
						<p class="empty">{$t('plans.noSteps')}</p>
					{:else}
						<ol class="flow">
							{#each plan.steps as step, i (step.id)}
								{#if i > 0}
									<li class="flow-arrow" aria-hidden="true">→</li>
								{/if}
								<li class="node {step.status}">
									<button
										class="node-btn"
										title="{$t('plans.statusHint', { values: { status: STATUS_LABEL[step.status] } })}"
										onclick={() => cycleStep(step.id, step.status)}
									>
										<span class="node-idx">{i + 1}</span>
										{#if editingStepId === step.id}
											<input
												class="node-input"
												bind:value={editingTitle}
												onclick={(e) => e.stopPropagation()}
												onblur={() => saveEdit(step.id)}
												onkeydown={(e) => {
													if (e.key === 'Enter') saveEdit(step.id);
													if (e.key === 'Escape') editingStepId = null;
												}}
											/>
										{:else}
											<span class="node-text">{step.title}</span>
										{/if}
										<span class="node-status">{STATUS_LABEL[step.status]}</span>
									</button>
									<div class="node-tools">
										<button
											class="tool"
											title={$t('plans.editStep')}
											aria-label={$t('plans.editStep')}
											onclick={() => startEdit(step.id, step.title)}>✎</button
										>
										<button
											class="tool"
											title={$t('plans.deleteStep')}
											aria-label={$t('plans.deleteStep')}
											onclick={() => delStep(step.id)}>×</button
										>
									</div>
								</li>
							{/each}
						</ol>
					{/if}
				</div>

				<form class="add-step" onsubmit={(e) => submitStep(e, plan.id)}>
					<input
						class="input"
						placeholder={$t('plans.addStepPlaceholder')}
						bind:value={stepDraft[plan.id]}
					/>
					<button type="submit" class="btn-ghost">{$t('plans.addStep')}</button>
					{#if stepError[plan.id]}<span class="err">{stepError[plan.id]}</span>{/if}
				</form>
			</section>
		{/each}
	{/if}
</div>

<!-- 新建计划抽屉 -->
{#if formOpen}
	<div class="backdrop" onclick={() => (formOpen = false)}></div>
	<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="plan-form-title">
		<header class="drawer-head">
			<div>
				<h2 id="plan-form-title">{$t('plans.newPlanTitle')}</h2>
				<p class="drawer-sub">{$t('plans.newPlanHint')}</p>
			</div>
			<button class="drawer-close" onclick={() => (formOpen = false)} aria-label="关闭">✕</button>
		</header>

		<form class="drawer-body" onsubmit={submitPlan}>
			<label class="field">
				<span class="field-label">{$t('plans.planName')}</span>
				<input class="input" bind:value={nTitle} placeholder={$t('plans.planNamePlaceholder')} />
			</label>

			<label class="field">
				<span class="field-label">{$t('plans.goal')}</span>
				<input class="input" bind:value={nGoal} placeholder={$t('plans.goalPlaceholder')} />
			</label>

			<label class="field">
				<span class="field-label">{$t('plans.initialSteps')}</span>
				<textarea
					class="input textarea"
					rows="5"
					bind:value={nSteps}
					placeholder={'需求梳理\n后端建模\n前端流程图'}
				></textarea>
			</label>

			{#if formError}<p class="form-error">{formError}</p>{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn-ghost" onclick={() => (formOpen = false)}>{$t('common.cancel')}</button>
				<button type="submit" class="btn-primary" disabled={submitting}>
					{submitting ? $t('common.creating') : $t('plans.createPlan')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 删除确认弹窗（屏幕居中） -->
{#if confirmId !== null && confirmTarget}
	<div class="modal-backdrop" onclick={() => !deleting && (confirmId = null)} role="presentation"
	></div>
	<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-modal-title">
		<h3 id="del-modal-title" class="modal-title">{$t('plans.deleteTitle')}</h3>
		<p class="modal-text">
			{$t('plans.deleteBody', { values: { name: confirmTarget.title, count: confirmTarget.stepTotal } })}
		</p>
		{#if deleteError}<p class="form-error">{deleteError}</p>{/if}
		<div class="modal-actions">
			<button class="btn-ghost" onclick={() => (confirmId = null)} disabled={deleting}>{$t('common.cancel')}</button>
			<button class="btn-danger on" onclick={() => doDelete(confirmTarget.id)} disabled={deleting}>
				{deleting ? $t('common.deleting') : $t('projects.confirmDelete')}
			</button>
		</div>
	</div>
{/if}

<style>
	.plans-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.page-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.page-head h1 {
		font-size: 1.4rem;
	}
	.sub {
		margin-top: 4px;
		font-size: 0.82rem;
		color: var(--text-2);
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
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
	}
	.seg-btn.active {
		color: #fff;
		background: var(--red-600);
	}

	.card {
		background: var(--bg-1);
		border: 1px solid var(--line);
		border-radius: var(--radius-lg);
		padding: var(--space-5);
	}
	.empty-card .empty,
	.flow-wrap .empty {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	/* ===== 计划卡片 ===== */
	.plan-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.plan-card.paused {
		opacity: 0.72;
	}
	.plan-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.plan-title-wrap {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.plan-title {
		font-size: 1.08rem;
	}
	.state-tag {
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--bg-2);
		color: var(--text-2);
	}
	.state-tag.on {
		background: rgba(52, 211, 153, 0.16);
		color: #34d399;
	}
	.owner {
		font-size: 0.74rem;
		color: var(--text-2);
	}
	.plan-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.progress {
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.plan-goal {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-1);
	}

	/* ===== 横向流程图 ===== */
	.flow-wrap {
		overflow-x: auto;
		padding-bottom: 6px;
	}
	.flow {
		display: flex;
		align-items: stretch;
		gap: 0;
		list-style: none;
		margin: 0;
		padding: 0;
		min-width: min-content;
	}
	.flow-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 34px;
		color: var(--text-2);
		font-size: 1.1rem;
		user-select: none;
	}
	.node {
		position: relative;
		flex: none;
		width: 180px;
	}
	.node-btn {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		width: 100%;
		height: 100%;
		min-height: 84px;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
		font-family: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
	}
	.node-btn:hover {
		border-color: var(--line-strong);
	}
	.node.todo .node-btn {
		border-style: dashed;
	}
	.node.doing .node-btn {
		border-color: var(--red-500);
		background: var(--accent-soft, rgba(220, 38, 38, 0.1));
	}
	.node.done .node-btn {
		border-color: rgba(52, 211, 153, 0.5);
		background: rgba(52, 211, 153, 0.1);
	}
	.node-idx {
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--text-2);
	}
	.node-text {
		font-size: 0.86rem;
		font-weight: 650;
		color: var(--text-0);
		line-height: 1.35;
		word-break: break-word;
	}
	.node.done .node-text {
		text-decoration: line-through;
		color: var(--text-2);
	}
	.node-status {
		margin-top: auto;
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.node.doing .node-status {
		color: #f87171;
	}
	.node.done .node-status {
		color: #34d399;
	}
	.node-input {
		width: 100%;
		font-family: inherit;
		font-size: 0.86rem;
		padding: 3px 5px;
		border: 1px solid var(--red-500);
		border-radius: 6px;
		background: var(--bg-0);
		color: var(--text-0);
	}
	.node-tools {
		position: absolute;
		top: -8px;
		right: -8px;
		display: flex;
		gap: 4px;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.node:hover .node-tools {
		opacity: 1;
	}
	.tool {
		width: 20px;
		height: 20px;
		display: grid;
		place-items: center;
		font-family: inherit;
		font-size: 0.78rem;
		line-height: 1;
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: var(--bg-1);
		color: var(--text-2);
		cursor: pointer;
	}
	.tool:hover {
		color: #f87171;
		border-color: rgba(239, 68, 68, 0.5);
	}

	/* ===== 添加步骤 ===== */
	.add-step {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.add-step .input {
		flex: 1;
		max-width: 320px;
	}
	.err {
		font-size: 0.76rem;
		color: #f87171;
	}

	/* ===== 按钮 ===== */
	.btn-primary,
	.btn-ghost,
	.btn-mini,
	.btn-danger {
		font-family: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		border-radius: 9px;
	}
	.btn-primary {
		font-size: 0.82rem;
		padding: 8px 14px;
		border: none;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
	}
	.btn-ghost {
		font-size: 0.8rem;
		padding: 8px 12px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-0);
	}
	.btn-mini {
		font-size: 0.74rem;
		padding: 4px 10px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--text-1);
	}
	.btn-mini:hover {
		color: var(--text-0);
	}
	.btn-danger {
		font-size: 0.74rem;
		padding: 4px 10px;
		border: 1px solid rgba(239, 68, 68, 0.5);
		background: transparent;
		color: #f87171;
	}
	.btn-danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.14);
	}
	.btn-danger.on {
		background: var(--red-600);
		border-color: var(--red-600);
		color: #fff;
	}
	.btn-primary:disabled,
	.btn-ghost:disabled,
	.btn-danger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ===== 输入 ===== */
	.input {
		width: 100%;
		padding: 9px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-0);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.86rem;
	}
	.input:focus {
		outline: none;
		border-color: var(--red-500);
	}
	.textarea {
		resize: vertical;
		line-height: 1.6;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.form-error {
		margin: 0;
		font-size: 0.8rem;
		color: #f87171;
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
		border-left: 1px solid var(--line);
		box-shadow: -18px 0 50px rgba(0, 0, 0, 0.4);
	}
	.drawer-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5);
		border-bottom: 1px solid var(--line);
	}
	.drawer-head h2 {
		font-size: 1.15rem;
	}
	.drawer-sub {
		margin-top: 4px;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.drawer-close {
		flex: none;
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.drawer-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
		overflow-y: auto;
	}
	.drawer-foot {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: auto;
	}

	/* ===== 删除确认弹窗 ===== */
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

	@media (max-width: 900px) {
		.node {
			width: 150px;
		}
	}
</style>
