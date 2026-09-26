// Firefly Jar: move the jar over the dusk paddy and catch fireflies. Five fill the jar.
const GOAL = 5;
const FLIES = 7;
const JAR_SPEED = 160;
const REACH = 24;
const WIDTH = 480;
const HEIGHT = 320;

const canvas = document.createElement("canvas");
canvas.width = WIDTH;
canvas.height = HEIGHT;
host.root.appendChild(canvas);
const ctx = canvas.getContext("2d");

function newGame() {
  return { caught: 0, done: false };
}

const game = host.load(newGame());
const jar = { x: WIDTH / 2, y: HEIGHT - 60 };
const held = new Set();
let clock = 0;
const flies = [];
for (let i = 0; i < FLIES; i += 1) flies.push({ seed: i * 1.7, gone: false });

function flyAt(fly) {
  return {
    x: WIDTH / 2 + Math.sin(clock * 0.6 + fly.seed) * (WIDTH / 2 - 40),
    y: 70 + Math.cos(clock * 0.9 + fly.seed * 2) * 50 + fly.seed * 12,
  };
}

function tryCatch() {
  if (game.done) return;
  for (const fly of flies) {
    const at = flyAt(fly);
    if (fly.gone || Math.abs(at.x - jar.x) > REACH || Math.abs(at.y - jar.y) > REACH) continue;
    fly.gone = true;
    game.caught += 1;
    host.save(game);
    if (game.caught >= GOAL) {
      game.done = true;
      host.save(game);
      host.complete("The jar glows with five fireflies.", { fireflies: game.caught });
    }
    return;
  }
}

window.addEventListener("keydown", (event) => {
  held.add(event.key);
  if (event.key === " " || event.key === "Enter") tryCatch();
});
window.addEventListener("keyup", (event) => held.delete(event.key));

host.loop((dt) => {
  clock += dt;
  const dx =
    (held.has("ArrowRight") || held.has("d") ? 1 : 0) -
    (held.has("ArrowLeft") || held.has("a") ? 1 : 0);
  const dy =
    (held.has("ArrowDown") || held.has("s") ? 1 : 0) -
    (held.has("ArrowUp") || held.has("w") ? 1 : 0);
  jar.x = Math.min(WIDTH - 20, Math.max(20, jar.x + dx * JAR_SPEED * dt));
  jar.y = Math.min(HEIGHT - 20, Math.max(20, jar.y + dy * JAR_SPEED * dt));
  ctx.fillStyle = "#1c2433";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#2f4a2c";
  ctx.fillRect(0, HEIGHT - 40, WIDTH, 40);
  ctx.fillStyle = "#f4e27a";
  for (const fly of flies) {
    if (fly.gone) continue;
    const at = flyAt(fly);
    ctx.fillRect(at.x - 2, at.y - 2, 4, 4);
  }
  ctx.strokeStyle = "#cfe3ea";
  ctx.strokeRect(jar.x - 12, jar.y - 16, 24, 32);
  host.status(game.done ? "The jar is full." : `Fireflies: ${game.caught} / ${GOAL}`);
});
