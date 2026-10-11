# Reveal assets

## Native rebuild (Skia)

Phase A added `@shopify/react-native-skia` (Expo SDK 57 compatible). Starfield, burst, and foil FX in later phases draw on Skia. After pulling this dependency, rebuild the native binary (`npm run apk` or a custom Expo dev client). Expo Go may not include the linked native libs.

## Pack tear (Phase E)

Tear uses layered Views (`TearEffects` + `PackArtwork` seal/mouth) plus Skia `BurstEffects`. **Rive is not shipped** — add a `.riv` pack asset and a thin player only if device review still finds the tear cheap after native rebuild. Do not invent multi-card ownership in the client; décor backs remain anonymous until a backend multi-card decision.

## Audio assets


`seal-tear.wav` is an original, procedurally synthesized seal-friction/tear cue created for GrailHaus. It contains deterministic seeded high-pass noise with a short decay envelope; no third-party recordings or reference-video audio were used. Format: mono 16-bit PCM WAV, 22,050 Hz, approximately 220 ms. It is bundled locally and played at 45% player volume. Device listening and mixing review remain pending.


Additional original procedural cues: seal-friction.wav (100ms seeded noise), card-rise.wav (240ms rising tone/noise), card-rotation.wav (160ms shaped air noise), rarity-build.wav (420ms rising harmonic tone), and reveal-impact.wav (280ms decaying low impact). Each is mono 16-bit PCM at 22,050 Hz, generated with deterministic Python random seeds 1300–1304 and trigonometric envelopes; no recordings, third-party samples or reference audio were used. Peaks are below full scale. Final mix settings live centrally in revealAudio.ts: friction 12%, tear 45%, rise/rotation 20%, build 18–28%, impact 22–55% by stored rarity. Audio-format and peak checks pass; acoustic balance on device remains pending.

One event-driven player replaces the tear-only player. Short cues do not loop. Continuous pack ambience and separate spark/extra whoosh layers are intentionally omitted to keep the mix restrained. Card rise/rotation cover movement. No background music is present, so music ducking is not applicable.
