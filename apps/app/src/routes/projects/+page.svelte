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
		loadHostingStatus,
		uploadProjectFolder,
		hostingDownloadUrl,
		STACK_OPTIONS,
		UI_OPTIONS,
		COLOR_OPTIONS,
		PROJECT_INVITES,
		loadProjectInvites,
		reviewProjectInvite,
		inviteProjectMember,
		cancelProjectInvite,
		removeProjectMember,
		ME,
		TEAMMATES,
		loadTeammates,
		type ProjectUI
	} from '$lib/stores/workspace.svelte';
	import {
		ApiError,
		TASK_CATEGORIES,
		type ApiHostingStatus,
		type ApiProject,
		type ApiProjectMember,
		type ApiProjectTask,
		type ApiTaskCategory
	} from '$lib/api/client';
	import { t } from '$lib/i18n';

	/** 任务类别 -> i18n 键：存储值仍是中文，仅展示层翻译 */
	const CAT_KEY: Record<string, string> = {
		功能: 'taskCategory.功能',
		新模块: 'taskCategory.新模块',
		优化: 'taskCategory.优化',
		UI: 'taskCategory.UI',
		运维: 'taskCategory.运维',
		设计: 'taskCategory.设计'
	};


// ===== 项目邀请 =====
	/** 我收到的项目邀请 */
	const myInvites = $derived(PROJECT_INVITES());

	/** 邀请下拉的候选：只能邀请与我同团队的人，并排除已在项目内的 */
	const inviteCandidates = $derived(TEAMMATES().filter((m) => !inProjectIds.has(m.id)));
	const pendingInvites = $derived(myInvites.filter((i) => i.status === 'pending'));
	/** 邀请处理中，避免重复点击 */
	let inviteBusy = $state<number | null>(null);
	let inviteError = $state('');

	/** 回应邀请：同意后我进入该项目成员列表 */
	async function respondInvite(id: number, action: 'accept' | 'reject') {
		inviteBusy = id;
		inviteError = '';
		try {
			await reviewProjectInvite(id, action);
		} catch (err) {
			inviteError = err instanceof ApiError ? err.message : $t('common.failed');
		} finally {
			inviteBusy = null;
		}
	}

	// ===== 邀请成员（仅发起人） =====
	let inviteOpen = $state(false);
	let inviteTargetId = $state<number | null>(null);
	let inviteMessage = $state('');
	let inviteSending = $state(false);
	let inviteFormError = $state('');
	let inviteOk = $state('');

	function openInvite() {
		inviteFormError = '';
		inviteOk = '';
		inviteTargetId = inviteCandidates[0]?.id ?? null;
		inviteMessage = '';
		inviteOpen = true;
	}

	function closeInvite() {
		inviteOpen = false;
	}

	async function submitInvite(e: SubmitEvent) {
		e.preventDefault();
		if (!active || inviteSending) return;
		if (!inviteTargetId) {
			inviteFormError = $t('projects.invitePickUser');
			return;
		}
		inviteSending = true;
		inviteFormError = '';
		try {
			await inviteProjectMember(active.id, {
				userId: inviteTargetId,
				message: inviteMessage.trim()
			});
			inviteOk = $t('projects.inviteSent');
			inviteMessage = '';
			// 已邀请的人从候选里去掉
			inviteTargetId = inviteCandidates.find((m) => m.id !== inviteTargetId)?.id ?? null;
		} catch (err) {
			inviteFormError = err instanceof ApiError ? err.message : $t('common.failed');
		} finally {
			inviteSending = false;
		}
	}

	/** 成员头像上的文字：优先 initials，否则取名字首字 */
	function memberInitials(m: ApiProjectMember) {
		return (m.initials?.trim() || m.name.slice(0, 1)).toUpperCase();
	}

	async function kickMember(userId: number) {
		if (!active) return;
		inviteError = '';
		try {
			await removeProjectMember(active.id, userId);
		} catch (err) {
			inviteError = err instanceof ApiError ? err.message : $t('common.failed');
		}
	}

	/** 项目列表（后端数据） */
	const projects = $derived(PROJECTS());


	/**
	 * 从完整 URL 取主机名用于链接文案。
	 * 详情卡片宽度有限，贴完整地址会换行挤乱 meta 网格；
	 * 解析失败就退回原文，不至于把链接吞掉。
	 */
	function hostOf(url: string): string {
		try {
			return new URL(url).host;
		} catch {
			return url;
		}
	}

	// ===== 代码托管 =====

	/** 当前打开项目的托管状态；null 表示还没查到 */
	let hosting = $state<ApiHostingStatus | null>(null);
	/** 状态请求是否在途，避免重复拉取 */
	let hostingLoading = $state(false);
	/** 上传阶段：idle 空闲 / packing 打包中 / uploading 上传中 */
	let hostingPhase = $state<'idle' | 'packing' | 'uploading'>('idle');
	/** 上传结果或错误的一句话提示 */
	let hostingMsg = $state('');
	let hostingOk = $state(true);
	/** 文件夹选择框 */
	let folderInput = $state<HTMLInputElement | null>(null);
	/** 已加载状态的项目 id，切换项目时判断是否需要重新拉取 */
	let hostingFor = $state<number | null>(null);

	/** 字节数转可读体积 */
	function humanSize(bytes: number): string {
		if (!bytes) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let v = bytes;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i += 1;
		}
		return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
	}

	/** ISO 时间 -> 相对时间文案 */
	function humanAgo(iso: string): string {
		const then = new Date(iso).getTime();
		if (Number.isNaN(then)) return iso;
		const min = Math.floor((Date.now() - then) / 60000);
		if (min < 1) return $t('projects.hostingJustNow');
		if (min < 60) return $t('projects.hostingMinutesAgo', { values: { n: min } });
		const hour = Math.floor(min / 60);
		if (hour < 24) return $t('projects.hostingHoursAgo', { values: { n: hour } });
		const day = Math.floor(hour / 24);
		if (day === 1) return $t('projects.hostingYesterday');
		return $t('projects.hostingDaysAgo', { values: { n: day } });
	}

	/** 详情卡右侧那句话：已托管显示上次上传时间，否则提示未托管 */
	const hostingText = $derived.by(() => {
		if (!hosting?.hosted || !hosting.lastUploadedAt) return $t('projects.hostingNever');
		const when = humanAgo(hosting.lastUploadedAt);
		return hosting.lastUploader
			? $t('projects.hostingLastBy', { values: { time: when, who: hosting.lastUploader } })
			: $t('projects.hostingLast', { values: { time: when } });
	});

	const hostingBusy = $derived(hostingPhase !== 'idle');

	/** 拉取托管状态；失败静默（详情卡退回「未托管代码」提示） */
	async function refreshHosting(projectId: number) {
		if (hostingFor === projectId && hosting) return;
		hostingLoading = true;
		try {
			hosting = await loadHostingStatus(projectId);
			hostingFor = projectId;
		} catch {
			hosting = null;
			hostingFor = null;
		} finally {
			hostingLoading = false;
		}
	}

	/** 把选中的文件夹读成 { path, data } 列表 */
	async function readFolder(files: FileList): Promise<{ path: string; data: Uint8Array }[]> {
		const out: { path: string; data: Uint8Array }[] = [];
		for (const file of Array.from(files)) {
			const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
			out.push({ path: rel, data: new Uint8Array(await file.arrayBuffer()) });
		}
		return out;
	}

	/** 点击「上传代码」：打开文件夹选择框 */
	function pickFolder(projectId: number) {
		hostingFor = projectId;
		hostingMsg = '';
		// 复用同一个 input：每次点击先清空 value，否则选同一个文件夹不会触发 change
		if (folderInput) folderInput.value = '';
		folderInput?.click();
	}

	/** 选择文件夹后：打包 + 上传 */
	async function onFolderPicked(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const projectId = hostingFor;
		const files = input.files;
		if (!projectId || !files || files.length === 0) return;

		hostingPhase = 'packing';
		hostingMsg = $t('projects.hostingPicking');
		hostingOk = true;
		try {
			const list = await readFolder(files);
			hostingPhase = 'uploading';
			hostingMsg = $t('projects.hostingUploading');
			const result = await uploadProjectFolder(projectId, list);
			hosting = result.status;
			hostingFor = projectId;
			hostingOk = true;
			hostingMsg = $t(result.replaced ? 'projects.hostingReplaced' : 'projects.hostingUploaded', {
				values: { files: result.fileCount, size: humanSize(result.totalBytes) }
			});
		} catch (err) {
			hostingOk = false;
			hostingMsg = err instanceof ApiError ? err.message : $t('common.failed');
		} finally {
			hostingPhase = 'idle';
			input.value = '';
		}
	}

	/**
	 * 下载托管代码。
	 * 用 location.assign 直接走浏览器下载：比 window.open 新标签更可靠
	 * （弹窗拦截器不会拦同页跳转，下载流也不会留一个空白页）。
	 */
	function downloadHosting(projectId: number) {
		window.location.assign(hostingDownloadUrl(projectId));
	}

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

	/** 已在该项目里的成员 id，邀请下拉里排除 */
	const inProjectIds = $derived(new Set((active?.members ?? []).map((m) => m.userId)));

	/** 我是否是当前项目的发起人 */
	const amOwner = $derived(active?.myRole === 'owner');

	/** 当前项目仍在等待对方回应的邀请 */
	const activeInvites = $derived(
		myInvites.filter((i) => i.projectId === active?.id && i.status === 'pending')
	);

	// 进入页面拉一次邀请；登录后只触发一次，避免自触发循环
	let invitesLoadedFor = $state<number | null>(null);
	$effect(() => {
		const me = ME();
		if (!me) return;
		if (invitesLoadedFor === me.id) return;
		invitesLoadedFor = me.id;
		// 邀请候选只能来自同团队，进页面时一并拉取
		loadProjectInvites();
		loadTeammates();
	});

	// ===== 任务筛选（二级：先按完成状态，再按时间）=====
	/** 一级：完成状态 */
	let taskFilterDone = $state<'all' | 'open' | 'done'>('all');
	/** 二级：时间范围 */
	let taskFilterTime = $state<'all' | '7d' | '30d' | 'today'>('all');

	/** 相对今天的起始时间戳，null 表示不限 */
	const taskTimeFrom = $derived.by(() => {
		const DAY = 24 * 60 * 60 * 1000;
		const now = Date.now();
		if (taskFilterTime === 'today') {
			const d = new Date();
			d.setHours(0, 0, 0, 0);
			return d.getTime();
		}
		if (taskFilterTime === '7d') return now - 7 * DAY;
		if (taskFilterTime === '30d') return now - 30 * DAY;
		return null;
	});

	/**
	 * 套用两级筛选后的任务列表。
	 *
	 * 时间是「距今 N 天内」的滑动窗口，而不是自然日切分——
	 * 任务只有 createdAt 时间戳，用滑动窗口不必处理时区与跨天边界。
	 */
	function filterTasks(list: ApiProjectTask[]): ApiProjectTask[] {
		return list.filter((t) => {
			if (taskFilterDone === 'open' && t.done) return false;
			if (taskFilterDone === 'done' && !t.done) return false;
			if (taskTimeFrom !== null && new Date(t.createdAt).getTime() < taskTimeFrom) return false;
			return true;
		});
	}

	const activeTasks = $derived(active ? filterTasks(active.tasks) : []);
	const taskFiltered = $derived(
		taskFilterDone !== 'all' || taskFilterTime !== 'all'
	);

	function clearTaskFilters() {
		taskFilterDone = 'all';
		taskFilterTime = 'all';
	}

	const totalTasks = $derived(projects.reduce((n, p) => n + p.tasks.length, 0));
	const doneTasks = $derived(
		projects.reduce((n, p) => n + p.tasks.filter((t) => t.done).length, 0)
	);

	function selectProject(p: ApiProject) {
		// 打开即清除未读角标（同步到后端）
		markProjectRead(p.id);
		activeId = p.id;
		// 详情抽屉已展开时跟随切换到新选中的项目，避免右侧仍停留旧项目
		if (detailOpen) openDetail(p);
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
				taskError = err instanceof ApiError ? err.message : $t('common.failed');
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
			editError = $t('projects.taskTitleRequired');
			return;
		}
		savingTask = true;
		editError = '';
		try {
			await updateProjectTask(taskId, { title, category: editCategory });
			editingTaskId = null;
		} catch (err) {
			editError = err instanceof ApiError ? err.message : $t('common.failed');
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

	const formTitle = $derived(editingId !== null ? $t('projects.editProject') : $t('projects.newProject'));
	const formSubmitText = $derived(editingId !== null ? $t('projects.submitSave') : $t('projects.submitCreate'));

	let fLabel = $state('');
	let fTag = $state('');
	let fUi = $state<ProjectUI>('GUI');
	let fPurpose = $state('');
	let fIntro = $state('');
	let fStack = $state<string[]>([]);
	let fFramework = $state('');
	let fFrameworks = $state<string[]>([]);
	let fDeployed = $state(false);
	/** 项目在服务器上的部署路径 */
	let fDeployPath = $state('');
	/** 项目线上地址 */
	let fProjectUrl = $state('');
	/** 代码仓库地址 */
	let fRepoUrl = $state('');
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
		fDeployPath = '';
		fRunPort = '';
		fProjectUrl = '';
		fRepoUrl = '';
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
		fDeployPath = p.deployPath ?? '';
		fRunPort = p.runPort ?? '';
		fProjectUrl = p.projectUrl ?? '';
		fRepoUrl = p.repoUrl ?? '';
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
			formError = $t('projects.labelRequired');
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
			deployPath: fDeployPath.trim(),
			runPort: fRunPort.trim(),
			projectUrl: fProjectUrl.trim(),
			repoUrl: fRepoUrl.trim(),
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
			formError = err instanceof ApiError ? err.message : $t('common.failed');
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
		// 切换目标项目时取消正在进行的关闭动画，否则延迟回调会把刚打开的抽屉关掉
		closingDetail = false;
		// 打开详情即清除未读角标（同步后端）
		markProjectRead(p.id);
		// 顺带刷新代码托管状态（上次上传时间要在详情里显示）
		void refreshHosting(p.id);
		detailId = p.id;
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
			deleteError = err instanceof ApiError ? err.message : $t('common.failed');
		} finally {
			deleting = false;
		}
	}

	function closeDetail() {
		if (!detailOpen || closingDetail) return;
		closingDetail = true;
		// 关闭动画期间若又打开了别的项目（openDetail 会重置 closingDetail），
		// 这里的延迟回调必须放弃，不能把新打开的抽屉一起关掉
		setTimeout(() => {
			if (!closingDetail) return;
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
				<h2>{$t('projects.title')}</h2>
				<button class="btn-mini" onclick={openForm} title={$t('projects.newProject')}>{$t('projects.new')}</button>
			</div>
			<p class="side-sub">{projects.length} 个项目 · {totalTasks} 项任务</p>
		</header>

		{#if pendingInvites.length}
			<div class="invite-box">
				<p class="invite-title">{$t('projects.inviteInbox')}</p>
				{#each pendingInvites as iv (iv.id)}
					<div class="invite-row">
						<div class="invite-info">
							<span class="invite-proj">{iv.projectLabel}</span>
							<span class="invite-from"
								>{$t('projects.inviteFrom', { values: { name: iv.inviterName } })}</span
							>
						</div>
						<div class="invite-acts">
							<button
								type="button"
								class="btn-mini"
								disabled={inviteBusy === iv.id}
								onclick={() => respondInvite(iv.id, 'accept')}>{$t('projects.accept')}</button
							>
							<button
								type="button"
								class="btn-ghost-mini"
								disabled={inviteBusy === iv.id}
								onclick={() => respondInvite(iv.id, 'reject')}>{$t('projects.reject')}</button
							>
						</div>
					</div>
				{/each}
				{#if inviteError}
					<p class="invite-err">{inviteError}</p>
				{/if}
			</div>
		{/if}

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
								<span class="dot-new" title={$t('projects.addTask')}></span>
							{/if}
							{#if p.myRole}
								<span class="proj-role" class:owner={p.myRole === 'owner'}
									>{p.myRole === 'owner' ? $t('projects.roleOwner') : $t('projects.roleMember')}</span
								>
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
							<span class="proj-count"
								>{(p.tasks ? p.tasks.filter((t) => !t.done).length : Math.max(p.taskTotal - p.taskDone, 0)) +
									' / ' +
									(p.tasks ? p.tasks.length : p.taskTotal)}</span
							>
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
						{#if active.tasks.length === 0}
							{$t('projects.noTasks')}
						{:else if taskFiltered}
							{$t('projects.taskFiltered', { values: { shown: activeTasks.length, total: active.tasks.length } })}
						{:else}
							{$t('projects.taskFooter', { values: { total: active.tasks.length, done: active.tasks.filter((x) => x.done).length } })}
						{/if}
					</p>
				</div>
				<button class="link-btn" onclick={() => (detailOpen ? closeDetail() : openDetail(active))}>
					{detailOpen ? $t('projects.hideDetail') : $t('projects.viewDetail')}
				</button>
			</header>

			<form class="add-row" onsubmit={submitTask}>
				<input
					bind:this={inputEl}
					class="input"
					type="text"
					bind:value={newTask}
					placeholder={$t('projects.addTaskPlaceholder')}
					aria-label="新任务名称"
				/>
				<select
					class="cat-select"
					bind:value={newCategory}
					aria-label={$t('projects.taskCategory')}
					title={$t('projects.taskCategory')}
				>
					{#each TASK_CATEGORIES as c}
						<option value={c}>{$t(CAT_KEY[c])}</option>
					{/each}
				</select>
				<button class="btn btn-primary" type="submit">{$t('projects.addTask')}</button>
			</form>

			<!-- 任务筛选：一级完成状态，二级时间范围 -->
			{#if active.tasks.length > 0}
				<div class="task-filters">
					<div class="fgroup">
						<span class="flabel">{$t('projects.filterStatus')}</span>
						<div class="seg">
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterDone === 'all'}
								onclick={() => (taskFilterDone = 'all')}>{$t('common.all')}</button
							>
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterDone === 'open'}
								onclick={() => (taskFilterDone = 'open')}>{$t('tasks.inProgress')}</button
							>
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterDone === 'done'}
								onclick={() => (taskFilterDone = 'done')}>{$t('tasks.done')}</button
							>
						</div>
					</div>

					<div class="fgroup">
						<span class="flabel">{$t('projects.filterTime')}</span>
						<div class="seg">
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterTime === 'all'}
								onclick={() => (taskFilterTime = 'all')}>{$t('common.all')}</button
							>
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterTime === 'today'}
								onclick={() => (taskFilterTime = 'today')}>{$t('tasks.today')}</button
							>
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterTime === '7d'}
								onclick={() => (taskFilterTime = '7d')}>{$t('projects.last7d')}</button
							>
							<button
								type="button"
								class="seg-btn"
								class:on={taskFilterTime === '30d'}
								onclick={() => (taskFilterTime = '30d')}>{$t('projects.last30d')}</button
							>
						</div>
					</div>

					{#if taskFiltered}
						<button type="button" class="clear-filters" onclick={clearTaskFilters}>
							{$t('tasks.clearFilters')}
						</button>
					{/if}
				</div>

				{#if activeTasks.length === 0}
					<p class="empty">{$t('projects.noTaskMatch')}</p>
				{:else}
				<ul class="todo-list">
					{#each activeTasks as task (task.id)}
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
										placeholder={$t('projects.taskTitle')}
										aria-label={$t('projects.taskTitle')}
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
											<option value={c}>{$t(CAT_KEY[c])}</option>
										{/each}
									</select>
									<span class="act-time">{$t('projects.publishedAt')} {task.date} · {task.ago}</span>
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
									title={$t('projects.editTaskHint')}
									onclick={() => startEditTask(task)}
								>
									<span class="todo-text">{task.title}</span>
									<span class="cat-tag">{$t(CAT_KEY[task.category])}</span>
								</button>
								<span class="act-time">{$t('projects.publishedAt')} {task.date} · {task.ago}</span>
								<span class="todo-author">{task.author}</span>
								<button
									type="button"
									class="del"
									title={$t('projects.deleteTask')}
									aria-label={$t('projects.deleteTask')}
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
				{/if}
			{:else}
				<p class="empty-tip">{$t('projects.noTasks')}</p>
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
					<p class="detail-sub">{detail.purpose || $t('projects.noPurpose')}</p>
				</div>
				<button class="detail-close" onclick={closeDetail} aria-label={$t('projects.hideDetail')}>✕</button>
			</header>

			<div class="detail-actions">
				<button class="btn-edit" onclick={() => openEdit(detail)}>{$t('projects.editProject')}</button>
				<button class="btn-danger" onclick={() => askDelete(detail.id)}>{$t('common.delete')}</button>
			</div>

			<div class="meta-grid">
				<div class="meta">
					<span class="meta-k">{$t('projects.uiform')}</span>
					<span class="meta-v">{detail.ui}</span>
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.deployed')}</span>
					<span class="meta-v" class:yes={detail.deployed}>{detail.deployed ? 'Yes' : 'No'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.deployPath')}</span>
					<span class="meta-v" class:yes={!!detail.deployPath}>{detail.deployPath || '—'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.runPort')}</span>
					<span class="meta-v" class:yes={!!detail.runPort}>{detail.runPort || '—'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.projectUrl')}</span>
					{#if detail.projectUrl}
						<a class="meta-link" href={detail.projectUrl} target="_blank" rel="noopener noreferrer">
							{hostOf(detail.projectUrl)}
						</a>
					{:else}
						<span class="meta-v">—</span>
					{/if}
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.repoUrl')}</span>
					{#if detail.repoUrl}
						<a class="meta-link" href={detail.repoUrl} target="_blank" rel="noopener noreferrer">
							{hostOf(detail.repoUrl)}
						</a>
					{:else}
						<span class="meta-v">—</span>
					{/if}
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.owner')}</span>
					<span class="meta-v">{detail.owner || '—'}</span>
				</div>
				<div class="meta">
					<span class="meta-k">{$t('projects.taskCount')}</span>
					<span class="meta-v"
						>{detail.tasks.filter((t) => t.done).length}/{detail.tasks.length}</span
					>
				</div>
			</div>

			<!-- 代码托管：左侧上传/下载按钮，右侧上次上传时间或「未托管代码」 -->
			<div class="host-row">
				<div class="host-acts">
					<button
						type="button"
						class="btn-edit host-btn"
						disabled={hostingBusy}
						onclick={() => pickFolder(detail.id)}
					>
						{hostingPhase === 'idle' ? $t('projects.hostingUpload') : hostingMsg}
					</button>
					<button
						type="button"
						class="btn-edit host-btn"
						disabled={hostingBusy || !hosting?.hosted}
						onclick={() => downloadHosting(detail.id)}
					>
						{$t('projects.hostingDownload')}
					</button>
				</div>
				<p class="host-hint" class:never={!hosting?.hosted}>
					{#if hostingPhase === 'idle'}
						{hostingText}
					{:else}
						{hostingMsg}
					{/if}
				</p>
			</div>
			{#if hostingPhase === 'idle' && hostingMsg && hostingOk}
				<p class="host-note ok">{hostingMsg}</p>
			{/if}
			{#if hostingPhase === 'idle' && hostingMsg && !hostingOk}
				<p class="host-note err">{hostingMsg}</p>
			{/if}
			{#if hosting?.hosted}
				<p class="host-meta">
					{$t('projects.hostingSummary', {
						values: { files: hosting.fileCount, size: humanSize(hosting.totalBytes) }
					})}
				</p>
			{/if}

			<div class="field">
				<span class="field-label">{$t('projects.purpose')}</span>
				<p class="detail-text">{detail.purpose || '—'}</p>
			</div>

			<div class="field">
				<span class="field-label">{$t('projects.intro')}</span>
				<p class="detail-text">{detail.intro || '—'}</p>
			</div>

			<div class="field">
				<span class="field-label">{$t('projects.stack')}</span>
				<div class="chips">
					{#each detail.stack as s}
						<span class="chip on">{s}</span>
					{:else}
						<span class="detail-text">—</span>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field-label">{$t('projects.frameworks')}</span>
				<div class="chips">
					{#each detail.frameworks as f}
						<span class="chip on">{f}</span>
					{:else}
						<span class="detail-text">—</span>
					{/each}
				</div>
			</div>

			<!-- 项目成员：头像列表 + 发起人可邀请 / 移除 -->
			<div class="field">
				<div class="member-head">
					<span class="field-label"
						>{$t('projects.members')}
						<span class="member-num">{detail.members.length}</span></span
					>
					{#if detail.myRole === 'owner'}
						<button type="button" class="btn-mini" onclick={openInvite}
							>{$t('projects.inviteMember')}</button
						>
					{/if}
				</div>
				<ul class="member-list">
					{#each detail.members as m (m.userId)}
						<li class="member-item" class:me={m.userId === ME()?.id}>
							<span class="member-avatar" style="background:{m.color}">{memberInitials(m)}</span>
							<div class="member-info">
								<span class="member-name"
									>{m.name}{#if m.userId === ME()?.id}<span class="me-badge"
											>{$t('me.meBadge')}</span
										>{/if}</span
								>
								<span class="member-sub"
									>{$t('projects.uidLabel')} {m.uid || '—'}{#if m.title || m.role}
										· {m.title || m.role}{/if}</span
								>
							</div>
							<span class="member-role" class:owner={m.projectRole === 'owner'}
								>{m.projectRole === 'owner'
									? $t('projects.roleOwner')
									: $t('projects.roleMember')}</span
							>
							{#if detail.myRole === 'owner' && m.projectRole !== 'owner'}
								<button
									type="button"
									class="member-kick"
									title={$t('projects.removeMember')}
									onclick={() => kickMember(m.userId)}>×</button
								>
							{/if}
						</li>
					{:else}
						<li class="member-empty">{$t('projects.noMembers')}</li>
					{/each}
				</ul>
				{#if inviteError}
					<p class="member-err">{inviteError}</p>
				{/if}
				{#if activeInvites.length}
					<p class="member-pending">
						{$t('projects.pendingInvites', { values: { count: activeInvites.length } })}
					</p>
				{/if}
			</div>
		</aside>
	{/if}
	</div>
</div>

<!-- 邀请成员抽屉（仅项目发起人） -->
{#if inviteOpen && active}
	<div class="backdrop" onclick={closeInvite}></div>
	<aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="invite-title">
		<header class="drawer-head">
			<div>
				<h2 id="invite-title">{$t('projects.inviteMember')}</h2>
				<p class="drawer-sub">{$t('projects.inviteSub', { values: { name: active.label } })}</p>
			</div>
			<button type="button" class="icon-btn" onclick={closeInvite} aria-label={$t('common.close')}
				>×</button
			>
		</header>
		<form class="drawer-body" onsubmit={submitInvite}>
			{#if inviteOk}
				<p class="invite-note ok">{inviteOk}</p>
			{/if}
			{#if inviteFormError}
				<p class="invite-note err">{inviteFormError}</p>
			{/if}

			<div class="field">
				<span class="field-label">{$t('projects.inviteTarget')}</span>
				<select class="input" bind:value={inviteTargetId} disabled={!inviteCandidates.length}>
					{#each inviteCandidates as m (m.id)}
						<option value={m.id}>{m.name}（{m.role}）</option>
					{:else}
						<option value={null}>{$t('projects.inviteNoCandidate')}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<span class="field-label">{$t('projects.inviteMessage')}</span>
				<textarea
					class="input"
					rows="3"
					maxlength="255"
					bind:value={inviteMessage}
					placeholder={$t('projects.inviteMessagePlaceholder')}
				></textarea>
			</div>

			<footer class="drawer-foot">
				<button type="button" class="btn btn-ghost" onclick={closeInvite}>
					{$t('common.cancel')}
				</button>
				<button
					type="submit"
					class="btn btn-primary invite-submit"
					disabled={inviteSending || !inviteCandidates.length}
				>
					{#if inviteSending}
						<span class="spinner" aria-hidden="true"></span>
					{/if}
					{inviteSending ? $t('common.sending') : $t('projects.inviteSubmit')}
				</button>
			</footer>
		</form>
	</aside>
{/if}

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
					<span class="field-label">{$t('projects.label')}</span>
					<input class="input" type="text" bind:value={fLabel} placeholder={$t('projects.labelPlaceholder')} />
				</label>
				<label class="field">
					<span class="field-label">{$t('projects.tag')}</span>
					<input class="input" type="text" bind:value={fTag} placeholder={$t('projects.tagPlaceholder')} />
				</label>
			</div>

			<label class="field">
				<span class="field-label">{$t('projects.uiform')}</span>
				<select class="input select" bind:value={fUi}>
					{#each UI_OPTIONS as u}
						<option value={u}>{u}</option>
					{/each}
				</select>
			</label>

			<label class="field">
				<span class="field-label">{$t('projects.purpose')}</span>
				<input class="input" type="text" bind:value={fPurpose} placeholder={$t('projects.purposePlaceholder')} />
			</label>

			<label class="field">
				<span class="field-label">{$t('projects.intro')}</span>
				<textarea class="textarea" rows="4" bind:value={fIntro} placeholder={$t('projects.introPlaceholder')}
				></textarea>
			</label>

			<div class="field">
				<span class="field-label">{$t('projects.stack')}</span>
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
				<span class="field-label">{$t('projects.frameworks')}</span>
				<input
					class="input"
					type="text"
					bind:value={fFramework}
					onkeydown={onFrameworkKey}
					onblur={commitFramework}
					placeholder={$t('projects.frameworkPlaceholder')}
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
					<span class="field-label">{$t('projects.deployed')}</span>
					<select class="input select" bind:value={fDeployed}>
						<option value={false}>No</option>
						<option value={true}>Yes</option>
					</select>
				</label>
				<label class="field">
					<span class="field-label">{$t('projects.tagColor')}</span>
					<select class="input select color-select" bind:value={fColor}>
						{#each COLOR_OPTIONS as c}
							<option value={c}>{$t(`projects.color.${c}`)}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="grid-2">
				<label class="field">
					<span class="field-label">{$t('projects.runPort')}</span>
					<input
						class="input"
						type="text"
						bind:value={fRunPort}
						placeholder={$t('projects.portPlaceholder')}
					/>
				</label>
				<label class="field">
					<span class="field-label">{$t('projects.deployPath')}</span>
					<input
						class="input"
						type="text"
						bind:value={fDeployPath}
						placeholder={$t('projects.deployPathPlaceholder')}
					/>
				</label>
			</div>

			<div class="grid-2">
				<label class="field">
					<span class="field-label">{$t('projects.projectUrl')}</span>
					<input
						class="input"
						type="url"
						bind:value={fProjectUrl}
						placeholder={$t('projects.urlPlaceholder')}
					/>
				</label>
				<label class="field">
					<span class="field-label">{$t('projects.repoUrl')}</span>
					<input
						class="input"
						type="url"
						bind:value={fRepoUrl}
						placeholder={$t('projects.repoPlaceholder')}
					/>
				</label>
			</div>

			{#if formError}
				<p class="form-error">{formError}</p>
			{/if}

			<footer class="drawer-foot">
				<button type="button" class="btn btn-ghost" onclick={closeForm}>{$t('common.cancel')}</button>
				<button type="submit" class="btn btn-primary" disabled={saving}>
					{saving ? $t('common.saving') : formSubmitText}
				</button>
			</footer>
		</form>
	</aside>
{/if}

<!-- 代码托管：文件夹选择框（隐藏，点击上传时触发） -->
<input
	bind:this={folderInput}
	class="folder-input"
	type="file"
	multiple
	webkitdirectory
	onchange={onFolderPicked}
	tabindex="-1"
	aria-hidden="true"
/>

<!-- 删除确认弹窗（屏幕居中） -->
{#if confirmDeleteId !== null && deleteTarget}
	<div
		class="modal-backdrop"
		onclick={() => !deleting && cancelDelete()}
		role="presentation"
	></div>
	<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-modal-title">
		<h3 id="del-modal-title" class="modal-title">{$t('projects.deleteTitle')}</h3>
		<p class="modal-text">
			{$t('projects.deleteBody', { values: { name: deleteTarget.label, count: deleteTarget.tasks.length } })}
		</p>
		{#if deleteError}<p class="form-error">{deleteError}</p>{/if}
		<div class="modal-actions">
			<button class="btn-ghost" onclick={cancelDelete} disabled={deleting}>{$t('common.cancel')}</button>
			<button class="btn-danger on" onclick={() => doDelete(deleteTarget.id)} disabled={deleting}>
				{deleting ? $t('common.deleting') : $t('projects.confirmDelete')}
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
	/* 项目列表右上角的权限角标 */
	.proj-role {
		margin-left: auto;
		font-size: 0.62rem;
		font-weight: 700;
		padding: 1px 7px;
		border-radius: 20px;
		letter-spacing: 0.02em;
		color: var(--text-2);
		background: rgba(148, 163, 184, 0.16);
		white-space: nowrap;
	}
	.proj-role.owner {
		color: #fff;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
	}

	/* 待回应的项目邀请 */
	.invite-box {
		margin: 0 0 12px;
		padding: 10px 12px;
		border: 1px solid var(--red-500);
		border-radius: 12px;
		background: rgba(220, 38, 38, 0.06);
	}
	.invite-title {
		margin: 0 0 8px;
		font-size: 0.76rem;
		font-weight: 700;
		color: var(--red-500);
	}
	.invite-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 0;
	}
	.invite-row + .invite-row {
		border-top: 1px solid rgba(148, 163, 184, 0.2);
	}
	.invite-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.invite-proj {
		font-size: 0.82rem;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.invite-from {
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.invite-acts {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}
	.btn-ghost-mini {
		font-size: 0.72rem;
		padding: 3px 9px;
		border-radius: 8px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	.invite-err {
		margin: 6px 0 0;
		font-size: 0.72rem;
		color: var(--red-500);
	}

	/* 详情里的成员头像列表 */
	.member-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}
	.member-num {
		margin-left: 4px;
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text-2);
	}
	.member-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.member-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 10px;
		background: rgba(148, 163, 184, 0.08);
	}
	.member-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		font-size: 0.68rem;
		font-weight: 800;
		color: #fff;
		flex-shrink: 0;
	}
	.member-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.member-name {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.82rem;
		font-weight: 600;
	}
	.member-sub {
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.member-role {
		margin-left: auto;
		font-size: 0.68rem;
		font-weight: 700;
		padding: 1px 8px;
		border-radius: 20px;
		color: var(--text-2);
		background: rgba(148, 163, 184, 0.18);
		white-space: nowrap;
	}
	.member-role.owner {
		color: #fff;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
	}
	.member-kick {
		border: none;
		background: transparent;
		color: var(--text-2);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
	}
	.member-kick:hover {
		color: var(--red-500);
	}
	.member-empty,
	.member-pending,
	.member-err {
		font-size: 0.75rem;
		color: var(--text-2);
	}
	.member-err {
		color: var(--red-500);
	}
	.member-pending {
		margin-top: 6px;
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
	/* 标签配色下拉：左侧色块跟随选中值，选项本身由原生弹层展示颜色名 */
	.field:has(> .color-select) {
		position: relative;
	}
	.color-select {
		appearance: none;
		padding-left: 30px;
		cursor: pointer;
		background-image:
			linear-gradient(var(--tag-dot, #f87171), var(--tag-dot, #f87171)),
			linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-repeat: no-repeat;
		background-size: 12px 12px, 6px 6px, 6px 6px;
		background-position: 10px center, calc(100% - 18px) center, calc(100% - 12px) center;
	}
	.color-select.red { --tag-dot: #f87171; }
	.color-select.violet { --tag-dot: #a78bfa; }
	.color-select.amber { --tag-dot: #fbbf24; }
	.color-select.green { --tag-dot: #34d399; }
	.color-select.cyan { --tag-dot: #22d3ee; }
	.color-select.pink { --tag-dot: #f472b6; }
	.color-select option {
		background: var(--surface-2, #1b1b20);
		color: var(--text-1, #ececf1);
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
	/* 抽屉右上角关闭按钮 */
	.icon-btn {
		flex: none;
		width: 30px;
		height: 30px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		line-height: 1;
		border: 1px solid var(--line-strong);
		border-radius: 9px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	.icon-btn:hover {
		color: var(--text-0);
		border-color: var(--text-2);
		background: var(--bg-2);
	}
	/* 提交按钮：加载态留出 spinner 位置，禁用时不再发光 */
	.invite-submit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-width: 112px;
	}
	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
		box-shadow: none;
		filter: none;
	}
	.spinner {
		width: 13px;
		height: 13px;
		border: 2px solid rgba(255, 255, 255, 0.45);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* 抽屉内的提示条 */
	.invite-note {
		margin: 0;
		padding: 8px 12px;
		border-radius: 10px;
		font-size: 0.8rem;
	}
	.invite-note.ok {
		color: #22c55e;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.35);
	}
	.invite-note.err {
		color: #f87171;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.35);
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
	/* 详情里的外链：用下划线暗示可点，避免与普通文本混淆 */
	.meta-link {
		font-size: 0.86rem;
		font-weight: 600;
		color: var(--red-500);
		text-decoration: underline;
		text-underline-offset: 3px;
		word-break: break-all;
	}
	.meta-link:hover {
		color: var(--red-600, #b91c1c);
	}

	/* ===== 任务筛选 ===== */
	.task-filters {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--space-4);
		padding: 10px 0 var(--space-3);
		margin-bottom: var(--space-3);
		border-bottom: 1px solid var(--line);
	}
	.fgroup {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.flabel {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-2);
	}
	.seg {
		display: flex;
		gap: 3px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 9px;
		background: var(--bg-2);
	}
	.seg-btn {
		font-family: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		padding: 4px 10px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-1);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.15s, background 0.15s;
	}
	.seg-btn:hover {
		color: var(--text-0);
	}
	.seg-btn.on {
		color: #fff;
		background: var(--red-600);
	}
	.clear-filters {
		margin-left: auto;
		font-family: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		padding: 5px 11px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: transparent;
		color: var(--text-2);
		cursor: pointer;
	}
	.clear-filters:hover {
		color: var(--text-0);
		border-color: var(--red-500);
	}

	/* 详情里的外链：用下划线暗示可点，避免与普通文本混淆 */
	.meta-link {
		font-size: 0.86rem;
		font-weight: 600;
		color: var(--red-500);
		text-decoration: underline;
		text-underline-offset: 3px;
		word-break: break-all;
	}
	.meta-link:hover {
		color: var(--red-700, #b91c1c);
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

	/* ===== 代码托管 ===== */
	/* 文件夹选择框只是触发器，藏起来不占位（不能用 display:none，否则部分浏览器不给 click） */
	.folder-input {
		position: fixed;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.host-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3);
		border: 1px solid var(--line);
		border-radius: var(--radius-md);
		background: var(--bg-2);
	}
	.host-acts {
		display: flex;
		flex: none;
		gap: var(--space-2);
	}
	.host-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.host-btn:disabled:hover {
		color: var(--text-1);
		border-color: var(--line-strong);
	}
	.host-hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-1);
		text-align: right;
		line-height: 1.4;
	}
	.host-hint.never {
		color: var(--text-2);
	}
	.host-note {
		margin: -6px 0 0;
		font-size: 0.76rem;
		line-height: 1.5;
	}
	.host-note.ok {
		color: #34d399;
	}
	.host-note.err {
		color: #f87171;
	}
	.host-meta {
		margin: -8px 0 0;
		font-size: 0.74rem;
		color: var(--text-2);
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
