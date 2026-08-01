// ============================================================
//  ИГРА 2048 (для отдыха между задачами)
// ============================================================

const GAME_SIZE = 4;
const GAME_BEST_KEY = 'mm_game_best_2048';

let grid = [];
let score = 0;
let best = 0;
let gameOver = false;

function emptyGrid() {
  return Array.from({ length: GAME_SIZE }, () => Array(GAME_SIZE).fill(0));
}

function randomEmptyCell() {
  const empties = [];
  for (let r = 0; r < GAME_SIZE; r++)
    for (let c = 0; c < GAME_SIZE; c++)
      if (grid[r][c] === 0) empties.push([r, c]);
  return empties.length ? empties[Math.floor(Math.random() * empties.length)] : null;
}

function addRandomTile() {
  const cell = randomEmptyCell();
  if (!cell) return;
  grid[cell[0]][cell[1]] = Math.random() < 0.9 ? 2 : 4;
}

function startGame() {
  grid = emptyGrid();
  score = 0;
  gameOver = false;
  addRandomTile();
  addRandomTile();
  document.getElementById('game-overlay').style.display = 'none';
  render();
}

// --------- логика сдвига (единая функция, работает построчно) ---------

function slideAndMergeLine(line) {
  const nums = line.filter(v => v !== 0);
  const result = [];
  let gained = 0;
  for (let i = 0; i < nums.length; i++) {
    if (nums[i] === nums[i + 1]) {
      const merged = nums[i] * 2;
      result.push(merged);
      gained += merged;
      i++;
    } else {
      result.push(nums[i]);
    }
  }
  while (result.length < GAME_SIZE) result.push(0);
  return { line: result, gained };
}

function getColumn(g, c) { return g.map(row => row[c]); }
function setColumn(g, c, colValues) { colValues.forEach((v, r) => g[r][c] = v); }

function move(direction) {
  if (gameOver) return;
  const prevGrid = JSON.stringify(grid);
  let totalGained = 0;

  if (direction === 'left' || direction === 'right') {
    for (let r = 0; r < GAME_SIZE; r++) {
      let line = grid[r].slice();
      if (direction === 'right') line = line.reverse();
      const { line: newLine, gained } = slideAndMergeLine(line);
      totalGained += gained;
      grid[r] = direction === 'right' ? newLine.reverse() : newLine;
    }
  } else {
    for (let c = 0; c < GAME_SIZE; c++) {
      let col = getColumn(grid, c);
      if (direction === 'down') col = col.reverse();
      const { line: newCol, gained } = slideAndMergeLine(col);
      totalGained += gained;
      setColumn(grid, c, direction === 'down' ? newCol.reverse() : newCol);
    }
  }

  if (JSON.stringify(grid) === prevGrid) return; // ничего не сдвинулось

  score += totalGained;
  if (score > best) { best = score; localStorage.setItem(GAME_BEST_KEY, String(best)); }
  addRandomTile();
  render();
  checkGameState();
}

function canMoveAnywhere() {
  for (let r = 0; r < GAME_SIZE; r++) {
    for (let c = 0; c < GAME_SIZE; c++) {
      if (grid[r][c] === 0) return true;
      if (c < GAME_SIZE - 1 && grid[r][c] === grid[r][c + 1]) return true;
      if (r < GAME_SIZE - 1 && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

function checkGameState() {
  const hasWon = grid.some(row => row.some(v => v === 2048));
  if (hasWon && !gameOver) {
    gameOver = true;
    showOverlay('🎉 Ура, собрали 2048!');
    return;
  }
  if (!canMoveAnywhere()) {
    gameOver = true;
    showOverlay('Ходов больше нет');
  }
}

function showOverlay(text) {
  document.getElementById('game-overlay-text').textContent = text;
  document.getElementById('game-overlay').style.display = 'flex';
}

// --------- рендер ---------

function render() {
  document.getElementById('game-score').textContent = score;
  document.getElementById('game-best').textContent = best;

  const board = document.getElementById('game-board');
  board.innerHTML = '';
  for (let r = 0; r < GAME_SIZE; r++) {
    for (let c = 0; c < GAME_SIZE; c++) {
      const v = grid[r][c];
      const cell = document.createElement('div');
      cell.className = `game-cell${v ? ` game-cell-${v > 2048 ? 'super' : v}` : ''}`;
      if (v) cell.textContent = v;
      board.appendChild(cell);
    }
  }
}

// --------- управление ---------

function initControls() {
  document.addEventListener('keydown', e => {
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
  });

  let touchStartX = 0, touchStartY = 0;
  const board = document.getElementById('game-board');
  board.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  board.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; // слишком короткий свайп
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  }, { passive: true });

  document.getElementById('game-new').addEventListener('click', startGame);
  document.getElementById('game-restart').addEventListener('click', startGame);
}

document.addEventListener('DOMContentLoaded', () => {
  onAuthReady(user => {
    if (!user) return;
    best = parseInt(localStorage.getItem(GAME_BEST_KEY), 10) || 0;
    initControls();
    startGame();
  });
});
