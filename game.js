const EMPTY = 0, BLACK = 1, WHITE = 2;
const BOARD_SIZE = 8;
const DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

let board = [];
let barrierActive = [];
let currentPlayer = BLACK;
let barrierAvailable = {};
let gameMode = 'pvp';
let aiPlayer = WHITE;
let humanPlayer = BLACK;
let aiLevel = 2;
let selectedAIDiff = null;
let selectedPlayerStone = null;
let gameOver = false;
let barrierMode = false;
let lastMove = null;
let moveCount = 0;
let thinking = false;

function initBoard() {
  board = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(EMPTY));
  barrierActive = Array.from({length: BOARD_SIZE}, () => Array(BOARD_SIZE).fill(false));
  board[3][3] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;
  board[4][4] = WHITE;
  currentPlayer = BLACK;
  barrierAvailable = {[BLACK]: true, [WHITE]: true};
  gameOver = false;
  barrierMode = false;
  lastMove = null;
  moveCount = 0;
  thinking = false;
}

function isValidCell(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function isEdgeCell(r, c) {
  return r === 0 || r === BOARD_SIZE - 1 || c === 0 || c === BOARD_SIZE - 1;
}

function isCornerCell(r, c) {
  return (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1);
}

// Scans all directions from (row, col) once. A barrier stone blocks the
// entire line it sits on (that line yields no flips), and is recorded as
// "consumed": the barrier only shields against the first such attempt —
// once it has blocked one flip it reverts to a normal, flippable stone.
function computeMoveResult(row, col, player, bd, barrier) {
  bd = bd || board;
  barrier = barrier || barrierActive;
  const opponent = player === BLACK ? WHITE : BLACK;
  const flips = [];
  const consumedBarriers = [];
  for (const [dr, dc] of DIRECTIONS) {
    const temp = [];
    let r = row + dr, c = col + dc;
    let hitBarrier = null;
    while (isValidCell(r, c)) {
      if (bd[r][c] === opponent) {
        if (barrier[r][c]) {
          hitBarrier = {row: r, col: c};
          break;
        }
        temp.push({row: r, col: c});
      } else if (bd[r][c] === player) {
        break;
      } else {
        temp.length = 0;
        break;
      }
      r += dr;
      c += dc;
    }
    if (hitBarrier) {
      consumedBarriers.push(hitBarrier);
      continue;
    }
    if (isValidCell(r, c) && bd[r][c] === player) {
      flips.push(...temp);
    }
  }
  return {flips, consumedBarriers};
}

function getFlippableCells(row, col, player, bd, barrier) {
  return computeMoveResult(row, col, player, bd, barrier).flips;
}

function isValidMove(row, col, player, bd, barrier) {
  bd = bd || board;
  barrier = barrier || barrierActive;
  if (!isValidCell(row, col) || bd[row][col] !== EMPTY) return false;
  return getFlippableCells(row, col, player, bd, barrier).length > 0;
}

function getValidMoves(player, bd, barrier) {
  bd = bd || board;
  barrier = barrier || barrierActive;
  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (bd[r][c] === EMPTY && isValidMove(r, c, player, bd, barrier)) {
        moves.push({row: r, col: c});
      }
    }
  }
  return moves;
}

function getValidBarrierCells(bd, barrier, player) {
  bd = bd || board;
  barrier = barrier || barrierActive;
  player = player || currentPlayer;
  const cells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (bd[r][c] === EMPTY && !isEdgeCell(r, c) && isValidMove(r, c, player, bd, barrier)) {
        cells.push({row: r, col: c});
      }
    }
  }
  return cells;
}

function performMove(row, col, player, useBarrier) {
  if (useBarrier) {
    board[row][col] = player;
    barrierActive[row][col] = true;
    barrierAvailable[player] = false;
  } else {
    board[row][col] = player;
    const {flips, consumedBarriers} = computeMoveResult(row, col, player, board, barrierActive);
    for (const f of flips) {
      board[f.row][f.col] = player;
    }
    for (const b of consumedBarriers) {
      barrierActive[b.row][b.col] = false;
    }
  }
  lastMove = {row, col};
  moveCount++;
}

function hasLegalMove(player, bd, barrier) {
  return getValidMoves(player, bd, barrier).length > 0;
}

function countStones(bd) {
  bd = bd || board;
  let black = 0, white = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (bd[r][c] === BLACK) black++;
      else if (bd[r][c] === WHITE) white++;
    }
  }
  return {black, white};
}

function getOpponent(p) { return p === BLACK ? WHITE : BLACK; }

function cloneState() {
  return {
    board: board.map(r => [...r]),
    barrierActive: barrierActive.map(r => [...r]),
    currentPlayer,
    barrierAvailable: {...barrierAvailable},
    moveCount,
  };
}

function restoreState(state) {
  board = state.board.map(r => [...r]);
  barrierActive = state.barrierActive.map(r => [...r]);
  currentPlayer = state.currentPlayer;
  barrierAvailable = {...state.barrierAvailable};
  moveCount = state.moveCount;
}

// --- AI ---

const POSITION_WEIGHTS = [
  [ 100, -20,  10,   5,   5,  10, -20,  100],
  [ -20, -50,  -2,  -2,  -2,  -2, -50,  -20],
  [  10,  -2,   0,   1,   1,   0,  -2,   10],
  [   5,  -2,   1,   0,   0,   1,  -2,    5],
  [   5,  -2,   1,   0,   0,   1,  -2,    5],
  [  10,  -2,   0,   1,   1,   0,  -2,   10],
  [ -20, -50,  -2,  -2,  -2,  -2, -50,  -20],
  [ 100, -20,  10,   5,   5,  10, -20,  100],
];

function evaluateBoard(bd, barrier, player) {
  const opponent = getOpponent(player);
  const counts = countStones(bd);
  const total = counts.black + counts.white;

  let score = 0;

  // Disk parity (early/mid game weight less)
  const parityWeight = total < 20 ? 5 : total < 50 ? 10 : 20;
  const diskDiff = (player === BLACK ? counts.black : counts.white) -
                   (player === BLACK ? counts.white : counts.black);
  score += diskDiff * parityWeight;

  // Position / corner weight
  let posScore = 0;
  let cornerScore = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (bd[r][c] === player) {
        posScore += POSITION_WEIGHTS[r][c];
        if (isCornerCell(r, c)) cornerScore += 50;
      } else if (bd[r][c] === opponent) {
        posScore -= POSITION_WEIGHTS[r][c];
        if (isCornerCell(r, c)) cornerScore -= 50;
      }
    }
  }
  score += posScore;
  score += cornerScore;

  // Mobility
  const myMoves = getValidMoves(player, bd, barrier).length;
  const oppMoves = getValidMoves(opponent, bd, barrier).length;
  const mobDiff = myMoves - oppMoves;
  score += mobDiff * 15;

  // Stability (edge control)
  let stableScore = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (bd[r][c] === player && isEdgeCell(r, c) && !isCornerCell(r, c)) {
        stableScore += 8;
      } else if (bd[r][c] === opponent && isEdgeCell(r, c) && !isCornerCell(r, c)) {
        stableScore -= 8;
      }
    }
  }
  score += stableScore;

  // Barrier value (having barrier available is worth something)
  if (barrierAvailable[player]) score += 10;
  if (barrierAvailable[opponent]) score -= 10;

  // Evaluate barrier positions on board
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (barrier[r][c] && bd[r][c] === player) {
        score += 8;
      } else if (barrier[r][c] && bd[r][c] === opponent) {
        score -= 15;
      }
    }
  }

  return score;
}

function orderMoves(moves, bd, barrier, player) {
  return moves.map(m => ({
    ...m,
    score: POSITION_WEIGHTS[m.row][m.col]
  })).sort((a, b) => b.score - a.score);
}

function minimax(bd, barrier, player, ba, depth, alpha, beta, isMaximizing, origPlayer) {
  const opponent = getOpponent(player);
  const moves = getValidMoves(player, bd, barrier);

  if (depth === 0 || (moves.length === 0 && !hasLegalMove(opponent, bd, barrier))) {
    return { score: evaluateBoard(bd, barrier, origPlayer) };
  }

  if (moves.length === 0) {
    return minimax(bd, barrier, opponent, ba, depth - 1, alpha, beta, !isMaximizing, origPlayer);
  }

  const ordered = orderMoves(moves, bd, barrier, player);

  if (isMaximizing) {
    let best = { score: -Infinity, move: null };
    for (const m of ordered) {
      const nbd = bd.map(r => [...r]);
      const nBarrier = barrier.map(r => [...r]);
      nbd[m.row][m.col] = player;
      const {flips, consumedBarriers} = computeMoveResult(m.row, m.col, player, nbd, nBarrier);
      for (const f of flips) nbd[f.row][f.col] = player;
      for (const b of consumedBarriers) nBarrier[b.row][b.col] = false;

      const result = minimax(nbd, nBarrier, opponent, ba, depth - 1, alpha, beta, false, origPlayer);
      if (result.score > best.score) {
        best = { score: result.score, move: m };
      }
      alpha = Math.max(alpha, best.score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = { score: Infinity, move: null };
    for (const m of ordered) {
      const nbd = bd.map(r => [...r]);
      const nBarrier = barrier.map(r => [...r]);
      nbd[m.row][m.col] = player;
      const {flips, consumedBarriers} = computeMoveResult(m.row, m.col, player, nbd, nBarrier);
      for (const f of flips) nbd[f.row][f.col] = player;
      for (const b of consumedBarriers) nBarrier[b.row][b.col] = false;

      const result = minimax(nbd, nBarrier, opponent, ba, depth - 1, alpha, beta, true, origPlayer);
      if (result.score < best.score) {
        best = { score: result.score, move: m };
      }
      beta = Math.min(beta, best.score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function evaluateBarrierOption(bd, barrier, player) {
  const cells = getValidBarrierCells(bd, barrier, player);
  if (cells.length === 0) return null;

  const opponent = getOpponent(player);
  let bestCell = null;
  let bestScore = -Infinity;

  for (const cell of cells) {
    const simBarrier = barrier.map(r => [...r]);
    simBarrier[cell.row][cell.col] = true;

    const myMoves = getValidMoves(player, bd, simBarrier);
    const oppMoves = getValidMoves(opponent, bd, simBarrier);
    const mobDiff = myMoves.length - oppMoves.length;

    let posValue = POSITION_WEIGHTS[cell.row][cell.col];
    let safetyValue = 0;
    for (const [dr, dc] of DIRECTIONS) {
      let r = cell.row + dr, c = cell.col + dc;
      let count = 0;
      while (isValidCell(r, c) && bd[r][c] === opponent) {
        count++;
        r += dr;
        c += dc;
      }
      if (isValidCell(r, c) && bd[r][c] === player && count > 0) {
        safetyValue += count * 2;
      }
    }

    const score = mobDiff * 10 + posValue * 2 + safetyValue;
    if (score > bestScore) {
      bestScore = score;
      bestCell = cell;
    }
  }
  return bestCell;
}

function aiTryBarrier() {
  if (!barrierAvailable[currentPlayer]) return null;
  if (aiLevel === 1) {
    if (Math.random() < 0.15) {
      const cells = getValidBarrierCells();
      if (cells.length > 0) return cells[Math.floor(Math.random() * cells.length)];
    }
    return null;
  }
  if (moveCount < (aiLevel >= 4 ? 2 : aiLevel >= 3 ? 3 : 5)) return null;
  const bc = evaluateBarrierOption(board, barrierActive, currentPlayer);
  if (!bc) return null;
  if (aiLevel === 2 && Math.random() < 0.3) return bc;
  const simBarrier = barrierActive.map(r => [...r]);
  simBarrier[bc.row][bc.col] = true;
  const normalEval = evaluateBoard(board, barrierActive, currentPlayer);
  const barrierEval = evaluateBoard(board, simBarrier, currentPlayer);
  const threshold = aiLevel >= 4 ? 10 : aiLevel >= 3 ? 7 : 5;
  if (barrierEval > normalEval + threshold) return bc;
  return null;
}

function aiMove() {
  if (gameOver || thinking) return;
  thinking = true;

  setTimeout(() => {
    const moves = getValidMoves(currentPlayer);

    if (moves.length === 0) {
      const barrierCell = aiTryBarrier();
      if (barrierCell) {
        performMove(barrierCell.row, barrierCell.col, currentPlayer, true);
        renderBoard();
        switchTurn();
      } else {
        switchTurn();
      }
      thinking = false;
      return;
    }

    const barrierCell = aiTryBarrier();
    if (barrierCell) {
      performMove(barrierCell.row, barrierCell.col, currentPlayer, true);
      renderBoard();
      switchTurn();
      thinking = false;
      return;
    }

    let chosenMove;

    const mistakeChance = aiLevel === 1 ? 0.35 : aiLevel === 2 ? 0.2 : aiLevel === 3 ? 0.12 : 0.06;
    if (Math.random() < mistakeChance) {
      chosenMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (aiLevel === 1) {
      const scored = moves.map(m => ({
        ...m,
        score: POSITION_WEIGHTS[m.row][m.col] + Math.random() * 30 - 15
      }));
      scored.sort((a, b) => b.score - a.score);
      chosenMove = scored[0];
    } else if (aiLevel === 2) {
      let bestScore = -Infinity;
      chosenMove = moves[0];
      for (const m of moves) {
        const nbd = board.map(r => [...r]);
        const nBarrier = barrierActive.map(r => [...r]);
        nbd[m.row][m.col] = currentPlayer;
        const {flips, consumedBarriers} = computeMoveResult(m.row, m.col, currentPlayer, nbd, nBarrier);
        for (const f of flips) nbd[f.row][f.col] = currentPlayer;
        for (const b of consumedBarriers) nBarrier[b.row][b.col] = false;
        const score = evaluateBoard(nbd, nBarrier, currentPlayer);
        if (score > bestScore) {
          bestScore = score;
          chosenMove = m;
        }
      }
    } else if (aiLevel === 3) {
      const depth = 3;
      const result = minimax(board, barrierActive, currentPlayer, barrierAvailable,
                             depth, -Infinity, Infinity, true, currentPlayer);
      chosenMove = result.move || moves[0];
    } else {
      const depth = 5;
      const result = minimax(board, barrierActive, currentPlayer, barrierAvailable,
                             depth, -Infinity, Infinity, true, currentPlayer);
      chosenMove = result.move || moves[0];
    }

    if (chosenMove) {
      performMove(chosenMove.row, chosenMove.col, currentPlayer, false);
      renderBoard();
      switchTurn();
    }
    thinking = false;
  }, aiLevel === 4 ? 200 : aiLevel === 3 ? 150 : 100);
}

function switchTurn() {
  const opponent = getOpponent(currentPlayer);
  currentPlayer = opponent;

  if (barrierMode) {
    barrierMode = false;
    document.getElementById('barrier-hint').classList.add('hidden');
    document.getElementById('cancel-barrier-btn').classList.add('hidden');
    document.getElementById('barrier-btn').classList.remove('hidden');
  }

  if (!hasLegalMove(currentPlayer)) {
    const prev = getOpponent(currentPlayer);
    if (!hasLegalMove(prev)) {
      gameOver = true;
      renderBoard();
      showResult();
      return;
    }
    currentPlayer = prev;
    document.getElementById('game-status').textContent =
      `${prev === BLACK ? '黒' : '白'}がパス！`;
    renderBoard();
    setTimeout(() => {
      if (!gameOver) {
        if (gameMode === 'ai' && currentPlayer === aiPlayer) {
          aiMove();
        }
      }
    }, 800);
    return;
  }

  renderBoard();

  if (!gameOver && gameMode === 'ai' && currentPlayer === aiPlayer) {
    aiMove();
  }
}

function updateUI() {
  const counts = countStones();
  document.getElementById('score-black').textContent = counts.black;
  document.getElementById('score-white').textContent = counts.white;

  document.getElementById('turn-black').classList.toggle('active', currentPlayer === BLACK);
  document.getElementById('turn-white').classList.toggle('active', currentPlayer === WHITE);
  document.getElementById('player1-info').classList.toggle('active-turn', currentPlayer === BLACK);
  document.getElementById('player2-info').classList.toggle('active-turn', currentPlayer === WHITE);

  const barrierBlackStatus = document.getElementById('barrier-black-status');
  const barrierWhiteStatus = document.getElementById('barrier-white-status');
  const barrierBlack = document.getElementById('barrier-black');
  const barrierWhite = document.getElementById('barrier-white');

  barrierBlackStatus.textContent = barrierAvailable[BLACK] ? '使用可' : '使用済';
  barrierWhiteStatus.textContent = barrierAvailable[WHITE] ? '使用可' : '使用済';
  barrierBlack.classList.toggle('barrier-used', !barrierAvailable[BLACK]);
  barrierWhite.classList.toggle('barrier-used', !barrierAvailable[WHITE]);

  const status = document.getElementById('game-status');
  if (!gameOver) {
    status.textContent = `${currentPlayer === BLACK ? '黒' : '白'}の手番`;
  }

  const barrierBtn = document.getElementById('barrier-btn');
  if (gameMode === 'ai' && currentPlayer === aiPlayer) {
    barrierBtn.disabled = true;
  } else if (gameOver || barrierMode) {
    barrierBtn.disabled = true;
  } else {
    barrierBtn.disabled = !barrierAvailable[currentPlayer];
  }
}

// --- UI ---

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.onclick = () => onCellClick(r, c);

      if (board[r][c] !== EMPTY) {
        const stone = document.createElement('div');
        stone.className = `stone ${board[r][c] === BLACK ? 'black' : 'white'}`;
        if (barrierActive[r][c]) {
          stone.classList.add('barrier-stone');
          stone.title = 'バリア石（次の反転を1回だけ無効化・使用後は通常の石）';
        }
        if (lastMove && lastMove.row === r && lastMove.col === c) {
          stone.classList.add('last-move');
        }
        cell.appendChild(stone);
      }

      if (!gameOver && board[r][c] === EMPTY && !barrierMode && currentPlayer === humanPlayer) {
        if (isValidMove(r, c, currentPlayer)) {
          cell.classList.add('valid-move');
        }
      }

      if (!gameOver && barrierMode && board[r][c] === EMPTY && !isEdgeCell(r, c) && isValidMove(r, c, currentPlayer)) {
        cell.classList.add('valid-barrier');
      }

      boardEl.appendChild(cell);
    }
  }

  updateUI();
}

function onCellClick(row, col) {
  if (gameOver || thinking) return;
  if (gameMode === 'ai' && currentPlayer !== humanPlayer) return;

  if (barrierMode) {
    if (board[row][col] !== EMPTY) return;
    if (isEdgeCell(row, col)) return;
    if (!isValidMove(row, col, currentPlayer)) return;

    performMove(row, col, currentPlayer, true);
    renderBoard();
    barrierMode = false;
    document.getElementById('barrier-hint').classList.add('hidden');
    document.getElementById('cancel-barrier-btn').classList.add('hidden');
    document.getElementById('barrier-btn').classList.remove('hidden');
    switchTurn();
    return;
  }

  if (board[row][col] !== EMPTY) return;
  if (!isValidMove(row, col, currentPlayer)) return;

  performMove(row, col, currentPlayer, false);
  renderBoard();
  switchTurn();
}

function toggleBarrierMode() {
  if (gameOver) return;
  if (!barrierAvailable[currentPlayer]) return;
  if (gameMode === 'ai' && currentPlayer === aiPlayer) return;
  const barrierCells = getValidBarrierCells();
  if (barrierCells.length === 0) {
    document.getElementById('game-status').textContent = 'バリア石を置ける場所がありません！';
    return;
  }

  barrierMode = true;
  document.getElementById('barrier-btn').classList.add('hidden');
  document.getElementById('cancel-barrier-btn').classList.remove('hidden');
  document.getElementById('barrier-hint').classList.remove('hidden');
  renderBoard();
}

function cancelBarrierMode() {
  barrierMode = false;
  document.getElementById('barrier-btn').classList.remove('hidden');
  document.getElementById('cancel-barrier-btn').classList.add('hidden');
  document.getElementById('barrier-hint').classList.add('hidden');
  renderBoard();
}

function showResult() {
  const counts = countStones();
  const modal = document.getElementById('result-modal');
  const title = document.getElementById('result-title');
  const text = document.getElementById('result-text');

  if (counts.black > counts.white) {
    title.textContent = '黒の勝利！';
    text.textContent = `黒: ${counts.black} 石 vs 白: ${counts.white} 石`;
  } else if (counts.white > counts.black) {
    title.textContent = '白の勝利！';
    text.textContent = `白: ${counts.white} 石 vs 黒: ${counts.black} 石`;
  } else {
    title.textContent = '引き分け！';
    text.textContent = `黒: ${counts.black} 石, 白: ${counts.white} 石`;
  }

  modal.classList.remove('hidden');
}

function startGame(mode) {
  if (mode === 'ai' && (!selectedAIDiff || !selectedPlayerStone)) return;

  gameMode = mode;
  if (mode === 'ai') {
    aiLevel = selectedAIDiff;
    humanPlayer = selectedPlayerStone;
    aiPlayer = getOpponent(humanPlayer);
  } else {
    humanPlayer = BLACK;
    aiPlayer = WHITE;
  }

  document.getElementById('menu-screen').classList.remove('active');
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
  document.getElementById('game-screen').classList.add('active');
  document.getElementById('result-modal').classList.add('hidden');

  initBoard();
  renderBoard();
  updateUI();

  if (mode === 'ai' && currentPlayer === aiPlayer) {
    aiMove();
  }
}

function showMenu() {
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('menu-screen').classList.remove('hidden');
  document.getElementById('menu-screen').classList.add('active');
  document.getElementById('result-modal').classList.add('hidden');
  document.getElementById('ai-settings').classList.add('hidden');
}

function restartGame() {
  document.getElementById('result-modal').classList.add('hidden');
  initBoard();
  renderBoard();
  updateUI();
  if (gameMode === 'ai' && currentPlayer === aiPlayer) {
    aiMove();
  }
}

function showAISettings() {
  document.getElementById('ai-settings').classList.remove('hidden');
}

function setAIDifficulty(level) {
  selectedAIDiff = level;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.diff-btn[data-level="${level}"]`).classList.add('selected');

  const descs = {
    1: 'ランダム要素を含む弱い評価。角・辺の理解が弱く、ミスを含む。初心者・学習用。',
    2: '基本的な評価関数。角重視・安定重視。先読み1〜2手程度。一般プレイヤー向け。',
    3: '高精度評価関数。3〜5手先読み。バリア石の最適利用を考慮。強い対戦相手。',
    4: 'ミニマックス＋αβ枝刈り。深い読み（6手）。バリア石使用も最適化。最強レベル。'
  };
  document.getElementById('ai-desc').textContent = descs[level];

  if (selectedPlayerStone) {
    document.getElementById('start-ai-btn').disabled = false;
  }
}

function selectPlayerStone(stone) {
  selectedPlayerStone = stone;
  document.querySelectorAll('.stone-option').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.stone-option').forEach(b => {
    if ((stone === 1 && b.querySelector('.stone-preview.dark')) ||
        (stone === 2 && b.querySelector('.stone-preview.light'))) {
      b.classList.add('selected');
    }
  });

  if (selectedAIDiff) {
    document.getElementById('start-ai-btn').disabled = false;
  }
}
