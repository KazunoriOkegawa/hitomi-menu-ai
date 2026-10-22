'use strict';
const MenuPlanner=(()=>{
 const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/生姜/g,'しょうが').replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60)).replace(/[\s・ー]/g,'');
 const families=[['和食','沖縄','北海道・東北','名古屋','関西','九州'],['韓国','中華','台湾'],['洋食','イタリア','フランス','スペイン','アメリカ','メキシコ'],['ベトナム','タイ','インドネシア・マレーシア']];
 const pantry=/油|塩|こしょう|しょうゆ|みそ|酢|酒|水|だし|スープの素|コンソメ|砂糖|みりん|粉|ごま|にんにく|しょうが|バター|レモン汁/;
 const meta=r=>({protein:/鶏|豚|牛|合いびき|ラム/.test(r.ingredients.map(i=>i[0]).filter(n=>!pantry.test(n)).join(' '))?'meat':/えび|鮭|さば|あじ|ツナ|あさり|シーフード/.test(r.ingredients.map(i=>i[0]).join(' '))?'fish':r.ingredients.some(i=>i[0]==='卵')?'egg':r.ingredients.some(i=>i[0].includes('豆腐'))?'tofu':'vegetable',foods:new Set(r.ingredients.map(i=>i[0]).filter(n=>!pantry.test(n))),cold:/サラダ|酢の物|和え|ナムル|ラペ|ライタ|ワカモレ|フムス/.test(r.name)});
 function dishTerms(r){return [r.name,...(r.id==='pork-ginger'?['生姜焼き','しょうが焼き','豚の生姜焼き','豚肉のしょうが炒め']:r.id==='potato'?['ポテトサラダ']:[])];}
 function matchesDish(r,text){const q=normalize(text);return !q||dishTerms(r).some(name=>normalize(name).includes(q));}
 function build(recipes,options={}){
  const {diet='all',cuisine='all',purpose='all',text='',extra='',category='all',favorites=null,matchIngredient=()=>false,variants=9,limit=120}=options;
  const eligible=recipes.filter(r=>(diet!=='low'||r.low)&&['主菜','副菜'].includes(r.category));
  const features=new Map(eligible.map(r=>[r.id,meta(r)]));
  const exact=text?new Set(recipes.filter(r=>dishTerms(r).some(name=>normalize(name)===normalize(text))).map(r=>r.id)):new Set();
  let anchors=eligible.filter(r=>(cuisine==='all'||r.cuisine===cuisine)&&(purpose==='all'||r.purposes.includes(purpose))&&(category==='all'||r.category===category)&&(!favorites||favorites.includes(r.id))&&(!text||(exact.size?exact.has(r.id):matchesDish(r,text)||matchIngredient(r,text)))&&(!extra||matchesDish(r,extra)||matchIngredient(r,extra)));
  if(!text&&!extra&&category==='all'){const preferred=anchors.filter(r=>r.category==='主菜');if(preferred.length)anchors=preferred;}
  anchors.sort((a,b)=>(a.category==='主菜'?0:1)-(b.category==='主菜'?0:1));
  const mains=eligible.filter(r=>r.category==='主菜'),sides=eligible.filter(r=>r.category==='副菜');
  const affinity=(a,b)=>a.cuisine===b.cuisine?12:families.some(f=>f.includes(a.cuisine)&&f.includes(b.cuisine))?5:0;
  function pairScore(main,a,b){const m=features.get(main.id),x=features.get(a.id),y=features.get(b.id);let score=affinity(main,a)+affinity(main,b);if(x.cold!==y.cold)score+=7;if(x.protein==='vegetable')score+=4;if(y.protein==='vegetable')score+=4;if(x.protein===m.protein&&x.protein!=='vegetable')score-=5;if(y.protein===m.protein&&y.protein!=='vegetable')score-=5;for(const food of x.foods){if(y.foods.has(food))score-=5;if(m.foods.has(food))score-=2;}for(const food of y.foods)if(m.foods.has(food))score-=2;if(/焼|炒|ソテ|ステーキ/.test(main.name)&&[a,b].some(r=>/酢|ラペ|ライタ/.test(r.name)))score+=5;if(/ごま/.test(a.name)&&/ごま/.test(b.name))score-=8;return score;}
  const byAnchor=anchors.map(anchor=>{
   const combos=[];
   if(anchor.category==='主菜')for(let i=0;i<sides.length;i++)for(let j=i+1;j<sides.length;j++)combos.push({items:[anchor,sides[i],sides[j]],score:pairScore(anchor,sides[i],sides[j])});
   else for(const main of mains)for(const side of sides)if(side.id!==anchor.id)combos.push({items:[main,anchor,side],score:pairScore(main,anchor,side)+affinity(anchor,main)});
   if(diet==='low')for(let i=combos.length-1;i>=0;i--)if(combos[i].items.reduce((sum,r)=>sum+r.carbs,0)>40)combos.splice(i,1);
   combos.sort((a,b)=>b.score-a.score||a.items.map(r=>r.id).join().localeCompare(b.items.map(r=>r.id).join()));
   const chosen=[],used=new Set();
   // 同じ副菜の繰り返しより、別の食材・別の主菜を含む提案を優先。
   while(chosen.length<variants&&combos.length){let bestIndex=0,best=-Infinity;for(let i=0;i<Math.min(combos.length,150);i++){const c=combos[i],novelty=c.items.filter(r=>r.id!==anchor.id&&!used.has(r.id)).length,score=c.score+novelty*5;if(score>best){best=score;bestIndex=i;}}const chosenCombo=combos.splice(bestIndex,1)[0];chosen.push(chosenCombo);chosenCombo.items.forEach(r=>used.add(r.id));}
   return chosen.map(c=>({ids:c.items.map(r=>r.id),anchorId:anchor.id,key:c.items.map(r=>r.id).join('|'),carbs:Math.round(c.items.reduce((n,r)=>n+r.carbs,0)*10)/10,crossCuisine:c.items.some(r=>r.cuisine!==anchor.cuisine),reason:c.items.some(r=>r.cuisine!==anchor.cuisine)?'基準の料理に合わせ、別ジャンルの副菜・主菜も組み合わせています。':'同じジャンルで、主な食材や調理法が重なりにくい組み合わせを優先。'}));
  });
  const result=[],seen=new Set();for(let v=0;v<variants;v++)for(const list of byAnchor){const menu=list[v];if(!menu)continue;const key=[...menu.ids].sort().join('|');if(!seen.has(key)){seen.add(key);result.push(menu);if(result.length>=limit)return result;}}
  return result;
 }
 return {build,matchesDish,normalize};
})();
