const $ = (selector) => document.querySelector(selector);
const screens = [...document.querySelectorAll('.screen')];
const russian = /^[А-ЯЁ]+$/i;
let state = { count: 2, players: [], board: Array(25).fill(''), words: new Set(), turn: 0, pending: null, path: [] };

function show(id) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNameFields() {
  const old = [...document.querySelectorAll('.field input')].map((input) => input.value);
  $('#name-fields').innerHTML = Array.from({ length: state.count }, (_, i) => `
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

$('#to-word').addEventListener('click', () => {
  const names = [...document.querySelectorAll('.field input')].map((input, i) => input.value.trim() || `Игрок ${i + 1}`);
  const unique = new Set(names.map((name) => name.toLocaleLowerCase('ru')));
  if (unique.size !== names.length) { document.querySelector('.field input').focus(); return; }
  state.players = names.map((name) => ({ name, score: 0, words: [] }));
  show('start-word'); setTimeout(() => $('#initial-word').focus(), 350);
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

$('#start-game').addEventListener('click', () => {
  const word = $('#initial-word').value.toUpperCase();
  if (word.length !== 5 || !russian.test(word)) { $('#word-error').textContent = 'Нужно ровно 5 русских букв'; return; }
  state.board = Array(25).fill('');
  word.split('').forEach((letter, i) => state.board[10 + i] = letter);
  state.words = new Set([word]); state.turn = 0; state.pending = null; state.path = [];
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
  $('#turn-title').textContent = player.name;
  $('#score-strip').innerHTML = state.players.map((p, i) => `<div class="score-pill ${i === state.turn ? 'active' : ''}"><small>${escapeHtml(p.name)}</small><strong>${p.score}</strong></div>`).join('');
  $('#board').innerHTML = state.board.map((letter, index) => {
    const isPending = state.pending?.index === index;
    const selected = state.path.includes(index);
    const classes = ['cell', letter || isPending ? '' : 'empty', !state.pending && canPlace(index) ? 'available' : '', selected ? 'selected' : '', isPending ? 'new' : ''].filter(Boolean).join(' ');
    if (isPending) {
      return `<input class="${classes}" data-index="${index}" role="gridcell" aria-label="Новая буква" type="text" maxlength="1" inputmode="text" autocomplete="off" autocapitalize="characters" value="${state.pending.letter}" placeholder="А">`;
    }
    return `<button class="${classes}" data-index="${index}" role="gridcell" aria-label="${letter || 'Пустая клетка'}">${letter}</button>`;
  }).join('');
  updateTurnSummary();
  $('#step-copy').innerHTML = state.pending ? '<span>2</span><p>Введите букву в клетку и соберите слово</p>' : '<span>1</span><p>Выберите пустую клетку рядом с буквой</p>';
  renderHistory();
}

function updateTurnSummary() {
  const word = state.path.map((index) => index === state.pending?.index ? state.pending.letter : state.board[index]).join('');
  $('#current-word').textContent = word || '—';
  $('#submit-word').disabled = !state.pending?.letter || state.path.length < 2 || !state.path.includes(state.pending.index);
}

function focusPendingCell() {
  const input = $('#board input.cell');
  if (input) input.focus();
}

$('#board').addEventListener('click', (event) => {
  const cell = event.target.closest('.cell'); if (!cell) return;
  const index = Number(cell.dataset.index); $('#turn-error').textContent = '';
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
  if (!event.target.matches('input.cell') || !state.pending) return;
  const letter = event.target.value.replace(/[^а-яё]/gi, '').toUpperCase().slice(0, 1);
  event.target.value = letter; state.pending.letter = letter; state.path = [];
  event.target.setAttribute('aria-label', letter ? `Новая буква ${letter}` : 'Новая буква');
  $('#turn-error').textContent = letter ? '' : 'Введите одну русскую букву';
  updateTurnSummary();
});

$('#reset-turn').addEventListener('click', () => { state.pending = null; state.path = []; $('#turn-error').textContent = ''; renderGame(); });
$('#submit-word').addEventListener('click', () => {
  const word = state.path.map((i) => i === state.pending.index ? state.pending.letter : state.board[i]).join('');
  if (!state.path.includes(state.pending.index)) { $('#turn-error').textContent = 'Слово должно включать новую букву'; return; }
  if (state.words.has(word)) { $('#turn-error').textContent = 'Это слово уже было'; return; }
  state.board[state.pending.index] = state.pending.letter; state.words.add(word);
  const player = state.players[state.turn]; player.words.push(word); player.score += word.length;
  state.pending = null; state.path = [];
  if (state.board.every(Boolean)) return finishGame();
  state.turn = (state.turn + 1) % state.players.length; renderGame();
});

function renderHistory() {
  const entries = state.players.flatMap((p) => p.words.map((word) => ({ name: p.name, word }))).reverse();
  $('#history-list').innerHTML = entries.length ? entries.map((e) => `<div class="history-row"><strong>${e.word}</strong><span>${escapeHtml(e.name)}</span><b>+${e.word.length}</b></div>`).join('') : '<p class="empty-history">Здесь появятся составленные слова</p>';
}
$('#finish-game').addEventListener('click', () => $('#confirm').hidden = false);
$('#cancel-finish').addEventListener('click', () => $('#confirm').hidden = true);
$('#confirm-finish').addEventListener('click', () => { $('#confirm').hidden = true; finishGame(); });
function finishGame() {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const leaders = sorted.filter((p) => p.score === sorted[0].score);
  $('#result-title').textContent = leaders.length === 1 ? leaders[0].name : 'Ничья!';
  $('#winner-copy').textContent = leaders.length === 1 ? `Победа со счётом ${leaders[0].score}` : `${leaders.map((p) => p.name).join(' и ')} набрали по ${leaders[0].score}`;
  $('#final-score').innerHTML = sorted.map((p, i) => `<div class="final-row ${i === 0 ? 'winner' : ''}"><span class="rank">${i + 1}</span><strong>${escapeHtml(p.name)}</strong><span>${p.words.length} сл.</span><b>${p.score}</b></div>`).join('');
  show('results');
}
$('#restart').addEventListener('click', () => { state = { count: 2, players: [], board: Array(25).fill(''), words: new Set(), turn: 0, pending: null, path: [] }; $('#initial-word').value = ''; renderPreview(); renderNameFields(); show('setup'); });

renderNameFields(); renderPreview();
