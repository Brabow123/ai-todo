// One recognition run owns the sequence. Message content and results come from the engine.
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const settle = 'cubic-bezier(.16,1,.3,1)';

class TidyPlayback {
  constructor(paint) {
    this.paint = paint;
    this.progress = { stage: 'read', sources: [], startedAt: Date.now() };
    this.count = 0;
    this.timer = null;
    this.stopped = false;
  }

  update(progress) {
    if (this.stopped || this.finishing) return;
    this.progress = progress;
    this.advance();
  }

  advance() {
    const items = this.progress.samples || [];
    if (!this.timer && this.count < items.length) {
      this.count++;
      this.timer = setTimeout(() => { this.timer = null; this.advance(); }, 880);
    }
    this.paint({ ...this.progress, evidence: items.slice(0, this.count) });
  }

  pause(ms) {
    return new Promise(resolve => {
      this.resume = resolve;
      this.timer = setTimeout(() => { this.timer = null; this.resume = null; resolve(); }, ms);
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.resume?.();
    this.resume = null;
  }

  async finish(result) {
    clearTimeout(this.timer);
    this.finishing = true;
    if (this.stopped || !result?.main.length || result.stats.stopped || motionPreference.matches || document.hidden) return;
    const items = this.progress.samples || [];
    while (!this.stopped && this.count < items.length) {
      this.count++;
      this.paint({ ...this.progress, evidence: items.slice(0, this.count) });
      await this.pause(390);
    }
    if (this.stopped) return;
    const evidence = result.main.filter(item => item.quote).slice(0, 3);
    if (!evidence.length) return;
    this.paint({ ...this.progress, extracting: true, evidence, found: result.main.length });
    await this.pause(600);
  }
}
function art(pose) {
  return `<div class="motion-art" aria-hidden="true"><i class="paper back"></i><i class="paper front"></i><span class="figure"><img src="${POSE(pose)}" alt=""></span></div>`;
}

function animateMotion(el, frames, options) {
  if (!el || document.hidden || motionPreference.matches || !el.animate) return;
  return el.animate(frames, { easing: settle, ...options });
}

// The lens contains the actual text beneath it. Its inner surface moves opposite the glass.
function readThroughLens(row, duration) {
  if (!row || motionPreference.matches || document.hidden) return;
  const line = row.querySelector('.evidence-text');
  const rect = line.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(line);
  const firstLine = range.getClientRects()[0];
  if (!firstLine) return;
  const phrase = line.querySelector('mark')?.getBoundingClientRect();
  const start = rect.left + 9;
  const end = Math.max(start + 14, Math.min(rect.right - 15, phrase ? phrase.right - 4 : firstLine.right - 4));
  const y = firstLine.top + firstLine.height / 2;
  const loupe = document.createElement('span');
  loupe.className = 'reading-loupe';
  loupe.setAttribute('aria-hidden', 'true');
  loupe.innerHTML = '<i class="loupe-window"><span class="loupe-print"></span></i>';
  const print = loupe.querySelector('.loupe-print');
  print.textContent = line.textContent;
  print.style.fontStyle = 'normal';
  print.style.setProperty('--copy-width', rect.width + 'px');
  row.append(loupe);
  const scale = 1.35;
  const glass = x => `translate(${x-rowRect.left-17}px,${y-rowRect.top-17}px)`;
  const textAt = x => `translate(${15.5-(x-rect.left)*scale}px,${15.5-(y-rect.top)*scale}px) scale(${scale})`;
  const timing = { duration, easing: 'cubic-bezier(.32,.08,.46,1)', fill: 'both' };
  animateMotion(print, [{ transform: textAt(start) }, { transform: textAt(end) }], timing);
  const sweep = animateMotion(loupe, [{ transform: glass(start) }, { transform: glass(end) }], timing);
  animateMotion(loupe, [
    { opacity: 0 }, { opacity: 1, offset: .16 }, { opacity: 1, offset: .83 }, { opacity: 0 }
  ], { duration, easing: 'linear', fill: 'both' });
  sweep?.finished.then(() => loupe.remove(), () => loupe.remove());
}

function phraseSnapshot(el) {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  return rect.width ? { rect, text: el.textContent } : null;
}

// Follow the same words to the actual destination, including the position chosen by the current sort.
function carryPhrase(from, target, duration, delay = 0, arc = 0) {
  if (!from || !target || motionPreference.matches || document.hidden) return;
  const to = target.getBoundingClientRect();
  const start = from.rect;
  if (to.bottom < 0 || to.top > innerHeight || start.bottom < 0 || start.top > innerHeight) return;
  const paper = document.createElement('span');
  paper.className = 'action-paper';
  paper.textContent = from.text;
  paper.setAttribute('aria-hidden', 'true');
  document.body.append(paper);
  const at = (x,y,tilt) => `translate(${x-4}px,${y-1}px) rotate(${tilt}deg)`;
  const flight = animateMotion(paper, [
    { transform: at(start.left,start.top,0), opacity: 1 },
    { transform: at((start.left+to.left)/2,(start.top+to.top)/2-arc,-(arc ? 2 : 0)), opacity: 1, offset: .48 },
    { transform: at(to.left,to.top,0), opacity: 0 }
  ], { duration, delay, easing: 'cubic-bezier(.4,.04,.18,1)', fill: 'both' });
  animateMotion(target, [{ opacity: 0 }, { opacity: 0, offset: .80 }, { opacity: 1 }], { duration, delay, easing: 'linear', fill: 'backwards' });
  if (flight) flight.finished.then(() => paper.remove(), () => paper.remove());
  else paper.remove();
}

function arrivalSnapshot(ids) {
  const from = new Map(ids.map(id => [id, phraseSnapshot(document.querySelector(`.urow[data-id="${CSS.escape(id)}"] .tt`))]));
  const positions = new Map([...document.querySelectorAll('#nList .nr')].map(el => [el.dataset.id, el.getBoundingClientRect().top]));
  return { from, positions };
}

function landInToday(snapshot, added) {
  if (!added.length) return;
  const list = $('#nList');
  const bounds = list?.getBoundingClientRect();
  document.querySelectorAll('#nList .nr').forEach(row => {
    const oldTop = snapshot.positions.get(row.dataset.id);
    if (oldTop === undefined) return;
    const dy = oldTop - row.getBoundingClientRect().top;
    if (Number.isFinite(dy) && Math.abs(dy) > 1 && Math.abs(dy) < 160) animateMotion(row, [
      { transform: `translateY(${dy}px)` }, { transform: 'none' }
    ], { duration: 380 });
  });
  added.forEach((task,index) => {
    const row = list?.querySelector(`.nr[data-id="${CSS.escape(task.id)}"]`);
    const box = row?.getBoundingClientRect();
    if (!row || box.bottom <= bounds.top || box.top >= bounds.bottom) {
      const anchor = $('#nTabs .view-title') || $('#note .pose');
      if (index === 0 && anchor) carryPhrase(snapshot.from.get(task.originId), anchor, 480);
      return;
    }
    const delay = Math.min(index * 110, 330);
    carryPhrase(snapshot.from.get(task.originId), row.querySelector('.tx'), 640, delay, 33);
    animateMotion(row, [{ backgroundColor: '#e8f1ff' }, { backgroundColor: 'transparent' }], { duration: 580, delay: delay + 350 });
  });
  animateMotion($('#nTabs .view-title em'), [{ transform: 'scale(.82)' }, { transform: 'scale(1.16)', offset: .45 }, { transform: 'none' }], { duration: 330 });
}


function evidenceRow(item, index, extracting, current) {
  const source = item.source || {};
  const who = srcWho(source);
  const where = srcWhere(source);
  const label = [who, where, source.type === 'meet' ? '听记' : ''].filter(Boolean).join(' · ') || '消息';
  const quote = cleanQuote(item.quote).slice(0, 120);
  let body = esc(quote);
  if (extracting) {
    // AI titles can paraphrase. Highlight only words that occur in the source.
    const literal = item.title && quote.includes(item.title) ? item.title : quote.match(/[^，。！？；\n]{2,48}/)?.[0];
    if (literal) {
      const at = quote.indexOf(literal);
      body = esc(quote.slice(0, at)) + '<mark>' + esc(literal) + '</mark>' + esc(quote.slice(at + literal.length));
    }
  }
  return `<div class="evidence-row" data-evidence="${esc(item.id)}" data-source="${esc(source.type || '')}" data-current="${current}" style="--mark-delay:${index * 100}ms">
    <span class="evidence-avatar" aria-hidden="true">${esc(label[0])}</span>
    <div><div class="evidence-meta">${esc(label)}</div><div class="evidence-text">${body}</div></div></div>`;
}

function progressCard(p) {
  const items = p.evidence || [];
  const think = p.stage === 'think';
  const sources = (p.sources || []).map(s => `<span data-state="${esc(s.state)}"><i></i>${esc(s.label)}${s.state === 'fail' ? ' · 读不到' : s.state === 'ok' && s.n != null ? ' ' + esc(s.n) : ''}</span>`).join('');
  const heading = p.stopping ? '正在停止整理…' : p.extracting ? '这几句话里，有事要做' : think ? '小钉在找要做的事…' : '小钉在翻消息…';
  const caption = p.extracting ? '正在摘出原话里的行动' : think ? '在判断哪些需要你跟进' : '正在读「' + esc(p.reading || '消息') + '」';
  return `<section class="card motion-progress" data-stage="${p.extracting ? 'think' : 'read'}">
    <header class="motion-head">${art(think || p.extracting ? 'think' : 'search')}
      <div role="status"><h2>${heading}</h2><p class="ss">${caption}</p></div>
      <button class="stopb" data-a="tidyStop"${p.stopping ? ' disabled' : ''}>${I.stop}停止</button></header>
    <div class="motion-sources">${sources}</div>
    <div class="evidence-flow">${items.map((item, i) => evidenceRow(item, i, p.extracting, !p.extracting && i === items.length - 1)).join('')}</div></section>`;
}

function evidencePositions(panel) {
  return new Map([...panel.querySelectorAll('.evidence-flow .evidence-row')].map(row => [
    row.dataset.evidence, { rect: row.getBoundingClientRect(), phrase: phraseSnapshot(row.querySelector('mark')), row }
  ]));
}

function animateTidyPanel(panel, previous, wasExtracting, wasResult) {
  const progress = panel.querySelector('.motion-progress');
  if (motionPreference.matches || document.hidden) return;
  if (progress) {
    const extracting = progress.dataset.stage === 'think';
    const rows = [...progress.querySelectorAll('.evidence-flow .evidence-row')];
    for (const row of rows) {
      const old = previous.get(row.dataset.evidence);
      if (!old || (extracting && !wasExtracting)) {
        const y = old ? old.rect.top - row.getBoundingClientRect().top : 8;
        animateMotion(row, [{opacity:old ? 1 : .1, transform:`translateY(${y}px)`},{opacity:1,transform:'none'}],{ duration:330 });
        if (!extracting && row === rows.at(-1)) {
          setTimeout(() => { if (row.isConnected) readThroughLens(row, 670); }, 120);
        }
      }
    }
    if (extracting && !wasExtracting) {
      const bounds = progress.getBoundingClientRect();
      for (const [id, old] of previous) {
        if (rows.some(row => row.dataset.evidence === id)) continue;
        const ghost = old.row;
        ghost.querySelector('.reading-loupe')?.remove();
        ghost.classList.add('evidence-exit');
        ghost.setAttribute('aria-hidden','true');
        Object.assign(ghost.style, { top:old.rect.top-bounds.top+'px', left:old.rect.left-bounds.left+'px', width:old.rect.width+'px' });
        progress.append(ghost);
        const fade = animateMotion(ghost,[{opacity:1},{opacity:0,transform:'translateX(12px)'}],{duration:190});
        fade?.finished.then(() => ghost.remove(), () => ghost.remove());
      }
    }
    return;
  }
  const result = panel.querySelector('.motion-results');
  if (!result || wasResult) return;
  animateMotion(result.querySelector('.figure'),[{transform:'translate(-4px,3px) rotate(-5deg)'},{transform:'none'}],{duration:420});
  [...result.querySelectorAll('.urow')].slice(0, 6).forEach((row,index) => {
    const delay = 90 * index;
    carryPhrase(previous.get(row.dataset.id)?.phrase, row.querySelector('.tt'), 460, delay);
    [...row.querySelector('.chips').children].forEach((el,i) => animateMotion(el,
      [{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],
      { duration:200,delay:delay+95+22*i,fill:'backwards' }));
  });
}
