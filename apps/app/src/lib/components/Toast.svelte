<script lang="ts">
	/**
	 * 右上角气泡提示（轻量 toast）。
	 *
	 * 用 props 驱动而不是全局 store：调用方持有要展示的消息，
	 * 组件只负责「显示多久、怎么消失」，避免为一次提示引入全局状态。
	 *
	 * 用法：
	 *   let toast = $state('');
	 *   <Toast message={toast} onclose={() => (toast = '')} />
	 *   toast = '已批准';   // 3 秒后自动收起
	 */
	let {
		/** 要展示的文本；空串表示不显示 */
		message = '',
		/** 语义：成功 / 失败 / 普通信息，决定配色与图标 */
		kind = 'success',
		/** 自动收起时间（毫秒）；传 0 表示需手动关闭 */
		duration = 3000,
		/** 收起时回调，调用方据此清空 message */
		onclose
	}: {
		message?: string;
		kind?: 'success' | 'error' | 'info';
		duration?: number;
		onclose?: () => void;
	} = $props();

	/** 淡出动画期间先保留文本，动画结束再真正清空 */
	let visible = $state(false);
	let leaving = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (!message) return;

		// 新消息进来：重置状态并重新计时
		visible = true;
		leaving = false;
		if (timer) clearTimeout(timer);

		if (duration > 0) {
			timer = setTimeout(() => close(), duration);
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	function close() {
		if (leaving) return;
		leaving = true;
		if (timer) clearTimeout(timer);
		// 等淡出动画结束再通知调用方清空，避免文字先消失、容器还在
		timer = setTimeout(() => {
			visible = false;
			leaving = false;
			onclose?.();
		}, 220);
	}
</script>

{#if visible}
	<div class="toast {kind}" class:leaving role="status" aria-live="polite">
		<span class="icon" aria-hidden="true">
			{#if kind === 'success'}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
					<path d="M5 12.5l4.5 4.5L19 7.5" />
				</svg>
			{:else if kind === 'error'}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M12 8v5M12 16.5v.01" />
					<circle cx="12" cy="12" r="9" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<circle cx="12" cy="12" r="9" />
					<path d="M12 16v-5M12 8v.01" />
				</svg>
			{/if}
		</span>
		<span class="text">{message}</span>
		<button class="close" type="button" onclick={close} aria-label="关闭提示">✕</button>
	</div>
{/if}

<style>
	/* 固定右上角；z-index 高于抽屉(61)与弹窗(71)，保证提示不被遮住 */
	.toast {
		position: fixed;
		top: 78px;
		right: var(--space-5);
		z-index: 90;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(360px, calc(100vw - 40px));
		padding: 11px 12px 11px 14px;
		border-radius: var(--radius-md);
		border: 1px solid var(--line-strong);
		background: var(--bg-1);
		box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5);
		font-size: 0.84rem;
		animation: toast-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
		/* 提示不需要交互：容器透明于指针，避免遮住抽屉右上角的关闭按钮；
		   仅关闭按钮自己重新接收事件。 */
		pointer-events: none;
	}
	@keyframes toast-in {
		from {
			transform: translate(16px, -8px);
			opacity: 0;
		}
	}
	@keyframes toast-out {
		to {
			transform: translate(16px, -8px);
			opacity: 0;
		}
	}
	.toast.leaving {
		animation: toast-out 0.22s ease forwards;
	}

	.toast.success {
		border-color: rgba(34, 197, 94, 0.4);
		background: linear-gradient(180deg, rgba(34, 197, 94, 0.14), var(--bg-1));
	}
	.toast.error {
		border-color: rgba(248, 113, 113, 0.4);
		background: linear-gradient(180deg, rgba(248, 113, 113, 0.14), var(--bg-1));
	}
	.toast.info {
		border-color: var(--line-strong);
	}

	.icon {
		flex: none;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
	}
	.icon svg {
		width: 13px;
		height: 13px;
	}
	.toast.success .icon {
		color: #4ade80;
		background: rgba(34, 197, 94, 0.16);
	}
	.toast.error .icon {
		color: #f87171;
		background: rgba(248, 113, 113, 0.16);
	}
	.toast.info .icon {
		color: var(--text-1);
		background: var(--bg-3);
	}

	.text {
		flex: 1;
		min-width: 0;
		color: var(--text-0);
		line-height: 1.45;
		word-break: break-word;
	}

	.close {
		display: grid;
		flex: none;
		place-items: center;
		width: 20px;
		height: 20px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-2);
		font-size: 0.7rem;
		cursor: pointer;
		/* 容器 pointer-events:none 后，关闭按钮需要自己可点 */
		pointer-events: auto;
	}
	.close:hover {
		color: var(--text-0);
		background: var(--bg-3);
	}

	@media (max-width: 720px) {
		.toast {
			left: var(--space-4);
			right: var(--space-4);
			max-width: none;
		}
	}
</style>
