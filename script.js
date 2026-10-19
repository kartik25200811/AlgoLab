'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ================= Navigation, theme, progress ================= */
function go(id) {
  $$('section.page').forEach(s => s.hidden = s.id !== id);
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.p === id));
  $('#nav').classList.remove('open');
  const seen = new Set(store.get('visited', []));
  if (['sorting', 'searching', 'ds', 'practice'].includes(id)) seen.add(id);
  store.set('visited', [...seen]);
  updateProgress();
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-go]');
  if (t) { e.preventDefault(); go(t.dataset.p || t.dataset.go); }
});
$('#menu').onclick = () => $('#nav').classList.toggle('open');
$('#theme').onclick = () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  store.set('theme', light ? 'light' : 'dark');
};
document.documentElement.dataset.theme = store.get('theme', 'dark');
function updateProgress() {
  const n = store.get('visited', []).length, best = store.get('quizBest', null);
  $('#pv').textContent = n + ' / 4'; $('#pvbar').style.width = n * 25 + '%';
  $('#pq').textContent = best === null ? '–' : best + ' / ' + QUIZ.length;
  $('#pqbar').style.width = best === null ? '0%' : best / QUIZ.length * 100 + '%';
}
// hero bars
$('.hero-bars').innerHTML = Array.from({ length: 14 }, (_, i) =>
  `<i style="height:${30 + (i * 37) % 70}%;animation-delay:${i * 0.15}s"></i>`).join('');

/* ================= Generic step player =================
   One timer at a time: every control clears the pending timeout first,
   so animation loops can never stack. */
function makePlayer(render, speedEl, onState) {
  let steps = [], i = 0, t = null, on = false;
  const set = v => { on = v; onState(v); };
  const show = () => steps.length && render(steps[i], i, steps.length);
  const tick = () => {
    if (!on) return;
    if (i >= steps.length - 1) { set(false); return; }
    i++; show(); t = setTimeout(tick, 1100 - speedEl.value * 100);
  };
  return {
    load(s) { clearTimeout(t); set(false); steps = s; i = 0; show(); },
    toggle() {
      if (!steps.length) return;
      clearTimeout(t);
      if (on) { set(false); return; }
      if (i >= steps.length - 1) { i = 0; show(); }
      set(true); t = setTimeout(tick, 250);
    },
    next() { clearTimeout(t); set(false); if (i < steps.length - 1) { i++; show(); } },
    prev() { clearTimeout(t); set(false); if (i > 0) { i--; show(); } },
    reset() { clearTimeout(t); set(false); i = 0; show(); }
  };
}

/* ================= Sorting: algorithm logic (no DOM) =================
   Each algorithm sorts a copy and records a snapshot per step. */
function sortSteps(name, input, desc) {
  const a = [...input], n = a.length, steps = [], sorted = new Set();
  let c = 0, s = 0;
  const snap = (cmp = [], swp = [], text = '') =>
    steps.push({ a: [...a], cmp, swp, sorted: [...sorted], text, c, s });
  const before = (x, y) => desc ? x > y : x < y;  // x should come before y
  const compare = (i, j) => { c++; snap([i, j], [], `Compare ${a[i]} (index ${i}) with ${a[j]} (index ${j}).`); };
  const swap = (i, j) => { [a[i], a[j]] = [a[j], a[i]]; s++; snap([], [i, j], `Swap: ${a[j]} and ${a[i]} trade places.`); };
  snap([], [], 'Initial array. Press Play or Next to begin.');

  if (name === 'bubble') {
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) { compare(j, j + 1); if (before(a[j + 1], a[j])) swap(j, j + 1); }
      sorted.add(n - 1 - i);
    }
  } else if (name === 'selection') {
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) { compare(j, m); if (before(a[j], a[m])) m = j; }
      if (m !== i) swap(i, m);
      sorted.add(i);
    }
  } else if (name === 'insertion') {
    for (let i = 1; i < n; i++) {
      for (let j = i; j > 0; j--) {
        compare(j - 1, j);
        if (before(a[j], a[j - 1])) swap(j, j - 1); else break;
      }
    }
  } else if (name === 'merge') {
    const ms = (l, r) => {
      if (l >= r) return;
      const m = (l + r) >> 1; ms(l, m); ms(m + 1, r);
      const L = a.slice(l, m + 1), R = a.slice(m + 1, r + 1);
      let i = 0, j = 0, k = l;
      while (i < L.length && j < R.length) {
        c++; snap([l + i, m + 1 + j], [], `Merging: compare ${L[i]} (left half) with ${R[j]} (right half).`);
        a[k] = before(R[j], L[i]) ? R[j++] : L[i++]; s++;
        snap([], [k], `Place ${a[k]} at index ${k}.`); k++;
      }
      while (i < L.length) { a[k] = L[i++]; s++; snap([], [k], `Copy leftover ${a[k]} to index ${k}.`); k++; }
      while (j < R.length) { a[k] = R[j++]; s++; snap([], [k], `Copy leftover ${a[k]} to index ${k}.`); k++; }
    };
    ms(0, n - 1);
  } else if (name === 'quick') {
    const qs = (l, r) => {
      if (l > r) return;
      if (l === r) { sorted.add(l); return; }
      const pivot = a[r]; let i = l;
      snap([], [], `Choose pivot ${pivot} (last element of this range).`);
      for (let j = l; j < r; j++) { compare(j, r); if (before(a[j], pivot)) { if (i !== j) swap(i, j); i++; } }
      if (i !== r) swap(i, r);
      sorted.add(i);
      snap([], [], `Pivot ${a[i]} is now in its final position (index ${i}).`);
      qs(l, i - 1); qs(i + 1, r);
    };
    qs(0, n - 1);
  } else if (name === 'heap') {
    // asc uses a max-heap, desc a min-heap (via `before`)
    const heapify = (size, i) => {
      let top = i; const l = 2 * i + 1, r = l + 1;
      if (l < size) { compare(l, top); if (before(a[top], a[l])) top = l; }
      if (r < size) { compare(r, top); if (before(a[top], a[r])) top = r; }
      if (top !== i) { swap(i, top); heapify(size, top); }
    };
    for (let i = (n >> 1) - 1; i >= 0; i--) heapify(n, i);
    snap([], [], 'Heap built: the root holds the extreme value.');
    for (let i = n - 1; i > 0; i--) { swap(0, i); sorted.add(i); heapify(i, 0); }
    sorted.add(0);
  } else if (name === 'counting') {
    const mn = Math.min(...a), mx = Math.max(...a), cnt = new Array(mx - mn + 1).fill(0);
    for (let i = 0; i < n; i++) { cnt[a[i] - mn]++; c++; snap([i], [], `Count value ${a[i]}.`); }
    const order = [...cnt.keys()]; if (desc) order.reverse();
    let k = 0;
    for (const v of order) while (cnt[v]-- > 0) { a[k] = v + mn; s++; snap([], [k], `Write ${a[k]} at index ${k}.`); sorted.add(k); k++; }
  }
  for (let i = 0; i < n; i++) sorted.add(i);
  snap([], [], 'Done! The array is sorted.');
  return steps;
}

const CX = {
  bubble: ['Bubble Sort', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'Repeatedly swaps adjacent out-of-order pairs; the largest value "bubbles" to the end each pass.'],
  selection: ['Selection Sort', 'O(n²)', 'O(n²)', 'O(n²)', 'O(1)', 'Finds the smallest remaining value and places it at the front.'],
  insertion: ['Insertion Sort', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'Grows a sorted prefix by sliding each new value left into place, like sorting playing cards.'],
  merge: ['Merge Sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)', 'Splits the array in half, sorts each half, then merges them.'],
  quick: ['Quick Sort', 'O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)', 'Picks a pivot, moves smaller values before it, then recurses on both sides.'],
  heap: ['Heap Sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(1)', 'Builds a heap, then repeatedly moves the root to the end.'],
  counting: ['Counting Sort', 'O(n + k)', 'O(n + k)', 'O(n + k)', 'O(k)', 'Counts how often each value appears, then rewrites the array in order (k = value range).']
};
const cxTable = (r, extra = '') =>
  `<tr><th>Best</th><th>Average</th><th>Worst</th><th>Space</th></tr><tr><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>${extra}`;

/* ================= Sorting: UI ================= */
let sortInput = [];
const sortPlayer = makePlayer((st, i, n) => {
  const max = Math.max(...st.a, 1);
  $('#s-bars').classList.toggle('many', st.a.length > 20);
  $('#s-bars').innerHTML = st.a.map((v, k) => {
    const cls = st.swp.includes(k) ? 'swp' : st.cmp.includes(k) ? 'cmp' : st.sorted.includes(k) ? 'sorted' : '';
    return `<div class="bar ${cls}" style="height:${v / max * 92}%"><span>${v}</span></div>`;
  }).join('');
  $('#s-text').textContent = st.text;
  $('#s-stats').textContent = `Step ${i + 1} of ${n} · Comparisons: ${st.c} · Swaps/writes: ${st.s}`;
}, $('#s-speed'), on => $('#s-play').textContent = on ? '⏸ Pause' : '▶ Play');

function loadSort() {
  const k = $('#s-algo').value, r = CX[k];
  $('#s-name').textContent = r[0]; $('#s-desc').textContent = r[5]; $('#s-cx').innerHTML = cxTable(r); $('#s-pseudo').textContent = PSEUDO[k];
  sortPlayer.load(sortSteps(k, sortInput, $('#s-order').value === 'desc'));
}
function randomArray() {
  sortInput = Array.from({ length: +$('#s-size').value }, () => 5 + Math.floor(Math.random() * 95));
  loadSort();
}
$('#s-rand').onclick = randomArray;
$('#s-size').oninput = randomArray;
$('#s-algo').onchange = $('#s-order').onchange = loadSort;
$('#s-apply').onclick = () => {
  const nums = $('#s-custom').value.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!nums.length || nums.length > 60 || nums.some(x => !Number.isInteger(x) || x < 1 || x > 999)) {
    $('#s-text').textContent = 'Please enter 1–60 whole numbers between 1 and 999, separated by commas.'; return;
  }
  sortInput = nums; loadSort();
};
$('#s-play').onclick = () => sortPlayer.toggle();
$('#s-next').onclick = () => sortPlayer.next();
$('#s-prev').onclick = () => sortPlayer.prev();
$('#s-reset').onclick = () => sortPlayer.reset();

/* ================= Searching ================= */
function searchSteps(kind, input, target) {
  let a = [...input], c = 0; const steps = [];
  const add = (cur, lo, hi, text, found = false) => steps.push({ a: [...a], cur, lo, hi, text, found, c });
  add(-1, 0, a.length - 1, `Looking for ${target} using ${kind} search.`);
  if (kind === 'binary' && a.some((v, i) => i && a[i - 1] > v)) {
    a.sort((x, y) => x - y);
    add(-1, 0, a.length - 1, 'Binary search requires a sorted array, so the array was sorted first.');
  }
  if (kind === 'linear') {
    for (let i = 0; i < a.length; i++) {
      c++;
      if (a[i] === target) { add(i, 0, a.length - 1, `Index ${i}: ${a[i]} equals ${target}. Found!`, true); return steps; }
      add(i, 0, a.length - 1, `Index ${i}: ${a[i]} is not ${target}. Move on.`);
    }
  } else {
    let lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; c++;
      if (a[mid] === target) { add(mid, lo, hi, `Middle index ${mid} holds ${a[mid]}. Found!`, true); return steps; }
      if (a[mid] < target) { add(mid, lo, hi, `${a[mid]} < ${target}: discard the left half (indices ${lo}–${mid}).`); lo = mid + 1; }
      else { add(mid, lo, hi, `${a[mid]} > ${target}: discard the right half (indices ${mid}–${hi}).`); hi = mid - 1; }
    }
    add(-1, 1, 0, 'Search range is empty.');
  }
  add(-1, 0, -1, `${target} is not in the array.`);
  return steps;
}
const searchPlayer = makePlayer((st, i, n) => {
  $('#q-cells').innerHTML = st.a.map((v, k) => {
    const cls = st.found && k === st.cur ? 'sorted' : k === st.cur ? 'cmp' : (k < st.lo || k > st.hi) && st.cur !== -1 || st.hi < st.lo ? 'elim' : '';
    return `<div class="cell ${cls}">${v}<small>[${k}]</small></div>`;
  }).join('');
  $('#q-text').textContent = st.text;
  $('#q-stats').textContent = `Step ${i + 1} of ${n} · Comparisons: ${st.c} · Current index: ${st.cur < 0 ? '–' : st.cur}`;
}, $('#q-speed'), on => $('#q-play').textContent = on ? '⏸ Pause' : '▶ Play');
function loadSearch() {
  const nums = $('#q-arr').value.split(/[\s,]+/).filter(Boolean).map(Number), t = Number($('#q-target').value);
  if (!nums.length || nums.length > 30 || nums.some(isNaN) || $('#q-target').value === '') {
    $('#q-text').textContent = 'Enter up to 30 numbers and a target value.'; return;
  }
  const k = $('#q-algo').value;
  $('#q-cx').innerHTML = k === 'linear'
    ? cxTable(['', 'O(1)', 'O(n)', 'O(n)', 'O(1)']) : cxTable(['', 'O(1)', 'O(log n)', 'O(log n)', 'O(1)']);
  $('#q-pseudo').textContent = PSEUDO[k];
  searchPlayer.load(searchSteps(k, nums, t));
}
$('#q-start').onclick = loadSearch;
$('#q-algo').onchange = loadSearch;
$('#q-play').onclick = () => searchPlayer.toggle();
$('#q-next').onclick = () => searchPlayer.next();
$('#q-reset').onclick = () => searchPlayer.reset();

/* ================= Data structures: tabs ================= */
$$('.tabs button').forEach(b => b.onclick = () => {
  const sec = b.closest('section');
  sec.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  sec.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== b.dataset.t);
});

/* ================= Linked list ================= */
let ll = [10, 20, 30], llBusy = false;
const llType = () => $('#ll-type').value;
const llSay = t => $('#ll-text').textContent = t;
function renderLL(hi = -1, mode = '') {
  const type = llType();
  if (!ll.length) { $('#ll').innerHTML = '<span class="muted">List is empty (head = null)</span>'; return; }
  $('#ll').innerHTML = ll.map((v, i) =>
    `<div class="node ${i === hi ? mode : ''}">${i === 0 ? '<em>head</em>' : ''}${i === ll.length - 1 ? '<em class="tail">tail</em>' : ''}
     <div class="box">${type === 'doubly' ? '<i>prev</i>' : ''}<b>${v}</b><i>next</i></div></div>` +
    (i < ll.length - 1 ? `<span class="arrow">${type === 'doubly' ? '⇄' : '→'}</span>` : '')).join('') +
    `<span class="arrow">${type === 'circular' ? '↩ back to head' : '→ null'}</span>`;
}
async function llOp(op) {
  if (llBusy) return;
  const raw = $('#ll-val').value, v = Number(raw), pos = Number($('#ll-pos').value);
  const needVal = ['insHead', 'insTail', 'insAt', 'search'].includes(op);
  const needPos = ['insAt', 'delAt'].includes(op);
  if (needVal && raw === '') return llSay('Please enter a value first.');
  if (needPos && (!Number.isInteger(pos) || $('#ll-pos').value === '')) return llSay('Please enter a whole-number position.');
  if (op.startsWith('del') && !ll.length) return llSay('Underflow: the list is empty, nothing to delete.');
  if (op === 'insAt' && (pos < 0 || pos > ll.length)) return llSay(`Position must be between 0 and ${ll.length}.`);
  if (op === 'delAt' && (pos < 0 || pos >= ll.length)) return llSay(`Position must be between 0 and ${ll.length - 1}.`);
  llBusy = true;
  try {
    if (op === 'insHead') { ll.unshift(v); renderLL(0, 'new'); llSay(`New node ${v} points to the old head, then head moves to it. O(1).`); }
    else if (op === 'insTail') { ll.push(v); renderLL(ll.length - 1, 'new'); llSay(`The old tail's next now points to ${v}. With a tail pointer this is O(1); without one you must traverse, O(n).`); }
    else if (op === 'insAt') { ll.splice(pos, 0, v); renderLL(pos, 'new'); llSay(`Walked to position ${pos - 1}, then relinked pointers to insert ${v}. O(n).`); }
    else if (op === 'search' || op === 'traverse') {
      for (let i = 0; i < ll.length; i++) {
        renderLL(i, 'cur'); llSay(op === 'search' ? `Visiting node ${i}: is ${ll[i]} equal to ${v}?` : `Visiting node ${i} (value ${ll[i]}).`);
        await sleep(650);
        if (op === 'search' && ll[i] === v) { renderLL(i, 'hit'); llSay(`Found ${v} at position ${i}. O(n) worst case.`); return; }
      }
      renderLL(); llSay(op === 'search' ? `${v} is not in the list.` : 'Traversal finished. O(n).');
    } else {
      const i = op === 'delHead' ? 0 : op === 'delTail' ? ll.length - 1 : pos;
      renderLL(i, 'del'); llSay(`Unlinking node ${ll[i]} and bypassing it with neighbour pointers.`);
      await sleep(650); const gone = ll.splice(i, 1)[0]; renderLL();
      llSay(`Deleted ${gone}. Head/delete-at-head is O(1); tail and position need traversal, O(n).`);
    }
  } finally { llBusy = false; }
}
$$('[data-ll]').forEach(b => b.onclick = () => llOp(b.dataset.ll));
$('#ll-type').onchange = () => { renderLL(); llSay(`${llType()} list selected.`); };
renderLL();

/* ================= Stack (array based, capacity 8) ================= */
const CAP = 8; let stack = [], stBusy = false;
const stSay = t => $('#st-text').textContent = t;
function renderStack(anim = '') {
  $('#st').innerHTML = stack.map((v, i) =>
    `<div class="item ${i === stack.length - 1 ? anim : ''}">${v}${i === stack.length - 1 ? '<span class="tag">← TOP</span>' : ''}</div>`).join('') ||
    '<span class="muted">Empty (top = -1)</span>';
}
$('#st-push').onclick = () => {
  const raw = $('#st-val').value;
  if (raw === '') return stSay('Enter a value to push.');
  if (stack.length >= CAP) return stSay('Overflow: the stack is full (8 items).');
  stack.push(Number(raw)); renderStack('enter'); stSay(`Pushed ${raw}. TOP is now index ${stack.length - 1}. Size: ${stack.length}.`);
};
$('#st-pop').onclick = async () => {
  if (stBusy) return;
  if (!stack.length) return stSay('Underflow: the stack is empty.');
  stBusy = true; renderStack('leave'); await sleep(380);
  const v = stack.pop(); renderStack(); stBusy = false;
  stSay(`Popped ${v}: the most recently added item leaves first (LIFO). Size: ${stack.length}.`);
};
$('#st-peek').onclick = () => stSay(stack.length ? `Peek: TOP is ${stack[stack.length - 1]} (not removed).` : 'Nothing to peek: the stack is empty.');
$('#st-clear').onclick = () => { stack = []; renderStack(); stSay('Stack cleared.'); };
renderStack();

/* ================= Queue (array based, capacity 8) ================= */
let queue = [], quBusy = false;
const quSay = t => $('#qu-text').textContent = t;
function renderQueue(anim = '', at = -1) {
  $('#qu').innerHTML = queue.map((v, i) =>
    `<div class="qitem ${i === at ? anim : ''}"><span class="tag">${[i === 0 ? 'FRONT' : '', i === queue.length - 1 ? 'REAR' : ''].filter(Boolean).join(' / ')}</span>${v}</div>`).join('') ||
    '<span class="muted">Empty (front = rear = -1)</span>';
}
$('#qu-enq').onclick = () => {
  const raw = $('#qu-val').value;
  if (raw === '') return quSay('Enter a value to enqueue.');
  if (queue.length >= CAP) return quSay('Overflow: the queue is full (8 items).');
  queue.push(Number(raw)); renderQueue('enter', queue.length - 1); quSay(`Enqueued ${raw} at the rear. Size: ${queue.length}.`);
};
$('#qu-deq').onclick = async () => {
  if (quBusy) return;
  if (!queue.length) return quSay('Underflow: the queue is empty.');
  quBusy = true; renderQueue('leave', 0); await sleep(380);
  const v = queue.shift(); renderQueue(); quBusy = false;
  quSay(`Dequeued ${v} from the front: first in, first out (FIFO). Size: ${queue.length}.`);
};
$('#qu-front').onclick = () => quSay(queue.length ? `Front is ${queue[0]}.` : 'The queue is empty.');
$('#qu-rear').onclick = () => quSay(queue.length ? `Rear is ${queue[queue.length - 1]}.` : 'The queue is empty.');
$('#qu-clear').onclick = () => { queue = []; renderQueue(); quSay('Queue cleared.'); };
renderQueue();

/* ================= Learn: complexity reference ================= */
$('#ref').innerHTML = '<tr><th>Algorithm</th><th>Best</th><th>Average</th><th>Worst</th><th>Space</th></tr>' +
  Object.values(CX).map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('') +
  '<tr><td>Linear Search</td><td>O(1)</td><td>O(n)</td><td>O(n)</td><td>O(1)</td></tr><tr><td>Binary Search</td><td>O(1)</td><td>O(log n)</td><td>O(log n)</td><td>O(1)</td></tr>';

/* ================= Quiz challenge ================= */
const QUIZ = [
  { q: 'Which structure follows LIFO?', o: ['Queue', 'Stack', 'Array', 'Heap'], a: 1, e: 'A stack removes the most recently added item first.' },
  { q: 'Worst-case time of Bubble Sort?', o: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], a: 2, e: 'Two nested loops over n items give O(n²).' },
  { q: 'Binary search requires the array to be…', o: ['Unique', 'Sorted', 'Even length', 'Positive'], a: 1, e: 'It discards half the range by comparing with the middle, which only works on sorted data.' },
  { q: 'Which sort splits the array in halves and merges them?', o: ['Quick Sort', 'Heap Sort', 'Merge Sort', 'Selection Sort'], a: 2, e: 'Merge sort divides, sorts each half, then merges.' },
  { q: 'In a queue, items are removed from the…', o: ['Rear', 'Front', 'Middle', 'Top'], a: 1, e: 'FIFO: the oldest item sits at the front.' },
  { q: 'Inserting at the head of a linked list costs…', o: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], a: 0, e: 'Only the new node and the head pointer change.' },
  { q: 'Which sort is built on a heap?', o: ['Heap Sort', 'Counting Sort', 'Insertion Sort', 'Bubble Sort'], a: 0, e: 'Heap sort repeatedly extracts the root of a heap.' },
  { q: 'Quick Sort worst case happens when…', o: ['Array is random', 'Pivot is always the min or max', 'Array is tiny', 'Values repeat once'], a: 1, e: 'Unbalanced partitions make the recursion depth n, giving O(n²).' }
];
let qi = 0, score = 0, answered = false;
function renderQuiz() {
  const box = $('#quiz');
  if (qi >= QUIZ.length) {
    const best = Math.max(score, store.get('quizBest', 0)); store.set('quizBest', best); updateProgress();
    box.innerHTML = `<h3>Finished! Score: ${score} / ${QUIZ.length}</h3><p class="muted">Best: ${best} / ${QUIZ.length}</p><button class="btn primary" id="qz-again">Try again</button>`;
    $('#qz-again').onclick = () => { qi = 0; score = 0; renderQuiz(); }; return;
  }
  const q = QUIZ[qi]; answered = false;
  box.innerHTML = `<div class="meter"><i style="width:${qi / QUIZ.length * 100}%"></i></div><p class="muted">Question ${qi + 1} of ${QUIZ.length} · Score ${score}</p><h3>${q.q}</h3>` +
    q.o.map((t, i) => `<button class="opt" data-i="${i}">${t}</button>`).join('') + '<p id="qz-fb" class="say"></p><button class="btn primary" id="qz-next" hidden>Next</button>';
  $$('.opt').forEach(b => b.onclick = () => {
    if (answered) return; answered = true;
    const pick = +b.dataset.i; if (pick === q.a) score++;
    $$('.opt').forEach((x, i) => x.classList.add(i === q.a ? 'right' : i === pick ? 'wrong' : 'x'));
    $('#qz-fb').textContent = (pick === q.a ? 'Correct! ' : 'Not quite. ') + q.e;
    $('#qz-next').hidden = false;
  });
  $('#qz-next').onclick = () => { qi++; renderQuiz(); };
}
renderQuiz();

/* ================= AI assistant: DEMO MODE (predefined answers only) ================= */
const DEMO = [
  [/bubble/, 'Bubble sort compares neighbouring items and swaps them if they are out of order. After each pass the largest remaining value sits at the end. Worst case O(n²).'],
  [/binary/, 'Binary search checks the middle of a sorted array and throws away the half that cannot contain the target. That is O(log n).'],
  [/stack|queue|lifo|fifo/, 'A stack is LIFO (last in, first out), like a pile of plates. A queue is FIFO (first in, first out), like a line at a counter.'],
  [/linked/, 'A linked list stores nodes that each point to the next one. Inserting at the head is O(1), but reaching position k needs O(k) steps.'],
  [/merge|quick|compare/, 'Merge sort is always O(n log n) but needs O(n) extra space. Quick sort is usually faster in practice and in-place, but its worst case is O(n²).'],
  [/practice|question/, 'Practice: 1) Sort [4, 2, 7, 1] with insertion sort by hand. 2) How many comparisons does binary search need for 1000 items? (about 10)'],
  [/big.?o|complexity/, 'Big-O describes how running time grows as input size n grows. O(1) is constant, O(log n) grows slowly, O(n²) explodes quickly.']
];
const SUGG = ['Explain bubble sort', 'Binary search vs linear', 'Stack vs queue', 'Give me practice questions'];
function chatAdd(text, who) {
  const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text;
  $('#chat').appendChild(d); $('#chat').scrollTop = 1e9; return d;
}
async function chatSend(text) {
  text = (text ?? $('#chat-in').value).trim(); if (!text) return;
  $('#chat-in').value = ''; chatAdd(text, 'me');
  const wait = chatAdd('Thinking…', 'bot'); await sleep(600);
  const hit = DEMO.find(([re]) => re.test(text.toLowerCase()));
  wait.textContent = hit ? hit[1] : 'Demo mode: I only know a few topics (sorting, searching, stack/queue, linked lists, Big-O). Try one of the suggestions.';
}
chatAdd('Hi! I am the AlgoLab demo assistant. Answers are predefined; no real AI is connected.', 'bot');
$('#sugg').innerHTML = SUGG.map(s => `<button>${s}</button>`).join('');
$$('#sugg button').forEach(b => b.onclick = () => chatSend(b.textContent));
$('#chat-send').onclick = () => chatSend();
$('#chat-in').onkeydown = e => { if (e.key === 'Enter') chatSend(); };

/* ================= Pseudocode ================= */
const PSEUDO = {
  bubble: `BubbleSort(A, n)
  for i = 0 to n-2
    for j = 0 to n-i-2
      if A[j] > A[j+1]
        swap(A[j], A[j+1])`,
  selection: `SelectionSort(A, n)
  for i = 0 to n-2
    min = i
    for j = i+1 to n-1
      if A[j] < A[min]: min = j
    swap(A[i], A[min])`,
  insertion: `InsertionSort(A, n)
  for i = 1 to n-1
    key = A[i]; j = i-1
    while j >= 0 and A[j] > key
      A[j+1] = A[j]; j = j-1
    A[j+1] = key`,
  merge: `MergeSort(A, l, r)
  if l >= r: return
  m = (l + r) / 2
  MergeSort(A, l, m)
  MergeSort(A, m+1, r)
  Merge(A, l, m, r)

Merge(A, l, m, r)
  L = A[l..m]; R = A[m+1..r]; i = j = 0; k = l
  while i < |L| and j < |R|
    if L[i] <= R[j]: A[k++] = L[i++]
    else:            A[k++] = R[j++]
  copy leftovers of L, then R, into A`,
  quick: `QuickSort(A, l, r)
  if l < r
    p = Partition(A, l, r)
    QuickSort(A, l, p-1)
    QuickSort(A, p+1, r)

Partition(A, l, r)
  pivot = A[r]; i = l
  for j = l to r-1
    if A[j] < pivot
      swap(A[i], A[j]); i = i+1
  swap(A[i], A[r])
  return i`,
  heap: `HeapSort(A, n)
  for i = n/2-1 down to 0: Heapify(A, n, i)
  for i = n-1 down to 1
    swap(A[0], A[i])
    Heapify(A, i, 0)

Heapify(A, size, i)
  largest = i; l = 2i+1; r = 2i+2
  if l < size and A[l] > A[largest]: largest = l
  if r < size and A[r] > A[largest]: largest = r
  if largest != i
    swap(A[i], A[largest])
    Heapify(A, size, largest)`,
  counting: `CountingSort(A, n)
  min = minimum of A; max = maximum of A
  count[0..max-min] = 0
  for each x in A: count[x-min]++
  k = 0
  for v = 0 to max-min
    while count[v] > 0
      A[k++] = v + min; count[v]--`,
  linear: `LinearSearch(A, n, target)
  for i = 0 to n-1
    if A[i] == target: return i
  return -1   // not found`,
  binary: `BinarySearch(A, n, target)   // A must be sorted
  lo = 0; hi = n-1
  while lo <= hi
    mid = (lo + hi) / 2
    if A[mid] == target: return mid
    if A[mid] < target:  lo = mid + 1
    else:                hi = mid - 1
  return -1   // not found`,
  ll: `InsertHead(v):  node = new Node(v); node.next = head
                if singly/circular-tail: update links; head = node
                (doubly: head.prev = node)
InsertTail(v):  walk to last node (or use tail); last.next = new Node(v)
                (circular: new.next = head; doubly: new.prev = last)
InsertAt(p, v): walk to node p-1; new.next = prev.next; prev.next = new
                (doubly: also fix prev pointers)
DeleteHead():   head = head.next            (circular: update tail.next)
DeleteTail():   walk to node before tail; its next = null (or head)
DeleteAt(p):    walk to node p-1; prev.next = prev.next.next
Search(v):      cur = head; while cur != null: if cur.value == v return cur; cur = cur.next
Traverse():     cur = head; while cur != null: visit(cur); cur = cur.next
                (circular: stop when cur returns to head)`,
  st: `Push(x):  if top == MAX-1: error "Overflow"
          top = top + 1; S[top] = x
Pop():    if top == -1: error "Underflow"
          x = S[top]; top = top - 1; return x
Peek():   if top == -1: error "Empty"; return S[top]
Clear():  top = -1`,
  qu: `Enqueue(x): if rear == MAX-1: error "Overflow"
            if front == -1: front = 0
            rear = rear + 1; Q[rear] = x
Dequeue():  if front == -1: error "Underflow"
            x = Q[front]
            if front == rear: front = rear = -1
            else front = front + 1
            return x
Front():    return Q[front]
Rear():     return Q[rear]`
};
$('#ll-pseudo').textContent = PSEUDO.ll;
$('#st-pseudo').textContent = PSEUDO.st;
$('#qu-pseudo').textContent = PSEUDO.qu;
{ const names = { ...Object.fromEntries(Object.entries(CX).map(([k, v]) => [k, v[0]])), linear: 'Linear Search', binary: 'Binary Search', ll: 'Linked List (all operations)', st: 'Stack', qu: 'Queue' };
  $('#all-pseudo').innerHTML = Object.keys(PSEUDO).map(k => `<h4>${names[k]}</h4><pre></pre>`).join('');
  $$('#all-pseudo pre').forEach((p, i) => p.textContent = PSEUDO[Object.keys(PSEUDO)[i]]); }

/* ================= Trees (Binary Tree + BST) ================= */
const TREE_PSEUDO = `Inorder(n):   if n == null return
              Inorder(n.left); visit(n); Inorder(n.right)
Preorder(n):  if n == null return
              visit(n); Preorder(n.left); Preorder(n.right)
Postorder(n): if n == null return
              Postorder(n.left); Postorder(n.right); visit(n)
LevelOrder(root): queue = [root]
  while queue not empty
    n = dequeue(queue); visit(n)
    enqueue n.left and n.right if they exist

BST_Insert(n, v)
  if n == null: return new Node(v)
  if v < n.value: n.left  = BST_Insert(n.left, v)
  else if v > n.value: n.right = BST_Insert(n.right, v)
  return n

BST_Search(n, v)
  while n != null
    if v == n.value: return n
    n = (v < n.value) ? n.left : n.right
  return null

BST_Delete(n, v)   // find the node first, then:
  0 children: remove it
  1 child:    replace it with that child
  2 children: copy the inorder successor (smallest value in the
              right subtree) into n, then delete that successor

BinaryTree_Insert(v):  put v in the first empty slot in level order
BinaryTree_Delete(v):  copy the last node's value over v, remove the last node`;
const GRAPH_PSEUDO = `BFS(graph, start)
  visited = {start}; queue = [start]
  while queue not empty
    u = dequeue(queue)
    for each neighbour v of u
      if v not in visited
        add v to visited; enqueue(v)

DFS(graph, u)
  mark u visited
  for each neighbour v of u
    if v not visited
      DFS(graph, v)       // go deeper, then backtrack`;
$('#t-pseudo').textContent = TREE_PSEUDO;
$('#g-pseudo').textContent = GRAPH_PSEUDO;
[['Binary Tree & BST', TREE_PSEUDO], ['Graph: BFS & DFS', GRAPH_PSEUDO]].forEach(([t, p]) => {
  $('#all-pseudo').insertAdjacentHTML('beforeend', `<h4>${t}</h4><pre></pre>`);
  $$('#all-pseudo pre').pop().textContent = p;
});
DEMO.unshift(
  [/tree|bst/, 'A binary search tree keeps smaller values in the left subtree and larger values in the right. Search, insert and delete are O(log n) on average, O(n) if the tree becomes a chain. Inorder traversal of a BST gives sorted order.'],
  [/bfs|dfs|graph|breadth|depth/, 'BFS uses a queue and explores level by level. DFS uses a stack (or recursion) and goes deep before backtracking. Both are O(V + E).']);

let bst = null, btArr = [], uid = 0, tBusy = false;
const tSay = t => $('#t-say').textContent = t;
const isBST = () => $('#t-mode').value === 'bst';
function treeRoot() {
  if (isBST()) return bst;
  const mk = i => i < btArr.length ? { id: i, v: btArr[i], l: mk(2 * i + 1), r: mk(2 * i + 2) } : null;
  return mk(0);
}
const bstHas = (n, v) => { while (n) { if (v === n.v) return true; n = v < n.v ? n.l : n.r; } return false; };
function bstInsert(n, v) {
  if (!n) return { id: uid++, v, l: null, r: null };
  if (v < n.v) n.l = bstInsert(n.l, v); else if (v > n.v) n.r = bstInsert(n.r, v);
  return n;
}
function bstDelete(n, v) {
  if (!n) return null;
  if (v < n.v) n.l = bstDelete(n.l, v);
  else if (v > n.v) n.r = bstDelete(n.r, v);
  else {
    if (!n.l) return n.r; if (!n.r) return n.l;
    let m = n.r; while (m.l) m = m.l;
    n.v = m.v; n.r = bstDelete(n.r, m.v);
  }
  return n;
}
const treeSize = () => isBST() ? (function c(n) { return n ? 1 + c(n.l) + c(n.r) : 0; })(bst) : btArr.length;
function renderTree(vis = new Set(), cur = -1, hit = -1) {
  const root = treeRoot(), svg = $('#t-svg');
  if (!root) { svg.setAttribute('viewBox', '0 0 300 80'); svg.style.width = '300px'; svg.innerHTML = '<text x="150" y="45" text-anchor="middle" fill="currentColor">Empty tree: insert a value</text>'; return; }
  let x = 0, maxD = 0; const P = new Map();
  (function lay(n, d) { if (!n) return; lay(n.l, d + 1); P.set(n.id, { x: 30 + 50 * x++, y: 30 + 60 * d }); maxD = Math.max(maxD, d); lay(n.r, d + 1); })(root, 0);
  let s = '';
  (function edges(n) { if (!n) return; const p = P.get(n.id); for (const ch of [n.l, n.r]) if (ch) { const q = P.get(ch.id); s += `<line class="ge" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`; edges(ch); } })(root);
  (function nodes(n) {
    if (!n) return; const p = P.get(n.id);
    s += `<g class="gn ${n.id === hit ? 'hit' : n.id === cur ? 'cur' : vis.has(n.id) ? 'vis' : ''}"><circle cx="${p.x}" cy="${p.y}" r="20"/><text x="${p.x}" y="${p.y}" dy=".35em">${n.v}</text></g>`;
    nodes(n.l); nodes(n.r);
  })(root);
  svg.setAttribute('viewBox', `0 0 ${x * 50 + 10} ${maxD * 60 + 60}`);
  svg.style.width = Math.max(x * 50 + 10, 200) + 'px';
  svg.innerHTML = s;
}
function walk(kind, root) {
  const out = [];
  if (kind === 'level') { const q = root ? [root] : []; while (q.length) { const n = q.shift(); out.push(n); n.l && q.push(n.l); n.r && q.push(n.r); } return out; }
  (function f(n) { if (!n) return; if (kind === 'pre') out.push(n); f(n.l); if (kind === 'in') out.push(n); f(n.r); if (kind === 'post') out.push(n); })(root);
  return out;
}
async function animateNodes(list, label, finalText, hitId = -1) {
  tBusy = true;
  try {
    const seen = new Set(), vals = [];
    for (const n of list) {
      seen.add(n.id); vals.push(n.v);
      renderTree(seen, n.id); $('#t-order').textContent = `${label}: ${vals.join(' → ')}`;
      tSay(`Visiting node ${n.v}.`); await sleep(600);
    }
    renderTree(seen, -1, hitId); tSay(finalText);
  } finally { tBusy = false; }
}
function readTreeVal() {
  const raw = $('#t-val').value, v = Number(raw);
  if (raw === '' || !Number.isInteger(v) || v < -999 || v > 999) { tSay('Enter a whole number between -999 and 999.'); return null; }
  return v;
}
$('#t-ins').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  if (treeSize() >= 31) return tSay('Tree is full for this demo (31 nodes).');
  if (isBST()) {
    if (bstHas(bst, v)) return tSay(`${v} is already in the BST (duplicates are ignored).`);
    bst = bstInsert(bst, v); tSay(`Inserted ${v}: started at the root and went left for smaller, right for larger values until a free spot was found.`);
  } else { btArr.push(v); tSay(`Inserted ${v} in the first free position in level order, so the tree stays complete.`); }
  $('#t-order').textContent = ''; renderTree();
};
$('#t-del').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  if (isBST()) {
    if (!bstHas(bst, v)) return tSay(`${v} is not in the tree.`);
    bst = bstDelete(bst, v); tSay(`Deleted ${v}. A node with two children is replaced by its inorder successor.`);
  } else {
    const i = btArr.indexOf(v); if (i < 0) return tSay(`${v} is not in the tree.`);
    btArr[i] = btArr[btArr.length - 1]; btArr.pop(); tSay(`Deleted ${v}: the last node's value took its place, then the last node was removed.`);
  }
  $('#t-order').textContent = ''; renderTree();
};
$('#t-find').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  const root = treeRoot(); if (!root) return tSay('The tree is empty.');
  let path = [];
  if (isBST()) { let n = root; while (n) { path.push(n); if (n.v === v) break; n = v < n.v ? n.l : n.r; } }
  else { for (const n of walk('level', root)) { path.push(n); if (n.v === v) break; } }
  const last = path[path.length - 1], ok = last.v === v;
  animateNodes(path, 'Search path', ok ? `Found ${v} after ${path.length} step(s).` : `${v} is not in the tree.`, ok ? last.id : -1);
};
$('#t-run').onclick = () => {
  if (tBusy) return; const root = treeRoot(); if (!root) return tSay('The tree is empty: insert values first.');
  const k = $('#t-trav').value, names = { in: 'Inorder', pre: 'Preorder', post: 'Postorder', level: 'Level order' };
  const txt = { in: 'Left subtree, node, right subtree (sorted order for a BST).', pre: 'Node first, then left, then right.', post: 'Left, right, then the node.', level: 'Row by row using a queue.' };
  animateNodes(walk(k, root), names[k], `${names[k]} finished. ${txt[k]}`);
};
$('#t-rand').onclick = () => {
  if (tBusy) return; bst = null; btArr = [];
  const vals = new Set(); while (vals.size < 7) vals.add(1 + Math.floor(Math.random() * 99));
  vals.forEach(v => { if (isBST()) bst = bstInsert(bst, v); else btArr.push(v); });
  $('#t-order').textContent = ''; tSay('Random tree created.'); renderTree();
};
$('#t-clear').onclick = () => { if (tBusy) return; bst = null; btArr = []; $('#t-order').textContent = ''; tSay('Tree cleared.'); renderTree(); };
$('#t-mode').onchange = () => { if (!tBusy) { $('#t-order').textContent = ''; tSay(isBST() ? 'BST mode: smaller values go left, larger go right.' : 'Binary tree mode: values fill the tree level by level.'); renderTree(); } };
[50, 30, 70, 20, 40, 60, 80].forEach(v => bst = bstInsert(bst, v));
btArr = [1, 2, 3, 4, 5, 6, 7];
renderTree();

/* ================= Graphs: BFS & DFS ================= */
const GN = 'ABCDEFG'.split('');
let gEdges = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['E', 'G'], ['D', 'E']];
const gPos = {};
GN.forEach((n, i) => { const a = i / GN.length * 2 * Math.PI - Math.PI / 2; gPos[n] = { x: 180 + 120 * Math.cos(a), y: 150 + 120 * Math.sin(a) }; });
$('#g-start').innerHTML = GN.map(n => `<option>${n}</option>`).join('');
function adjacency() {
  const m = Object.fromEntries(GN.map(n => [n, []]));
  gEdges.forEach(([a, b]) => { m[a].push(b); m[b].push(a); });
  for (const k in m) m[k].sort();
  return m;
}
/* Pure algorithm logic: returns snapshots, no DOM */
function graphSteps(kind, start) {
  const g = adjacency(), vis = [], tree = [], steps = []; let ds = [];
  const snap = (cur, text) => steps.push({ vis: [...vis], cur, ds: [...ds], tree: tree.map(e => [...e]), text, kind });
  snap(null, `${kind.toUpperCase()} starting from ${start}. Press Play or Next.`);
  if (kind === 'bfs') {
    vis.push(start); ds = [start]; snap(start, `Mark ${start} visited and enqueue it.`);
    while (ds.length) {
      const u = ds.shift(); snap(u, `Dequeue ${u}. Its neighbours: ${g[u].join(', ') || 'none'}.`);
      for (const v of g[u]) if (!vis.includes(v)) { vis.push(v); ds.push(v); tree.push([u, v]); snap(u, `${v} is new: mark it visited and enqueue it.`); }
    }
  } else {
    const dfs = u => {
      vis.push(u); ds.push(u); snap(u, `Visit ${u} (push onto the call stack).`);
      for (const v of g[u]) if (!vis.includes(v)) { tree.push([u, v]); snap(u, `Go from ${u} to unvisited neighbour ${v}.`); dfs(v); snap(u, `Back at ${u}: backtrack and check the next neighbour.`); }
      ds.pop();
    };
    dfs(start);
  }
  const miss = GN.filter(n => !vis.includes(n));
  snap(null, `Done. Visit order: ${vis.join(' → ')}.` + (miss.length ? ` Not reachable from ${start}: ${miss.join(', ')}.` : ''));
  return steps;
}
const graphPlayer = makePlayer(st => {
  const on = (a, b) => st.tree.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  $('#g-svg').innerHTML =
    gEdges.map(([a, b]) => `<line class="ge ${on(a, b) ? 'on' : ''}" x1="${gPos[a].x}" y1="${gPos[a].y}" x2="${gPos[b].x}" y2="${gPos[b].y}"/>`).join('') +
    GN.map(n => `<g class="gn ${n === st.cur ? 'cur' : st.vis.includes(n) ? 'vis' : ''}"><circle cx="${gPos[n].x}" cy="${gPos[n].y}" r="20"/><text x="${gPos[n].x}" y="${gPos[n].y}" dy=".35em">${n}</text></g>`).join('');
  $('#g-text').textContent = st.text;
  $('#g-ds').textContent = (st.kind === 'bfs' ? 'Queue (front → rear): ' : 'Call stack (bottom → top): ') + '[' + st.ds.join(', ') + ']';
  $('#g-order').textContent = 'Visited: ' + (st.vis.join(' → ') || '–');
}, $('#g-speed'), on => $('#g-play').textContent = on ? '⏸ Pause' : '▶ Play');
function loadGraph() {
  $('#g-edges').value = gEdges.map(e => e.join('-')).join(', ');
  graphPlayer.load(graphSteps($('#g-algo').value, $('#g-start').value));
}
$('#g-apply').onclick = () => {
  const parts = $('#g-edges').value.toUpperCase().split(/[\s,]+/).filter(Boolean), out = [];
  for (const p of parts) {
    const m = p.match(/^([A-G])-([A-G])$/);
    if (!m || m[1] === m[2]) { $('#g-text').textContent = `Invalid edge "${p}". Use letters A–G like A-B, B-C (no self loops).`; return; }
    if (!out.some(([a, b]) => (a === m[1] && b === m[2]) || (a === m[2] && b === m[1]))) out.push([m[1], m[2]]);
  }
  gEdges = out; loadGraph();
};
$('#g-rand').onclick = () => {
  const e = [], has = (a, b) => e.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 1; i < GN.length; i++) e.push([GN[Math.floor(Math.random() * i)], GN[i]]);
  for (let k = 0; k < 3; k++) { const a = GN[Math.floor(Math.random() * 7)], b = GN[Math.floor(Math.random() * 7)]; if (a !== b && !has(a, b)) e.push([a, b]); }
  gEdges = e; loadGraph();
};
$('#g-algo').onchange = $('#g-start').onchange = loadGraph;
$('#g-play').onclick = () => graphPlayer.toggle();
$('#g-next').onclick = () => graphPlayer.next();
$('#g-prev').onclick = () => graphPlayer.prev();
$('#g-reset').onclick = () => graphPlayer.reset();
loadGraph();

/* ================= Init ================= */
sortInput = [34, 7, 23, 32, 5, 62, 14, 48, 19, 41];
loadSort();
loadSearch();
go('home');
