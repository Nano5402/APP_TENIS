// Render the visible card geometry directly to canvas (no SVG foreignObject,
// so the export also works in Safari). Never upload the composed image.
export async function exportMatchPhoto(card, originalPhotoUrl) {
  const clone = card.cloneNode(true)
  clone.setAttribute('aria-hidden', 'true')
  clone.inert = true
  Object.assign(clone.style, { position: 'fixed', left: '-10000px', top: '0', width: '360px', maxWidth: 'none', margin: '0', pointerEvents: 'none' })
  clone.querySelectorAll('.photocall-actions, .photocall-expand').forEach(el => el.remove())
  const photo = clone.querySelector('.photocall-photo-img')
  if (photo) { photo.loading = 'eager'; photo.src = originalPhotoUrl }
  clone.querySelector('.photocall-photo-btn')?.removeAttribute('data-expanded')
  const grid = clone.querySelector('.photocall-sponsors')
  grid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))'
  document.body.appendChild(clone)
  try {
    await Promise.all([...clone.querySelectorAll('img')].map(image => image.decode()))
    return await renderCard(clone, originalPhotoUrl)
  } finally { clone.remove() }
}

async function renderCard(card, originalPhotoUrl) {
  await document.fonts.ready
  const bounds = card.getBoundingClientRect()
  const sponsors = card.querySelector('.photocall-sponsors').getBoundingClientRect()
  const height = sponsors.bottom - bounds.top + 12
  const canvas = document.createElement('canvas')
  const scale = Math.min(1080 / bounds.width, 1920 / height)
  canvas.width = 1080
  canvas.height = 1920
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear la imagen.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const background = new Image()
    background.src = new URL('../assets/photocall-court.svg', import.meta.url).href
  await background.decode()
  ctx.drawImage(background, 0, 0, 1080, 1920)
  ctx.translate((1080 - bounds.width * scale) / 2, (1920 - height * scale) / 2)
  ctx.scale(scale, scale)
  const relative = rect => ({ x: rect.left - bounds.left, y: rect.top - bounds.top, w: rect.width, h: rect.height })
  const rounded = (r, radius) => { ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, radius) }
  // Shorthand borderRadius starts with the top-left corner, which is zero
  // on the score panel. Preserve all four corners in clockwise order.
  const corners = style => [style.borderTopLeftRadius, style.borderTopRightRadius,
    style.borderBottomRightRadius, style.borderBottomLeftRadius].map(value => parseFloat(value) || 0)
  const boxes = [...card.querySelectorAll('.photocall-photo-wrapper, .photocall-score, .photocall-logo, .match-photocall-badge')].map(el => {
    const style = getComputedStyle(el)
    return { rect: relative(el.getBoundingClientRect()), color: style.backgroundColor, radius: corners(style),
      outline: style.outlineStyle === 'none' ? style.borderColor : style.outlineColor,
      lineWidth: parseFloat(style.outlineStyle === 'none' ? style.borderWidth : style.outlineWidth) || .5 }
  })
  const images = [...card.querySelectorAll('img')].map(el => ({
    url: el.classList.contains('photocall-photo-img') ? originalPhotoUrl : el.currentSrc || el.src,
    photo: el.classList.contains('photocall-photo-img'),
    rect: relative(el.getBoundingClientRect()),
    clip: relative(el.closest('.photocall-logo, .photocall-photo-wrapper').getBoundingClientRect()),
    radius: corners(getComputedStyle(el.closest('.photocall-logo, .photocall-photo-wrapper'))),
  }))
  // Snapshot text before awaiting network requests; a live score may update.
  const letters = []
  const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (!node.textContent.trim() || node.parentElement.closest('.photocall-actions, .photocall-expand')) continue
    const style = getComputedStyle(node.parentElement)
    for (let i = 0; i < node.length; i++) {
      const range = document.createRange()
      range.setStart(node, i); range.setEnd(node, i + 1)
      const rect = range.getBoundingClientRect()
      letters.push({ text: node.textContent[i], rect: relative(rect), color: style.color, font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` })
    }
  }
  const loaded = await Promise.all(images.map(async item => {
    const response = await fetch(item.url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('No se pudieron cargar todas las imágenes. Intenta nuevamente.')
    const url = URL.createObjectURL(await response.blob())
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      return { ...item, image }
    } finally { URL.revokeObjectURL(url) }
  }))
  for (const box of boxes) {
    ctx.save()
      ctx.shadowColor = 'rgba(4,27,20,.15)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 2
    rounded(box.rect, box.radius); ctx.fillStyle = box.color; ctx.fill()
    ctx.restore()
  }
  const scoreRows = card.querySelectorAll('.photocall-score tbody tr')
  if (scoreRows.length > 1) {
    const divider = relative(scoreRows[1].getBoundingClientRect())
    ctx.strokeStyle = '#dfe8de'
    ctx.lineWidth = .6
    ctx.beginPath(); ctx.moveTo(divider.x, divider.y); ctx.lineTo(divider.x + divider.w, divider.y); ctx.stroke()
  }
  for (const { image, rect, clip, radius, photo } of loaded) {
    ctx.save()
    rounded(clip, radius)
    ctx.clip()
    if (photo) {
      // A small, smoothly upscaled backdrop also works in Safari versions
      // without CanvasRenderingContext2D.filter. Never blur the foreground.
      const backdrop = document.createElement('canvas')
      backdrop.width = 24
      backdrop.height = Math.max(1, Math.round(24 * clip.h / clip.w))
      const soft = backdrop.getContext('2d')
      if (!soft) throw new Error('No se pudo preparar el fondo de la fotografía.')
      const cover = Math.max(backdrop.width / image.naturalWidth, backdrop.height / image.naturalHeight)
      soft.drawImage(image, (backdrop.width - image.naturalWidth * cover) / 2,
        (backdrop.height - image.naturalHeight * cover) / 2, image.naturalWidth * cover, image.naturalHeight * cover)
      ctx.drawImage(backdrop, clip.x, clip.y, clip.w, clip.h)
      ctx.fillStyle = 'rgba(0,0,0,.35)'
      ctx.fillRect(clip.x, clip.y, clip.w, clip.h)
    }
    const ratio = Math.min(rect.w / image.naturalWidth, rect.h / image.naturalHeight)
    const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio
    ctx.drawImage(image, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h)
    ctx.restore()
  }
  for (const box of boxes) {
    rounded(box.rect, box.radius)
    ctx.strokeStyle = box.outline
    ctx.lineWidth = box.lineWidth
    ctx.stroke()
  }
  ctx.textBaseline = 'middle'
  for (const letter of letters) {
    ctx.font = letter.font; ctx.fillStyle = letter.color
    ctx.fillText(letter.text, letter.rect.x, letter.rect.y + letter.rect.h / 2)
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen. Intenta nuevamente.')
  return blob
}
