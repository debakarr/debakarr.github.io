// LumiQuest's orchestrator: owns the renderer, the world, the player, the
// creatures and villagers, the systems and the UI, and runs the phases:
// loading → title → character select → customize → starter → intro → play.

import { PointLight, Vector3 } from 'three';
import { hashString, Rng } from '../shared/rng';
import { presetAppearance, type Appearance } from './data/characters';
import { ITEM_BY_ID } from './data/items';
import { ABILITIES, SPECIES_BY_ID, variantName, type AbilityId, type SpeciesId } from './data/species';
import { BEACON, LOCATIONS, PLAYER_START, WATER_LEVEL, LOCATION_BY_ID } from './data/world';
import { dialogueFor, type DialogueHost } from './data/dialogue';
import { Audio } from './engine/audio';
import { CameraRig } from './engine/camera';
import { Input } from './engine/input';
import { RenderHost, resolveTier, PROFILES } from './engine/renderer';
import { CharacterModel } from './entities/character';
import type { Creature } from './entities/creature';
import { buildCreature, type CreatureModel } from './entities/creatureModel';
import { Creatures } from './entities/creatures';
import { buildNpcs, type Npc } from './entities/npc';
import { Player } from './entities/player';
import { bestFood, bond, canResonate, feed, preference, resonanceFailed, type Conditions } from './systems/bonding';
import { QUEST_BY_ID, Quests, type QuestDef } from './systems/quests';
import { deleteSave, loadGame, loadSettings, saveGame, saveSettings, type Settings } from './systems/save';
import { day, hourOfDay, isNight, newState, type GameState, type WeatherKind } from './systems/state';
import { Fx } from './world/fx';
import { Interactables, type Entry, type InteractHost } from './world/interactables';
import { World } from './world/world';
import { Studio } from './ui/studio';
import { UI } from './ui/ui';
import { Autopilot } from './systems/auto';
import { Post } from './engine/post';

export type Phase = 'loading' | 'title' | 'charselect' | 'customize' | 'starter' | 'intro' | 'play' | 'error';

export type Target =
  | { kind: 'interact'; entry: Entry }
  | { kind: 'creature'; creature: Creature; dist: number }
  | { kind: 'npc'; npc: Npc };

export class Game implements InteractHost, DialogueHost {
  readonly host: RenderHost;
  settings: Settings;
  readonly audio = new Audio();
  readonly input: Input;
  readonly rig: CameraRig;
  world!: World;
  player!: Player;
  creatures!: Creatures;
  npcs: Npc[] = [];
  interact!: Interactables;
  readonly fx = new Fx();
  readonly studio = new Studio();
  readonly ui: UI;
  readonly post: Post;
  state!: GameState;
  quests!: Quests;
  phase: Phase = 'loading';
  /** Name of the open panel/dialogue, or null when playing freely. */
  modal: string | null = null;
  paused = false;
  draft: { appearance: Appearance; starter: SpeciesId; starterName: string } = { appearance: presetAppearance('aero'), starter: 'flamkit', starterName: '' };
  target: Target | null = null;
  readonly playerPos = new Vector3();
  private last = performance.now();
  private time = 0;
  private slowTick = 0;
  private saveTick = 0;
  private observing: { creature: Creature; t: number } | null = null;
  private titleModels: { char: CharacterModel; pet: CreatureModel } | null = null;
  private cinematic: { t: number; dur: number; path: (k: number) => { pos: Vector3; look: Vector3 }; done: () => void } | null = null;
  auto: Autopilot | null = null;
  private visible = true;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  saveWarning: string | undefined;

  constructor(readonly root: HTMLElement) {
    this.settings = loadSettings();
    this.audio.volumes = { master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx, ambient: this.settings.ambient };
    this.host = new RenderHost(root, this.settings.quality);
    this.rig = new CameraRig(this.host.width / this.host.height, this.settings.fov);
    this.rig.sensitivity = this.settings.sensitivity;
    this.rig.invertY = this.settings.invertY;
    this.input = new Input(this.host.canvas, this.settings.bindings);
    this.post = new Post(this.host.renderer);
    this.host.onResize = (w, h, pr) => this.post.resize(w, h, pr);
    this.ui = new UI(this, root);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.visible = document.visibilityState === 'visible';
      if (!this.visible) {
        this.audio.suspend();
        if (this.phase === 'play') {
          this.saveNow(true);
          if (!this.modal) this.pause();
        }
      } else this.audio.resume();
    });
    window.addEventListener('pagehide', () => {
      if (this.phase === 'play') this.saveNow(true);
    });
    // unlock audio on the first gesture
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    this.input.onKey = (e) => this.onKey(e);
    this.input.onLockLost = () => {
      if (this.phase === 'play' && !this.modal && !this.paused && !this.cinematic) this.pause();
    };
  }

  // -------------------------------------------------------------------------
  // Boot

  async start(): Promise<void> {
    this.ui.loading(0.02, 'Preparing Lumeria');
    await frame();
    try {
      this.world = new World(this.host.renderer, this.host.profile, (p, label) => this.ui.loading(p, label));
      await frame();
      this.ui.loading(0.75, 'Waking the villagers');
      this.world.scene.add(this.fx.group);
      this.world.scene.add(this.rig.camera);
      this.npcs = buildNpcs(this.world.terrain, this.world.physics, this.world.scene);
      await frame();
      this.ui.loading(0.85, 'Lighting the lanterns');
      // compile shaders up front so the first frames do not stutter
      this.placeTitleCamera();
      this.host.renderer.shadowMap.enabled = this.settings.shadows;
      this.post.setEnabled(this.host.profile.tier !== 'low', this.world.scene, this.rig.camera);
      this.post.resize(this.host.width, this.host.height, this.host.renderer.getPixelRatio());
      this.host.renderer.compile(this.world.scene, this.rig.camera);
      await frame();
      this.ui.loading(1, 'Ready');
      const res = loadGame();
      this.saveWarning = res.warning;
      this.showTitle();
    } catch (err) {
      console.error(err);
      this.phase = 'error';
      this.ui.error('LumiQuest could not build its world on this device.', String((err as Error)?.message ?? err));
      return;
    }
    this.host.renderer.setAnimationLoop(() => this.frame());
  }

  private resize(): void {
    this.host.resize();
    this.rig.setAspect(this.host.width / this.host.height);
  }

  // -------------------------------------------------------------------------
  // Title and creation

  showTitle(): void {
    this.phase = 'title';
    this.modal = null;
    this.input.gameplay = false;
    this.input.releaseLock();
    this.cleanupPlay();
    this.placeTitleCamera();
    this.ui.title(loadGame().state !== null, this.saveWarning);
    this.saveWarning = undefined;
  }

  private placeTitleCamera(): void {
    const t = this.world.terrain;
    // a meadow vantage point looking across the vale to Beacon Hill
    const cam = new Vector3(-50, 0, 60);
    cam.y = t.height(cam.x, cam.z) + 1.75;
    const far = new Vector3(-6, 0, 18);
    const f = far.clone().sub(cam).setY(0).normalize();
    const right = new Vector3(-f.z, 0, f.x);
    const look = cam.clone().addScaledVector(f, 40).add(new Vector3(0, 3.2, 0));
    this.rig.shot = { pos: cam, look };
    this.rig.snap();
    if (!this.titleModels) {
      const char = new CharacterModel(presetAppearance('aero'));
      const cp = cam.clone().addScaledVector(f, 5.2).addScaledVector(right, 1.5);
      char.root.position.set(cp.x, t.height(cp.x, cp.z), cp.z);
      char.root.rotation.y = Math.atan2(f.x, f.z) - 0.25;
      char.animator.play('idle', 0);
      this.world.scene.add(char.root);
      const pet = buildCreature('flamkit', null);
      const pp = cam.clone().addScaledVector(f, 4.6).addScaledVector(right, 2.6);
      pet.root.position.set(pp.x, t.height(pp.x, pp.z), pp.z);
      pet.root.rotation.y = Math.atan2(-f.x, -f.z) + 0.9;
      this.world.scene.add(pet.root);
      this.titleModels = { char, pet };
    }
    this.titleModels.char.root.visible = true;
    this.titleModels.pet.root.visible = true;
  }

  private hideTitleModels(): void {
    if (!this.titleModels) return;
    this.titleModels.char.dispose();
    this.titleModels.pet.dispose();
    this.titleModels = null;
  }

  newGame(): void {
    this.audio.click();
    this.draft = { appearance: presetAppearance('aero'), starter: 'flamkit', starterName: '' };
    this.phase = 'charselect';
    this.ui.charSelect();
  }

  toCustomize(presetId: string, keepLook = false): void {
    if (!keepLook) this.draft.appearance = presetAppearance(presetId);
    this.phase = 'customize';
    this.ui.customize();
  }

  toStarter(): void {
    this.phase = 'starter';
    this.ui.starter();
  }

  /** Creates the profile and plays the introduction. */
  beginAdventure(species: SpeciesId, name: string): void {
    this.draft.starter = species;
    this.draft.starterName = name.trim().slice(0, 16) || SPECIES_BY_ID[species].name;
    this.state = newState(this.draft.appearance, species, this.draft.starterName);
    deleteSave();
    this.enterWorld(true);
  }

  continueGame(): void {
    const res = loadGame();
    if (!res.state) {
      this.ui.toast(res.warning ?? 'No saved game found.', 'warn');
      this.showTitle();
      return;
    }
    this.state = res.state;
    if (res.warning) setTimeout(() => this.toast(res.warning!, 'warn'), 1500);
    this.enterWorld(false);
  }

  private enterWorld(intro: boolean): void {
    this.studio.clear();
    this.hideTitleModels();
    this.cleanupPlay();
    const s = this.state;
    this.quests = new Quests(s, {
      onStart: (q) => this.questStarted(q),
      onStage: (q) => this.questAdvanced(q),
      onComplete: (q) => this.questComplete(q),
    });
    this.player = new Player(s.appearance, this.world.terrain, this.world.physics);
    this.world.scene.add(this.player.model.root);
    this.player.place(s.player.x, s.player.y, s.player.z, s.player.yaw);
    this.player.onStep = (surf) => this.audio.step(surf);
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = () => this.audio.land();
    this.player.onSplash = () => {
      this.audio.splash();
      this.fx.splash(this.player.pos.clone().add(new Vector3(0, 1, 0)));
    };
    this.creatures = new Creatures(this.world.terrain, s);
    this.world.scene.add(this.creatures.group);
    this.interact = new Interactables(this.world.terrain, this.world.physics, this);
    this.interact.attachBeacon(this.world.props.beacon);
    this.world.scene.add(this.interact.group);
    this.interact.sync();
    this.creatures.setCompanion(s.active, s.companionOut, this.player.pos);
    this.rig.mode = s.player.camera;
    this.rig.yaw = s.player.yaw + Math.PI;
    this.rig.pitch = s.player.pitch;
    this.player.model.setBodyVisible(this.rig.mode === 'third');
    this.rig.shot = null;
    this.rig.snap();
    this.quests.check();
    this.ui.enterPlay();
    this.phase = intro ? 'intro' : 'play';
    this.input.gameplay = !intro;
    if (intro) this.playIntro();
    else {
      this.toast(`Welcome back, ${s.appearance.name}.`, 'info');
      this.input.requestLock();
    }
  }

  private cleanupPlay(): void {
    if (this.player) {
      this.player.dispose();
      this.creatures?.dispose();
      this.creatures?.group.removeFromParent();
      this.interact?.group.removeFromParent();
    }
    this.player = undefined as unknown as Player;
    this.auto = null;
    this.observing = null;
    this.target = null;
  }

  private playIntro(): void {
    const t = this.world.terrain;
    const p = this.player.pos.clone();
    const a = new Vector3(70, 70, 150);
    const b = new Vector3(-10, t.height(-10, 30) + 30, 70);
    const c = new Vector3(p.x + 2.5, p.y + 2.2, p.z + 5.5);
    const look0 = new Vector3(BEACON.at[0], 18, BEACON.at[1]);
    const look1 = p.clone().add(new Vector3(0, 1.1, 0));
    this.ui.introCard(true);
    this.audio.quest();
    this.runCinematic(9, (k) => {
      const e = k * k * (3 - 2 * k);
      const pos = k < 0.55 ? a.clone().lerp(b, e / 0.55 > 1 ? 1 : (k / 0.55) ** 1.2) : b.clone().lerp(c, Math.min(1, (k - 0.55) / 0.45) ** 0.8);
      const look = look0.clone().lerp(look1, Math.max(0, (k - 0.35) / 0.65));
      return { pos, look };
    }, () => {
      this.ui.introCard(false);
      this.phase = 'play';
      this.input.gameplay = true;
      this.creatures.companion?.setMood('happy', 2);
      this.toast(`${this.companionName()} is ready for adventure!`, 'good');
      setTimeout(() => this.toast('Ranger Elen is waiting by the lodge.', 'quest'), 1600);
      this.ui.showControlsHint();
      this.saveNow(true);
    });
  }

  private runCinematic(dur: number, path: (k: number) => { pos: Vector3; look: Vector3 }, done: () => void): void {
    this.cinematic = { t: 0, dur, path, done };
    const s = path(0);
    this.rig.shot = { pos: s.pos, look: s.look };
    this.rig.snap();
  }

  skipCinematic(): void {
    if (this.cinematic) {
      this.cinematic.t = this.cinematic.dur;
      this.skipped = true;
    }
  }

  private skipped = false;

  // -------------------------------------------------------------------------
  // Frame loop

  private frame(): void {
    const now = performance.now();
    const dtMs = Math.min(100, now - this.last);
    this.last = now;
    const dt = dtMs / 1000;
    this.fpsAcc += dtMs;
    this.fpsFrames++;
    if (this.fpsAcc > 500) {
      this.fps = (this.fpsFrames * 1000) / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (!this.visible) return;
    this.time += dt;
    this.host.governor(dtMs);
    const r = this.host.renderer;
    switch (this.phase) {
      case 'title': {
        this.titleModels?.char.update(dt);
        this.titleModels?.pet.animator.update(dt);
        this.world.update(dt, this.time, 16.5, 'clear', this.rig.camera.position, this.rig.camera.position, false);
        this.rig.update(dt, this.rig.camera.position, 1.3, this.world.physics);
        this.post.render(this.world.scene, this.rig.camera, 0);
        this.audio.ambience(dt, { night: 0, river: 0, cave: 0, rain: 0, underwater: false, height: 10, paused: false });
        break;
      }
      case 'charselect':
      case 'customize':
      case 'starter':
        this.studio.render(r, dt);
        break;
      case 'intro':
      case 'play':
        this.play(dt);
        break;
      default:
        break;
    }
  }

  private play(dt: number): void {
    const s = this.state;
    const frozen = this.paused || !!this.modal || this.phase === 'intro' || !!this.cinematic;
    const simDt = this.paused ? 0 : dt;
    // input → player
    const move = this.input.move();
    if (!frozen) {
      const look = this.input.consumeLook();
      this.rig.applyLook(look.x, look.y, look.zoom);
      this.handleActions();
      if (this.auto) this.auto.update(dt);
    } else {
      this.input.consumeLook();
      this.input.clearEdges();
    }
    const comp = this.companionDef();
    const abil = { canDive: comp?.ability === 'tide', canGlide: comp?.ability === 'glide' };
    const ai = this.auto?.input;
    this.player.frozen = frozen;
    this.player.update(simDt, {
      x: ai ? ai.x : move.x,
      y: ai ? ai.y : move.y,
      sprint: ai ? ai.sprint : this.input.isDown('sprint'),
      crouch: ai ? ai.crouch : this.input.isDown('crouch'),
      jump: ai ? ai.jump : this.input.pressed('jump'),
      jumpHeld: ai ? ai.jumpHeld : this.input.isDown('jump'),
    }, this.rig, abil);
    this.playerPos.copy(this.player.pos);
    // camera
    if (this.cinematic) {
      this.cinematic.t += dt;
      const k = Math.min(1, this.cinematic.t / this.cinematic.dur);
      const shot = this.cinematic.path(k);
      this.rig.shot = { pos: shot.pos, look: shot.look };
      this.rig.snap();
      if (k >= 1) {
        const done = this.cinematic.done;
        this.cinematic = null;
        this.rig.shot = null;
        // a skipped shot cuts straight back to the player
        if (this.skipped) this.rig.snap();
        this.skipped = false;
        done();
      }
    }
    this.rig.update(dt, this.player.pos, this.player.eyeHeight, this.world.physics);
    this.player.updateHand(this.rig.camera, dt, this.rig.mode === 'first' && !this.cinematic, Math.min(1, Math.hypot(this.player.vel.x, this.player.vel.z) / 4));
    // clock and weather
    if (!this.paused && this.phase === 'play' && !this.modal && this.settings.dayMinutes > 0) s.clock += (simDt * 24) / (this.settings.dayMinutes * 60);
    if (s.clock >= s.weather.until) this.rollWeather();
    s.playSeconds += simDt;
    const hour = hourOfDay(s);
    const night = isNight(hour);
    const inCave = this.world.isCave(this.player.pos.x, this.player.pos.z);
    // world
    this.world.sky.underwater = this.player.underwater || this.rig.camera.position.y < WATER_LEVEL - 0.05 && this.world.terrain.waterAt(this.rig.camera.position.x, this.rig.camera.position.z) !== null;
    this.world.update(simDt || 0.0001, this.time, hour, s.weather.kind, this.player.pos, this.rig.camera.position, inCave);
    // creatures and villagers
    const poi: Vector3[] = [];
    this.creatures.update({
      dt: simDt,
      time: this.time,
      night,
      player: { pos: this.player.pos, vel: this.player.vel, noise: this.player.noise, crouching: this.player.crouching, calmFor: this.player.calmFor, swimming: this.player.swimming },
      terrain: this.world.terrain,
      physics: this.world.physics,
      isCave: (x, z) => this.world.isCave(x, z),
      poi,
      knock: (from, strength) => this.knockback(from, strength),
    }, this.host.profile.creatureRange, this.player.yaw);
    for (const n of this.npcs) {
      const d = n.pos.distanceTo(this.player.pos);
      if (d < 70) n.update(simDt, this.player.pos);
    }
    const compC = this.creatures.companion;
    this.interact.update(simDt, this.player.pos, compC && !compC.dismissed && comp?.ability === 'glow' ? compC.pos : null, !!compC && !compC.dismissed && comp?.ability === 'forage', this.world.sky.night);
    this.fx.update(simDt);
    // companion glow lights the dark
    this.updateCompanionLight(comp?.ability === 'glow' && !!compC && !compC.dismissed);
    // targeting and observation
    if (!frozen) this.updateTarget();
    else this.target = null;
    this.updateObserve(simDt);
    // periodic work
    this.slowTick -= dt;
    if (this.slowTick <= 0 && this.phase === 'play') {
      this.slowTick = 0.5;
      this.discover();
      this.quests.check();
    }
    this.saveTick += dt;
    if (this.saveTick > 45 && this.phase === 'play' && !this.paused) {
      this.saveTick = 0;
      this.saveNow(true);
    }
    // audio
    const riverD = this.riverNear();
    this.audio.ambience(dt, { night: this.world.sky.night, river: riverD, cave: this.world.caveFactor, rain: this.world.sky.rainAmount, underwater: this.player.underwater, height: this.player.pos.y, paused: this.paused });
    // render
    this.post.render(this.world.scene, this.rig.camera, this.world.sky.night, this.world.caveFactor > 0.5 ? 0.45 : 0.32);
    this.ui.hud(dt);
  }

  private riverNear(): number {
    const p = this.player.pos;
    let best = 0;
    for (const [dx, dz] of [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
      if (this.world.terrain.waterAt(p.x + dx, p.z + dz) !== null) best = Math.max(best, 1 - Math.hypot(dx, dz) / 16);
    }
    const falls = Math.hypot(p.x - 60, p.z - 100);
    return Math.max(best, falls < 40 ? 1 - falls / 40 : 0);
  }

  private compLight: PointLight | null = null;
  private updateCompanionLight(on: boolean): void {
    if (on && !this.compLight) {
      this.compLight = new PointLight('#ffe9a0', 0, 14, 1.4);
      this.world.scene.add(this.compLight);
    }
    if (this.compLight) {
      const c = this.creatures.companion;
      const want = on ? 2 + this.world.caveFactor * 8 + this.world.sky.night * 5 : 0;
      this.compLight.intensity += (want - this.compLight.intensity) * 0.1;
      if (c) this.compLight.position.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
      this.compLight.visible = this.compLight.intensity > 0.05;
    }
  }

  private onKey(e: KeyboardEvent): boolean | void {
    if (e.code === 'Escape') {
      if (this.phase === 'intro') {
        this.skipCinematic();
        return true;
      }
      if (this.phase === 'play') {
        if (this.ui.closeTop()) return true;
        if (this.paused) this.resume();
        else this.pause();
        return true;
      }
      if (this.phase === 'charselect' || this.phase === 'customize' || this.phase === 'starter') {
        this.ui.back();
        return true;
      }
      return this.ui.closeTop();
    }
    if (this.phase === 'play' && this.modal && !e.repeat) {
      // panel hotkeys toggle their panel closed again
      const map: Record<string, string> = {
        [this.settings.bindings.map]: 'map',
        [this.settings.bindings.collection]: 'collection',
        [this.settings.bindings.journal]: 'journal',
        [this.settings.bindings.inventory]: 'inventory',
      };
      const panel = map[e.code];
      if (panel) {
        if (this.modal === panel) this.ui.closeTop();
        else this.ui.openPanel(panel);
        return true;
      }
      return this.ui.panelKey(e);
    }
    if (this.phase === 'title' || this.phase === 'charselect' || this.phase === 'customize' || this.phase === 'starter') return this.ui.menuKey(e);
    return undefined;
  }

  private handleActions(): void {
    const i = this.input;
    if (i.pressed('view')) this.toggleView();
    if (i.pressed('companion')) this.toggleCompanion();
    if (i.pressed('map')) this.ui.openPanel('map');
    if (i.pressed('collection')) this.ui.openPanel('collection');
    if (i.pressed('journal')) this.ui.openPanel('journal');
    if (i.pressed('inventory')) this.ui.openPanel('inventory');
    if (i.pressed('interact')) this.doInteract();
    if (i.pressed('observe')) this.doObserve();
    if (i.pressed('ability')) this.doAbility();
  }

  // -------------------------------------------------------------------------
  // Targeting and actions

  private updateTarget(): void {
    const aim = this.rig.mode === 'first' ? this.rig.aim(new Vector3()) : this.rig.forward(new Vector3()).lerp(new Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)), 0.5).normalize();
    const fp = this.rig.mode === 'first';
    const p = this.player.pos;
    let best: Target | null = null;
    let bestScore = Infinity;
    // villagers
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z);
      if (d > 3.2) continue;
      const dot = ((n.pos.x - p.x) * aim.x + (n.pos.z - p.z) * aim.z) / Math.max(0.01, d);
      if (dot < (fp ? 0.7 : 0.1) && d > 1.3) continue;
      const score = d * (2 - dot) - 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'npc', npc: n };
      }
    }
    // creatures: interact range for food, longer range for observing
    for (const c of this.creatures.visible()) {
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d > 22) continue;
      const dot = ((c.pos.x - p.x) * aim.x + (c.pos.z - p.z) * aim.z) / Math.max(0.01, d);
      const need = d < 4 ? (fp ? 0.6 : 0) : fp ? 0.94 : 0.8;
      if (dot < need) continue;
      const score = d < 4 ? d * (2 - dot) : d * (2 - dot) + 3;
      if (score < bestScore) {
        bestScore = score;
        best = { kind: 'creature', creature: c, dist: d };
      }
    }
    const entry = this.interact.target(p, aim, fp);
    if (entry) {
      const d = Math.hypot(entry.focus.x - p.x, entry.focus.z - p.z);
      const score = d * 1.2;
      if (score < bestScore || (best?.kind === 'creature' && best.dist > 4)) {
        bestScore = score;
        best = { kind: 'interact', entry };
      }
    }
    if (best?.kind === 'creature' && !best.creature.companion && best.creature.def) {
      const rec = this.state.species[best.creature.species];
      if (!rec.seen) {
        rec.seen = true;
        this.toast(`New creature sighted: ${best.creature.def.name}! Press F to observe it.`, 'quest');
      }
    }
    this.target = best;
  }

  conditions(c: Creature): Conditions {
    const hour = hourOfDay(this.state);
    return {
      night: isNight(hour),
      inCave: this.world.isCave(c.pos.x, c.pos.z),
      playerCrouching: this.player.crouching,
      playerCalmFor: this.player.calmFor,
      nearFlowers: Math.hypot(c.pos.x - LOCATION_BY_ID.meadow.at[0], c.pos.z - LOCATION_BY_ID.meadow.at[1]) < 34,
    };
  }

  doInteract(): void {
    const t = this.target;
    if (!t) return;
    if (t.kind === 'interact') {
      this.interact.interact(t.entry);
      this.audio.click();
    } else if (t.kind === 'npc') this.talk(t.npc);
    else if (t.kind === 'creature') {
      const c = t.creature;
      if (!c.companion) {
        const r = canResonate(c);
        if (r.ok && t.dist < 4.2) {
          this.startResonance(c);
          return;
        }
      }
      if (t.dist > 3.6) {
        this.toast(`Get closer to ${c.def.name} to offer food.`, 'info');
        return;
      }
      this.feedCreature(c);
    }
  }

  feedCreature(c: Creature, item?: string): void {
    const food = item ?? bestFood(this.state, c);
    if (!food) {
      this.audio.fail();
      this.toast('You have no food to offer. Pick herbs or visit Pip’s stall.', 'warn');
      return;
    }
    if (c.companion) {
      if (!this.take(food, 1)) return;
      const b = this.state.bonded.find((x) => x.uid === c.bondUid);
      const liked = food === c.def.likes;
      if (b) b.friendship = Math.min(100, b.friendship + (liked ? 8 : 3));
      c.perform('happy');
      c.setMood('heart');
      this.fx.hearts(c.pos.clone().add(new Vector3(0, c.def.size + 0.4, 0)), liked ? 4 : 2);
      this.audio.trust(0.8);
      this.toast(liked ? `${this.companionName()} happily eats the ${ITEM_BY_ID[food].name}!` : `${this.companionName()} munches the ${ITEM_BY_ID[food].name}.`, 'good');
      this.player.model.animator.once('interact', 0.1, 1.2);
      return;
    }
    const res = feed(this.state, c, food, this.conditions(c));
    if (!res.ok) {
      this.audio.fail();
      this.toast(res.message, 'warn');
      if (c.fear > 45) c.setMood('alarm');
      return;
    }
    this.take(food, 1);
    c.face(this.player.pos);
    c.perform(res.liked ? 'happy' : 'eat');
    c.setMood(res.liked ? 'heart' : 'curious');
    if (res.liked) this.fx.hearts(c.pos.clone().add(new Vector3(0, c.def.size + 0.4, 0)), 3);
    this.audio.trust(c.trust / 100);
    this.player.model.animator.once('interact', 0.1, 1.2);
    this.toast(res.message, res.liked ? 'good' : 'info');
    if (c.trust >= 70) setTimeout(() => this.toast(`${c.def.name} trusts you! Press E to Resonate.`, 'quest'), 900);
  }

  doObserve(): void {
    const t = this.target;
    if (!t || t.kind !== 'creature') {
      if (t?.kind === 'interact' && (t.entry.def.kind === 'track' || t.entry.def.kind === 'sign')) this.interact.interact(t.entry);
      else this.toast('Look at a creature to observe it.', 'info');
      return;
    }
    if (this.observing) return;
    this.observing = { creature: t.creature, t: 0 };
    this.player.model.animator.once('observe', 0.1, 0.9);
    this.audio.hover();
  }

  private updateObserve(dt: number): void {
    const o = this.observing;
    if (!o) return;
    const c = o.creature;
    const d = c.pos.distanceTo(this.player.pos);
    if (!c.visible || d > 26 || c.state === 'flee') {
      this.observing = null;
      this.toast('It slipped out of view.', 'warn');
      return;
    }
    o.t += dt;
    if (o.t < 1.4) return;
    this.observing = null;
    const s = this.state;
    const rec = s.species[c.species];
    const first = rec.observed === 0;
    rec.seen = true;
    if (!c.companion && !c.observed) {
      c.observed = true;
      rec.observed += 1;
      const mem = s.wild[c.id];
      if (mem) mem.observed = true;
      c.trust = Math.min(100, c.trust + 8);
    } else if (first) rec.observed += 1;
    const pref = preference(c, this.conditions(c));
    const likes = ITEM_BY_ID[c.def.likes].name;
    const name = variantName(c.species, c.variant);
    this.audio.glow();
    c.setMood('curious', 1.5);
    this.ui.observed(c, first, `${name} — ${c.def.personality} Likes ${likes}. ${pref.note}.`);
    this.quests.check();
  }

  get observeProgress(): number {
    return this.observing ? Math.min(1, this.observing.t / 1.4) : 0;
  }

  private startResonance(c: Creature): void {
    this.modal = 'resonance';
    this.input.releaseLock();
    c.face(this.player.pos);
    this.player.model.animator.once('resonate', 0.1, 0.8);
    this.player.pulse();
    this.audio.heartbeat();
    this.ui.resonance(c, (ok) => this.finishResonance(c, ok));
  }

  private finishResonance(c: Creature, ok: boolean): void {
    this.modal = null;
    if (this.phase === 'play' && !this.input.touch) this.input.requestLock();
    if (!ok) {
      resonanceFailed(this.state, c);
      c.setMood('alarm');
      this.audio.fail();
      this.toast(`${c.def.name} pulled away. Rebuild its trust and try again.`, 'warn');
      return;
    }
    const uid = bond(this.state, c, day(this.state));
    this.audio.bond();
    this.fx.sparkle(c.pos.clone().add(new Vector3(0, 0.6, 0)), '#ffe98a', 50, 1.5);
    this.fx.ring(c.pos.clone().add(new Vector3(0, 0.2, 0)), '#ffe98a', 3);
    this.fx.hearts(c.pos.clone().add(new Vector3(0, 0.8, 0)), 5);
    const name = variantName(c.species, c.variant);
    this.creatures.removeWild(c);
    this.quests.check();
    this.saveNow(true);
    this.ui.bonded(uid, name);
  }

  doAbility(): void {
    const comp = this.companionDef();
    const c = this.creatures.companion;
    if (!comp || !c || c.dismissed) {
      this.toast('Call a companion first (R).', 'info');
      return;
    }
    const t = this.target;
    if (t?.kind === 'interact') {
      const k = t.entry.def.kind;
      if (k === 'thorns' || k === 'brazier' || k === 'cracked' || k === 'basin' || k === 'altar') {
        this.interact.interact(t.entry);
        return;
      }
    }
    const ab = ABILITIES[comp.ability];
    this.companionPerform(c.pos.clone().add(new Vector3(Math.sin(this.player.yaw) * 2, 0, Math.cos(this.player.yaw) * 2)));
    switch (comp.ability) {
      case 'glide':
        this.toast(`${ab.name}: hold Jump while falling to glide.`, 'info');
        break;
      case 'tide':
        this.toast(`${ab.name}: crouch while swimming to dive, jump to rise.`, 'info');
        break;
      case 'glow':
        this.toast(`${ab.name}: ${this.companionName()} lights the dark and reveals hidden glyphs.`, 'info');
        break;
      case 'forage':
        this.toast(`${ab.name}: ${this.companionName()} sniffs for hidden herbs nearby.`, 'info');
        break;
      default:
        this.toast(`${ab.name}: ${ab.summary}`, 'info');
    }
  }

  private knockback(from: Vector3, strength: number): void {
    const d = this.player.pos.clone().sub(from).setY(0).normalize();
    this.player.vel.x += d.x * strength;
    this.player.vel.z += d.z * strength;
    this.player.vel.y = 3.5;
    this.player.grounded = false;
    this.audio.alarm();
    this.toast('The Thornlade raised its fronds at you! Move calmly around it.', 'warn');
  }

  toggleView(): void {
    const mode = this.rig.mode === 'third' ? 'first' : 'third';
    this.rig.setMode(mode);
    this.state.player.camera = mode;
    this.player.model.setBodyVisible(mode === 'third');
    this.audio.click();
    this.ui.flash(mode === 'first' ? 'First-person view' : 'Third-person view');
  }

  toggleCompanion(): void {
    const s = this.state;
    if (!s.active) {
      this.toast('You have no companion to call.', 'info');
      return;
    }
    s.companionOut = !(s.companionOut && this.creatures.companion && !this.creatures.companion.dismissed);
    this.creatures.setCompanion(s.active, s.companionOut, this.player.pos);
    this.audio.click();
    if (s.companionOut) {
      this.fx.sparkle(this.player.pos.clone().add(new Vector3(1.5, 0.6, 1)), '#ffe98a', 24);
      this.toast(`${this.companionName()} bounds to your side.`, 'good');
    } else this.toast(`${this.companionName()} trots home to rest.`, 'info');
  }

  setActive(uid: string): void {
    this.state.active = uid;
    this.state.companionOut = true;
    this.creatures.setCompanion(uid, true, this.player.pos);
    this.toast(`${this.companionName()} is now your active companion.`, 'good');
  }

  renameCompanion(uid: string, name: string): void {
    const b = this.state.bonded.find((x) => x.uid === uid);
    if (b && name.trim()) b.name = name.trim().slice(0, 16);
  }

  // -------------------------------------------------------------------------
  // Dialogue, shop, rest

  talk(n: Npc): void {
    this.audio.open();
    n.talking = true;
    this.modal = 'dialogue';
    this.input.releaseLock();
    const tree = dialogueFor(n.def.id, this);
    // frame the conversation
    const mid = n.pos.clone().lerp(this.player.pos, 0.5);
    const side = new Vector3(n.pos.z - this.player.pos.z, 0, -(n.pos.x - this.player.pos.x)).normalize();
    this.rig.shot = { pos: mid.clone().addScaledVector(side, 3.2).add(new Vector3(0, 1.7, 0)), look: mid.clone().add(new Vector3(0, 1.1, 0)) };
    this.ui.dialogue(n.def.name, n.def.role, tree, () => {
      n.talking = false;
      this.rig.shot = null;
      this.modal = null;
      this.quests.check();
      if (!this.input.touch) this.input.requestLock();
    });
  }

  openShop(): void {
    setTimeout(() => this.ui.openPanel('shop'), 0);
  }

  buy(item: string): void {
    const def = ITEM_BY_ID[item];
    if (!def?.price) return;
    if (this.state.lumens < def.price) {
      this.audio.fail();
      this.toast('Not enough Lumens.', 'warn');
      return;
    }
    this.state.lumens -= def.price;
    this.give(item, 1);
    this.audio.coin();
  }

  sell(item: string, price: number): number {
    const n = this.state.inventory[item] ?? 0;
    if (!n) return 0;
    this.take(item, n);
    this.addLumens(n * price);
    return n;
  }

  openRest(): void {
    this.ui.openPanel('rest');
  }

  rest(untilHour: number): void {
    const s = this.state;
    const h = hourOfDay(s);
    let add = untilHour - h;
    if (add <= 0.25) add += 24;
    this.ui.fade(() => {
      s.clock += add;
      if (s.weather.until < s.clock) this.rollWeather();
      this.creatures.companion?.setMood('sleep', 2);
      this.saveNow(true);
      this.toast(`You rest by the fire until ${String(untilHour).padStart(2, '0')}:00. Progress saved.`, 'good');
    });
  }

  private rollWeather(): void {
    const s = this.state;
    const rng = new Rng(hashString(`${Math.floor(s.clock)}:${s.createdAt}`));
    const h = hourOfDay(s);
    const kinds: [WeatherKind, number][] = [['clear', 50], ['cloudy', 24], ['rain', 14], ['mist', h < 9 || h > 19 ? 16 : 5]];
    s.weather = { kind: rng.weighted(kinds) ?? 'clear', until: s.clock + rng.float(3, 8) };
  }

  setWeather(kind: WeatherKind): void {
    this.state.weather = { kind, until: this.state.clock + 6 };
  }

  // -------------------------------------------------------------------------
  // InteractHost / DialogueHost

  get playerName(): string {
    return this.state.appearance.name;
  }

  give(item: string, n: number): void {
    const s = this.state;
    s.inventory[item] = (s.inventory[item] ?? 0) + n;
    const def = ITEM_BY_ID[item];
    this.ui.itemToast(item, n);
    if (def?.category === 'note') this.toast(`New note: ${def.name} (see Inventory → Notes).`, 'info');
  }

  take(item: string, n: number): boolean {
    const s = this.state;
    if ((s.inventory[item] ?? 0) < n) return false;
    s.inventory[item] -= n;
    if (s.inventory[item] <= 0) delete s.inventory[item];
    return true;
  }

  count(item: string): number {
    return this.state.inventory[item] ?? 0;
  }

  addLumens(n: number): void {
    this.state.lumens += n;
    this.ui.itemToast('lumens', n);
    this.audio.coin();
  }

  toast(msg: string, kind: 'info' | 'good' | 'quest' | 'warn' = 'info'): void {
    this.ui.toast(msg, kind);
  }

  showNote(title: string, text: string): void {
    this.ui.note(title, text);
  }

  companionDef(): import('./data/species').SpeciesDef | null {
    const s = this.state;
    if (!s?.active || !s.companionOut) return null;
    const b = s.bonded.find((x) => x.uid === s.active);
    return b ? SPECIES_BY_ID[b.species] : null;
  }

  ability(): AbilityId | null {
    const c = this.creatures?.companion;
    if (!c || c.dismissed) return null;
    return this.companionDef()?.ability ?? null;
  }

  companionName(): string {
    const s = this.state;
    const b = s?.bonded.find((x) => x.uid === s.active);
    return b?.name ?? 'your companion';
  }

  companionPerform(at: Vector3): void {
    const c = this.creatures.companion;
    if (!c) return;
    c.face(at);
    c.perform('ability', 1.2);
    this.player.pulse();
    this.player.model.animator.once('interact', 0.1, 1);
    const def = c.def;
    const p = c.pos.clone().lerp(at, 0.5).add(new Vector3(0, 0.6, 0));
    if (def.element === 'fire') this.fx.fire(p, 20, 0.5);
    else if (def.element === 'water') this.fx.splash(p, 20);
    else if (def.element === 'earth') this.fx.ring(c.pos.clone().add(new Vector3(0, 0.1, 0)), '#c8a06a', 3);
    else if (def.element === 'air') this.audio.wind();
    else this.fx.sparkle(p, def.palette.glow, 20);
  }

  checkQuests(): void {
    this.quests.check();
  }

  startQuest(id: string): void {
    this.quests.start(id);
  }

  questStatus(id: string): 'locked' | 'active' | 'done' {
    return this.quests.status(id);
  }

  questStage(id: string): number {
    return this.quests.stage(id);
  }

  setFlag(name: string, value = 1): void {
    this.state.flags[name] = value;
  }

  playerAnim(clip: string): void {
    this.player.model.animator.once(clip, 0.1, 1.2);
  }

  beaconRestored(): void {
    const top = this.world.props.beacon.top;
    const altar = new Vector3(-36, this.world.terrain.height(-36, 30) + 4, 30);
    const p0 = this.rig.camera.position.clone();
    this.audio.beacon();
    this.phase = 'intro';
    this.input.gameplay = false;
    this.input.releaseLock();
    this.runCinematic(7, (k) => {
      const e = k * k * (3 - 2 * k);
      const orbit = new Vector3(top.x + Math.cos(0.8 + e * 1.2) * 26, top.y - 2 + e * 6, top.z + Math.sin(0.8 + e * 1.2) * 26);
      return { pos: k < 0.2 ? p0.clone().lerp(altar, k / 0.2) : orbit, look: top.clone().add(new Vector3(0, e * 10, 0)) };
    }, () => {
      this.phase = 'play';
      this.input.gameplay = true;
      this.ui.banner('The Lost Beacon shines again', 'Return to Elen at the outpost.');
      this.saveNow(true);
      if (!this.input.touch) this.input.requestLock();
    });
  }

  private questStarted(q: QuestDef): void {
    this.audio.open();
    this.ui.banner(`New quest: ${q.title}`, this.quests.objective(q.id));
  }

  private questAdvanced(q: QuestDef): void {
    this.audio.quest();
    this.ui.toast(`${q.title}: ${this.quests.objective(q.id)}`, 'quest');
  }

  private questComplete(q: QuestDef): void {
    this.audio.quest();
    this.ui.banner(`Quest complete: ${q.title}`, `Reward: ${q.reward.note}`);
    this.saveNow(true);
  }

  private discover(): void {
    const p = this.player.pos;
    for (const l of LOCATIONS) {
      if (this.state.discovered.includes(l.id)) continue;
      if (Math.hypot(p.x - l.at[0], p.z - l.at[1]) < l.radius) {
        this.state.discovered.push(l.id);
        this.audio.glow();
        this.ui.banner(`Discovered: ${l.name}`, l.blurb);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pause, settings, saves

  pause(): void {
    if (this.phase !== 'play') return;
    this.paused = true;
    this.input.releaseLock();
    this.input.reset();
    this.ui.openPanel('pause');
  }

  resume(): void {
    this.paused = false;
    this.ui.closeAll();
    if (!this.input.touch) this.input.requestLock();
  }

  saveNow(quiet = false): boolean {
    if (!this.state || !this.player) return false;
    const s = this.state;
    s.player = { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw, camera: this.rig.mode, pitch: this.rig.pitch };
    for (const c of this.creatures.wild) {
      const mem = s.wild[c.id];
      if (mem) {
        mem.trust = Math.round(c.trust * 10) / 10;
        mem.observed = c.observed;
      }
    }
    const ok = saveGame(s);
    if (!quiet) this.toast(ok ? 'Game saved.' : 'Could not save: browser storage is unavailable.', ok ? 'good' : 'warn');
    else this.ui.saveIndicator(ok);
    return ok;
  }

  quitToTitle(): void {
    this.saveNow(true);
    this.paused = false;
    this.ui.closeAll();
    this.showTitle();
  }

  /** Leaves to the title after the save was deleted (so nothing is re-saved). */
  quitToTitleWithoutSaving(): void {
    this.paused = false;
    this.ui.closeAll();
    this.showTitle();
  }

  resetSave(): void {
    deleteSave();
    this.toast('Save deleted.', 'info');
  }

  applySettings(next: Settings): void {
    const prevQuality = this.settings.quality;
    this.settings = next;
    saveSettings(next);
    this.rig.sensitivity = next.sensitivity;
    this.rig.invertY = next.invertY;
    this.rig.camera.fov = next.fov;
    this.rig.camera.updateProjectionMatrix();
    this.audio.volumes = { master: next.master, music: next.music, sfx: next.sfx, ambient: next.ambient };
    this.audio.applyVolumes();
    this.input.setBindings(next.bindings);
    if (next.quality !== prevQuality) {
      this.host.setQuality(next.quality);
      this.world.setProfile(this.host.profile);
      this.post.setEnabled(this.host.profile.tier !== 'low', this.world.scene, this.rig.camera);
      this.post.resize(this.host.width, this.host.height, this.host.renderer.getPixelRatio());
    }
    this.host.renderer.shadowMap.enabled = next.shadows;
    this.world.sky.sun.castShadow = next.shadows;
  }

  get tierName(): string {
    return PROFILES[resolveTier(this.settings.quality)].tier;
  }

  startAuto(on: boolean): void {
    this.auto = on ? new Autopilot(this) : null;
    this.toast(on ? 'Auto-ranger on: it will follow your quest. Move to take over.' : 'Auto-ranger off.', 'info');
  }

  resetPlayerTo(where: 'outpost'): void {
    void where;
    this.player.place(PLAYER_START.at[0], 10, PLAYER_START.at[1], PLAYER_START.facing);
  }
}

function frame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export { QUEST_BY_ID };
