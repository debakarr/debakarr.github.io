// LumiQuest's orchestrator: owns the renderer, the world, the player, the
// creatures, catching and the UI, and runs the phases:
// loading → title → character select → starter → intro → play.
// There are no quests: you roam Brightwater Vale, find creatures in their
// habitats and times of day, sneak up and catch them with Lumi orbs.

import { PointLight, Vector3 } from 'three';
import { hashString, Rng } from '../shared/rng';
import type { Appearance } from './data/characters';
import { SPECIES_BY_ID, variantName, type AbilityId, type SpeciesId } from './data/species';
import { LOCATIONS, PLAYER_START, WATER_LEVEL } from './data/world';
import { Audio } from './engine/audio';
import { CameraRig } from './engine/camera';
import { Input } from './engine/input';
import { RenderHost, resolveTier, PROFILES } from './engine/renderer';
import { AnimeCharacter } from './anime/character';
import { CAST, castAppearance } from './anime/cast';
import type { Creature } from './entities/creature';
import { buildCreature, type CreatureModel } from './entities/creatureModel';
import { Creatures } from './entities/creatures';
import { Player } from './entities/player';
import { Catcher, catchChance, type Chance } from './systems/catching';
import { deleteSave, loadGame, loadSettings, saveGame, saveSettings, type Settings } from './systems/save';
import { day, hourOfDay, isNight, newState, STARTING_ORBS, type GameState, type WeatherKind } from './systems/state';
import { Blossoms } from './world/blossoms';
import { Fx } from './world/fx';
import { Interactables, type Entry, type InteractHost } from './world/interactables';
import { installAtmosphericFog } from './engine/atmosphere';
import { installToonLighting } from './anime/toon';
import { toonRim } from '../shared/toon/mats';

import { World } from './world/world';
import { Studio } from './ui/studio';
import { UI } from './ui/ui';
import { Post } from './engine/post';

export type Phase = 'loading' | 'title' | 'charselect' | 'customize' | 'starter' | 'intro' | 'play' | 'error';

/** What the crosshair is on: a creature to throw at (with its odds) or something to use. */
export type Target =
  | { kind: 'interact'; entry: Entry }
  | { kind: 'creature'; creature: Creature; dist: number; chance: Chance };

export class Game implements InteractHost {
  readonly host: RenderHost;
  settings: Settings;
  readonly audio = new Audio();
  readonly input: Input;
  readonly rig: CameraRig;
  world!: World;
  player!: Player;
  creatures!: Creatures;
  interact!: Interactables;
  blossoms!: Blossoms;
  catcher: Catcher | null = null;
  readonly fx = new Fx();
  readonly studio = new Studio();
  readonly ui: UI;
  readonly post: Post;
  state!: GameState;
  phase: Phase = 'loading';
  /** Name of the open panel/dialogue, or null when playing freely. */
  modal: string | null = null;
  paused = false;
  draft: { appearance: Appearance; starter: SpeciesId; starterName: string } = { appearance: castAppearance(CAST[0].id), starter: 'terrabun', starterName: '' };
  /** The creature in your sights (for throwing), else something within reach to use. */
  target: Target | null = null;
  /** Something within reach to use (E), even while a creature is in your sights. */
  useTarget: Entry | null = null;
  readonly playerPos = new Vector3();
  private last = performance.now();
  private time = 0;
  private slowTick = 0;
  private saveTick = 0;
  private titleModels: { char: AnimeCharacter; pet: CreatureModel } | null = null;
  /** A throw waiting for the arm to reach its release point. */
  private pendingThrow: { t: number; creature: Creature | null; dir: Vector3 } | null = null;
  private throwCooldown = 0;
  private cinematic: { t: number; dur: number; path: (k: number) => { pos: Vector3; look: Vector3 }; done: () => void } | null = null;
  private visible = true;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  saveWarning: string | undefined;

  constructor(readonly root: HTMLElement) {
    installAtmosphericFog();
    installToonLighting();
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
      this.ui.loading(0.75, 'Waking the creatures');
      this.world.scene.add(this.fx.group);
      this.world.scene.add(this.rig.camera);
      this.blossoms = new Blossoms(this.world.terrain);
      this.world.scene.add(this.blossoms.group);
      await frame();
      this.ui.loading(0.85, 'Lighting the lanterns');
      // compile shaders up front so the first frames do not stutter
      this.placeTitleCamera();
      this.host.renderer.shadowMap.enabled = this.settings.shadows;
      this.post.setEnabled(this.host.profile.tier !== 'low', this.world.scene, this.rig.camera, this.postOptions());
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
      const char = new AnimeCharacter(castAppearance('vita'));
      const cp = cam.clone().addScaledVector(f, 5.2).addScaledVector(right, 1.5);
      char.root.position.set(cp.x, t.height(cp.x, cp.z), cp.z);
      char.root.rotation.y = Math.atan2(f.x, f.z) - 0.25;
      char.animator.play('idle', 0);
      this.world.scene.add(char.root);
      const pet = buildCreature('terrabun', null);
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
    this.draft = { appearance: castAppearance(CAST[0].id), starter: 'terrabun', starterName: '' };
    this.phase = 'charselect';
    this.ui.charSelect();
  }

  /** Picks a cast member and the name to go by, then on to choosing a first creature. */
  chooseCast(id: string, name: string): void {
    this.draft.appearance = castAppearance(id, name.replace(/[<>]/g, '').trim().slice(0, 16) || undefined);
    this.toStarter();
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
    this.player = new Player(s.appearance, this.world.terrain, this.world.physics);
    this.world.scene.add(this.player.model.root);
    this.player.place(s.player.x, s.player.y, s.player.z, s.player.yaw);
    this.player.onStep = (surf) => this.audio.step(surf);
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = () => this.audio.land();
    let edgeNote = 0;
    this.player.onEdge = () => {
      const now = performance.now();
      if (now - edgeNote < 6000) return;
      edgeNote = now;
      this.toast('The mists of the vale grow too thick to go further.', 'info');
    };
    this.player.onSplash = () => {
      this.audio.splash();
      this.fx.splash(this.player.pos.clone().add(new Vector3(0, 1, 0)));
    };
    this.creatures = new Creatures(this.world.terrain, s);
    this.world.scene.add(this.creatures.group);
    this.interact = new Interactables(this.world.terrain, this.world.physics, this);
    this.world.scene.add(this.interact.group);
    this.interact.sync();
    this.blossoms.sync(s.done, s.clock);
    this.catcher = new Catcher({
      parent: this.world.scene,
      terrain: this.world.terrain,
      fx: this.fx,
      audio: this.audio,
      targets: () => this.creatures.wild,
      chance: (c) => catchChance(c, this.player),
      onCaught: (c) => this.onCaught(c),
      onEscaped: (c) => this.onEscaped(c),
      onMiss: () => this.onMiss(),
    });
    this.creatures.setCompanion(s.active, s.companionOut, this.player.pos);
    this.rig.mode = s.player.camera;
    this.rig.yaw = s.player.yaw + Math.PI;
    this.rig.pitch = s.player.pitch;
    this.player.model.setBodyVisible(this.rig.mode === 'third');
    this.rig.shot = null;
    this.rig.snap();
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
    this.catcher?.dispose();
    this.catcher = null;
    this.pendingThrow = null;
    this.target = null;
    this.useTarget = null;
  }

  private playIntro(): void {
    const t = this.world.terrain;
    const p = this.player.pos.clone();
    const a = new Vector3(70, 70, 150);
    const b = new Vector3(-10, t.height(-10, 30) + 30, 70);
    const c = new Vector3(p.x + 2.5, p.y + 2.2, p.z + 5.5);
    // across the vale toward Beacon Hill, then down to you
    const look0 = new Vector3(-20, 18, 10);
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
      this.toast(`${this.companionName()} is ready to explore!`, 'good');
      setTimeout(() => this.toast('Creatures live all over the vale. Sneak close and press F (or click) to throw a Lumi orb.', 'quest'), 1600);
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
        this.post.render(this.world.scene, this.rig.camera, { night: 0, bloom: 0.4, time: this.time });
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
    } else {
      this.input.consumeLook();
      this.input.clearEdges();
    }
    const comp = this.companionDef();
    const abil = { canDive: comp?.ability === 'tide', canGlide: comp?.ability === 'glide' };
    this.player.frozen = frozen;
    this.player.update(simDt, {
      x: move.x,
      y: move.y,
      sprint: this.input.isDown('sprint'),
      crouch: this.input.isDown('crouch'),
      jump: this.input.pressed('jump'),
      jumpHeld: this.input.isDown('jump'),
    }, this.rig, abil);
    this.playerPos.copy(this.player.pos);
    this.updateThrow(simDt);
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
    // creatures
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
    const compC = this.creatures.companion;
    this.interact.update(simDt, this.player.pos, !!compC && !compC.dismissed && comp?.ability === 'forage', this.world.sky.night);
    this.catcher?.update(simDt, this.time);
    this.blossoms.update(this.time);
    if (!frozen) this.gatherBlossom();
    this.fx.update(simDt);
    // companion glow lights the dark
    this.updateCompanionLight(comp?.ability === 'glow' && !!compC && !compC.dismissed);
    // what you're aiming at
    if (!frozen) this.updateTarget();
    else {
      this.target = null;
      this.useTarget = null;
    }
    // periodic work: places, regrown blossoms, creatures back after a day away
    this.slowTick -= dt;
    if (this.slowTick <= 0 && this.phase === 'play') {
      this.slowTick = 0.5;
      this.discover();
      this.blossoms.sync(s.done, s.clock);
      this.creatures.refresh();
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
    // characters' rim light follows the sun, and fades at night and underground
    toonRim.value.copy(this.world.sky.sun.color).multiplyScalar((1 - this.world.sky.night * 0.85) * (1 - this.world.caveFactor * 0.8) * 0.9);
    this.post.render(this.world.scene, this.rig.camera, {
      night: this.world.sky.night,
      bloom: this.world.caveFactor > 0.5 ? 0.5 : 0.4,
      sunDir: this.world.sky.sunVisual,
      sunColor: this.world.sky.sun.color,
      shafts: this.world.sky.shaftAmount * (1 - this.world.caveFactor),
      time: this.time,
    });
    this.ui.hud(dt);
  }

  /**
   * Which costly passes to run: sun shafts from medium up (and on auto when the
   * device looks like a desktop).
   */
  private postOptions(): { shafts: boolean } {
    const q = this.settings.quality;
    const tier = this.host.profile.tier;
    return { shafts: q === 'high' || q === 'medium' || (q === 'auto' && tier === 'high') };
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
    if (i.pressed('interact')) this.doInteract();
    if (i.pressed('throw')) this.doThrow();
    if (i.pressed('dodge')) {
      const m = i.move();
      const fwd = this.rig.forward(new Vector3());
      const right = new Vector3(-fwd.z, 0, fwd.x);
      this.player.dodge(fwd.multiplyScalar(m.y).addScaledVector(right, m.x));
    }
  }

  // -------------------------------------------------------------------------
  // Targeting and actions

  private updateTarget(): void {
    const p = this.player.pos;
    const fp = this.rig.mode === 'first';
    const cam = this.rig.camera;
    const eye = cam.position;
    const look = cam.getWorldDirection(new Vector3());
    // the wild creature nearest the crosshair, within throwing range
    let best: Target | null = null;
    let bestAng = Infinity;
    const to = new Vector3();
    for (const c of this.creatures.visible()) {
      if (c.companion || c.held || !c.model) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d > 24) continue;
      to.set(c.pos.x - eye.x, c.pos.y + c.model.height * 0.45 * c.model.root.scale.x - eye.y, c.pos.z - eye.z);
      const dist = to.length();
      const ang = Math.acos(Math.min(1, to.dot(look) / Math.max(dist, 1e-3)));
      // about a body's width either side of the crosshair (more forgiving up close)
      if (ang > Math.max(0.06, Math.atan2(0.85, dist))) continue;
      if (ang < bestAng) {
        bestAng = ang;
        best = { kind: 'creature', creature: c, dist: d, chance: catchChance(c, this.player) };
      }
    }
    // things within reach to use (E)
    const aim = fp ? this.rig.aim(new Vector3()) : this.rig.forward(new Vector3()).lerp(new Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)), 0.5).normalize();
    this.useTarget = this.interact.target(p, aim, fp);
    if (!best && this.useTarget) best = { kind: 'interact', entry: this.useTarget };
    if (best?.kind === 'creature') {
      const rec = this.state.species[best.creature.species];
      if (!rec.seen) {
        rec.seen = true;
        this.toast(`New creature sighted: ${best.creature.def.name}! Throw a Lumi orb (${this.ui.key('throw')}) to catch it.`, 'quest');
      }
    }
    this.target = best;
  }

  doInteract(): void {
    if (!this.useTarget) return;
    this.interact.interact(this.useTarget);
    this.audio.click();
  }

  /** Winds up a throw; the orb leaves the hand when the arm reaches its release point. */
  doThrow(): void {
    if (this.throwCooldown > 0 || this.pendingThrow || this.phase !== 'play' || !this.catcher) return;
    const s = this.state;
    if (this.player.swimming) {
      this.toast('You can’t throw while swimming.', 'info');
      return;
    }
    if (s.orbs <= 0) {
      this.audio.fail();
      this.toast('Out of Lumi orbs! Gather glowing blossoms, open caches, or rest by the campfire.', 'warn');
      return;
    }
    s.orbs -= 1;
    this.throwCooldown = 1;
    const dir = this.rig.camera.getWorldDirection(new Vector3());
    const creature = this.target?.kind === 'creature' ? this.target.creature : null;
    // turn to face the throw
    if (this.rig.mode === 'third') this.player.yaw = Math.atan2(dir.x, dir.z);
    this.player.model.animator.once('throw', 0.08, 1.4);
    this.pendingThrow = { t: 0.36, creature, dir };
  }

  private updateThrow(dt: number): void {
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);
    const pt = this.pendingThrow;
    if (!pt || !this.catcher) return;
    pt.t -= dt;
    if (pt.t > 0) return;
    this.pendingThrow = null;
    const p = this.player.pos;
    const fwd = new Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    // the character faces +Z, so its right hand is toward fwd x up
    const right = new Vector3(-fwd.z, 0, fwd.x);
    const from =
      this.rig.mode === 'first'
        ? this.rig.camera.position.clone().addScaledVector(pt.dir, 0.4).add(new Vector3(0, -0.15, 0))
        : p.clone().add(new Vector3(0, 1.55, 0)).addScaledVector(fwd, 0.35).addScaledVector(right, 0.25);
    let target: Vector3 | null = null;
    const c = pt.creature;
    if (c && c.visible && !c.held && c.model) {
      target = c.pos.clone().add(new Vector3(0, c.model.height * 0.45 * c.model.root.scale.x, 0));
      // lead a moving creature a little
      const T = Math.min(0.95, Math.max(0.3, from.distanceTo(target) / 16));
      target.x += Math.sin(c.yaw) * c.moveSpeed * T * 0.8;
      target.z += Math.cos(c.yaw) * c.moveSpeed * T * 0.8;
    }
    this.catcher.throw(from, pt.dir, target);
  }

  private onCaught(c: Creature): void {
    const s = this.state;
    const rec = s.species[c.species];
    const first = rec.bonded === 0;
    const name = variantName(c.species, c.variant);
    const uid = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    s.bonded.push({ uid, species: c.species, variant: c.variant, name: c.def.name, origin: c.id, bondedDay: day(s), friendship: 30 });
    rec.seen = true;
    rec.bonded += 1;
    rec.observed = Math.max(rec.observed, 1);
    this.creatures.caught(c);
    this.audio.bond();
    this.player.model.animator.once('happy', 0.1, 1);
    this.player.model.setExpression('happy');
    setTimeout(() => this.player?.model.setExpression('neutral'), 2400);
    if (!s.active) {
      s.active = uid;
      s.companionOut = true;
      this.creatures.setCompanion(uid, true, this.player.pos);
    }
    this.saveNow(true);
    this.ui.caught(uid, name, first);
  }

  private onEscaped(c: Creature): void {
    this.audio.fail();
    this.toast(`Oh no! ${variantName(c.species, c.variant)} broke free!`, 'warn');
  }

  private missNote = 0;
  private onMiss(): void {
    const now = performance.now();
    if (now - this.missNote < 8000) return;
    this.missNote = now;
    this.toast('Missed! Get a little closer, or wait for it to stop moving.', 'info');
  }

  /** Walking through a ripe Lumi blossom gathers its orbs. */
  private gatherBlossom(): void {
    const i = this.blossoms.near(this.player.pos);
    if (i < 0) return;
    const b = this.blossoms.gather(i);
    this.state.done[b.id] = this.state.clock;
    this.audio.pickup();
    this.giveOrbs(b.orbs, b.pos.clone().add(new Vector3(0, 0.5, 0)));
  }

  giveOrbs(n: number, at: Vector3): void {
    this.state.orbs = Math.min(99, this.state.orbs + n);
    this.fx.sparkle(at, '#bff4ff', 12 + n * 5, 0.9);
    this.ui.orbToast(n);
  }

  private knockback(from: Vector3, strength: number): void {
    const d = this.player.pos.clone().sub(from).setY(0).normalize();
    this.player.vel.x += d.x * strength;
    this.player.vel.z += d.z * strength;
    this.player.vel.y = 3.5;
    this.player.grounded = false;
    this.audio.alarm();
    this.toast('It bumped you away! Give it some space and try again.', 'warn');
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
      // the outpost keeps rangers stocked
      const topUp = Math.max(0, STARTING_ORBS - s.orbs);
      s.orbs += topUp;
      this.blossoms.sync(s.done, s.clock);
      this.creatures.refresh();
      this.saveNow(true);
      this.toast(`You rest by the fire until ${String(untilHour).padStart(2, '0')}:00.${topUp ? ` The outpost restocks you with ${topUp} Lumi orbs.` : ''} Progress saved.`, 'good');
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

  setFlag(name: string, value = 1): void {
    this.state.flags[name] = value;
  }

  playerAnim(clip: string): void {
    this.player.model.animator.once(clip, 0.1, 1.2);
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
      this.post.setEnabled(this.host.profile.tier !== 'low', this.world.scene, this.rig.camera, this.postOptions());
      this.post.resize(this.host.width, this.host.height, this.host.renderer.getPixelRatio());
    }
    this.host.renderer.shadowMap.enabled = next.shadows;
    this.world.sky.sun.castShadow = next.shadows;
  }

  get tierName(): string {
    return PROFILES[resolveTier(this.settings.quality)].tier;
  }

  resetPlayerTo(where: 'outpost'): void {
    void where;
    this.player.place(PLAYER_START.at[0], 10, PLAYER_START.at[1], PLAYER_START.facing);
  }
}

function frame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

