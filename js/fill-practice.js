window.FillPractice = (function () {
  'use strict';
  function normalize(s) { return String(s).normalize('NFKC').replace(/[\s，。！？、；：“”‘’《》〈〉「」『』（）(),.!?;:"'\[\]【】]/g, ''); }
  function shuffled(items) { var a=items.slice(); for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var x=a[i];a[i]=a[j];a[j]=x;}return a; }
  function start(done) {
    var items=shuffled((window.FILL_QUESTIONS||[]).filter(function(q){return q.answers.length;}));
    var index=0, correct=0, checked=false, values=[], root=document.getElementById('app');
    function render() {
      if(index>=items.length){root.innerHTML='<main class="page"><div class="card"><div class="card-body"><h2>本轮随机练习完成</h2><p>共 '+items.length+' 题，答对 '+correct+' 题。</p><button class="btn btn-primary" id="fp-back">返回填空背诵</button></div></div></main>';document.getElementById('fp-back').onclick=done;return;}
      var q=items[index], essay=q.kind==='简答题';
      root.innerHTML='<main class="page"><div class="page-head"><h2>填空随机练习</h2><p>第 '+(index+1)+' / '+items.length+' 题 · 本轮答对 '+correct+' 题</p></div><div class="q-card"><span class="tag tag-plain">'+U.esc(q.section)+'</span><div class="q-stem">'+U.esc(q.stem)+'</div>'+q.answers.map(function(a,i){return '<label style="display:block;margin:12px 0">'+(essay?'默写要点':'第 '+(i+1)+' 空')+'<textarea class="modal-input" style="width:100%;min-height:70px;box-sizing:border-box" data-fp-input="'+i+'" '+(checked?'disabled':'')+'>'+U.esc(values[i]||'')+'</textarea></label>';}).join('')+'<div id="fp-feedback" role="status"></div><div class="q-foot"><button class="btn btn-ghost" id="fp-back">结束练习</button>'+(!checked?'<button class="btn btn-ghost" id="fp-reveal">不会，查看答案</button>':'')+'<button class="btn btn-primary" id="fp-submit">'+(checked?'下一题':'提交核对')+'</button></div></div></main>';
      document.getElementById('fp-back').onclick=done;
      function capture(){values=Array.from(root.querySelectorAll('[data-fp-input]')).map(function(el){return el.value;});}
      function check(reveal){capture();if(!reveal&&values.some(function(v){return !v.trim();}))return U.toast('请填写每个空，或点击“不会，查看答案”');checked=true;var matches=q.answers.map(function(a,i){return !reveal&&!essay&&normalize(values[i])===normalize(a);});var ok=matches.every(Boolean);if(ok){correct++;Store.setFillMastered(q.id,true);}else if(!essay||reveal){Store.setFillMastered(q.id,false);}render();document.getElementById('fp-feedback').innerHTML='<p>'+(essay?'请对照参考要点自评。':ok?'✓ 全部正确，已标记掌握。':'本题保留待复习，请核对以下答案。')+'</p>'+q.answers.map(function(a,i){return '<p>'+(!essay?(matches[i]?'✓ ':'✗ ')+(i+1)+'. ':'')+U.esc(a)+'</p>';}).join('')+(essay&&!reveal?'<button class="btn btn-ghost" id="fp-self">要点答全，标记掌握</button>':'');var self=document.getElementById('fp-self');if(self)self.onclick=function(){Store.setFillMastered(q.id,true);correct++;self.disabled=true;self.textContent='已标记掌握';};}
      var reveal=document.getElementById('fp-reveal');if(reveal)reveal.onclick=function(){check(true);};
      document.getElementById('fp-submit').onclick=function(){if(checked){index++;values=[];checked=false;render();window.scrollTo(0,0);}else check(false);};
    }
    render();window.scrollTo(0,0);
  }
  return {start:start,normalize:normalize,shuffled:shuffled};
})();
