import { escapeHtml } from '../shared-helpers.js';
import { CUSTOMER_SPEC_FIELDS, customerMediaUrl } from './customer-products.js';

const number = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 2 });

export function customerProductPhotos(products) {
  const photos = new Map();
  for (const product of products) {
    for (const photo of Array.isArray(product.photos) ? product.photos : []) {
      const url = customerMediaUrl(photo?.url);
      if (url && !photos.has(url)) {
        photos.set(url, { url, thumb: customerMediaUrl(photo.thumb) || url, label: product.title });
      }
    }
  }
  return [...photos.values()];
}

function productSpecsHtml(product) {
  const specs = Object.entries(CUSTOMER_SPEC_FIELDS).map(([key, [label, unit]]) => {
    const value = product.specs?.[key];
    return Number.isFinite(value) && value > 0 ? `<dt>${label}</dt><dd>${number.format(value)} ${unit}</dd>` : '';
  }).join('');
  const docs = (Array.isArray(product.datasheets) ? product.datasheets : []).map(sheet => {
    const url = customerMediaUrl(sheet?.url);
    return url ? `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sheet.name || 'Datasheet')}</a></li>` : '';
  }).join('');
  return `<section class="roi-product-specs-item">
    <h3>${product.qty > 1 ? `${number.format(product.qty)} × ` : ''}${escapeHtml(product.title || 'Product')}</h3>
    ${specs ? `<dl>${specs}</dl>` : ''}
    ${docs ? `<ul class="roi-product-docs">${docs}</ul>` : '<p>Geen datasheet gekoppeld.</p>'}
  </section>`;
}

export function configureCustomerProductDialog(dialog) {
  const title = dialog.querySelector('h2');
  const panel = dialog.querySelector('.roi-product-dialog-body');
  const gallery = dialog.querySelector('.roi-gallery');
  const image = gallery.querySelector('img');
  const caption = gallery.querySelector('figcaption');
  const count = gallery.querySelector('.roi-gallery-count');
  const previous = gallery.querySelector('[data-photo-step="-1"]');
  const next = gallery.querySelector('[data-photo-step="1"]');
  let photos = [];
  let photoIndex = 0;

  function movePhoto(step) {
    photoIndex = (photoIndex + step + photos.length) % photos.length;
    const photo = photos[photoIndex];
    image.src = photo.url;
    image.alt = photo.label || 'Productfoto';
    caption.textContent = photo.label || 'Productfoto';
    count.textContent = `${photoIndex + 1} / ${photos.length}`;
  }

  previous.addEventListener('click', () => movePhoto(-1));
  next.addEventListener('click', () => movePhoto(1));
  dialog.addEventListener('keydown', event => {
    if (gallery.hidden || photos.length < 2) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
  });

  return (cfg, products, showGallery) => {
    photos = showGallery ? customerProductPhotos(products) : [];
    if (showGallery && !photos.length) return;
    title.textContent = showGallery ? 'Productfoto’s' : 'Productspecificaties';
    gallery.hidden = !showGallery;
    panel.hidden = showGallery;
    if (showGallery) {
      photoIndex = 0;
      previous.hidden = next.hidden = photos.length < 2;
      movePhoto(0);
    } else {
      image.removeAttribute('src');
      panel.innerHTML = `<p class="roi-product-dialog-config">${escapeHtml(cfg.omschrijving || cfg.type)}</p>
        <p>${number.format(cfg.batCap)} kWh opslag · ${number.format(cfg.batInv)} kW omvormervermogen · ${number.format(cfg.eff * 100)}% rendement</p>
        ${products.length ? products.map(productSpecsHtml).join('') : '<p>Bij deze berekening zijn geen aparte productfiches gekoppeld.</p>'}`;
    }
    dialog.showModal();
  };
}
