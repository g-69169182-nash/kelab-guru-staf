/* script.js v2.0
   Frontend untuk Sistem Yuran Kelab Guru & Staf
   - Masukkan SCRIPT_URL di bawah (anda sudah berikan)
   - Pastikan Apps Script menerima POST dengan body JSON { action, apiKey, ... }
*/

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySCWOoyk8WVs7ktDRWFoe6-KZ1WlpjbIRtFwE-xcoWNSiIMWatBiJMqUr2ns_oCGoQ/exec";
const ADMIN_KEY = "Sksb@abab023"; // jika Apps Script pakai kunci lain, tukar sini

// UI refs
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminPass = document.getElementById('adminPass');
const adminControls = document.getElementById('adminControls');
const loginNotice = document.getElementById('loginNotice');

const tambahBtn = document.getElementById('tambahBtn');
const namaAhli = document.getElementById('namaAhli');
const jawatanSelect = document.getElementById('jawatanSelect');

const tambahBelanjaBtn = document.getElementById('tambahBelanjaBtn');
const belanjaTarikh = document.getElementById('belanjaTarikh');
const belanjaTujuan = document.getElementById('belanjaTujuan');
const belanjaJumlah = document.getElementById('belanjaJumlah');
const belanjaCatatan = document.getElementById('belanjaCatatan');

const jumlahKutipanEl = document.getElementById('jumlahKutipan');
const jumlahBelanjaEl = document.getElementById('jumlahBelanja');
const bakiEl = document.getElementById('baki');

const bayaranTable = document.getElementById('bayaranTable');
const belanjaTable = document.getElementById('belanjaTable');
const apiUrlEl = document.getElementById('apiUrl');
apiUrlEl.textContent = SCRIPT_URL;

let isAdmin = false;
let cachedData = null;

// ----- helpers -----
function fmtRM(n){
  if(n===null||n===undefined||n==='') return "—";
  const num = Number(n) || 0;
  return "RM " + num.toFixed(2);
}
function safeText(t){ return (t===null||t===undefined||t==="") ? "—" : String(t); }

async function apiGet(){
  const res = await fetch(SCRIPT_URL + "?t=" + Date.now());
  if(!res.ok) throw new Error("Server returned " + res.status);
  return res.json();
}

async function apiPost(body){
  // Apps Script must support CORS; if not, use mode:'no-cors' (but no response)
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: {'Content-Type':'application/json'},
    mode: 'cors',
    body: JSON.stringify(body)
  });
  if(!res.ok) {
    let txt = await res.text().catch(()=>res.statusText);
    throw new Error('Server ' + res.status + ' - ' + txt);
  }
  return res.json().catch(()=>({status:'ok'}));
}

// ----- render summary -----
function renderSummary(json){
  const header = json.bayaran?.[0] || [];
  const rows = json.bayaran?.slice(1) || [];
  const idxSudah = header.indexOf("Jumlah Sudah Bayar");
  const idxBelum = header.indexOf("Jumlah Belum Bayar");
  let sumSudah=0, sumBelum=0;
  if(idxSudah>=0){
    rows.forEach(r=>{ sumSudah += Number(r[idxSudah])||0; });
  }
  if(idxBelum>=0){
    rows.forEach(r=>{ sumBelum += Number(r[idxBelum])||0; });
  }
  // fallback sum perbelanjaan
  let sumBelanja=0;
  if(Array.isArray(json.belanja) && json.belanja.length>1){
    json.belanja.slice(1).forEach(r=>{ sumBelanja += Number(r[2])||0; });
  }
  jumlahKutipanEl.textContent = "RM " + sumSudah.toFixed(2);
  jumlahBelanjaEl.textContent = "RM " + sumBelanja.toFixed(2);
  bakiEl.textContent = "RM " + (sumSudah - sumBelanja).toFixed(2);
}

// ----- build bayaran table -----
function renderBayaran(json){
  const header = json.bayaran?.[0] || [];
  const rows = json.bayaran?.slice(1) || [];

  // header row
  const ths = header.map(h=>`<th>${h}</th>`).join('');
  // add tindakan header
  const head = `<thead><tr>${ths}<th>Tindakan</th></tr></thead>`;

  // body rows
  const bodyRows = rows.map((r,ri)=>{
    const cells = r.map((c,ci)=>{
      const colName = header[ci] || '';
      // numeric monthly columns are at index 2..13
      if(ci>=2 && ci<=13){
        const val = Number(c) || 0;
        if(val>0){
          return `<td class="cell-paid">${val} <span aria-hidden>✅</span></td>`;
        } else {
          return `<td class="cell-missed">— <span aria-hidden>❌</span></td>`;
        }
      }
      if(colName === 'Jumlah Sudah Bayar'){
        return `<td class="col-sudah">${(c===0 || c===''? '—' : 'RM ' + Number(c).toFixed(0))}</td>`;
      }
      if(colName === 'Jumlah Belum Bayar'){
        return `<td class="col-belum">${(c===0 || c===''? '—' : Number(c))}</td>`;
      }
      // default (name, jawatan)
      return `<td>${safeText(c)}</td>`;
    }).join('');

    // tindakan icons (edit, delete)
    const name = r[0] || '';
    const tindakan = `<td>
      <button class="small-icon" title="Edit" data-action="edit" data-row="${ri}">✏️</button>
      <button class="small-icon" title="Arkib" data-action="del" data-row="${ri}">🗑️</button>
    </td>`;

    return `<tr data-row="${ri}">${cells}${tindakan}</tr>`;
  }).join('');

  bayaranTable.innerHTML = head + "<tbody>" + bodyRows + "</tbody>";

  // attach handlers for tindakan and month toggles
  // tindakan
  bayaranTable.querySelectorAll('button.small-icon').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const action = btn.dataset.action;
      const rowIndex = Number(btn.dataset.row);
      if(action === 'edit') return handleEditMember(rowIndex);
      if(action === 'del') return handleDeleteMember(rowIndex);
    });
  });

  // month cells - use event delegation: clicking a monthly cell toggles (admin only)
  bayaranTable.querySelectorAll('tbody tr').forEach(tr=>{
    tr.querySelectorAll('td').forEach((td,ci)=>{
      // monthly columns positions are 2..13 (0 based indexing of header)
      if(ci>=2 && ci<=13){
        td.style.cursor = 'pointer';
        td.addEventListener('click', ()=>handleToggleMonth(tr, ci));
      }
    });
  });
}

// ----- build belanja table -----
function renderBelanja(json){
  if(!Array.isArray(json.belanja) || json.belanja.length<=1){
    belanjaTable.innerHTML = "<tr><td>Tiada rekod perbelanjaan.</td></tr>";
    return;
  }
  const header = json.belanja[0];
  const ths = header.map(h=>`<th>${h}</th>`).join('');
  const rows = json.belanja.slice(1).map((r,ri)=>{
    const tds = r.map((c,ci)=>{
      if(ci===2) return `<td>${fmtRM(c)}</td>`;
      return `<td>${safeText(c)}</td>`;
    }).join('');
    // add delete button for admin
    return `<tr data-row="${ri}">${tds}<td>${isAdmin? `<button class="small-icon" data-action="delBel" data-row="${ri}">🗑️</button>` : ''}</td></tr>`;
  }).join('');
  belanjaTable.innerHTML = `<thead><tr>${ths}<th>Tindakan</th></tr></thead><tbody>${rows}</tbody>`;

  // attach delete handlers if admin
  belanjaTable.querySelectorAll('button.small-icon').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const idx = Number(btn.dataset.row);
      const rec = json.belanja[idx+1];
      if(!rec) return alert('record not found');
      if(!confirm(`Padam perbelanjaan: ${rec[1]} (${rec[2]}) ?`)) return;
      try{
        await apiPost({action:'hapusBelanja', apiKey:ADMIN_KEY, index: idx});
        await refresh();
      }catch(err){ alert('Gagal padam perbelanjaan: '+err.message); }
    });
  });
}

// ----- user actions -----
async function handleToggleMonth(tr, colIndex){
  if(!isAdmin){ alert('Hanya admin boleh kemaskini.'); return; }
  // find row index:
  const rowIndex = Number(tr.dataset.row);
  const json = cachedData;
  if(!json) return;
  const header = json.bayaran[0];
  const rows = json.bayaran.slice(1);
  const targetRow = rows[rowIndex];
  if(!targetRow) return;

  // which month name
  const monthName = header[colIndex]; // e.g. "Jan"
  // current value
  const cur = Number(targetRow[colIndex]) || 0;
  // ask amount to set (defaults: take tetapan)
  const jawatan = targetRow[1] || '';
  // get default amounts from tetapan
  let defaultGuru = 0, defaultStaf = 0;
  if(Array.isArray(json.tetapan) && json.tetapan[1]){
    defaultGuru = Number(json.tetapan[1][2])||0;
    defaultStaf = Number(json.tetapan[1][3])||0;
  }
  const suggested = (jawatan === 'Guru')? defaultGuru : defaultStaf;
  let val = null;
  if(cur>0){
    if(!confirm('Catatan: nilai sedia ada akan dibuang (tandakan belum bayar). Teruskan?')) return;
    val = 0;
  } else {
    // prompt for amount (user can change)
    let input = prompt(`Pilihan jumlah (cadangan ${suggested}):`, String(suggested||''));
    if(input===null) return; // cancel
    input = input.trim();
    if(input === '') return alert('Sila masukkan nombor');
    if(isNaN(Number(input))) return alert('Sila masukkan nombor sahaja');
    val = Number(input);
  }

  // send to server
  try{
    await apiPost({ action:'toggleMonth', apiKey:ADMIN_KEY, row: rowIndex, colIndex, value: val });
    await refresh();
  }catch(err){
    alert('Gagal kemaskini: ' + err.message);
  }
}

async function handleEditMember(rowIndex){
  if(!isAdmin){ alert('Hanya admin boleh edit.'); return; }
  const json = cachedData;
  if(!json) return;
  const rows = json.bayaran.slice(1);
  const r = rows[rowIndex];
  if(!r) return;
  const newName = prompt('Nama baru:', r[0] || '');
  if(newName === null) return;
  const newJaw = prompt('Jawatan (Guru/Staf):', r[1] || '');
  if(newJaw === null) return;
  if(!newName.trim() || !newJaw.trim()) return alert('Nama/jawatan diperlukan');
  try{
    await apiPost({ action:'editAhli', apiKey:ADMIN_KEY, row: rowIndex, nama: newName.trim(), jawatan: newJaw.trim() });
    await refresh();
  }catch(err){ alert('Gagal edit: '+err.message); }
}

async function handleDeleteMember(rowIndex){
  if(!isAdmin){ alert('Hanya admin boleh memadam.'); return; }
  const json = cachedData;
  const rows = json.bayaran.slice(1);
  const r = rows[rowIndex];
  if(!r) return;
  if(!confirm(`Arkibkan ahli ${r[0]}? (rekod tidak dipadam terus, bergantung Apps Script)`)) return;
  try{
    await apiPost({ action:'hapusAhli', apiKey:ADMIN_KEY, row: rowIndex });
    await refresh();
  }catch(err){ alert('Gagal padam: '+err.message); }
}

// tambah ahli
async function tambahAhli(){
  if(!isAdmin){ alert('Sila log masuk admin'); return; }
  const nama = namaAhli.value.trim();
  const jaw = jawatanSelect.value;
  if(!nama || !jaw) return alert('Sila isi nama dan jawatan');
  try{
    await apiPost({ action:'tambahAhli', apiKey:ADMIN_KEY, nama, jawatan:jaw });
    namaAhli.value=''; jawatanSelect.value='';
    await refresh();
  }catch(err){ alert('Gagal tambah ahli: '+err.message); }
}

// tambah belanja
async function tambahBelanja(){
  if(!isAdmin){ alert('Sila log masuk admin'); return; }
  const t = belanjaTarikh.value.trim();
  const tu = belanjaTujuan.value.trim();
  const j = belanjaJumlah.value.trim();
  const cat = belanjaCatatan.value.trim();
  if(!tu || !j) return alert('Sila isi tujuan dan jumlah');
  if(isNaN(Number(j))) return alert('Jumlah mesti nombor');
  try{
    await apiPost({ action:'tambahBelanja', apiKey:ADMIN_KEY, tarikh: t, tujuan: tu, jumlah: Number(j), catatan: cat });
    belanjaTarikh.value=''; belanjaTujuan.value=''; belanjaJumlah.value=''; belanjaCatatan.value='';
    await refresh();
  }catch(err){ alert('Gagal tambah perbelanjaan: '+err.message); }
}

// login/logout
function setLoggedIn(flag){
  isAdmin = !!flag;
  adminControls.style.display = flag ? 'block' : 'none';
  logoutBtn.style.display = flag ? 'inline-block' : 'none';
  loginBtn.style.display = flag ? 'none' : 'inline-block';
  loginNotice.textContent = flag ? '✅ Log masuk' : '';
}

// refresh data
async function refresh(){
  try{
    const json = await apiGet();
    cachedData = json;
    renderSummary(json);
    renderBayaran(json);
    renderBelanja(json);
    // optional: show version if sent by API
    if(json?.version) document.getElementById('versi').textContent = 'versi ' + json.version;
  }catch(err){
    console.error(err);
    alert('Gagal muat data: ' + err.message);
  }
}

// attach listeners
loginBtn.addEventListener('click', ()=>{
  const val = adminPass.value || '';
  if(val === ADMIN_KEY){
    setLoggedIn(true);
    loginNotice.textContent = '✅ Log masuk berjaya';
  } else {
    setLoggedIn(false);
    loginNotice.textContent = '❌ Kata laluan salah';
  }
});
logoutBtn.addEventListener('click', ()=>{
  setLoggedIn(false);
  adminPass.value='';
  loginNotice.textContent = '';
});

// add handlers
tambahBtn.addEventListener('click', tambahAhli);
tambahBelanjaBtn.addEventListener('click', tambahBelanja);

// initial load
refresh();

// Auto-refresh every 20s (can change if mahu)
setInterval(()=>{ refresh(); }, 20000);
