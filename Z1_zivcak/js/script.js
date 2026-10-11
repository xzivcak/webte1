// Semester dates for the progress bar on the schedule page
const SEMESTER_START = "14.09.2026";
const SEMESTER_END = "11.12.2026";

// ===== Burger menu (all pages) =====
const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('#menu');

toggle.addEventListener('click', () => {
  const isOpen = menu.classList.toggle('menu--open');
  toggle.setAttribute('aria-expanded', isOpen);
});

// Escape closes the menu and returns focus to the button
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.classList.contains('menu--open')) {
    menu.classList.remove('menu--open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
});

// ===== Print button (cv page) =====
const printButton = document.querySelector('#print-button');

if (printButton) {
  printButton.addEventListener('click', () => window.print());
}

// ===== Schedule page: filters, current lesson, progress bar =====
if (document.querySelector('#timetable')) {
    (function () {
    'use strict';

    const DAYS = ["nedeľu", "pondelok", "utorok", "stredu", "štvrtok", "piatok", "sobotu"];
    const cells = [...document.querySelectorAll("td[data-day]")];

    function parseDate(s) {
      const [d, m, y] = s.split(".").map(Number);
      return new Date(y, m - 1, d);
    }
    const pad = n => String(n).padStart(2, "0");
    const fmt = h => `${h}:00`;
    const nameOf = c => c.querySelector("b").textContent;

    function updateNow(now = new Date()) {
      cells.forEach(c => c.classList.remove("now"));
      const day = now.getDay(), t = now.getHours() + now.getMinutes() / 60;
      const status = document.getElementById("status");
      // outside of the semester there is no teaching at all
      if (now < parseDate(SEMESTER_START)) {
        status.textContent = `Semester sa ešte nezačal, výučba začína ${SEMESTER_START}.`;
        return;
      }
      if (now > parseDate(SEMESTER_END)) {
        status.textContent = `Semester sa skončil ${SEMESTER_END}, momentálne nemám žiadnu výučbu.`;
        return;
      }
      const cur = cells.find(c => +c.dataset.day === day && t >= +c.dataset.start && t < +c.dataset.end);
      if (cur) {
        cur.classList.add("now");
        status.textContent = `Práve prebieha: ${nameOf(cur)} (${fmt(cur.dataset.start)}–${fmt(cur.dataset.end)}).`;
        return;
      }
      // nearest lesson (looking one week ahead)
      let best = null;
      for (let off = 0; off < 8 && !best; off++) {
        const d = (day + off) % 7;
        const cand = cells.filter(c => +c.dataset.day === d && (off > 0 || +c.dataset.start > t))
                          .sort((a, b) => a.dataset.start - b.dataset.start)[0];
        if (cand) best = { cell: cand, off };
      }
      if (!best) { status.textContent = "Momentálne nemám v rozvrhu žiadnu výučbu."; return; }
      const when = best.off === 0 ? "dnes" : best.off === 1 ? "zajtra" : `v ${DAYS[best.cell.dataset.day]}`;
      status.textContent = `Práve nemám výučbu. Najbližšia hodina: ${nameOf(best.cell)} ${when} o ${fmt(best.cell.dataset.start)}.`;
    }

    function applyFilter(type) {
      let shown = 0;
      cells.forEach(c => {
        const match = type === "all" || c.classList.contains(type);
        c.classList.toggle("dim", !match);
        if (match) shown++;
      });
      document.getElementById("empty").hidden = shown > 0;
      document.querySelector(".table-wrap").hidden = shown === 0;
      document.querySelectorAll(".filters button").forEach(b => {
        const isActive = b.dataset.filter === type;
        b.classList.toggle("active", isActive);
        b.setAttribute("aria-pressed", isActive);
      });
    }

    function updateProgress(now = new Date()) {
      const s = parseDate(SEMESTER_START), e = parseDate(SEMESTER_END);
      const pct = Math.min(100, Math.max(0, (now - s) / (e - s) * 100));
      document.getElementById("progress-fill").style.width = pct + "%";
      document.querySelector(".progress").setAttribute("aria-valuenow", Math.round(pct));
      document.getElementById("progress-label").textContent =
        `Uplynulo ${pct.toFixed(1)} % semestra (${SEMESTER_START} – ${SEMESTER_END}).`;
    }

    document.querySelector(".filters").addEventListener("click", e => {
      if (e.target.dataset.filter) applyFilter(e.target.dataset.filter);
    });
    function init() {
      updateNow(); updateProgress();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    setInterval(() => { updateNow(); updateProgress(); }, 60000);

    })();
}

// ===== Map page: points, distance, localStorage =====
if (document.querySelector('#map')) {
    (function () {
        'use strict';

        // ===== Constants =====
        const SCHOOL = { name: 'FEI STU Bratislava', lat: 48.151965, lng: 17.072995 };
        const HOME = { name: 'Domov – Bratislavský hrad', lat: 48.142240, lng: 17.100060 }; // home marker: Royal Palace at Bratislava Castle
        const STORAGE_KEY = 'mapState.v1';
        const rootStyle = getComputedStyle(document.documentElement);
        const getToken = name => rootStyle.getPropertyValue(name).trim();
        const COLORS = {
            school: getToken('--color-brand'),
            home: getToken('--color-accent'),
            user: getToken('--color-success'),
            outline: getToken('--color-surface')
        };

        // ===== Haversine formula (own code) =====
        function haversineKm(lat1, lng1, lat2, lng2) {
            const R = 6371.0088;
            const rad = d => d * Math.PI / 180;
            const dLat = rad(lat2 - lat1);
            const dLng = rad(lng2 - lng1);
            const a = Math.sin(dLat / 2) ** 2 +
                      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.asin(Math.sqrt(a));
        }
        function formatDistance(km) {
            return km < 1
                ? Math.round(km * 1000) + ' m'
                : km.toLocaleString('sk-SK', { maximumFractionDigits: 2 }) + ' km';
        }

        // ===== State and localStorage =====
        let points = [];
        let selectedId = null;
        let target = 'school';

        function loadState() {
            try {
                const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (!s) return;
                points = (s.points || []).filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number' && p.name);
                selectedId = points.some(p => p.id === s.selectedId) ? s.selectedId : null;
                target = s.target === 'home' ? 'home' : 'school';
            } catch (e) { /* ignore corrupted data */ }
        }
        function saveState() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ points, selectedId, target }));
            } catch (e) { /* localStorage is not available */ }
        }

        // ===== Map =====
        const map = L.map('map');
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        function dotMarker(lat, lng, color, radius) {
            return L.circleMarker([lat, lng], {
                radius: radius || 9, color: COLORS.outline, weight: 2, fillColor: color, fillOpacity: 1,
                bubblingMouseEvents: false // a click on a marker must not open the add-point form
            }).addTo(map);
        }
        const schoolMarker = dotMarker(SCHOOL.lat, SCHOOL.lng, COLORS.school, 11).bindTooltip(SCHOOL.name);
        const homeMarker = dotMarker(HOME.lat, HOME.lng, COLORS.home, 11).bindTooltip(HOME.name);
        map.fitBounds([[SCHOOL.lat, SCHOOL.lng], [HOME.lat, HOME.lng]], { padding: [40, 40] });

        const markers = new Map();   // id -> marker
        let routeLine = null;
        let infoPopups = [];

        // ===== DOM =====
        const listEl = document.getElementById('points');
        const listEmpty = document.getElementById('list-empty');
        const hint = document.getElementById('empty-hint');
        const result = document.getElementById('result');
        const radios = document.querySelectorAll('input[name="target"]');

        function el(tag, props, text) {
            const e = document.createElement(tag);
            Object.assign(e, props || {});
            if (text !== undefined) e.textContent = text;
            return e;
        }

        // ===== Rendering =====
        function renderMarkers() {
            markers.forEach(m => map.removeLayer(m));
            markers.clear();
            points.forEach(p => {
                const m = dotMarker(p.lat, p.lng, COLORS.user, 8).bindTooltip(p.name);
                m.on('click', () => select(p.id));
                markers.set(p.id, m);
            });
        }

        function renderList() {
            listEl.innerHTML = '';
            points.forEach(p => {
                const li = el('li');
                const btn = el('button', { type: 'button', className: 'select' + (p.id === selectedId ? ' active' : '') }, p.name);
                btn.setAttribute('aria-pressed', p.id === selectedId);
                btn.addEventListener('click', () => select(p.id));
                const del = el('button', { type: 'button', className: 'remove', title: 'Odstrániť bod' }, '×');
                del.setAttribute('aria-label', 'Odstrániť bod ' + p.name);
                del.addEventListener('click', () => removePoint(p.id));
                li.append(btn, del);
                listEl.appendChild(li);
            });
            const empty = points.length === 0;
            listEmpty.hidden = !empty;
            hint.hidden = !empty;
        }

        function clearRoute() {
            if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
            infoPopups.forEach(p => map.removeLayer(p));
            infoPopups = [];
        }

        function infoPopup(latlng, name, dist) {
            const box = el('div');
            box.append(el('b', {}, name), el('br'), document.createTextNode('Vzdialenosť: ' + dist));
            const p = L.popup({ autoClose: false, closeOnClick: false, closeButton: false, offset: [0, -4] })
                .setLatLng(latlng).setContent(box).addTo(map);
            infoPopups.push(p);
        }

        function updateRoute() {
            clearRoute();
            const p = points.find(x => x.id === selectedId);
            if (!p) {
                result.textContent = points.length ? 'Vyberte bod zo zoznamu.' : 'Najprv pridajte bod kliknutím do mapy.';
                return;
            }
            const t = target === 'home' ? HOME : SCHOOL;
            const km = haversineKm(p.lat, p.lng, t.lat, t.lng);
            const dist = formatDistance(km);
            routeLine = L.polyline([[p.lat, p.lng], [t.lat, t.lng]], { color: COLORS.home, weight: 4, dashArray: '8 8' }).addTo(map);
            infoPopup([p.lat, p.lng], p.name, dist);
            infoPopup([t.lat, t.lng], t.name, dist);
            result.textContent = p.name + ' → ' + t.name + ': ' + dist + ' (vzdušnou čiarou)';
            map.fitBounds(routeLine.getBounds(), { padding: [60, 60], maxZoom: 15 });
        }

        function refresh() {
            renderList();
            updateRoute();
            saveState();
        }

        // ===== Actions =====
        function select(id) { selectedId = id; refresh(); }
        function removePoint(id) {
            points = points.filter(p => p.id !== id);
            if (selectedId === id) selectedId = null;
            renderMarkers();
            refresh();
        }
        function addPoint(name, latlng) {
            const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, lat: latlng.lat, lng: latlng.lng };
            points.push(p);
            selectedId = p.id;
            renderMarkers();
            refresh();
        }

        // The same naming form is used for a mouse click and for the keyboard button
        function openAddForm(latlng) {
            const form = el('form', { className: 'popup-form' });
            const input = el('input', { type: 'text', maxLength: 40, placeholder: 'Názov miesta', required: true, value: 'Bod ' + (points.length + 1) });
            input.setAttribute('aria-label', 'Názov nového bodu');
            form.append(input, el('button', { type: 'submit' }, 'Pridať bod'));
            form.addEventListener('submit', ev => {
                ev.preventDefault();
                const name = input.value.trim();
                if (!name) return;
                map.closePopup();
                addPoint(name, latlng);
            });
            L.popup().setLatLng(latlng).setContent(form).openOn(map);
            input.focus(); input.select();
        }

        map.on('click', e => openAddForm(e.latlng));
        document.getElementById('add-center').addEventListener('click', () => openAddForm(map.getCenter()));

        radios.forEach(r => r.addEventListener('change', () => { target = r.value; refresh(); }));

        // ===== Start =====
        loadState();
        radios.forEach(r => { r.checked = r.value === target; });
        renderMarkers();
        refresh();
    })();
}

