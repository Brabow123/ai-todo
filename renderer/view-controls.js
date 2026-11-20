const Views = window.TaskViews;
const viewState = { id: 'today', config: Views.config(), menu: null, name: '', error: '', saving: false };
// 旧视图仍保留原配置，打开时只应用当前可见的筛选与排序。
const availableViews = () => [...Views.builtins, ...(S?.savedViews || []).map(v => ({
  ...v, config: { ...v.config, group: false },
}))];
const currentView = () => availableViews().find(v => v.id === viewState.id) || Views.builtins[0];
const viewPaths = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18"/>',
  stack: '<path d="M3 8l9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M3 6h18M6 12h12M9 18h6"/>',
  manual: '<path d="M7 4v15m-3-3 3 3 3-3M13 6h7m-7 5h5m-5 5h3"/>',
  priority: '<path d="M5 20V4m1 1c4-3 7 3 13 0v9c-6 3-9-3-13 0"/>',
  save: '<path d="M6 4a1 1 0 011-1h10a1 1 0 011 1v17l-6-4-6 4z"/>',
};
const viewIcon = key => `<svg class="vi" viewBox="0 0 24 24" aria-hidden="true">${viewPaths[key]}</svg>`;
const sortRules = {
  manual: { title: '手动排序', hint: '拖动任务，调整先后', icon: 'manual' },
  priority: { title: '按优先级排序', hint: 'P0 → P1 → P2', icon: 'priority' },
  due: { title: '按截止时间排序', hint: '越早截止，越靠前', icon: 'calendar' },
};
function viewTrigger(key, body, label, cls) {
  return `<button class="${cls}" data-a="viewMenu" data-v="${key}" aria-label="${esc(label)}" aria-expanded="${viewState.menu === key}">${body}</button>`;
}
function viewToolbar() {
  const c = viewState.config;
  function tool(key, label, text, active) {
    return viewTrigger(key, viewIcon(key) + `<span>${esc(text)}</span>`, label, 'view-tool' + (active ? ' on' : ''));
  }
  const rule = sortRules[c.sort];
  const sort = viewTrigger('sort', viewIcon(rule.icon) + `<span>${rule.title}</span>` + I.chev,
    '排序方式，当前' + rule.title, 'view-tool sort-trigger' + (c.sort === 'manual' ? '' : ' on'));
  return `<div class="view-tools">${tool('filter', '筛选标签', c.tag || '筛选', !!c.tag)}
    ${sort}
    ${Views.sameConfig(currentView().config, c) ? '' : tool('save', '保存视图', '保存视图', false)}</div>`;
}
function viewPopup() {
  const key = viewState.menu;
  if (!key) return '';
  const c = viewState.config;
  const heading = text => `<div class="view-caption">${text}</div>`;
  function choice(value, label, selected) {
    return `<button class="view-item" data-a="viewPick" data-v="${esc(value)}" aria-pressed="${selected}">${label}${selected ? '<span class="view-check" aria-hidden="true">✓</span>' : ''}</button>`;
  }
  let body;
  if (key === 'views') {
    const row = v => choice(v.id, viewIcon(v.icon || 'save') + `<span>${esc(v.name)}</span>`, v.id === viewState.id);
    body = heading('切换视图') + Views.builtins.map(row).join('');
    if (S.savedViews?.length) body += '<div class="sep"></div>' + heading('已保存的视图') + S.savedViews.map(row).join('');
  } else if (key === 'filter') {
    body = heading('按标签筛选') + choice('', '所有标签', !c.tag) + S.tagLibrary.map(n => choice(n, tagPill(n), n === c.tag)).join('');
    if (!S.tagLibrary.length) body += heading('给任务加标签后可在这里筛选');
  } else if (key === 'sort') {
    body = Object.entries(sortRules).map(([id, rule]) => {
      const badge = id === 'manual' ? '<small class="sort-default">默认</small>' : '';
      return choice(id, `<span class="sort-icon">${viewIcon(rule.icon)}</span><span class="sort-copy"><strong>${rule.title}${badge}</strong><small>${rule.hint}</small></span>`, c.sort === id);
    }).join('');
  } else if (key === 'save') {
    body = `<form id="saveViewForm"><label for="viewName">保存为新视图</label>
      <input id="viewName" maxlength="30" required autocomplete="off" value="${esc(viewState.name)}">
      ${viewState.error ? `<div role="alert" class="view-error">${esc(viewState.error)}</div>` : ''}
      <button type="submit" ${viewState.saving ? 'disabled' : ''}>保存</button></form>`;
  }
  return `<div class="view-popup${key === 'sort' ? ' sort-menu' : ''}" role="group" aria-label="${key === 'sort' ? '排序方式' : '视图选项'}">${body}</div>`;
}
function positionViewPopup() {
  const card = $('#noteCard');
  if (!card) return;
  card.style.minHeight = '';
  const popup = $('#nTabs .view-popup');
  if (!popup) return;
  const trigger = $(`#nTabs [data-a="viewMenu"][data-v="${viewState.menu}"]`);
  const box = $('#nTabs').getBoundingClientRect(), anchor = trigger.getBoundingClientRect();
  popup.style.left = Math.max(7, Math.min(anchor.left - box.left, box.width - popup.offsetWidth - 7)) + 'px';
  popup.style.top = (anchor.bottom - box.top + 4) + 'px';
  card.style.minHeight = Math.ceil(popup.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 8) + 'px';
}
function closeViewMenu(restoreFocus = false) {
  const previous = viewState.menu;
  if (!previous) return;
  viewState.menu = null;
  $('#nTabs .view-popup')?.remove();
  const button = $(`#nTabs [data-a="viewMenu"][data-v="${previous}"]`);
  button?.setAttribute('aria-expanded', 'false');
  positionViewPopup();
  if (restoreFocus) button?.focus({ preventScroll: true });
  requestAnimationFrame(reportSize);
}
function inheritNewViewTag(tag) {
  const draft = ui.drafts.today;
  if (tag && tag !== viewState.config.tag && draft.tags && !draft.tags.includes(tag)) {
    draft.tags = [...draft.tags, tag];
  }
}
function changeView(v) {
  inheritNewViewTag(v.config.tag);
  viewState.id = v.id;
  viewState.config = { ...v.config };
  ui.menu = null;
  ui.openRow = null;
  viewState.menu = null;
  const list = $('#nList');
  if (list) list.scrollTop = 0;
}
function toggleViewMenu(button) {
  const key = button.dataset.v;
  if (viewState.menu === key) { closeViewMenu(true); return; }
  clearTimeout(titleClickTimer);
  ui.menu = null;
  viewState.menu = key;
  if (key === 'save') {
    const c = viewState.config;
    const label = c.tag || (c.scope === 'today' ? '今天' : '全部待办');
    viewState.name = (label + (c.sort === 'due' ? ' · 按截止' : c.sort === 'priority' ? ' · 按优先级' : '')).slice(0, 30);
    viewState.error = '';
  }
  render();
  if (key === 'save') { $('#viewName')?.focus(); $('#viewName')?.select(); }
  else $('.view-popup [aria-pressed="true"]')?.focus({ preventScroll: true });
}
function pickViewOption(button) {
  const key = viewState.menu, value = button.dataset.v;
  if (key === 'views') {
    const next = availableViews().find(v => v.id === value);
    if (!next) return;
    changeView(next);
  } else {
    const field = { filter: 'tag', sort: 'sort' }[key];
    if (!field) return;
    if (field === 'tag') inheritNewViewTag(value);
    viewState.config[field] = value;
    ui.menu = null; ui.openRow = null; viewState.menu = null;
    $('#nList').scrollTop = 0;
  }
  render();
  $(`#nTabs [data-a="viewMenu"][data-v="${key}"]`)?.focus({ preventScroll: true });
}
document.addEventListener('submit', async event => {
  if (event.target.id !== 'saveViewForm') return;
  event.preventDefault();
  if (viewState.saving) return;
  viewState.saving = true;
  try {
    const saved = await A('saveView', $('#viewName').value, viewState.config);
    changeView(saved);
  } catch (error) { viewState.error = error.message; }
  finally {
    viewState.saving = false;
    render();
    if (viewState.menu === 'save') $('#viewName')?.focus();
    else $('#nTabs [data-v="views"]')?.focus({ preventScroll: true });
  }
});
