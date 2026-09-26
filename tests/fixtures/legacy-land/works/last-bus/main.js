// The Twice-a-Day Bus: three people wait at the last stop. Listen to each; then the bus comes.
const PEOPLE = [
  "Hot again. The bus is late, the way it always is in August.",
  "I am taking eggs to my sister. She says the town ones taste of nothing.",
  "We stand on the left of the sign. Nobody remembers why, so we keep doing it.",
];
const TIMETABLE = "the 4:10 bus";

function newGame() {
  return { heard: 0, arrived: false };
}

const game = host.load(newGame());
const line = document.createElement("p");
const hint = document.createElement("p");
hint.className = "hint";
host.root.append(line, hint);

function show() {
  if (game.arrived) {
    line.textContent = "The bus pulls in, dusty and slow. Someone waves you aboard.";
    hint.textContent = "";
    return;
  }
  line.textContent =
    game.heard === 0 ? "Three people wait at the last stop." : PEOPLE[game.heard - 1];
  hint.textContent = "Press Enter to listen.";
  host.status(`${game.heard} / ${PEOPLE.length} heard`);
}

window.addEventListener("keydown", (event) => {
  if (game.arrived || (event.key !== "Enter" && event.key !== " ")) return;
  if (game.heard < PEOPLE.length) {
    game.heard += 1;
  } else {
    game.arrived = true;
    host.complete("You listened to everyone at the last stop until the bus came.", {
      timetable: TIMETABLE,
    });
  }
  host.save(game);
  show();
});

show();
