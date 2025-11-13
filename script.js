/* script.js (v2.2) - use with Apps Script v2.2
   Ensure SCRIPT_URL below matches your deployed Apps Script Web App URL.
*/

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySCWOoyk8WVs7ktDRWFoe6-KZ1WlpjbIRtFwE-xcoWNSiIMWatBiJMqUr2ns_oCGoQ/exec";
const ADMIN_KEY = "Sksb@abab023";

// Elements
const apiUrlEl = document.getElementById('apiUrl');
apiUrlEl.textContent = SCRIPT_URL;

const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const adminPass = document.getElementById('adminPass');
const adminControls = document.getElementById('adminControls');
const loginNotice = document.getElementById('loginNotice');

const btnTambah = document.getElementById('btnTambah');
const namaBaru = document.getElementById('namaBaru');
const jawatanBaru = document.getElementById('jawatanBaru');

const btnTambahBelanja = document.getElementById('btnTambahBelanja');
const tarikhBelanja = document.getElementById('tarikhBelanja');
const tujuanBelanja = document.getElementById('tujuanBelanja');
const jumlahBelanja = document.getElementById('jumlahBelanja');
const catatanBelanja = document.getElementById('catatanBelanja');

const sumKutipanEl = document.getElementById('sumKutipan');
const sumBelanjaEl = document.getElementById('sumBelanja');
const sumBakiEl = document.getElementById('sumBaki');

const bayaranTable = document.getElementById('bayaranTable');
const belanjaTable = document.getElementById('belanjaTable');

let isAdmin = false;
let cached = null;

// helpers
function RM(n){ return "RM " + (Number(n)||0).toFixed(2); }
function safe(v){ return v===null||v===undefined||v==='' ? '—' : v; }

async function apiGet(){
  const r = await fetch(SCRIPT_URL + "?t=" + Date.now());
  if(!r.ok) throw new Error('Server ' + r.status);
  return r.json();
}

async function apiPost(payload){
  const r = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if(!r.ok){
    const txt = await r.text().catch(()=>r.statusText);
    throw new Error('Server ' + r.status + ' - ' + txt);
  }
  return r.json();
}

// render summary
function renderSummary(json){
  const header = json.bayaran?.[0] || [];
  const rows = json.bayaran?.slice(1) || [];
  const idxSudah = header.indexOf("Jumlah Sudah Bayar");
  let totalSudah = 0;
  rows.forEach(r=> totalSudah += Number(r[idxSudah])||0);

  let totalBelanja = 0;
  if(Array.isArray(json.belanja)){
    json.belanja.slice(1).forEach(r=> totalBelanja += Number(r[2])||0);
  }

  sumKutipanEl.textContent = RM(totalSudah);
  sumBelanjaEl.textContent = RM(totalBelanja);
  sumBakiEl.textContent = RM(totalSudah - totalBelanja);
}

// render bayaran table (Tindakan only if admin)
function renderBayaran(json){
  const header = json.bayaran?.[0] || [];
  const rows = json.bayaran?.slice(1) || [];

  let ths = header.map(h => `<th>${h}</th>`).join('');
  if(isAdmin) ths += '<th>Tindakan</th>';
  const head = `<thead><tr>${ths}</tr></thead>`;

  let body = rows.map((r,ri) => {
    let cols = r.map((c,ci) => {
      // monthly columns index 2..13 (0-based)
      if(ci >= 2 && ci <= 13){
        const val = Number(c) || 0;
        return val > 0 ? `<td class="cell-paid">${val} ✅</td>` : `<td class="cell-missed">— ❌</td>`;
      }
      if(header[ci] === 'Jumlah Sudah Bayar') return `<td class="col-sudah">${safe(c)}</td>`;
      if(header[ci] === 'Jumlah Belum Bayar') return `<td class="col-belum">${safe(c)}</td>`;
      return `<td>${safe(c)}</td>`;
    }).join('');

    if(isAdmin){
      // edit & arkib icons
      cols += `<td>
        <button class="small-icon" data-act="edit" data-row="${ri}" title="Edit">✏️</button>
        <button class="small-icon" data-act="arkib" data-row="${ri}" title="Arkib">🗑️</button>
      </td>`;
    }

    return `<tr data-row="${ri}">${cols}</tr>`;
  }).join('');

  bayaranTable.innerHTML = head + "<tbody>" + body + "</tbody>";

  // attach handlers for tindakan and monthly clicks
  if(isAdmin){
    bayaranTable.querySelectorAll('button.small-icon').forEach(b=>{
      b.addEventListener('click', async (ev)=>{
        const act = b.dataset.act;
        const idx = Number(b.dataset.row);
        if(act === 'edit') return editMember(idx);
        if(act === 'arkib') return arkibMember(idx);
      });
    });
  }

  // monthly cell toggle (admin only)
  bayaranTable.querySelectorAll('tbody tr').forEach((tr)=>{
    const cells = Array.from(tr.querySelectorAll('td'));
    // monthly cells are header indexes 2..13 => td positions 2..13
    cells.forEach((td, ci) => {
      if(ci >= 2 && ci <= 13){
        td.style.cursor = isAdmin ? 'pointer' : 'default';
        td.onclick = async ()=> {
          if(!isAdmin){ alert('Hanya admin boleh kemaskini.'); return; }
          await toggleMonth(tr, ci);
        };
      }
    });
  });
}

// render belanja table
function renderBelanja(json){
  if(!Array.isArray(json.belanja) || json.belanja.length <= 1){
    belanjaTable.innerHTML = "<tr><td>Tiada rekod perbelanjaan.</td></tr>";
    return;
  }
  const header = json.belanja[0];
  const head = "<thead><tr>" + header.map(h=>`<th>${h}</th>`).join('') + (isAdmin? '<th>Tindakan</th>':'') + "</tr></thead>";

  const body = json.belanja.slice(1).map((r,ri) => {
    const tds = `<td>${safe(r[0])}</td><td>${safe(r[1])}</td><td>${RM(r[2])}</td><td>${safe(r[3])}</td>`;
    const act = isAdmin ? `<td><button class="small-icon" data-act="delb" data-row="${ri}">🗑️</button></td>` : '';
    return `<tr data-row="${ri}">${tds}${act}</tr>`;
  }).join('');

  belanjaTable.innerHTML = head + "<tbody>" + body + "</tbody>";

  // attach delete handlers for belanja if admin
  if(isAdmin){
    belanjaTable.querySelectorAll('button.small-icon').forEach(b=>{
      b.addEventListener('click', async ()=>{
        const idx = Number(b.dataset.row);
        if(!confirm('Padam perbelanjaan ini?')) return;
        try{
          await apiPost({ action:'hapusBelanja', apiKey:ADMIN_KEY, index: idx });
          await refresh();
        }catch(err){ alert('Gagal padam: ' + err.message); }
      });
    });
  }
}

// actions
async function refresh(){
  try{
    const data = await apiGet();
    cached = data;
    renderSummary(data);
    renderBayaran(data);
    renderBelanja(data);
    // update version if provided
    if(data.version) document.getElementById('versi').textContent = 'v' + data.version;
  }catch(err){
    console.error(err);
    alert('Gagal muat data: ' + err.message);
  }
}

async function addMember(){
  if(!isAdmin) return alert('Log masuk admin dahulu.');
  const nama = namaBaru.value.trim();
  const jaw = jawatanBaru.value;
  if(!nama || !jaw) return alert('Sila isi nama & jawatan.');
  try{
    await apiPost({ action:'tambahAhli', apiKey:ADMIN_KEY, nama, jawatan: jaw });
    namaBaru.value=''; jawatanBaru.value='';
    await refresh();
    alert('Ahli ditambah.');
  }catch(err){ alert('Gagal tambah: '+err.message); }
}

async function addBelanja(){
  if(!isAdmin) return alert('Log masuk admin dahulu.');
  const t = tarikhBelanja.value; // yyyy-mm-dd
  const tujuan = tujuanBelanja.value.trim();
  const jumlah = jumlahBelanja.value;
  const cat = catatanBelanja.value.trim();
  if(!tujuan || !jumlah) return alert('Sila isi tujuan & jumlah.');
  // format date to D/M/YYYY if date chosen
  let tarikh = t;
  if(t){
    const d = new Date(t);
    tarikh = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  }
  try{
    await apiPost({ action:'tambahBelanja', apiKey:ADMIN_KEY, tarikh, tujuan, jumlah: Number(jumlah), catatan: cat });
    tarikhBelanja.value=''; tujuanBelanja.value=''; jumlahBelanja.value=''; catatanBelanja.value='';
    await refresh();
    alert('Perbelanjaan ditambah.');
  }catch(err){ alert('Gagal tambah belanja: '+err.message); }
}

async function editMember(idx){
  if(!isAdmin) return alert('Admin sahaja.');
  const r = cached?.bayaran?.[idx+1];
  if(!r) return alert('Rekod tidak dijumpai.');
  const nama = prompt('Nama baru:', r[0] || '');
  if(nama === null) return;
  const jaw = prompt('Jawatan (Guru/Staf):', r[1] || '');
  if(jaw === null) return;
  if(!nama.trim() || !jaw.trim()) return alert('Nama & jawatan diperlukan.');
  try{
    await apiPost({ action:'editAhli', apiKey:ADMIN_KEY, row: idx, nama: nama.trim(), jawatan: jaw.trim() });
    await refresh();
  }catch(err){ alert('Gagal edit: '+err.message); }
}

async function arkibMember(idx){
  if(!isAdmin) return alert('Admin sahaja.');
  const r = cached?.bayaran?.[idx+1];
  if(!r) return alert('Rekod tidak dijumpai.');
  if(!confirm(`Arkibkan ahli ${r[0]}?`)) return;
  try{
    await apiPost({ action:'arkibAhli', apiKey:ADMIN_KEY, row: idx });
    await refresh();
  }catch(err){ alert('Gagal arkib: '+err.message); }
}

// toggle month cell (ci is td index in row, 0-based)
async function toggleMonth(tr, ci){
  if(!isAdmin) { alert('Admin sahaja.'); return; }
  const rowIndex = Number(tr.dataset.row);
  const header = cached?.bayaran?.[0] || [];
  const currentRow = cached?.bayaran?.[rowIndex+1] || [];
  const curVal = Number(currentRow[ci]) || 0;

  // determine suggested value from tetapan if available
  let suger = 0;
  if(Array.isArray(cached?.tetapan) && cached.tetapan.length > 1){
    const last = cached.tetapan[cached.tetapan.length - 1];
    suger = (currentRow[1] === 'Guru') ? Number(last[2]||0) : Number(last[3]||0);
  } else {
    suger = currentRow[1] === 'Guru' ? 20 : 10;
  }

  if(curVal > 0){
    if(!confirm('Nilai sedia ada akan dibuang (tandakan belum bayar). Seterusnya?')) return;
    try{
      await apiPost({ action:'toggleMonth', apiKey:ADMIN_KEY, row: rowIndex, colIndex: ci, value: 0 });
      await refresh();
    }catch(err){ alert('Gagal: '+err.message); }
  } else {
    let input = prompt(`Masukkan jumlah untuk ${header[ci]} (cadangan ${suger}):`, String(suger||''));
    if(input === null) return;
    input = input.trim();
    if(input === '' || isNaN(Number(input))) return alert('Sila masukkan nombor.');
    try{
      await apiPost({ action:'toggleMonth', apiKey:ADMIN_KEY, row: rowIndex, colIndex: ci, value: Number(input) });
      await refresh();
    }catch(err){ alert('Gagal: '+err.message); }
  }
}

// login/out
loginBtn.addEventListener('click', ()=>{
  const v = adminPass.value || '';
  if(v === ADMIN_KEY){
    isAdmin = true;
    adminControls.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    loginBtn.style.display = 'none';
    loginNotice.textContent = '✅ Log masuk berjaya';
    refresh();
  } else {
    alert('Kata laluan salah');
    loginNotice.textContent = '❌ Kata laluan salah';
  }
});
logoutBtn.addEventListener('click', ()=>{
  isAdmin = false;
  adminControls.style.display = 'none';
  logoutBtn.style.display = 'none';
  loginBtn.style.display = 'inline-block';
  adminPass.value = '';
  loginNotice.textContent = '';
  refresh();
});

btnTambah.addEventListener('click', addMember);
btnTambahBelanja.addEventListener('click', addBelanja);

// initial load + auto refresh every 20s
refresh();
setInterval(()=>{ refresh(); }, 20000);
