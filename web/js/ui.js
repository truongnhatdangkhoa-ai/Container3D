/* ui.js — khung điện thoại: tab dưới, bảng chức năng, nút Back của Android, chọn giao diện. Không đụng thuật toán (container-3d.js). */
(function(){
'use strict';
var $=function(id){return document.getElementById(id);};
var views={in:$('v-in'),'3d':$('v-3d'),res:$('v-res')}, cur='in';
var tabBtns=[].slice.call(document.querySelectorAll('.tabs button[data-tab]'));

/* ---------- lớp (layer) gắn với lịch sử trình duyệt: nút Back của Android đóng lớp trên cùng ---------- */
var layers=[];
function push(name,close){history.pushState({c3d:layers.length+1},'');layers.push({name:name,close:close});}
function top(){return layers[layers.length-1];}
function closeTop(after){var t=top();if(!t){if(after)after();return;}t.after=after;history.back();}
window.addEventListener('popstate',function(){
  var l=layers.pop();if(!l)return;
  try{l.close();}catch(e){}
  if(l.after)setTimeout(l.after,0);
});

/* ---------- tab ---------- */
function show(tab){
  cur=tab;
  Object.keys(views).forEach(function(k){views[k].classList.toggle('on',k===tab);});
  tabBtns.forEach(function(b){b.classList.toggle('on',b.dataset.tab===tab);});
  var v=views[tab];if(v)v.scrollTop=0;
}
function goTab(tab){
  if(tab===cur)return;
  var t=top();
  if(tab==='in'){ if(t&&t.name==='tab')history.back(); else show('in'); return; }
  if(cur==='in'&&!(t&&t.name==='tab'))push('tab',function(){show('in');});
  show(tab);
}
tabBtns.forEach(function(b){b.addEventListener('click',function(){goTab(b.dataset.tab);});});
/* nút Tính: JS cũ tự gắn onclick=calc; ở đây chỉ chuyển sang xem 3D nếu đang ở màn nhập liệu */
$('c3dCalc').addEventListener('click',function(){if(cur==='in')setTimeout(function(){goTab('3d');},60);});

/* ---------- bảng chức năng ---------- */
var sheet=$('sheet');
function openSheet(){if(!sheet.hidden)return;sheet.hidden=false;requestAnimationFrame(function(){sheet.classList.add('open');});markTheme();push('sheet',function(){sheet.classList.remove('open');setTimeout(function(){if(!sheet.classList.contains('open'))sheet.hidden=true;},220);});}
$('moreBtn').addEventListener('click',openSheet);$('menuBtn').addEventListener('click',openSheet);
sheet.addEventListener('click',function(e){if(e.target===sheet)closeTop();});
/* bấm một chức năng: đóng bảng xong mới chạy (để hộp thoại mới của chức năng đó không bị nút Back đóng nhầm) */
sheet.addEventListener('click',function(e){
  var b=e.target.closest('button.sheet-b');if(!b||b._go)return;
  e.stopPropagation();e.preventDefault();
  closeTop(function(){b._go=true;b.click();b._go=false;});
},true);

/* ---------- hộp thoại do JS cũ mở/đóng (#c3dModal) ---------- */
var modal=$('c3dModal');
new MutationObserver(function(){
  var t=top();
  if(!modal.hidden&&!(t&&t.name==='modal'))push('modal',function(){modal.hidden=true;});
  else if(modal.hidden&&t&&t.name==='modal')history.back();
}).observe(modal,{attributes:true,attributeFilter:['hidden']});


/* ---------- vuốt xuống để đóng bảng chức năng và hộp thoại (khi nội dung đang ở đầu); vuốt lên/xuống trong nội dung vẫn cuộn bình thường ---------- */
function swipeClose(panel,dismiss){
  var y0=0,x0=0,dy=0,t0=0,drag=false,on=false;
  panel.addEventListener('touchstart',function(e){
    if(e.touches.length!==1||e.target.closest('input,textarea,select'))
      {on=false;return;}
    y0=e.touches[0].clientY;x0=e.touches[0].clientX;dy=0;t0=Date.now();drag=false;on=true;
  },{passive:true});
  panel.addEventListener('touchmove',function(e){
    if(!on)return;var t=e.touches[0],d=t.clientY-y0;
    if(!drag){
      if(d>6&&Math.abs(d)>Math.abs(t.clientX-x0)&&panel.scrollTop<=0){drag=true;y0=t.clientY;d=0;panel.style.transition='none';}
      else return;
    }
    dy=Math.max(0,d);panel.style.transform='translateY('+dy+'px)';
    if(e.cancelable)e.preventDefault();
  },{passive:false});
  function end(){
    on=false;if(!drag)return;drag=false;
    panel.style.transition='';
    if(dy>90||(dy>40&&Date.now()-t0<250)){
      panel.style.transform='translateY(100%)';dismiss();
      setTimeout(function(){panel.style.transform='';},500);
    }else panel.style.transform='';
  }
  panel.addEventListener('touchend',end);panel.addEventListener('touchcancel',end);
}
swipeClose(sheet.querySelector('.sheet'),function(){closeTop();});
swipeClose($('c3dDlg'),function(){if(!modal.hidden)modal.hidden=true;});

/* ---------- giao diện Sáng / Tối ---------- */
var mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
function saved(){try{var t=localStorage.getItem('c3d-theme');return t==='light'||t==='dark'?t:'auto';}catch(e){return'auto';}}
function apply(v){document.documentElement.setAttribute('data-theme',v==='auto'?(mq&&mq.matches?'dark':'light'):v);}
function markTheme(){var s=saved();[].forEach.call($('themeSeg').children,function(b){b.classList.toggle('on',b.dataset.v===s);});}
$('themeSeg').addEventListener('click',function(e){
  var b=e.target.closest('button[data-v]');if(!b)return;
  try{if(b.dataset.v==='auto')localStorage.removeItem('c3d-theme');else localStorage.setItem('c3d-theme',b.dataset.v);}catch(x){}
  apply(b.dataset.v);markTheme();
});
if(mq&&mq.addEventListener)mq.addEventListener('change',function(){if(saved()==='auto')apply('auto');});

/* ---------- ngôn ngữ Tiếng Việt / English ---------- */
function markLang(){var l=window.C3D_LANG?C3D_LANG():'vi';[].forEach.call($('langSeg').children,function(b){b.classList.toggle('on',b.dataset.v===l);});var a=$('privLink');if(a)a.setAttribute('href','privacy.html?lang='+l);}
$('langSeg').addEventListener('click',function(e){var b=e.target.closest('button[data-v]');if(b&&window.C3D_I18N){C3D_I18N.set(b.dataset.v);markLang();}});
window.addEventListener('c3d-lang',markLang);markLang();

/* ---------- bàn phím số cho ô nhập số liệu (JS cũ vẽ lại ô nhập liên tục) ---------- */
function numpad(root){[].forEach.call(root.querySelectorAll('input[type=number]:not([inputmode])'),function(i){i.setAttribute('inputmode','decimal');});}
var side=$('c3dSide');numpad(side);
new MutationObserver(function(){numpad(side);}).observe(side,{childList:true,subtree:true});
})();
