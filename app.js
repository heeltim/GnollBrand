// ===== GLOBALS =====
let tool='select', zoom=1, panX=0, panY=0;
let spacePan=false;
let snapOn=true, gridSize=8, gridVisible=false;
let gradType='none', gradCnt=0;
let undoStack=[], redoStack=[];
let selectedEl=null;
let isDrawing=false, drawEl=null, startX=0, startY=0;
let isDragging=false, dragOffX=0, dragOffY=0, bboxDS=null;
let isResizing=false, resizeHandle=null;
let isRotating=false, rotCX=0, rotCY=0, rotStartA=0, rotStartDeg=0;
let isPanning=false, panMX=0, panMY=0, panOX=0, panOY=0;
let polyPts=[], pathD='';
let textPt=null, elIdN=200;
let selBBox=null, aspectRatio=null;
let hiddenSet=new Set();
// multi-select (rubber band)
let isRubber=false, rubberX=0, rubberY=0;
let multiSel=[];

// text tool state (declared early to avoid TDZ)
let textBoxDraft = null;
let textEdit = null;
let textPointerDraft = null;

const SVGEL=document.getElementById('svg-canvas');
const CONT=document.getElementById('svg-content');
const TXSVG=document.getElementById('txsvg');
const GSVG=document.getElementById('guidsvg');
const CW=document.getElementById('canvas-wrap');
const VP=document.getElementById('canvas-viewport');
// text overlay UX: auto-grow + keep size in point mode
(function(){
  const ta=document.getElementById('txtin');
  if(!ta) return;
  ta.addEventListener('input',()=>{
    if(ta.style.display==='none') return;
    if(textOverlayMode==='point' || textOverlayMode==='edit'){
      ta.style.width = 'auto';
      ta.style.height = 'auto';
      const w=Math.min(Math.max(120, ta.scrollWidth+2), Math.round(CW.clientWidth*0.85));
      const h=Math.min(Math.max(30, ta.scrollHeight+2), Math.round(CW.clientHeight*0.6));
      ta.style.width = w+'px';
      ta.style.height = h+'px';
    }
  });
})();


// ===== COORDS =====
function svgPt(e){
  // Robust conversion from screen coords to SVG user coords (handles CSS transforms/zoom/pan).
  try{
    const pt = SVGEL.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = SVGEL.getScreenCTM();
    if(ctm){
      const p = pt.matrixTransform(ctm.inverse());
      return {x:p.x, y:p.y};
    }
  }catch(err){}
  // Fallback
  const r=SVGEL.getBoundingClientRect();
  return {x:(e.clientX-r.left)/zoom, y:(e.clientY-r.top)/zoom};
}
function snp(v){if(!snapOn)return Math.round(v*10)/10;return Math.round(v/gridSize)*gridSize;}
function hex(c){
  if(!c||c==='none'||c.startsWith('url'))return'#000000';
  if(/^#[0-9a-f]{6}$/i.test(c))return c;
  const d=document.createElement('div');d.style.color=c;
  document.body.appendChild(d);const cs=getComputedStyle(d).color;document.body.removeChild(d);
  const m=cs.match(/\d+/g);if(!m)return'#000000';
  return'#'+m.slice(0,3).map(x=>parseInt(x).toString(16).padStart(2,'0')).join('');
}
const TOOL_NAMES={select:'Selecionar',move:'Mover',rect:'Retângulo',rrect:'Ret. Arredondado',ellipse:'Elipse',line:'Linha',polyline:'Polilinha',polygon:'Polígono',star:'Estrela',path:'Lápis',text:'Texto'};


const FREE_ICON_SET=[
  {name:'home',vb:'0 0 24 24',paths:['M3 10.5 12 3l9 7.5','M5.5 9.5V21h13V9.5']},
  {name:'search',vb:'0 0 24 24',paths:['M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16','m21 21-4.3-4.3']},
  {name:'sparkles',vb:'0 0 24 24',paths:['M12 3l1.9 3.9L18 8.8l-4.1 1.8L12 14.5l-1.9-3.9L6 8.8l4.1-1.9z','M5 16l.9 1.9L8 18.9 5.9 20 5 22l-.9-2-2.1-1.1L4.1 18z','M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1z']},
  {name:'heart',vb:'0 0 24 24',paths:['m12 20.5-1.2-1.1C5.4 14.4 2 11.3 2 7.5A4.5 4.5 0 0 1 6.5 3c2 0 3.1.9 4.1 2 1-1.1 2.1-2 4.1-2A4.5 4.5 0 0 1 19 7.5c0 3.8-3.4 6.9-8.8 11.9z']},
  {name:'camera',vb:'0 0 24 24',paths:['M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2','M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8']},
  {name:'bolt',vb:'0 0 24 24',paths:['M13 2 4 14h6l-1 8 9-12h-6z']},
  {name:'palette',vb:'0 0 24 24',paths:['M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H11a3 3 0 0 1 0-6h5a4 4 0 0 0 0-8z','M7 11h.01','M8 7h.01','M12 6h.01','M16 7h.01']},
  {name:'moon',vb:'0 0 24 24',paths:['M21 12.6A9 9 0 1 1 11.4 3a7 7 0 1 0 9.6 9.6z']},
  {name:'sun',vb:'0 0 24 24',paths:['M12 4V2','M12 22v-2','M4.93 4.93 3.5 3.5','M20.5 20.5 19.07 19.07','M4 12H2','M22 12h-2','M4.93 19.07 3.5 20.5','M20.5 3.5l-1.43 1.43','M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10']},
  {name:'globe',vb:'0 0 24 24',paths:['M3 12h18','M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9','M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18']},
  {name:'message',vb:'0 0 24 24',paths:['M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z']},
  {name:'briefcase',vb:'0 0 24 24',paths:['M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z','M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2']}
];

function _iconSvgMarkup(icon){
  return `<svg viewBox="${icon.vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon.paths.map(d=>`<path d="${d}"></path>`).join('')}</svg>`;
}

function renderIconLibrary(query=''){
  const grid=document.getElementById('icon-grid');
  if(!grid) return;
  const q=(query||'').trim().toLowerCase();
  const items=FREE_ICON_SET.filter(ic=>!q||ic.name.includes(q));
  grid.innerHTML='';
  items.forEach(icon=>{
    const btn=document.createElement('button');
    btn.className='icon-btn';
    btn.title='Inserir '+icon.name;
    btn.innerHTML=_iconSvgMarkup(icon);
    btn.addEventListener('click',()=>insertIcon(icon.name));
    grid.appendChild(btn);
  });
}
function filterIcons(q){renderIconLibrary(q);}

function insertIcon(name){
  const icon=FREE_ICON_SET.find(i=>i.name===name);
  if(!icon) return;
  saveState();
  const w=(parseInt(document.getElementById('cw').value)||800);
  const h=(parseInt(document.getElementById('ch').value)||600);
  const size=Math.max(36,Math.round(Math.min(w,h)*0.12));
  const g=mkSVG('g',{});
  g.setAttribute('transform',`translate(${Math.round(w/2-size/2)} ${Math.round(h/2-size/2)})`);
  const vb=icon.vb.split(' ').map(Number);
  const scale=size/(vb[2]||24);
  icon.paths.forEach(d=>{
    const p=mkSVG('path',{d,fill:'none',stroke:gStroke()==='none'?'#111111':gStroke(),'stroke-width':Math.max(1.5,2/scale),'stroke-linecap':'round','stroke-linejoin':'round'});
    p.removeAttribute('data-s');
    p.removeAttribute('id');
    p.setAttribute('transform',`scale(${scale})`);
    g.appendChild(p);
  });
  CONT.appendChild(g);act(g);selectEl(g);updateLayers();updateTX();
}

// ===== TOOLS =====
function setTool(t){
  finishPoly();finishPath();
  tool=t;
  document.querySelectorAll('.t-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tool-'+t)?.classList.add('active');
  const C={select:'default',move:'grab',rect:'crosshair',rrect:'crosshair',ellipse:'crosshair',line:'crosshair',polyline:'crosshair',polygon:'crosshair',star:'crosshair',path:'crosshair',text:'text'};
  SVGEL.style.cursor=C[t]||'default';
  document.getElementById('poly-sec').style.display=(t==='polygon'||t==='star')?'block':'none';
  document.getElementById('st-t').textContent=TOOL_NAMES[t]||t;
}

// ===== VIEWPORT =====
function updateVP(){
  VP.style.transform=`translate(${panX}px,${panY}px) translate(-50%,-50%) scale(${zoom})`;
  document.getElementById('zoom-lbl').textContent=Math.round(zoom*100)+'%';
  updateTX();updateGuides();_repositionTextOverlay();
}
function zoomIn(){zoom=Math.min(zoom*1.25,20);updateVP();}
function zoomOut(){zoom=Math.max(zoom/1.25,0.04);updateVP();}
function fitCanvas(){
  const w=parseInt(document.getElementById('cw').value)||800,h=parseInt(document.getElementById('ch').value)||600;
  const aw=CW.clientWidth-80,ah=CW.clientHeight-80;
  zoom=Math.min(aw/w,ah/h,1);panX=0;panY=0;updateVP();
}
function resizeCanvas(){
  const w=parseInt(document.getElementById('cw').value)||800,h=parseInt(document.getElementById('ch').value)||600;
  SVGEL.setAttribute('width',w);SVGEL.setAttribute('height',h);SVGEL.setAttribute('viewBox',`0 0 ${w} ${h}`);
  document.getElementById('bg-rect').setAttribute('width',w);document.getElementById('bg-rect').setAttribute('height',h);
  document.getElementById('st-c').textContent=`${w}×${h}`;
  resizeTX();
}
function applyPreset(v){if(!v)return;const[w,h]=v.split(',').map(Number);document.getElementById('cw').value=w;document.getElementById('ch').value=h;resizeCanvas();fitCanvas();}

// ===== ELEMENT FACTORY =====
let _idN=200;
function mkSVG(tag,attrs){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  if(attrs)for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);
  el.setAttribute('id','el-'+(_idN++));el.setAttribute('data-s','1');
  return el;
}
function act(el){el.style.cursor='move';el.addEventListener('mousedown',onElMD);}

// ===== FILL/STROKE GETTERS =====
function gFill(){if(document.getElementById('fill-sw').dataset.none==='1')return'none';return document.getElementById('fc').value;}
function gStroke(){if(document.getElementById('stk-sw').dataset.none==='1')return'none';return document.getElementById('sc').value;}
function gStW(){return document.getElementById('sw').value||1;}

// ===== MOUSE EVENTS =====
function onElMD(e){
  if(tool!=='select')return;
  e.stopPropagation();
  const el=e.currentTarget;
  selectEl(el);
  isDragging=true;
  const sc=svgPt(e);
  const b=getBB(el);
  dragOffX=sc.x-b.x;dragOffY=sc.y-b.y;
  bboxDS={...b};
}

function cwDown(e){
  if(e.button===0 && spacePan){
    isPanning=true;SVGEL.style.cursor='grabbing';
    panMX=e.clientX;panMY=e.clientY;panOX=panX;panOY=panY;e.preventDefault();return;
  }
  if(e.button===1||(e.button===0&&e.altKey)){
    isPanning=true;SVGEL.style.cursor='grabbing';
    panMX=e.clientX;panMY=e.clientY;panOX=panX;panOY=panY;e.preventDefault();return;
  }
  if(tool==='move'){isPanning=true;SVGEL.style.cursor='grabbing';panMX=e.clientX;panMY=e.clientY;panOX=panX;panOY=panY;return;}
  const sc=svgPt(e);const sx=snp(sc.x),sy=snp(sc.y);
  if(tool==='text'){
    textPointerDraft={x:sc.x,y:sc.y,dragging:false};
    return;
  }
  if(tool==='polyline'||tool==='polygon'||tool==='star'){
    if(!isDrawing){saveState();polyPts=[sx,sy];isDrawing=true;drawEl=mkSVG('polygon',{points:`${sx},${sy}`,fill:gFill(),stroke:gStroke(),'stroke-width':gStW()});CONT.appendChild(drawEl);}
    else{polyPts.push(sx,sy);drawEl.setAttribute('points',polyPts.join(' '));}
    return;
  }
  if(tool==='path'){
    if(!isDrawing){saveState();pathD=`M ${sx} ${sy}`;isDrawing=true;drawEl=mkSVG('path',{d:pathD,fill:'none',stroke:gStroke(),'stroke-width':gStW(),'stroke-linecap':'round','stroke-linejoin':'round'});CONT.appendChild(drawEl);}
    else{pathD+=` L ${sx} ${sy}`;drawEl.setAttribute('d',pathD);}
    return;
  }
  if(tool==='select'){
    const tgt=e.target;
    if(tgt===SVGEL||tgt===document.getElementById('bg-rect')){selectEl(null);}
    return;
  }
  saveState();startX=sx;startY=sy;isDrawing=true;
  if(tool==='rect')drawEl=mkSVG('rect',{x:sx,y:sy,width:0,height:0,fill:gFill(),stroke:gStroke(),'stroke-width':gStW()});
  else if(tool==='rrect')drawEl=mkSVG('rect',{x:sx,y:sy,width:0,height:0,rx:10,ry:10,fill:gFill(),stroke:gStroke(),'stroke-width':gStW()});
  else if(tool==='ellipse')drawEl=mkSVG('ellipse',{cx:sx,cy:sy,rx:1,ry:1,fill:gFill(),stroke:gStroke(),'stroke-width':gStW()});
  else if(tool==='line')drawEl=mkSVG('line',{x1:sx,y1:sy,x2:sx,y2:sy,stroke:gStroke(),'stroke-width':gStW(),'stroke-linecap':'round'});
  if(drawEl)CONT.appendChild(drawEl);
}

function cwMove(e){
  const sc=svgPt(e);
  document.getElementById('coords').textContent=`x: ${Math.round(sc.x)}  y: ${Math.round(sc.y)}`;
  if(isPanning){panX=panOX+(e.clientX-panMX);panY=panOY+(e.clientY-panMY);updateVP();return;}
  if(isResizing){doResize(e,sc);return;}
  if(isRotating){doRotate(e);return;}
  if(isDragging&&selectedEl){doDrag(e,sc);return;}
  // text tool: click creates artistic text, drag creates text box
  if(tool==='text' && textPointerDraft){
    const dx=sc.x-textPointerDraft.x, dy=sc.y-textPointerDraft.y;
    if(!textPointerDraft.dragging && Math.hypot(dx,dy)>=4){
      textPointerDraft.dragging=true;
      startTextBoxDraft(null,{x:textPointerDraft.x,y:textPointerDraft.y});
      isDrawing=true;
      drawEl=null;
    }
    if(textPointerDraft.dragging && textOverlayMode==='box' && textBoxDraft){
      updateTextBoxDraft(sc);
    }
    return;
  }
  if(!isDrawing||!drawEl)return;
  const sx=snp(sc.x),sy=snp(sc.y),dx=sx-startX,dy=sy-startY;
  if(tool==='rect'||tool==='rrect'){
    const sh=e.shiftKey,s=Math.min(Math.abs(dx),Math.abs(dy));
    const x=startX<sx?startX:startX-(sh?s:Math.abs(dx));
    const y=startY<sy?startY:startY-(sh?s:Math.abs(dy));
    drawEl.setAttribute('x',x);drawEl.setAttribute('y',y);
    drawEl.setAttribute('width',sh?s:Math.abs(dx));drawEl.setAttribute('height',sh?s:Math.abs(dy));
  }else if(tool==='ellipse'){
    const rx=Math.abs(dx)/2,ry=Math.abs(dy)/2;
    const r=Math.min(rx,ry);
    drawEl.setAttribute('cx',(startX+sx)/2);drawEl.setAttribute('cy',(startY+sy)/2);
    drawEl.setAttribute('rx',e.shiftKey?r:Math.max(1,rx));drawEl.setAttribute('ry',e.shiftKey?r:Math.max(1,ry));
  }else if(tool==='line'){
    let ex=sx,ey=sy;
    if(e.shiftKey){const a=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);const l=Math.sqrt(dx*dx+dy*dy);ex=startX+l*Math.cos(a);ey=startY+l*Math.sin(a);}
    drawEl.setAttribute('x2',ex);drawEl.setAttribute('y2',ey);
  }else if((tool==='polyline'||tool==='polygon')&&polyPts.length>=2){
    drawEl.setAttribute('points',[...polyPts,sx,sy].join(' '));
  }else if(tool==='path'&&pathD){
    drawEl.setAttribute('d',pathD+` L ${sx} ${sy}`);
  }
}

function cwUp(e){
  if(isPanning){isPanning=false;SVGEL.style.cursor=tool==='move'?'grab':'default';return;}
  if(isResizing){isResizing=false;resizeHandle=null;bboxDS=null;updateLayers();return;}
  if(isRotating){isRotating=false;return;}
  if(isDragging){isDragging=false;clearGuides();updateLayers();return;}
  // finalize text tool (click or drag-to-box)
  if(tool==='text' && textPointerDraft){
    if(textPointerDraft.dragging && isDrawing && textOverlayMode==='box' && textBoxDraft){
      isDrawing=false;
      openTextBoxEditor();
      textPointerDraft=null;
      return;
    }
    startPointText(e,{x:textPointerDraft.x,y:textPointerDraft.y});
    textPointerDraft=null;
    return;
  }
  if(!isDrawing||!drawEl)return;
  if(tool==='polyline'||tool==='polygon'||tool==='star'||tool==='path')return;
  try{const b=drawEl.getBBox();if(b.width<2&&b.height<2){drawEl.remove();undoStack.pop();drawEl=null;isDrawing=false;return;}}catch(e){}
  act(drawEl);selectEl(drawEl);drawEl=null;isDrawing=false;updateLayers();updateStatus();
}

function cwDbl(e){
  if(tool==='polyline'||tool==='polygon'||tool==='star')finishPoly();
  else if(tool==='path')finishPath();
  // Double click to edit text (in-canvas)
  if(tool==='select'&&selectedEl){
    if(selectedEl.tagName==='text'){
      startEditText(selectedEl,e);
    } else if(selectedEl.tagName==='foreignObject'){
      const div=selectedEl.querySelector('div');
      if(div){
        // enable edit mode inside the SVG box
        textEdit={kind:'box',isNew:false,el:selectedEl,fo:null,div,prevText:div.textContent||'',prevVisibility:''};
        div.contentEditable='true';
        div.setAttribute('contenteditable','true');
        div.style.outline='none';
        setTool('select');
        setTimeout(()=>{ try{div.focus();}catch(_e){} },0);
      }
    }
  }
}

function cwWheel(e){
  e.preventDefault();
  if(e.ctrlKey||e.metaKey){const d=e.deltaY>0?.85:1.18;zoom=Math.min(Math.max(zoom*d,.04),20);}
  else{panX-=e.deltaX;panY-=e.deltaY;}
  updateVP();
}



// ===== DRAG =====
function doDrag(e,sc){
  const tx=snp(sc.x-dragOffX),ty=snp(sc.y-dragOffY);
  moveEl(selectedEl,tx,ty);
  drawSmartGuides(tx,ty,getBB(selectedEl));
  updateTX();refreshXY();
}

// ===== POLY/PATH =====
function finishPoly(){
  if(drawEl&&(drawEl.tagName==='polygon'||drawEl.tagName==='polyline')){
    if(polyPts.length<4){drawEl.remove();undoStack.pop();}
    else{
      if(tool==='star')makeStar(drawEl);
      act(drawEl);selectEl(drawEl);updateLayers();
    }
  }
  polyPts=[];isDrawing=false;drawEl=null;
}
function finishPath(){
  if(drawEl&&drawEl.tagName==='path'){act(drawEl);selectEl(drawEl);updateLayers();}
  pathD='';isDrawing=false;drawEl=null;
}
function makeStar(el){
  const n=parseInt(document.getElementById('poly-n').value)||6;
  const ir=parseFloat(document.getElementById('star-r').value)||.45;
  const pts=el.getAttribute('points').split(/\s+|,/).map(Number).filter((_,i)=>i<4);
  if(pts.length<4)return;
  const cx=pts[0]+(pts[2]-pts[0])/2,cy=pts[1]+(pts[3]-pts[1])/2;
  const r=Math.sqrt((pts[2]-pts[0])**2+(pts[3]-pts[1])**2)/2||60;
  const sp=[];
  for(let i=0;i<n*2;i++){
    const rad=i%2===0?r:r*ir;
    const a=(Math.PI*2*i)/(n*2)-Math.PI/2;
    sp.push(cx+rad*Math.cos(a),cy+rad*Math.sin(a));
  }
  el.setAttribute('points',sp.join(' '));
}

// ===== TEXT =====
let textOverlayMode = null; // 'point' | 'box' | 'edit'
let _editingHiddenEl = null;

function _screenFromSvg(x,y){
  const svgr=SVGEL.getBoundingClientRect();
  const cr=CW.getBoundingClientRect();
  return { left:(x*zoom + svgr.left - cr.left), top:(y*zoom + svgr.top - cr.top) };
}
function _fontPx(){ return (parseInt(document.getElementById('tfs').value)||16) * zoom; }

function startText(e, sc){
  // keeps backward-compat for older calls (point text)
  startPointText(e, sc);
}

/* ===== TEXT TOOL (rewritten for in-canvas typing) =====
   Goals:
   - Artistic text: click -> caret in canvas -> type. Edit via double-click in Select.
   - Text box: drag to define area -> caret inside box -> type and wrap.
   - No external textarea popup (kept in DOM for backward compat but unused).
*/


function _ensureMeasureText(){
  let mt=document.getElementById('vf-measure-text');
  if(mt) return mt;
  mt=mkSVG('text',{id:'vf-measure-text',x:-99999,y:-99999,opacity:0});
  document.getElementById('svg-defs').appendChild(mt);
  return mt;
}
function _measureTextBBox(str, ff, fs, fw, ls){
  const mt=_ensureMeasureText();
  mt.setAttribute('font-family',ff);
  mt.setAttribute('font-size',fs);
  mt.setAttribute('font-weight',fw);
  mt.setAttribute('letter-spacing',ls);
  mt.textContent=str||'';
  try{ return mt.getBBox(); }catch(e){ return {x:0,y:0,width:0,height:0}; }
}
function _endTextEdit(commit){
  if(!textEdit) return;
  const {kind,isNew,el,fo,div,prevText,prevVisibility}=textEdit;

  if(kind==='art'){
    const textEl=el;
    const cur = (div?.innerText ?? '').replace(/\r?\n/g,' ').trim();
    if(!commit){
      // cancel
      if(isNew){ textEl.remove(); }
      else { textEl.textContent = prevText; textEl.style.visibility = prevVisibility; }
    }else{
      if(!cur){
        if(isNew) textEl.remove();
        else textEl.textContent = '';
      }else{
        textEl.textContent = cur;
        textEl.style.visibility = prevVisibility || 'visible';
      }
    }
    if(fo) fo.remove();
    textEdit=null;
    updateLayers();
    if(textEl.isConnected){ selectEl(textEl); refreshProps(); }
    setTool('select');
    return;
  }

  if(kind==='box'){
    const foEl=el; // foreignObject
    const boxDiv=div || (foEl.querySelector('div')||null);
    if(boxDiv){
      const cur = (boxDiv.innerText ?? '').replace(/\r?\n/g,'\n').trim();
      if(!commit && isNew){
        foEl.remove();
      }else{
        // keep text; just stop editing
        boxDiv.contentEditable='false';
        boxDiv.setAttribute('contenteditable','false');
        boxDiv.style.outline='none';
        // if cleared, keep empty but box remains (useful for layouts)
        boxDiv.textContent = cur;
      }
    }
    textEdit=null;
    updateLayers();
    if(foEl.isConnected){ selectEl(foEl); refreshProps(); }
    setTool('select');
    return;
  }
}

function _bindArtEdit(fo, div, textEl){
  // Live update -> keep bbox and transform handles in sync
  const ff=textEl.getAttribute('font-family')||document.getElementById('tff').value;
  const fs=parseFloat(textEl.getAttribute('font-size')||document.getElementById('tfs').value||16);
  const fw=textEl.getAttribute('font-weight')||document.getElementById('tfw').value;
  const ls=parseFloat(textEl.getAttribute('letter-spacing')||document.getElementById('tls').value||0);

  const updateLive=()=>{
    const v=(div.innerText||'').replace(/\r?\n/g,' ').trim();
    textEl.textContent=v;
    // resize fo to fit
    const bb=_measureTextBBox(v||' ',ff,fs,fw,ls);
    fo.setAttribute('width', Math.max(60, bb.width + 24));
    fo.setAttribute('height', Math.max(28, bb.height + 18));
    // selection box refresh
    requestAnimationFrame(()=>{ if(selectedEl===textEl) updateTX(); });
  };

  div.addEventListener('input', updateLive);
  div.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ e.preventDefault(); _endTextEdit(false); }
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      _endTextEdit(true);
    }
  });
  div.addEventListener('blur', ()=>{
    if(!textEdit || textEdit.div!==div) return;
    setTimeout(()=>{
      if(!textEdit || textEdit.div!==div) return;
      const ae=document.activeElement;
      if(ae===div || div.contains(ae)) return;
      _endTextEdit(true);
    },0);
  });
  // first paint
  updateLive();
}

function _startArtisticTextAt(sc, existingTextEl=null){
  const ff=document.getElementById('tff').value;
  const fs=parseInt(document.getElementById('tfs').value)||16;
  const fw=document.getElementById('tfw').value;
  const ls=parseFloat(document.getElementById('tls').value)||0;
  const ta=document.getElementById('tta').value||'start';

  let textEl=existingTextEl;
  const isNew=!textEl;

  if(isNew){
    saveState();
    textEl=mkSVG('text',{
      x: sc.x,
      y: sc.y + fs,
      'font-family': ff,
      'font-size': fs,
      'font-weight': fw,
      'letter-spacing': ls,
      'text-anchor': ta,
      fill: gFill()
    });
    textEl.textContent='';
    CONT.appendChild(textEl);
    act(textEl);
    updateLayers();
  }

  // Create in-canvas editor via foreignObject (caret inside the canvas)
  const x=parseFloat(textEl.getAttribute('x')||sc.x);
  const y=parseFloat(textEl.getAttribute('y')|| (sc.y+fs));
  const prevVis=textEl.style.visibility||'visible';
  const prevText=textEl.textContent||'';
  textEl.style.visibility='hidden';

  const fo=mkSVG('foreignObject',{
    x:x,
    y:y - fs,
    width: 260,
    height: Math.max(36, fs*1.8)
  });

  const div=document.createElementNS('http://www.w3.org/1999/xhtml','div');
  div.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  div.contentEditable='true';
  div.setAttribute('contenteditable','true');
  div.spellcheck=false;

  // Visual: free text directly on canvas
  div.style.width='100%';
  div.style.height='100%';
  div.style.padding='2px 4px';
  div.style.boxSizing='border-box';
  div.style.borderRadius='4px';
  div.style.background='transparent';
  div.style.border='1px dashed rgba(255,255,255,.35)';
  div.style.backdropFilter='none';
  div.style.outline='none';
  div.style.color=textEl.getAttribute('fill')||gFill();
  div.style.fontFamily=ff;
  div.style.fontSize=fs+'px';
  div.style.fontWeight=fw;
  div.style.letterSpacing=ls+'px';
  div.style.whiteSpace='nowrap';
  div.style.lineHeight='1.15';
  div.style.userSelect='text';
  div.style.cursor='text';
  div.textContent=prevText;

  fo.appendChild(div);

  // put the editor right next to the text in the content layer (so transforms/pan/zoom are naturally aligned)
  CONT.appendChild(fo);

  textEdit={kind:'art', isNew, el:textEl, fo, div, prevText, prevVisibility:prevVis};

  // select the actual SVG text (handles & transforms apply to it)
  selectEl(textEl);
  refreshProps();
  updateTX();

  // focus caret
  setTimeout(()=>{
    try{
      div.focus();
      // place caret at end
      const r=document.createRange();
      r.selectNodeContents(div);
      r.collapse(false);
      const sel=window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
    }catch(_e){}
  },0);

  _bindArtEdit(fo, div, textEl);
}

function startPointText(e, sc){
  // Artistic text: click and type in-canvas
  _startArtisticTextAt(sc, null);
}

function startEditText(textEl, e){
  // Edit existing artistic <text> in-canvas
  const sc = svgPt(e);
  _startArtisticTextAt(sc, textEl);
}

// --- Text box draft (drag to create) ---
function startTextBoxDraft(e, sc){
  // Start drawing a rectangle area (text box)
  textOverlayMode='box';
  textBoxDraft={x0:sc.x,y0:sc.y,x:sc.x,y:sc.y,w:0,h:0};
  const rb=document.getElementById('rubber');
  rb.style.display='block';
  rb.style.borderStyle='dashed';
  rb.style.borderWidth='2px';
  rb.style.borderColor='rgba(255,255,255,.55)';
  rb.style.background='rgba(255,255,255,.05)';
}
function updateTextBoxDraft(sc){
  if(!textBoxDraft) return;
  const x=Math.min(textBoxDraft.x0, sc.x);
  const y=Math.min(textBoxDraft.y0, sc.y);
  const w=Math.abs(sc.x - textBoxDraft.x0);
  const h=Math.abs(sc.y - textBoxDraft.y0);
  textBoxDraft.x=x; textBoxDraft.y=y; textBoxDraft.w=w; textBoxDraft.h=h;

  // show rubber in screen coords
  const cr=CW.getBoundingClientRect(),svgr=SVGEL.getBoundingClientRect();
  const offX=svgr.left-cr.left,offY=svgr.top-cr.top;
  const p=toScreen(x,y,offX,offY);
  const rb=document.getElementById('rubber');
  rb.style.left=p.x+'px';
  rb.style.top=p.y+'px';
  rb.style.width=Math.max(6, w*zoom)+'px';
  rb.style.height=Math.max(6, h*zoom)+'px';
  rb.textContent = Math.max(1,Math.round(w))+'×'+Math.max(1,Math.round(h));
  rb.style.color='rgba(255,255,255,.85)';
  rb.style.fontFamily='DM Sans, sans-serif';
  rb.style.fontSize='12px';
  rb.style.padding='6px';
}
function openTextBoxEditor(){
  if(!textBoxDraft) return;
  const {x,y,w,h}=textBoxDraft;
  const rb=document.getElementById('rubber');
  rb.style.display='none';

  if(w<8 || h<8){ textBoxDraft=null; return; }

  saveState();

  const ff=document.getElementById('tff').value;
  const fs=parseInt(document.getElementById('tfs').value)||16;
  const fw=document.getElementById('tfw').value;
  const ls=parseFloat(document.getElementById('tls').value)||0;
  const ta=document.getElementById('tta').value||'start';

  const fo=mkSVG('foreignObject',{x,y,width:w,height:h});
  const div=document.createElementNS('http://www.w3.org/1999/xhtml','div');
  div.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
  div.contentEditable='true';
  div.setAttribute('contenteditable','true');
  div.spellcheck=false;

  div.style.width='100%';
  div.style.height='100%';
  div.style.boxSizing='border-box';
  div.style.padding='10px';
  div.style.borderRadius='12px';
  div.style.background='transparent';
  div.style.border='1px dashed rgba(255,255,255,.35)';
  div.style.outline='none';

  div.style.fontFamily=ff;
  div.style.fontSize=fs+'px';
  div.style.fontWeight=fw;
  div.style.letterSpacing=ls+'px';
  div.style.lineHeight='1.25';
  div.style.whiteSpace='pre-wrap';
  div.style.wordBreak='break-word';
  div.style.color=gFill();
  div.style.textAlign=(ta==='middle'?'center':(ta==='end'?'right':'left'));

  div.textContent='';

  fo.appendChild(div);
  CONT.appendChild(fo);
  act(fo);
  updateLayers();
  selectEl(fo);
  refreshProps();
  updateTX();

  textEdit={kind:'box',isNew:true,el:fo,fo:null,div,prevText:'',prevVisibility:''};

  // Keys: Esc cancels (removes box if new), Ctrl+Enter commits edit mode.
  div.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'){ e.preventDefault(); _endTextEdit(false); }
    if((e.key==='Enter' && (e.ctrlKey||e.metaKey))){ e.preventDefault(); _endTextEdit(true); }
    // Keep selection in sync while typing
    requestAnimationFrame(()=>{ if(selectedEl===fo) updateTX(); });
  });
  div.addEventListener('input',()=>requestAnimationFrame(()=>{ if(selectedEl===fo) updateTX(); }));
  div.addEventListener('blur', ()=>{
    if(!textEdit || textEdit.div!==div) return;
    setTimeout(()=>{
      if(!textEdit || textEdit.div!==div) return;
      const ae=document.activeElement;
      if(ae===div || div.contains(ae)) return;
      _endTextEdit(true);
    },0);
  });

  setTimeout(()=>{ try{div.focus();}catch(_e){} },0);

  textOverlayMode=null;
  textBoxDraft=null;
}

function commitText(){
  // backward compat: old textarea calls this; now commit active in-canvas edit
  _endTextEdit(true);
}
function txtKey(e){
  if(e.key==='Escape'){ _endTextEdit(false); }
}

// Keep function for callers; foreignObject editing follows zoom/pan naturally
function _repositionTextOverlay(){ /* no-op with in-canvas editing */ }

/* ===== END TEXT TOOL ===== */

// ===== SELECTION =====
function selectEl(el){
  selectedEl=el;updateTX();
  if(el){refreshProps();highlightLayer(el.id);document.getElementById('st-s').textContent=el.tagName+' #'+el.id;}
  else{clearProps();document.getElementById('st-s').textContent='—';}
}

// ===== TRANSFORM OVERLAY (8 handles + rotate) =====
const HS=6;
function getBB(el){try{const b=el.getBBox();return{x:b.x,y:b.y,w:b.width,h:b.height};}catch(e){return{x:0,y:0,w:0,h:0};}}
function resizeTX(){
  const r=CW.getBoundingClientRect();
  TXSVG.style.width=r.width+'px';TXSVG.style.height=r.height+'px';
  TXSVG.setAttribute('width',r.width);TXSVG.setAttribute('height',r.height);
  GSVG.style.width=r.width+'px';GSVG.style.height=r.height+'px';
  GSVG.setAttribute('width',r.width);GSVG.setAttribute('height',r.height);
}
function toScreen(sx,sy,offX,offY){return{x:offX+sx*zoom,y:offY+sy*zoom};}
function updateTX(){
  if(window.__txRAF){ window.__txNeeds=true; return; }
  window.__txRAF = requestAnimationFrame(()=>{ window.__txRAF=0; if(window.__txNeeds){ window.__txNeeds=false; updateTX(); return; } _updateTX(); });
}
function _updateTX(){
  TXSVG.innerHTML='';
  if(!selectedEl)return;
  resizeTX();
  const cr=CW.getBoundingClientRect(),svgr=SVGEL.getBoundingClientRect();
  const offX=svgr.left-cr.left,offY=svgr.top-cr.top;
  let b;try{b=selectedEl.getBBox();}catch(e){return;}
  if(!b||b.width<.1&&b.height<.1)return;
  selBBox={x:b.x,y:b.y,w:b.width,h:b.height};
  const rotDeg=getRotDeg(selectedEl);
  const cx2=offX+(b.x+b.width/2)*zoom,cy2=offY+(b.y+b.height/2)*zoom;

  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  if(rotDeg!==0)g.setAttribute('transform',`rotate(${rotDeg},${cx2},${cy2})`);

  const tl=toScreen(b.x,b.y,offX,offY);
  const tr=toScreen(b.x+b.width,b.y,offX,offY);
  const bl=toScreen(b.x,b.y+b.height,offX,offY);
  const br=toScreen(b.x+b.width,b.y+b.height,offX,offY);
  const tm=toScreen(b.x+b.width/2,b.y,offX,offY);
  const bm=toScreen(b.x+b.width/2,b.y+b.height,offX,offY);
  const lm=toScreen(b.x,b.y+b.height/2,offX,offY);
  const rm=toScreen(b.x+b.width,b.y+b.height/2,offX,offY);
  const rh=toScreen(b.x+b.width/2,b.y-24/zoom,offX,offY);

  // Outline
  const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('x',tl.x);rect.setAttribute('y',tl.y);
  rect.setAttribute('width',br.x-tl.x);rect.setAttribute('height',br.y-tl.y);
  rect.setAttribute('class','s-outline');rect.setAttribute('fill','none');
  g.appendChild(rect);

  // Rotate connector line
  const rl=document.createElementNS('http://www.w3.org/2000/svg','line');
  rl.setAttribute('x1',tm.x);rl.setAttribute('y1',tm.y);
  rl.setAttribute('x2',rh.x);rl.setAttribute('y2',rh.y);
  rl.setAttribute('class','s-rotline');
  g.appendChild(rl);

  // Rotate handle
  const rcirc=mkHandle(rh.x,rh.y,6,'rot',g);
  rcirc.addEventListener('mousedown',e=>{e.stopPropagation();startRot(e,b,cx2,cy2);});

  // 8 resize handles
  const hdata=[
    {p:tl,id:'tl',c:'nwse-resize'},{p:tr,id:'tr',c:'nesw-resize'},
    {p:bl,id:'bl',c:'nesw-resize'},{p:br,id:'br',c:'nwse-resize'},
    {p:tm,id:'tm',c:'ns-resize'},{p:bm,id:'bm',c:'ns-resize'},
    {p:lm,id:'lm',c:'ew-resize'},{p:rm,id:'rm',c:'ew-resize'},
  ];
  hdata.forEach(({p,id,c})=>{
    const h=mkHandle(p.x,p.y,HS,'',g);
    h.style.cursor=c;
    h.addEventListener('mousedown',e=>{e.stopPropagation();startResize(e,id,b);});
  });

  TXSVG.appendChild(g);
}

function mkHandle(x,y,r,cls,parent){
  const h=document.createElementNS('http://www.w3.org/2000/svg','rect');
  h.setAttribute('x',x-r);h.setAttribute('y',y-r);
  h.setAttribute('width',r*2);h.setAttribute('height',r*2);
  h.setAttribute('class','s-handle '+(cls||''));h.setAttribute('rx','2');
  parent.appendChild(h);return h;
}

// ===== RESIZE =====
function startResize(e,hid,origBBox){
  e.preventDefault();isResizing=true;resizeHandle=hid;
  bboxDS={x:origBBox.x,y:origBBox.y,w:origBBox.width,h:origBBox.height};
  aspectRatio=document.getElementById('lock-r').checked?origBBox.width/origBBox.height:null;
}
function doResize(e,sc){
  if(!selectedEl||!bboxDS)return;
  const b=bboxDS,sx=snp(sc.x),sy=snp(sc.y);
  let nx=b.x,ny=b.y,nw=b.w,nh=b.h;
  const h=resizeHandle;
  if(h==='br'){nw=Math.max(2,sx-b.x);nh=Math.max(2,sy-b.y);}
  else if(h==='bl'){nw=Math.max(2,b.x+b.w-sx);nx=sx;nh=Math.max(2,sy-b.y);}
  else if(h==='tr'){nw=Math.max(2,sx-b.x);nh=Math.max(2,b.y+b.h-sy);ny=sy;}
  else if(h==='tl'){nw=Math.max(2,b.x+b.w-sx);nx=sx;nh=Math.max(2,b.y+b.h-sy);ny=sy;}
  else if(h==='rm'){nw=Math.max(2,sx-b.x);}
  else if(h==='lm'){nw=Math.max(2,b.x+b.w-sx);nx=sx;}
  else if(h==='bm'){nh=Math.max(2,sy-b.y);}
  else if(h==='tm'){nh=Math.max(2,b.y+b.h-sy);ny=sy;}
  if(aspectRatio&&(h==='br'||h==='bl'||h==='tr'||h==='tl')){
    if(nw/nh>aspectRatio)nh=nw/aspectRatio;else nw=nh*aspectRatio;
  }
  applyBBox(selectedEl,nx,ny,nw,nh,b);
  updateTX();refreshXY();
}
function applyBBox(el,nx,ny,nw,nh,orig){
  const tag=el.tagName;
  const sx2=nw/(orig.w||1), sy2=nh/(orig.h||1);

  // Text should resize via font-size / box sizing, not by scaling transforms (keeps TX box accurate).
  if(tag==='text'){
    const fs0=parseFloat(el.getAttribute('font-size')||'16')||16;
    const s=(isFinite(sy2)?sy2:1);
    const fs=Math.max(1, fs0*s);
    el.setAttribute('font-size', fs);

    // Move by bbox delta (bbox is top-left based; text uses baseline for y, but delta still behaves well)
    const x0=parseFloat(el.getAttribute('x')||orig.x)||orig.x;
    const yAttr=el.getAttribute('y');
    const y0=(yAttr!=null? (parseFloat(yAttr)||0) : (orig.y+orig.h));
    el.setAttribute('x', x0 + (nx-orig.x));
    el.setAttribute('y', y0 + (ny-orig.y));

    // Remove scale transforms previously applied to avoid compounding / desync
    const t=(el.getAttribute('transform')||'').replace(/scale\([^)]*\)/g,'').trim();
    if(t) el.setAttribute('transform', t);
    else el.removeAttribute('transform');
    return;
  }

  // Text box (foreignObject) resizes as a box.
  if(tag==='foreignObject'){
    el.setAttribute('x', nx); el.setAttribute('y', ny);
    el.setAttribute('width', nw); el.setAttribute('height', nh);
    return;
  }

  if(tag==='rect'||tag==='image'){
    el.setAttribute('x',nx);el.setAttribute('y',ny);
    el.setAttribute('width',nw);el.setAttribute('height',nh);
  }
  else if(tag==='ellipse'){
    el.setAttribute('cx',nx+nw/2);el.setAttribute('cy',ny+nh/2);
    el.setAttribute('rx',nw/2);el.setAttribute('ry',nh/2);
  }
  else if(tag==='line'){
    const x1=parseFloat(el.getAttribute('x1')),y1=parseFloat(el.getAttribute('y1'));
    const x2=parseFloat(el.getAttribute('x2')),y2=parseFloat(el.getAttribute('y2'));
    el.setAttribute('x1',nx+(x1-orig.x)*sx2);el.setAttribute('y1',ny+(y1-orig.y)*sy2);
    el.setAttribute('x2',nx+(x2-orig.x)*sx2);el.setAttribute('y2',ny+(y2-orig.y)*sy2);
  } else {
    const t=(el.getAttribute('transform')||'')
      .replace(/scale\([^)]*\)/g,'')
      .replace(/translate\([^)]*\)/g,'')
      .trim();
    el.setAttribute('transform',`translate(${nx},${ny}) scale(${sx2},${sy2}) translate(${-orig.x},${-orig.y}) ${t}`.trim());
  }
}

// ===== ROTATE =====
function getRotDeg(el){const t=el.getAttribute('transform')||'';const m=t.match(/rotate\(([^,)]+)/);return m?parseFloat(m[1]):0;}
function setRotDeg(el,deg){
  let b;try{b=el.getBBox();}catch(e){return;}
  const cx=b.x+b.width/2,cy=b.y+b.height/2;
  const t=(el.getAttribute('transform')||'').replace(/rotate\([^)]*\)/g,'').trim();
  el.setAttribute('transform',(t+` rotate(${deg},${cx},${cy})`).trim());
}
function startRot(e,origBBox,cx,cy){
  e.preventDefault();isRotating=true;rotCX=cx;rotCY=cy;
  const cr=CW.getBoundingClientRect();
  rotStartA=Math.atan2(e.clientY-cr.top-cy,e.clientX-cr.left-cx)*180/Math.PI;
  rotStartDeg=getRotDeg(selectedEl);
}
function doRotate(e){
  if(!selectedEl)return;
  const cr=CW.getBoundingClientRect();
  const a=Math.atan2(e.clientY-cr.top-rotCY,e.clientX-cr.left-rotCX)*180/Math.PI;
  let nd=rotStartDeg+(a-rotStartA);
  if(e.shiftKey)nd=Math.round(nd/15)*15;
  setRotDeg(selectedEl,nd);
  document.getElementById('prot').value=Math.round(nd);
  updateTX();
}

// ===== MOVE ELEMENTS =====
function getBBox(el){try{const b=el.getBBox();return{x:b.x,y:b.y,w:b.width,h:b.height};}catch(e){return{x:0,y:0,w:0,h:0};}}
function moveEl(el,nx,ny){
  const tag=el.tagName;
  if(tag==='rect'||tag==='image'){el.setAttribute('x',nx);el.setAttribute('y',ny);}
  else if(tag==='text'){el.setAttribute('x',nx);const fs=parseFloat(el.getAttribute('font-size')||16);el.setAttribute('y',ny+fs);}
  else if(tag==='ellipse'){const b=getBBox(el);el.setAttribute('cx',nx+b.w/2);el.setAttribute('cy',ny+b.h/2);}
  else if(tag==='line'){
    const b=getBBox(el);const dx=nx-b.x,dy=ny-b.y;
    el.setAttribute('x1',parseFloat(el.getAttribute('x1'))+dx);el.setAttribute('y1',parseFloat(el.getAttribute('y1'))+dy);
    el.setAttribute('x2',parseFloat(el.getAttribute('x2'))+dx);el.setAttribute('y2',parseFloat(el.getAttribute('y2'))+dy);
  } else {
    const b=getBBox(el);const dx=nx-b.x,dy=ny-b.y;
    const t=el.getAttribute('transform')||'';
    const tm=t.match(/translate\(([^,)]+),([^)]+)\)/);
    if(tm){el.setAttribute('transform',t.replace(/translate\([^)]+\)/,`translate(${parseFloat(tm[1])+dx},${parseFloat(tm[2])+dy})`));}
    else el.setAttribute('transform',`translate(${dx},${dy}) `+t);
  }
}

// ===== SMART GUIDES =====
function drawSmartGuides(nx,ny,b){
  if(!document.getElementById('guides-cb').checked){GSVG.innerHTML='';return;}
  const cr=CW.getBoundingClientRect(),sr=SVGEL.getBoundingClientRect();
  const ox=sr.left-cr.left,oy=sr.top-cr.top;
  resizeTX();GSVG.innerHTML='';
  Array.from(CONT.children).forEach(el=>{
    if(el===selectedEl)return;
    const ob=getBBox(el);
    const checks=[
      {val:ob.x,cur:nx,dir:'v'},{val:ob.x+ob.w,cur:nx,dir:'v'},
      {val:ob.x,cur:nx+b.w,dir:'v'},{val:ob.x+ob.w,cur:nx+b.w,dir:'v'},
      {val:ob.x+ob.w/2,cur:nx+b.w/2,dir:'v'},
      {val:ob.y,cur:ny,dir:'h'},{val:ob.y+ob.h,cur:ny,dir:'h'},
      {val:ob.y,cur:ny+b.h,dir:'h'},{val:ob.y+ob.h,cur:ny+b.h,dir:'h'},
      {val:ob.y+ob.h/2,cur:ny+b.h/2,dir:'h'},
    ];
    checks.forEach(({val,cur,dir})=>{
      if(Math.abs(val-cur)<5){
        const l=document.createElementNS('http://www.w3.org/2000/svg','line');
        l.setAttribute('class','guide');
        if(dir==='v'){const sx=ox+val*zoom;l.setAttribute('x1',sx);l.setAttribute('y1',0);l.setAttribute('x2',sx);l.setAttribute('y2',cr.height);}
        else{const sy=oy+val*zoom;l.setAttribute('x1',0);l.setAttribute('y1',sy);l.setAttribute('x2',cr.width);l.setAttribute('y2',sy);}
        GSVG.appendChild(l);
      }
    });
  });
}
function clearGuides(){GSVG.innerHTML='';}
function updateGuides(){clearGuides();}

// ===== GRID =====
function toggleGridVis(){
  gridVisible=document.getElementById('grid-cb').checked;
  const btn=document.getElementById('grid-tb');
  btn.classList.toggle('on',gridVisible);
  drawGrid();
}
function drawGrid(){
  document.getElementById('grid-overlay-g')?.remove();
  if(!gridVisible)return;
  const w=parseInt(document.getElementById('cw').value)||800;
  const h=parseInt(document.getElementById('ch').value)||600;
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id','grid-overlay-g');g.setAttribute('pointer-events','none');
  for(let x=0;x<=w;x+=gridSize){
    const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x);l.setAttribute('y1',0);l.setAttribute('x2',x);l.setAttribute('y2',h);
    l.setAttribute('stroke','rgba(100,100,170,0.13)');l.setAttribute('stroke-width','0.5');g.appendChild(l);
  }
  for(let y=0;y<=h;y+=gridSize){
    const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',0);l.setAttribute('y1',y);l.setAttribute('x2',w);l.setAttribute('y2',y);
    l.setAttribute('stroke','rgba(100,100,170,0.13)');l.setAttribute('stroke-width','0.5');g.appendChild(l);
  }
  SVGEL.insertBefore(g,CONT);
}
function toggleSnap(){
  snapOn=!snapOn;
  document.getElementById('snap-cb').checked=snapOn;
  document.getElementById('snap-tb').classList.toggle('on',snapOn);
}

// ===== GRADIENT =====
function setGrad(t){
  gradType=t;
  document.querySelectorAll('.gtb').forEach(b=>b.classList.remove('on'));
  document.getElementById('g-'+t.replace('radial','rad').replace('linear','lin')).classList.add('on');
  document.getElementById('grad-ui').style.display=t==='none'?'none':'block';
  if(t!=='none')applyGrad();
  else if(selectedEl){document.getElementById('fill-sw').dataset.none='0';selectedEl.setAttribute('fill',document.getElementById('fc').value);}
}
function applyGrad(){
  if(!selectedEl||gradType==='none')return;
  const c1=document.getElementById('g1c').value,c2=document.getElementById('g2c').value;
  const p1=document.getElementById('g1p').value,p2=document.getElementById('g2p').value;
  const ang=(parseFloat(document.getElementById('gang').value)||90)*Math.PI/180;
  const id='grad-'+(gradCnt++);
  const defs=document.getElementById('svg-defs');
  let gr;
  if(gradType==='linear'){
    gr=document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
    gr.setAttribute('id',id);
    gr.setAttribute('x1',(.5-.5*Math.cos(ang)));gr.setAttribute('y1',(.5-.5*Math.sin(ang)));
    gr.setAttribute('x2',(.5+.5*Math.cos(ang)));gr.setAttribute('y2',(.5+.5*Math.sin(ang)));
  } else {
    gr=document.createElementNS('http://www.w3.org/2000/svg','radialGradient');
    gr.setAttribute('id',id);gr.setAttribute('cx','50%');gr.setAttribute('cy','50%');gr.setAttribute('r','50%');
  }
  const s1=document.createElementNS('http://www.w3.org/2000/svg','stop');s1.setAttribute('offset',p1+'%');s1.setAttribute('stop-color',c1);
  const s2=document.createElementNS('http://www.w3.org/2000/svg','stop');s2.setAttribute('offset',p2+'%');s2.setAttribute('stop-color',c2);
  gr.appendChild(s1);gr.appendChild(s2);defs.appendChild(gr);
  selectedEl.setAttribute('fill',`url(#${id})`);
}

// ===== PROP APPLIERS =====
function applyFill(){
  const v=document.getElementById('fc').value;
  document.getElementById('fill-sw').style.background=v;document.getElementById('fill-sw').dataset.none='0';
  document.getElementById('fv').textContent=v;
  if(selectedEl)selectedEl.setAttribute('fill',v);
}
function applyFO(){
  const v=document.getElementById('fo').value;
  document.getElementById('fov').textContent=Math.round(v*100)+'%';
  if(selectedEl)selectedEl.setAttribute('fill-opacity',v);
}
function setFillNone(){
  document.getElementById('fill-sw').style.background='transparent';document.getElementById('fill-sw').dataset.none='1';
  document.getElementById('fv').textContent='none';
  if(selectedEl)selectedEl.setAttribute('fill','none');
}
function applyStroke(){
  const v=document.getElementById('sc').value;
  document.getElementById('stk-sw').style.background=v;document.getElementById('stk-sw').dataset.none='0';
  document.getElementById('sv').textContent=v;
  if(selectedEl)selectedEl.setAttribute('stroke',v);
}
function applyStW(){if(selectedEl)selectedEl.setAttribute('stroke-width',document.getElementById('sw').value);}
function setStrokeNone(){
  document.getElementById('stk-sw').style.background='transparent';document.getElementById('stk-sw').dataset.none='1';
  document.getElementById('sv').textContent='none';
  if(selectedEl)selectedEl.setAttribute('stroke','none');
}
function applyDash(){if(selectedEl){const v=document.getElementById('sd').value;if(v)selectedEl.setAttribute('stroke-dasharray',v);else selectedEl.removeAttribute('stroke-dasharray');}}
function applyCap(){if(selectedEl)selectedEl.setAttribute('stroke-linecap',document.getElementById('scap').value);}
function applyJoin(){if(selectedEl)selectedEl.setAttribute('stroke-linejoin',document.getElementById('sjoin').value);}
function applyXY(){
  if(!selectedEl)return;
  moveEl(selectedEl,parseFloat(document.getElementById('px').value)||0,parseFloat(document.getElementById('py').value)||0);
  updateTX();
}
function applyWH(){
  if(!selectedEl)return;
  const nw=Math.max(1,parseFloat(document.getElementById('pw').value)||1);
  const nh=Math.max(1,parseFloat(document.getElementById('ph').value)||1);
  const b=getBBox(selectedEl);
  applyBBox(selectedEl,b.x,b.y,nw,nh,b);updateTX();
}
function applyRot(){if(!selectedEl)return;setRotDeg(selectedEl,parseFloat(document.getElementById('prot').value)||0);updateTX();}
function applyRx(){if(!selectedEl)return;const v=parseFloat(document.getElementById('prx').value)||0;if(selectedEl.tagName==='rect'){selectedEl.setAttribute('rx',v);selectedEl.setAttribute('ry',v);}}
function applyOp(){const v=document.getElementById('pop').value;document.getElementById('popv').textContent=Math.round(v*100)+'%';if(selectedEl)selectedEl.setAttribute('opacity',v);}
function applyText(){
  if(!selectedEl)return;
  if(selectedEl.tagName==='text'){
    selectedEl.setAttribute('font-family',document.getElementById('tff').value);
    selectedEl.setAttribute('font-size',document.getElementById('tfs').value);
    selectedEl.setAttribute('font-weight',document.getElementById('tfw').value);
    selectedEl.setAttribute('letter-spacing',document.getElementById('tls').value);
    selectedEl.setAttribute('text-anchor',document.getElementById('tta').value);
    return;
  }
  if(selectedEl.tagName==='foreignObject'){
    const div=selectedEl.querySelector('div');
    if(!div)return;
    div.style.fontFamily=document.getElementById('tff').value;
    div.style.fontSize=(document.getElementById('tfs').value||16)+'px';
    div.style.fontWeight=document.getElementById('tfw').value;
    div.style.letterSpacing=(document.getElementById('tls').value||0)+'px';
    const ta=document.getElementById('tta').value;
    div.style.textAlign=(ta==='middle'?'center':(ta==='end'?'right':'left'));
    updateTX();
  }
}

// ===== FLIP/ROTATE =====
function flipH(){if(!selectedEl)return;saveState();const b=getBBox(selectedEl);const cx=b.x+b.w/2;const t=selectedEl.getAttribute('transform')||'';selectedEl.setAttribute('transform',t+` scale(-1,1) translate(${-cx*2},0)`);updateTX();}
function flipV(){if(!selectedEl)return;saveState();const b=getBBox(selectedEl);const cy=b.y+b.h/2;const t=selectedEl.getAttribute('transform')||'';selectedEl.setAttribute('transform',t+` scale(1,-1) translate(0,${-cy*2})`);updateTX();}
function rot90(d){if(!selectedEl)return;saveState();const r=getRotDeg(selectedEl);setRotDeg(selectedEl,r+90*d);document.getElementById('prot').value=Math.round(r+90*d);updateTX();}

// ===== ALIGN =====
function allEls(){return selectedEl?[selectedEl]:Array.from(CONT.querySelectorAll('[data-s]'));}
function alignL(){const es=allEls();if(!es.length)return;saveState();const mn=Math.min(...es.map(e=>getBBox(e).x));es.forEach(e=>{const b=getBBox(e);moveEl(e,mn,b.y);});updateTX();}
function alignR(){const es=allEls();saveState();const mx=Math.max(...es.map(e=>{const b=getBBox(e);return b.x+b.w;}));es.forEach(e=>{const b=getBBox(e);moveEl(e,mx-b.w,b.y);});updateTX();}
function alignT(){const es=allEls();saveState();const mn=Math.min(...es.map(e=>getBBox(e).y));es.forEach(e=>{const b=getBBox(e);moveEl(e,b.x,mn);});updateTX();}
function alignB(){const es=allEls();saveState();const mx=Math.max(...es.map(e=>{const b=getBBox(e);return b.y+b.h;}));es.forEach(e=>{const b=getBBox(e);moveEl(e,b.x,mx-b.h);});updateTX();}
function alignCH(){const es=allEls();saveState();const bs=es.map(e=>getBBox(e));const mn=Math.min(...bs.map(b=>b.x)),mx=Math.max(...bs.map(b=>b.x+b.w));const c=(mn+mx)/2;es.forEach((e,i)=>{const b=bs[i];moveEl(e,c-b.w/2,b.y);});updateTX();}
function alignCV(){const es=allEls();saveState();const bs=es.map(e=>getBBox(e));const mn=Math.min(...bs.map(b=>b.y)),mx=Math.max(...bs.map(b=>b.y+b.h));const c=(mn+mx)/2;es.forEach((e,i)=>{const b=bs[i];moveEl(e,b.x,c-b.h/2);});updateTX();}

// ===== LAYER OPS =====
function groupSel(){
  const es=Array.from(CONT.querySelectorAll('[data-s]'));if(es.length<2)return;saveState();
  const g=mkSVG('g',{});CONT.appendChild(g);es.forEach(e=>g.appendChild(e));act(g);selectEl(g);updateLayers();
}
function ungroupSel(){
  if(!selectedEl||selectedEl.tagName!=='g')return;saveState();
  Array.from(selectedEl.children).forEach(c=>{CONT.appendChild(c);act(c);});
  selectedEl.remove();selectEl(null);updateLayers();
}
function bringFront(){if(!selectedEl)return;saveState();CONT.appendChild(selectedEl);updateLayers();}
function sendBack(){if(!selectedEl)return;saveState();CONT.insertBefore(selectedEl,CONT.firstChild);updateLayers();}
function bringFwd(){if(!selectedEl||!selectedEl.nextElementSibling)return;saveState();selectedEl.nextElementSibling.after(selectedEl);updateLayers();}
function sendBwd(){if(!selectedEl||!selectedEl.previousElementSibling)return;saveState();selectedEl.previousElementSibling.before(selectedEl);updateLayers();}
function deleteSelected(){if(!selectedEl)return;saveState();selectedEl.remove();selectEl(null);updateLayers();updateStatus();}
function duplicateSel(){
  if(!selectedEl)return;saveState();
  const cl=selectedEl.cloneNode(true);cl.setAttribute('id','el-'+(_idN++));
  CONT.appendChild(cl);act(cl);
  const b=getBBox(selectedEl);moveEl(cl,b.x+10,b.y+10);
  selectEl(cl);updateLayers();
}
function flipLayers(){
  saveState();
  const es=Array.from(CONT.children).reverse();
  es.forEach(e=>CONT.appendChild(e));updateLayers();
}

// ===== LAYERS LIST =====
const TICONS={rect:'▭',ellipse:'⬭',line:'╱',polyline:'⌒',polygon:'⬡',path:'✏',text:'T',image:'🖼',g:'⊞',circle:'●'};
function updateLayers(){
  const list=document.getElementById('layers-list');list.innerHTML='';
  const es=Array.from(CONT.children).filter(e=>e.getAttribute&&(e.getAttribute('data-s')||e.id)&&e.id!=='grid-overlay-g').reverse();
  es.forEach(el=>{
    const id=el.id||el.tagName;const icon=TICONS[el.tagName]||'◈';
    const hidden=hiddenSet.has(el.id);
    const item=document.createElement('div');
    item.className='li'+(selectedEl&&selectedEl.id===el.id?' sel':'');
    item.dataset.id=el.id;item.style.opacity=hidden?.4:1;
    item.innerHTML=`<span class="li-ico">${icon}</span><span class="li-nm">${id}</span><button class="li-btn" onclick="toggleHide('${el.id}',event)">${hidden?'○':'●'}</button><button class="li-btn" onclick="delById('${el.id}',event)">✕</button>`;
    item.addEventListener('click',()=>selectEl(el));
    list.appendChild(item);
  });
  updateStatus();
}
function toggleHide(id,e){e.stopPropagation();const el=document.getElementById(id);if(!el)return;if(hiddenSet.has(id)){hiddenSet.delete(id);el.style.display='';}else{hiddenSet.add(id);el.style.display='none';}updateLayers();}
function delById(id,e){if(e)e.stopPropagation();const el=document.getElementById(id);if(!el)return;saveState();el.remove();if(selectedEl?.id===id)selectEl(null);updateLayers();}
function highlightLayer(id){document.querySelectorAll('.li').forEach(l=>l.classList.toggle('sel',l.dataset.id===id));}
function updateStatus(){document.getElementById('st-n').textContent=CONT.querySelectorAll('[data-s]').length;}

// ===== UNDO/REDO =====
function saveState(){undoStack.push(CONT.innerHTML);if(undoStack.length>80)undoStack.shift();redoStack=[];}
function undo(){if(!undoStack.length)return;redoStack.push(CONT.innerHTML);CONT.innerHTML=undoStack.pop();restoreAll();selectEl(null);updateLayers();}
function redo(){if(!redoStack.length)return;undoStack.push(CONT.innerHTML);CONT.innerHTML=redoStack.pop();restoreAll();selectEl(null);updateLayers();}
function restoreAll(){CONT.querySelectorAll('[data-s]').forEach(el=>{el.style.cursor='move';el.addEventListener('mousedown',onElMD);});}

// ===== PROPS PANEL =====
function refreshProps(){
  if(!selectedEl)return;
  const el=selectedEl;
  const fill=el.getAttribute('fill')||'#000';
  const stk=el.getAttribute('stroke')||'none';
  if(fill!=='none'&&!fill.startsWith('url')){
    const h=hex(fill);document.getElementById('fc').value=h;
    document.getElementById('fill-sw').style.background=h;document.getElementById('fill-sw').dataset.none='0';
    document.getElementById('fv').textContent=h;
  } else if(fill==='none'){
    document.getElementById('fill-sw').style.background='transparent';document.getElementById('fill-sw').dataset.none='1';document.getElementById('fv').textContent='none';
  }
  if(stk&&stk!=='none'){
    const h=hex(stk);document.getElementById('sc').value=h;
    document.getElementById('stk-sw').style.background=h;document.getElementById('stk-sw').dataset.none='0';
    document.getElementById('sv').textContent=h;
  }
  document.getElementById('sw').value=el.getAttribute('stroke-width')||'1';
  const op=parseFloat(el.getAttribute('opacity')||'1');
  document.getElementById('pop').value=op;document.getElementById('popv').textContent=Math.round(op*100)+'%';
  const fo=parseFloat(el.getAttribute('fill-opacity')||'1');
  document.getElementById('fo').value=fo;document.getElementById('fov').textContent=Math.round(fo*100)+'%';
  document.getElementById('prot').value=Math.round(getRotDeg(el));
  document.getElementById('text-sec').style.display=(el.tagName==='text'||el.tagName==='foreignObject')?'block':'none';
  if(el.tagName==='text'){

    document.getElementById('tff').value=el.getAttribute('font-family')||'Arial';
    document.getElementById('tfs').value=el.getAttribute('font-size')||'16';
    document.getElementById('tfw').value=el.getAttribute('font-weight')||'normal';
    document.getElementById('tls').value=el.getAttribute('letter-spacing')||'0';
    document.getElementById('tta').value=el.getAttribute('text-anchor')||'start';
  }
  if(el.getAttribute('rx'))document.getElementById('prx').value=el.getAttribute('rx');
  refreshXY();
}
function refreshXY(){
  if(!selectedEl)return;
  const b=getBBox(selectedEl);
  document.getElementById('px').value=Math.round(b.x);document.getElementById('py').value=Math.round(b.y);
  document.getElementById('pw').value=Math.round(b.w);document.getElementById('ph').value=Math.round(b.h);
}
function clearProps(){['px','py','pw','ph'].forEach(id=>document.getElementById(id).value='');document.getElementById('prot').value='0';}

// ===== FILE =====
function getSVGStr(){
  const w=document.getElementById('cw').value,h=document.getElementById('ch').value;
  const cl=SVGEL.cloneNode(true);cl.setAttribute('width',w);cl.setAttribute('height',h);
  cl.querySelectorAll('[data-s]').forEach(e=>{e.removeAttribute('data-s');e.style.cursor='';});
  cl.querySelector('#grid-overlay-g')?.remove();
  return'<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(cl);
}
function saveSVG(){const b=new Blob([getSVGStr()],{type:'image/svg+xml'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='drawing.svg';a.click();}
function exportPNG(){
  const w=parseInt(document.getElementById('cw').value),h=parseInt(document.getElementById('ch').value);
  const url=URL.createObjectURL(new Blob([getSVGStr()],{type:'image/svg+xml;charset=utf-8'}));
  const img=new Image();img.onload=()=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;
    c.getContext('2d').drawImage(img,0,0);
    const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='drawing.png';a.click();
    URL.revokeObjectURL(url);
  };img.src=url;
}
function newCanvas(){if(!confirm('Novo canvas?'))return;CONT.innerHTML='';undoStack=[];redoStack=[];selectEl(null);updateLayers();}
function openFile(){document.getElementById('fi-svg').click();}
function loadSVG(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    const d=new DOMParser();const doc=d.parseFromString(ev.target.result,'image/svg+xml');
    const imp=doc.querySelector('svg');if(!imp)return;
    saveState();
    const w=imp.getAttribute('width'),h=imp.getAttribute('height');
    if(w)document.getElementById('cw').value=parseInt(w);if(h)document.getElementById('ch').value=parseInt(h);
    resizeCanvas();
    const gc=imp.querySelector('#svg-content');
    CONT.innerHTML=gc?gc.innerHTML:imp.innerHTML;
    restoreAll();selectEl(null);updateLayers();fitCanvas();
  };r.readAsText(f);e.target.value='';
}
function insertImg(){document.getElementById('fi-img').click();}
function loadImg(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    saveState();
    const el=mkSVG('image',{x:50,y:50,width:200,height:150,href:ev.target.result,preserveAspectRatio:'xMidYMid meet'});
    CONT.appendChild(el);act(el);selectEl(el);updateLayers();
  };r.readAsDataURL(f);e.target.value='';
}
function showCode(){document.getElementById('code-ta').value=getSVGStr();document.getElementById('code-modal').classList.add('show');}
function applyCode(){
  const code=document.getElementById('code-ta').value;
  const doc=new DOMParser().parseFromString(code,'image/svg+xml');
  const imp=doc.querySelector('svg');if(imp){saveState();const gc=imp.querySelector('#svg-content');if(gc){CONT.innerHTML=gc.innerHTML;restoreAll();selectEl(null);updateLayers();}}
  document.getElementById('code-modal').classList.remove('show');
}

// ===== KEYBOARD =====
function isTypingContext(el){
  if(!el) return false;
  if(el.isContentEditable) return true;
  const t=(el.tagName||'').toUpperCase();
  return t==='INPUT'||t==='TEXTAREA'||t==='SELECT';
}

document.addEventListener('keydown',e=>{
  if(isTypingContext(e.target)) return;
  const k=(e.key||'').toLowerCase();
  const code=e.code||'';
  if(e.key===' '){
    spacePan=true;
    if(!isPanning && tool!=='move') SVGEL.style.cursor='grab';
    e.preventDefault();
    return;
  }
  if(k==='v'||code==='KeyV')setTool('select');else if(k==='h'||code==='KeyH')setTool('move');
  else if(k==='r'||code==='KeyR')setTool('rect');else if(k==='e'||code==='KeyE')setTool('ellipse');
  else if(k==='l'||code==='KeyL')setTool('line');else if(k==='p'||code==='KeyP')setTool('polyline');
  else if(k==='b'||code==='KeyB')setTool('path');else if(k==='t'||code==='KeyT')setTool('text');
  else if(k==='f')fitCanvas();else if(k==='+'||k==='=')zoomIn();else if(k==='-')zoomOut();
  else if(k==='delete'||k==='backspace'){e.preventDefault();deleteSelected();}
  else if(k==='escape'){finishPoly();finishPath();setTool('select');}
  else if(k==='z'&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault();undo();}
  else if((k==='z'&&(e.ctrlKey||e.metaKey)&&e.shiftKey)||(k==='y'&&(e.ctrlKey||e.metaKey))){e.preventDefault();redo();}
  else if(k==='d'&&(e.ctrlKey||e.metaKey)){e.preventDefault();duplicateSel();}
  else if(k==='g'&&(e.ctrlKey||e.metaKey)){e.preventDefault();groupSel();}
  else if(k==='arrowleft'&&selectedEl){e.preventDefault();saveState();const b=getBBox(selectedEl);moveEl(selectedEl,b.x-(e.shiftKey?10:1),b.y);updateTX();}
  else if(k==='arrowright'&&selectedEl){e.preventDefault();saveState();const b=getBBox(selectedEl);moveEl(selectedEl,b.x+(e.shiftKey?10:1),b.y);updateTX();}
  else if(k==='arrowup'&&selectedEl){e.preventDefault();saveState();const b=getBBox(selectedEl);moveEl(selectedEl,b.x,b.y-(e.shiftKey?10:1));updateTX();}
  else if(k==='arrowdown'&&selectedEl){e.preventDefault();saveState();const b=getBBox(selectedEl);moveEl(selectedEl,b.x,b.y+(e.shiftKey?10:1));updateTX();}
});

document.addEventListener('keyup',e=>{
  if(e.key===' '){
    spacePan=false;
    if(!isPanning && tool!=='move') SVGEL.style.cursor='default';
  }
});

document.addEventListener('mouseup',()=>{
  if(isResizing){isResizing=false;resizeHandle=null;bboxDS=null;}
  if(isRotating)isRotating=false;
  if(isDragging){isDragging=false;clearGuides();}
  if(isPanning){isPanning=false;if(tool!=='move')SVGEL.style.cursor='default';}
});


function initToolTitles(){
  document.querySelectorAll('.t-btn').forEach(btn=>{
    if(!btn.title){
      const tip=btn.getAttribute('data-tip');
      if(tip) btn.title=tip;
    }
  });
  document.querySelectorAll('.tb-btn').forEach(btn=>{
    if(!btn.title){
      const label=(btn.textContent||'').trim();
      if(label) btn.title=label;
    }
  });
}
// ===== INIT =====
resizeCanvas();
initToolTitles();
setTimeout(()=>{
  fitCanvas();
  // Demo
  const r1=mkSVG('rect',{x:60,y:50,width:220,height:160,rx:14,fill:'#5b8af5',stroke:'none',opacity:.92});CONT.appendChild(r1);act(r1);
  const c1=mkSVG('ellipse',{cx:510,cy:165,rx:95,ry:95,fill:'#e85d8a',stroke:'none',opacity:.88});CONT.appendChild(c1);act(c1);
  const r2=mkSVG('rect',{x:330,y:70,width:120,height:160,rx:8,fill:'#3ecf8e',stroke:'none',opacity:.8});CONT.appendChild(r2);act(r2);
  // Star
  const sp=[];const sr=60,si=28,sc2=640,sy=200;
  for(let i=0;i<10;i++){const rad=i%2===0?sr:si;const a=(Math.PI*2*i)/10-Math.PI/2;sp.push(sc2+rad*Math.cos(a),sy+rad*Math.sin(a));}
  const star=mkSVG('polygon',{points:sp.join(' '),fill:'#f5a623',stroke:'none',opacity:.9});CONT.appendChild(star);act(star);
  const txt=mkSVG('text',{x:60,y:310,'font-family':'Georgia','font-size':'30','font-weight':'bold',fill:'#1a1a2a'});
  txt.textContent='VectoFlow Editor';CONT.appendChild(txt);act(txt);
  const ln=mkSVG('line',{x1:60,y1:360,x2:700,y2:360,stroke:'#ccc','stroke-width':'1.5','stroke-dasharray':'8,4'});CONT.appendChild(ln);act(ln);
  updateLayers();
  renderIconLibrary();
  resizeTX();
},150);

new ResizeObserver(()=>{resizeTX();updateTX();}).observe(CW);
