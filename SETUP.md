# Debate Studio Setup

## What is included
- A Vite + React + TypeScript SPA scaffold
- Public marketing routes plus authenticated app routes
- Firebase-ready auth, Firestore, and Storage helpers
- Mock-backed fallbacks so the UI still renders before Firebase is configured
- Vitest and Playwright test scaffolding

## Local setup
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and add Firebase project values.
4. Run `npm run dev`.

## Firebase expectations
- Auth: email/password and Google sign-in
- Firestore collections: `users`, `speeches`, `debates`, `matchRequests`, `resources`, `channels`, `posts`, `events`
- Storage path pattern: `speeches/<timestamp>-<filename>`
- Optional emulator toggle: set `VITE_USE_FIREBASE_EMULATORS=true`

## Tabroom session linking
- Create a high-entropy secret of at least 32 characters and run `firebase functions:secrets:set TABROOM_SESSION_ENCRYPTION_KEY`.
- Deploy Functions and Firestore rules after setting the secret: `firebase deploy --only functions,firestore:rules`.
- Tabroom passwords are sent only to the link callable and are never stored. The resulting `TabroomToken` cookie is encrypted with AES-256-GCM in `tabroomSessions/{userId}`, which client Firestore rules deny access to.

## AI debate summaries
- Set the server-only OpenAI key with `firebase functions:secrets:set OPENAI_API_KEY`. Do not add it to a Vite environment file or expose it with a `VITE_` prefix.
- Install and build the Functions package with `npm --prefix functions install` and `npm --prefix functions run build`.
- Deploy the pipeline and its access rules with `firebase deploy --only functions,firestore:rules,storage`.
- Each debate-turn upload is limited to 25 MB and must be MP3, MP4, MPEG, MPGA, M4A, WAV, or WebM. The `transcribeDebateSpeech` Storage trigger uses `gpt-4o-mini-transcribe`.
- When the final configured speech is submitted, `summarizeCompletedDebate` waits for all transcripts and calls `gpt-5.4-nano` once with a strict JSON schema. The result, model, prompt version, and transcript document references are saved on the debate.
- Raw transcripts live in `debateTranscripts` and are denied to browser clients by Firestore rules. Inspect Cloud Functions logs if a debate shows a failed summary status.

## Local Storage CORS
- If browser uploads fail from `http://localhost:5173` with a CORS preflight error, apply the bucket CORS policy in [firebase.storage.cors.json](/Users/carolineliu/Documents/GitHub/debate/firebase.storage.cors.json).
- Example command: `gcloud storage buckets update gs://debate-b4abe.firebasestorage.app --cors-file=firebase.storage.cors.json`
- If you prefer emulators during development, set `VITE_USE_FIREBASE_EMULATORS=true` and run the Firebase emulators instead of the live bucket.

## Suggested next implementation steps
- Replace placeholder photography with licensed brand imagery or owned assets.
- Add Firestore security rules and a real user profile document shape.
- Connect community posting, resource bookmarking, and debate creation to write APIs.
- Evaluate summary attribution and evidence fidelity on several real debates before considering a larger summary model.
