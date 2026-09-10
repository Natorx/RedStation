<script lang="ts">
	let { title, desc = '该模块正处于 UI 设计阶段，后续将在此处接入具体功能。' }: {
		title: string;
		desc?: string;
	} = $props();
</script>

<section class="empty">
	<div class="empty-box">
		<span class="cube" aria-hidden="true">
			<span class="face top"></span>
			<span class="face box">R</span>
		</span>
		<h2>{title}</h2>
		<p>{desc}</p>
		<a class="btn btn-primary" href="/">← 返回概览</a>
	</div>
</section>

<style>
	.empty {
		min-height: 60vh;
		display: grid;
		place-items: center;
		text-align: center;
	}
	.empty-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-7);
	}
	.empty-box h2 {
		font-size: 1.5rem;
	}
	.empty-box p {
		max-width: 460px;
		color: var(--text-1);
		margin-bottom: var(--space-2);
	}

	/* decorative cube */
	.cube {
		position: relative;
		width: 84px;
		height: 84px;
		perspective: 200px;
		margin-bottom: var(--space-4);
	}
	.face {
		position: absolute;
		inset: 8px;
		border-radius: 16px;
		transform: rotate(-6deg);
	}
	.face.top {
		background: linear-gradient(145deg, var(--red-600), var(--red-700));
		transform: rotate(6deg) translateY(-6px);
		opacity: 0.55;
	}
	.face.box {
		display: grid;
		place-items: center;
		background: linear-gradient(145deg, var(--red-500), var(--red-600));
		color: #fff;
		font-weight: 800;
		font-size: 1.9rem;
		box-shadow: 0 18px 40px rgba(220, 38, 38, 0.35);
		animation: float 4s ease-in-out infinite;
	}
	@keyframes float {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-8px); }
	}

	.btn {
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
</style>
