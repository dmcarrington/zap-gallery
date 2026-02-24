<script lang="ts">
	import { BLOSSOM_MAX_FILE_SIZE_MB } from '$lib/config';
	import { validateFileSize, uploadToBlossom, generateThumbnail, createNip07Signer } from '$lib/blossom';
	import { storeImageUrl } from '$lib/nostr/keys';
	import { KIND_IMAGE_LISTING } from '$lib/nostr/events';
	import { ndk } from '$lib/ndk';
	import { NDKEvent } from '@nostr-dev-kit/ndk';
	import { goto } from '$app/navigation';

	let file = $state<File | null>(null);
	let title = $state('');
	let description = $state('');
	let priceSats = $state(1000);
	let fileSizeError = $state<string | null>(null);
	let fileSizeDisplay = $state<string | null>(null);

	type UploadStep = 'idle' | 'thumbnail' | 'uploading-thumb' | 'uploading-full' | 'publishing' | 'storing-url' | 'done' | 'error';
	let step = $state<UploadStep>('idle');
	let uploadError = $state<string | null>(null);

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const selected = input.files?.[0] ?? null;
		file = selected;
		fileSizeError = null;
		fileSizeDisplay = null;

		if (selected) {
			fileSizeDisplay = `${(selected.size / (1024 * 1024)).toFixed(1)} MB`;
			const validation = validateFileSize(selected);
			if (!validation.ok) {
				fileSizeError = validation.error ?? 'File too large';
			}
		}
	}

	let canSubmit = $derived(file !== null && !fileSizeError && title.trim().length > 0 && step === 'idle');

	function getSigner() {
		return createNip07Signer();
	}

	function generateSlug(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			+ '-' + Date.now().toString(36);
	}

	async function handleUpload() {
		if (!file || !canSubmit) return;

		uploadError = null;
		const signer = getSigner();
		const slug = generateSlug(title);
		const mimeType = file.type || 'image/jpeg';

		try {
			// Step 1: Generate thumbnail
			step = 'thumbnail';
			const thumbBlob = await generateThumbnail(file, 400);

			// Step 2: Upload thumbnail to Blossom
			step = 'uploading-thumb';
			const thumbDescriptor = await uploadToBlossom(thumbBlob, signer);

			// Step 3: Upload full-res image to Blossom
			step = 'uploading-full';
			const fullResDescriptor = await uploadToBlossom(file, signer);

			// Step 4: Publish kind 30024 image listing event
			// Note: full_res_url is NOT included in the public event — it's stored
			// encrypted separately so only the owner can retrieve it
			step = 'publishing';
			const event = new NDKEvent(ndk);
			event.kind = KIND_IMAGE_LISTING;
			event.content = description;
			event.tags = [
				['d', slug],
				['title', title],
				['price', priceSats.toString()],
				['thumb', thumbDescriptor.url],
				['m', mimeType],
				['thumb_sha256', thumbDescriptor.sha256]
			];

			await event.publish();

			// Step 5: Store full-res URL (encrypted to owner)
			step = 'storing-url';
			await storeImageUrl({ url: fullResDescriptor.url, slug, mimeType });

			step = 'done';

			// Redirect to admin after short delay
			setTimeout(() => goto('/admin'), 1500);
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
			step = 'error';
		}
	}

	const stepLabels: Record<UploadStep, string> = {
		idle: '',
		thumbnail: 'Generating thumbnail...',
		'uploading-thumb': 'Uploading thumbnail to Blossom...',
		'uploading-full': 'Uploading full-res image to Blossom...',
		publishing: 'Publishing to Nostr relays...',
		'storing-url': 'Storing image URL...',
		done: 'Upload complete!',
		error: 'Upload failed'
	};

	const stepIndex: Record<UploadStep, number> = {
		idle: 0, thumbnail: 1, 'uploading-thumb': 2,
		'uploading-full': 3, publishing: 4, 'storing-url': 5, done: 6, error: -1
	};

	const totalSteps = 6;
</script>

<div class="mx-auto max-w-xl space-y-6">
	<div class="flex items-center gap-4">
		<a href="/admin" class="text-sm text-gray-400 hover:text-white transition-colors">
			&larr; Back
		</a>
		<h1 class="text-2xl font-bold">Upload Image</h1>
	</div>

	{#if step !== 'idle' && step !== 'error'}
		<!-- Upload progress -->
		<div class="space-y-3">
			<div class="flex justify-between text-sm">
				<span class="text-gray-300">{stepLabels[step]}</span>
				{#if step !== 'done'}
					<span class="text-gray-500">{stepIndex[step]}/{totalSteps}</span>
				{/if}
			</div>
			<div class="w-full bg-gray-800 rounded-full h-2">
				<div
					class="h-2 rounded-full transition-all duration-300 {step === 'done' ? 'bg-green-500' : 'bg-purple-500'}"
					style="width: {(stepIndex[step] / totalSteps) * 100}%"
				></div>
			</div>
			{#if step === 'done'}
				<p class="text-green-400 text-center text-sm">Redirecting to dashboard...</p>
			{/if}
		</div>
	{:else}
		<!-- Upload form -->
		<form class="space-y-4" onsubmit={(e) => { e.preventDefault(); handleUpload(); }}>
			<div>
				<label for="file" class="block text-sm font-medium text-gray-300 mb-1">
					Image file
					<span class="text-gray-500">(max {BLOSSOM_MAX_FILE_SIZE_MB} MB)</span>
				</label>
				<input
					id="file"
					type="file"
					accept="image/*"
					onchange={handleFileSelect}
					class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-800 file:text-white hover:file:bg-gray-700 file:cursor-pointer"
				/>
				{#if fileSizeDisplay && !fileSizeError}
					<p class="text-xs text-gray-500 mt-1">
						{file?.name} — {fileSizeDisplay}
					</p>
				{/if}
				{#if fileSizeError}
					<p class="text-sm text-red-400 mt-1">{fileSizeError}</p>
				{/if}
			</div>

			<div>
				<label for="title" class="block text-sm font-medium text-gray-300 mb-1">Title</label>
				<input
					id="title"
					type="text"
					bind:value={title}
					placeholder="Photo title"
					class="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
				/>
			</div>

			<div>
				<label for="description" class="block text-sm font-medium text-gray-300 mb-1">
					Description
				</label>
				<textarea
					id="description"
					bind:value={description}
					placeholder="Optional description"
					rows={3}
					class="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none resize-none"
				></textarea>
			</div>

			<div>
				<label for="price" class="block text-sm font-medium text-gray-300 mb-1">
					Price (sats)
				</label>
				<input
					id="price"
					type="number"
					bind:value={priceSats}
					min={1}
					class="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white focus:border-purple-500 focus:outline-none"
				/>
			</div>

			{#if uploadError}
				<p class="text-sm text-red-400">{uploadError}</p>
			{/if}

			<button
				type="submit"
				disabled={!canSubmit}
				class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors cursor-pointer"
			>
				Upload & Publish
			</button>
		</form>
	{/if}
</div>
