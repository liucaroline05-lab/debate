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

## Suggested next implementation steps
- Replace placeholder photography with licensed brand imagery or owned assets.
- Add Firestore security rules and a real user profile document shape.
- Connect community posting, resource bookmarking, and debate creation to write APIs.
- Add transcript processing and AI recommendation jobs once backend orchestration is ready.
