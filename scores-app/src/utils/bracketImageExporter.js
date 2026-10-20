import { getParticipantName } from './matchParticipants'
import { sourceId } from './tournamentBracket'


/**
 * Generador de póster PNG en alta resolución (Broadcast / Grand Slam Edition)
 * para Cuadros de Fase Eliminatoria del Club Unión.
 * Soporta Modo Claro y Modo Oscuro con diseño de lujo y firma oficial de LEGAL-BRANDING.com.
 */

function roundRect(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function roundRectTop(ctx, x, y, width, height, radius) {
  if (width <= 0 || height <= 0) return
  const r = Math.max(0, Math.min(radius, width / 2, height))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x, y + height)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function drawRoundedConnector(ctx, startX, startY, endX, endY, radius = 10) {
  const midX = startX + (endX - startX) / 2
  const dy = endY - startY
  if (Math.abs(dy) < 2) {
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
    return
  }
  const dirY = dy > 0 ? 1 : -1
  const r = Math.min(radius, Math.abs(endX - startX) / 4, Math.abs(dy) / 2)

  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.lineTo(midX - r, startY)
  ctx.arcTo(midX, startY, midX, startY + dirY * r, r)
  ctx.lineTo(midX, endY - dirY * r)
  ctx.arcTo(midX, endY, midX + r, endY, r)
  ctx.lineTo(endX, endY)
  ctx.stroke()
}

function truncateText(ctx, text, maxWidth) {
  const str = String(text || 'Por definir')
  if (ctx.measureText(str).width <= maxWidth) return str
  let truncated = str
  while (truncated.length > 3 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

async function loadImageSafe(url) {
  if (typeof Image === 'undefined') return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), 4500)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }

    img.src = url
  })
}


function getParticipantDisplay(match, side, matchLookup) {
  const hasEntity = Boolean((match[`equipo${side}`] || match[`jugador${side}`])?.id)
  if (hasEntity || match[`nombre_override_j${side}`] || match.nombre_override) {
    return {
      name: getParticipantName(match, side),
      isPending: false,
    }
  }

  const originId = sourceId(match, side)
  if (originId && matchLookup?.get(Number(originId))) {
    const origin = matchLookup.get(Number(originId))
    return {
      name: `Ganador ${origin.bracketTag || `#${originId}`}`,
      isPending: true,
    }
  }
  if (originId) {
    return {
      name: `Ganador Partido #${originId}`,
      isPending: true,
    }
  }
  return { name: 'Por definir', isPending: true }
}

function formatScheduleLabel(match) {
  const parts = []
  if (match.cancha?.nombre || match.cancha_nombre) {
    const rawCourt = String(match.cancha?.nombre || match.cancha_nombre)
    parts.push(rawCourt.replace(/^Cancha de /i, ''))
  }
  if (match.fecha_inicio) {
    try {
      const [y, m, d] = String(match.fecha_inicio).slice(0, 10).split('-').map(Number)
      if (y && m && d) {
        const dt = new Date(y, m - 1, d)
        parts.push(dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }))
      }
    } catch {
      // ignore
    }
  }
  if (match.hora_inicio) {
    parts.push(String(match.hora_inicio).slice(0, 5))
  }
  return parts.join(' · ')
}

function isSideWinner(match, side) {
  if (match.estado !== 'finalizado') return false
  return match.ganador === `jugador${side}` || Number(match.ganador) === side
}

function resolveThemePalette(themeProp) {
  const isDark =
    themeProp === 'dark'
      ? true
      : themeProp === 'light'
        ? false
        : typeof document !== 'undefined' &&
          document.documentElement.classList.contains('dark')

  if (isDark) {
    return {
      isDark: true,
      bgStops: ['#05120c', '#0b2217', '#071710'],
      courtGlow1: 'rgba(139, 203, 96, 0.16)',
      courtGlow2: 'rgba(198, 93, 50, 0.13)',
      courtLine: 'rgba(139, 203, 96, 0.055)',
      outerFrameBorder: 'rgba(139, 203, 96, 0.22)',
      headerBgStops: ['#0d2b1d', '#133b28', '#0b2318'],
      headerBorder: 'rgba(139, 203, 96, 0.28)',
      headerAccentStripe: '#c65d32',
      kickerPillBg: 'rgba(139, 203, 96, 0.16)',
      kickerPillBorder: 'rgba(139, 203, 96, 0.42)',
      kickerText: '#9be16d',
      titleText: '#ffffff',
      subtitleText: '#c5d8cc',
      categoryBadgeBg: 'rgba(198, 93, 50, 0.22)',
      categoryBadgeBorder: 'rgba(230, 126, 80, 0.55)',
      categoryBadgeText: '#ffae88',
      champGrad: ['#2d2208', '#422c09'],
      champBorder: '#f1c40f',
      champLabel: '#f7d768',
      champName: '#ffffff',
      roundHeaderFill: 'rgba(19, 58, 39, 0.9)',
      roundHeaderBorder: 'rgba(139, 203, 96, 0.35)',
      roundHeaderText: '#9be16d',
      roundCountBg: 'rgba(139, 203, 96, 0.18)',
      roundCountText: '#e9f7e1',
      finalHeaderFill: 'rgba(68, 46, 9, 0.92)',
      finalHeaderBorder: 'rgba(241, 196, 15, 0.65)',
      finalHeaderText: '#f9d949',
      connectorActive: '#8bcb60',
      connectorGlow: 'rgba(139, 203, 96, 0.35)',
      connectorIdle: 'rgba(155, 185, 166, 0.24)',
      cardFill: '#112319',
      cardFillFinal: '#17281b',
      cardTopBarFill: '#183022',
      cardTopBarFinal: 'rgba(241, 196, 15, 0.14)',
      cardShadow: 'rgba(0, 0, 0, 0.42)',
      cardBorderIdle: 'rgba(255, 255, 255, 0.13)',
      cardBorderDone: 'rgba(139, 203, 96, 0.58)',
      cardBorderFinal: 'rgba(241, 196, 15, 0.65)',
      cardBorderLive: '#ef4444',
      cardDivider: 'rgba(255, 255, 255, 0.08)',
      tagPillBg: 'rgba(139, 203, 96, 0.16)',
      tagPillText: '#9be16d',
      tagPillFinalBg: 'rgba(241, 196, 15, 0.2)',
      tagPillFinalText: '#f9d949',
      cardMetaText: '#a8bdb0',
      statusLiveBg: 'rgba(239, 68, 68, 0.2)',
      statusLiveText: '#ff8080',
      statusDoneBg: 'rgba(139, 203, 96, 0.18)',
      statusDoneText: '#9be16d',
      statusIdleBg: 'rgba(255, 255, 255, 0.07)',
      statusIdleText: '#9bb0a3',
      winnerRowFill: 'rgba(139, 203, 96, 0.16)',
      winnerRowBorder: 'rgba(139, 203, 96, 0.36)',
      winnerBar: '#8bcb60',
      winnerNameText: '#ffffff',
      normalNameText: '#e2ede6',
      pendingNameText: '#7f9a89',
      setWonBoxBg: '#8bcb60',
      setWonBoxText: '#091d12',
      setLostBoxBg: 'rgba(255, 255, 255, 0.07)',
      setLostBoxBorder: 'rgba(255, 255, 255, 0.12)',
      setLostBoxText: '#a8bdb0',
      footerBg: '#091811',
      footerBorder: 'rgba(139, 203, 96, 0.22)',
      footerPrimaryText: '#e6f0e9',
      footerBrandHighlight: '#9be16d',
      footerMutedText: '#93aa9b',
    }
  }

  // Modo Claro de Lujo (Inspirado en Roland Garros / Wimbledon Daylight Edition)
  return {
    isDark: false,
    bgStops: ['#edf4ea', '#e2ede0', '#ebf2e8'],
    courtGlow1: 'rgba(31, 106, 61, 0.11)',
    courtGlow2: 'rgba(198, 93, 50, 0.09)',
    courtLine: 'rgba(18, 60, 42, 0.055)',
    outerFrameBorder: 'rgba(18, 60, 42, 0.18)',
    // Cabecera verde club profunda para contraste espectacular incluso en modo claro
    headerBgStops: ['#123c2a', '#1b573b', '#123c2a'],
    headerBorder: 'rgba(18, 60, 42, 0.25)',
    headerAccentStripe: '#c65d32',
    kickerPillBg: 'rgba(139, 203, 96, 0.2)',
    kickerPillBorder: 'rgba(139, 203, 96, 0.48)',
    kickerText: '#b5ee8c',
    titleText: '#ffffff',
    subtitleText: '#d7e8dc',
    categoryBadgeBg: 'rgba(198, 93, 50, 0.32)',
    categoryBadgeBorder: 'rgba(255, 178, 142, 0.6)',
    categoryBadgeText: '#ffd4be',
    champGrad: ['#fffbeb', '#fef3c7'],
    champBorder: '#d97706',
    champLabel: '#92400e',
    champName: '#123c2a',
    roundHeaderFill: '#164631',
    roundHeaderBorder: '#1f6a3d',
    roundHeaderText: '#ffffff',
    roundCountBg: 'rgba(139, 203, 96, 0.25)',
    roundCountText: '#d9f9c4',
    finalHeaderFill: '#78350f',
    finalHeaderBorder: '#d97706',
    finalHeaderText: '#fef3c7',
    connectorActive: '#1f6a3d',
    connectorGlow: 'rgba(31, 106, 61, 0.22)',
    connectorIdle: 'rgba(18, 60, 42, 0.22)',
    cardFill: '#ffffff',
    cardFillFinal: '#fffdf7',
    cardTopBarFill: '#f1f6ef',
    cardTopBarFinal: '#fef3c7',
    cardShadow: 'rgba(18, 60, 42, 0.11)',
    cardBorderIdle: 'rgba(18, 60, 42, 0.16)',
    cardBorderDone: 'rgba(31, 106, 61, 0.6)',
    cardBorderFinal: 'rgba(217, 119, 6, 0.65)',
    cardBorderLive: '#dc2626',
    cardDivider: 'rgba(18, 60, 42, 0.08)',
    tagPillBg: '#e1f0da',
    tagPillText: '#144929',
    tagPillFinalBg: '#fde68a',
    tagPillFinalText: '#92400e',
    cardMetaText: '#4d6154',
    statusLiveBg: '#fee2e2',
    statusLiveText: '#b91c1c',
    statusDoneBg: '#dcfce7',
    statusDoneText: '#15803d',
    statusIdleBg: '#e6ece4',
    statusIdleText: '#4d6154',
    winnerRowFill: '#e8f5e2',
    winnerRowBorder: 'rgba(31, 106, 61, 0.32)',
    winnerBar: '#1f6a3d',
    winnerNameText: '#0f3522',
    normalNameText: '#1b2c21',
    pendingNameText: '#6e7f74',
    setWonBoxBg: '#1f6a3d',
    setWonBoxText: '#ffffff',
    setLostBoxBg: '#f0f4ee',
    setLostBoxBorder: 'rgba(18, 60, 42, 0.14)',
    setLostBoxText: '#4d6154',
    footerBg: '#123c2a',
    footerBorder: 'rgba(139, 203, 96, 0.35)',
    footerPrimaryText: '#ffffff',
    footerBrandHighlight: '#a5e878',
    footerMutedText: '#c5d8cc',
  }
}

function drawCourtDecorations(ctx, width, height, headerHeight, footerHeight, palette) {
  ctx.save()
  ctx.strokeStyle = palette.courtLine
  ctx.lineWidth = 1.5

  // Líneas geométricas sutiles de cancha de tenis en el área del árbol
  const bodyTop = headerHeight + 16
  const bodyBottom = height - footerHeight - 16
  const bodyH = bodyBottom - bodyTop
  const bodyW = width - 80

  roundRect(ctx, 40, bodyTop, bodyW, bodyH, 20)
  ctx.stroke()

  // Línea central y cuadros de saque estilizados de fondo
  const midX = width / 2
  const midY = bodyTop + bodyH / 2
  ctx.beginPath()
  ctx.moveTo(midX, bodyTop + 20)
  ctx.lineTo(midX, bodyBottom - 20)
  ctx.moveTo(40 + bodyW * 0.22, bodyTop + 20)
  ctx.lineTo(40 + bodyW * 0.22, bodyBottom - 20)
  ctx.moveTo(40 + bodyW * 0.78, bodyTop + 20)
  ctx.lineTo(40 + bodyW * 0.78, bodyBottom - 20)
  ctx.moveTo(40 + bodyW * 0.22, midY)
  ctx.lineTo(40 + bodyW * 0.78, midY)
  ctx.stroke()

  // Círculos decorativos estilo estadio en las esquinas
  ctx.beginPath()
  ctx.arc(width - 60, bodyTop + 40, 140, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

export async function generateBracketPngBlob({
  tournamentName = 'Torneo Club Unión',
  categoryName = 'Categoría',
  rounds = [],
  thirdPlaceMatches = [],
  championName = null,
  theme = null,
}) {
  const activeRounds = (rounds || []).filter((r) => Array.isArray(r.matches) && r.matches.length > 0)
  if (activeRounds.length === 0) {
    throw new Error('No hay llaves configuradas en este cuadro para exportar.')
  }

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // ignore
    }
  }

  const [clubLogo, legalLogo] = await Promise.all([
    loadImageSafe('/branding/subcomite-tenis-club-union.png'),
    loadImageSafe('/branding/legal-branding.png'),
  ])

  const palette = resolveThemePalette(theme)

  const SHORT_PREFIX = {
    Dieciseisavos: '16F',
    'Octavos de final': '8F',
    'Cuartos de final': 'CF',
    Semifinales: 'SF',
    Final: 'FIN',
    'Tercer puesto': '3P',
  }

  const matchLookup = new Map()
  activeRounds.forEach((round) => {
    const prefix = SHORT_PREFIX[round.label] || (round.label || 'L').slice(0, 2).toUpperCase()
    round.matches.forEach((m, idx) => {
      matchLookup.set(Number(m.id), {
        ...m,
        bracketTag: round.label === 'Final' ? 'FINAL' : `${prefix}-${idx + 1}`,
      })
    })
  })

  const maxMatchesInCol = Math.max(...activeRounds.map((r) => r.matches.length), 1)
  const colCount = activeRounds.length
  const colWidth = 344
  const colGap = 76
  const cardHeight = 124
  const minVerticalGap = 30
  const paddingX = 64
  const headerHeight = 178
  const footerHeight = thirdPlaceMatches.length > 0 ? 226 : 96

  const treeBodyHeight = Math.max(
    maxMatchesInCol * cardHeight + Math.max(0, maxMatchesInCol - 1) * minVerticalGap + 64,
    360
  )

  const width = Math.max(
    paddingX * 2 + colCount * colWidth + Math.max(0, colCount - 1) * colGap,
    1140
  )
  const height = headerHeight + treeBodyHeight + footerHeight

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 1. FONDO DEL PÓSTER
  const bgGrad = ctx.createLinearGradient(0, 0, width, height)
  bgGrad.addColorStop(0, palette.bgStops[0])
  bgGrad.addColorStop(0.5, palette.bgStops[1])
  bgGrad.addColorStop(1, palette.bgStops[2])
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  const glow1 = ctx.createRadialGradient(
    width * 0.25,
    headerHeight + treeBodyHeight * 0.3,
    20,
    width * 0.25,
    headerHeight + treeBodyHeight * 0.3,
    width * 0.55
  )
  glow1.addColorStop(0, palette.courtGlow1)
  glow1.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow1
  ctx.fillRect(0, 0, width, height)

  const glow2 = ctx.createRadialGradient(
    width * 0.82,
    height * 0.75,
    20,
    width * 0.82,
    height * 0.75,
    width * 0.48
  )
  glow2.addColorStop(0, palette.courtGlow2)
  glow2.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, width, height)

  drawCourtDecorations(ctx, width, height, headerHeight, footerHeight, palette)

  // 2. CABECERA OFICIAL DEL TORNEO (HERO BANNER)
  const headerGrad = ctx.createLinearGradient(0, 0, width, headerHeight - 28)
  headerGrad.addColorStop(0, palette.headerBgStops[0])
  headerGrad.addColorStop(0.55, palette.headerBgStops[1])
  headerGrad.addColorStop(1, palette.headerBgStops[2])
  ctx.fillStyle = headerGrad
  ctx.fillRect(0, 0, width, headerHeight - 32)

  // Franja inferior terracota/dorada en el hero
  const stripeGrad = ctx.createLinearGradient(0, 0, width, 0)
  stripeGrad.addColorStop(0, '#8bcb60')
  stripeGrad.addColorStop(0.5, palette.headerAccentStripe)
  stripeGrad.addColorStop(1, '#f1c40f')
  ctx.fillStyle = stripeGrad
  ctx.fillRect(0, headerHeight - 35, width, 4)

  let textStartX = paddingX
  if (clubLogo) {
    const logoSize = 96
    const logoY = (headerHeight - 34 - logoSize) / 2
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 4
    ctx.drawImage(clubLogo, paddingX, logoY, logoSize, logoSize)
    ctx.restore()
    textStartX = paddingX + logoSize + 22
  }

  // Kicker pill
  const kickerLabel = 'SUBCOMITÉ DE TENIS CLUB UNIÓN · FASE ELIMINATORIA OFICIAL'
  ctx.font = '800 11px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  const kickerW = ctx.measureText(kickerLabel).width + 24
  roundRect(ctx, textStartX, 24, kickerW, 24, 12)
  ctx.fillStyle = palette.kickerPillBg
  ctx.fill()
  ctx.strokeStyle = palette.kickerPillBorder
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.fillStyle = palette.kickerText
  ctx.fillText(kickerLabel, textStartX + 12, 40)

  // Título del Torneo
  const rightReservedWidth = championName ? 330 : 230
  const maxTitleWidth = width - textStartX - paddingX - rightReservedWidth
  ctx.fillStyle = palette.titleText
  ctx.font = '900 30px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  ctx.fillText(truncateText(ctx, tournamentName, maxTitleWidth), textStartX, 82)

  // Píldora de Categoría + Subtítulo de ronda inicial
  const catBadgeText = `CATEGORÍA ${String(categoryName || '').toUpperCase()}`
  ctx.font = '800 12px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  const catBadgeW = ctx.measureText(catBadgeText).width + 24
  roundRect(ctx, textStartX, 96, catBadgeW, 26, 8)
  ctx.fillStyle = palette.categoryBadgeBg
  ctx.fill()
  ctx.strokeStyle = palette.categoryBadgeBorder
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = palette.categoryBadgeText
  ctx.fillText(catBadgeText, textStartX + 12, 113)

  const firstRoundName = activeRounds[0]?.label || 'Eliminatoria'
  const totalMatchesCount = activeRounds.reduce((acc, r) => acc + r.matches.length, 0)
  ctx.fillStyle = palette.subtitleText
  ctx.font = '600 13.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  ctx.fillText(
    `Camino a la Final desde ${firstRoundName} · ${totalMatchesCount} ${
      totalMatchesCount === 1 ? 'llave oficial' : 'llaves oficiales'
    }`,
    textStartX + catBadgeW + 14,
    114
  )

  // Tarjeta de Campeón o Sello Legal Branding en la esquina superior derecha
  if (championName) {
    const badgeW = 304
    const badgeH = 88
    const badgeX = width - paddingX - badgeW
    const badgeY = 28
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetY = 5
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16)
    const champGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH)
    champGrad.addColorStop(0, palette.champGrad[0])
    champGrad.addColorStop(1, palette.champGrad[1])
    ctx.fillStyle = champGrad
    ctx.fill()
    ctx.restore()

    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16)
    ctx.strokeStyle = palette.champBorder
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.fillStyle = palette.champLabel
    ctx.font = '800 11px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    ctx.fillText('🏆 CAMPEÓN DE LA CATEGORÍA', badgeX + 18, badgeY + 29)

    ctx.fillStyle = palette.champName
    ctx.font = '900 17px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    ctx.fillText(truncateText(ctx, championName, badgeW - 36), badgeX + 18, badgeY + 56)

    ctx.fillStyle = palette.champLabel
    ctx.font = '700 10px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    ctx.fillText('CUADRO OFICIAL FINALIZADO', badgeX + 18, badgeY + 74)
  } else if (legalLogo) {
    const boxW = 190
    const boxH = 74
    const boxX = width - paddingX - boxW
    const boxY = 35
    roundRect(ctx, boxX, boxY, boxW, boxH, 14)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(139, 203, 96, 0.45)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    const ratio = Math.min((boxW - 28) / legalLogo.naturalWidth, (boxH - 18) / legalLogo.naturalHeight)
    const lw = legalLogo.naturalWidth * ratio
    const lh = legalLogo.naturalHeight * ratio
    ctx.drawImage(legalLogo, boxX + (boxW - lw) / 2, boxY + (boxH - lh) / 2, lw, lh)
  }

  // 3. POSICIONAMIENTO DE COLUMNAS Y ENCABEZADOS DE RONDA
  const cardPositions = new Map()
  const colPositions = []
  const roundHeadersY = headerHeight - 16
  const roundStartY = headerHeight + 30
  const effectiveTreeHeight = treeBodyHeight - 44

  activeRounds.forEach((round, colIdx) => {
    const colX = paddingX + colIdx * (colWidth + colGap)
    const count = round.matches.length
    const slotHeight = effectiveTreeHeight / count
    const items = []

    const isFinal = round.label === 'Final'
    roundRect(ctx, colX, roundHeadersY, colWidth, 34, 10)
    ctx.fillStyle = isFinal ? palette.finalHeaderFill : palette.roundHeaderFill
    ctx.fill()
    ctx.strokeStyle = isFinal ? palette.finalHeaderBorder : palette.roundHeaderBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = isFinal ? palette.finalHeaderText : palette.roundHeaderText
    ctx.font = '800 12.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    const headerTitle = isFinal ? `🏆 ${round.label.toUpperCase()}` : round.label.toUpperCase()
    ctx.fillText(headerTitle, colX + 14, roundHeadersY + 21)

    // Contador de llaves a la derecha del encabezado de columna
    const countLabel = `${count} ${count === 1 ? 'LLAVE' : 'LLAVES'}`
    ctx.font = '800 10px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    const countW = ctx.measureText(countLabel).width + 16
    roundRect(ctx, colX + colWidth - countW - 10, roundHeadersY + 7, countW, 20, 6)
    ctx.fillStyle = isFinal ? 'rgba(241, 196, 15, 0.22)' : palette.roundCountBg
    ctx.fill()
    ctx.fillStyle = isFinal ? palette.finalHeaderText : palette.roundCountText
    ctx.fillText(countLabel, colX + colWidth - countW - 2, roundHeadersY + 20)

    round.matches.forEach((match, rowIdx) => {
      const centerY = roundStartY + slotHeight * (rowIdx + 0.5)
      const cardY = centerY - cardHeight / 2
      const pos = {
        x: colX,
        y: cardY,
        w: colWidth,
        h: cardHeight,
        centerY,
        colIdx,
        rowIdx,
        isFinal,
        match,
      }
      cardPositions.set(Number(match.id), pos)
      items.push(pos)
    })
    colPositions.push(items)
  })

  // 4. CONECTORES ORTOGONALES REDONDEADOS ENTRE RONDAS
  activeRounds.forEach((round, colIdx) => {
    if (colIdx === 0) return
    const prevCol = colPositions[colIdx - 1] || []
    round.matches.forEach((match, rowIdx) => {
      const targetPos = cardPositions.get(Number(match.id))
      if (!targetPos) return

      const sourcePositions = []
      const s1 = sourceId(match, 1)
      const s2 = sourceId(match, 2)
      if (s1 && cardPositions.has(s1)) sourcePositions.push(cardPositions.get(s1))
      if (s2 && cardPositions.has(s2)) sourcePositions.push(cardPositions.get(s2))
      if (sourcePositions.length === 0 && prevCol.length >= (rowIdx + 1) * 2) {
        sourcePositions.push(prevCol[rowIdx * 2], prevCol[rowIdx * 2 + 1])
      }

      sourcePositions.filter(Boolean).forEach((src) => {
        const startX = src.x + src.w
        const startY = src.centerY
        const endX = targetPos.x
        const endY = targetPos.centerY

        const hasWinner =
          src.match?.estado === 'finalizado' &&
          (isSideWinner(src.match, 1) || isSideWinner(src.match, 2))

        if (hasWinner) {
          ctx.save()
          ctx.strokeStyle = palette.connectorGlow
          ctx.lineWidth = 6
          drawRoundedConnector(ctx, startX, startY, endX, endY, 12)
          ctx.restore()
        }

        ctx.save()
        ctx.strokeStyle = hasWinner ? palette.connectorActive : palette.connectorIdle
        ctx.lineWidth = hasWinner ? 2.5 : 1.8
        if (!hasWinner) ctx.setLineDash([5, 5])
        drawRoundedConnector(ctx, startX, startY, endX, endY, 12)
        ctx.restore()

        // Nodos circulares en los puntos de anclaje
        ctx.fillStyle = hasWinner ? palette.connectorActive : palette.connectorIdle
        ctx.beginPath()
        ctx.arc(startX, startY, 3.5, 0, Math.PI * 2)
        ctx.arc(endX, endY, 3.5, 0, Math.PI * 2)
        ctx.fill()
      })
    })
  })

  // 5. TARJETAS DE PARTIDO CON PROFUNDIDAD Y CAJAS DE SETS ESTILO BROADCAST
  const drawMatchCard = (pos, customLabel = null) => {
    const { x, y, w, h, match, isFinal } = pos
    const isLive = match.estado === 'en_vivo'
    const isDone = match.estado === 'finalizado'
    const isWalkover = isDone && match.motivo_finalizacion === 'walkover'

    // Sombra de elevación de la tarjeta
    ctx.save()
    ctx.shadowColor = palette.cardShadow
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    roundRect(ctx, x, y, w, h, 14)
    ctx.fillStyle = isFinal ? palette.cardFillFinal : palette.cardFill
    ctx.fill()
    ctx.restore()

    // Barra superior de la tarjeta
    roundRectTop(ctx, x, y, w, 31, 14)
    ctx.fillStyle = isFinal ? palette.cardTopBarFinal : palette.cardTopBarFill
    ctx.fill()

    // Borde exterior de la tarjeta
    roundRect(ctx, x, y, w, h, 14)
    ctx.lineWidth = isLive || isFinal ? 2 : 1.4
    ctx.strokeStyle = isLive
      ? palette.cardBorderLive
      : isFinal
        ? palette.cardBorderFinal
        : isDone
          ? palette.cardBorderDone
          : palette.cardBorderIdle
    ctx.stroke()

    const tagInfo = matchLookup.get(Number(match.id))
    const tagLabel = customLabel || tagInfo?.bracketTag || `LLAVE #${match.id}`
    const scheduleStr = formatScheduleLabel(match)

    // Píldora del código de llave (ej. CF-1, SF-1, FINAL)
    ctx.font = '800 10px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    const tagW = ctx.measureText(tagLabel).width + 14
    roundRect(ctx, x + 10, y + 6, tagW, 19, 6)
    ctx.fillStyle = isFinal ? palette.tagPillFinalBg : palette.tagPillBg
    ctx.fill()
    ctx.fillStyle = isFinal ? palette.tagPillFinalText : palette.tagPillText
    ctx.fillText(tagLabel, x + 17, y + 19)

    // Horario / Cancha
    if (scheduleStr) {
      ctx.fillStyle = palette.cardMetaText
      ctx.font = '600 10.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
      ctx.fillText(
        truncateText(ctx, scheduleStr, w - tagW - 86),
        x + 16 + tagW,
        y + 19
      )
    }

    // Píldora de estado (FINAL, EN VIVO, PROG.)
    const statusText = isLive ? '● EN VIVO' : isWalkover ? 'W.O.' : isDone ? 'FINALIZADO' : 'PROG.'
    ctx.font = '800 9.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    const statusW = ctx.measureText(statusText).width + 14
    roundRect(ctx, x + w - statusW - 10, y + 6, statusW, 19, 6)
    ctx.fillStyle = isLive
      ? palette.statusLiveBg
      : isDone
        ? palette.statusDoneBg
        : palette.statusIdleBg
    ctx.fill()
    ctx.fillStyle = isLive
      ? palette.statusLiveText
      : isDone
        ? palette.statusDoneText
        : palette.statusIdleText
    ctx.fillText(statusText, x + w - statusW - 3, y + 19)

    // Línea divisoria debajo de la barra superior
    ctx.strokeStyle = palette.cardDivider
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y + 31)
    ctx.lineTo(x + w, y + 31)
    ctx.stroke()

    const sets = Array.isArray(match.sets) ? match.sets : []
    const drawSideRow = (side, rowTopY) => {
      const rowH = 41
      const isWinner = isSideWinner(match, side)
      const pInfo = getParticipantDisplay(match, side, matchLookup)

      if (isWinner) {
        roundRect(ctx, x + 6, rowTopY + 2, w - 12, rowH - 4, 9)
        ctx.fillStyle = palette.winnerRowFill
        ctx.fill()
        ctx.strokeStyle = palette.winnerRowBorder
        ctx.lineWidth = 1
        ctx.stroke()

        // Barra vertical indicadora de ganador
        roundRect(ctx, x + 6, rowTopY + 6, 4, rowH - 12, 2)
        ctx.fillStyle = palette.winnerBar
        ctx.fill()
      }

      // Nombre de la pareja / jugador
      ctx.fillStyle = isWinner
        ? palette.winnerNameText
        : pInfo.isPending
          ? palette.pendingNameText
          : palette.normalNameText
      ctx.font = `${isWinner ? '800' : pInfo.isPending ? '500 italic' : '700'} 13px "Plus Jakarta Sans", "Segoe UI", sans-serif`

      const setBoxSize = 24
      const setBoxGap = 5
      const scoreAreaWidth = sets.length > 0 ? sets.length * (setBoxSize + setBoxGap) + 14 : 18
      const textX = isWinner ? x + 18 : x + 14
      const displayName = `${isWinner ? '✓ ' : ''}${pInfo.name}`
      ctx.fillText(
        truncateText(ctx, displayName, w - scoreAreaWidth - (textX - x) - 8),
        textX,
        rowTopY + 25
      )

      // Cajas de Sets estilo marcador de TV
      sets.forEach((s, idx) => {
        const val = side === 1 ? (s.games_j1 ?? s.p1) : (s.games_j2 ?? s.p2)
        const other = side === 1 ? (s.games_j2 ?? s.p2) : (s.games_j1 ?? s.p1)
        const tb = side === 1 ? s.tiebreak_j1 : s.tiebreak_j2
        const wonSet = Number(val) > Number(other)
        const boxX = x + w - 12 - (sets.length - idx) * (setBoxSize + setBoxGap) + setBoxGap
        const boxY = rowTopY + (rowH - setBoxSize) / 2

        roundRect(ctx, boxX, boxY, setBoxSize, setBoxSize, 6)
        ctx.fillStyle = wonSet ? palette.setWonBoxBg : palette.setLostBoxBg
        ctx.fill()
        if (!wonSet) {
          ctx.strokeStyle = palette.setLostBoxBorder
          ctx.lineWidth = 1
          ctx.stroke()
        }

        const valStr = String(val ?? '-')
        ctx.fillStyle = wonSet ? palette.setWonBoxText : palette.setLostBoxText
        ctx.font = `${wonSet ? '800' : '700'} 12px "JetBrains Mono", "Segoe UI", monospace`
        const valW = ctx.measureText(valStr).width
        ctx.fillText(valStr, boxX + (setBoxSize - valW) / 2, boxY + 16.5)

        if (tb != null && tb !== '') {
          ctx.font = '700 7.5px "JetBrains Mono", "Segoe UI", sans-serif'
          ctx.fillText(String(tb), boxX + setBoxSize - 6.5, boxY + 8.5)
        }
      })
    }

    drawSideRow(1, y + 33)

    // Divisor sutil entre lado 1 y lado 2
    ctx.strokeStyle = palette.cardDivider
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x + 12, y + 76)
    ctx.lineTo(x + w - 12, y + 76)
    ctx.stroke()

    drawSideRow(2, y + 78)
  }

  colPositions.forEach((items) => {
    items.forEach((pos) => drawMatchCard(pos))
  })

  // Tarjeta de Tercer Puesto si aplica
  if (thirdPlaceMatches.length > 0) {
    const m3 = thirdPlaceMatches[0]
    const pos3 = {
      x: width - paddingX - colWidth,
      y: height - footerHeight + 12,
      w: colWidth,
      h: cardHeight,
      isFinal: false,
      match: m3,
    }
    drawMatchCard(pos3, '🥉 TERCER PUESTO')
  }

  // 6. PIE DE PÁGINA OFICIAL CON FIRMA LEGAL-BRANDING.COM
  const footerBarH = 68
  const footerBarY = height - footerBarH
  ctx.fillStyle = palette.footerBg
  ctx.fillRect(0, footerBarY, width, footerBarH)

  ctx.strokeStyle = palette.footerBorder
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, footerBarY)
  ctx.lineTo(width, footerBarY)
  ctx.stroke()

  const formattedDate = new Date().toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  // Izquierda del footer: Sello Club Unión + Fecha
  let footerLeftX = paddingX
  if (clubLogo) {
    ctx.drawImage(clubLogo, footerLeftX, footerBarY + 13, 42, 42)
    footerLeftX += 54
  }

  ctx.fillStyle = palette.footerPrimaryText
  ctx.font = '800 13.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  ctx.fillText(
    `Generado desde LEGAL-BRANDING.com · ${formattedDate}`,
    footerLeftX,
    footerBarY + 31
  )

  ctx.fillStyle = palette.footerMutedText
  ctx.font = '600 11.5px "Plus Jakarta Sans", "Segoe UI", sans-serif'
  ctx.fillText(
    `Subcomité de Tenis · Club Unión S.A. Bucaramanga · Cuadro Oficial ${categoryName}`,
    footerLeftX,
    footerBarY + 50
  )

  // Derecha del footer: Píldora oficial de LEGAL-BRANDING.com con su logo
  if (legalLogo) {
    const pillW = 164
    const pillH = 44
    const pillX = width - paddingX - pillW
    const pillY = footerBarY + (footerBarH - pillH) / 2
    roundRect(ctx, pillX, pillY, pillW, pillH, 10)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = 'rgba(139, 203, 96, 0.5)'
    ctx.lineWidth = 1
    ctx.stroke()

    const ratio = Math.min((pillW - 22) / legalLogo.naturalWidth, (pillH - 10) / legalLogo.naturalHeight)
    const lw = legalLogo.naturalWidth * ratio
    const lh = legalLogo.naturalHeight * ratio
    ctx.drawImage(legalLogo, pillX + (pillW - lw) / 2, pillY + (pillH - lh) / 2, lw, lh)
  } else {
    const rightBrand = 'LEGAL-BRANDING.COM'
    ctx.font = '900 13px "Plus Jakarta Sans", "Segoe UI", sans-serif'
    ctx.fillStyle = palette.footerBrandHighlight
    const rw = ctx.measureText(rightBrand).width
    ctx.fillText(rightBrand, width - paddingX - rw, footerBarY + 39)
  }

  // Marco perimetral sutil del póster
  ctx.strokeStyle = palette.outerFrameBorder
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('No se pudo generar la imagen PNG del cuadro.'))
      else resolve(blob)
    }, 'image/png')
  })
}

export async function downloadBracketPng(options) {
  const blob = await generateBracketPngBlob(options)
  const safeCat = String(options.categoryName || 'categoria')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const fileName = `cuadro-eliminatorio-${safeCat || 'torneo'}.png`

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return { fileName, shared: false }
}


export async function shareOrDownloadBracketPng(options) {
  const blob = await generateBracketPngBlob(options)
  const safeCat = String(options.categoryName || 'categoria')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const fileName = `cuadro-eliminatorio-${safeCat || 'torneo'}.png`
  const file = new File([blob], fileName, { type: 'image/png' })

  if (
    typeof navigator !== 'undefined' &&
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Cuadro Eliminatorio · ${options.categoryName || ''}`,
        text: `${options.tournamentName || 'Torneo Club Unión'} — Cuadro de Fase Eliminatoria (${options.categoryName || ''}) · Generado desde LEGAL-BRANDING.com`,
        files: [file],
      })

      return { fileName, shared: true }
    } catch (err) {
      if (err?.name === 'AbortError') return { fileName, shared: false, cancelled: true }
    }
  }


  return downloadBracketPng(options)

}
