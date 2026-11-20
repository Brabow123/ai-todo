// 演示数据：没装 dws 或想先看效果时用（npm run demo）
const now = () => Date.now();
const me = { userId: 'demo-me', name: '李子妍', org: '演示组织' };

function messages() {
  const t = now();
  return [
    { id: 'd1', text: '@李子妍 麻烦明天上午之前把 Q4 投放数据表发我，周会要用', senderName: '王磊', senderId: 'u2', isGroup: true, atMe: true, convName: '增长项目群', time: t - 40 * 60e3 },
    { id: 'd2', text: '好的，我今天下班前给你整理一版竞品对比', senderName: '李子妍', senderId: 'demo-me', isGroup: false, convName: '张敏', time: t - 25 * 60e3 },
    { id: 'd3', text: '周四找法务确认合同条款', senderName: '李子妍', senderId: 'demo-me', isGroup: false, convName: '文件传输助手', time: t - 3 * 3600e3 },
    { id: 'd4', text: '子妍，能不能帮忙看下新版首页的文案？尽快哈', senderName: '陈晨', senderId: 'u4', isGroup: false, convName: '陈晨', time: t - 10 * 60e3 },
    { id: 'd5', text: '今天下午茶有芒果蛋糕', senderName: '行政小助手', senderId: 'u9', isGroup: true, convName: '全员群', time: t - 2 * 3600e3 },
    { id: 'd6', text: '收到', senderName: '王磊', senderId: 'u2', isGroup: false, convName: '王磊', time: t - 5 * 60e3 },
  ];
}

function minutesList() {
  return [{ id: 'demo-meet-1', title: '增长周会', startTime: now() - 70 * 60e3, endTime: now() - 8 * 60e3 }];
}

function minutesDetail() {
  return {
    data: {
      basic: { title: '增长周会' },
      summary: '主题：Q4 投放预算复盘\n结论：预算整体砍 20%，渠道从信息流换到短视频\n结论：下周一前定新投放节奏\n',
      todos: { actions: [
        { content: '周五前出新的投放方案', executorName: '李子妍' },
        { content: '对接短视频渠道报价', executorName: '王磊' },
        { content: '下周一前同步新节奏给销售', executorName: '李子妍' },
      ] },
    },
  };
}

module.exports = { me, messages, minutesList, minutesDetail };
