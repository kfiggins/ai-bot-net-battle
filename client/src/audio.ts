import Phaser from "phaser";

export type AudioKey =
  | "ui_hover"
  | "ui_click"
  | "ui_error"
  | "ui_toggle_on"
  | "ui_toggle_off"
  | "weapon_player_shot"
  | "weapon_player_missile"
  | "weapon_enemy_shot"
  | "weapon_enemy_missile_burst"
  | "player_hit"
  | "player_death"
  | "player_respawn"
  | "enemy_death_small"
  | "enemy_tower_destroy"
  | "enemy_subbase_destroy"
  | "pickup_orb"
  | "progress_level_up"
  | "progress_upgrade_apply"
  | "progress_cannon_unlock"
  | "boss_shield_up"
  | "boss_shield_down"
  | "boss_mothership_critical"
  | "boss_nemesis_spawn"
  | "boss_nemesis_teleport"
  | "state_match_start"
  | "state_phase_change"
  | "state_victory"
  | "music_lobby_loop"
  | "music_match_loop"
  | "music_nemesis_layer";

export type AudioCategory = "ui" | "gameplay" | "music";

export interface AudioSettings {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  sfxVolume: number; // 0..1
  musicVolume: number; // 0..1
}

interface AudioDef {
  key: AudioKey;
  path: string;
  category: AudioCategory;
  loop?: boolean;
  baseVolume: number;
}

const STORAGE_KEY = "audioSettings";

const AUDIO_DEFS: AudioDef[] = [
  // UI
  { key: "ui_hover", path: "assets/audio/ui_hover.ogg", category: "ui", baseVolume: 0.25 },
  { key: "ui_click", path: "assets/audio/ui_click.ogg", category: "ui", baseVolume: 0.35 },
  { key: "ui_error", path: "assets/audio/ui_error.ogg", category: "ui", baseVolume: 0.4 },
  { key: "ui_toggle_on", path: "assets/audio/ui_toggle_on.ogg", category: "ui", baseVolume: 0.3 },
  { key: "ui_toggle_off", path: "assets/audio/ui_toggle_off.ogg", category: "ui", baseVolume: 0.3 },

  // Gameplay
  { key: "weapon_player_shot", path: "assets/audio/weapon_player_shot.ogg", category: "gameplay", baseVolume: 0.45 },
  { key: "weapon_player_missile", path: "assets/audio/weapon_player_missile.ogg", category: "gameplay", baseVolume: 0.55 },
  { key: "weapon_enemy_shot", path: "assets/audio/weapon_enemy_shot.ogg", category: "gameplay", baseVolume: 0.4 },
  { key: "weapon_enemy_missile_burst", path: "assets/audio/weapon_enemy_missile_burst.ogg", category: "gameplay", baseVolume: 0.5 },
  { key: "player_hit", path: "assets/audio/player_hit.ogg", category: "gameplay", baseVolume: 0.5 },
  { key: "player_death", path: "assets/audio/player_death.ogg", category: "gameplay", baseVolume: 0.6 },
  { key: "player_respawn", path: "assets/audio/player_respawn.ogg", category: "gameplay", baseVolume: 0.45 },
  { key: "enemy_death_small", path: "assets/audio/enemy_death_small.ogg", category: "gameplay", baseVolume: 0.42 },
  { key: "enemy_tower_destroy", path: "assets/audio/enemy_tower_destroy.ogg", category: "gameplay", baseVolume: 0.6 },
  { key: "enemy_subbase_destroy", path: "assets/audio/enemy_subbase_destroy.ogg", category: "gameplay", baseVolume: 0.65 },
  { key: "pickup_orb", path: "assets/audio/pickup_orb.ogg", category: "gameplay", baseVolume: 0.35 },
  { key: "progress_level_up", path: "assets/audio/progress_level_up.ogg", category: "gameplay", baseVolume: 0.55 },
  { key: "progress_upgrade_apply", path: "assets/audio/progress_upgrade_apply.ogg", category: "gameplay", baseVolume: 0.45 },
  { key: "progress_cannon_unlock", path: "assets/audio/progress_cannon_unlock.ogg", category: "gameplay", baseVolume: 0.58 },
  { key: "boss_shield_up", path: "assets/audio/boss_shield_up.ogg", category: "gameplay", baseVolume: 0.55 },
  { key: "boss_shield_down", path: "assets/audio/boss_shield_down.ogg", category: "gameplay", baseVolume: 0.55 },
  { key: "boss_mothership_critical", path: "assets/audio/boss_mothership_critical.ogg", category: "gameplay", baseVolume: 0.7 },
  { key: "boss_nemesis_spawn", path: "assets/audio/boss_nemesis_spawn.ogg", category: "gameplay", baseVolume: 0.68 },
  { key: "boss_nemesis_teleport", path: "assets/audio/boss_nemesis_teleport.ogg", category: "gameplay", baseVolume: 0.6 },
  { key: "state_match_start", path: "assets/audio/state_match_start.ogg", category: "gameplay", baseVolume: 0.5 },
  { key: "state_phase_change", path: "assets/audio/state_phase_change.ogg", category: "gameplay", baseVolume: 0.48 },
  { key: "state_victory", path: "assets/audio/state_victory.ogg", category: "gameplay", baseVolume: 0.6 },

  // Music
  { key: "music_lobby_loop", path: "assets/audio/music_lobby_loop.ogg", category: "music", baseVolume: 0.2, loop: true },
  { key: "music_match_loop", path: "assets/audio/music_match_loop.ogg", category: "music", baseVolume: 0.24, loop: true },
  { key: "music_nemesis_layer", path: "assets/audio/music_nemesis_layer.ogg", category: "music", baseVolume: 0.18, loop: true },
];

export class AudioManager {
  private readonly scene: Phaser.Scene;
  private settings: AudioSettings;
  private activeMusic: Partial<Record<AudioKey, Phaser.Sound.BaseSound>> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.settings = this.loadSettings();
  }

  static preload(scene: Phaser.Scene): void {
    for (const def of AUDIO_DEFS) {
      scene.load.audio(def.key, def.path);
    }
  }

  play(key: AudioKey, config?: Phaser.Types.Sound.SoundConfig): void {
    const def = AUDIO_DEFS.find((d) => d.key === key);
    if (!def) return;

    if (def.category === "music") {
      if (!this.settings.musicEnabled) return;
    } else {
      if (!this.settings.sfxEnabled) return;
    }

    const categoryVolume = def.category === "music" ? this.settings.musicVolume : this.settings.sfxVolume;
    const volume = (config?.volume ?? 1) * def.baseVolume * categoryVolume;

    this.scene.sound.play(key, { ...config, volume, loop: config?.loop ?? def.loop ?? false });
  }

  playMusic(key: Extract<AudioKey, "music_lobby_loop" | "music_match_loop" | "music_nemesis_layer">): void {
    if (!this.settings.musicEnabled) return;
    if (this.activeMusic[key]?.isPlaying) return;

    const def = AUDIO_DEFS.find((d) => d.key === key);
    if (!def) return;

    const snd = this.scene.sound.add(key, {
      loop: true,
      volume: def.baseVolume * this.settings.musicVolume,
    });
    snd.play();
    this.activeMusic[key] = snd;
  }

  stopMusic(key?: Extract<AudioKey, "music_lobby_loop" | "music_match_loop" | "music_nemesis_layer">): void {
    if (key) {
      this.activeMusic[key]?.stop();
      delete this.activeMusic[key];
      return;
    }

    for (const k of Object.keys(this.activeMusic) as AudioKey[]) {
      this.activeMusic[k]?.stop();
      delete this.activeMusic[k];
    }
  }

  setSfxEnabled(enabled: boolean): void {
    this.settings.sfxEnabled = enabled;
    this.saveSettings();
  }

  setMusicEnabled(enabled: boolean): void {
    this.settings.musicEnabled = enabled;
    if (!enabled) this.stopMusic();
    this.saveSettings();
  }

  setSfxVolume(v: number): void {
    this.settings.sfxVolume = clamp01(v);
    this.saveSettings();
  }

  setMusicVolume(v: number): void {
    this.settings.musicVolume = clamp01(v);
    this.refreshMusicVolumes();
    this.saveSettings();
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private refreshMusicVolumes(): void {
    for (const k of Object.keys(this.activeMusic) as AudioKey[]) {
      const def = AUDIO_DEFS.find((d) => d.key === k);
      if (!def || def.category !== "music") continue;
      const snd = this.activeMusic[k];
      if (snd) snd.setVolume(def.baseVolume * this.settings.musicVolume);
    }
  }

  private loadSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults();
      const parsed = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        sfxEnabled: parsed.sfxEnabled ?? true,
        musicEnabled: parsed.musicEnabled ?? true,
        sfxVolume: clamp01(parsed.sfxVolume ?? 1),
        musicVolume: clamp01(parsed.musicVolume ?? 1),
      };
    } catch {
      return defaults();
    }
  }

  private saveSettings(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function defaults(): AudioSettings {
  return {
    sfxEnabled: true,
    musicEnabled: true,
    sfxVolume: 1,
    musicVolume: 1,
  };
}
