
import { Component, ChangeDetectionStrategy, signal, effect, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Player {
  x: number; // percentage from left
  y: number; // percentage from top
  width: number;
  height: number;
  speed: number;
}

interface Wave {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  amplitude: number;
  frequency: number;
  crestThickness: number; // The dangerous part of the wave
}

type GameState = 'menu' | 'playing' | 'gameOver';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule],
})
export class AppComponent implements OnInit {
  // Game State
  gameState = signal<GameState>('menu');
  score = signal(0);
  highScore = signal(0);
  
  // Player State
  player = signal<Player>({
    x: 47.5,
    y: 85,
    width: 5,
    height: 5,
    speed: 0.8,
  });

  // Waves State
  waves = signal<Wave[]>([]);
  private nextWaveId = 0;
  private lastTimestamp = 0;
  private gameLoopId: number | null = null;
  private waveSpawnTimer = 0;

  private pressedKeys = new Set<string>();

  constructor() {
    effect(() => {
      const state = this.gameState();
      if (state === 'playing') {
        this.lastTimestamp = performance.now();
        this.gameLoop(this.lastTimestamp);
      } else {
        if (this.gameLoopId) {
          cancelAnimationFrame(this.gameLoopId);
          this.gameLoopId = null;
        }
      }
    });
  }

  ngOnInit() {
    const storedHighScore = localStorage.getItem('waveRiderHighScore');
    if (storedHighScore) {
      this.highScore.set(JSON.parse(storedHighScore));
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (this.gameState() !== 'playing') return;
    this.pressedKeys.add(event.key);
  }

  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    this.pressedKeys.delete(event.key);
  }

  startGame() {
    this.resetGame();
    this.gameState.set('playing');
  }

  resetGame() {
    this.score.set(0);
    this.player.set({ ...this.player(), x: 47.5 });
    this.waves.set([]);
    this.waveSpawnTimer = 1500; // Start with a delay for the first wave
  }

  private gameLoop = (timestamp: number) => {
    const deltaTime = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.updatePlayer(deltaTime);
    this.updateWaves(deltaTime);
    this.checkCollisions();

    this.score.update(s => s + 1);

    this.gameLoopId = requestAnimationFrame(this.gameLoop);
  }

  private updatePlayer(deltaTime: number) {
    this.player.update(p => {
      let newX = p.x;
      if (this.pressedKeys.has('ArrowLeft') || this.pressedKeys.has('a')) {
        newX -= p.speed * (deltaTime / 16);
      }
      if (this.pressedKeys.has('ArrowRight') || this.pressedKeys.has('d')) {
        newX += p.speed * (deltaTime / 16);
      }
      // Clamp player position within screen bounds
      newX = Math.max(0, Math.min(100 - p.width, newX));
      return { ...p, x: newX };
    });
  }

  private updateWaves(deltaTime: number) {
    // Move existing waves
    this.waves.update(currentWaves => {
      const newWaves = currentWaves.map(wave => ({
        ...wave,
        y: wave.y + wave.speed * (deltaTime / 16),
      }));
      // Filter out waves that are off-screen
      return newWaves.filter(wave => wave.y < 100);
    });

    // Spawn new waves
    this.waveSpawnTimer -= deltaTime;
    if (this.waveSpawnTimer <= 0) {
      this.spawnWave();
      // Difficulty scaling: waves spawn faster over time
      const difficultyFactor = 1 - (this.score() / 50000); // gets faster up to 50k score
      const baseInterval = 1200;
      const minInterval = 400;
      this.waveSpawnTimer = Math.max(minInterval, baseInterval * difficultyFactor) + (Math.random() * 400 - 200);
    }
  }

  private spawnWave() {
    const width = 50 + Math.random() * 50;
    const x = Math.random() * (100 - width);
    const speed = 0.2 + Math.random() * 0.2 + (this.score() / 20000);

    const newWave: Wave = {
      id: this.nextWaveId++,
      x: x,
      y: -20, // Start off-screen
      width: width,
      height: 10 + Math.random() * 10,
      speed: Math.min(speed, 1.0), // Cap max speed
      amplitude: 5 + Math.random() * 5,
      frequency: 2 + Math.random() * 3,
      crestThickness: 2, // 2% of the screen height
    };
    this.waves.update(waves => [...waves, newWave]);
  }

  private checkCollisions() {
    const p = this.player();
    for (const wave of this.waves()) {
      // Simple AABB collision detection
      const waveCrestY = wave.y;
      
      const pRight = p.x + p.width;
      const waveRight = wave.x + wave.width;

      if (
        p.x < waveRight &&
        pRight > wave.x &&
        p.y < waveCrestY + wave.crestThickness &&
        p.y + p.height > waveCrestY
      ) {
        this.gameOver();
        return;
      }
    }
  }

  private gameOver() {
    this.gameState.set('gameOver');
    if (this.score() > this.highScore()) {
      this.highScore.set(this.score());
      localStorage.setItem('waveRiderHighScore', JSON.stringify(this.highScore()));
    }
  }
  
  // Helper to generate the SVG path for a wave's shape
  generateWavePath(wave: Wave): string {
    const h = wave.height; // Use wave's height as base for amplitude
    const w = wave.width;
    const numPoints = 20;
    let path = `M 0,${h}`;
    for (let i = 0; i <= numPoints; i++) {
        const x = (i / numPoints) * w;
        const y = h + (h/2 * Math.sin((i / numPoints) * wave.frequency + (this.lastTimestamp / 500)));
        path += ` L ${x},${y}`;
    }
    path += ` L ${w},${h * 4} L 0,${h * 4} Z`;
    return path;
  }
}
