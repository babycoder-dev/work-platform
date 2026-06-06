/* ============================================================
   全局搜索（跨模块）—— 共享组件，注入各模块顶栏搜索框
   - 统一的结果浮层：本页结果（可选）+ 跨模块结果分组
   - 键盘：↑/↓ 选择，Enter 打开，Esc 关闭
   - 模块可定义 window.gsLocalProvider(q) 注入"本页"实时结果，
     并定义 window.gsLocalPick(id) 处理点选。
   ============================================================ */
(function(){
  // —— 跨模块演示索引 ——
  var I = function(cat,icon,bg,col,title,sub,href){return {cat:cat,icon:icon,bg:bg,col:col,title:title,sub:sub,href:href};};
  var IC={
    approval:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16"/>',
    member:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
    task:'<path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    msg:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    app:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    page:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  var B={blue:['var(--blue-50)','var(--blue-500)'],green:['var(--success-bg)','var(--success)'],orange:['var(--warning-bg)','var(--warning)'],purple:['var(--purple-bg)','var(--purple)'],cyan:['var(--cyan-bg)','var(--cyan)'],gray:['var(--fill-2)','var(--ink-3)']};
  var INDEX=[
    I('审批',IC.approval,B.blue[0],B.blue[1],'4 月差旅费用报销','报销 · 陈杰 · 审批中','审批中心.html'),
    I('审批',IC.approval,B.blue[0],B.blue[1],'年中采购：办公设备一批','采购 · 周涛 · 审批中','审批中心.html'),
    I('审批',IC.approval,B.blue[0],B.blue[1],'调休申请（5 月 1-3 日）','请假 · 林晓 · 审批中','审批中心.html'),
    I('审批',IC.approval,B.blue[0],B.blue[1],'Q2 市场推广费用预算','报销 · 赵敏 · 审批中','审批中心.html'),
    I('成员',IC.member,B.green[0],B.green[1],'张伟','平台运营组 · 在岗','组织成员.html'),
    I('成员',IC.member,B.green[0],B.green[1],'李娜','平台运营组 · 主管','组织成员.html'),
    I('成员',IC.member,B.green[0],B.green[1],'王强','财务部 · 出差中','组织成员.html'),
    I('成员',IC.member,B.green[0],B.green[1],'赵敏','财务部 · 在岗','组织成员.html'),
    I('成员',IC.member,B.green[0],B.green[1],'周涛','研发中心 · 在岗','组织成员.html'),
    I('成员',IC.member,B.green[0],B.green[1],'许静','人力资源部 · 休假中','组织成员.html'),
    I('任务',IC.task,B.orange[0],B.orange[1],'整理运营侧需求清单发吴昊','运营项目 · 今天截止','我的待办.html'),
    I('任务',IC.task,B.orange[0],B.orange[1],'跟进候选人背调','招聘 · 本周','我的待办.html'),
    I('任务',IC.task,B.orange[0],B.orange[1],'完善运营专员 JD','招聘 · 6 月 19 日','我的待办.html'),
    I('消息',IC.msg,B.purple[0],B.purple[1],'吴昊','下周三技术评审会…','消息中心.html'),
    I('消息',IC.msg,B.purple[0],B.purple[1],'李娜 在「Q2 运营复盘」@了你','这块数据麻烦补充一下结论','消息中心.html'),
    I('应用',IC.app,B.cyan[0],B.cyan[1],'协同办公平台','OA · 运行中','工作台.html'),
    I('应用',IC.app,B.cyan[0],B.cyan[1],'人力资源系统','HR · 维护中','工作台.html'),
    I('应用',IC.app,B.cyan[0],B.cyan[1],'财务报销中心','FI · 运行中','工作台.html'),
    I('页面',IC.page,B.gray[0],B.gray[1],'工作台','概览首页','工作台.html'),
    I('页面',IC.page,B.gray[0],B.gray[1],'审批中心','发起与处理审批','审批中心.html'),
    I('页面',IC.page,B.gray[0],B.gray[1],'组织成员','部门与人员管理','组织成员.html'),
    I('页面',IC.page,B.gray[0],B.gray[1],'我的待办','聚合待办','我的待办.html'),
    I('页面',IC.page,B.gray[0],B.gray[1],'消息中心','消息与会话','消息中心.html')
  ];

  // —— 样式注入 ——
  var css=''
   +'.search-box{position:relative;}'
   +'.gs-pop{position:absolute;left:0;right:0;top:calc(100% + 8px);background:#fff;border:1px solid var(--line-1);border-radius:10px;box-shadow:var(--shadow-pop);z-index:130;max-height:60vh;overflow:auto;display:none;width:380px;}'
   +'.gs-pop.open{display:block;}'
   +'.gs-grp-h{font-size:11px;font-weight:600;color:var(--ink-4);padding:10px 14px 5px;letter-spacing:.3px;}'
   +'.gs-item{display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;}'
   +'.gs-item:hover,.gs-item.on{background:var(--blue-50);}'
   +'.gs-ic{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none;}'
   +'.gs-ic svg{width:16px;height:16px;}'
   +'.gs-tx{min-width:0;flex:1;}'
   +'.gs-tt{font-size:13px;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
   +'.gs-tt em{font-style:normal;color:var(--blue-600);font-weight:600;background:var(--blue-50);border-radius:2px;}'
   +'.gs-sub{font-size:12px;color:var(--ink-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}'
   +'.gs-cat{font-size:11px;color:var(--ink-4);background:var(--fill-2);border-radius:var(--r-xs);padding:1px 6px;flex:none;}'
   +'.gs-empty{padding:28px 14px;text-align:center;color:var(--ink-4);font-size:13px;}'
   +'.gs-foot{display:flex;align-items:center;gap:12px;padding:8px 14px;border-top:1px solid var(--line-2);font-size:11px;color:var(--ink-4);position:sticky;bottom:0;background:#fff;}'
   +'.gs-foot kbd{font-family:var(--font);background:var(--fill-2);border:1px solid var(--line-1);border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:11px;color:var(--ink-3);}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function hl(s,q){var e=esc(s);if(!q)return e;try{var re=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');return e.replace(re,'<em>$1</em>');}catch(_){return e;}}

  var box=document.querySelector('.topbar .search-box');
  if(!box)return;
  var input=box.querySelector('input');
  if(!input)return;
  var pop=document.createElement('div');pop.className='gs-pop';box.appendChild(pop);
  var flat=[],activeIdx=-1;

  function build(q){
    q=q.trim();
    var groups=[];
    // 本页（可选实时来源）
    if(typeof window.gsLocalProvider==='function'){
      var loc=window.gsLocalProvider(q)||[];
      if(loc.length)groups.push({cat:'本页',items:loc.map(function(o){return {cat:'本页',icon:IC.task,bg:B.orange[0],col:B.orange[1],title:o.title,sub:o.sub||'',local:o.id};})});
    }
    if(q){
      var hits=INDEX.filter(function(it){return (it.title+it.sub+it.cat).toLowerCase().indexOf(q.toLowerCase())>=0;});
      var order=['审批','成员','任务','消息','应用','页面'],byCat={};
      hits.forEach(function(it){(byCat[it.cat]=byCat[it.cat]||[]).push(it);});
      order.forEach(function(c){if(byCat[c])groups.push({cat:c,items:byCat[c].slice(0,5)});});
    }
    return groups;
  }
  function render(q){
    var groups=build(q);
    flat=[];activeIdx=-1;
    if(!q.trim()&&!groups.length){pop.classList.remove('open');return;}
    var html='';
    if(!groups.length){html='<div class="gs-empty">没有找到与「'+esc(q)+'」相关的结果</div>';}
    else{
      groups.forEach(function(g){
        html+='<div class="gs-grp-h">'+g.cat+'</div>';
        g.items.forEach(function(it){
          var i=flat.length;flat.push(it);
          html+='<div class="gs-item" data-i="'+i+'"><span class="gs-ic" style="background:'+it.bg+'"><svg viewBox="0 0 24 24" fill="none" stroke="'+it.col+'" stroke-width="1.8">'+it.icon+'</svg></span>'
              +'<div class="gs-tx"><div class="gs-tt">'+hl(it.title,q)+'</div>'+(it.sub?'<div class="gs-sub">'+hl(it.sub,q)+'</div>':'')+'</div>'
              +'<span class="gs-cat">'+it.cat+'</span></div>';
        });
      });
      html+='<div class="gs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></div>';
    }
    pop.innerHTML=html;pop.classList.add('open');
    pop.querySelectorAll('.gs-item').forEach(function(el){el.onclick=function(){pick(+el.dataset.i);};});
  }
  function pick(i){
    var it=flat[i];if(!it)return;
    if(it.local!=null){if(typeof window.gsLocalPick==='function')window.gsLocalPick(it.local);close();return;}
    if(it.href)location.href=it.href;
  }
  function setActive(n){
    var items=pop.querySelectorAll('.gs-item');if(!items.length)return;
    if(activeIdx>=0&&items[activeIdx])items[activeIdx].classList.remove('on');
    activeIdx=(n+items.length)%items.length;
    items[activeIdx].classList.add('on');
    items[activeIdx].scrollIntoView({block:'nearest'});
  }
  function close(){pop.classList.remove('open');activeIdx=-1;}

  input.addEventListener('input',function(){render(input.value);});
  input.addEventListener('focus',function(){if(input.value.trim()||typeof window.gsLocalProvider==='function')render(input.value);});
  input.addEventListener('keydown',function(e){
    if(!pop.classList.contains('open'))return;
    if(e.key==='ArrowDown'){e.preventDefault();setActive(activeIdx+1);}
    else if(e.key==='ArrowUp'){e.preventDefault();setActive(activeIdx-1);}
    else if(e.key==='Enter'){e.preventDefault();pick(activeIdx>=0?activeIdx:0);}
    else if(e.key==='Escape'){close();input.blur();}
  });
  document.addEventListener('click',function(e){if(!box.contains(e.target))close();});
  // ⌘K / Ctrl+K 聚焦
  document.addEventListener('keydown',function(e){
    if((e.metaKey||e.ctrlKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();input.focus();input.select();}
  });
})();
