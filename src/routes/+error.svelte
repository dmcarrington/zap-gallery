<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex flex-col items-center justify-center py-20 text-center">
	<h1 class="text-4xl font-bold text-gray-400">{page.status}</h1>
	<p class="mt-2 text-gray-500">{page.error?.message ?? 'Something went wrong'}</p>
	<a href="/" class="mt-4 text-purple-400 hover:text-purple-300 transition-colors">
		Back to gallery
	</a>
</div>
