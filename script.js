const DIFFICULTY_CONFIG = {
  easy: { rows: 4, cols: 4, pairs: 8 },
  medium: { rows: 4, cols: 5, pairs: 10 },
  hard: { rows: 6, cols: 6, pairs: 18 }
};

const EMOJI_POOL = [
  "😀", "😺", "🐶", "🐼", "🦊", "🐵", "🦁", "🐸", "🐙",
  "🐳", "🍕", "🍉", "🍩", "🍓", "⚽", "🏀", "🎸", "🎮",
  "🚗", "🚀", "🌈", "🌟", "🔥", "💡", "🎯", "🧩", "🎁"
];

const boardEl = document.getElementById("board");
const difficultyEl = document.getElementById("difficulty");
const movesEl = document.getElementById("moves");
const timeEl = document.getElementById("time");
const matchesEl = document.getElementById("matches");
const bestScoreEl = document.getElementById("bestScore");
const newGameBtn = document.getElementById("newGameBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("srStatus");
const winDialog = document.getElementById("winDialog");
const winSummaryEl = document.getElementById("winSummary");
const playAgainBtn = document.getElementById("playAgainBtn");

let cards = [];
let firstCard = null;
let secondCard = null;
let lockBoard = false;
let moves = 0;
let matches = 0;
let timerSeconds = 0;
let timerId = null;
let gameActive = false;

function fisherYatesShuffle(array) {
  const clone = [...array];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
}

function createDeck(difficultyKey) {
  const config = DIFFICULTY_CONFIG[difficultyKey];
  const selectedEmojis = fisherYatesShuffle(EMOJI_POOL).slice(0, config.pairs);
  const pairDeck = selectedEmojis.flatMap((emoji, pairId) => ([
    { id: `${pairId}-a`, pairId, emoji, flipped: false, matched: false },
    { id: `${pairId}-b`, pairId, emoji, flipped: false, matched: false }
  ]));
  return fisherYatesShuffle(pairDeck);
}

function getCurrentConfig() {
  return DIFFICULTY_CONFIG[difficultyEl.value];
}

function formatTime(totalSeconds) {
  const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const secs = String(totalSeconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function announce(message) {
  statusEl.textContent = message;
}

function getScore() {
  const difficultyMultiplier = { easy: 1, medium: 1.2, hard: 1.5 }[difficultyEl.value];
  const rawScore = 2000 - (moves * 20 + timerSeconds * 2);
  return Math.max(0, Math.floor(rawScore * difficultyMultiplier));
}

function loadBestScores() {
  try {
    return JSON.parse(localStorage.getItem("emoji-memory-best")) || {};
  } catch {
    return {};
  }
}

function saveBestScoreIfNeeded() {
  const difficulty = difficultyEl.value;
  const scores = loadBestScores();
  const current = { moves, time: timerSeconds, score: getScore() };
  const best = scores[difficulty];

  const isBetter = !best
    || current.score > best.score
    || (current.score === best.score && current.moves < best.moves)
    || (current.score === best.score && current.moves === best.moves && current.time < best.time);

  if (isBetter) {
    scores[difficulty] = current;
    localStorage.setItem("emoji-memory-best", JSON.stringify(scores));
  }
}

function renderBestScore() {
  const scores = loadBestScores();
  const best = scores[difficultyEl.value];
  bestScoreEl.textContent = best
    ? `${best.score} pts (${best.moves} moves, ${formatTime(best.time)})`
    : "-";
}

function updateStats() {
  const totalPairs = getCurrentConfig().pairs;
  movesEl.textContent = String(moves);
  timeEl.textContent = formatTime(timerSeconds);
  matchesEl.textContent = `${matches} / ${totalPairs}`;
}

function setBoardLock(isLocked) {
  lockBoard = isLocked;
  boardEl.classList.toggle("locked", isLocked);
}

function getCardButton(index) {
  return boardEl.querySelector(`.card[data-index="${index}"]`);
}

function syncCardVisual(index) {
  const card = cards[index];
  const cardButton = getCardButton(index);
  if (!card || !cardButton) {
    return;
  }

  cardButton.classList.toggle("flipped", card.flipped || card.matched);
  cardButton.classList.toggle("matched", card.matched);
  cardButton.setAttribute("aria-pressed", card.flipped || card.matched ? "true" : "false");
  cardButton.disabled = card.matched;
}

function fitBoard() {
  const { cols, rows } = getCurrentConfig();
  const computed = window.getComputedStyle(boardEl);
  const gap = Number.parseFloat(computed.columnGap || computed.gap) || 0;
  const availableWidth = boardEl.clientWidth;
  const availableHeight = boardEl.clientHeight;

  if (!availableWidth || !availableHeight) {
    return;
  }

  const widthConstrained = (availableWidth - gap * (cols - 1)) / cols;
  const heightConstrained = (availableHeight - gap * (rows - 1)) / rows;
  const cardSize = Math.max(30, Math.floor(Math.min(widthConstrained, heightConstrained)));
  boardEl.style.setProperty("--card-size", `${cardSize}px`);
}

function renderBoard() {
  const { cols, rows } = getCurrentConfig();
  boardEl.style.setProperty("--columns", String(cols));
  boardEl.style.setProperty("--rows", String(rows));
  boardEl.innerHTML = cards.map((card, index) => `
    <button
      type="button"
      class="card ${card.flipped ? "flipped" : ""} ${card.matched ? "matched" : ""}"
      data-index="${index}"
      aria-label="Card ${index + 1}"
      aria-pressed="${card.flipped || card.matched ? "true" : "false"}"
      ${card.matched ? "disabled" : ""}
    >
      <span class="card-inner">
        <span class="card-face card-back" aria-hidden="true">?</span>
        <span class="card-face card-front" aria-hidden="true">${card.emoji}</span>
      </span>
    </button>
  `).join("");
  window.requestAnimationFrame(fitBoard);
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    timerSeconds += 1;
    updateStats();
  }, 1000);
}

function resetTurn() {
  firstCard = null;
  secondCard = null;
  setBoardLock(false);
}

function finishGame() {
  clearInterval(timerId);
  gameActive = false;
  saveBestScoreIfNeeded();
  renderBestScore();

  const summary = `Moves: ${moves}, Time: ${formatTime(timerSeconds)}, Score: ${getScore()} points.`;
  winSummaryEl.textContent = summary;
  announce(`Game won in ${moves} moves and ${formatTime(timerSeconds)}.`);
  if (typeof winDialog.showModal === "function") {
    winDialog.showModal();
  }
}

function checkMatch() {
  if (firstCard === null || secondCard === null) {
    return;
  }

  const first = cards[firstCard];
  const second = cards[secondCard];
  const isMatch = first.pairId === second.pairId;

  if (isMatch) {
    cards[firstCard].matched = true;
    cards[secondCard].matched = true;
    matches += 1;
    announce(`Pair matched. ${matches} of ${getCurrentConfig().pairs} found.`);
    syncCardVisual(firstCard);
    syncCardVisual(secondCard);
    resetTurn();
    updateStats();

    if (matches === getCurrentConfig().pairs) {
      finishGame();
    }
    return;
  }

  announce("Not a match.");
  setTimeout(() => {
    cards[firstCard].flipped = false;
    cards[secondCard].flipped = false;
    syncCardVisual(firstCard);
    syncCardVisual(secondCard);
    resetTurn();
  }, 800);
}

function handleCardClick(target) {
  if (!gameActive || lockBoard) {
    return;
  }

  const cardButton = target.closest(".card");
  if (!cardButton) {
    return;
  }

  const index = Number(cardButton.dataset.index);
  if (Number.isNaN(index)) {
    return;
  }

  const selectedCard = cards[index];
  if (!selectedCard || selectedCard.matched || selectedCard.flipped) {
    return;
  }

  cards[index].flipped = true;
  syncCardVisual(index);

  if (firstCard === null) {
    firstCard = index;
    announce("First card selected.");
    return;
  }

  if (firstCard === index) {
    return;
  }

  secondCard = index;
  moves += 1;
  updateStats();
  setBoardLock(true);
  checkMatch();
}

function startGame() {
  clearInterval(timerId);
  if (winDialog.open) {
    winDialog.close();
  }

  cards = createDeck(difficultyEl.value);
  firstCard = null;
  secondCard = null;
  moves = 0;
  matches = 0;
  timerSeconds = 0;
  gameActive = true;
  setBoardLock(false);

  renderBoard();
  updateStats();
  renderBestScore();
  announce(`New ${difficultyEl.value} game started.`);
  startTimer();
}

boardEl.addEventListener("click", (event) => {
  handleCardClick(event.target);
});

newGameBtn.addEventListener("click", startGame);
resetBtn.addEventListener("click", startGame);
difficultyEl.addEventListener("change", startGame);

playAgainBtn.addEventListener("click", () => {
  winDialog.close();
  startGame();
});

window.addEventListener("resize", () => {
  window.requestAnimationFrame(fitBoard);
});

startGame();
