/* ========== 数据 ========== */
// 头像配色（按姓名稳定取色）
const AVA_COLORS=['#3370FF','#2EA121','#D97A00','#7A4FE0','#0A8B9E','#E0457B','#245BDB','#C26A00'];
function avaColor(name){let s=0;for(const c of name)s+=c.charCodeAt(0);return AVA_COLORS[s%AVA_COLORS.length];}
function last(name){return name.slice(-1);}

// 角色 -> 颜色编码
const ROLE_STYLE={
  '系统管理员':'tag-red','部门主管':'tag-purple','审批人':'tag-blue','财务':'tag-cyan',
  'HR':'tag-orange','普通成员':'tag-gray'
};
const ALL_ROLES=Object.keys(ROLE_STYLE);

// 部门树（含编码、负责人、状态）
const DEPTS={
  id:'all',name:'全公司',code:'ROOT',leader:null,status:'on',children:[
    {id:'tech',name:'研发中心',code:'D-TECH',leader:'吴昊',status:'on',children:[
      {id:'fe',name:'前端组',code:'D-FE',leader:'卢伟',status:'on',children:[]},
      {id:'be',name:'后端组',code:'D-BE',leader:'郑凯',status:'on',children:[]},
      {id:'sec',name:'信息安全组',code:'D-SEC',leader:'马涛',status:'on',children:[]},
    ]},
    {id:'ops',name:'平台运营组',code:'D-OPS',leader:'李娜',status:'on',children:[]},
    {id:'fin',name:'财务部',code:'D-FIN',leader:'赵敏',status:'on',children:[]},
    {id:'hr',name:'人力资源部',code:'D-HR',leader:'许静',status:'on',children:[]},
    {id:'legal',name:'法务部',code:'D-LEGAL',leader:'冯磊',status:'off',children:[]},
  ]
};

// 成员
let MEMBERS=[
  {id:1,name:'吴昊',no:'E0001',acct:'wu.hao',dept:'tech',deptName:'研发中心',title:'研发总监',phone:'138 0011 0001',email:'wu.hao@corp.com',status:'在职',roles:['部门主管','审批人'],first:false},
  {id:2,name:'卢伟',no:'E0002',acct:'lu.wei',dept:'fe',deptName:'前端组',title:'前端负责人',phone:'138 0011 0002',email:'lu.wei@corp.com',status:'在职',roles:['部门主管'],first:false},
  {id:3,name:'孙琳',no:'E0003',acct:'sun.lin',dept:'fe',deptName:'前端组',title:'高级前端工程师',phone:'138 0011 0003',email:'sun.lin@corp.com',status:'在职',roles:['普通成员'],first:false,presence:{type:'休假中',start:'2026-06-01',end:'2026-06-05',reason:'年假'}},
  {id:4,name:'郑凯',no:'E0004',acct:'zheng.kai',dept:'be',deptName:'后端组',title:'后端负责人',phone:'138 0011 0004',email:'zheng.kai@corp.com',status:'在职',roles:['部门主管'],first:false},
  {id:5,name:'马涛',no:'E0005',acct:'ma.tao',dept:'sec',deptName:'信息安全组',title:'安全负责人',phone:'138 0011 0005',email:'ma.tao@corp.com',status:'在职',roles:['部门主管','系统管理员'],first:false},
  {id:6,name:'李娜',no:'E0006',acct:'li.na',dept:'ops',deptName:'平台运营组',title:'运营经理',phone:'138 0011 0006',email:'li.na@corp.com',status:'在职',roles:['部门主管','审批人'],first:false},
  {id:7,name:'张伟',no:'E0007',acct:'zhang.wei',dept:'ops',deptName:'平台运营组',title:'运营专员',phone:'138 0011 0007',email:'zhang.wei@corp.com',status:'在职',roles:['系统管理员'],first:false},
  {id:8,name:'林晓',no:'E0008',acct:'lin.xiao',dept:'ops',deptName:'平台运营组',title:'运营专员',phone:'138 0011 0008',email:'lin.xiao@corp.com',status:'在职',roles:['普通成员'],first:true,presence:{type:'请假中',start:'2026-06-03',end:'2026-06-03',reason:'事假'}},
  {id:9,name:'赵敏',no:'E0009',acct:'zhao.min',dept:'fin',deptName:'财务部',title:'财务经理',phone:'138 0011 0009',email:'zhao.min@corp.com',status:'在职',roles:['部门主管','财务','审批人'],first:false},
  {id:10,name:'郑爽',no:'E0010',acct:'zheng.shuang',dept:'fin',deptName:'财务部',title:'会计',phone:'138 0011 0010',email:'zheng.shuang@corp.com',status:'在职',roles:['财务'],first:false},
  {id:11,name:'许静',no:'E0011',acct:'xu.jing',dept:'hr',deptName:'人力资源部',title:'HR 经理',phone:'138 0011 0011',email:'xu.jing@corp.com',status:'在职',roles:['部门主管','HR'],first:false},
  {id:12,name:'何强',no:'E0012',acct:'he.qiang',dept:'hr',deptName:'人力资源部',title:'招聘专员',phone:'138 0011 0012',email:'he.qiang@corp.com',status:'停用',roles:['HR'],first:false},
  {id:13,name:'冯磊',no:'E0013',acct:'feng.lei',dept:'legal',deptName:'法务部',title:'法务顾问',phone:'138 0011 0013',email:'feng.lei@corp.com',status:'在职',roles:['审批人'],first:false},
  {id:14,name:'高敏',no:'E0014',acct:'gao.min',dept:'be',deptName:'后端组',title:'后端工程师',phone:'138 0011 0014',email:'gao.min@corp.com',status:'在职',roles:['普通成员'],first:false,presence:{type:'出差中',start:'2026-06-02',end:'2026-06-04',reason:'上海客户现场'}},
  {id:15,name:'周涛',no:'E0015',acct:'zhou.tao',dept:'be',deptName:'后端组',title:'后端工程师',phone:'138 0011 0015',email:'zhou.tao@corp.com',status:'离职',roles:['普通成员'],first:false},
  {id:16,name:'陈杰',no:'E0016',acct:'chen.jie',dept:'fe',deptName:'前端组',title:'前端工程师',phone:'138 0011 0016',email:'chen.jie@corp.com',status:'在职',roles:['普通成员'],first:false,presence:{type:'出差中',start:'2026-05-20',end:null,reason:'深圳长期驻场'}},
];

/* ========== 工具 ========== */
const $=id=>document.getElementById(id);
let toastTimer;
function toast(msg){const t=$('toast');$('toastMsg').textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}
function av(name,size){const c=avaColor(name);return `<span class="pav" style="background:${c}">${last(name)}</span>`;}
// 收集某部门（含子部门）所有成员
function descIds(node){let ids=[node.id];(node.children||[]).forEach(c=>ids=ids.concat(descIds(c)));return ids;}
function findDept(id,node){node=node||DEPTS;if(node.id===id)return node;for(const c of(node.children||[])){const r=findDept(id,c);if(r)return r;}return null;}
function deptMemberCount(id){const node=findDept(id);if(!node)return 0;const ids=descIds(node);return MEMBERS.filter(m=>ids.includes(m.dept)).length;}

/* ========== Tab ========== */
function switchTab(el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  const t=el.dataset.tab;
  $('viewMember').classList.toggle('active',t==='member');
  $('viewDept').classList.toggle('active',t==='dept');
  if(t==='dept')renderDeptMgr();
}

/* ========== 部门树（成员管理左侧） ========== */
let curDept='all';
let treeOpen={all:true,tech:true};
function renderTree(){
  const q=($('treeSearch').value||'').trim();
  $('treeCnt').textContent='共 '+MEMBERS.length+' 人';
  $('treeBody').innerHTML=treeNodeHtml(DEPTS,0,q);
}
function treeNodeHtml(node,depth,q){
  const hasChild=(node.children||[]).length>0;
  const open=treeOpen[node.id]||!!q;
  const cnt=deptMemberCount(node.id);
  const match=!q||node.name.indexOf(q)>=0;
  // 子节点
  let childHtml='';
  if(hasChild){childHtml=node.children.map(c=>treeNodeHtml(c,depth+1,q)).join('');}
  // 搜索时：自己不匹配且无匹配子节点则隐藏
  if(q&&!match&&!childHtml)return '';
  const arrow=hasChild
    ? `<span class="tn-arrow ${open?'open':''}" onclick="event.stopPropagation();toggleTree('${node.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg></span>`
    : `<span class="tn-arrow leaf"></span>`;
  const icon=node.id==='all'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>`;
  const off=node.status==='off'?'<span class="tn-off" title="已停用"></span>':'';
  const row=`<div class="tn-row ${curDept===node.id?'active':''}" style="padding-left:${4+depth*16}px" onclick="selectDept('${node.id}')">
    ${arrow}<span class="tn-icon">${icon}</span><span class="tn-label">${node.name}</span>${off}<span class="tn-count">${cnt}</span>
  </div>`;
  return `<div class="tn-node">${row}${hasChild?`<div class="tn-children" style="display:${open?'block':'none'}">${childHtml}</div>`:''}</div>`;
}
function toggleTree(id){treeOpen[id]=!treeOpen[id];renderTree();}
function selectDept(id){curDept=id;selected.clear();renderTree();renderPresenceStrip();renderMembers();}

/* ========== 成员表格 ========== */
let selected=new Set();
let presenceFilter='all';
/* 在位状态：由时间区间 + 今天 计算 */
const TODAY=new Date(2026,5,3); // 2026-06-03
const PRES_META={
  '在岗':{dot:'var(--success)',cls:'pres-on'},
  '请假中':{dot:'var(--warning)',cls:'pres-leave',ic:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'},
  '休假中':{dot:'var(--cyan)',cls:'pres-vac',ic:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'},
  '出差中':{dot:'var(--purple)',cls:'pres-trip',ic:'<path d="M2 16l9-3 9 3M11 13V4a1.5 1.5 0 0 1 3 0v9M5 19h14"/>'}
};
function dOnly(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function mdShort(s){const d=new Date(s);return (d.getMonth()+1)+'/'+d.getDate();}
function computePresence(m){
  if(m.status!=='在职')return {key:'na'};
  const p=m.presence;if(!p)return {key:'在岗'};
  const t=dOnly(TODAY);
  const s=p.start?dOnly(new Date(p.start)):null;
  const e=p.end?dOnly(new Date(p.end)):null;
  if(s&&t<s)return {key:'在岗'};        // 尚未开始
  if(e&&t>e)return {key:'在岗'};        // 已过期自动恢复
  let range;
  if(p.start&&p.end)range=(p.start===p.end)?mdShort(p.start):mdShort(p.start)+'–'+mdShort(p.end);
  else if(p.start)range=mdShort(p.start)+' 起';
  return {key:p.type,range,reason:p.reason};
}
function presenceCell(m){
  const r=computePresence(m);
  if(r.key==='na')return '<span class="dim">—</span>';
  if(r.key==='在岗')return '<span class="pres-on"><span class="d"></span>在岗</span>';
  const meta=PRES_META[r.key];
  return `<span class="pres-tag ${meta.cls}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${meta.ic}</svg>${r.key}</span>${r.range?`<div class="pres-range">${r.range}</div>`:''}`;
}
function visibleMembers(){
  const node=findDept(curDept)||DEPTS;
  const ids=descIds(node);
  let list=MEMBERS.filter(m=>ids.includes(m.dept));
  const q=($('memSearch').value||'').trim();
  if(q)list=list.filter(m=>m.name.indexOf(q)>=0||m.no.toLowerCase().indexOf(q.toLowerCase())>=0||m.phone.replace(/\s/g,'').indexOf(q)>=0||m.acct.indexOf(q)>=0);
  const st=$('fStatus').dataset.value;
  if(st&&st!=='全部状态')list=list.filter(m=>m.status===st);
  if(presenceFilter!=='all')list=list.filter(m=>computePresence(m).key===presenceFilter);
  return list;
}
function statusTag(s){
  if(s==='在职')return '<span class="tag tag-green"><span class="dot"></span>在职</span>';
  if(s==='停用')return '<span class="tag tag-gray"><span class="dot"></span>停用</span>';
  return '<span class="tag tag-red"><span class="dot"></span>离职</span>';
}
function roleTags(roles){return '<div class="roles">'+roles.map(r=>`<span class="tag ${ROLE_STYLE[r]||'tag-gray'}">${r}</span>`).join('')+'</div>';}
/* 在位状态统计 chips */
function presenceCounts(){
  const node=findDept(curDept)||DEPTS;const ids=descIds(node);
  const base=MEMBERS.filter(m=>ids.includes(m.dept)&&m.status==='在职');
  const c={'在岗':0,'请假中':0,'休假中':0,'出差中':0};
  base.forEach(m=>{const k=computePresence(m).key;if(c[k]!=null)c[k]++;});
  c.all=base.length;return c;
}
function renderPresenceStrip(){
  const c=presenceCounts();
  const items=[['all','全部',null],['在岗','在岗','var(--success)'],['请假中','请假中','var(--warning)'],['休假中','休假中','var(--cyan)'],['出差中','出差中','var(--purple)']];
  $('presenceStrip').innerHTML=items.map(([k,label,color])=>`<div class="pchip ${presenceFilter===k?'active':''}" onclick="setPresenceFilter('${k}')">${color?`<span class="pd" style="background:${color}"></span>`:''}${label} <b>${k==='all'?c.all:c[k]}</b></div>`).join('');
}
function setPresenceFilter(k){presenceFilter=(presenceFilter===k&&k!=='all')?'all':k;renderPresenceStrip();renderMembers();}
function renderMembers(){
  const node=findDept(curDept)||DEPTS;
  $('curDeptName').textContent=node.name;
  const list=visibleMembers();
  $('curDeptSub').textContent='· '+list.length+' 名成员';
  $('pagerTotal').textContent=list.length;
  const tb=$('memBody');
  if(!list.length){
    tb.innerHTML=`<tr class="empty-row"><td colspan="9"><div class="tbl-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M19 8v6M22 11h-6"/></svg><div class="et">该部门暂无成员</div><div class="es">可点击右上角「添加成员」或调整筛选条件</div></div></td></tr>`;
    refreshSel();return;
  }
  tb.innerHTML=list.map(m=>`
    <tr data-id="${m.id}" onclick="openDetail(${m.id})" class="${selected.has(m.id)?'sel':''}">
      <td class="col-chk" onclick="event.stopPropagation()"><span class="chk ${selected.has(m.id)?'on':''}" onclick="toggleRow(${m.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg></span></td>
      <td><div class="person">${av(m.name)}<div><div class="pn">${m.name}${m.first?' <span class="tag tag-orange" style="margin-left:4px">待激活</span>':''}</div><div class="pno">${m.no}</div></div></div></td>
      <td><span class="mono">${m.acct}</span></td>
      <td><div>${m.deptName}</div><div class="dim" style="font-size:12px">${m.title}</div></td>
      <td>${presenceCell(m)}</td>
      <td>${roleTags(m.roles)}</td>
      <td><div class="contact"><div class="ph">${m.phone}</div><div class="em">${m.email}</div></div></td>
      <td>${statusTag(m.status)}</td>
      <td onclick="event.stopPropagation()"><div class="ops">
        <button class="btn btn-text btn-sm" onclick="openDetail(${m.id})">详情</button>
        <button class="btn btn-text btn-sm" onclick="openMemberForm(${m.id})">编辑</button>
        <button class="btn btn-text btn-sm muted" onclick="openMore(${m.id},event)">更多</button>
      </div></td>
    </tr>`).join('');
  refreshSel();
}
function refreshSel(){
  const list=visibleMembers();
  const ids=list.map(m=>m.id);
  const selCount=ids.filter(i=>selected.has(i)).length;
  $('selInfo').style.display=selCount>0?'':'none';
  $('batchActions').style.display=selCount>0?'flex':'none';
  $('tblTitle').style.display=selCount>0?'none':'';
  if(selCount>0)$('selInfo').querySelector('b').textContent=selCount;
  $('chkAll').classList.toggle('on',selCount===ids.length&&ids.length>0);
}
function toggleRow(id){selected.has(id)?selected.delete(id):selected.add(id);renderMembers();}
function toggleAll(){const ids=visibleMembers().map(m=>m.id);const allOn=ids.every(i=>selected.has(i))&&ids.length>0;if(allOn)ids.forEach(i=>selected.delete(i));else ids.forEach(i=>selected.add(i));renderMembers();}
function clearSel(){selected.clear();renderMembers();}
function batchAct(t){
  const n=selected.size;
  if(t==='调整部门'){
    const deptOptions=flatDeptNames();
    openModal({
      title:'调整部门',
      sub:'将选中的 '+n+' 名成员移动到指定部门',
      icon:'edit',
      body:`<div class="blk"><label class="fl"><span class="req">*</span>目标部门</label><div class="cs" id="mMoveDept" data-options="${deptOptions.opts}" data-ph="请选择目标部门"></div></div>`,
      confirm:'确认调整',
      onok:()=>{
        const dn=$('mMoveDept').dataset.value;
        if(!dn){toast('请选择目标部门');return false;}
        const node=(function find(nd){if(nd.name===dn&&nd.id!=='all')return nd;for(const c of(nd.children||[])){const r=find(c);if(r)return r;}return null;})(DEPTS);
        MEMBERS.forEach(m=>{if(selected.has(m.id)){m.dept=node?node.id:m.dept;m.deptName=dn;}});
        selected.clear();renderTree();renderPresenceStrip();renderMembers();
        toast('已将 '+n+' 名成员调整至「'+dn+'」');
      }
    });
    return;
  }
  if(t==='停用'){
    openModal({
      title:'批量停用账号',
      sub:'确认停用选中的 '+n+' 名成员的账号？停用后对方将无法登录。',
      icon:'danger',danger:true,confirm:'确认停用',
      onok:()=>{MEMBERS.forEach(m=>{if(selected.has(m.id))m.status='停用';});selected.clear();renderPresenceStrip();renderMembers();toast('已停用 '+n+' 名成员');}
    });
    return;
  }
  toast('已对 '+n+' 名成员执行「'+t+'」');selected.clear();renderMembers();
}

/* ========== 成员详情抽屉 ========== */
function openDetail(id){
  const m=MEMBERS.find(x=>x.id===id);if(!m)return;
  $('dwTitle').textContent='成员详情';
  $('dwBody').innerHTML=`
    <div class="profile">
      <span class="pbig" style="background:${avaColor(m.name)}">${last(m.name)}</span>
      <div><div class="pn">${m.name}</div><div class="pmeta"><span>${m.title}</span><span>·</span><span>${m.deptName}</span>${statusTag(m.status)}</div></div>
    </div>
    <div class="d-sec"><div class="st">账号信息</div>
      <div class="kv"><div class="k">工号</div><div class="v mono">${m.no}</div>
        <div class="k">登录账号</div><div class="v mono">${m.acct}</div>
        <div class="k">首次登录</div><div class="v">${m.first?'<span class="tag tag-orange">需修改密码</span>':'已完成初始化'}</div></div>
    </div>
    <div class="d-sec"><div class="st">在位状态<button class="btn btn-text btn-sm" style="margin-left:auto" onclick="openPresenceModal(${m.id})">调整</button></div>
      ${presenceDetailHtml(m)}
    </div>
    <div class="d-sec"><div class="st">组织与角色</div>
      <div class="kv"><div class="k">所属部门</div><div class="v">${m.deptName}</div>
        <div class="k">职位</div><div class="v">${m.title}</div>
        <div class="k">角色</div><div class="v">${roleTags(m.roles)}</div></div>
    </div>
    <div class="d-sec"><div class="st">联系方式</div>
      <div class="kv"><div class="k">手机</div><div class="v">${m.phone}</div>
        <div class="k">邮箱</div><div class="v">${m.email}</div></div>
    </div>`;
  $('dwFoot').innerHTML=`
    <button class="btn btn-default" onclick="resetPwd(${m.id})">重置密码</button>
    <button class="btn ${m.status==='在职'?'btn-default':'btn-default'}" onclick="toggleStatus(${m.id})">${m.status==='在职'?'停用账号':'启用账号'}</button>
    <button class="btn btn-primary" onclick="openMemberForm(${m.id})">编辑</button>`;
  openDrawer();
}
function openDrawer(){$('scrim').classList.add('open');$('drawer').classList.add('open');}
function presenceDetailHtml(m){
  const r=computePresence(m);
  if(r.key==='na')return '<div class="pres-detail"><div class="pi" style="background:var(--fill-3)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-4)" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></div><div><div class="pt" style="color:var(--ink-4)">不适用</div><div class="psub">账号已'+m.status+'</div></div></div>';
  if(r.key==='在岗')return '<div class="pres-detail"><div class="pi" style="background:var(--success-bg)"><svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div><div><div class="pt">在岗</div><div class="psub">当前正常出勤</div></div></div>';
  const meta=PRES_META[r.key];const bg={'请假中':'var(--warning-bg)','休假中':'var(--cyan-bg)','出差中':'var(--purple-bg)'}[r.key];
  return `<div class="pres-detail"><div class="pi" style="background:${bg}"><svg viewBox="0 0 24 24" fill="none" stroke="${meta.dot}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${meta.ic}</svg></div><div><div class="pt">${r.key}</div><div class="psub">${r.range?'时间 '+r.range:''}${r.reason?' · '+r.reason:''}</div></div></div>`;
}
function openPresenceModal(id){
  const m=MEMBERS.find(x=>x.id===id);if(!m)return;
  const p=m.presence||{};
  openModal({
    title:'调整在位状态',icon:'edit',
    sub:'设置「'+m.name+'」的在位状态；选择"在岗"即清除当前状态。',
    body:`<div class="blk"><label class="fl">在位状态</label><div class="cs" id="pmType" data-options="在岗||请假中||休假中||出差中" data-value="${m.presence?m.presence.type:'在岗'}"></div></div>
      <div class="blk"><div style="display:flex;gap:12px">
        <div style="flex:1"><label class="fl">开始日期</label><input type="date" class="input" id="pmStart" value="${p.start||''}" /></div>
        <div style="flex:1"><label class="fl">结束日期 <span style="color:var(--ink-4);font-weight:400">（可空=长期）</span></label><input type="date" class="input" id="pmEnd" value="${p.end||''}" /></div>
      </div><div class="hint" style="font-size:12px;color:var(--ink-4);margin-top:7px">状态将按起止时间自动生效与恢复；结束日期留空表示长期，需手动恢复。</div></div>
      <div class="blk"><label class="fl">备注</label><input class="input" id="pmNote" value="${p.reason||''}" placeholder="如 年假 / 上海出差" /></div>`,
    confirm:'保存',
    onok:()=>{
      const type=$('pmType').dataset.value;
      if(type==='在岗'){m.presence=null;}
      else{const s=$('pmStart').value;if(!s){toast('请选择开始日期');return false;}m.presence={type,start:s,end:$('pmEnd').value||null,reason:$('pmNote').value.trim()};}
      renderPresenceStrip();renderMembers();
      if($('drawer').classList.contains('open'))openDetail(id);
      toast('已更新 '+m.name+' 的在位状态');
    }
  });
}
function closeDrawer(){$('scrim').classList.remove('open');$('drawer').classList.remove('open');}

function resetPwd(id){const m=MEMBERS.find(x=>x.id===id);openModal({title:'重置密码',sub:'将为「'+m.name+'」生成新的初始密码，对方下次登录需重新设置。',icon:'warn',confirm:'确认重置',onok:()=>{toast('已重置 '+m.name+' 的密码');}});}
function toggleStatus(id){const m=MEMBERS.find(x=>x.id===id);const to=m.status==='在职'?'停用':'在职';
  openModal({title:to+'账号',sub:'确认将「'+m.name+'」的账号状态调整为「'+to+'」？',icon:to==='停用'?'danger':'ok',confirm:'确认'+to,danger:to==='停用',onok:()=>{m.status=to;renderMembers();closeDrawer();toast('已'+to+' '+m.name);}});}
function openMore(id,e){e.stopPropagation();const m=MEMBERS.find(x=>x.id===id);toggleStatus(id);}

/* ========== 新增/编辑成员表单（抽屉） ========== */
let editingId=null;
let formRoles=[];
let formDept=null;
let formLeaderName=null;
function openMemberForm(id){
  editingId=id||null;
  const m=id?MEMBERS.find(x=>x.id===id):null;
  formRoles=m?[...m.roles]:['普通成员'];
  formDept=m?m.dept:'ops';
  $('dwTitle').textContent=m?'编辑成员':'添加成员';
  const deptOptions=flatDeptNames();
  $('dwBody').innerHTML=`
    <div class="frow">
      <div class="fld"><label><span class="req">*</span>姓名</label><input class="input" id="fName" value="${m?m.name:''}" placeholder="请输入姓名" /></div>
      <div class="fld"><label><span class="req">*</span>工号</label><input class="input" id="fNo" value="${m?m.no:''}" placeholder="如 E0017" /></div>
    </div>
    <div class="fld"><label><span class="req">*</span>登录账号</label><input class="input" id="fAcct" value="${m?m.acct:''}" placeholder="用于登录的账号" /></div>
    <div class="frow">
      <div class="fld"><label><span class="req">*</span>所属部门</label><div class="cs" id="fDept" data-options="${deptOptions.opts}" data-value="${m?m.deptName:'平台运营组'}"></div></div>
      <div class="fld"><label>职位</label><input class="input" id="fTitle" value="${m?m.title:''}" placeholder="如 前端工程师" /></div>
    </div>
    <div class="frow">
      <div class="fld"><label>手机</label><input class="input" id="fPhone" value="${m?m.phone:''}" placeholder="手机号" /></div>
      <div class="fld"><label>邮箱</label><input class="input" id="fEmail" value="${m?m.email:''}" placeholder="邮箱地址" /></div>
    </div>
    <div class="fld"><label>角色 <span style="color:var(--ink-4);font-weight:400">（可多选）</span></label><div class="role-pick" id="fRoles"></div></div>
    <div class="fld"><label>账号状态</label>
      <div class="switch ${(!m||m.status==='在职')?'on':''}" id="fStatusSw" onclick="this.classList.toggle('on')"><span class="track"></span><span class="sl">启用后成员可正常登录</span></div>
    </div>
    <div class="fld"><label>首次登录需修改密码</label>
      <div class="switch ${(!m||m.first)?'on':''}" id="fFirstSw" onclick="this.classList.toggle('on')"><span class="track"></span><span class="sl">开启后系统将生成初始密码</span></div>
    </div>`;
  $('dwFoot').innerHTML=`<button class="btn btn-default" onclick="closeDrawer()">取消</button><button class="btn btn-primary" onclick="saveMember()">${m?'保存':'确认添加'}</button>`;
  renderFormRoles();
  initSelects($('dwBody'));
  openDrawer();
}
function flatDeptNames(){
  const names=[];
  (function walk(n){if(n.id!=='all')names.push(n.name);(n.children||[]).forEach(walk);})(DEPTS);
  return {opts:names.join('||'),names};
}
function renderFormRoles(){
  $('fRoles').innerHTML=ALL_ROLES.map(r=>`<span class="role-opt ${formRoles.includes(r)?'on':''}" onclick="toggleRole('${r}')"><svg class="rk" viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg>${r}</span>`).join('');
}
function toggleRole(r){const i=formRoles.indexOf(r);if(i>=0)formRoles.splice(i,1);else formRoles.push(r);renderFormRoles();}
function saveMember(){
  const name=$('fName').value.trim();
  if(!name){$('fName').style.borderColor='var(--danger)';$('fName').focus();toast('请填写姓名');return;}
  const deptName=$('fDept').dataset.value;
  const node=(function find(n){if(n.name===deptName&&n.id!=='all')return n;for(const c of(n.children||[])){const r=find(c);if(r)return r;}return null;})(DEPTS);
  const on=$('fStatusSw').classList.contains('on');
  const first=$('fFirstSw').classList.contains('on');
  const data={name,no:$('fNo').value.trim()||'E----',acct:$('fAcct').value.trim()||'-',dept:node?node.id:'ops',deptName,title:$('fTitle').value.trim()||'—',phone:$('fPhone').value.trim()||'—',email:$('fEmail').value.trim()||'—',status:on?'在职':'停用',roles:formRoles.length?[...formRoles]:['普通成员'],first};
  if(editingId){Object.assign(MEMBERS.find(x=>x.id===editingId),data);toast('已保存 '+name+' 的信息');}
  else{data.id=Math.max(...MEMBERS.map(m=>m.id))+1;MEMBERS.push(data);toast('已添加成员 '+name);}
  closeDrawer();renderTree();renderMembers();$('memTotal').textContent=MEMBERS.length;
}

/* ========== 部门管理 ========== */
let deptOpen={all:true,tech:true};
function renderDeptMgr(){$('deptMgrBody').innerHTML=deptMgrRows(DEPTS,0);}
function deptMgrRows(node,depth){
  const hasChild=(node.children||[]).length>0;
  const open=deptOpen[node.id];
  const cnt=deptMemberCount(node.id);
  const arrow=hasChild
    ? `<span class="tn-arrow ${open?'open':''}" onclick="toggleDeptMgr('${node.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg></span>`
    : `<span class="tn-arrow leaf"></span>`;
  const icon=node.id==='all'
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>`;
  const leader=node.leader?`<div class="person" style="gap:7px">${av(node.leader)}<span style="font-size:13px;color:var(--ink-1)">${node.leader}</span></div>`:'<span class="dim">—</span>';
  const status=node.status==='on'?'<span class="tag tag-green"><span class="dot"></span>启用</span>':'<span class="tag tag-gray"><span class="dot"></span>停用</span>';
  const isRoot=node.id==='all';
  const row=`<div class="dept-row" style="padding-left:${16+depth*20}px">
    ${arrow}<span class="dept-name">${icon}${node.name}</span>
    <div class="dept-meta">
      <div class="dm col-leader">${leader}</div>
      <div class="dm col-code"><span class="lbl">${node.code}</span>${cnt} 人</div>
      <div class="dm col-status">${status}</div>
    </div>
    <div class="dr-acts">
      <button class="btn btn-text btn-sm" onclick="openDeptForm('${node.id}',true)" title="添加子部门"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg></button>
      ${isRoot?'':`<button class="btn btn-text btn-sm" onclick="openDeptForm('${node.id}')">编辑</button>`}
      ${isRoot?'':`<button class="btn btn-text btn-sm danger" onclick="delDept('${node.id}')">删除</button>`}
    </div>
  </div>`;
  let childHtml='';
  if(hasChild&&open)childHtml=node.children.map(c=>deptMgrRows(c,depth+1)).join('');
  return row+childHtml;
}
function toggleDeptMgr(id){deptOpen[id]=!deptOpen[id];renderDeptMgr();}
function expandAllDept(open){(function walk(n){deptOpen[n.id]=open;(n.children||[]).forEach(walk);})(DEPTS);if(open)deptOpen.all=true;renderDeptMgr();}
function delDept(id){const n=findDept(id);if(deptMemberCount(id)>0){openModal({title:'无法删除',sub:'「'+n.name+'」下仍有成员，请先移出或调整成员后再删除。',icon:'danger',confirm:'我知道了',hideCancel:true,onok:()=>{}});return;}
  openModal({title:'删除部门',sub:'确认删除「'+n.name+'」？该操作不可恢复。',icon:'danger',danger:true,confirm:'确认删除',onok:()=>{removeDept(id);renderDeptMgr();renderTree();$('deptTotal').textContent=countDepts();toast('已删除 '+n.name);}});}
function removeDept(id){(function walk(n){n.children=(n.children||[]).filter(c=>c.id!==id);n.children.forEach(walk);})(DEPTS);}
function countDepts(){let c=0;(function walk(n){if(n.id!=='all')c++;(n.children||[]).forEach(walk);})(DEPTS);return c;}
function openDeptForm(parentId,isChild){
  // 简化：用确认弹窗承载新建/编辑部门表单
  const editing=parentId&&!isChild&&parentId!=='all';
  const node=editing?findDept(parentId):null;
  openModal({
    title:editing?'编辑部门':'新建部门',
    icon:'edit',
    body:`<div class="blk"><label class="fl"><span class="req">*</span>部门名称</label><input class="input" id="mDeptName" value="${node?node.name:''}" placeholder="如 客户成功组" /></div>
      <div class="blk"><label class="fl"><span class="req">*</span>部门编码</label><input class="input" id="mDeptCode" value="${node?node.code:''}" placeholder="如 D-CS" /></div>
      <div class="blk"><label class="fl">负责人</label><div class="picker-field" id="mDeptLeader" onclick="openLeaderPicker(event)">${node&&node.leader?`<span class="chip">${av(node.leader)}<span>${node.leader}</span></span>`:'<span class="ph">选择负责人</span>'}</div></div>`,
    confirm:editing?'保存':'确认新建',
    onok:()=>{
      const nm=$('mDeptName').value.trim();if(!nm){$('mDeptName').style.borderColor='var(--danger)';toast('请填写部门名称');return false;}
      const code=$('mDeptCode').value.trim()||'D-NEW';
      if(editing){node.name=nm;node.code=code;node.leader=pickLeaderName;}
      else{const parent=(isChild&&parentId)?findDept(parentId):DEPTS;parent.children=parent.children||[];parent.children.push({id:'d'+Date.now(),name:nm,code,leader:pickLeaderName,status:'on',children:[]});deptOpen[parent.id]=true;}
      renderDeptMgr();renderTree();$('deptTotal').textContent=countDepts();toast(editing?'已保存部门':'已新建部门 '+nm);
    },
    afterOpen:()=>{pickLeaderName=node?node.leader:null;}
  });
}
let pickLeaderName=null;
function clearLeader(e){e.stopPropagation();pickLeaderName=null;const f=$('mDeptLeader');f.innerHTML='<span class="ph">选择负责人</span>';}
function openLeaderPicker(e){
  e.stopPropagation();
  const field=e.currentTarget;
  ppOpen(field,m=>{pickLeaderName=m.name;field.innerHTML=`<span class="chip">${av(m.name)}<span>${m.name}</span></span><span class="clr" onclick="clearLeader(event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></span>`;});
}

/* ========== 成员选择浮层（单选） ========== */
let ppAnchor=null,ppCb=null;
function ppOpen(field,cb){
  ppCb=cb;ppAnchor=field;
  const pop=$('ppPop');
  pop.innerHTML=`<div class="ps"><div class="input-affix"><span class="pre"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg></span><input class="input" id="ppSearch" placeholder="搜索成员" oninput="ppRender()" /></div></div><div class="plist" id="ppList"></div>`;
  pop.classList.add('open');field.classList.add('focus');
  ppRender();
  const r=field.getBoundingClientRect();
  let left=r.left,top=r.bottom+6;
  if(left+264>window.innerWidth-12)left=window.innerWidth-264-12;
  if(top+300>window.innerHeight-12)top=Math.max(12,r.top-306);
  pop.style.left=left+'px';pop.style.top=top+'px';
  setTimeout(()=>{const s=$('ppSearch');if(s)s.focus();},50);
}
function ppRender(){
  const q=($('ppSearch').value||'').trim();
  const list=MEMBERS.filter(m=>m.status==='在职'&&(!q||m.name.indexOf(q)>=0||m.deptName.indexOf(q)>=0));
  $('ppList').innerHTML=list.length?list.map(m=>`<div class="pm ${pickLeaderName===m.name?'sel':''}" onclick="ppPick(${m.id})">${av(m.name)}<div><div class="pn">${m.name}</div><div class="pd">${m.deptName} · ${m.title}</div></div><svg class="pck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg></div>`).join(''):'<div class="pempty">无匹配成员</div>';
}
function ppPick(id){const m=MEMBERS.find(x=>x.id===id);if(ppCb)ppCb(m);ppClose();}
function ppClose(){const pop=$('ppPop');pop.classList.remove('open');if(ppAnchor){ppAnchor.classList.remove('focus');ppAnchor=null;}}

/* ========== 统一下拉 Select ========== */
function initSelects(root){
  (root||document).querySelectorAll('.cs').forEach(cs=>{
    if(!cs.querySelector('.cs-val')){
      const v=cs.dataset.value||'';const ph=cs.dataset.ph||'请选择';
      const span=document.createElement('span');span.className='cs-val'+(v?'':' ph');span.textContent=v||ph;
      cs.insertBefore(span,cs.firstChild);
    }
  });
}
let csField=null;
function openSelect(cs){
  csField=cs;
  const opts=(cs.dataset.options||'').split('||').filter(Boolean);
  const cur=cs.dataset.value||'';
  const pop=$('csPop');
  pop.innerHTML=opts.map(o=>`<div class="cs-opt${o===cur?' sel':''}" data-v="${o}"><span>${o}</span><span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="var(--blue-600)" stroke-width="3"><path d="M5 12l5 5L20 6"/></svg></span></div>`).join('');
  pop.classList.add('open');cs.classList.add('open','focus');
  const r=cs.getBoundingClientRect();pop.style.minWidth=r.width+'px';
  const ph=pop.offsetHeight;
  let left=r.left,top=r.bottom+4;
  if(top+ph>window.innerHeight-12)top=Math.max(12,r.top-ph-4);
  if(left+r.width>window.innerWidth-12)left=Math.max(12,window.innerWidth-r.width-12);
  pop.style.left=left+'px';pop.style.top=top+'px';
}
function closeSelect(){const pop=$('csPop');pop.classList.remove('open');if(csField){csField.classList.remove('open','focus');csField=null;}}

/* ========== 确认弹窗 ========== */
let modalOk=null;
function openModal(o){
  $('mTitle').textContent=o.title;
  $('mSub').textContent=o.sub||'';
  $('mSub').style.display=o.sub?'':'none';
  $('mBody').innerHTML=o.body||'';
  $('mBody').style.display=o.body?'':'none';
  const icons={warn:['var(--warning-bg)','var(--warning)','<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'],
    danger:['var(--danger-bg)','var(--danger)','<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'],
    ok:['var(--success-bg)','var(--success)','<path d="M20 6L9 17l-5-5"/>'],
    edit:['var(--info-bg)','var(--blue-500)','<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>']};
  const ic=icons[o.icon||'edit'];
  $('mIcon').style.background=ic[0];
  $('mIcon').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="${ic[1]}" stroke-width="2"><g>${ic[2]}</g></svg>`;
  const btn=$('mConfirm');btn.textContent=o.confirm||'确认';btn.className='btn '+(o.danger?'btn-danger':'btn-primary');
  modalOk=o.onok;
  $('mscrim').classList.add('open');
  if(o.afterOpen)o.afterOpen();
  if(o.body)initSelects($('mBody'));
  // 取消按钮显隐
  $('mscrim').querySelector('.mf .btn-default').style.display=o.hideCancel?'none':'';
}
function closeModal(){$('mscrim').classList.remove('open');}
$('mConfirm').addEventListener('click',()=>{if(modalOk){const r=modalOk();if(r===false)return;}closeModal();});

/* ========== 全局 ========== */
document.addEventListener('click',e=>{
  const opt=e.target.closest('.cs-opt');
  if(opt&&csField){const v=opt.dataset.v;csField.dataset.value=v;const val=csField.querySelector('.cs-val');if(val){val.textContent=v;val.classList.remove('ph');}const cb=csField.dataset.onchange;closeSelect();if(cb&&typeof window[cb]==='function')window[cb]();return;}
  const cs=e.target.closest('.cs');
  if(cs){if(cs===csField)closeSelect();else{closeSelect();openSelect(cs);}return;}
  if($('csPop').classList.contains('open')&&!$('csPop').contains(e.target))closeSelect();
  const pop=$('ppPop');
  if(pop.classList.contains('open')&&!pop.contains(e.target)&&e.target!==ppAnchor&&!(ppAnchor&&ppAnchor.contains(e.target)))ppClose();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('csPop').classList.contains('open'))closeSelect();else if($('ppPop').classList.contains('open'))ppClose();else if($('mscrim').classList.contains('open'))closeModal();else closeDrawer();}});

/* ========== 初始化 ========== */
renderTree();renderPresenceStrip();renderMembers();initSelects();
