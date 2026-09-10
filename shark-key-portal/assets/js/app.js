const space=document.getElementById('space'),sctx=space.getContext('2d');
const fx=document.getElementById('fx'),fctx=fx.getContext('2d');
let W=innerWidth,H=innerHeight,DPR=Math.min(devicePixelRatio||1,2),stars=[],streaks=[],sparks=[];
function setupCanvas(c,ctx){c.width=innerWidth*DPR;c.height=innerHeight*DPR;c.style.width=innerWidth+'px';c.style.height=innerHeight+'px';ctx.setTransform(DPR,0,0,DPR,0,0)}
function resize(){W=innerWidth;H=innerHeight;setupCanvas(space,sctx);setupCanvas(fx,fctx);stars=Array.from({length:Math.min(360,Math.floor(W*.36))},()=>({x:(Math.random()-.5)*W,y:(Math.random()-.5)*H,z:Math.random()*1+.05,p:Math.random()*6.28,s:Math.random()*.55+.08}));streaks=Array.from({length:Math.min(22,Math.floor(W/70))},()=>({x:Math.random()*W,y:Math.random()*H,v:Math.random()*5+4,l:Math.random()*55+25,a:Math.random()*.28+.08}));}
addEventListener('resize',resize);resize();
let last=performance.now();
function renderSpace(t){const dt=Math.min((t-last)/16.67,2);last=t;sctx.clearRect(0,0,W,H);fctx.clearRect(0,0,W,H);
const cx=W*.5,cy=H*.5;
for(const p of stars){p.z-=.0022*dt*p.s*5;if(p.z<.02){p.x=(Math.random()-.5)*W;p.y=(Math.random()-.5)*H;p.z=1;}const x=cx+(p.x/p.z),y=cy+(p.y/p.z),r=Math.max(.35,2.2*(1-p.z));if(x>-20&&x<W+20&&y>-20&&y<H+20){sctx.beginPath();sctx.fillStyle=`rgba(190,235,255,${.18+(1-p.z)*.58})`;sctx.arc(x,y,r,0,Math.PI*2);sctx.fill();if(p.z<.24){sctx.strokeStyle=`rgba(0,234,255,${(0.18-p.z)*.8})`;sctx.lineWidth=.8;sctx.beginPath();sctx.moveTo(x,y);sctx.lineTo(x+(x-cx)*.018,y+(y-cy)*.018);sctx.stroke()}}}
for(const q of streaks){q.x+=q.v*dt;q.y+=q.v*.18*dt;if(q.x>W+100){q.x=-120;q.y=Math.random()*H}fctx.strokeStyle=`rgba(110,210,255,${q.a})`;fctx.lineWidth=1;fctx.beginPath();fctx.moveTo(q.x,q.y);fctx.lineTo(q.x-q.l,q.y-q.l*.18);fctx.stroke()}
for(let i=sparks.length-1;i>=0;i--){const q=sparks[i];q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=.02*dt;if(q.life<=0){sparks.splice(i,1);continue}fctx.fillStyle=`rgba(120,245,255,${q.life})`;fctx.fillRect(q.x,q.y,1.5,1.5)}
requestAnimationFrame(renderSpace)}requestAnimationFrame(renderSpace);

const card=document.getElementById('card');
addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX+'px');document.documentElement.style.setProperty('--my',e.clientY+'px');if(innerWidth>700){const rx=(e.clientY/H-.5)*-4,ry=(e.clientX/W-.5)*5;card.style.transform=`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`}});
addEventListener('pointerleave',()=>card.style.transform='');
const modal=document.getElementById('modal'),keyValue=document.getElementById('keyValue'),toast=document.getElementById('toast');
const keyBtn=document.getElementById('getKey');
const keyBtnText=document.getElementById('keyBtnText');
const gateNote=document.getElementById('gateNote');

/*
  IMPORTANT:
  Set OUO_GATE_URL to your own Ouo.io short link.
  Its final destination should return to this same page with ?ouo_verified=1.
  Example destination: https://your-domain.com/?ouo_verified=1
  For real anti-cheat security, validate the completion server-side instead of trusting this query flag.
*/
const CONFIG=window.SHARK_CONFIG || {};
const OUO_GATE_URL=CONFIG.OUO_GATE_URL || 'https://ouo.io/PUT-YOUR-LINK-HERE';
const RETURN_MARKER=CONFIG.RETURN_MARKER || 'shark_ouo_verified_v1';
const STORED_KEY=CONFIG.STORAGE_KEY || 'shark_saved_key_v1';
const API_BASE_URL=(CONFIG.API_BASE_URL||'').trim();
const API_KEY_SECRET=CONFIG.API_KEY_SECRET||'';
const DEFAULT_KEY_DURATION=CONFIG.DEFAULT_KEY_DURATION||{amount:30,unit:'ngay'};

function generateKey(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let key='SHARK-';for(let g=0;g<2;g++){for(let i=0;i<4;i++)key+=chars[Math.floor(Math.random()*chars.length)];if(g===0)key+='-'}return key}

// Tao key DONG BO voi bot Discord: goi API cua bot (POST /api/generate-key)
// de bot tu sinh + luu key, dam bao lenh "!key <key>" trong Discord nhan
// dung key nay. Neu chua cau hinh API_BASE_URL (de trong), fallback ve
// random key CHI TREN TRINH DUYET nhu ban cu (bot se KHONG biet key nay).
async function requestKeyFromBot(){
  if(!API_BASE_URL || API_BASE_URL.includes('your-bot-domain')){
    console.warn('[SHARK] API_BASE_URL chưa được cấu hình trong config.js - key được tạo CỤC BỘ, KHÔNG đồng bộ với bot Discord.');
    return generateKey();
  }
  try{
    const res=await fetch(API_BASE_URL.replace(/\/$/,'')+'/api/generate-key',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':API_KEY_SECRET},
      body:JSON.stringify(DEFAULT_KEY_DURATION)
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(!data || !data.key) throw new Error('Phản hồi thiếu key');
    return data.key;
  }catch(err){
    console.error('[SHARK] Không lấy được key từ bot, dùng key cục bộ tạm thời:',err);
    setToast('⚠️ Không kết nối được server','Đang tạo key tạm - vui lòng liên hệ Admin nếu key không hoạt động.');
    return generateKey();
  }
}
function burst(){const r=keyBtn.getBoundingClientRect();for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,spd=Math.random()*7+2;sparks.push({x:r.left+r.width/2,y:r.top+r.height/2,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,life:1})}}
function getStoredKey(){return localStorage.getItem(STORED_KEY)||''}
function isGateVerified(){return sessionStorage.getItem(RETURN_MARKER)==='1'}
function setGateVerified(){sessionStorage.setItem(RETURN_MARKER,'1')}
function setToast(title,small){toast.querySelector('b').textContent=title;toast.querySelector('small').textContent=small;toast.classList.add('show');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>toast.classList.remove('show'),2400)}

// Ouo return: the destination page should append ?ouo_verified=1.
// We only accept this marker on a fresh return navigation; then it is immediately removed.
const params=new URLSearchParams(location.search);
if(params.get('ouo_verified')==='1'){
  sessionStorage.setItem(RETURN_MARKER,'1');
  setGateVerified();
  const clean=location.origin+location.pathname+(location.hash||'');
  history.replaceState({},'',clean);
  setToast('Xác minh Ouo thành công','Bây giờ bạn có thể bấm Lấy Key.');
}

const existingKey=getStoredKey();
if(existingKey){
  gateNote.textContent='KEY CŨ ĐÃ ĐƯỢC LƯU — KHÔNG TẠO KEY MỚI';
  gateNote.classList.add('old');
} else if(isGateVerified()){
  gateNote.textContent='OUO ĐÃ XÁC MINH — SẴN SÀNG NHẬN KEY';
  gateNote.classList.add('ready');
}

keyBtn.onclick=async()=>{
  const oldKey=getStoredKey();
  // Once a key exists, always show the same old key. Never generate another.
  if(oldKey){
    keyValue.textContent=oldKey;
    modal.classList.add('show');
    setToast('Key cũ của bạn','Hệ thống không tạo Key mới.');
    return;
  }
  // First visit: send user through Ouo before allowing key creation.
  if(!isGateVerified()){
    if(!OUO_GATE_URL || OUO_GATE_URL.includes('PUT-YOUR-LINK-HERE')){
      setToast('⚠️Vui Lòng Vượt Link Ủng Hộ AD Với ⚠️','Vui lòng vượt link ủng hộ AD trước khi tiếp tục.');
      return;
    }
      setToast('Đang chuyển sang Ouo.io','Vượt Ouo xong hệ thống sẽ đưa bạn quay lại trang này.');
    setTimeout(()=>{location.href=OUO_GATE_URL},450);
    return;
  }
  keyBtn.disabled=true;
  const originalBtnText=keyBtnText.textContent;
  keyBtnText.textContent='ĐANG TẠO KEY...';
  const newKey=await requestKeyFromBot();
  keyBtn.disabled=false;
  localStorage.setItem(STORED_KEY,newKey);
  keyValue.textContent=newKey;
  keyBtnText.textContent='XEM KEY CỦA BẠN';
  gateNote.textContent='KEY ĐÃ ĐƯỢC CẤP — KHÔNG TẠO KEY MỚI';
  gateNote.classList.add('old');
  modal.classList.add('show');toast.classList.add('show');burst();
  setToast('Key đã được tạo thành công','Key này đã được lưu và sẽ luôn giữ nguyên.');
};

document.getElementById('close').onclick=()=>modal.classList.remove('show');modal.onclick=e=>{if(e.target===modal)modal.classList.remove('show')};
document.getElementById('copy').onclick=async()=>{
  const btn=document.getElementById('copy');
  const text=keyValue.textContent.trim();
  let ok=false;
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);ok=true;}}catch(e){}
  if(!ok){try{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';ta.style.top='0';document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,ta.value.length);ok=document.execCommand('copy');ta.remove();}catch(e){}}
  if(ok){btn.textContent='Đã sao chép ✓';setToast('Đã sao chép Key','Key đã được lưu vào bộ nhớ tạm.');setTimeout(()=>btn.textContent='Sao chép Key',1800)}
  else alert('Trình duyệt không cho phép sao chép tự động. Hãy nhấn giữ Key để sao chép.');
};
