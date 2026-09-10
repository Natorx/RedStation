<script lang="ts">
	type Msg = { from: 'me' | 'them'; text: string; time: string };
	type Conv = {
		id: string;
		name: string;
		tag: string;
		color: string;
		online: boolean;
		unread: number;
		msgs: Msg[];
	};

	let convos = $state<Conv[]>([
		{
			id: 'm1',
			name: 'Tune Oasis',
			tag: '工具组',
			color: '#06b6d4',
			online: true,
			unread: 1,
			msgs: [
				{ from: 'them', text: '本地测试记录已经整理好，麻烦你回看下入口流程。', time: '14:02' },
				{ from: 'me', text: '收到，我这就看，顺便把自动部署的脚本版本对齐一下。', time: '14:05' },
				{ from: 'them', text: '嗯，配置文件的端口要跟着改动。', time: '14:08' }
			]
		},
		{
			id: 'm2',
			name: 'RedStation',
			tag: '工作台',
			color: '#6366f1',
			online: true,
			unread: 3,
			msgs: [
				{ from: 'them', text: '立项模板已经就绪，概览里的消息页需要你过一遍再联后端。', time: '13:41' },
				{ from: 'me', text: '好，消息界面晚一点先落地静态稿。', time: '13:50' },
				{ from: 'them', text: '任务弹窗我这边也没接到新提醒，记得标 unread。', time: '13:52' }
			]
		},
		{
			id: 'm3',
			name: 'GameStorm',
			tag: '服务端',
			color: '#22c55e',
			online: false,
			unread: 0,
			msgs: [
				{ from: 'them', text: '服务端部署脚本跑通了，夜里我会打一个自动化版本。', time: '昨天 20:19' },
				{ from: 'me', text: '辛苦了，把重试参数留下我合进 wiki。', time: '昨天 20:31' }
			]
		}
	]);

	let selId = $state('m1');
	let draft = $state('');
	let sending = $state(false);

	function active(): Conv {
		return convos.find((c) => c.id === selId) ?? convos[0];
	}

	function openConv(id: string) {
		selId = id;
		const c = convos.find((x) => x.id === id);
		if (c) c.unread = 0;
	}

	function nowHM(): string {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return `${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	function send() {
		const text = draft.trim();
		if (!text || sending) return;
		sending = true;
		const c = active();
		c.msgs = [...c.msgs, { from: 'me', text, time: nowHM() }];
		draft = '';
		// 让最新消息滚动到可视区
		setTimeout(() => {
			const box = document.getElementById('chat-scroll');
			if (box) box.scrollTop = box.scrollHeight;
			sending = false;
		}, 0);
	}

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'Enter' && !ev.shiftKey) {
			ev.preventDefault();
			send();
		}
	}
</script>

<svelte:head><title>消息 · RedStation</title></svelte:head>

<section class="chat card">
	<aside class="conv-pane" aria-label="会话列表">
		<header class="conv-head">
			<h2>消息</h2>
			<span class="conv-total">{convos.reduce((n, c) => n + c.unread, 0)} 未读</span>
		</header>
		<div class="search">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="7" />
				<path d="M21 21l-4.3-4.3" />
			</svg>
			<input type="text" placeholder="搜索会话…" aria-label="搜索会话" />
		</div>
		<ul class="conv-list">
			{#each convos as c}
				<li>
					<button
						class="conv-row {c.id === selId ? 'active' : ''}"
						type="button"
						onclick={() => openConv(c.id)}
					>
						<span class="avatar" style="background:{c.color}">{c.name[0]}</span>
						<span class="conv-meta">
							<span class="conv-title">
								{c.name}
								<span class="dot {c.online ? 'on' : ''}" title={c.online ? '在线' : '离线'}></span>
							</span>
							<span class="conv-prev">{c.msgs[c.msgs.length - 1]?.text}</span>
						</span>
						<span class="conv-side">
							<span class="conv-time">{c.msgs[c.msgs.length - 1]?.time}</span>
							{#if c.unread > 0}<span class="badge">{c.unread}</span>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</aside>

	<div class="thread">
		<header class="thread-head">
			<span class="avatar" style="background:{active().color}">{active().name[0]}</span>
			<div class="thread-id">
				<h3>{active().name}</h3>
				<span class="thread-sub">{active().online ? '在线' : '离线'} · {active().tag}</span>
			</div>
			<span class="thread-empty"></span>
		</header>

		<div class="msgs" id="chat-scroll" aria-live="polite">
			{#each active().msgs as m}
				<div class="msg-row {m.from}">
					<div class="bubble">
						<span class="bubble-text">{m.text}</span>
						<span class="bubble-time">{m.time}</span>
					</div>
				</div>
			{/each}
		</div>

		<footer class="composer">
			<input
				class="composer-input"
				type="text"
				placeholder="输入消息，Enter 发送…"
				aria-label="消息内容"
				bind:value={draft}
				onkeydown={onKey}
			/>
			<button class="btn send-btn" type="button" onclick={send} disabled={!draft.trim()}>发送</button>
		</footer>
	</div>
</section>

<style>
	:global(:root) {
		--line: rgba(255, 255, 255, 0.08);
		--line-strong: rgba(255, 255, 255, 0.14);
		--bg-0: #0b0b0e;
		--bg-1: #121216;
		--bg-2: #1a1a20;
		--bg-3: #232329;
		--text-0: #f5f5f6;
		--text-1: #b4b4bd;
		--text-2: #6f6f7a;
		--text-3: #5a5a68;
		--radius-md: 12px;
		--radius-lg: 18px;
		--space-2: 8px;
		--space-3: 12px;
		--space-4: 16px;
		--space-5: 24px;
		--space-6: 32px;
		--accent: var(--red-600);
		--red-600: #dc2626;
	}

	/* 打破全局 .content 限宽，让聊天占满可用横向空间并限制纵向高度 */
	:global(.content):has(> .chat) {
		max-width: none;
	}

	.chat {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: var(--space-3);
		height: 90vh;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.conv-pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border-right: 1px solid var(--line);
		background: var(--bg-1);
	}

	.conv-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-4) var(--space-4) var(--space-2);
	}
	.conv-head h2 {
		margin: 0;
		font-size: 1.2rem;
		letter-spacing: -0.01em;
	}
	.conv-total {
		font-size: 0.74rem;
		color: var(--text-2);
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 var(--space-4) var(--space-3);
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--bg-2);
	}
	.search svg {
		width: 14px;
		height: 14px;
		flex: none;
		color: var(--text-2);
	}
	.search input {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.86rem;
	}
	.search input::placeholder {
		color: var(--text-3);
	}

	.conv-list {
		list-style: none;
		margin: 0;
		padding: 0 var(--space-3) var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-y: auto;
	}
	.conv-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		width: 100%;
		text-align: left;
		padding: var(--space-3);
		border: none;
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
		font-family: inherit;
		color: var(--text-0);
	}
	.conv-row:hover {
		background: var(--bg-2);
	}
	.conv-row.active {
		background: linear-gradient(0deg, rgba(229, 72, 77, 0.12), rgba(229, 72, 77, 0.12)), var(--bg-2);
		box-shadow: inset 2px 0 0 var(--accent);
	}

	.avatar {
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: 11px;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 0.9rem;
		color: #fff;
	}

	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-left: 6px;
		background: var(--text-3);
		vertical-align: 1px;
	}
	.dot.on {
		background: #2ed573;
	}

	.conv-title {
		display: flex;
		align-items: center;
		font-weight: 650;
		font-size: 0.92rem;
		white-space: nowrap;
	}
	.conv-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.conv-prev {
		font-size: 0.78rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.conv-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 6px;
		margin-left: auto;
	}
	.conv-time {
		font-size: 0.7rem;
		color: var(--text-3);
	}
	.badge {
		min-width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		padding: 0 5px;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 0.68rem;
		font-weight: 700;
	}

	.thread {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--bg-1);
	}

	.thread-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-4);
		border-bottom: 1px solid var(--line);
	}
	.thread-head .avatar {
		width: 38px;
		height: 38px;
		border-radius: 10px;
	}
	.thread-id h3 {
		margin: 0;
		font-size: 1rem;
	}
	.thread-sub {
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.thread-empty {
		margin-left: auto;
	}

	.msgs {
		flex: 1;
		overflow-y: auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background:
			radial-gradient(1200px 600px at 100% 0%, rgba(229, 72, 77, 0.05), transparent),
			var(--bg-1);
	}

	.msg-row {
		display: flex;
		max-width: 78%;
	}
	.msg-row.me {
		align-self: flex-end;
	}
	.msg-row.them {
		align-self: flex-start;
	}
	.bubble {
		padding: 9px 13px 7px;
		border-radius: 16px;
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--text-0);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.16);
	}
	.msg-row.them .bubble {
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-bottom-left-radius: 6px;
		align-content: flex-end;
	}
	.msg-row.me .bubble {
		background: linear-gradient(135deg, var(--accent), #c53235);
		border-bottom-right-radius: 6px;
	}
	.bubble-text {
		display: block;
	}
	.bubble-time {
		display: block;
		text-align: right;
		margin-top: 3px;
		font-size: 0.62rem;
		opacity: 0.75;
	}

	.composer {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--line);
	}
	.composer-input {
		flex: 1;
		min-width: 0;
		padding: 11px 14px;
		border: 1px solid var(--line);
		border-radius: 22px;
		background: var(--bg-2);
		outline: none;
		font-family: inherit;
		font-size: 0.9rem;
		color: var(--text-0);
		transition: border-color 0.15s;
	}
	.composer-input:focus {
		border-color: var(--accent);
	}
	.send-btn {
		flex: none;
		padding: 10px 20px;
		border: none;
		border-radius: 22px;
		background: linear-gradient(135deg, var(--accent), #c53235);
		color: #fff;
		font-family: inherit;
		font-weight: 650;
		font-size: 0.9rem;
		cursor: pointer;
		box-shadow: 0 5px 16px rgba(229, 72, 77, 0.3);
		transition: filter 0.15s, transform 0.1s;
	}
	.send-btn:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.send-btn:active:not(:disabled) {
		transform: translateY(1px);
	}
	.send-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	@media (max-width: 780px) {
		.chat {
			grid-template-columns: 1fr;
		}
		.conv-pane {
			border-right: none;
			border-bottom: 1px solid var(--line);
		}
	}
</style>
