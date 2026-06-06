/* ========== 数据 ========== */
const AVA=['#3370FF','#2EA121','#D97A00','#7A4FE0','#0A8B9E','#E0457B','#245BDB','#C26A00'];
function avaColor(n){let s=0;for(const c of n)s+=c.charCodeAt(0);return AVA[s%AVA.length];}
const $=id=>document.getElementById(id);

// 分类定义：图标 + 配色
const CATS=[
  {key:'all',name:'全部',color:'var(--blue-500)',bg:'var(--blue-50)',ic:'<path d="M4 6h16M4 12h16M4 18h16"/>'},
  {key:'approval',name:'待办审批',color:'var(--blue-500)',bg:'var(--blue-50)',ic:'<path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'},
  {key:'mention',name:'@ 我的',color:'var(--purple)',bg:'var(--purple-bg)',ic:'<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>'},
  {key:'cc',name:'抄送知会',color:'var(--cyan)',bg:'var(--cyan-bg)',ic:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'},
  {key:'system',name:'系统公告',color:'var(--warning)',bg:'var(--warning-bg)',ic:'<path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>'},
  {key:'org',name:'组织动态',color:'var(--success)',bg:'var(--success-bg)',ic:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>'},
];
const CATMAP={};CATS.forEach(c=>CATMAP[c.key]=c);

// 消息数据
let MSGS=[
  {id:1,cat:'approval',day:'today',time:'09:12',unread:true,from:'林晓',title:'林晓 提交了「调休申请」',preview:'调休 5/1–5/3 · 待你审批',
    approval:{applicant:'林晓',dept:'平台运营组',type:'请假申请',kv:[['请假类型','调休'],['起止时间','05-01 09:00 ~ 05-03 18:00'],['时长','2 天 9 小时'],['事由','项目加班较多，申请调休休整']],
      flow:[{nm:'林晓',role:'发起人',st:'done',time:'05-28 17:02'},{nm:'张伟',role:'直属主管',st:'cur',time:'待你审批'},{nm:'许静',role:'人事审核',st:'wait',time:'待审批'}]}},
  {id:2,cat:'approval',day:'today',time:'08:40',unread:true,from:'周涛',title:'周涛 提交了「采购申请」',preview:'数据库扩容采购 ¥32,800 · 待你审批',
    approval:{applicant:'周涛',dept:'研发中心',type:'采购申请',amount:'¥32,800.00',kv:[['采购事项','数据库扩容'],['预计金额','¥32,800.00'],['供应商','某云服务商'],['事由','现有库容不足，需扩容应对增长']],
      flow:[{nm:'周涛',role:'发起人',st:'done',time:'05-28 16:30'},{nm:'吴昊',role:'直属主管',st:'done',time:'05-28 18:10'},{nm:'张伟',role:'采购审核',st:'cur',time:'待你审批'},{nm:'赵敏',role:'财务审核',st:'wait',time:'待审批'}]}},
  {id:3,cat:'mention',day:'today',time:'10:05',unread:true,from:'李娜',title:'李娜 在「Q2 运营复盘」中 @了你',preview:'@张伟 这块数据麻烦你补充一下结论～',
    chat:{ctx:'话题：Q2 运营复盘',msgs:[
      {me:false,nm:'李娜',text:'下午好，Q2 复盘文档我先起了个框架。',time:'09:58'},
      {me:false,nm:'李娜',text:'@张伟 用户增长这块的数据和结论麻烦你补充一下，今天下班前给我就行～',time:'10:05'}
    ]}},
  {id:4,cat:'cc',day:'today',time:'11:20',unread:false,from:'赵敏',title:'赵敏「Q2 市场推广预算」抄送给你',preview:'金额 ¥56,000，已进入财务审核',
    notice:{kind:'cc',content:['赵敏发起的「Q2 市场推广费用预算」审批已抄送给你知会。','当前状态：财务审核中（赵敏）。该审批无需你处理，仅作知会。'],
      kv:[['发起人','赵敏'],['金额','¥56,000.00'],['当前节点','财务审核'],['抄送时间','今天 11:20']],link:'查看审批详情'}},
  {id:5,cat:'system',day:'yesterday',time:'18:30',unread:true,from:'sys',title:'人力资源系统 维护通知',preview:'今晚 22:00–23:00 系统维护，期间暂停服务',
    notice:{kind:'system',content:['为提升系统稳定性，人力资源系统将于今晚 22:00–23:00 进行例行维护升级。','维护期间，考勤打卡、请假申请等功能将暂停使用，请提前安排。给您带来不便，敬请谅解。'],
      kv:[['维护系统','人力资源系统'],['维护时间','今晚 22:00–23:00'],['影响范围','考勤 / 请假 / 招聘'],['发布方','信息技术部']]}},
  {id:6,cat:'system',day:'yesterday',time:'14:02',unread:false,from:'sys',title:'财务报销中心 升级完成',preview:'v2.4.0 已上线，新增批量报销功能',
    notice:{kind:'system',content:['财务报销中心已完成 v2.4.0 版本升级并上线。','本次更新：新增批量报销提交、优化发票识别准确率、修复若干已知问题。欢迎体验。'],
      kv:[['系统','财务报销中心'],['版本','v2.4.0'],['上线时间','昨天 14:02'],['发布方','信息技术部']],link:'前往财务报销中心'}},
  {id:7,cat:'org',day:'yesterday',time:'09:02',unread:false,from:'许静',title:'新成员 林晓 加入 平台运营组',preview:'由 许静 添加，职位：运营专员',
    notice:{kind:'org',content:['新成员「林晓」已加入 平台运营组，职位：运营专员。','请相关同事做好对接与欢迎。'],
      kv:[['成员','林晓'],['部门','平台运营组'],['职位','运营专员'],['操作人','许静（HR）']],link:'查看成员档案'}},
  {id:8,cat:'mention',day:'yesterday',time:'16:40',unread:false,from:'吴昊',title:'吴昊 给你发送了消息',preview:'下周三的技术评审会，你这边准备一下运营侧的需求',
    chat:{ctx:'与 吴昊 的会话',msgs:[
      {me:false,nm:'吴昊',text:'下周三下午有个技术评审会。',time:'16:38'},
      {me:false,nm:'吴昊',text:'你这边准备一下运营侧的需求清单，会上一起过一下。',time:'16:40',reactions:[{e:'👍',n:1,mine:true}]},
      {me:true,nm:'张伟',text:'好的，我整理完今天发你。',time:'16:42'}
    ]}},
  {id:9,cat:'cc',day:'earlier',time:'05-26',unread:false,from:'sys',title:'你的「差旅报销」已通过',preview:'¥2,240 报销已审批通过，将于 3 个工作日内到账',
    notice:{kind:'result',content:['你提交的「4 月差旅费用报销」已审批通过。','报销款 ¥2,240.00 将于 3 个工作日内打入你的工资卡，请注意查收。'],
      kv:[['审批单','SP-2026-0426-013'],['金额','¥2,240.00'],['结果','已通过'],['完成时间','05-26 14:20']],link:'查看审批单'}},
  {id:10,cat:'org',day:'earlier',time:'05-25',unread:false,from:'许静',title:'周涛 的账号已停用',preview:'离职流程办理中，账号已停用',
    notice:{kind:'org',content:['成员「周涛」已离职，其账号已由管理员停用。','相关权限与数据已按规定处理。'],
      kv:[['成员','周涛'],['原部门','研发中心 / 后端组'],['状态','已停用'],['操作人','许静（HR）']]}},
  {id:11,cat:'mention',day:'earlier',time:'05-24',unread:false,from:'许静',title:'许静 在「招聘计划」评论区 @了你',preview:'@张伟 运营岗的 JD 你看下有没有要补充的',
    chat:{ctx:'文档：2026 招聘计划',msgs:[
      {me:false,nm:'许静',text:'@张伟 运营专员岗位的 JD 我拟了初稿，你看下职责描述有没有要补充的？',time:'05-24 11:20'},
      {me:true,nm:'张伟',text:'收到，我下午看完批注给你。',time:'05-24 13:05'}
    ]}},
  {id:12,cat:'system',day:'earlier',time:'05-22',unread:true,from:'sys',title:'安全提醒：请定期修改登录密码',preview:'你的密码已超过 90 天未更新，建议尽快修改',
    notice:{kind:'system',content:['为保障账号安全，检测到你的登录密码已超过 90 天未更新。','建议尽快前往「个人设置 - 安全」修改密码，并开启二次验证。'],
      kv:[['提醒类型','账号安全'],['上次修改','90 天前'],['建议','修改密码 + 开启二次验证'],['发布方','信息安全组']],link:'前往修改密码'}},
];

/* ========== 状态 ========== */
let curCat='all';
let curMsgId=null;
let unreadOnly=false;
let searchQ='';
let settings={approval:true,mention:true,cc:true,system:true,org:false,dnd:false};

const DAY_LABEL={today:'今天',yesterday:'昨天',earlier:'更早'};
const DAY_ORDER=['today','yesterday','earlier'];

/* ========== 渲染：分类导航 ========== */
function catUnread(key){return MSGS.filter(m=>(key==='all'||m.cat===key)&&m.unread).length;}
function renderCats(){
  $('catList').innerHTML=CATS.map(c=>{
    const u=catUnread(c.key);
    return `<div class="cat-item ${curCat===c.key?'active':''}" title="${c.name}" onclick="selectCat('${c.key}')">
      <span class="ci" style="background:${c.bg}"><svg viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${c.ic}</svg></span>
      <span class="cl">${c.name}</span>
      <span class="cb ${u?'':'zero'}">${u}</span>
    </div>`;
  }).join('');
  const total=catUnread('all');
  const nb=$('navBadge');if(nb){nb.textContent=total;nb.style.display=total?'':'none';}
}
function selectCat(key){curCat=key;curMsgId=null;renderList();renderDetail();$('mlTitle').textContent=CATMAP[key].name==='全部'?'全部消息':CATMAP[key].name;}

/* ========== 渲染：消息列表 ========== */
function listMsgs(){
  let list=MSGS.filter(m=>curCat==='all'||m.cat===curCat);
  if(unreadOnly)list=list.filter(m=>m.unread);
  if(searchQ){const q=searchQ.trim();list=list.filter(m=>m.title.indexOf(q)>=0||m.preview.indexOf(q)>=0||(m.from&&m.from.indexOf(q)>=0));}
  return list;
}
function msgIcon(m,big){
  const c=CATMAP[m.cat];
  if(m.from&&m.from!=='sys'){
    return `<span class="${big?'mh-ico':'mi-ico'}" style="background:${avaColor(m.from)}">${m.from.slice(-1)}</span>`;
  }
  return `<span class="${big?'mh-ico':'mi-ico'} sys" style="background:${c.bg}"><svg viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${c.ic}</svg></span>`;
}
function renderList(){
  const list=listMsgs();
  const scroll=$('mlScroll');
  if(!list.length){
    scroll.innerHTML=`<div class="ml-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div class="et">${unreadOnly?'没有未读消息':'暂无消息'}</div></div>`;
    return;
  }
  let html='';
  DAY_ORDER.forEach(day=>{
    const items=list.filter(m=>m.day===day);
    if(!items.length)return;
    html+=`<div class="ml-group"><div class="ml-gt">${DAY_LABEL[day]}</div>`;
    html+=items.map(m=>`
      <div class="mi ${m.unread?'':'read'} ${curMsgId===m.id?'active':''}" onclick="openMsg(${m.id})">
        <span class="mi-dot"></span>
        ${msgIcon(m)}
        <div class="mi-main">
          <div class="mi-top"><span class="mi-title">${m.title}</span><span class="mi-time">${m.time}</span></div>
          <div class="mi-preview">${m.preview}</div>
        </div>
        <div class="mi-acts">
          <span class="mi-act" title="标记已读" onclick="event.stopPropagation();markRead(${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg></span>
          <span class="mi-act" title="归档" onclick="event.stopPropagation();archiveMsg(${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/></svg></span>
          <span class="mi-act danger" title="删除" onclick="event.stopPropagation();delMsg(${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></span>
        </div>
      </div>`).join('');
    html+='</div>';
  });
  scroll.innerHTML=html;
}

/* ========== 渲染：右侧详情（自适应） ========== */
function openMsg(id){
  const m=MSGS.find(x=>x.id===id);if(!m)return;
  curMsgId=id;
  if(m.unread){m.unread=false;renderCats();}
  renderList();renderDetail();
}
function renderDetail(){
  const d=$('msgDetail');
  const m=MSGS.find(x=>x.id===curMsgId);
  if(!m){
    d.innerHTML=`<div class="md-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div class="et">选择一条消息查看详情</div></div>`;
    return;
  }
  if(m.approval)renderApproval(d,m);
  else if(m.chat)renderChat(d,m);
  else renderNotice(d,m);
}
function tlNode(st){
  if(st==='done')return '<div class="tl-node done"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg></div>';
  if(st==='cur')return '<div class="tl-node cur"></div>';
  return '<div class="tl-node wait"><i></i></div>';
}
function renderApproval(d,m){
  const a=m.approval;
  d.innerHTML=`
    <div class="md-head">${msgIcon(m,true)}<div><h3>${m.title}</h3><div class="mh-sub"><span class="tag tag-orange"><span class="dot"></span>待审批</span><span>${a.dept} · ${a.type}</span></div></div></div>
    <div class="md-body">
      <div class="appr-card"><div class="ac-t">申请信息</div>
        <div class="appr-kv">${a.kv.map(([k,v])=>`<div class="k">${k}</div><div class="v ${k.indexOf('金额')>=0?'amount':''}">${v}</div>`).join('')}</div>
      </div>
      <div class="appr-card"><div class="ac-t">审批流程</div>
        <div class="timeline">${a.flow.map(f=>`<div class="tl-item">${tlNode(f.st)}<div class="tl-head"><span class="nm">${f.nm}</span><span class="role">${f.role}</span><span class="tl-time" ${f.st==='cur'?'style="color:var(--blue-500)"':''}>${f.time}</span></div></div>`).join('')}</div>
      </div>
    </div>
    <div class="md-foot">
      <button class="btn btn-default" onclick="apprAct(${m.id},'转交')">转交</button>
      <button class="btn btn-danger" onclick="apprAct(${m.id},'驳回')">驳回</button>
      <button class="btn btn-primary" onclick="apprAct(${m.id},'同意')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>同意</button>
    </div>`;
}
function apprAct(id,t){
  const m=MSGS.find(x=>x.id===id);
  toast('已'+t+'：'+(m?m.approval.applicant+' 的'+m.approval.type:''));
  // 处理后从待办移除
  if(t==='同意'||t==='驳回'){MSGS=MSGS.filter(x=>x.id!==id);curMsgId=null;renderCats();renderList();renderDetail();}
}
function renderNotice(d,m){
  const n=m.notice;
  const c=CATMAP[m.cat];
  const badge={cc:'<span class="tag tag-blue">抄送知会</span>',system:'<span class="tag tag-orange">系统公告</span>',org:'<span class="tag tag-green">组织动态</span>',result:'<span class="tag tag-green"><span class="dot"></span>审批结果</span>'}[n.kind]||'';
  d.innerHTML=`
    <div class="md-head">${msgIcon(m,true)}<div><h3>${m.title}</h3><div class="mh-sub">${badge}<span>${m.day==='today'?'今天':m.day==='yesterday'?'昨天':''} ${m.time}</span></div></div></div>
    <div class="md-body">
      <div class="notice-card">${n.content.map(p=>`<p>${p}</p>`).join('')}
        ${n.kv?`<div class="notice-meta"></div>`:''}
      </div>
      ${n.kv?`<div class="notice-kv"><div class="kv">${n.kv.map(([k,v])=>`<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div></div>`:''}
      ${n.link?`<div style="margin-top:16px"><button class="btn btn-default" onclick="toast('演示原型：跳转到「${n.link}」')">${n.link} →</button></div>`:''}
    </div>`;
}
function renderChat(d,m){
  const ch=m.chat;
  d.innerHTML=`
    <div class="md-head">${msgIcon(m,true)}<div><h3>${m.from}</h3><div class="mh-sub"><span class="tag tag-purple">@ 提及</span><span>${ch.ctx}</span></div></div></div>
    <div class="chat-body" id="chatBody">
      <div class="chat-context">${ch.ctx}</div>
      ${ch.msgs.map((b,i)=>bubbleHtml(b,i,m.id)).join('')}
    </div>
    <div class="composer">
      <div id="replyBar"></div>
      <div class="composer-tools">
        <span class="ct-btn" title="表情" onclick="toggleEmoji(event,${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg></span>
        <span class="ct-btn" title="发送图片" onclick="sendImage(${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>
        <span class="ct-btn" title="@ 成员" onclick="toast('演示原型：@ 选择成员')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/></svg></span>
        <div class="emoji-pop" id="emojiPop"></div>
      </div>
      <div class="composer-box">
        <textarea id="chatInput" rows="1" placeholder="回复 ${m.from}…" oninput="autoGrow(this)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat(${m.id});}"></textarea>
        <button class="btn btn-primary" onclick="sendChat(${m.id})">发送</button>
      </div>
    </div>`;
  renderReplyBar(m.id);
  const cb=$('chatBody');if(cb)cb.scrollTop=cb.scrollHeight;
}
function bubbleHtml(b,idx,mid){
  if(b.recalled){const who=b.me?'你':b.nm;return `<div class="recall-row">${who}撤回了一条消息</div>`;}
  const quote=b.quote?`<div class="quote-in"><span class="qn">${b.quote.nm}</span><span class="qt">${b.quote.text}</span></div>`:'';
  const content=b.image
    ? `<div class="bubble img-bubble"><img src="${b.image}" alt="图片" /></div>`
    : `<div class="bubble">${quote}${escapeHtml(b.text)}</div>`;
  const reactions=(b.reactions&&b.reactions.length)?`<div class="reactions">${b.reactions.map(r=>`<span class="reaction ${r.mine?'mine':''}" onclick="toggleReaction(${mid},${idx},'${r.e}')">${r.e}<span class="rc">${r.n}</span></span>`).join('')}</div>`:'';
  const tools=`<div class="bubble-tools">
    <span class="bt-btn" title="回复" onclick="startReply(${mid},${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 17l-5-5 5-5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/></svg></span>
    <span class="bt-btn" title="表情回应" onclick="reactPop(event,${mid},${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/></svg></span>
    <span class="bt-btn" title="添加任务" onclick="addTaskFromMsg(${mid},${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>
    ${b.me?`<span class="bt-btn" title="撤回" onclick="recallMsg(${mid},${idx})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg></span>`:''}
  </div>`;
  return `<div class="bubble-row ${b.me?'me':''}">
    <span class="bubble-av" style="background:${avaColor(b.nm)}">${b.nm.slice(-1)}</span>
    <div class="bubble-wrap">${b.me?'':`<span class="bubble-name">${b.nm}</span>`}<div class="bubble-line">${content}${tools}</div>${reactions}<span class="bubble-time">${b.time}</span></div>
  </div>`;
}
function escapeHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function autoGrow(t){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,120)+'px';}
function nowHM(){const n=new Date();return String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');}
function sendChat(id){
  const m=MSGS.find(x=>x.id===id);const inp=$('chatInput');
  const v=inp.value.trim();if(!v)return;
  const msg={me:true,nm:'张伟',text:v,time:nowHM()};
  if(replyTarget&&replyTarget.mid===id){const q=m.chat.msgs[replyTarget.idx];msg.quote={nm:q.me?'张伟':q.nm,text:q.image?'[图片]':q.text};}
  m.chat.msgs.push(msg);
  m.preview='我：'+(v.length>16?v.slice(0,16)+'…':v);
  replyTarget=null;
  renderChat($('msgDetail'),m);renderList();
}
function sendImage(id){
  const m=MSGS.find(x=>x.id===id);
  // 演示：插入一张占位示意图（SVG dataURL）
  const colors=['#3370FF','#2EA121','#D97A00','#7A4FE0'];const c=colors[m.chat.msgs.length%4];
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='220' height='150'><rect width='220' height='150' fill='${c}' opacity='0.12'/><circle cx='60' cy='55' r='18' fill='${c}' opacity='0.5'/><path d='M30 130 L90 80 L130 115 L165 85 L195 130 Z' fill='${c}' opacity='0.45'/></svg>`;
  const url='data:image/svg+xml;utf8,'+encodeURIComponent(svg);
  m.chat.msgs.push({me:true,nm:'张伟',image:url,time:nowHM()});
  m.preview='我：[图片]';replyTarget=null;
  renderChat($('msgDetail'),m);renderList();
}

/* 引用回复 */
let replyTarget=null;
function startReply(mid,idx){replyTarget={mid,idx};renderReplyBar(mid);const i=$('chatInput');if(i)i.focus();}
function cancelReply(){replyTarget=null;renderReplyBar();}
function renderReplyBar(mid){
  const bar=$('replyBar');if(!bar)return;
  if(!replyTarget){bar.innerHTML='';return;}
  const m=MSGS.find(x=>x.id===replyTarget.mid);const b=m.chat.msgs[replyTarget.idx];
  const who=b.me?'张伟':b.nm;const txt=b.image?'[图片]':b.text;
  bar.innerHTML=`<div class="reply-bar"><div class="rb-main"><span class="rb-n">回复 ${who}</span><div class="rb-t">${escapeHtml(txt)}</div></div><span class="rb-x" onclick="cancelReply()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></span></div>`;
}
/* 撤回 */
function recallMsg(mid,idx){const m=MSGS.find(x=>x.id===mid);m.chat.msgs[idx].recalled=true;renderChat($('msgDetail'),m);renderList();toast('已撤回');}
/* 表情回应 */
function toggleReaction(mid,idx,e){
  const m=MSGS.find(x=>x.id===mid);const b=m.chat.msgs[idx];b.reactions=b.reactions||[];
  let r=b.reactions.find(x=>x.e===e);
  if(r){if(r.mine){r.n--;r.mine=false;if(r.n<=0)b.reactions=b.reactions.filter(x=>x.e!==e);}else{r.n++;r.mine=true;}}
  else b.reactions.push({e,n:1,mine:true});
  renderChat($('msgDetail'),m);
}
let reactCtx=null;
function reactPop(ev,mid,idx){
  ev.stopPropagation();reactCtx={mid,idx,mode:'react'};
  showEmojiAt(ev.currentTarget);
}
function toggleEmoji(ev,mid){
  ev.stopPropagation();reactCtx={mid,mode:'input'};
  showEmojiAt(ev.currentTarget);
}
const EMOJIS=['👍','❤️','😄','🎉','👏','🙏','😀','😅','🤝','💪','🔥','✅','⭐','😮','😢','🤔','👌','💯','☕','🚀'];
function showEmojiAt(anchor){
  const pop=$('emojiPop');
  pop.innerHTML=`<div class="emoji-grid">${EMOJIS.map(e=>`<span onclick="pickEmoji('${e}')">${e}</span>`).join('')}</div>`;
  pop.classList.add('open');
  // 定位：在工具栏内相对定位
  pop.style.bottom='38px';pop.style.left='0';
}
function pickEmoji(e){
  if(!reactCtx){return;}
  if(reactCtx.mode==='react'){toggleReaction(reactCtx.mid,reactCtx.idx,e);closeEmoji();}
  else{const inp=$('chatInput');if(inp){inp.value+=e;inp.focus();autoGrow(inp);}closeEmoji();}
}
function closeEmoji(){const p=$('emojiPop');if(p)p.classList.remove('open');reactCtx=null;}

/* ========== 列表操作 ========== */
function markRead(id){const m=MSGS.find(x=>x.id===id);if(m){m.unread=false;renderCats();renderList();}}
function markAllRead(){MSGS.forEach(m=>{if(curCat==='all'||m.cat===curCat)m.unread=false;});renderCats();renderList();toast('已全部标记为已读');}
function archiveMsg(id){MSGS=MSGS.filter(m=>m.id!==id);if(curMsgId===id)curMsgId=null;renderCats();renderList();renderDetail();toast('已归档');}
function delMsg(id){MSGS=MSGS.filter(m=>m.id!==id);if(curMsgId===id)curMsgId=null;renderCats();renderList();renderDetail();toast('已删除');}
function toggleUnreadOnly(){unreadOnly=!unreadOnly;$('unreadSw').classList.toggle('on',unreadOnly);renderList();}
function onSearch(v){searchQ=v;renderList();}
/* 全局搜索：本页（会话/消息）实时来源 */
window.gsLocalProvider=function(q){
  if(!q||!q.trim())return [];
  q=q.trim();
  return MSGS.filter(function(m){return m.title.indexOf(q)>=0||(m.preview&&m.preview.indexOf(q)>=0)||(m.from&&m.from.indexOf(q)>=0);})
    .slice(0,5).map(function(m){return {title:m.title,sub:m.preview||'',id:m.id};});
};
window.gsLocalPick=function(id){openMsg(id);};

/* ========== 通知设置 ========== */
const SET_ITEMS=[
  {key:'approval',name:'待办审批',desc:'有审批待你处理时提醒',cat:'approval'},
  {key:'mention',name:'@ 我的',desc:'有人在讨论中提及你',cat:'mention'},
  {key:'cc',name:'抄送知会',desc:'审批 / 文件抄送给你',cat:'cc'},
  {key:'system',name:'系统公告',desc:'维护、升级、安全提醒',cat:'system'},
  {key:'org',name:'组织动态',desc:'成员 / 部门变更',cat:'org'},
];
function openSettings(){
  $('setBody').innerHTML=`
    <div class="set-sec">消息类型</div>
    ${SET_ITEMS.map(it=>{const c=CATMAP[it.cat];return `<div class="set-row">
      <span class="si" style="background:${c.bg}"><svg viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${c.ic}</svg></span>
      <div><div class="st">${it.name}</div><div class="sd">${it.desc}</div></div>
      <span class="switch ${settings[it.key]?'on':''}" onclick="toggleSet('${it.key}',this)"><span class="track"></span></span>
    </div>`;}).join('')}
    <div class="set-sec">免打扰</div>
    <div class="set-row">
      <span class="si" style="background:var(--fill-2)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6z"/><path d="M9 21a3 3 0 0 0 6 0"/></svg></span>
      <div><div class="st">勿扰模式</div><div class="sd">开启后仅保留红点，不弹出提醒</div></div>
      <span class="switch ${settings.dnd?'on':''}" onclick="toggleSet('dnd',this)"><span class="track"></span></span>
    </div>
    <div class="set-row" style="border-bottom:0">
      <span class="si" style="background:var(--fill-2)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
      <div><div class="st">免打扰时段</div><div class="sd">每日 22:00 – 次日 08:00</div></div>
      <div class="right-val"><span style="font-size:13px;color:var(--ink-3)">22:00–08:00</span></div>
    </div>`;
  $('scrim').classList.add('open');$('drawer').classList.add('open');
}
function closeSettings(){$('scrim').classList.remove('open');$('drawer').classList.remove('open');}
function toggleSet(key,el){settings[key]=!settings[key];el.classList.toggle('on',settings[key]);toast((settings[key]?'已开启 · ':'已关闭 · ')+ (key==='dnd'?'勿扰模式':SET_ITEMS.find(i=>i.key===key).name));}

/* ========== 从消息创建任务 ========== */
let ctSource=null;
function addTaskFromMsg(mid,idx){
  const m=MSGS.find(x=>x.id===mid);if(!m||!m.chat)return;
  const b=m.chat.msgs[idx];
  const text=b.image?'[图片]':(b.text||'');
  ctSource={from:b.me?'我':b.nm, ctx:m.chat.ctx||m.title||'会话', text};
  $('ctTitle').value=text;
  $('ctDue').value='';
  $('ctSrc').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div>来自${ctSource.ctx} · ${ctSource.from}：<span class="src-q">${escapeHtml(ctSource.text).slice(0,40)}${ctSource.text.length>40?'…':''}</span></div>`;
  $('ctScrim').classList.add('open');
  setTimeout(()=>{const t=$('ctTitle');t.focus();t.setSelectionRange(t.value.length,t.value.length);},50);
}
function closeCreateTask(){$('ctScrim').classList.remove('open');ctSource=null;}
function confirmCreateTask(){
  const title=$('ctTitle').value.trim();
  if(!title){$('ctTitle').focus();toast('请输入任务标题');return;}
  const task={id:'msg'+Date.now(),title,due:$('ctDue').value||'',source:ctSource?{from:ctSource.from,ctx:ctSource.ctx,text:ctSource.text}:null,createdAt:new Date().toISOString()};
  try{
    const key='todo_inbox_from_msg';
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    arr.push(task);localStorage.setItem(key,JSON.stringify(arr));
  }catch(e){}
  closeCreateTask();
  toast('已创建任务，可在「我的待办 · 收集箱」查看');
}

/* ========== toast ========== */
let toastTimer;
function toast(msg){const t=$('toast');$('toastMsg').textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('ctScrim').classList.contains('open'))closeCreateTask();else if($('emojiPop')&&$('emojiPop').classList.contains('open'))closeEmoji();else if($('replyBar')&&replyTarget)cancelReply();else if($('drawer').classList.contains('open'))closeSettings();}});
document.addEventListener('click',e=>{const p=$('emojiPop');if(p&&p.classList.contains('open')&&!p.contains(e.target)&&!e.target.closest('.ct-btn')&&!e.target.closest('.bt-btn'))closeEmoji();});

/* ========== 初始化 ========== */
renderCats();renderList();
openMsg(1); // 默认选中首条
