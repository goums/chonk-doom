// Game flow: title -> levels -> intermission -> victory. Owns the World.
import { LEVELS } from './levels';
import { World, START_INVENTORY, SKILLS, type Intent, type Inventory } from './world';
import { playMusic, sfx } from '../audio/audio';

export type GameState = 'title' | 'playing' | 'intermission' | 'victory';

export interface RunStats {
  deaths: number;
  levelsCompleted: number;
  kills: number;
  totalKills: number;
  items: number;
  secrets: number;
  time: number;
  perLevel: { id: string; time: number; kills: number; totalKills: number; items: number; totalItems: number; secrets: number; totalSecrets: number; deaths: number }[];
}

export class Game {
  state: GameState = 'title';
  world: World;
  levelIndex = 0;
  skill = 1;
  seed = 1234;
  private levelInv: Inventory = START_INVENTORY;
  stateT = 0;
  run: RunStats = Game.emptyRun();
  levelDeaths = 0;
  listeners: ((type: 'level' | 'complete' | 'death' | 'victory' | 'title', g: Game) => void)[] = [];

  static emptyRun(): RunStats {
    return { deaths: 0, levelsCompleted: 0, kills: 0, totalKills: 0, items: 0, secrets: 0, time: 0, perLevel: [] };
  }

  constructor() {
    this.world = new World(LEVELS[0], START_INVENTORY, 1);
  }

  private emit(t: 'level' | 'complete' | 'death' | 'victory' | 'title') {
    for (const l of this.listeners) l(t, this);
  }

  newGame(skill: number, levelIndex = 0, seed = 1234) {
    this.skill = skill;
    this.seed = seed;
    this.run = Game.emptyRun();
    this.levelInv = structuredClone(START_INVENTORY);
    // when starting at a later level, give the weapons you'd have found by then
    if (levelIndex >= 1) { this.levelInv.weapons.push('shotgun'); this.levelInv.ammo.sardines = 20; }
    if (levelIndex >= 2) { this.levelInv.weapons.push('laser'); this.levelInv.ammo.battery = 80; }
    this.startLevel(levelIndex);
  }

  startLevel(i: number) {
    this.levelIndex = i;
    this.levelDeaths = 0;
    this.world = new World(LEVELS[i], structuredClone(this.levelInv), this.skill, this.seed + i * 101);
    this.state = 'playing';
    this.stateT = 0;
    playMusic(LEVELS[i].music);
    this.emit('level');
  }

  restartLevel() {
    this.run.deaths++;
    this.levelDeaths++;
    const deaths = this.levelDeaths;
    this.world = new World(LEVELS[this.levelIndex], structuredClone(this.levelInv), this.skill, this.seed + this.levelIndex * 101 + deaths * 7);
    this.levelDeaths = deaths;
    this.state = 'playing';
    this.stateT = 0;
    this.emit('level');
  }

  /** Advance one fixed tick. */
  tick(intent: Intent) {
    this.stateT += 1 / 60;
    if (this.state !== 'playing') return;
    const w = this.world;
    const wasDead = w.player.dead;
    w.tick(intent);
    if (!wasDead && w.player.dead) this.emit('death');
    if (w.complete) this.finishLevel();
  }

  private finishLevel() {
    const w = this.world;
    const s = w.stats;
    this.run.levelsCompleted++;
    this.run.kills += s.kills;
    this.run.totalKills += s.totalKills;
    this.run.items += s.items;
    this.run.secrets += s.secrets;
    this.run.time += w.time;
    this.run.perLevel.push({ id: w.level.id, time: w.time, kills: s.kills, totalKills: s.totalKills, items: s.items, totalItems: s.totalItems, secrets: s.secrets, totalSecrets: s.totalSecrets, deaths: this.levelDeaths });
    this.levelInv = w.inventory();
    this.state = this.levelIndex + 1 < LEVELS.length ? 'intermission' : 'victory';
    this.stateT = 0;
    playMusic('title');
    sfx('bigPickup', 1);
    this.emit(this.state === 'victory' ? 'victory' : 'complete');
  }

  /** "Press use" on non-playing screens. */
  advance() {
    if (this.state === 'intermission' && this.stateT > 0.6) this.startLevel(this.levelIndex + 1);
    else if (this.state === 'victory' && this.stateT > 1) { this.state = 'title'; this.emit('title'); }
    else if (this.state === 'playing' && this.world.player.dead && this.world.time - this.world.player.lastDmgT > 0.8) this.restartLevel();
  }

  get skillName() {
    return SKILLS[this.skill].name;
  }

  get nextLevelName() {
    const n = LEVELS[this.levelIndex + 1];
    return n ? `${n.id} ${n.name}` : null;
  }
}
