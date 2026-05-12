---
name: create-news-video
description: Tạo video ngắn 9:16 chất lượng cao từ URL bài báo, file .txt, hoặc ý tưởng tiếng Việt. Pipeline sinh storyboard, voice script, visual direction, caption, TTS và render MP4.
---

# Create News Video

Generate a Vietnamese short-form video from a URL, `.txt` file, or raw idea. The goal is a polished social video, not a static slide deck.

## Brand Image System

Always use the built-in YokDon image brand system unless the user explicitly asks for another style.

Brand source files:

- `brands/yokdon/visual_guideline.md`
- `brands/yokdon/prompt_template.json`

For every hook/body scene that would benefit from imagery, write a concrete `assetPrompt`. The pipeline will automatically expand that short scene prompt into a full brand-consistent image prompt and export it to `brand-asset-prompts.json`.

`assetPrompt` rules:

- Describe the actual visual subject, action, place, and time of day.
- Make it image-generator ready, but keep it short; do not repeat the full brand guideline.
- Prefer Yok Don-specific details: dry dipterocarp forest, Serepok river, rangers, villagers, conservation work, wildlife traces, dust, bark, leaves, river reflections.
- Do not ask for text in the image. Captions are rendered by the video template, not baked into generated images.
- Write prompts that work in vertical 9:16 and leave a safe center crop for social UI.

## Input

Accept one argument:

- URL starting with `http://` or `https://`
- Local `.txt` file
- Raw idea/topic text

## Workflow

### 1. Extract Source

URL mode:

- Fetch article title, main content, domain, and `og:image`.
- If the page is blocked, ask the user for pasted text or a `.txt` file.

File mode:

- Title = first non-empty line.
- Content = remaining text.
- Domain = `local`.
- Image = `null`.

Idea mode:

- Treat the input as content brief.
- Domain = `idea`.
- Image = `null`.

### 2. Create Output Directory

Create `output/<ascii-slug>-<YYYYMMDD-HHmm>/`.

Slug rules: lowercase ASCII, remove Vietnamese accents, replace non-alphanumeric runs with `-`, trim dashes, max 40 chars.

### 3. Write High-Quality Storyboard

Write `<outputDir>/script.json` using the current renderer schema. Do not use the old `visual` object.

Required top-level shape:

```json
{
  "version": "1.0",
  "metadata": {
    "title": "string",
    "source": {
      "url": "string",
      "domain": "string",
      "image": "https://... or null"
    },
    "channel": "Quoc YokDon"
  },
  "voice": {
    "provider": "lucylab",
    "voiceId": "${VIETNAMESE_VOICEID}",
    "speed": 1
  },
  "scenes": []
}
```

Scene count:

- 6-8 scenes for normal videos.
- Scene 1 must be `type: "hook"`.
- Last scene must be `type: "outro"`.
- Total voice script: 150-210 Vietnamese words for roughly 50-70 seconds.

Each non-outro scene should include:

```json
{
  "id": "body-1",
  "type": "body",
  "voiceText": "Vietnamese spoken narration.",
  "templateData": {},
  "caption": {
    "badge": "short label",
    "headline": "short on-screen caption",
    "subline": "optional supporting line"
  },
  "creative": {
    "tone": "studio",
    "accent": "cyan",
    "background": "abstract",
    "motion": "push-in",
    "density": "balanced"
  },
  "assetPrompt": "optional visual prompt for image generation or stock search"
}
```

If the source image is generic, missing, or not visually useful, prefer `assetPrompt` over `source-image`. The renderer can still use a fallback, but `brand-asset-prompts.json` becomes the queue for creating better scene images.

## Template Selection

Use varied templates. Avoid repeating the same body layout back to back.

Available templates:

- `hook`: strong first scene with headline and subhead.
- `image-card`: when a visual object/product/person/place matters.
- `steps`: when explaining a process.
- `timeline`: when showing sequence, schedule, or cause-effect.
- `stat-hero`: when a number is the story.
- `comparison`: when contrasting two choices/entities.
- `feature-list`: when grouping benefits or facts.
- `quote`: when the key point is a claim or takeaway.
- `callout`: when one statement needs emphasis.
- `outro`: final CTA.

Template data shapes:

```json
{ "template": "hook", "headline": "max 40", "subhead": "max 40", "bgSrc": "$source.image", "kenBurns": "zoom-in" }
{ "template": "image-card", "kicker": "max 24", "title": "max 48", "detail": "max 70" }
{ "template": "steps", "title": "max 42", "steps": ["2-4 items, each max 46"] }
{ "template": "timeline", "title": "max 42", "items": [{ "label": "max 24", "value": "max 44" }] }
{ "template": "stat-hero", "value": "max 20", "label": "max 40", "context": "max 50" }
{ "template": "comparison", "left": { "label": "max 30", "value": "max 20", "color": "cyan" }, "right": { "label": "max 30", "value": "max 20", "color": "purple", "winner": true } }
{ "template": "feature-list", "title": "max 40", "bullets": ["1-4 items, each max 50"] }
{ "template": "quote", "quote": "max 120", "attribution": "max 40" }
{ "template": "callout", "statement": "max 80", "tag": "max 20" }
{ "template": "outro", "ctaTop": "Theo dõi ngay", "channelName": "Quoc YokDon", "source": "<domain>" }
```

Creative options:

- `tone`: `studio`, `editorial`, `breaking`, `social`, `cinematic`, `minimal`
- `accent`: `cyan`, `purple`, `amber`, `rose`, `lime`, `blue`
- `background`: `source-image`, `abstract`, `gradient`, `split`, `none`
- `motion`: `push-in`, `pull-out`, `pan-left`, `pan-right`, `snap`, `float`
- `density`: `calm`, `balanced`, `high-energy`

Quality rules:

- Hook must start with tension, surprise, payoff, or a concrete number.
- `voiceText` must sound spoken, not like a formal article.
- Captions are short, punchy, and not identical to the voice text.
- Use `assetPrompt` for every scene that would benefit from generated/stock imagery.
- Asset prompts must follow the YokDon brand image system: cinematic documentary realism, Earth & Muted palette, natural low-key golden hour light, 35mm lens language, layered foreground, dry forest texture.
- Favor specific visuals over generic AI words: show objects, dashboards, places, people, devices, or diagrams.
- Use `source-image` or `split` only if the source image is relevant.
- Do not use emoji or markdown in `voiceText`.

Vietnamese TTS phonetic rules:

- Spell decimal/version numbers in `voiceText`: `GPT năm chấm năm`, not `GPT 5.5`.
- Spell percentages: `tám mươi hai phẩy bảy phần trăm`, not `82.7%`.
- Avoid symbols in `voiceText`: `%`, `$`, `→`, `&`, `#`, `+`, `=`.
- Keep English brand names as-is if common: `OpenAI`, `Apple`, `TikTok`.
- Write acronyms phonetically if needed: `API` can be `ây pi ai`.

### 4. Validate Before Running

Check silently:

- `script.json` parses as valid JSON.
- 5-8 scenes.
- First scene is hook, last scene is outro.
- `templateData.template` matches one supported template.
- Field lengths fit schema.
- Voice script is 150-210 words.
- No old `visual` object.

### 5. Run Pipeline

Run from project root:

```bash
npm run pipeline -- <outputDir>/script.json
```

If it fails, report the precise error and the output directory.

### 6. Report Result

Return links:

```markdown
Video:  [video.mp4](output/.../video.mp4)
Audio:  [voice.mp3](output/.../voice.mp3)
Script: [script.txt](output/.../script.txt)
```

## Recommended Story Arc

For tool/product/news videos:

1. Hook: the surprising promise or problem.
2. Context: why this matters now.
3. Process: how it works.
4. Visual proof: screenshots, product, dashboard, or artifact.
5. Limitation or tradeoff: keeps the video credible.
6. Payoff: what the viewer can do with it.
7. Outro: follow/CTA.
