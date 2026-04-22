#!/usr/bin/env node
// One-shot generator for /aboard page imagery. DALL-E 3 → public/aboard/*.png
// Requires OPENAI_API_KEY in the env (e.g. set in .env.local and sourced).
//
// Skips any slug whose file already exists, so it's safe to re-run after
// tweaking prompts for a subset.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/aboard/', import.meta.url));
mkdirSync(OUT_DIR, { recursive: true });

// Pull OPENAI_API_KEY from .env.local if not already in the env.
if (!process.env.OPENAI_API_KEY) {
	try {
		const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
		const m = env.match(/^OPENAI_API_KEY=(?:"([^"\n]+)"|([^\n]+))$/m);
		const val = m?.[1] ?? m?.[2];
		if (val) process.env.OPENAI_API_KEY = val.trim();
	} catch {}
}
if (!process.env.OPENAI_API_KEY) {
	console.error('OPENAI_API_KEY not set (env or .env.local).');
	process.exit(1);
}

// Scene descriptions. All images share a house style — painterly sci-fi,
// neon-orange + amber accents to match the site's palette, rendered like
// production concept art rather than cartoons. No text in the images.
const SCENES = [
	{
		slug: 'store',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a bustling sci-fi supply depot aboard a starship, run by cats. Orange-tabby shopkeeper cat in a vendor apron behind a counter; futuristic shelves stocked with brightly-coloured tactical hairball canisters, zero-gravity cat-tree modules, and glowing jars of "nebula nip" floating near LED signage. Deep space visible through a ribbed viewport; warm tungsten + neon-orange lighting, cool blue shadows, cinematic wide composition, painterly digital art, no text, no words.',
	},
	{
		slug: 'clinic',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a futuristic medical bay aboard a starship, staffed by cats. A white-coated tabby-cat doctor examines a small patient cat lying calmly on a glowing blue exam table. Hovering diagnostic scanners, bio-monitors with heart-paw waveforms, glass cabinets of vials. Clean sterile lighting with soft orange accent, deep-blue shadows, cinematic wide composition, painterly digital art, no text.',
	},
	{
		slug: 'restaurant',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of an elegant intergalactic restaurant aboard a starship, run by cats. A chef cat in whites plating a dish of glowing nebula-nachos with precision tweezers, sous-chef cats in the back by gleaming kitchen gear. Warm amber pendant lights, patrons at tables in the distance, star-filled viewport behind. Cinematic wide composition, painterly digital art, appetising, warm palette, no text.',
	},
	{
		slug: 'cinema',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a plush cinema hall aboard a starship filled with cats of every colour in red-velvet seats, watching an enormous projected scene of a cat astronaut on an alien planet. Dust-motes caught in the projector beam, warm orange glow, theatrical deep-red and gold tones, cinematic wide composition, painterly digital art, moody and atmospheric, no text.',
	},
	{
		slug: 'research',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a research lab aboard a starship. Cat scientists in lab coats and round glasses peering into microscopes and holographic displays full of swirling particle physics equations. A floating orb of light above a central workstation, bubbling tubes of iridescent liquid, whiteboards with chalked diagrams of paw-prints as orbital paths. Neon-orange + cyan accent lighting, cinematic wide composition, painterly digital art, no text.',
	},
	{
		slug: 'log',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a starship communications bridge at night. A tabby cat hunched over an old leather-bound logbook under the warm glow of a brass desk lamp, its pen poised mid-sentence, with a huge observation window behind showing the galaxy and a transmitting dish silhouetted against a nebula. Mood: quiet, introspective, late-watch. Rich amber and deep blue palette, cinematic wide composition, painterly digital art, no text.',
	},
	{
		slug: 'plans',
		size: '1792x1024',
		prompt:
			'Concept-art illustration of a decorated cat captain in a crisp white-and-orange starfleet uniform with a brass membership badge shaped like a paw-print, saluting on the bridge of a starship. Behind: the crew at their stations, star-streaked viewport, warm orange rim-lighting, hopeful and heroic mood. Cinematic wide composition, painterly digital art, no text.',
	},
];

async function generate(slug, prompt, size) {
	const res = await fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
		},
		body: JSON.stringify({ model: 'dall-e-3', prompt, size, n: 1 }),
	});
	if (!res.ok) {
		throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
	}
	const json = await res.json();
	const url = json.data?.[0]?.url;
	if (!url) throw new Error('no url in OpenAI response');
	const img = await fetch(url);
	if (!img.ok) throw new Error(`download ${img.status}`);
	const buf = new Uint8Array(await img.arrayBuffer());
	const outPath = `${OUT_DIR}${slug}.png`;
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, buf);
	return outPath;
}

async function main() {
	for (const scene of SCENES) {
		const outPath = `${OUT_DIR}${scene.slug}.png`;
		if (existsSync(outPath) && !process.env.REGENERATE) {
			console.log(`skip ${scene.slug} (exists, set REGENERATE=1 to overwrite)`);
			continue;
		}
		process.stdout.write(`generate ${scene.slug}... `);
		const t = Date.now();
		try {
			const p = await generate(scene.slug, scene.prompt, scene.size);
			console.log(`ok → ${p} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
		} catch (e) {
			console.log(`failed: ${e instanceof Error ? e.message : e}`);
		}
	}
	console.log('\ndone');
}

main().catch(err => { console.error(err); process.exit(1); });
