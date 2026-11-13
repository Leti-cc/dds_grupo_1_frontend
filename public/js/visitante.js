/* global L */
const root = document.querySelector('[data-visitor-home]');
const list = root.querySelector('[data-delivery-list]');
const empty = root.querySelector('[data-delivery-empty]');
const map = L.map('visitor-map', { zoomControl: false }).setView([-34.6037, -58.3816], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);
const markers = new Map();
const details = root.querySelector('[data-map-detail]');
const formatter = new Intl.NumberFormat('es-AR');
const dateFormatter = new Intl.DateTimeFormat('es-AR');
const icons = { entity: 'house', clothes: 'shirt', food: 'heart' };
const fallbackPhotos = { entity: '/images/visitante/entrega-caja.png', clothes: '/images/visitante/ropa.png', food: '/images/visitante/alimentos.png' };
function photo(item) { return item.photo || fallbackPhotos[item.type] || fallbackPhotos.entity; }
function showDetail(item) {
  details.hidden = false;
  details.querySelector('[data-detail-photo]').src = photo(item);
  details.querySelector('[data-detail-photo]').alt = `Foto de ${item.name}`;
  details.querySelector('[data-detail-name]').textContent = item.name;
  details.querySelector('[data-detail-description]').textContent = item.description;
  details.querySelector('[data-detail-date]').textContent = item.date ? dateFormatter.format(new Date(item.date)) : 'No informada';
  details.querySelector('[data-detail-quantity]').textContent = item.quantity ? `${item.quantity} ítems` : 'No informada';
  details.querySelector('[data-detail-donor]').textContent = item.donor;
  details.querySelector('[data-detail-link]').href = `/entregas/${encodeURIComponent(item.id)}`;
  list.querySelectorAll('button').forEach((button) => button.classList.toggle('is-selected', button.dataset.id === String(item.id)));
  markers.forEach((marker, id) => marker.getElement()?.classList.toggle('is-selected', id === String(item.id)));
}
function addItem(item) {
  const li = document.createElement('li');
  const button = document.createElement('button'); button.type = 'button'; button.className = 'visitor-delivery-button'; button.dataset.id = item.id;
  const img = document.createElement('img'); img.src = photo(item); img.alt = '';
  const copy = document.createElement('span'); copy.className = 'visitor-delivery-copy';
  const name = document.createElement('strong'); name.textContent = item.name;
  const description = document.createElement('small'); description.textContent = item.description;
  const date = document.createElement('small'); date.textContent = item.date ? dateFormatter.format(new Date(item.date)) : 'Fecha no informada';
  const badge = document.createElement('span'); badge.className = 'tag tag-green'; badge.textContent = 'Entregada';
  copy.append(name, description, date); button.append(img, copy, badge); button.addEventListener('click', () => { showDetail(item); const marker = markers.get(String(item.id)); if (marker) { map.setView(marker.getLatLng(), 15); marker.openPopup(); } }); li.append(button); list.append(li);
}
function locate(item) {
  const coordinates = [item.lat, item.lng];
  if (!coordinates.every(Number.isFinite)) return;
  const iconName = icons[item.type] || icons.entity;
  const icon = L.divIcon({ className: `visitor-marker visitor-marker-${item.type}`, html: `<span aria-hidden="true"><svg class="visitor-icon"><use href="/images/visitante/icons.svg#${iconName}"></use></svg></span>`, iconSize: [40, 40], iconAnchor: [20, 20] });
  const marker = L.marker(coordinates, { icon, title: `${item.name}: ${item.description}` }).addTo(map);
  marker.bindPopup(item.name); marker.on('click', () => showDetail(item)); markers.set(String(item.id), marker);
}
async function load() {
  try {
    const response = await fetch('/inicio/datos', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Datos no disponibles');
    const data = await response.json();
    for (const [key, value] of Object.entries(data.stats)) {
      const node = root.querySelector(`[data-stat="${key}"]`);
      node.classList.remove('skeleton');
      node.textContent = value === null ? 'Sin datos' : `${formatter.format(value)}${key === 'food' ? ' kg' : ''}`;
    }
    list.replaceChildren(); list.setAttribute('aria-busy', 'false');
    empty.hidden = data.deliveries.length > 0;
    data.deliveries.slice(0, 3).forEach(addItem);
    data.deliveries.forEach(locate);
    if (markers.size) map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.35), { maxZoom: 14 });
  } catch {
    root.querySelectorAll('[data-stat]').forEach((node) => { node.classList.remove('skeleton'); node.textContent = 'Sin datos'; });
    list.replaceChildren(); list.setAttribute('aria-busy', 'false'); empty.hidden = false;
  }
}
root.querySelector('[data-map-fullscreen]').addEventListener('click', () => { const wrap = root.querySelector('.visitor-map-wrap'); if (!document.fullscreenElement) wrap.requestFullscreen?.(); else document.exitFullscreen?.(); });
document.addEventListener('fullscreenchange', () => setTimeout(() => map.invalidateSize(), 100));
load();
