lucide.createIcons();

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const modal = $('#toolModal');
const guideModal = $('#guideModal');
const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const selectedBox = $('#fileSelected');
const processButton = $('#processButton');
const targetInput = $('#targetSize');
let currentTool = 'photo';
let currentFile = null;
let resultUrl = null;
let previewUrl = null;

const tools = {
  photo: { kicker: 'RESIZE PHOTO', title: 'Make your photo upload-ready', accept: 'image/*', formats: 'JPG, PNG or WEBP', multi: false },
  signature: { kicker: 'RESIZE SIGNATURE', title: 'Fit your signature perfectly', accept: 'image/*', formats: 'JPG, PNG or WEBP', multi: false },
  pdf: { kicker: 'COMPRESS PDF', title: 'Shrink your PDF for upload', accept: 'application/pdf', formats: 'PDF document', multi: false },
  'image-pdf': { kicker: 'IMAGE TO PDF', title: 'Turn images into one PDF', accept: 'image/*', formats: 'JPG, PNG or WEBP · Multiple allowed', multi: true }
};

function openTool(type, size = 50, customName = '') {
  currentTool = type; resetFile();
  const config = tools[type];
  $('#modalKicker').textContent = customName ? customName.toUpperCase() : config.kicker;
  $('#modalTitle').textContent = config.title;
  fileInput.accept = config.accept; fileInput.multiple = config.multi;
  $('.dropzone small').textContent = config.formats;
  $('.dropzone>i, .dropzone>svg')?.setAttribute('data-lucide', type === 'pdf' ? 'file-up' : 'image-plus');
  targetInput.value = size;
  $('#qualityLabel').style.display = type === 'pdf' ? 'none' : '';
  $('#advancedSettings').style.display = type === 'pdf' ? 'none' : '';
  $('#dimensionPanel').style.display = type === 'photo' || type === 'signature' ? '' : 'none';
  $('#targetWidth').value = ''; $('#targetHeight').value = ''; $('#fitMode').value = 'contain';
  modal.showModal(); lucide.createIcons();
}

$$('.tool-card').forEach(card => {
  $('.card-link', card).addEventListener('click', () => openTool(card.dataset.tool, $('.quick-pills button:nth-child(2)', card).dataset.size));
  $$('.quick-pills button', card).forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openTool(card.dataset.tool, btn.dataset.size); }));
});
$$('.preset').forEach(btn => btn.addEventListener('click', () => openTool(btn.dataset.type, btn.dataset.size, btn.dataset.name)));
$$('.hero-tool').forEach(btn => btn.addEventListener('click', () => openTool(btn.dataset.type, btn.dataset.size)));
$$('.modal-close').forEach(btn => btn.addEventListener('click', () => btn.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

fileInput.addEventListener('change', () => setFiles([...fileInput.files]));
['dragenter','dragover'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e => setFiles([...e.dataTransfer.files]));
$('#removeFile').addEventListener('click', resetFile);

function setFiles(files) {
  if (!files.length) return;
  currentFile = currentTool === 'image-pdf' ? files : files[0];
  const total = files.reduce((n, f) => n + f.size, 0);
  $('#fileName').textContent = files.length > 1 ? `${files.length} images selected` : files[0].name;
  $('#fileMeta').textContent = formatBytes(total);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  const preview = $('#filePreview');
  if (files.length === 1 && files[0].type.startsWith('image/')) { previewUrl = URL.createObjectURL(files[0]); preview.src = previewUrl; preview.hidden = false; }
  else { preview.hidden = true; preview.removeAttribute('src'); }
  dropzone.hidden = true; selectedBox.hidden = false;
  processButton.disabled = false; processButton.textContent = currentTool === 'image-pdf' ? 'Create PDF' : currentTool === 'pdf' ? 'Compress PDF' : 'Resize & compress';
  $('#result').hidden = true;
}
function resetFile() {
  currentFile = null; fileInput.value = ''; dropzone.hidden = false; selectedBox.hidden = true; processButton.disabled = true; processButton.textContent = 'Choose a file first'; $('#result').hidden = true;
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
}
function formatBytes(n) { return n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`; }
function loadImage(file) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => { URL.revokeObjectURL(img.src); resolve(img); }; img.onerror = reject; img.src = URL.createObjectURL(file); }); }

async function compressImage(file, targetKB) {
  const img = await loadImage(file); let scale = 1; let quality = +$('#qualityRange').value / 100; let blob;
  const requestedW = +$('#targetWidth').value || 0, requestedH = +$('#targetHeight').value || 0;
  const hasDimensions = requestedW > 0 && requestedH > 0;
  for (let i = 0; i < 12; i++) {
    const canvas = document.createElement('canvas'); canvas.width = hasDimensions ? requestedW : Math.max(1, Math.round(img.width * scale)); canvas.height = hasDimensions ? requestedH : Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (hasDimensions) {
      const crop = $('#fitMode').value === 'crop'; const ratio = crop ? Math.max(canvas.width / img.width, canvas.height / img.height) : Math.min(canvas.width / img.width, canvas.height / img.height);
      const drawW = img.width * ratio, drawH = img.height * ratio; ctx.drawImage(img, (canvas.width-drawW)/2, (canvas.height-drawH)/2, drawW, drawH);
    } else ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob.size <= targetKB * 1024 * .98) break;
    if (quality > .25) quality -= .1; else if (!hasDimensions) scale *= .82; else break;
  }
  return blob;
}

async function imagesToPdf(files, targetKB) {
  const { jsPDF } = window.jspdf; let quality = +$('#qualityRange').value / 100; let pdfBlob;
  for (let attempt = 0; attempt < 8; attempt++) {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    for (let i = 0; i < files.length; i++) {
      if (i) pdf.addPage(); const img = await loadImage(files[i]); const pageW = 595.28, pageH = 841.89, margin = 24;
      const ratio = Math.min((pageW - margin * 2) / img.width, (pageH - margin * 2) / img.height); const w = img.width * ratio, h = img.height * ratio;
      const c = document.createElement('canvas'); c.width = Math.min(1400, img.width); c.height = Math.round(c.width * img.height / img.width); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      pdf.addImage(c.toDataURL('image/jpeg', quality), 'JPEG', (pageW-w)/2, (pageH-h)/2, w, h, undefined, 'FAST');
    }
    pdfBlob = pdf.output('blob'); if (pdfBlob.size <= targetKB * 1024 || quality <= .25) break; quality -= .1;
  }
  return pdfBlob;
}

async function compressPdf(file, targetKB) {
  if (file.size <= targetKB * 1024) return file;
  if (!window.pdfjsLib) throw new Error('The PDF engine did not load. Check your internet connection and try again.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const source = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const { jsPDF } = window.jspdf;
  let quality = .72, renderScale = 1.35, pdfBlob;
  for (let attempt = 0; attempt < 7; attempt++) {
    let output;
    for (let pageNo = 1; pageNo <= source.numPages; pageNo++) {
      const page = await source.getPage(pageNo);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas'); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const orientation = base.width > base.height ? 'landscape' : 'portrait';
      if (!output) output = new jsPDF({ orientation, unit: 'pt', format: [base.width, base.height], compress: true });
      else output.addPage([base.width, base.height], orientation);
      output.addImage(canvas.toDataURL('image/jpeg', quality), 'JPEG', 0, 0, base.width, base.height, undefined, 'FAST');
    }
    pdfBlob = output.output('blob');
    if (pdfBlob.size <= targetKB * 1024 || (quality <= .28 && renderScale <= .75)) break;
    if (quality > .35) quality -= .11; else renderScale *= .78;
  }
  return pdfBlob;
}

processButton.addEventListener('click', async () => {
  processButton.disabled = true; processButton.textContent = 'Processing…';
  try {
    const target = +targetInput.value; let blob, name;
    if (currentTool === 'photo' || currentTool === 'signature') { blob = await compressImage(currentFile, target); name = `${currentTool}-${target}kb.jpg`; }
    else if (currentTool === 'image-pdf') { blob = await imagesToPdf(currentFile, target); name = `documents-${target}kb.pdf`; }
    else { blob = await compressPdf(currentFile, target); name = `compressed-${target}kb.pdf`; }
    resultUrl = URL.createObjectURL(blob); const dl = $('#downloadButton'); dl.href = resultUrl; dl.download = name;
    const originalSize = Array.isArray(currentFile) ? currentFile.reduce((sum, file) => sum + file.size, 0) : currentFile.size;
    const dims = (currentTool === 'photo' || currentTool === 'signature') && +$('#targetWidth').value && +$('#targetHeight').value ? ` · ${$('#targetWidth').value} × ${$('#targetHeight').value} px` : '';
    $('#downloadButton').style.display = ''; $('#resultTitle').textContent = blob.size > target * 1024 ? 'Compressed as much as possible' : 'Your file is ready'; $('#resultMeta').textContent = `${formatBytes(originalSize)} → ${formatBytes(blob.size)}${dims}`; $('#result').hidden = false; $('#result').style.display = 'flex';
    processButton.textContent = 'Process again';
  } catch (err) { $('#result').hidden = false; $('#result').style.display = 'flex'; $('#resultTitle').textContent = 'Could not compress this file'; $('#resultMeta').textContent = err.message; $('#downloadButton').style.display = 'none'; processButton.textContent = 'Try again'; }
  processButton.disabled = false;
});

$('#clearDimensions').addEventListener('click', () => { $('#targetWidth').value = ''; $('#targetHeight').value = ''; });

$$('.preset-tabs button').forEach(tab => tab.addEventListener('click', () => { $$('.preset-tabs button').forEach(b => b.classList.remove('active')); tab.classList.add('active'); $$('.preset').forEach(p => p.hidden = tab.dataset.filter !== 'all' && p.dataset.category !== tab.dataset.filter); }));

const guides = {
  en: `<div class="guide-copy"><span class="kicker">QUICK GUIDE</span><h2>How to prepare your file</h2><ol><li><b>Check the notification.</b> Note the required format, dimensions and maximum file size.</li><li><b>Choose the matching tool.</b> Select a preset or enter your maximum size in KB.</li><li><b>Upload and process.</b> Preview the final size, download and upload it to the official portal.</li></ol><p class="warning">Tip: Keep your original file. Requirements may differ between notifications and application years.</p></div>`,
  hi: `<div class="guide-copy"><span class="kicker">त्वरित गाइड</span><h2>अपनी फ़ाइल कैसे तैयार करें</h2><ol><li><b>नोटिफिकेशन देखें।</b> फ़ॉर्मेट, माप और अधिकतम फ़ाइल साइज़ नोट करें।</li><li><b>सही टूल चुनें।</b> प्रीसेट चुनें या KB में अधिकतम साइज़ डालें।</li><li><b>अपलोड और प्रोसेस करें।</b> अंतिम साइज़ जाँचें, डाउनलोड करें और आधिकारिक पोर्टल पर अपलोड करें।</li></ol><p class="warning">सलाह: मूल फ़ाइल संभालकर रखें। अलग-अलग भर्तियों में नियम बदल सकते हैं।</p></div>`,
  bn: `<div class="guide-copy"><span class="kicker">দ্রুত গাইড</span><h2>ফাইল কীভাবে তৈরি করবেন</h2><ol><li><b>নোটিফিকেশন দেখুন।</b> ফরম্যাট, মাপ ও সর্বোচ্চ ফাইল সাইজ লিখে রাখুন।</li><li><b>সঠিক টুল বাছুন।</b> একটি প্রিসেট বাছুন বা KB-তে সর্বোচ্চ সাইজ দিন।</li><li><b>আপলোড ও প্রসেস করুন।</b> চূড়ান্ত সাইজ দেখে ডাউনলোড করুন এবং সরকারি পোর্টালে আপলোড করুন।</li></ol><p class="warning">পরামর্শ: আসল ফাইলটি রেখে দিন। বিভিন্ন বিজ্ঞপ্তিতে নিয়ম বদলাতে পারে।</p></div>`
};
function showGuide(lang='en') { $('#guideContent').innerHTML = guides[lang]; guideModal.showModal(); }
$('#guideButton').addEventListener('click', () => showGuide('en'));
$('#langButton').addEventListener('click', () => showGuide('hi'));
$$('.guide-tabs button').forEach(b => b.addEventListener('click', () => { $$('.guide-tabs button').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('#guideContent').innerHTML = guides[b.dataset.lang]; }));
