const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll('.screen')];
const russian = /^[А-ЯЁ]+$/i;
const dictionary = new Set((window.RUSSIAN_NOUNS || []).map((word) => word.toLocaleUpperCase('ru')));
const fiveLetterWords = [...dictionary].filter((word) => word.length === 5);
const dictionaryByLength = [...dictionary].filter((word) => word.length > 1).reduce((groups, word) => {
  (groups[word.length] ||= []).push(word);
  return groups;
}, {});
const initialState = () => ({ count: 2, vsComputer: false, difficulty: 'medium', players: [], board: Array(25).fill(''), words: new Set(), history: [], turn: 0, pending: null, path: [], lastMove: null, computerThinking: false });
let state = initialState();

function show(id) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNameFields() {
  const old = [...document.querySelectorAll('.field input')].map((input) => input.value);
  const fieldCount = state.vsComputer ? 1 : state.count;
  $('#name-fields').innerHTML = Array.from({ length: fieldCount }, (_, i) => `
    <label class="field"><span>${i + 1}</span><input maxlength="18" autocomplete="off" placeholder="Игрок ${i + 1}" value="${escapeHtml(old[i] || '')}" aria-label="Имя игрока ${i + 1}"></label>`).join('');
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

$('#player-count').addEventListener('click', (event) => {
  const button = event.target.closest('[data-count]');
  if (!button) return;
  state.count = Number(button.dataset.count);
  document.querySelectorAll('[data-count]').forEach((item) => item.classList.toggle('selected', item === button));
  renderNameFields();
});

$('#computer-mode').addEventListener('change', (event) => {
  state.vsComputer = event.target.checked;
  $('#player-count-fieldset').hidden = state.vsComputer;
  $('#difficulty-fieldset').hidden = !state.vsComputer;
  renderNameFields();
});

$('#difficulty').addEventListener('click', (event) => {
  const button = event.target.closest('[data-difficulty]');
  if (!button) return;
  state.difficulty = button.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item === button));
});

$('#to-word').addEventListener('click', () => {
  const names = [...document.querySelectorAll('.field input')].map((input, i) => input.value.trim() || `Игрок ${i + 1}`);
  const unique = new Set(names.map((name) => name.toLocaleLowerCase('ru')));
  if (unique.size !== names.length) { document.querySelector('.field input').focus(); return; }
  state.players = names.map((name) => ({ name, score: 0, words: [], computer: false }));
  if (state.vsComputer) state.players.push({ name: 'Компьютер', score: 0, words: [], computer: true });
  suggestInitialWord(); show('start-word'); setTimeout(() => $('#initial-word').focus(), 350);
});

document.querySelector('[data-back]').addEventListener('click', () => show('setup'));
$('#initial-word').addEventListener('input', (event) => {
  event.target.value = event.target.value.replace(/[^а-яё]/gi, '').toUpperCase().slice(0, 5);
  renderPreview(); $('#word-error').textContent = '';
});
function renderPreview() {
  const letters = $('#initial-word').value.padEnd(5, ' ').split('');
  $('#letter-preview').innerHTML = letters.map((letter) => `<span>${letter}</span>`).join('');
}

function suggestInitialWord() {
  const word = fiveLetterWords[Math.floor(Math.random() * fiveLetterWords.length)] || 'БАЛДА';
  $('#initial-word').value = word;
  $('#word-error').textContent = '';
  renderPreview();
}
$('#suggest-word').addEventListener('click', suggestInitialWord);

$('#start-game').addEventListener('click', () => {
  const word = $('#initial-word').value.toUpperCase();
  if (word.length !== 5 || !russian.test(word)) { $('#word-error').textContent = 'Нужно ровно 5 русских букв'; return; }
  state.board = Array(25).fill('');
  word.split('').forEach((letter, i) => state.board[10 + i] = letter);
  state.words = new Set([word]); state.history = []; state.turn = 0; state.pending = null; state.path = []; state.lastMove = null;
  state.players.forEach((player) => { player.score = 0; player.words = []; });
  renderGame(); show('game');
});

function neighbors(index) {
  const row = Math.floor(index / 5), col = index % 5;
  return [row > 0 && index - 5, row < 4 && index + 5, col > 0 && index - 1, col < 4 && index + 1].filter((v) => v !== false);
}
function canPlace(index) { return !state.board[index] && neighbors(index).some((n) => state.board[n]); }

function renderGame() {
  const player = state.players[state.turn];
  $('#turn-title').textContent = state.computerThinking ? 'Компьютер думает…' : player.name;
  $('#score-strip').innerHTML = state.players.map((p, i) => `<div class="score-pill ${i === state.turn ? 'active' : ''}"><small>${escapeHtml(p.name)}</small><strong>${p.score}</strong></div>`).join('');
  $('#board').innerHTML = state.board.map((letter, index) => {
    const isPending = state.pending?.index === index;
    const isLastNewLetter = !state.pending && state.lastMove?.index === index;
    const selected = state.path.includes(index) || (!state.pending && state.lastMove?.path.includes(index));
    const classes = ['cell', letter || isPending ? '' : 'empty', !state.pending && !state.lastMove && canPlace(index) ? 'available' : '', selected ? 'selected' : '', isPending || isLastNewLetter ? 'new' : ''].filter(Boolean).join(' ');
    if (isPending && !state.computerThinking) {
      return `<input class="${classes}" data-index="${index}" role="gridcell" aria-label="Новая буква" type="text" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="characters" value="${state.pending.letter}" placeholder="А">`;
    }
    const cellLetter = isPending ? state.pending.letter : letter;
    return `<button class="${classes}" data-index="${index}" role="gridcell" aria-label="${cellLetter || 'Пустая клетка'}" ${state.computerThinking ? 'disabled' : ''}>${cellLetter}</button>`;
  }).join('');
  updateTurnSummary();
  $('#step-copy').innerHTML = state.computerThinking ? '<span>⌛</span><p>Компьютер подбирает слово</p>' : state.pending || state.lastMove ? '<span>2</span><p>Введите букву в клетку и соберите слово</p>' : '<span>1</span><p>Выберите пустую клетку рядом с буквой</p>';
  $('#turn-panel').classList.toggle('computer-turn', state.computerThinking);
  $('#history-count').textContent = state.history.length;
}

function updateTurnSummary() {
  const word = state.lastMove?.word || state.path.map((index) => index === state.pending?.index ? state.pending.letter : state.board[index]).join('');
  $('#current-word').textContent = word || '—';
  $('#submit-word').disabled = !state.pending?.letter || state.path.length < 2 || !state.path.includes(state.pending.index);
}

function focusPendingCell() {
  const input = $('#board input.cell');
  if (input) input.focus();
}

$('#board').addEventListener('click', (event) => {
  if (state.computerThinking) return;
  const cell = event.target.closest('.cell'); if (!cell) return;
  const index = Number(cell.dataset.index); $('#turn-error').textContent = '';
  if (state.lastMove) {
    state.lastMove = null;
    renderGame();
  }
  if (!state.pending) {
    if (!canPlace(index)) { $('#turn-error').textContent = 'Выберите свободную клетку рядом с буквой'; return; }
    state.pending = { index, letter: '' }; state.path = []; renderGame(); focusPendingCell();
    return;
  }
  if (index !== state.pending.index && !state.board[index]) {
    if (!canPlace(index)) { $('#turn-error').textContent = 'Выберите свободную клетку рядом с буквой'; return; }
    state.pending = { index, letter: '' }; state.path = []; renderGame(); focusPendingCell();
    return;
  }
  if (!state.pending.letter) { focusPendingCell(); return; }
  const position = state.path.indexOf(index);
  if (position >= 0) {
    if (position === state.path.length - 1) state.path.pop(); else $('#turn-error').textContent = 'Можно убрать только последнюю букву';
  } else if (!state.path.length || neighbors(state.path.at(-1)).includes(index)) state.path.push(index);
  else $('#turn-error').textContent = 'Буквы слова должны соприкасаться сторонами';

  // Keep the live input mounted when its cell is selected. Re-rendering the
  // board here would replace the focused input and some mobile browsers then
  // apply the pending tap/input event to the replacement, clearing its value.
  if (index === state.pending.index) {
    cell.classList.toggle('selected', state.path.includes(index));
    updateTurnSummary();
    return;
  }
  renderGame();
});

$('#board').addEventListener('input', (event) => {
  if (state.computerThinking) return;
  if (!event.target.matches('input.cell') || !state.pending) return;
  const letter = event.target.value.replace(/[^а-яё]/gi, '').toUpperCase().slice(0, 1);
  event.target.value = letter; state.pending.letter = letter; state.path = [];
  event.target.setAttribute('aria-label', letter ? `Новая буква ${letter}` : 'Новая буква');
  $('#turn-error').textContent = letter ? '' : 'Введите одну русскую букву';
  updateTurnSummary();
});

$('#reset-turn').addEventListener('click', () => { if (state.computerThinking) return; state.pending = null; state.path = []; $('#turn-error').textContent = ''; renderGame(); });
function getCurrentWord() {
  return state.path.map((i) => i === state.pending.index ? state.pending.letter : state.board[i]).join('');
}

function recordCurrentWord(word) {
  $('#unknown-word-modal').hidden = true;
  const completedMove = { word, path: [...state.path], index: state.pending.index };
  state.board[state.pending.index] = state.pending.letter; state.words.add(word);
  const player = state.players[state.turn]; player.words.push(word); player.score += word.length;
  state.history.push({ name: player.name, word });
  state.pending = null; state.path = [];
  if (state.board.every(Boolean)) return finishGame();
  state.turn = (state.turn + 1) % state.players.length;
  // A computer turn starts immediately, so only keep a completed human move
  // on screen when another human is waiting. Computer moves remain visible.
  state.lastMove = state.players[state.turn].computer ? null : completedMove;
  renderGame();
  if (state.players[state.turn].computer) scheduleComputerTurn();
}

$('#submit-word').addEventListener('click', () => {
  if (state.computerThinking) return;
  const word = getCurrentWord();
  if (!state.path.includes(state.pending.index)) { $('#turn-error').textContent = 'Слово должно включать новую букву'; return; }
  if (state.words.has(word)) { $('#turn-error').textContent = 'Это слово уже было'; return; }
  if (!dictionary.has(word)) {
    $('#unknown-word-copy').textContent = `Слово «${word}» не найдено. Всё равно записать его?`;
    $('#unknown-word-modal').hidden = false;
    $('#continue-unknown-word').focus();
    return;
  }
  recordCurrentWord(word);
});

function findWordPath(word) {
  const search = (position, letterIndex, path, newCell) => {
    if (letterIndex === word.length) {
      return newCell === null ? null : { word, path, index: newCell, letter: word[path.indexOf(newCell)] };
    }
    const candidates = position === null ? state.board.map((_, index) => index) : neighbors(position);
    for (const index of candidates) {
      if (path.includes(index)) continue;
      const boardLetter = state.board[index];
      if (boardLetter && boardLetter !== word[letterIndex]) continue;
      if (!boardLetter && newCell !== null) continue;
      const result = search(index, letterIndex + 1, [...path, index], boardLetter ? newCell : index);
      if (result) return result;
    }
    return null;
  };
  return search(null, 0, [], null);
}

function shuffled(words) {
  const copy = [...words];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chooseComputerMove() {
  const lengths = Object.keys(dictionaryByLength).map(Number);
  let orderedLengths;
  if (state.difficulty === 'easy') orderedLengths = lengths.filter((length) => length <= 4).sort((a, b) => a - b);
  else if (state.difficulty === 'medium') orderedLengths = lengths.filter((length) => length <= 7).sort((a, b) => b - a);
  else orderedLengths = lengths.sort((a, b) => b - a);

  for (const length of orderedLengths) {
    const candidates = state.difficulty === 'hard' ? dictionaryByLength[length] : shuffled(dictionaryByLength[length]);
    for (const word of candidates) {
      if (state.words.has(word)) continue;
      const move = findWordPath(word);
      if (move) return move;
    }
  }
  return null;
}

function scheduleComputerTurn() {
  state.computerThinking = true;
  renderGame();
  setTimeout(() => {
    if (!state.computerThinking || !state.players[state.turn]?.computer) return;
    const move = chooseComputerMove();
    if (!move) {
      state.computerThinking = false;
      state.turn = (state.turn + 1) % state.players.length;
      renderGame();
      $('#turn-error').textContent = 'Компьютер пропускает ход: подходящего слова нет';
      return;
    }
    state.pending = { index: move.index, letter: move.letter };
    state.path = move.path;
    renderGame();
    setTimeout(() => {
      if (!state.computerThinking) return;
      state.computerThinking = false;
      recordCurrentWord(move.word);
    }, 650);
  }, 450);
}

$('#continue-unknown-word').addEventListener('click', () => recordCurrentWord(getCurrentWord()));
$('#cancel-unknown-word').addEventListener('click', () => {
  $('#unknown-word-modal').hidden = true;
  state.pending = null; state.path = [];
  $('#turn-error').textContent = '';
  renderGame();
});

function renderHistory() {
  const entries = state.history;
  $('#history-list').innerHTML = entries.length ? entries.map((e) => `<div class="history-row"><strong>${e.word}</strong><span>${escapeHtml(e.name)}</span><b>+${e.word.length}</b></div>`).join('') : '<p class="empty-history">Здесь появятся составленные слова</p>';
}
$('#show-history').addEventListener('click', () => { renderHistory(); $('#history-modal').hidden = false; $('#close-history').focus(); });
$('#close-history').addEventListener('click', () => { $('#history-modal').hidden = true; $('#show-history').focus(); });
$('#history-modal').addEventListener('click', (event) => { if (event.target === $('#history-modal')) $('#close-history').click(); });
$('#finish-game').addEventListener('click', () => $('#confirm').hidden = false);
$('#cancel-finish').addEventListener('click', () => $('#confirm').hidden = true);
$('#confirm-finish').addEventListener('click', () => { $('#confirm').hidden = true; finishGame(); });
function finishGame() {
  state.computerThinking = false;
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const leaders = sorted.filter((p) => p.score === sorted[0].score);
  $('#result-title').textContent = leaders.length === 1 ? leaders[0].name : 'Ничья!';
  $('#winner-copy').textContent = leaders.length === 1 ? `Победа со счётом ${leaders[0].score}` : `${leaders.map((p) => p.name).join(' и ')} набрали по ${leaders[0].score}`;
  $('#final-score').innerHTML = sorted.map((p, i) => `<div class="final-row ${i === 0 ? 'winner' : ''}"><span class="rank">${i + 1}</span><strong>${escapeHtml(p.name)}</strong><span>${p.words.length} сл.</span><b>${p.score}</b></div>`).join('');
  show('results');
}
$('#restart').addEventListener('click', () => { state = initialState(); $('#computer-mode').checked = false; $('#player-count-fieldset').hidden = false; $('#difficulty-fieldset').hidden = true; document.querySelectorAll('[data-count]').forEach((item) => item.classList.toggle('selected', item.dataset.count === '2')); document.querySelectorAll('[data-difficulty]').forEach((item) => item.classList.toggle('selected', item.dataset.difficulty === 'medium')); $('#initial-word').value = ''; renderPreview(); renderNameFields(); show('setup'); });

renderNameFields(); renderPreview();
