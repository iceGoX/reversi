export const GUAVA = 1;
export const GRAPE = -1;
const DIRECTIONS = [-1, 0, 1].flatMap(r => [-1, 0, 1].filter(c => r || c).map(c => [r, c]));
export function initialState() {
  const board = Array(64).fill(0);
  board[27] = board[36] = GRAPE;
  board[28] = board[35] = GUAVA;
  return { board, turn: GUAVA, moves: 0, last: null, passed: null, over: false };
}
export function flipsFor(board, index, side) {
  if (!Number.isInteger(index) || index < 0 || index > 63 || board[index] !== 0) return [];
  const result = [];
  const row = Math.floor(index / 8), col = index % 8;
  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr, c = col + dc;
    const line = [];
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === -side) {
      line.push(r * 8 + c); r += dr; c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === side) result.push(...line);
  }
  return result;
}
export function legalMoves(board, side) {
  return board.flatMap((cell, index) => cell === 0 && flipsFor(board, index, side).length ? [index] : []);
}
export function score(board) {
  return { guava: board.filter(x => x === GUAVA).length, grape: board.filter(x => x === GRAPE).length };
}
export function play(state, index) {
  if (state.over) return null;
  const flipped = flipsFor(state.board, index, state.turn);
  if (!flipped.length) return null;
  const board = state.board.slice();
  board[index] = state.turn;
  flipped.forEach(i => { board[i] = state.turn; });
  let turn = -state.turn, passed = null, over = false;
  if (!legalMoves(board, turn).length) {
    passed = turn; turn = state.turn;
    if (!legalMoves(board, turn).length) { over = true; passed = null; }
  }
  return { board, turn, moves: state.moves + 1, last: index, passed, over, flipped };
}
const WEIGHTS = [110,-24,14,7,7,14,-24,110,-24,-45,-4,-3,-3,-4,-45,-24,14,-4,5,2,2,5,-4,14,7,-3,2,1,1,2,-3,7,7,-3,2,1,1,2,-3,7,14,-4,5,2,2,5,-4,14,-24,-45,-4,-3,-3,-4,-45,-24,110,-24,14,7,7,14,-24,110];
function evaluate(state, side) {
  const difference = state.board.reduce((sum, x) => sum + x * side, 0);
  if (state.over) return Math.sign(difference) * 100000 + difference;
  const remaining = state.board.filter(x => !x).length;
  return state.board.reduce((sum, x, i) => sum + x * side * WEIGHTS[i], 0)
    + 8 * (legalMoves(state.board, side).length - legalMoves(state.board, -side).length)
    + difference * (remaining < 14 ? 8 : -1);
}
function search(state, depth, side, alpha, beta) {
  if (!depth || state.over) return evaluate(state, side);
  const maximizing = state.turn === side;
  let best = maximizing ? -Infinity : Infinity;
  const choices = legalMoves(state.board, state.turn).sort((a,b) => WEIGHTS[b] - WEIGHTS[a]);
  for (const index of choices) {
    const value = search(play(state, index), depth - 1, side, alpha, beta);
    best = maximizing ? Math.max(best, value) : Math.min(best, value);
    if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}
export function chooseMove(state, depth = 3) {
  const choices = legalMoves(state.board, state.turn);
  let best = null, value = -Infinity;
  for (const index of choices) {
    const candidate = search(play(state, index), depth - 1, state.turn, -Infinity, Infinity);
    if (candidate > value) { value = candidate; best = index; }
  }
  return best;
}
export function restoreGame(raw) {
  if (!raw || raw.version !== 1 || !['local','ai'].includes(raw.mode)) return null;
  // Replaying legal moves validates the entire save instead of trusting arbitrary board data.
  if (!Array.isArray(raw.history) || raw.history.length > 60) return null;
  let state = initialState();
  for (const index of raw.history) { state = play(state, index); if (!state) return null; }
  return { state, mode: raw.mode, history: raw.history.slice() };
}
