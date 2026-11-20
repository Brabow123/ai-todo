// 同一份待办数据的查看规则，供主进程校验和便签渲染共用。
(function (root) {
  function config(scope = 'today', tag = '', sort = 'manual', group = false) {
    return { scope, tag, sort, group };
  }
  const builtins = [
    { id: 'today', name: '今天', icon: 'calendar', config: config() },
    { id: 'all', name: '全部待办', icon: 'stack', config: config('all') },
    { id: 'deadline', name: '近期截止', icon: 'clock', config: config('all', '', 'due') },
  ];
  function selectTasks(tasks, view) {
    const selected = tasks.filter(t =>
      (view.scope === 'all' || t.list === 'today') && (!view.tag || t.tags?.includes(view.tag)));
    const priority = { P0: 0, P1: 1, P2: 2 };
    return selected.sort((a, b) => {
      if (view.sort === 'due' && a.due !== b.due) {
        const first = a.due ?? Infinity, second = b.due ?? Infinity;
        if (first !== second) return first - second;
      }
      if (view.sort === 'priority') {
        const delta = (priority[a.priority] ?? 3) - (priority[b.priority] ?? 3);
        if (delta) return delta;
      }
      if (a.list !== b.list) return a.list === 'today' ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
  }
  function tagGroups(tasks, library) {
    const groups = new Map(library.map(name => [name, []]));
    const untagged = [];
    for (const task of tasks) {
      if (!task.tags?.length) untagged.push(task);
      for (const name of new Set(task.tags || [])) {
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(task);
      }
    }
    return [...groups, [null, untagged]].filter(([, rows]) => rows.length);
  }
  function sameConfig(a, b) {
    return a.scope === b.scope && a.tag === b.tag && a.sort === b.sort && a.group === b.group;
  }
  const api = { config, builtins, selectTasks, tagGroups, sameConfig };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskViews = api;
})(typeof window !== 'undefined' ? window : globalThis);
