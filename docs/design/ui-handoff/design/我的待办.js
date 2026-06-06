/* ===================== 我的待办 · Lark Tasks 式 ===================== */
const $=id=>document.getElementById(id);
const AVA=['#3370FF','#2EA121','#D97A00','#7A4FE0','#0A8B9E','#E0457B','#245BDB','#C26A00'];
function avaColor(n){let s=0;for(const c of String(n))s+=c.charCodeAt(0);return AVA[s%AVA.length];}
function svg(path,sw){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(sw||1.8)+'" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';}
const TODAY=new Date(2026,5,4); // 2026-06-04
function startOfDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
const T0=startOfDay(TODAY);
function parseDue(s){return s?new Date(s+'T00:00:00'):null;}
function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function dayDiff(s){if(!s)return null;return Math.round((startOfDay(parseDue(s))-T0)/86400000);}
function isOverdue(t){if(t.done||!t.due)return false;return dayDiff(t.due)<0;}
function dueLabel(s){
  const diff=dayDiff(s);if(diff===null)return '';
  if(diff===0)return '今天';
  if(diff===1)return '明天';
  if(diff===-1)return '昨天逾期';
  if(diff<0)return '逾期 '+(-diff)+' 天';
  if(diff<=7)return diff+' 天后';
  const d=parseDue(s);return (d.getMonth()+1)+'月'+d.getDate()+'日';
}
const PRIO={high:{lbl:'高',cls:'high'},mid:{lbl:'中',cls:'mid'},low:{lbl:'低',cls:'low'}};
const PRANK={high:0,mid:1,low:2};
const PFLAG='<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>';

/* 系统待办类型 */
const TYPES={
  approval:{name:'待我审批',tag:'tag-blue',route:'审批中心',ic:'<path d="M9 11l3 3L20 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'},
  fill:{name:'待我填写',tag:'tag-orange',route:'审批中心',ic:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'},
  confirm:{name:'待我确认',tag:'tag-purple',route:'消息中心',ic:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>'},
  assigned:{name:'派给我的',tag:'tag-cyan',route:'',ic:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'},
  personal:{name:'个人任务',tag:'tag-gray',route:'',ic:'<circle cx="12" cy="12" r="9"/>'},
};
const VIEW_IC={
  all:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  today:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>',
};

let LISTS=[
  {key:'inbox',name:'收集箱',color:'#8F959E',fixed:true},
  {key:'ops',name:'运营项目',color:'#3370FF'},
  {key:'hire',name:'招聘',color:'#2EA121'},
  {key:'life',name:'个人事务',color:'#7A4FE0'},
];
const VIEWS=[
  {key:'all',name:'全部'},
  {key:'today',name:'今天'},
  {key:'approval',name:'待我审批',type:true},
  {key:'fill',name:'待我填写',type:true},
  {key:'confirm',name:'待我确认',type:true},
  {key:'assigned',name:'派给我的',type:true},
];

let uid=100;
let TASKS=[
  {id:1,type:'approval',title:'林晓 提交的「调休申请」待审批',from:'林晓',due:'2026-06-03',prio:'high',done:false},
  {id:2,type:'approval',title:'周涛 提交的「采购申请」待审批',from:'周涛',due:'2026-06-04',prio:'high',done:false},
  {id:3,type:'approval',title:'赵敏 提交的「Q2 市场推广预算」待审批',from:'赵敏',due:'2026-06-05',prio:'mid',done:false},
  {id:4,type:'fill',title:'「团队办公椅采购」被驳回，请补充比价材料',from:'何强',due:'2026-06-02',prio:'high',done:false},
  {id:5,type:'fill',title:'「合作协议用印」需补充合同附件',from:'冯磊',due:'2026-06-06',prio:'mid',done:false},
  {id:6,type:'confirm',title:'李娜 在「Q2 运营复盘」中 @了你',from:'李娜',due:'2026-06-04',prio:'mid',done:false},
  {id:7,type:'confirm',title:'确认参加「下周三技术评审会」',from:'吴昊',due:'2026-06-05',prio:'low',done:false},
  {id:8,type:'assigned',title:'准备技术评审的运营需求文档',from:'吴昊',due:'2026-06-05',prio:'mid',done:false},
  {id:9,type:'assigned',title:'完善运营专员 JD 的职责描述',from:'许静',due:'2026-06-02',prio:'mid',done:false},
  {id:10,type:'personal',list:'ops',title:'整理运营侧需求清单发吴昊',from:'张伟',due:'2026-06-04',dueTime:'18:00',start:'2026-06-03',startTime:'09:00',prio:'high',done:false,remind:'提前 1 小时',repeat:'不重复',createdAt:'昨天 16:20',
    desc:'技术评审前需把运营侧的需求汇总清楚，按优先级排序后同步给吴昊。',
    subtasks:[{t:'汇总各业务线诉求',done:true},{t:'按优先级排序',done:false},{t:'同步给吴昊确认',done:false}],
    comments:[{who:'吴昊',text:'评审定在周三上午，麻烦周二前给我',time:'昨天 16:20'}]},
  {id:11,type:'personal',list:'ops',title:'撰写 Q2 运营复盘 PPT',from:'张伟',due:'2026-06-06',prio:'mid',done:false,
    subtasks:[{t:'拉取增长数据',done:true},{t:'提炼关键结论',done:false}]},
  {id:12,type:'personal',list:'hire',title:'运营专员一面排期',from:'张伟',due:'2026-06-05',prio:'mid',done:false},
  {id:13,type:'personal',list:'life',title:'预约年度体检',from:'张伟',due:'2026-06-10',prio:'low',done:false,repeat:'每年'},
  {id:14,type:'personal',list:'inbox',title:'回复供应商报价邮件',from:'张伟',due:'',prio:'low',done:false},
  {id:15,type:'personal',list:'life',title:'团队团建地点调研',from:'张伟',due:'2026-06-08',prio:'low',done:false},
  {id:16,type:'personal',list:'ops',title:'提交 5 月运营月报',from:'张伟',due:'2026-05-31',prio:'mid',done:true},
  {id:17,type:'confirm',title:'确认 5 月考勤记录',from:'许静',due:'2026-05-30',prio:'low',done:true},
  {id:18,type:'approval',title:'孙琳 的「差旅住宿费报销」',from:'孙琳',due:'2026-05-28',prio:'mid',done:true},
];
TASKS.forEach(t=>{if(t.type==='personal'){t.subtasks=t.subtasks||[];t.comments=t.comments||[];t.desc=t.desc||'';t.remind=t.remind||'无';t.repeat=t.repeat||'不重复';t.dueTime=t.dueTime||'';t.start=t.start||'';t.startTime=t.startTime||'';t.createdAt=t.createdAt||'今天 09:12';t.group=t.group||([10,11,15].indexOf(t.id)>=0?'g1':'g0');}});

/* 从消息中心创建的任务（localStorage 联动） */
(function ingestFromMsg(){
  try{
    const key='todo_inbox_from_msg';
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    if(!arr.length)return;
    arr.forEach(m=>{
      TASKS.push({id:++uid,type:'personal',list:'inbox',group:'g0',title:m.title,from:'张伟',due:m.due||'',dueTime:'',start:'',startTime:'',prio:'mid',done:false,remind:'无',repeat:'不重复',subtasks:[],comments:[],desc:'',createdAt:'来自消息',msgSource:m.source||null});
    });
    localStorage.removeItem(key);
  }catch(e){}
})();

/* 状态 */
let sel={kind:'view',key:'all'};
let GROUPS=[{id:'g0',name:'默认分组'},{id:'g1',name:'本周重点'}];
let sectionOrder=['sys','g0','g1'];
let groupMode='custom';
let sortMode='custom';
let statusFilter='active';
let fieldCfg={start:false,due:true,owner:true,created:false};
let taskFilters={overdue:false,hasDue:false,noDue:false};
let searchQ='';
let detailId=null;
let metaEditing=null;
let groupClosed={};
let qaPrio='mid',qaDateOff=null; // null|0|1|7

/* ===== 左栏 ===== */
function listOf(key){return LISTS.find(l=>l.key===key);}
function activeCount(pred){return TASKS.filter(t=>!t.done&&pred(t)).length;}
function viewCount(v){
  if(v.key==='all')return activeCount(()=>true);
  if(v.key==='today')return activeCount(t=>isOverdue(t)||dayDiff(t.due)===0);
  return activeCount(t=>t.type===v.key);
}
function renderRail(){
  const smartHtml=VIEWS.map(v=>{
    const on=sel.kind==='view'&&sel.key===v.key;
    const ic=VIEW_IC[v.key]||TYPES[v.key].ic;
    const c=viewCount(v);
    return `<div class="rail-item ${on?'active':''}" title="${v.name}" onclick="selectView('${v.key}')">${svg(ic).replace('<svg ','<svg class="ri" ')}<span class="rn">${v.name}</span>${c?`<span class="rc">${c}</span>`:''}</div>`;
  }).join('');
  const listHtml=LISTS.map(l=>{
    const on=sel.kind==='list'&&sel.key===l.key;
    const c=activeCount(t=>t.type==='personal'&&t.list===l.key);
    const del=l.fixed?'':`<span class="rdel" title="删除清单" onclick="event.stopPropagation();delList('${l.key}')">${svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',2)}</span>`;
    return `<div class="rail-item ${on?'active':''}" title="${l.name}" onclick="selectList('${l.key}')"><span class="dotc" style="background:${l.color}"></span><span class="rn">${l.name}</span>${c?`<span class="rc">${c}</span>`:''}${del}</div>`;
  }).join('');
  $('smartViews').innerHTML=smartHtml;
  $('myLists').innerHTML=listHtml;
  const sf=$('smartViewsFly'),lf=$('myListsFly');
  if(sf)sf.innerHTML=smartHtml;if(lf)lf.innerHTML=listHtml;
  const total=activeCount(()=>true);
  const nb=$('navBadge');if(nb){nb.textContent=total;nb.style.display=total?'':'none';}
}
function toggleRail(){$('taskRail').classList.toggle('collapsed');}
function selectView(k){sel={kind:'view',key:k};closeDetail();renderRail();renderHead();renderList();}
function selectList(k){sel={kind:'list',key:k};closeDetail();renderRail();renderHead();renderList();}

function renderHead(){
  let title,dot='';
  if(sel.kind==='view'){const v=VIEWS.find(x=>x.key===sel.key);title=v.name;}
  else{const l=listOf(sel.key);title=l.name;dot=l.color;}
  $('viewTitle').textContent=title;
  const hd=$('headDot');if(dot){hd.style.display='';hd.style.background=dot;}else hd.style.display='none';
  $('viewCnt').textContent=baseTasks().filter(t=>!t.done).length;
}

/* ===== 取数 ===== */
function baseTasks(){
  let list;
  if(sel.kind==='view'){
    if(sel.key==='all')list=TASKS.slice();
    else if(sel.key==='today')list=TASKS.filter(t=>isOverdue(t)||dayDiff(t.due)===0);
    else list=TASKS.filter(t=>t.type===sel.key);
  }else list=TASKS.filter(t=>t.type==='personal'&&t.list===sel.key);
  return list;
}
function filtered(){
  let list=baseTasks();
  if(searchQ){const q=searchQ.trim();list=list.filter(t=>t.title.indexOf(q)>=0||(t.desc&&t.desc.indexOf(q)>=0)||(t.from&&t.from.indexOf(q)>=0));}
  if(taskFilters.overdue)list=list.filter(t=>isOverdue(t));
  if(taskFilters.hasDue)list=list.filter(t=>!!t.due);
  if(taskFilters.noDue)list=list.filter(t=>!t.due);
  return list;
}
function activeFilterCount(){return Object.values(taskFilters).filter(Boolean).length;}
function orderTasks(arr){
  if(sortMode==='due')return arr.slice().sort((a,b)=>{const ao=isOverdue(a),bo=isOverdue(b);if(ao!==bo)return ao?-1:1;const ad=a.due?dayDiff(a.due):99999,bd=b.due?dayDiff(b.due):99999;return ad-bd;});
  if(sortMode==='created')return arr.slice().sort((a,b)=>b.id-a.id);
  return arr.slice();
}
function sortActive(arr){return orderTasks(arr);}
function fmtOff(n){return fmtDate(addDays(TODAY,n));}
function canShowSections(){return sel.kind==='list'||(sel.kind==='view'&&(sel.key==='all'||sel.key==='today'));}

/* ===== 分组 ===== */
function buildGroups(list){
  let active=list.filter(t=>!t.done),done=list.filter(t=>t.done);
  if(statusFilter==='active')done=[];
  if(statusFilter==='done')active=[];
  let groups=[];
  if(groupMode==='custom'){
    if(canShowSections()){
      sectionOrder.forEach(sid=>{
        if(sid==='sys'){const sys=sortActive(active.filter(t=>t.type!=='personal'));if(sys.length)groups.push({key:'sys',label:'系统待办',tasks:sys,sec:'sys'});}
        else{const g=GROUPS.find(x=>x.id===sid);if(!g)return;const ts=active.filter(t=>t.type==='personal'&&t.group===sid);groups.push({key:'sec-'+sid,label:g.name,tasks:ts,add:{group:sid},sec:sid});}
      });
    }else{
      const sys=sortActive(active.filter(t=>t.type!=='personal'));
      if(sys.length)groups.push({key:'sys',label:'系统待办',tasks:sys});
      const ps=sortActive(active.filter(t=>t.type==='personal'));
      if(ps.length)groups.push({key:'sec-g0',label:'默认分组',tasks:ps,add:{group:'g0'}});
    }
  }else if(groupMode==='time'){
    const buckets=[
      {key:'overdue',label:'已逾期',danger:true,f:t=>isOverdue(t),add:{due:fmtOff(0)}},
      {key:'today',label:'今天',f:t=>dayDiff(t.due)===0,add:{due:fmtOff(0)}},
      {key:'tomorrow',label:'明天',f:t=>dayDiff(t.due)===1,add:{due:fmtOff(1)}},
      {key:'week',label:'本周内',f:t=>{const d=dayDiff(t.due);return d>=2&&d<=7;},add:{due:fmtOff(3)}},
      {key:'later',label:'更晚',f:t=>dayDiff(t.due)>7,add:{due:fmtOff(10)}},
      {key:'nodate',label:'无日期',f:t=>!t.due,add:{due:''}},
    ];
    buckets.forEach(b=>{const ts=sortActive(active.filter(b.f));if(ts.length)groups.push({key:b.key,label:b.label,danger:b.danger,tasks:ts,add:b.add});});
  }else{
    if(active.length)groups.push({key:'doing',label:'进行中',tasks:sortActive(active),add:{}});
  }
  if(done.length)groups.push({key:'done',label:'已完成',tasks:done.slice().sort((a,b)=>(b.due||'').localeCompare(a.due||'')),done:true});
  return groups;
}

/* ===== 任务行 ===== */
function taskRow(t){
  const meta=TYPES[t.type];
  const od=isOverdue(t)&&!t.done;
  let inline='';
  if(t.type==='personal'){
    const l=listOf(t.list);
    if(l)inline+=`<span class="listdot" style="background:${l.color}" title="${l.name}"></span>`;
    if(t.subtasks&&t.subtasks.length){const dn=t.subtasks.filter(s=>s.done).length;inline+=`<span class="subprog">${svg('<circle cx="12" cy="12" r="9"/><path d="M3 12a9 9 0 0 1 9-9"/>',2)}${dn}/${t.subtasks.length}</span>`;}
  }else{
    inline+=`<span class="tag ${meta.tag}">${meta.name}</span>`;
  }
  const drag=(groupMode==='custom'&&sortMode==='custom'&&t.type==='personal'&&!t.done)?`draggable="true" ondragstart="dragStart(event,${t.id})" ondragend="dragEnd(event)" ondragover="dragOver(event,${t.id})" ondragleave="dragLeave(event)" ondrop="dragDrop(event,${t.id})"`:'';
  const inlineCols=activeCols().map(c=>`<div class="tcol${c.key==='owner'?' owner':''}${c.key==='due'?' due':''}">${cellHtml(t,c.key)}</div>`).join('');
  return `<div class="task ${t.done?'done':''} ${detailId===t.id?'sel':''}" data-tid="${t.id}" ${drag} onclick="onTaskClick(${t.id})">
    <div class="tcell">
      <span class="tcheck" onclick="event.stopPropagation();toggleDone(${t.id})">${svg('<path d="M5 12l5 5L20 6"/>',3)}</span>
      <span class="task-title">${t.title}</span>
      ${inline?`<span class="tmeta">${inline}</span>`:''}
    </div>
    ${inlineCols}
  </div>`;
}
const COLDEFS=[
  {key:'start',label:'开始时间',width:'128px'},
  {key:'due',label:'截止时间',width:'142px'},
  {key:'owner',label:'负责人',width:'120px'},
  {key:'created',label:'创建时间',width:'128px'},
];
function activeCols(){return COLDEFS.filter(c=>fieldCfg[c.key]);}
function gcols(){return '1fr '+activeCols().map(c=>c.width).join(' ');}
function cellHtml(t,key){
  const od=isOverdue(t)&&!t.done;
  if(key==='start')return t.start?fmtCell(t.start,t.startTime):'<span class="dash">—</span>';
  if(key==='due')return t.due?`<span class="due ${od?'od':''}">${fmtCell(t.due,t.dueTime)}</span>`:'<span class="dash">—</span>';
  if(key==='owner'){const who=t.from||'张伟';return `<span class="oav" style="background:${avaColor(who)}">${who.slice(-1)}</span>${who}`;}
  if(key==='created')return t.createdAt?t.createdAt:'<span class="dash">—</span>';
  return '';
}
/* ===== 拖拽排序 / 移动分组 ===== */
let dragId=null;
function dragStart(e,id){dragId=id;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(id));}catch(_){}e.currentTarget.classList.add('dragging');}
function dragEnd(e){dragId=null;document.querySelectorAll('.task,.gadd').forEach(r=>r.classList.remove('dragging','drop-before','drop-after','drop-into'));}
function dragOver(e,id){if(dragId===null||id===dragId)return;e.preventDefault();const r=e.currentTarget;const after=(e.clientY-r.getBoundingClientRect().top)>r.offsetHeight/2;r.classList.toggle('drop-after',after);r.classList.toggle('drop-before',!after);}
function dragLeave(e){e.currentTarget.classList.remove('drop-before','drop-after');}
function dragDrop(e,id){
  e.preventDefault();
  if(dragId===null||id===dragId){dragEnd(e);return;}
  const r=e.currentTarget;const after=r.classList.contains('drop-after');
  const dragT=TASKS.find(t=>t.id===dragId),tgt=TASKS.find(t=>t.id===id);
  if(!dragT||!tgt){dragEnd(e);return;}
  dragT.group=tgt.group;
  TASKS.splice(TASKS.indexOf(dragT),1);
  let idx=TASKS.indexOf(tgt);if(after)idx++;
  TASKS.splice(idx,0,dragT);
  dragId=null;renderList();
}
function addRowDragOver(e){if(dragId===null)return;e.preventDefault();e.currentTarget.classList.add('drop-into');}
function addRowDragLeave(e){e.currentTarget.classList.remove('drop-into');}
function addRowDrop(e,el){
  e.preventDefault();el.classList.remove('drop-into');
  if(dragId===null)return;
  const ctx=JSON.parse(el.dataset.ctx||'{}');
  const dragT=TASKS.find(t=>t.id===dragId);if(!dragT){dragId=null;return;}
  if(ctx.group)dragT.group=ctx.group;
  TASKS.splice(TASKS.indexOf(dragT),1);TASKS.push(dragT);
  dragId=null;renderList();
}
/* ===== 分组拖拽排序 ===== */
let secDragId=null;
function secDragStart(e,sid){secDragId=sid;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain','sec:'+sid);}catch(_){}e.stopPropagation();setTimeout(()=>{const g=e.target.closest('.grp');if(g)g.classList.add('sec-dragging');},0);}
function secDragEnd(e){secDragId=null;document.querySelectorAll('.grp').forEach(g=>g.classList.remove('sec-dragging','sec-drop-before','sec-drop-after'));}
function secDragOver(e,sid){if(secDragId===null||sid===secDragId)return;e.preventDefault();const g=e.currentTarget.closest('.grp');const after=(e.clientY-g.getBoundingClientRect().top)>g.getBoundingClientRect().height/2;document.querySelectorAll('.grp').forEach(x=>x.classList.remove('sec-drop-before','sec-drop-after'));g.classList.toggle('sec-drop-after',after);g.classList.toggle('sec-drop-before',!after);}
function secDragLeave(e){const g=e.currentTarget.closest('.grp');if(g)g.classList.remove('sec-drop-before','sec-drop-after');}
function secDrop(e,sid){
  e.preventDefault();e.stopPropagation();
  if(secDragId===null||sid===secDragId){secDragEnd(e);return;}
  const g=e.currentTarget.closest('.grp');const after=g.classList.contains('sec-drop-after');
  sectionOrder=sectionOrder.filter(x=>x!==secDragId);
  let idx=sectionOrder.indexOf(sid);if(after)idx++;
  sectionOrder.splice(idx,0,secDragId);
  secDragId=null;renderList();
}
function emptyState(kind){
  const lines=`<svg class="lines" viewBox="0 0 46 44" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M3 5h40M3 16h40M3 27h26"/></svg>`;
  const CFG={
    clear:{cls:'',badge:'<path d="M20 6L9 17l-5-5"/>',et:'今日任务已清空',es:'这里很清爽。点「新建任务」或在任意分组下添加一条。',cta:'<button class="btn btn-primary btn-sm ea" onclick="toolbarNewTask()">'+svg('<path d="M12 5v14M5 12h14"/>',2.2)+'新建任务</button>'},
    search:{cls:'search',badge:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',et:'没有找到相关任务',es:'换个关键词，或检查是否有限定状态 / 筛选条件。',cta:''},
    done:{cls:'done',badge:'<path d="M20 6L9 17l-5-5"/>',et:'还没有已完成的任务',es:'完成的任务会归集到这里，方便你回顾。',cta:''},
  };
  const c=CFG[kind]||CFG.clear;
  return `<div class="list-empty"><div class="ill ${c.cls}"><div class="halo"></div><div class="card">${lines}</div><div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${c.badge}</svg></div></div><div class="et">${c.et}</div><div class="es">${c.es}</div>${c.cta||''}</div>`;
}
function renderList(){
  const groups=buildGroups(filtered());
  const area=$('listArea');
  const total=groups.reduce((s,g)=>s+g.tasks.length,0);
  const showSec=groupMode==='custom'&&canShowSections();
  if(total===0&&(searchQ||!showSec)){
    area.innerHTML=emptyState(searchQ?'search':(statusFilter==='done'?'done':'clear'));
    return;
  }
  const chev=svg('<path d="M6 9l6 6 6-6"/>',2).replace('<svg ','<svg class="gchev" ');
  const plus=svg('<path d="M12 5v14M5 12h14"/>',2.2);
  const colHead=`<div class="col-head"><span class="ch first">任务标题</span>${activeCols().map(c=>`<span class="ch">${c.label}</span>`).join('')}</div>`;
  let html=`<div class="list-table" style="--gcols:${gcols()}">`+colHead+groups.map(g=>{
    const closed=groupClosed[g.key];
    const addRow=g.add?`<div class="gadd" data-key="${g.key}" data-ctx='${JSON.stringify(g.add)}' onclick="startAddTask(this)" ondragover="addRowDragOver(event)" ondragleave="addRowDragLeave(event)" ondrop="addRowDrop(event,this)"><span class="gp">${plus}</span><span class="gtx">新建任务</span><input class="gadd-title" placeholder="输入标题，回车确认" onkeydown="addTaskKey(event,this.closest('.gadd'))" onblur="addTaskBlur(this.closest('.gadd'))" /><input type="date" class="gadd-date" title="截止时间" onclick="event.stopPropagation()" onblur="addTaskBlur(this.closest('.gadd'))" /></div>`:'';
    const secDrag=g.sec?`draggable="true" ondragstart="secDragStart(event,'${g.sec}')" ondragend="secDragEnd(event)" ondragover="secDragOver(event,'${g.sec}')" ondragleave="secDragLeave(event)" ondrop="secDrop(event,'${g.sec}')"`:'';
    return `<div class="grp ${closed?'closed':''}" data-sec="${g.sec||''}">
      <div class="grp-head ${g.danger?'overdue':''}" ${secDrag} onclick="toggleGroup('${g.key}')">${g.sec?'<span class="ghandle">'+svg('<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',1.6)+'</span>':''}${chev}${g.label}<span class="gc">${g.tasks.length}</span></div>
      <div class="grp-body">${g.tasks.map(taskRow).join('')}${addRow}</div>
    </div>`;
  }).join('')+'</div>';
  if(showSec){
    html+=`<div class="gadd-group" onclick="startAddGroup(this)"><span>${plus}</span><span class="glabel">新建分组</span><input placeholder="输入分组名称，回车创建" onkeydown="addGroupKey(event,this.parentNode)" onblur="this.classList&&this.parentNode.classList.remove('editing')" /></div>`;
  }
  area.innerHTML=html;
}
function toggleGroup(k){groupClosed[k]=!groupClosed[k];renderList();}
function setGroup(g){groupMode=g;renderList();syncToolbar();}
function toggleGroupMenu(){}
function syncToolbar(){
  const gl={custom:'自定义分组',time:'时间',status:'状态'}[groupMode];
  $('groupLbl').textContent='分组：'+gl;
  const sl={custom:'拖拽自定义',due:'截止时间',created:'创建时间'}[sortMode];
  $('sortLbl').textContent='排序：'+sl;
  $('statusLbl').textContent={all:'全部状态',active:'未完成',done:'已完成'}[statusFilter];
  const fc=activeFilterCount(),fb=$('filterBadge');
  if(fc){fb.style.display='';fb.textContent=fc;$('tbFilter').classList.add('on');}else{fb.style.display='none';$('tbFilter').classList.remove('on');}
}

/* ===== 工具栏下拉菜单 ===== */
const CK=svg('<path d="M20 6L9 17l-5-5"/>',2.6);
function radioItem(label,on,onclick){return `<div class="dd-item" onclick="${onclick}"><span class="di-tx">${label}</span>${on?`<span class="di-ck">${CK}</span>`:''}</div>`;}
function checkItem(label,on,onclick){return `<div class="dd-item" onclick="${onclick}"><span class="di-box ${on?'on':''}">${svg('<path d="M20 6L9 17l-5-5"/>',3)}</span><span class="di-tx">${label}</span></div>`;}
function menuHtml(type){
  if(type==='new'){
    return '<div class="dd-h">选择任务类型</div>'+
      radioItem('个人任务',true,"toolbarNewTask();closeMenu()")+
      `<div class="dd-item" onclick="location.href='审批中心.html';closeMenu()"><span class="di-tx">发起审批</span></div>`;
  }
  if(type==='status'){
    return ['all','active','done'].map(v=>radioItem({all:'全部状态',active:'未完成',done:'已完成'}[v],statusFilter===v,`setStatus('${v}')`)).join('');
  }
  if(type==='sort'){
    return '<div class="dd-h">排序方式</div>'+['custom','due','created'].map(v=>radioItem({custom:'拖拽自定义',due:'按截止时间',created:'按创建时间'}[v],sortMode===v,`setSort('${v}')`)).join('');
  }
  if(type==='group'){
    return '<div class="dd-h">分组方式</div>'+['custom','time','status'].map(v=>radioItem({custom:'自定义分组',time:'按时间',status:'按状态'}[v],groupMode===v,`setGroupM('${v}')`)).join('');
  }
  if(type==='filter'){
    return '<div class="dd-h">筛选条件</div>'+
      checkItem('仅逾期',taskFilters.overdue,"toggleFilter('overdue')")+
      checkItem('有截止时间',taskFilters.hasDue,"toggleFilter('hasDue')")+
      checkItem('无截止时间',taskFilters.noDue,"toggleFilter('noDue')")+
      (activeFilterCount()?'<div class="dd-sep"></div><div class="dd-item" onclick="clearFilters()"><span class="di-tx" style="color:var(--ink-4)">清除筛选</span></div>':'');
  }
  if(type==='fields'){
    return '<div class="dd-h">显示列</div>'+COLDEFS.map(c=>checkItem(c.label,fieldCfg[c.key],`toggleField('${c.key}')`)).join('');
  }
  return '';
}
function openMenu(e,trigger,type){
  e.stopPropagation();
  const dd=$('ddMenu');
  if(dd.classList.contains('open')&&dd.dataset.type===type){closeMenu();return;}
  dd.dataset.type=type;dd.innerHTML=menuHtml(type);
  dd.classList.add('open');
  const r=trigger.getBoundingClientRect();
  const mw=dd.offsetWidth,mh=dd.offsetHeight;
  let left=type==='new'?r.left:Math.min(r.left,window.innerWidth-mw-12);
  let top=r.bottom+6;if(top+mh>window.innerHeight-12)top=r.top-mh-6;
  dd.style.left=left+'px';dd.style.top=top+'px';
}
function closeMenu(){const dd=$('ddMenu');dd.classList.remove('open');dd.dataset.type='';}
function reopenIf(type){const dd=$('ddMenu');if(dd.classList.contains('open')&&dd.dataset.type===type)dd.innerHTML=menuHtml(type);}
function setStatus(v){statusFilter=v;closeMenu();renderList();syncToolbar();}
function setSort(v){sortMode=v;closeMenu();renderList();syncToolbar();}
function setGroupM(v){groupMode=v;closeMenu();renderList();syncToolbar();}
function toggleFilter(k){taskFilters[k]=!taskFilters[k];if(k==='hasDue'&&taskFilters.hasDue)taskFilters.noDue=false;if(k==='noDue'&&taskFilters.noDue)taskFilters.hasDue=false;renderList();syncToolbar();reopenIf('filter');}
function clearFilters(){taskFilters={overdue:false,hasDue:false,noDue:false};renderList();syncToolbar();reopenIf('filter');}
function toggleField(k){fieldCfg[k]=!fieldCfg[k];renderList();reopenIf('fields');}
function toolbarNewTask(){
  const row=document.querySelector('.gadd');
  if(row){startAddTask(row);}
  else toast('当前视图不支持直接新建');
}
document.addEventListener('click',e=>{const dd=$('ddMenu');if(dd.classList.contains('open')&&!dd.contains(e.target))closeMenu();});
function onSearch(v){searchQ=v;renderList();}
/* 全局搜索：本页（任务）实时来源 */
window.gsLocalProvider=function(q){
  if(!q||!q.trim())return [];
  q=q.trim().toLowerCase();
  return TASKS.filter(function(t){return t.type==='personal'&&!t.done&&(t.title||'').toLowerCase().indexOf(q)>=0;})
    .slice(0,5).map(function(t){var l=listOf(t.list);return {title:t.title,sub:(l?l.name:'')+(t.due?(' · '+dueLabel(t.due)):''),id:t.id};});
};
window.gsLocalPick=function(id){var t=TASKS.find(function(x){return x.id===id;});if(t){if(t.type==='personal')openDetail(id);else onTaskClick(id);}};

/* ===== 顶栏下拉：通知 / 头像 ===== */
let NOTIFS=[
  {ic:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/>',bg:'var(--blue-50)',col:'var(--blue-500)',tt:'<b>林晓</b> 提交的「调休申请」待你审批',tm:'5 分钟前',unread:true},
  {ic:'<path d="M20 6L9 17l-5-5"/>',bg:'var(--success-bg)',col:'var(--success)',tt:'你的「技术峰会差旅报销」已通过',tm:'1 小时前',unread:true},
  {ic:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',bg:'var(--warning-bg)',col:'var(--warning)',tt:'<b>李娜</b> 在「Q2 运营复盘」中 @了你',tm:'今天 09:20',unread:false},
];
function renderNotif(){
  const list=$('npList');
  if(!NOTIFS.length){list.innerHTML='<div class="np-empty">暂无新通知</div>';}
  else list.innerHTML=NOTIFS.map(n=>`<div class="np-item ${n.unread?'unread':''}"><span class="np-ic" style="background:${n.bg}"><svg viewBox="0 0 24 24" fill="none" stroke="${n.col}" stroke-width="1.8">${n.ic}</svg></span><div class="np-tx"><div class="np-tt">${n.tt}</div><div class="np-tm">${n.tm}</div></div></div>`).join('');
  const any=NOTIFS.some(n=>n.unread);
  const dot=document.querySelector('#bellBtn .dot');if(dot)dot.style.display=any?'':'none';
}
function clearNotif(){NOTIFS.forEach(n=>n.unread=false);renderNotif();toast('已全部标记为已读');}
function togglePop(which,e){
  e.stopPropagation();
  const notif=$('popNotif'),user=$('popUser');
  const target=which==='notif'?notif:user,other=which==='notif'?user:notif;
  other.classList.remove('open');
  if(which==='notif'&&!notif.classList.contains('open'))renderNotif();
  target.classList.toggle('open');
}
document.addEventListener('click',e=>{
  ['popNotif','popUser'].forEach(id=>{const p=$(id);if(p&&p.classList.contains('open')&&!p.parentNode.contains(e.target))p.classList.remove('open');});
});
renderNotif();

/* ===== 操作 ===== */
function onTaskClick(id){const t=TASKS.find(x=>x.id===id);if(!t)return;if(t.type==='personal')openDetail(id);else routeOut(id);}
function routeOut(id){const t=TASKS.find(x=>x.id===id);const meta=TYPES[t.type];toast('演示原型：跳转到「'+(meta.route||'对应负责人')+'」处理');}
function toggleDone(id){
  const t=TASKS.find(x=>x.id===id);
  const goingDone=!t.done;
  if(goingDone){
    const row=document.querySelector('.task[data-tid="'+id+'"]');
    if(row && !groupClosed['done']!==undefined){
      row.classList.add('completing');
      const h=row.offsetHeight;
      row.style.maxHeight=h+'px';
      // 强制回流后收起
      requestAnimationFrame(()=>{row.classList.add('collapse');row.style.maxHeight='0px';});
      t.done=true;
      renderRail();renderHead();
      if(detailId===id)fillDetail();
      toast('已完成：'+short(t.title));
      setTimeout(()=>renderList(),360);
      return;
    }
  }
  t.done=!t.done;
  renderRail();renderHead();renderList();
  if(detailId===id)fillDetail();
  toast(t.done?'已完成：'+short(t.title):'已恢复为进行中');
}
function short(s){return s.length>14?s.slice(0,14)+'…':s;}
function delTask(id){if(detailId===id)closeDetail();TASKS=TASKS.filter(t=>t.id!==id);renderRail();renderHead();renderList();toast('已删除任务');}

/* ===== 快速添加 ===== */
/* ===== 就地新建任务 / 分组 ===== */
function startAddTask(el){if(el.classList.contains('editing'))return;el.classList.add('editing');el.querySelector('.gadd-title').focus();}
function addTaskKey(e,el){if(e.key==='Enter'){e.preventDefault();commitAddTask(el);}else if(e.key==='Escape'){el.querySelector('.gadd-title').value='';el.classList.remove('editing');el.querySelector('.gadd-title').blur();}}
function addTaskBlur(el){setTimeout(()=>{if(!document.body.contains(el))return;if(el.contains(document.activeElement))return;if(el.classList.contains('editing'))commitAddTask(el);},150);}
function commitAddTask(el){
  if(!document.body.contains(el))return;
  const inp=el.querySelector('.gadd-title');const dateInp=el.querySelector('.gadd-date');
  const v=inp.value.trim();
  if(!v){el.classList.remove('editing');return;}
  const ctx=JSON.parse(el.dataset.ctx||'{}');const key=el.dataset.key;
  const list=sel.kind==='list'?sel.key:'inbox';
  const due=dateInp.value||ctx.due||'';
  TASKS.push({id:++uid,type:'personal',list,group:ctx.group||'g0',title:v,from:'张伟',due,dueTime:'',start:'',startTime:'',prio:'mid',done:false,remind:'无',repeat:'不重复',subtasks:[],comments:[],desc:'',createdAt:'刚刚'});
  inp.value='';dateInp.value='';
  renderRail();renderHead();renderList();
  setTimeout(()=>{const again=document.querySelector('.gadd[data-key="'+key+'"]');if(again){again.classList.add('editing');again.querySelector('.gadd-title').focus();}},0);
}
function startAddGroup(el){if(el.classList.contains('editing'))return;el.classList.add('editing');el.querySelector('input').focus();}
function addGroupKey(e,el){
  if(e.key==='Enter'){e.preventDefault();const i=el.querySelector('input');const v=i.value.trim();if(!v){el.classList.remove('editing');return;}const ngid='g'+(++uid);GROUPS.push({id:ngid,name:v});sectionOrder.push(ngid);renderList();toast('已新建分组「'+v+'」');}
  else if(e.key==='Escape'){el.querySelector('input').value='';el.classList.remove('editing');}
}

/* ===== 详情面板 ===== */
function curTask(){return TASKS.find(t=>t.id===detailId);}
function openDetail(id){detailId=id;metaEditing=null;$('taskDetail').classList.add('open');document.querySelector('.content').classList.add('detail-open');fillDetail();renderList();}
function closeDetail(){detailId=null;$('taskDetail').classList.remove('open');document.querySelector('.content').classList.remove('detail-open');document.querySelectorAll('.task.sel').forEach(e=>e.classList.remove('sel'));}
function fillDetail(){
  const t=curTask();if(!t)return;
  $('tdHead').classList.toggle('done',t.done);
  $('tdTitle').value=t.title;
  renderMeta();
  $('dDesc').value=t.desc||'';
  renderSubtasks();renderComments();
}
const MIC={
  who:'<circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  start:'<circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/>',
  due:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  remind:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  repeat:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  prio:'<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>',
};
function fmtDateCN(s,time){if(!s)return'';const d=parseDue(s);let r=(d.getMonth()+1)+'月'+d.getDate()+'日';const wd=['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];r+=' '+wd;if(time)r+=' '+time;return r;}
function fmtCell(s,time){
  if(!s)return '';
  const diff=dayDiff(s);let r;
  if(diff===0)r='今天';else if(diff===1)r='明天';else if(diff===-1)r='昨天';
  else{const d=parseDue(s);r=(d.getMonth()+1)+'月'+d.getDate()+'日';}
  if(time)r+=' '+time;return r;
}
function mrow(ic,label,val){return `<div class="mrow"><span class="ml">${svg(MIC[ic])}${label}</span><div class="mv">${val}</div></div>`;}
function dateRowHtml(field,label,ic){
  const t=curTask();const dv=t[field],tv=t[field+'Time'];
  if(metaEditing===field){
    return mrow(ic,label,`<input type="date" class="di" value="${dv||''}" onchange="detailSetDate('${field}',this.value)" /><input type="time" class="di" style="width:88px" value="${tv||''}" onchange="detailSet('${field}Time',this.value)" onblur="stopEdit()" />`);
  }
  if(dv)return mrow(ic,label,`<span class="mval" onclick="editMeta('${field}')">${fmtDateCN(dv,tv)}</span>`);
  return mrow(ic,label,`<span class="mval empty" onclick="editMeta('${field}')">添加${label}</span>`);
}
function renderMeta(){
  const t=curTask();if(!t)return;
  const rem=['无','准时提醒','提前 5 分钟','提前 30 分钟','提前 1 小时','提前 1 天'];
  const rep=['不重复','每天','每周','每月','每个工作日','每年'];
  let h='';
  h+=mrow('who','负责人',`<span class="assignee"><span class="aav">张</span>张伟</span>`);
  h+=mrow('list','清单',`<select class="nsel" onchange="detailSet('list',this.value)">${LISTS.map(l=>`<option value="${l.key}" ${t.list===l.key?'selected':''}>${l.name}</option>`).join('')}</select>`);
  h+=dateRowHtml('start','开始时间','start');
  h+=dateRowHtml('due','截止时间','due');
  h+=mrow('remind','提醒',`<select class="nsel" onchange="detailSet('remind',this.value)">${rem.map(o=>`<option ${t.remind===o?'selected':''}>${o}</option>`).join('')}</select>`);
  h+=mrow('repeat','重复',`<select class="nsel" onchange="detailSet('repeat',this.value)">${rep.map(o=>`<option ${t.repeat===o?'selected':''}>${o}</option>`).join('')}</select>`);
  if(t.msgSource){h+=`<div class="src-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><div><div class="sr-h">来自${t.msgSource.ctx} · ${t.msgSource.from}</div><div class="sr-q">${(t.msgSource.text||'').replace(/</g,'&lt;').slice(0,60)}</div></div></div>`;}
  $('tdMeta').innerHTML=h;
}
function editMeta(field){metaEditing=field;renderMeta();setTimeout(()=>{const el=document.querySelector('#tdMeta input[type=date]');if(el)el.focus();},30);}
function stopEdit(){metaEditing=null;renderMeta();}
function detailSet(field,val){
  const t=curTask();if(!t)return;t[field]=val;
  if(['list','remind','repeat','prio'].indexOf(field)>=0)renderMeta();
  renderRail();renderHead();renderList();
}
function detailSetDate(field,val){const t=curTask();if(!t)return;t[field]=val;renderMeta();renderRail();renderHead();renderList();}
function detailSaveTitle(v){const t=curTask();if(!t)return;t.title=v.trim()||t.title;renderList();}
function detailToggleDone(){if(curTask())toggleDone(detailId);}
function detailDelete(){if(detailId)delTask(detailId);}
function renderSubtasks(){
  const t=curTask();if(!t)return;
  const dn=t.subtasks.filter(s=>s.done).length,tot=t.subtasks.length;
  $('subCount').textContent=tot?dn+'/'+tot:'';
  $('subBar').style.display=tot?'':'none';
  $('subFill').style.width=tot?(dn/tot*100)+'%':'0%';
  $('subList').innerHTML=t.subtasks.map((s,i)=>`<div class="subitem ${s.done?'done':''}"><span class="subck" onclick="toggleSub(${i})">${svg('<path d="M5 12l5 5L20 6"/>',3)}</span><span class="st">${s.t}</span><span class="sx" onclick="delSub(${i})">${svg('<path d="M6 6l12 12M18 6L6 18"/>',2)}</span></div>`).join('');
}
function toggleSub(i){const t=curTask();t.subtasks[i].done=!t.subtasks[i].done;renderSubtasks();renderList();}
function delSub(i){const t=curTask();t.subtasks.splice(i,1);renderSubtasks();renderList();}
function subKey(e){if(e.key!=='Enter')return;const v=$('subInput').value.trim();if(!v)return;curTask().subtasks.push({t:v,done:false});$('subInput').value='';renderSubtasks();renderList();}
function renderComments(){
  const t=curTask();if(!t)return;
  let h=`<div class="cmt"><span class="ca" style="background:${avaColor('张伟')}">张</span><div class="cc"><div><span class="cn">张伟</span><span class="cm">创建了任务 · ${t.createdAt||''}</span></div></div></div>`;
  h+=t.comments.map(c=>`<div class="cmt"><span class="ca" style="background:${avaColor(c.who)}">${c.who.slice(-1)}</span><div class="cc"><div><span class="cn">${c.who}</span><span class="cm">${c.time}</span></div><div class="ct">${c.text}</div></div></div>`).join('');
  h+=`<div class="followers"><span class="fav">张</span>1 人关注</div>`;
  $('cmtList').innerHTML=h;
}
function sendComment(){const t=curTask();if(!t)return;const v=$('cmtInput').value.trim();if(!v)return;t.comments.push({who:'张伟',text:v,time:'刚刚'});$('cmtInput').value='';renderComments();}
function cmtKey(e){if(e.key==='Enter')sendComment();}

/* ===== 新建清单 ===== */
const LIST_COLORS=['#3370FF','#2EA121','#D97A00','#7A4FE0','#0A8B9E','#E0457B'];
let newListColor=LIST_COLORS[0];
function openNewList(){
  newListColor=LIST_COLORS[0];$('listName').value='';
  $('listSwatches').innerHTML=LIST_COLORS.map((c,i)=>`<span class="sw ${i===0?'on':''}" style="background:${c}" onclick="pickListColor('${c}',this)">${svg('<path d="M5 12l5 5L20 6"/>',3)}</span>`).join('');
  $('listScrim').classList.add('open');setTimeout(()=>$('listName').focus(),60);
}
function pickListColor(c,el){newListColor=c;document.querySelectorAll('#listSwatches .sw').forEach(s=>s.classList.remove('on'));el.classList.add('on');}
function closeNewList(){$('listScrim').classList.remove('open');}
function saveNewList(){
  const name=$('listName').value.trim();if(!name){$('listName').focus();return;}
  const key='ls'+(++uid);LISTS.push({key,name,color:newListColor});
  closeNewList();selectList(key);toast('已创建清单「'+name+'」');
}
function delList(key){
  const l=listOf(key);
  TASKS.forEach(t=>{if(t.type==='personal'&&t.list===key)t.list='inbox';});
  LISTS=LISTS.filter(x=>x.key!==key);
  if(sel.kind==='list'&&sel.key===key)selectView('all');
  else{renderRail();renderList();}
  toast('已删除「'+l.name+'」，任务已移至收集箱');
}

/* ===== toast ===== */
let toastTimer;
function toast(msg){const t=$('toast');$('toastMsg').textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if($('listScrim').classList.contains('open'))closeNewList();else if(detailId)closeDetail();}});

/* ===== init ===== */
renderRail();renderHead();renderList();syncToolbar();
