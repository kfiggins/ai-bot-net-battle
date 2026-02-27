# Sound + Music Implementation Plan (Low-Complexity, High-Impact)

## Goal
Add audio in a way that improves game feel **without** adding major code complexity.

---

## 1) Priority Sound Effects (by game surface)

## Lobby / Menu

### A. UI Hover
- **When:** Hover over buttons/toggles (`Start`, mode toggles, dev log toggle, join)
- **Type:** Soft digital tick / blip
- **AI sound prompt:** "short clean UI hover blip, soft digital, 60ms, no reverb, non-intrusive"

### B. UI Click / Confirm
- **When:** Clicking buttons/toggles
- **Type:** Slightly stronger click/chirp than hover
- **AI sound prompt:** "short UI confirm click, bright but soft, 90ms, subtle synth click"

### C. Invalid / Error (room full, bad join state)
- **When:** `room_error` received
- **Type:** Brief muted buzzer
- **AI sound prompt:** "short UI error tone, low muted synth buzz, 120ms, not harsh"

### D. Match Start Stinger
- **When:** `match_start` event fires
- **Type:** Tiny hype stinger
- **AI sound prompt:** "short arcade match start stinger, energetic, 0.5s, sci-fi"

---

## In-Game Core Combat

### E. Player Shot (bullet)
- **When:** Local player fires main weapon
- **Type:** Crisp laser pop
- **AI sound prompt:** "retro sci-fi laser shot, punchy transient, 120ms, no tail mud"

### F. Right-Click Homing Missile Launch
- **When:** Homing missile ability triggered
- **Type:** Heavier launch with low-end thump
- **AI sound prompt:** "sci-fi missile launch, mechanical whoosh + low thump, 250ms"

### G. Enemy Bullet Shot
- **When:** Enemy towers/minions fire
- **Type:** Distinct from player shot (duller/red-team tone)
- **AI sound prompt:** "enemy plasma shot, medium pitch, gritty, 120ms"

### H. Missile Tower Burst Shot
- **When:** Missile towers fire burst
- **Type:** Triple pulse/launch feel
- **AI sound prompt:** "burst missile pod fire, three quick launch pops, 300ms"

### I. Hit Confirm (player dealt damage)
- **When:** Local player bullets hit enemy
- **Type:** Subtle tactile tick
- **AI sound prompt:** "tiny hit marker tick, sharp but quiet, 40ms"

### J. Player Hurt
- **When:** Local player takes damage
- **Type:** Soft impact + shield crack
- **AI sound prompt:** "player damage impact, short shield crackle, 150ms"

### K. Enemy Death Pop (minion/phantom)
- **When:** Minion/phantom dies
- **Type:** Small explosion pop
- **AI sound prompt:** "small sci-fi explosion pop, 180ms, crisp"

### L. Tower Destruction
- **When:** Tower/missile tower destroyed
- **Type:** Medium explosion + debris tone
- **AI sound prompt:** "medium structure explosion, mechanical debris, 500ms"

### M. Player Death
- **When:** Local player dies/respawns
- **Type:** Distinct fail cue + brief respawn shimmer
- **AI sound prompt:** "player death burst, dramatic but short, 400ms" 

---

## Boss / Event Moments

### N. Mothership Shield Up / Locked
- **When:** Shielded objective state starts/returns
- **Type:** Low humming shield cue
- **AI sound prompt:** "sci-fi shield hum pulse, low and ominous, 500ms"

### O. Mothership Vulnerable
- **When:** Shield drops (phase transition)
- **Type:** Shield-down release sweep
- **AI sound prompt:** "energy shield drop, descending sweep, 600ms"

### P. Mothership Death Sequence Start
- **When:** 2-second death sequence begins
- **Type:** Large alarm/explosion lead-in
- **AI sound prompt:** "boss core critical alarm + swell, 1s, high tension"

### Q. Nemesis Spawn / Teleport Blink
- **When:** Nemesis appears / blink event
- **Type:** Distortion warp snap
- **AI sound prompt:** "sci-fi teleport warp snap, phase distortion, 200ms"

### R. Victory
- **When:** `matchOver` true and victory shown
- **Type:** Short positive fanfare
- **AI sound prompt:** "victory fanfare, sci-fi arcade, triumphant, 1.5s"

---

## Progression / Economy Feedback

### S. Orb Pickup (player)
- **When:** Player collects XP orb
- **Type:** Light sparkle chime
- **AI sound prompt:** "small energy pickup chime, bright, 120ms"

### T. Level Up
- **When:** Player levels up
- **Type:** Clear ascending tone
- **AI sound prompt:** "arcade level-up arpeggio, uplifting, 400ms"

### U. Upgrade Applied
- **When:** Upgrade button chosen
- **Type:** Mechanical power-up click
- **AI sound prompt:** "power-up confirm click + short rise, 250ms"

### V. Cannon Milestone Unlock
- **When:** cannon count increases
- **Type:** Bigger progression sting
- **AI sound prompt:** "weapon upgrade stinger, metallic sci-fi, 600ms"

---

## 2) Music Plan (safe, low complexity)

## Track 1 — Menu / Lobby Loop
- **Mood:** Chill futuristic, anticipation
- **Tempo:** 85-100 BPM
- **Length:** 45-90s seamless loop
- **Prompt:** "ambient synthwave game menu loop, calm but heroic, seamless loop"

## Track 2 — Match Core Combat Loop
- **Mood:** Energetic focus
- **Tempo:** 110-130 BPM
- **Length:** 60-120s loop
- **Prompt:** "arcade sci-fi combat loop, driving rhythm, no vocals, seamless"

## Track 3 — Boss/Nemesis Intensifier Layer (optional)
- **Mood:** Tension spike
- **Use:** Fade in at nemesis/boss critical moments
- **Prompt:** "high tension boss layer, pulsing synth + percussion, loopable"

## Track 4 — Victory/Result Jingle
- **Mood:** Reward payoff
- **Length:** 2-4s one-shot
- **Prompt:** "short victory jingle, bright sci-fi arcade"

---

## 3) Implementation order (recommended)
1. UI hover/click + player shot + orb pickup + level up
2. Enemy shot/hit/death + tower destroy
3. Boss shield/vulnerable/death + nemesis spawn
4. Music (menu + match), then optional boss layer

This gives immediate feel improvements early without deep refactors.

---

## 4) Simple technical guardrails
- Use one centralized audio manager (`client/src/audio.ts`) with named keys.
- Keep SFX under ~0.6s where possible.
- Normalize volume per category:
  - UI: 0.25-0.4
  - Combat: 0.35-0.55
  - Boss/Events: 0.45-0.7
  - Music: 0.12-0.28
- Add master toggles in settings:
  - `SFX On/Off`
  - `Music On/Off`
  - Optional sliders

---

## 5) Suggested `CLAUDE.md` additions (to enforce sound discipline)

Add a small checklist like this in root `CLAUDE.md`:

```md
## Audio Checklist (Required for New Features)
When adding any new gameplay event, ask:
- Does this event need an SFX cue?
- Does it need a unique cue or reuse existing category audio?
- Is there a UI feedback sound needed?
- Should music intensity change at this event?

If yes, update:
- docs/SOUND_AND_MUSIC_PLAN.md (map event -> sound intent)
- client/src/audio.ts (sound key + preload + playback hook)
```

And for package-level `client/CLAUDE.md`:

```md
### Audio Rule
Any new player-visible action/event should either:
1) map to an existing sound key, or
2) add a new sound key with a one-line intent description.
No silent major gameplay events.
```

---

## 6) Optional extra quick wins
- Add tiny pitch randomization (+/- 3%) to repeated shots to reduce ear fatigue.
- Add distance/priority ducking later (not required for phase 1).
- Add "low HP heartbeat" cue for player awareness.

---

If you want, next step is I can create a ready-to-drop `client/src/audio.ts` skeleton with key names matching this doc.
