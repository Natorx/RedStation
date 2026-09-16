<script lang="ts">
	import { goto } from '$app/navigation';
	import { ApiError } from '$lib/api/client';
	import { login, sendRegisterCode, registerByEmail } from '$lib/stores/workspace.svelte';
	import { t } from '$lib/i18n';

	let uid = $state('');
	let pwd = $state('');
	let remember = $state(true);
	let error = $state('');
	let submitting = $state(false);
	let showPwd = $state(false);

	// ===== 注册 =====
	/** 当前标签：login / register */
	let tab = $state<'login' | 'register'>('login');
	let rEmail = $state('');
	let rPwd = $state('');
	let rPwd2 = $state('');
	let rCode = $state('');
	let rError = $state('');
	let rOk = $state('');
	let rSubmitting = $state(false);
	let sendingCode = $state(false);
	let showRPwd = $state(false);
	/** 发码冷却倒计时（秒），0 表示可再次发送 */
	let cooldown = $state(0);
	let timer: ReturnType<typeof setInterval> | null = null;

	function startCooldown(seconds: number) {
		cooldown = seconds;
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			cooldown -= 1;
			if (cooldown <= 0 && timer) {
				clearInterval(timer);
				timer = null;
				cooldown = 0;
			}
		}, 1000);
	}

	// 组件销毁时清掉计时器，避免切页后仍在跑
	$effect(() => () => {
		if (timer) clearInterval(timer);
	});

	function switchTab(next: 'login' | 'register') {
		tab = next;
		error = '';
		rError = '';
		rOk = '';
	}

	/** 发送邮箱验证码 */
	async function onSendCode() {
		if (sendingCode || cooldown > 0) return;
		rError = '';
		rOk = '';
		const email = rEmail.trim();
		if (!email) {
			rError = $t('register.emailRequired');
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			rError = $t('register.emailInvalid');
			return;
		}
		sendingCode = true;
		try {
			const res = await sendRegisterCode(email);
			startCooldown(res.cooldown);
			rOk = $t('register.codeSent');
		} catch (err) {
			rError = err instanceof ApiError ? err.message : $t('register.sendFailed');
		} finally {
			sendingCode = false;
		}
	}

	/** 提交注册 */
	async function submitRegister(e: SubmitEvent) {
		e.preventDefault();
		if (rSubmitting) return;
		rError = '';
		rOk = '';

		const email = rEmail.trim();
		if (!email) {
			rError = $t('register.emailRequired');
			return;
		}
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			rError = $t('register.emailInvalid');
			return;
		}
		if (!rPwd) {
			rError = $t('register.pwdRequired');
			return;
		}
		if (rPwd.length < 6) {
			rError = $t('register.pwdTooShort');
			return;
		}
		if (rPwd !== rPwd2) {
			rError = $t('register.pwdMismatch');
			return;
		}
		if (!/^\d{4}$/.test(rCode.trim())) {
			rError = $t('register.codeRule');
			return;
		}

		rSubmitting = true;
		try {
			await registerByEmail(email, rPwd, rCode);
			// 注册即登录，直接进工作台
			await goto('/');
		} catch (err) {
			rError = err instanceof ApiError ? err.message : $t('register.failed');
			rSubmitting = false;
		}
	}

	// 演示账号提示文案（实际校验在后端）
	const DEMO_UID = '10248571';
	const DEMO_PWD = 'redstation';

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (submitting) return;
		error = '';

		const id = uid.trim();
		if (!id) {
			error = $t('login.accountRequired');
			return;
		}
		if (!pwd) {
			error = '请输入密码';
			return;
		}

		submitting = true;
		try {
			await login(id, pwd);
			await goto('/');
		} catch (err) {
			error = err instanceof ApiError ? err.message : '登录失败，请稍后重试';
			submitting = false;
		}
	}

	function fillDemo() {
		uid = DEMO_UID;
		pwd = DEMO_PWD;
		error = '';
	}
</script>

<svelte:head><title>登录 · RedStation</title></svelte:head>

<div class="login">
	<!-- 装饰光斑 -->
	<div class="glow g1" aria-hidden="true"></div>
	<div class="glow g2" aria-hidden="true"></div>

	<section class="panel">
		<!-- 左：品牌 -->
		<aside class="brand-side">
			<div class="brand">
				<span class="brand-mark">R</span>
				<div class="brand-text">
					<span class="brand-name">RedStation</span>
					<span class="brand-badge">alpha</span>
				</div>
			</div>

			<h1>{$t('login.brandTitle')}</h1>
			<p class="brand-desc">
				{$t('login.brandDesc')}
			</p>

			<ul class="feature">
				<li>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
						<path d="M3 8l9 5 9-5M12 13v8" />
					</svg>
					{$t('login.feature1')}
				</li>
				<li>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="9" />
						<path d="M8 12.5l2.5 2.5L16 9.5" />
					</svg>
					{$t('login.feature2')}
				</li>
				<li>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 3-2z" />
					</svg>
					{$t('login.feature3')}
				</li>
			</ul>

			<div class="brand-foot">© 2026 RedStation · 本地工作台</div>
		</aside>

		<!-- 右：表单 -->
		<div class="form-side">
			<!-- 登录 / 注册 切换 -->
			<div class="tabs" role="tablist" aria-label={$t('login.title')}>
				<button
					type="button"
					class="tab"
					class:on={tab === 'login'}
					role="tab"
					aria-selected={tab === 'login'}
					onclick={() => switchTab('login')}>{$t('login.tabLogin')}</button
				>
				<button
					type="button"
					class="tab"
					class:on={tab === 'register'}
					role="tab"
					aria-selected={tab === 'register'}
					onclick={() => switchTab('register')}>{$t('login.tabRegister')}</button
				>
			</div>

			{#if tab === 'login'}
			<form class="form" onsubmit={submit}>
				<header class="form-head">
					<h2>登录</h2>
					<p>{$t('login.useWorkspaceAccount')}</p>
				</header>

				<label class="field">
					<span class="field-label">{$t('login.account')}</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="8" r="4" />
							<path d="M4 21a8 8 0 0116 0" />
						</svg>
						<input
							class="input"
							type="text"
							autocomplete="username"
							spellcheck="false"
							placeholder={$t('login.accountPlaceholder')}
							bind:value={uid}
						/>
					</div>
				</label>

				<label class="field">
					<span class="field-label">密码</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="4" y="10" width="16" height="10" rx="2" />
							<path d="M8 10V7a4 4 0 018 0v3" />
						</svg>
						<input
							class="input"
							type={showPwd ? 'text' : 'password'}
							autocomplete="current-password"
							placeholder="请输入密码"
							bind:value={pwd}
						/>
						<button
							class="pwd-toggle"
							type="button"
							onclick={() => (showPwd = !showPwd)}
							aria-label={showPwd ? $t('login.hidePassword') : $t('login.showPassword')}
							title={showPwd ? $t('login.hidePassword') : $t('login.showPassword')}
						>
							{showPwd ? $t('login.hide') : $t('login.show')}
						</button>
					</div>
				</label>

				<div class="row">
					<label class="check">
						<input type="checkbox" bind:checked={remember} />
						<span class="check-box" aria-hidden="true"></span>
						记住我
					</label>
					<button class="link" type="button" onclick={fillDemo}>{$t('login.useDemo')}</button>
				</div>

				{#if error}
					<p class="error" role="alert">{error}</p>
				{/if}

				<button class="submit" type="submit" disabled={submitting}>
					{#if submitting}
						<span class="spinner" aria-hidden="true"></span>
						登录中…
					{:else}
						登录
					{/if}
				</button>

				<p class="demo-hint">
					{$t('login.demoHint')} <b>{DEMO_UID}</b> / <b>{DEMO_PWD}</b> · {$t('login.demoRest')} 10248572–10248576
				</p>
			</form>
			{:else}
			<!-- 注册：邮箱 + 密码 + 邮箱验证码 -->
			<form class="form" onsubmit={submitRegister}>
				<header class="form-head">
					<h2>{$t('login.tabRegister')}</h2>
					<p>{$t('register.subtitle')}</p>
				</header>

				<label class="field">
					<span class="field-label">{$t('register.email')}</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="5" width="18" height="14" rx="2" />
							<path d="M3 7l9 6 9-6" />
						</svg>
						<input
							class="input"
							type="email"
							autocomplete="email"
							placeholder={$t('register.emailPlaceholder')}
							bind:value={rEmail}
						/>
					</div>
				</label>

				<label class="field">
					<span class="field-label">{$t('register.code')}</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M4 7l8 6 8-6" />
							<rect x="3" y="5" width="18" height="14" rx="2" />
						</svg>
						<input
							class="input code-input"
							type="text"
							inputmode="numeric"
							maxlength="4"
							autocomplete="one-time-code"
							placeholder={$t('register.codePlaceholder')}
							bind:value={rCode}
						/>
						<button
							class="code-btn"
							type="button"
							disabled={sendingCode || cooldown > 0}
							onclick={onSendCode}
						>
							{#if sendingCode}
								{$t('register.sending')}
							{:else if cooldown > 0}
								{cooldown}s
							{:else}
								{$t('register.sendCode')}
							{/if}
						</button>
					</div>
				</label>

				<label class="field">
					<span class="field-label">{$t('register.password')}</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="4" y="10" width="16" height="10" rx="2" />
							<path d="M8 10V7a4 4 0 018 0v3" />
						</svg>
						<input
							class="input"
							type={showRPwd ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder={$t('register.passwordPlaceholder')}
							bind:value={rPwd}
						/>
						<button
							class="pwd-toggle"
							type="button"
							onclick={() => (showRPwd = !showRPwd)}
							aria-label={showRPwd ? $t('login.hidePassword') : $t('login.showPassword')}
						>
							{showRPwd ? $t('login.hide') : $t('login.show')}
						</button>
					</div>
				</label>

				<label class="field">
					<span class="field-label">{$t('register.password2')}</span>
					<div class="input-wrap">
						<svg class="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="4" y="10" width="16" height="10" rx="2" />
							<path d="M8 10V7a4 4 0 018 0v3" />
						</svg>
						<input
							class="input"
							type={showRPwd ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder={$t('register.password2Placeholder')}
							bind:value={rPwd2}
						/>
					</div>
				</label>

				{#if rError}
					<p class="error" role="alert">{rError}</p>
				{/if}
				{#if rOk}
					<p class="ok" role="status">{rOk}</p>
				{/if}

				<button class="submit" type="submit" disabled={rSubmitting}>
					{#if rSubmitting}
						<span class="spinner" aria-hidden="true"></span>
						{$t('register.submitting')}
					{:else}
						{$t('login.tabRegister')}
					{/if}
				</button>

				<p class="demo-hint">{$t('register.hint')}</p>
			</form>
			{/if}
		</div>
	</section>
</div>

<style>
	.login {
		position: relative;
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: var(--space-5);
		background: var(--bg-0);
		overflow: hidden;
	}
	.glow {
		position: absolute;
		border-radius: 50%;
		filter: blur(120px);
		pointer-events: none;
	}
	.g1 {
		width: 460px;
		height: 460px;
		top: -140px;
		left: -100px;
		background: rgba(220, 38, 38, 0.28);
	}
	.g2 {
		width: 380px;
		height: 380px;
		bottom: -140px;
		right: -80px;
		background: rgba(99, 102, 241, 0.2);
	}

	.panel {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 1.05fr 1fr;
		width: min(880px, 100%);
		background: var(--bg-1);
		border: 1px solid var(--line-strong);
		border-radius: 22px;
		overflow: hidden;
		box-shadow: 0 40px 100px rgba(0, 0, 0, 0.55);
		animation: rise 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px);
		}
	}

	/* ===== 左：品牌区 ===== */
	.brand-side {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-6);
		background:
			radial-gradient(600px 300px at 0% 0%, rgba(220, 38, 38, 0.16), transparent 65%),
			var(--bg-2);
		border-right: 1px solid var(--line);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.brand-mark {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		background: linear-gradient(135deg, var(--red-500), var(--red-700));
		color: #fff;
		font-weight: 800;
		box-shadow: 0 6px 18px rgba(220, 38, 38, 0.42);
	}
	.brand-text {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.brand-name {
		font-size: 1.12rem;
		font-weight: 700;
	}
	.brand-badge {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--red-500);
		background: var(--accent-soft);
		border: 1px solid rgba(220, 38, 38, 0.28);
		border-radius: 999px;
		padding: 2px 7px;
	}
	.brand-side h1 {
		margin: var(--space-2) 0 0;
		font-size: 1.5rem;
		line-height: 1.35;
		letter-spacing: -0.01em;
	}
	.brand-desc {
		margin: 0;
		font-size: 0.86rem;
		line-height: 1.7;
		color: var(--text-1);
	}
	.feature {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.feature li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.84rem;
		color: var(--text-1);
	}
	.feature svg {
		width: 17px;
		height: 17px;
		flex: none;
		color: var(--red-500);
	}
	.brand-foot {
		margin-top: auto;
		padding-top: var(--space-4);
		font-size: 0.72rem;
		color: var(--text-2);
	}

	/* ===== 右：表单区 ===== */
	.form-side {
		display: grid;
		place-items: center;
		padding: var(--space-6);
	}
	.form {
		width: 100%;
		max-width: 320px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.form-head h2 {
		margin: 0;
		font-size: 1.3rem;
	}
	.form-head p {
		margin: 6px 0 0;
		font-size: 0.82rem;
		color: var(--text-2);
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
	.input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input-icon {
		position: absolute;
		left: 12px;
		width: 16px;
		height: 16px;
		color: var(--text-2);
		pointer-events: none;
	}
	.input {
		width: 100%;
		padding: 11px 12px 11px 36px;
		border: 1px solid var(--line-strong);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--text-0);
		font-family: inherit;
		font-size: 0.88rem;
		outline: none;
		transition: border-color 0.16s ease, box-shadow 0.16s ease;
	}
	.input::placeholder {
		color: var(--text-2);
	}
	.input:focus {
		border-color: rgba(220, 38, 38, 0.55);
		box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14);
	}
	.pwd-toggle {
		position: absolute;
		right: 8px;
		padding: 4px 8px;
		border: none;
		border-radius: 7px;
		background: transparent;
		color: var(--text-2);
		font-family: inherit;
		font-size: 0.72rem;
		cursor: pointer;
	}
	.pwd-toggle:hover {
		color: var(--text-0);
		background: var(--bg-3);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
		color: var(--text-1);
		cursor: pointer;
	}
	.check input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.check-box {
		width: 15px;
		height: 15px;
		border: 1px solid var(--line-strong);
		border-radius: 5px;
		background: var(--bg-2);
		transition: background 0.16s ease, border-color 0.16s ease;
	}
	.check input:checked + .check-box {
		background: var(--red-600);
		border-color: var(--red-600);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E");
		background-size: 12px;
		background-position: center;
		background-repeat: no-repeat;
	}
	.link {
		border: none;
		background: transparent;
		color: var(--text-2);
		font-family: inherit;
		font-size: 0.78rem;
		cursor: pointer;
		padding: 0;
	}
	.link:hover {
		color: var(--red-500);
	}

	/* ===== 登录 / 注册 标签 ===== */
	.tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		margin-bottom: 4px;
		border: 1px solid var(--line);
		border-radius: 11px;
		background: var(--bg-2);
	}
	.tab {
		flex: 1;
		padding: 8px 0;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.84rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s ease, background 0.15s ease;
	}
	.tab:hover {
		color: var(--text-0);
	}
	.tab.on {
		color: #fff;
		background: var(--red-600);
	}

	/* 验证码输入与发送按钮同排 */
	.code-input {
		font-family: var(--font-mono);
		letter-spacing: 0.24em;
	}
	.code-btn {
		position: absolute;
		right: 6px;
		top: 50%;
		transform: translateY(-50%);
		padding: 6px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 8px;
		background: var(--bg-3);
		color: var(--text-1);
		font-family: inherit;
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	.code-btn:hover:not(:disabled) {
		color: var(--text-0);
		border-color: var(--red-500);
	}
	.code-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* 成功提示，与 .error 呼应 */
	.ok {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid rgba(34, 197, 94, 0.35);
		border-radius: 9px;
		background: rgba(34, 197, 94, 0.1);
		color: #4ade80;
		font-size: 0.78rem;
	}

	.error {
		margin: 0;
		padding: 8px 10px;
		border: 1px solid rgba(220, 38, 38, 0.35);
		border-radius: 9px;
		background: rgba(220, 38, 38, 0.1);
		color: #f87171;
		font-size: 0.78rem;
	}

	.submit {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 11px;
		border: none;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--red-500), var(--red-600));
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 10px 26px rgba(220, 38, 38, 0.32);
		transition: filter 0.16s ease, opacity 0.16s ease;
	}
	.submit:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.submit:disabled {
		opacity: 0.65;
		cursor: not-allowed;
		box-shadow: none;
	}
	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.35);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.demo-hint {
		margin: 0;
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.demo-hint b {
		color: var(--text-1);
		font-family: var(--font-mono);
	}

	/* ===== 响应式 ===== */
	@media (max-width: 820px) {
		.panel {
			grid-template-columns: 1fr;
		}
		.brand-side {
			border-right: none;
			border-bottom: 1px solid var(--line);
			padding: var(--space-5);
		}
		.feature {
			display: none;
		}
		.brand-foot {
			display: none;
		}
		.form-side {
			padding: var(--space-5);
		}
	}
</style>
