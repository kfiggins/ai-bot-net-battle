# SOUND_AND_MUSIC_PLAN.md

Deep-dive audio map for `ai-bot-net-battle`.

This is the **exhaustive implementation checklist** for current gameplay/client flow.
If an item is marked **[MANDATORY]**, it should not ship silent.
If **[OPTIONAL]**, it is polish and can come later.

---

## Audio Architecture (recommended)

Create one centralized audio layer in client:
- `client/src/audio.ts` (AudioManager)
- preload all SFX/music there
- expose `play(key, opts?)`, `setSfxEnabled`, `setMusicEnabled`, `setVolumes`

Use 3 buses:
- **UI bus** (quiet, short)
- **Gameplay bus** (combat/events)
- **Music bus** (looping tracks)

Add user settings:
- `SFX on/off`
- `Music on/off`
- `SFX volume`
- `Music volume`

---

## Event → Sound Matrix (deep dive)

## A) Menu / Lobby / Name Entry

### 1) Name Entry Join button hover/click — `client/src/name-entry.ts`
- Trigger: pointerover / pointerout / pointerdown on join button
- Sound:
  - hover: soft UI blip
  - click: confirm click
- Priority: **[MANDATORY]**
- AI prompt:
  - Hover: `"soft sci-fi ui hover blip, short 60ms, clean, non-intrusive"`
  - Click: `"sci-fi ui confirm click, short 100ms, crisp"`

### 2) Lobby Start Game button hover/click — `client/src/lobby.ts`
- Trigger: startButton pointerover/out/down
- Sound:
  - hover blip
  - start confirm / match-ready stinger
- Priority: **[MANDATORY]**
- AI prompt:
  - Start click: `"arcade match start confirm, short energetic stinger, 0.4s"`

### 3) Lobby toggles (Agent Mode / Dev Log) — `client/src/lobby.ts`
- Trigger: modeToggle pointerdown, devLogToggle pointerdown
- Sound:
  - toggle on/off click (slightly different pitch for ON/OFF)
- Priority: **[MANDATORY]**
- AI prompt: `"toggle ui click, digital, short 80ms, two pitch variants"`

### 4) Lobby/Name background ambience/music — `client/src/lobby.ts`, `client/src/name-entry.ts`, `client/src/starfield.ts`
- Trigger: scene create
- Sound:
  - menu music loop
  - optional subtle ambient bed
- Priority: **[MANDATORY]** (music), ambience optional
- AI prompt: `"seamless sci-fi menu loop, calm but hopeful, 90s"`

### 5) Room/network error cue — `client/src/net.ts` (`room_error`)
- Trigger: room full / invalid room state / errors
- Sound:
  - short muted error buzz
- Priority: **[MANDATORY]**
- AI prompt: `"ui error beep, soft low buzz, 120ms, non-harsh"`

---

## B) Core Player Combat + Controls

### 6) Primary fire (left click / space) — `client/src/game.ts` + fire handling
- Trigger: local player fire input accepted (sync with cooldown to avoid spam mismatch)
- Sound:
  - player bullet shot (distinct from enemy)
- Priority: **[MANDATORY]**
- AI prompt: `"player laser shot, crisp transient, 120ms, futuristic arcade"`

### 7) Homing missile ability (right click) — `client/src/game.ts` + cooldown HUD
- Trigger: missile launch accepted
- Sound:
  - launch whoosh + low impact transient
- Priority: **[MANDATORY]**
- AI prompt: `"sci-fi missile launch, short thrust whoosh + low thump, 250ms"`

### 8) Missile cooldown ready cue — `client/src/ui.ts` (`updateMissileCooldown`)
- Trigger: transitions from cooling down -> ready
- Sound:
  - subtle ready ping
- Priority: **[OPTIONAL]**
- AI prompt: `"ability ready ping, clean synth pluck, 120ms"`

### 9) Player hurt (local ship damaged) — `client/src/game.ts` + VFX hit flash path
- Trigger: local player HP decrease
- Sound:
  - shield/hull impact tone
- Priority: **[MANDATORY]**
- AI prompt: `"player hit shield crack, short 150ms, sci-fi impact"`

### 10) Player death + respawn — server-sim death/respawn reflected in client entity lifecycle
- Trigger: local player entity removed / re-added
- Sound:
  - death burst
  - respawn shimmer cue
- Priority: **[MANDATORY]**
- AI prompt:
  - Death: `"player ship death burst, dramatic short 400ms"`
  - Respawn: `"sci-fi respawn shimmer, bright 300ms"`

### 11) Leave button click — `client/src/game.ts`
- Trigger: leaveBtn pointerdown
- Sound:
  - UI back/leave click
- Priority: **[OPTIONAL]**

---

## C) Enemy Weapons + Threat Audio

### 12) Enemy bullet fire (minion/tower/phantom/nemesis bullets) — server AI events, rendered client-side
- Trigger: enemy projectile appears / local threat cadence
- Sound:
  - enemy plasma shot (different timbre from player)
- Priority: **[MANDATORY]**
- AI prompt: `"enemy plasma shot, medium pitch, gritty, 120ms"`

### 13) Missile tower burst / enemy missile launch
- Trigger: missile entities from enemy team appear
- Sound:
  - burst launch pattern cue
- Priority: **[MANDATORY]**
- AI prompt: `"triple missile pod burst, rapid launch pops, 300ms"`

### 14) Incoming missile warning (proximity alert)
- Trigger: hostile missile within threshold distance of local player
- Sound:
  - pulse warning beep (rate increases with proximity)
- Priority: **[OPTIONAL high-value]**
- AI prompt: `"danger lock-on beep, repeating, sharp but short"`

### 15) Phantom ship presence cue
- Trigger: phantom enters aggro/chase near local player
- Sound:
  - stealthy flutter/phase hum
- Priority: **[OPTIONAL]**
- AI prompt: `"spectral scout hum, airy sci-fi texture, short looping cue"`

---

## D) Kills / Explosions / VFX Coupling

### 16) Generic enemy death pop (minion/phantom)
- Trigger: entity removed + was alive
- Sound:
  - small pop explosion
- Priority: **[MANDATORY]**

### 17) Tower / missile tower destruction
- Trigger: tower entities die
- Sound:
  - medium structure explosion
- Priority: **[MANDATORY]**

### 18) Sub-base destruction
- Trigger: `sub_base` dies
- Sound:
  - heavy structure collapse cue
- Priority: **[MANDATORY]**
- AI prompt: `"large sci-fi structure collapse, metallic debris, 800ms"`

### 19) Mothership death sequence start
- Trigger: mothership death sequence begins
- Sound:
  - critical alarm + escalating detonation bed
- Priority: **[MANDATORY]**

### 20) Nemesis spawn / teleport blink
- Trigger: nemesis spawn and each teleport event
- Sound:
  - warp snap / distortion pop
- Priority: **[MANDATORY]**

### 21) Hit confirm (player dealt damage)
- Trigger: local bullets dealing damage
- Sound:
  - tiny hit tick
- Priority: **[OPTIONAL]**

---

## E) Progression / Economy / Rewards

### 22) Orb pickup (player)
- Trigger: local orb pickup
- Sound:
  - bright pickup chime
- Priority: **[MANDATORY]**

### 23) Level up
- Trigger: level increase / `LEVEL UP!` display
- Sound:
  - ascending level-up stinger
- Priority: **[MANDATORY]**

### 24) Upgrade point spent
- Trigger: upgrade button click accepted
- Sound:
  - powerup confirm tick
- Priority: **[MANDATORY]**

### 25) Cannon milestone unlocked
- Trigger: cannon count increase (UI notify)
- Sound:
  - stronger weapon-upgrade stinger
- Priority: **[MANDATORY]**

### 26) Enemy economy growth cue (bot resources) — optional
- Trigger: thresholds in `botResources` (e.g., 500/1000/1500)
- Sound:
  - subtle enemy-power pulse
- Priority: **[OPTIONAL]**

---

## F) Match State + Music

### 27) Match start music transition
- Trigger: `match_start`
- Sound:
  - fade from lobby music -> combat loop
- Priority: **[MANDATORY]**

### 28) Boss phase transition cues
- Trigger: phase changes in HUD (`updatePhase`)
- Sound:
  - short phase up/down cues
- Priority: **[MANDATORY]**

### 29) Shield state transitions
- Trigger: mothership/sub-base shielded -> vulnerable and vice versa
- Sound:
  - shield up hum pulse / shield down release
- Priority: **[MANDATORY]**

### 30) Nemesis phase music layer
- Trigger: Nemesis spawned
- Sound:
  - add high-tension layer over combat music
- Priority: **[OPTIONAL high-value]**

### 31) Victory / end-match result
- Trigger: victory panel shown (`showVictory`) / match_end
- Sound:
  - victory fanfare one-shot
- Priority: **[MANDATORY]**

### 32) Return to lobby button
- Trigger: victory return click
- Sound:
  - confirm/back UI click
- Priority: **[OPTIONAL]**

---

## 1st-pass implementation order (minimum viable audio)
1. UI hover/click/error + menu music
2. Player shot + enemy shot + missile launch
3. Orb pickup + level up + upgrade + cannon milestone
4. Enemy/tower/sub-base death cues
5. Mothership death + nemesis spawn/teleport
6. Phase/shield transition cues + victory stinger

---

## Naming key suggestions

Use stable keys like:
- `ui_hover`, `ui_click`, `ui_error`, `ui_toggle_on`, `ui_toggle_off`
- `weapon_player_shot`, `weapon_player_missile`, `weapon_enemy_shot`, `weapon_enemy_missile_burst`
- `player_hit`, `player_death`, `player_respawn`
- `enemy_death_small`, `enemy_tower_destroy`, `enemy_subbase_destroy`
- `pickup_orb`, `progress_level_up`, `progress_upgrade_apply`, `progress_cannon_unlock`
- `boss_shield_up`, `boss_shield_down`, `boss_mothership_critical`, `boss_nemesis_spawn`, `boss_nemesis_teleport`
- `state_match_start`, `state_phase_change`, `state_victory`
- `music_lobby_loop`, `music_match_loop`, `music_nemesis_layer`

---

## CLAUDE.md policy additions (recommended)

Add to root `CLAUDE.md`:

```md
## Audio Completeness Rule
For any player-visible feature/event, include an audio decision before done:
- Reuse existing sound key
- Add new sound key with intent
- Explicitly mark "no sound" with reason

Update docs/SOUND_AND_MUSIC_PLAN.md when adding new events.
```

Add to `client/CLAUDE.md`:

```md
### Audio Hook Requirement
Any new UI action, combat action, phase transition, or progression event must hook into AudioManager.
No silent major events.
```

Add to PR/commit checklist:

```md
- [ ] Audio mapped for new player-facing events
- [ ] Sound keys documented and volume category set
- [ ] New event not silently shipped unless justified
```

---

## Notes on AI-generated sound quality

For consistent outputs:
- SFX length target: 50ms–700ms
- Keep tails short for rapid-repeat events
- Generate multiple variants for frequently repeated cues (`shot_01`, `shot_02`, `shot_03`)
- Normalize loudness and remove low-end rumble from UI sounds

---

If needed, next step is a concrete `audio.ts` stub + hook map per file (`game.ts`, `ui.ts`, `lobby.ts`, `name-entry.ts`, `net.ts`) so implementation is copy/paste ready.
