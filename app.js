// app.js - FoodSave prototype
(function(){
  // ----- Utilities -----
  const $ = id => document.getElementById(id);
  const saveKey = 'foodsave_items_v1';

  function todayISO(){ return new Date().toISOString().slice(0,10); }

  function daysBetween(d1, d2){
    // returns integer days between two date strings "YYYY-MM-DD"
    const a = new Date(d1);
    const b = new Date(d2);
    const diff = (b - a) / (1000*60*60*24);
    return Math.ceil(diff);
  }

  // Haversine distance in km
  function distanceKm(lat1, lon1, lat2, lon2){
    const R = 6371;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2-lat1);
    const dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R*c;
  }

  // ----- Mock donation centers (example) -----
  const donationCenters = [
    {name:"City Food Bank A", lat:28.644800, lon:77.216721, address:"Central district"},
    {name:"Community Kitchen B", lat:28.535517, lon:77.391029, address:"Near market"},
    {name:"NGO Pantry C", lat:28.459497, lon:77.026638, address:"Local shelter"},
    {name:"Neighborhood Donation Hub", lat:28.669156, lon:77.453758, address:"Community center"}
  ];

  // ----- State -----
  let items = JSON.parse(localStorage.getItem(saveKey) || "[]");
  let checkInterval = null;
  let lastKnownCoords = null;

  // ----- DOM -----
  const itemForm = $('itemForm');
  const nameI = $('name');
  const qtyI = $('qty');
  const categoryI = $('category');
  const purchaseI = $('purchase');
  const expiryI = $('expiry');
  const itemsList = $('itemsList');
  const centersList = $('centersList');
  const locBtn = $('locBtn');
  const locMsg = $('locMsg');
  const notifyPermBtn = $('notifyPerm');
  const suggestBuyBtn = $('suggestBuy');
  const statsDiv = $('stats');
  const exportBtn = $('exportBtn');
  const clearBtn = $('clearBtn');

  // ----- CRUD -----
  function persist(){ localStorage.setItem(saveKey, JSON.stringify(items)); }
  function newId(){ return 'id_'+Math.random().toString(36).slice(2,9); }

  function addItem(obj){
    if(!obj.id) obj.id = newId();
    items.push(obj);
    persist(); renderItems();
  }
  function updateItem(id, patch){
    items = items.map(it => it.id===id ? {...it, ...patch} : it);
    persist(); renderItems();
  }
  function removeItem(id){
    items = items.filter(it => it.id!==id);
    persist(); renderItems();
  }

  // ----- Rendering -----
  function urgencyClass(daysLeft){
    if(daysLeft <= 1) return 'urg-high';
    if(daysLeft <= 4) return 'urg-mid';
    return 'urg-low';
  }

  function renderItems(){
    itemsList.innerHTML = '';
    if(items.length===0) itemsList.innerHTML = '<li class="muted">No items tracked yet.</li>';
    // Stats
    const total = items.length;
    const expSoon = items.filter(i => daysBetween(todayISO(), i.expiry) <= 3).length;
    const perishable = items.filter(i => i.category && i.category.toLowerCase().includes('perish')).length;
    statsDiv.innerHTML = `
      <div class="statCard">Total items: <strong>${total}</strong></div>
      <div class="statCard">Expiring ≤3 days: <strong>${expSoon}</strong></div>
      <div class="statCard">Perishable: <strong>${perishable}</strong></div>
    `;

    // Items
    items.sort((a,b) => new Date(a.expiry) - new Date(b.expiry));
    items.forEach(it => {
      const daysLeft = daysBetween(todayISO(), it.expiry);
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="itemInfo">
          <div class="itemTitle">${escapeHtml(it.name)} <span class="itemMeta">×${it.qty} • ${it.category}</span></div>
          <div class="itemMeta">Expiry: ${it.expiry} (${daysLeft} day(s) left)</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          <div class="badge ${urgencyClass(daysLeft)}">${daysLeft <= 0 ? 'Expired' : daysLeft+'d'}</div>
          <div style="display:flex;gap:6px">
            <button class="inline" data-action="donate" data-id="${it.id}">Donate</button>
            <button class="inline" data-action="edit" data-id="${it.id}">Edit</button>
            <button class="inline" data-action="del" data-id="${it.id}">Delete</button>
          </div>
        </div>
      `;
      itemsList.appendChild(li);
    });
  }

  // basic escaping for text content
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

  // ----- Form handling -----
  itemForm.addEventListener('submit', e => {
    e.preventDefault();
    const payload = {
      name: nameI.value.trim() || 'Unnamed item',
      qty: parseInt(qtyI.value,10) || 1,
      category: categoryI.value,
      purchase: purchaseI.value || todayISO(),
      expiry: expiryI.value
    };
    // If editing (we'll use a hidden id stored on form.dataset.editId)
    const editId = itemForm.dataset.editId;
    if(editId){
      updateItem(editId, payload);
      delete itemForm.dataset.editId;
      $('saveBtn').textContent = 'Save item';
    } else {
      addItem(payload);
    }
    itemForm.reset();
  });

  clearBtn.addEventListener('click', ()=>{ itemForm.reset(); delete itemForm.dataset.editId; $('saveBtn').textContent='Save item'; });

  itemsList.addEventListener('click', e=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if(action === 'del') {
      if(confirm('Delete this item?')) removeItem(id);
    } else if(action === 'edit'){
      const it = items.find(x=>x.id===id);
      if(!it) return;
      nameI.value = it.name; qtyI.value = it.qty; categoryI.value = it.category;
      purchaseI.value = it.purchase || todayISO(); expiryI.value = it.expiry;
      itemForm.dataset.editId = id;
      $('saveBtn').textContent = 'Update';
      window.scrollTo({top:0,behavior:'smooth'});
    } else if(action === 'donate'){
      suggestDonationFor(id);
    }
  });

  // ----- Donation suggestion -----
  function renderCentersFor(coords){
    centersList.innerHTML = '';
    if(!coords){
      centersList.innerHTML = '<li>Location unknown.</li>';
      return;
    }
    const list = donationCenters.map(c => {
      return {...c, d: distanceKm(coords.lat, coords.lon, c.lat, c.lon)};
    }).sort((a,b)=>a.d-b.d);
    list.forEach(c=>{
      const li = document.createElement('li');
      li.className = 'centerItem';
      li.innerHTML = `<div>
        <strong>${escapeHtml(c.name)}</strong><div class="itemMeta">${escapeHtml(c.address)}</div>
        </div><div><div class="itemMeta">${c.d.toFixed(1)} km</div>
        <button class="inline" data-action="nav" data-lat="${c.lat}" data-lon="${c.lon}">Select</button></div>`;
      centersList.appendChild(li);
    });
  }

  locBtn.addEventListener('click', ()=>{
    locMsg.textContent = 'Getting location…';
    navigator.geolocation.getCurrentPosition(pos=>{
      lastKnownCoords = {lat: pos.coords.latitude, lon: pos.coords.longitude};
      locMsg.innerHTML = `Location obtained: ${lastKnownCoords.lat.toFixed(3)}, ${lastKnownCoords.lon.toFixed(3)}.`;
      renderCentersFor(lastKnownCoords);
    }, err=>{
      locMsg.textContent = 'Unable to get location (permission denied or device error).';
    }, {timeout:10000});
  });

  centersList.addEventListener('click', e=>{
    const btn = e.target.closest('button');
    if(!btn) return;
    const lat = btn.dataset.lat, lon = btn.dataset.lon;
    // simply show directions hint (we don't embed maps)
    alert(`Selected center at coordinates: ${lat}, ${lon}. You can open these in your maps app.`);
  });

  function suggestDonationFor(id){
    const it = items.find(x=>x.id===id);
    if(!it) return;
    // If location known, present nearest center
    if(lastKnownCoords){
      const nearest = donationCenters.map(c=>({...c, d: distanceKm(lastKnownCoords.lat,lastKnownCoords.lon,c.lat,c.lon)})).sort((a,b)=>a.d-b.d)[0];
      const msg = `Item "${it.name}" (${it.qty}) — nearest donation center: ${nearest.name}, ${nearest.d.toFixed(1)} km away.`;
      notifyUser('Donation suggestion', msg);
      alert(msg);
    } else {
      alert(`Item "${it.name}" — we don't know your location. Click 'Get my location' to find nearby donation centers.`);
    }
  }

  // ----- Notifications & scheduling -----
  function notifyUser(title, body){
    if(window.Notification && Notification.permission === "granted"){
      try {
        new Notification(title, {body});
      } catch(e){
        console.log("Notification error", e);
      }
    } else {
      // Fallback: in-app alert toast
      console.log("Notify (in-app):", title, body);
      // Optionally show an in-page message — for now we use alert for immediate UX
      // but avoid too many alerts: only alert critical expiries
    }
  }

  function checkExpiriesAndNotify(){
    const now = todayISO();
    items.forEach(it=>{
      const daysLeft = daysBetween(now, it.expiry);
      // store lastNotified flag in item to avoid spamming
      if(daysLeft <= 1 && !it._notified_24h){
        notifyUser('Item near expiry', `${it.name} expires in ${daysLeft} day(s). Consider using or donating.`);
        it._notified_24h = true;
      } else if(daysLeft <= 3 && !it._notified_72h){
        notifyUser('Expiry reminder', `${it.name} expires in ${daysLeft} days.`);
        it._notified_72h = true;
      }
      // If expired and not yet flagged
      if(daysLeft <= 0 && !it._expired_notified){
        notifyUser('Item expired', `${it.name} is expired. Remove or dispose safely.`);
        it._expired_notified = true;
      }
    });
    // persist flags
    persist();
    renderItems();
  }

  notifyPermBtn.addEventListener('click', ()=>{
    if(!("Notification" in window)){
      alert("Notifications are not supported in this browser.");
      return;
    }
    Notification.requestPermission().then(p=>{
      if(p === 'granted') alert('Notifications allowed. App will notify while open.');
      else alert('Notifications denied — app will show in-app reminders while open.');
    });
  });

  // Start a periodic check (every minute) while page is open
  function startChecker(){
    if(checkInterval) clearInterval(checkInterval);
    checkExpiriesAndNotify(); // run now
    checkInterval = setInterval(checkExpiriesAndNotify, 60 * 1000);
  }

  // ----- Suggestions: what to buy -----
  suggestBuyBtn.addEventListener('click', ()=>{
    // Simple heuristic: if many perishables expiring soon, suggest buying non-perishables
    const expSoon = items.filter(i => daysBetween(todayISO(), i.expiry) <= 3);
    const perishExpSoon = expSoon.filter(i => i.category.toLowerCase().includes('perish'));
    if(perishExpSoon.length >= 2){
      alert(`You have ${perishExpSoon.length} perishable items expiring soon. Suggestion: buy fewer fresh items this week (eg. keep staples like rice, lentils, canned veg). Consider donating items you can't consume.`);
    } else {
      alert('No strong suggestion — your tracked items look fine. Keep monitoring expiry dates.');
    }
  });

  // ----- Export -----
  exportBtn.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(items, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'food_items_export.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  // ----- Init -----
  (function init(){
    renderItems();
    startChecker();
    // prefill sample for empty state (optional)
    if(items.length === 0){
      addItem({name:'Milk', qty:2, category:'Perishable', purchase:todayISO(), expiry: new Date(Date.now()+2*24*3600*1000).toISOString().slice(0,10)});
      addItem({name:'Rice (5kg)', qty:1, category:'Non-perishable', purchase:todayISO(), expiry: '2030-01-01'});
    }
  })();

  // expose for debugging (optional)
  window.foodsave = {items, addItem, updateItem, removeItem, getCenters: ()=>donationCenters};
})();
